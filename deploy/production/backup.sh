#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_PATH=$(readlink -f -- "${BASH_SOURCE[0]}")
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd -P)
active_runtime=/opt/iuin/deploy/current
if [[ ! -s "$SCRIPT_DIR/deployment.manifest" \
    && ( -e "$active_runtime" || -L "$active_runtime" ) ]]; then
    (( EUID == 0 )) || { echo "must run as root" >&2; exit 1; }
    launcher=/usr/local/sbin/iuin-backup-launcher
    bootstrap_env=${ENV_FILE:-$SCRIPT_DIR/.env}
    [[ -x "$launcher" && ! -L "$launcher" \
        && $(stat --format '%u:%g:%a:%h' "$launcher") == 0:0:755:1 ]] \
        || { echo "installed immutable backup launcher is missing or invalid" >&2; exit 1; }
    [[ -f "$bootstrap_env" && ! -L "$bootstrap_env" \
        && $(stat --format '%u:%g:%a:%h' "$bootstrap_env") == 0:0:600:1 ]] \
        || { echo "deployment environment is missing or invalid" >&2; exit 1; }
    launcher_data_root=$(awk -F= '$1 == "DATA_ROOT" { sub(/^[^=]*=/, ""); print; exit }' "$bootstrap_env")
    : "${launcher_data_root:=/srv/iuin}"
    [[ "$launcher_data_root" == /* ]] \
        || { echo "deployment DATA_ROOT is invalid" >&2; exit 1; }
    exec /usr/bin/env "DATA_ROOT=$launcher_data_root" "$launcher" "$@"
fi
if [[ "$SCRIPT_DIR" == /opt/iuin/deploy/releases/* ]]; then
    export ENV_FILE="$SCRIPT_DIR/production.env"
    export IUIN_DEPLOYMENT_MANIFEST="$SCRIPT_DIR/deployment.manifest"
elif [[ -z "${ENV_FILE+x}" && -s "$SCRIPT_DIR/production.env" ]]; then
    export ENV_FILE="$SCRIPT_DIR/production.env"
fi
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
require_root
load_env
require_docker

[[ -d "$DATA_ROOT/backups" ]] || die "missing backup directory: $DATA_ROOT/backups"
deployment_manifest=${IUIN_DEPLOYMENT_MANIFEST:-$SCRIPT_DIR/deployment.manifest}
[[ -s "$deployment_manifest" ]] || die "missing active deployment manifest: $deployment_manifest"
[[ $(stat --format '%u' "$deployment_manifest") == 0 ]] || die "deployment manifest must be owned by root"

deployment_value() {
    local key=$1
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$deployment_manifest"
}

deployment_container_field() {
    local service=$1 key=$2
    awk -v service="$service" -v key="$key" '
        $1 == "container=" service {
            for (i = 2; i <= NF; i++) {
                split($i, pair, "=")
                if (pair[1] == key) { print pair[2]; exit }
            }
        }
    ' "$deployment_manifest"
}

marker="$DATA_ROOT/backups/.backup-in-progress"
deploy_marker="$DATA_ROOT/backups/.deploy-in-progress"
restore_marker="$DATA_ROOT/backups/.restore-in-progress"
if [[ "${IUIN_HELD_MAINTENANCE_LOCK:-0}" == 1 ]]; then
    [[ -e /proc/$$/fd/9 ]] || die "maintenance lock descriptor was not inherited"
    flock -n 9 || die "inherited maintenance lock is invalid"
else
    exec 9>"$DATA_ROOT/backups/.backup.lock"
    flock -n 9 || die "another backup, restore, or deployment is running"
fi
if [[ "$SCRIPT_DIR" == /opt/iuin/deploy/releases/* ]]; then
    current_release=$(readlink -f -- "$active_runtime")
    if [[ "$current_release" != "$SCRIPT_DIR" ]]; then
        log "active deployment changed while this backup was waiting; restarting from the new immutable release"
        flock -u 9
        exec /usr/bin/env "DATA_ROOT=$DATA_ROOT" /usr/local/sbin/iuin-backup-launcher "$@"
    fi
fi

marker_value() {
    local key=$1
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$marker"
}

validate_container_id() {
    local id=$1 label=$2
    [[ "$id" =~ ^[a-f0-9]{64}$ ]] || die "invalid or missing $label container ID in $marker"
}

marker_exists() {
    [[ -e "$1" || -L "$1" ]]
}

validate_backup_marker_exclusivity() {
    local candidate marker_count=0
    for candidate in "$marker" "$deploy_marker" "$restore_marker"; do
        if marker_exists "$candidate"; then
            (( marker_count += 1 ))
        fi
    done
    if (( marker_count > 1 )); then
        log "multiple maintenance markers are present; refusing local backup recovery"
        return 1
    fi
    if marker_exists "$deploy_marker"; then
        log "an interrupted deployment marker must be recovered before backup"
        return 1
    fi
    if marker_exists "$restore_marker"; then
        log "an interrupted restore is fail-closed; refusing local backup recovery"
        return 1
    fi
}

remove_backup_fence() {
    local base chain base_and_chain
    for base_and_chain in "DOCKER-USER:IUIN-RESTORE" "OUTPUT:IUIN-RESTORE-OUT"; do
        base=${base_and_chain%%:*}
        chain=${base_and_chain#*:}
        while iptables -w -C "$base" -j "$chain" >/dev/null 2>&1; do
            iptables -w -D "$base" -j "$chain" || return 1
        done
        if iptables -w -n -L "$chain" >/dev/null 2>&1; then
            iptables -w -F "$chain" || return 1
            iptables -w -X "$chain" || return 1
        fi
    done
}

restart_container() {
    local id=$1 timeout=$2 service=$3 ids count project_label service_label
    local expected_id expected_image expected_config live_image live_config
    [[ -n "$id" ]] || return 0
    if ! docker inspect "$id" >/dev/null 2>&1; then
        log "cannot recover $service: container $id no longer exists"
        return 1
    fi
    ids=$(docker ps --all --no-trunc --quiet \
        --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
        --filter "label=com.docker.compose.service=$service") || return 1
    count=$(wc -w <<< "$ids")
    [[ "$count" -eq 1 && "$ids" == "$id" ]] \
        || { log "$service is not the unique container recorded by the backup marker"; return 1; }
    project_label=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$id")
    service_label=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$id")
    expected_id=$(deployment_container_field "$service" id)
    expected_image=$(deployment_container_field "$service" image_id)
    expected_config=$(deployment_container_field "$service" config_hash)
    live_image=$(docker inspect --format '{{.Image}}' "$id")
    live_config=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$id")
    [[ "$project_label" == "$COMPOSE_PROJECT_NAME" && "$service_label" == "$service" ]] \
        || { log "container identity does not match $COMPOSE_PROJECT_NAME/$service"; return 1; }
    [[ "$id" == "$expected_id" && "$expected_id" =~ ^[a-f0-9]{64}$ \
        && "$expected_image" =~ ^sha256:[a-f0-9]{64}$ && "$live_image" == "$expected_image" \
        && "$expected_config" =~ ^[a-f0-9]{64}$ && "$live_config" == "$expected_config" ]] \
        || { log "$service does not match the active immutable deployment receipt"; return 1; }
    docker update --restart=no "$id" >/dev/null || return 1
    docker start "$id" >/dev/null || return 1
    (wait_for_container_health "$id" "$timeout") || return 1
}

recover_interrupted_backup() {
    marker_exists "$marker" || return 0
    validate_backup_marker_exclusivity || return 1
    [[ -f "$marker" && ! -L "$marker" ]] || die "invalid backup recovery marker: $marker"
    [[ $(stat --format '%u' "$marker") == 0 ]] || die "backup recovery marker must be owned by root"

    local format postgres_id minio_id mailpit_id server_id recovery_failed=false
    format=$(marker_value format)
    [[ "$format" == 1 ]] || die "unsupported backup recovery marker format"
    postgres_id=$(marker_value postgres_id)
    minio_id=$(marker_value minio_id)
    mailpit_id=$(marker_value mailpit_id)
    server_id=$(marker_value server_id)
    validate_container_id "$postgres_id" postgres
    validate_container_id "$minio_id" minio
    validate_container_id "$mailpit_id" mailpit
    validate_container_id "$server_id" server

    log "recovering containers recorded by interrupted backup marker"
    restart_container "$postgres_id" 300 postgres || recovery_failed=true
    restart_container "$minio_id" 300 minio || recovery_failed=true
    restart_container "$mailpit_id" 300 mailpit || recovery_failed=true
    if [[ "$recovery_failed" == false ]]; then
        restart_container "$server_id" 600 iuin-server || recovery_failed=true
    fi
    if [[ "$recovery_failed" == true ]]; then
        log "automatic backup recovery failed; marker retained at $marker"
        return 1
    fi
    systemctl restart iuin-docker-firewall.service || return 1
    "$SCRIPT_DIR/health.sh" --internal || return 1
    for id in "$postgres_id" "$minio_id" "$mailpit_id" "$server_id"; do
        docker update --restart=unless-stopped "$id" >/dev/null || return 1
    done
    remove_backup_fence || return 1
    if ! "$SCRIPT_DIR/health.sh"; then
        if ! systemctl restart iuin-docker-firewall.service; then
            for id in "$server_id" "$minio_id" "$mailpit_id"; do
                docker update --restart=no "$id" >/dev/null 2>&1 || true
                docker stop --time 120 "$id" >/dev/null 2>&1 || true
            done
            log "CRITICAL: full health failed, the fence could not be restored, and application services were stopped"
        fi
        log "interrupted backup recovery failed full health; marker retained"
        return 1
    fi
    rm -f -- "$marker" || return 1
    sync -f "$DATA_ROOT/backups" || return 1
    log "interrupted backup containers recovered"
}

validate_backup_marker_exclusivity \
    || die "maintenance marker state is not safe for backup"
case "${1:-}" in
    '') ;;
    --recover)
        [[ $# == 1 ]] || die "usage: $0 [--recover]"
        if marker_exists "$marker"; then
            recover_interrupted_backup
        else
            log "no interrupted backup marker is present"
        fi
        exit 0
        ;;
    *) die "usage: $0 [--recover]" ;;
esac

recover_interrupted_backup
! marker_exists "$deploy_marker" \
    || die "an interrupted deployment marker must be recovered before backup"
! marker_exists "$restore_marker" \
    || die "an interrupted restore is fail-closed; refusing to start backup"

running_service_id() {
    local service=$1 ids count
    ids=$(docker ps --all --no-trunc --quiet \
        --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
        --filter "label=com.docker.compose.service=$service")
    count=$(wc -w <<< "$ids")
    [[ "$count" -eq 1 ]] || die "expected exactly one $service container, found $count"
    [[ $(docker inspect --format '{{.State.Running}}' "$ids") == true ]] \
        || die "$service container must be running before backup"
    printf '%s\n' "$ids"
}

postgres_id=$(running_service_id postgres)
server_id=$(running_service_id iuin-server)
minio_id=$(running_service_id minio)
mailpit_id=$(running_service_id mailpit)
for service_and_id in "postgres:$postgres_id" "iuin-server:$server_id" "minio:$minio_id" "mailpit:$mailpit_id"; do
    [[ -n "${service_and_id#*:}" ]] || die "${service_and_id%%:*} must be running before backup"
done
wait_for_container_health "$postgres_id" 300
wait_for_container_health "$minio_id" 300
wait_for_container_health "$mailpit_id" 300
wait_for_container_health "$server_id" 600

git_commit=$(deployment_value git_commit)
[[ "$git_commit" =~ ^[a-f0-9]{40,64}$ ]] || die "active deployment manifest has an invalid git_commit"
[[ $(deployment_value format) == 1 && $(deployment_value activation_id) =~ ^[a-f0-9]{32}$ ]] \
    || die "active deployment manifest has invalid format or activation ID"
for file_and_key in \
    "backup.sh:backup_sha256" "restore.sh:restore_sha256" "lib.sh:lib_sha256" \
    "compose.yaml:compose_sha256" "production.env:environment_sha256" \
    "health.sh:health_sha256" "minio-ops.sh:minio_ops_sha256" \
    "create-admin.sh:create_admin_sha256" \
    "recover-containers.sh:recovery_sha256" "docker-firewall.sh:firewall_sha256" \
    "iuin-backup-recover.service:recovery_unit_sha256" \
    "iuin-docker-firewall-pre.service:firewall_pre_unit_sha256" \
    "iuin-docker-firewall.service:firewall_post_unit_sha256"; do
    runtime_file=${file_and_key%%:*}
    hash_key=${file_and_key#*:}
    [[ -f "$SCRIPT_DIR/$runtime_file" && ! -L "$SCRIPT_DIR/$runtime_file" \
        && $(stat --format '%u' "$SCRIPT_DIR/$runtime_file") == 0 ]] \
        || die "active runtime file is missing or not root-owned: $runtime_file"
    expected_hash=$(deployment_value "$hash_key")
    [[ "$expected_hash" =~ ^[a-f0-9]{64}$ \
        && $(sha256sum "$SCRIPT_DIR/$runtime_file" | awk '{print $1}') == "$expected_hash" ]] \
        || die "active runtime file hash differs from deployment manifest: $runtime_file"
done
expected_seed_hash=$(deployment_value seed_sha256)
[[ "${IUIN_SEED_ROOT:-}" == "$SCRIPT_DIR/seed" \
    && "$expected_seed_hash" =~ ^[a-f0-9]{64}$ \
    && -s "$IUIN_SEED_ROOT/profile/honors/achievements/achv_profile_anchor/icon.png" \
    && $(immutable_seed_hash "$IUIN_SEED_ROOT") == "$expected_seed_hash" ]] \
    || die "active immutable runtime seed differs from deployment manifest"
for service_and_id in "postgres:$postgres_id" "iuin-server:$server_id" "minio:$minio_id" "mailpit:$mailpit_id"; do
    service=${service_and_id%%:*}
    id=${service_and_id#*:}
    expected_id=$(deployment_container_field "$service" id)
    expected_image=$(deployment_container_field "$service" image_id)
    expected_config=$(deployment_container_field "$service" config_hash)
    project_label=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$id")
    service_label=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$id")
    live_image=$(docker inspect --format '{{.Image}}' "$id")
    live_config=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$id")
    [[ "$project_label" == "$COMPOSE_PROJECT_NAME" && "$service_label" == "$service" \
        && "$expected_id" =~ ^[a-f0-9]{64}$ && "$id" == "$expected_id" \
        && "$expected_image" =~ ^sha256:[a-f0-9]{64}$ && "$live_image" == "$expected_image" \
        && "$expected_config" =~ ^[a-f0-9]{64}$ && "$live_config" == "$expected_config" ]] \
        || die "live $service container does not match the immutable deployment manifest"
done
runtime_build_hash=$(docker exec "$server_id" /mattermost/bin/mattermost version 2>/dev/null \
    | awk -F': ' '$1 == "Build Hash" { print $2; exit }')
[[ "$runtime_build_hash" == "$git_commit" ]] \
    || die "running Mattermost build hash differs from the immutable deployment manifest"

timestamp=$(date -u +'%Y%m%dT%H%M%SZ')
staging="$DATA_ROOT/backups/.partial-$timestamp"
destination="$DATA_ROOT/backups/$timestamp"
[[ ! -e "$staging" && ! -e "$destination" ]] \
    || die "backup path collision for timestamp $timestamp"
mkdir -m 0700 "$staging"
destination_created=false

cleanup() {
    rc=$?
    trap - EXIT INT TERM
    set +e
    [[ -z "${marker_tmp:-}" ]] || rm -f -- "$marker_tmp"
    if marker_exists "$marker" && ! recover_interrupted_backup; then
        rc=1
    fi
    if (( rc != 0 )); then
        if [[ "$destination_created" == true ]]; then
            log "backup payload is complete at $destination, but recovery or finalization failed"
        elif [[ -d "$staging" ]]; then
            log "backup failed; partial data remains at $staging"
        else
            log "backup failed before a payload directory was created"
        fi
    fi
    exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

marker_tmp="$marker.tmp.$$"
{
    printf 'format=1\n'
    printf 'created_utc=%s\n' "$timestamp"
    printf 'postgres_id=%s\n' "$postgres_id"
    printf 'server_id=%s\n' "$server_id"
    printf 'minio_id=%s\n' "$minio_id"
    printf 'mailpit_id=%s\n' "$mailpit_id"
} > "$marker_tmp"
chmod 0600 "$marker_tmp"
sync -f "$marker_tmp"
mv -f -- "$marker_tmp" "$marker"
sync -f "$DATA_ROOT/backups"

log "stopping IUIN server to quiesce writes"
docker stop --time 120 "$server_id" >/dev/null

log "stopping Mailpit to checkpoint its SQLite/WAL data"
docker stop --time 30 "$mailpit_id" >/dev/null

log "dumping PostgreSQL"
docker exec --interactive "$postgres_id" pg_dump \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --format=custom \
    --no-owner \
    --no-privileges > "$staging/postgres.dump"
[[ -s "$staging/postgres.dump" ]] || die "PostgreSQL dump is empty"

log "stopping MinIO before archiving its data and metadata"
docker stop --time 120 "$minio_id" >/dev/null

tar --create --gzip --numeric-owner --file "$staging/minio.tar.gz" --directory "$DATA_ROOT" minio
tar --create --gzip --numeric-owner --file "$staging/mailpit.tar.gz" --directory "$DATA_ROOT" mailpit
tar --create --gzip --numeric-owner --file "$staging/mattermost-runtime.tar.gz" \
    --directory "$DATA_ROOT" mattermost/config mattermost/plugins mattermost/client-plugins mattermost/data

{
    printf 'backup_format=2\n'
    printf 'created_utc=%s\n' "$timestamp"
    printf 'git_commit=%s\n' "$git_commit"
    printf 'site_url=%s\n' "$SITE_URL"
    printf 'quiesced=true\n'
    printf 'deployment_manifest_sha256=%s\n' "$(sha256sum "$deployment_manifest" | awk '{print $1}')"
    sed 's/^/deployment_/' "$deployment_manifest"
    for service_and_id in \
        "postgres:$postgres_id" "iuin-server:$server_id" "minio:$minio_id" "mailpit:$mailpit_id"; do
        service=${service_and_id%%:*}
        id=${service_and_id#*:}
        image_ref=$(docker inspect --format '{{.Config.Image}}' "$id")
        image_id=$(docker inspect --format '{{.Image}}' "$id")
        config_hash=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$id")
        printf 'live_container=%s id=%s image_ref=%s image_id=%s config_hash=%s\n' \
            "$service" "$id" "$image_ref" "$image_id" "$config_hash"
    done
} > "$staging/manifest.txt"

(cd "$staging" && sha256sum postgres.dump minio.tar.gz mailpit.tar.gz mattermost-runtime.tar.gz manifest.txt > SHA256SUMS)
sync -f "$staging"
recover_interrupted_backup

log "strictly validating the complete backup before publication"
IUIN_HELD_MAINTENANCE_LOCK=1 ENV_FILE="$ENV_FILE" \
    "$SCRIPT_DIR/restore.sh" "$staging" --verify-only

mv -T -- "$staging" "$destination"
sync -f "$DATA_ROOT/backups"
destination_created=true
chmod -R go-rwx "$destination"

find "$DATA_ROOT/backups" -mindepth 1 -maxdepth 1 -type d \
    -name '20??????T??????Z' -mtime "+$BACKUP_RETENTION_DAYS" -print -exec rm -rf -- {} +
find "$DATA_ROOT/backups" -mindepth 1 -maxdepth 1 -type d \
    -name '.partial-*' -mtime +7 -print -exec rm -rf -- {} +
sync -f "$DATA_ROOT/backups"

trap - EXIT INT TERM
log "backup complete: $destination"
log "this local backup is not disaster recovery; copy it to another machine or object store"
