#!/usr/bin/env bash
set -Eeuo pipefail

: "${COMPOSE_PROJECT_NAME:=iuin}"
early_fail_close_handled=false
legacy_commit=1101c2a4a3470c5155c2e149c5267ceac573a6f2
legacy_activation=6a7a6e1244ab44a17e06adcfc127ccec
legacy_health_sha=42f0a86ddc45a22737ca1b6813cdda52ab460e068a2dc02e73454b5b897e5011
legacy_environment_sha=7aa4cf6e52168c132cecd4ddf6c3a6000088f887450efc2edb01654cd1b7b0bb
legacy_lib_sha=2f2b984743e2aaea550196d3e7c39a4a3dcdd0c302c9c78b9f98ca9c27b493f6
legacy_compose_sha=7bd149c5220be8405e39ba9fa295a2d352bf6468e38d136cae85e1f9dd0caafd
legacy_minio_ops_sha=93c9b04d64d3f2547692333c8f9f2091ed15cb542bdc1486fadcd5686d31f057
legacy_runtime_recovery_sha=a0aed92257a153c4771ae5d7534f35453551d544c259690a397d30d98a08cb3f
legacy_compat_health_sha=98348a4a708752fe95c58d545bdd845ced9253b23399d7a6c0344cfb6ed0ba8d
legacy_compat_root=/opt/iuin/deploy/compat
legacy_compat_dir="$legacy_compat_root/$legacy_commit-$legacy_activation"

early_marker_present() {
    local root=${DATA_ROOT:-/srv/iuin} early_marker
    for early_marker in \
        "$root/backups/.restore-in-progress" \
        "$root/backups/.backup-in-progress" \
        "$root/backups/.deploy-in-progress"; do
        [[ ! -e "$early_marker" && ! -L "$early_marker" ]] || return 0
    done
    return 1
}

early_prove_fail_closed() {
    local docker_config_safe=false
    if systemctl restart iuin-docker-firewall-pre.service >/dev/null 2>&1; then
        printf '[iuin-recovery] durable maintenance marker is fenced by the pre-Docker policy\n' >&2
        return 0
    fi
    if command -v jq >/dev/null 2>&1 \
        && [[ -f /etc/docker/daemon.json && ! -L /etc/docker/daemon.json ]] \
        && jq -e '.["live-restore"] == false' /etc/docker/daemon.json >/dev/null 2>&1; then
        docker_config_safe=true
    fi
    if [[ "$docker_config_safe" == true ]] \
        && systemctl stop docker.service docker.socket >/dev/null 2>&1 \
        && ! systemctl is-active --quiet docker.service \
        && ! systemctl is-active --quiet docker.socket; then
        printf '[iuin-recovery] maintenance fence could not be established; Docker was stopped with live-restore disabled\n' >&2
        return 0
    fi
    printf '[iuin-recovery] CRITICAL: could not prove the marker fenced or Docker safely inactive\n' >&2
    return 1
}

# Install a minimal guard before Docker/API and lock preflights. The dedicated
# pre-Docker unit can establish the maintenance fence without a working Docker
# daemon. If that also fails, stopping Docker is only considered a proven
# fallback when the persisted daemon configuration disables live-restore.
early_recovery_exit_guard() {
    local rc=$?
    trap - EXIT INT TERM
    set +e
    if (( rc != 0 )) && [[ "$early_fail_close_handled" != true ]] \
        && early_marker_present; then
        early_prove_fail_closed || true
    fi
    exit "$rc"
}
trap early_recovery_exit_guard EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

(( EUID == 0 )) || { echo "must run as root" >&2; exit 1; }
if early_marker_present; then
    early_fail_close_handled=true
    early_prove_fail_closed || exit 1
fi
: "${DATA_ROOT:?DATA_ROOT is required}"
: "${BIND_ADDRESS:?BIND_ADDRESS is required}"
command -v docker >/dev/null 2>&1 || { echo "Docker is not installed" >&2; exit 1; }
timeout --signal=TERM 30 docker info >/dev/null 2>&1 \
    || { echo "Docker daemon is not available" >&2; exit 1; }
[[ "$DATA_ROOT" == /* && -d "$DATA_ROOT/backups" && ! -L "$DATA_ROOT/backups" \
    && $(stat --format '%u:%g:%a' "$DATA_ROOT/backups") == 0:0:700 ]] \
    || { echo "invalid backup root" >&2; exit 1; }

log() {
    printf '[iuin-recovery] %s\n' "$*"
}

sync_backup_root() {
    sync -f "$DATA_ROOT/backups" || return 1
}

restore_fence_chain=IUIN-RESTORE
restore_output_chain=IUIN-RESTORE-OUT

first_rule_is_jump() {
    local chain=$1 target=$2 first_rule
    first_rule=$(iptables -w -S "$chain" 2>/dev/null \
        | awk '$1 == "-A" { print; exit }') || return 1
    [[ "$first_rule" == "-A $chain -j $target" ]]
}

chain_has_exact_fence_targets() {
    local chain=$1 targets
    targets=$(iptables -w -S "$chain" 2>/dev/null | awk '
        $1 == "-A" {
            target = ""
            for (i = 1; i < NF; i++) {
                if ($i == "-j") { target = $(i + 1); break }
            }
            print target
        }
    ') || return 1
    [[ "$targets" == $'DROP\nDROP\nDROP\nDROP\nRETURN' ]]
}

restore_fence_complete() {
    local spec protocol port
    iptables -w -C DOCKER-USER -j "$restore_fence_chain" >/dev/null 2>&1 || return 1
    iptables -w -C OUTPUT -j "$restore_output_chain" >/dev/null 2>&1 || return 1
    first_rule_is_jump DOCKER-USER "$restore_fence_chain" || return 1
    first_rule_is_jump OUTPUT "$restore_output_chain" || return 1
    chain_has_exact_fence_targets "$restore_fence_chain" || return 1
    chain_has_exact_fence_targets "$restore_output_chain" || return 1
    for spec in tcp:8025 tcp:8065 tcp:8443 udp:8443; do
        protocol=${spec%%:*}
        port=${spec##*:}
        iptables -w -C "$restore_fence_chain" -p "$protocol" \
            -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP \
            >/dev/null 2>&1 || return 1
        iptables -w -C "$restore_output_chain" -p "$protocol" \
            -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP \
            >/dev/null 2>&1 || return 1
    done
}

remove_restore_fence() {
    local base chain base_and_chain
    for base_and_chain in "DOCKER-USER:$restore_fence_chain" "OUTPUT:$restore_output_chain"; do
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

apply_restore_fence() {
    local spec protocol port
    iptables -w -n -L DOCKER-USER >/dev/null 2>&1 || return 1
    restore_fence_complete && return 0
    if iptables -w -C DOCKER-USER -j "$restore_fence_chain" >/dev/null 2>&1 \
        || iptables -w -C OUTPUT -j "$restore_output_chain" >/dev/null 2>&1; then
        log "an incomplete active maintenance fence exists; refusing to flush it"
        return 1
    fi
    for chain in "$restore_fence_chain" "$restore_output_chain"; do
        iptables -w -N "$chain" 2>/dev/null \
            || iptables -w -n -L "$chain" >/dev/null 2>&1 || return 1
        iptables -w -F "$chain" || return 1
    done
    for spec in tcp:8025 tcp:8065 tcp:8443 udp:8443; do
        protocol=${spec%%:*}
        port=${spec##*:}
        iptables -w -A "$restore_fence_chain" -p "$protocol" \
            -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP || return 1
        iptables -w -A "$restore_output_chain" -p "$protocol" \
            -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP || return 1
    done
    iptables -w -A "$restore_fence_chain" -j RETURN || return 1
    iptables -w -A "$restore_output_chain" -j RETURN || return 1
    iptables -w -I OUTPUT 1 -j "$restore_output_chain" || return 1
    iptables -w -I DOCKER-USER 1 -j "$restore_fence_chain" || return 1
    restore_fence_complete
}

lock_path="$DATA_ROOT/backups/.backup.lock"
if [[ -e "$lock_path" || -L "$lock_path" ]]; then
    [[ -f "$lock_path" && ! -L "$lock_path" \
        && $(stat --format '%u:%g:%h' "$lock_path") == 0:0:1 ]] \
        || { echo "invalid maintenance lock file" >&2; exit 1; }
fi
exec 9>"$lock_path"
chown root:root "$lock_path"
chmod 0600 "$lock_path"
flock -w 1800 9 || { echo "timed out waiting for IUIN maintenance lock" >&2; exit 1; }

marker_value() {
    local marker=$1 key=$2
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$marker"
}

validate_marker() {
    local marker=$1
    [[ -f "$marker" && ! -L "$marker" ]] || { echo "invalid marker: $marker" >&2; return 1; }
    [[ $(stat --format '%u:%a:%h' "$marker") == 0:600:1 ]] \
        || { echo "marker must be a root-owned, mode-0600, single-link file: $marker" >&2; return 1; }
    [[ $(marker_value "$marker" format) == 1 ]] || { echo "unsupported marker format: $marker" >&2; return 1; }
    awk -F= 'NF < 2 || seen[$1]++ { exit 1 }' "$marker" \
        || { echo "marker has a malformed or duplicate field: $marker" >&2; return 1; }
}

current_service_id() {
    local ids count
    ids=$(docker ps --all --no-trunc --quiet \
        --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
        --filter "label=com.docker.compose.service=$1") || return 1
    count=$(wc -w <<< "$ids")
    [[ "$count" -le 1 ]] || { log "multiple containers claim service $1" >&2; return 1; }
    printf '%s\n' "$ids"
}

validate_container_identity() {
    local service=$1 id=$2 expected_image=${3:-} expected_config=${4:-}
    local project_label service_label image_id config_hash
    [[ "$id" =~ ^[a-f0-9]{64}$ ]] || { log "invalid recorded ID for $service"; return 1; }
    docker inspect "$id" >/dev/null 2>&1 || { log "recorded $service container no longer exists"; return 1; }
    project_label=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$id")
    service_label=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$id")
    [[ "$project_label" == "$COMPOSE_PROJECT_NAME" && "$service_label" == "$service" ]] \
        || { log "container identity does not match $COMPOSE_PROJECT_NAME/$service"; return 1; }
    if [[ -n "$expected_image" ]]; then
        image_id=$(docker inspect --format '{{.Image}}' "$id")
        [[ "$image_id" == "$expected_image" ]] || { log "$service image identity differs from the marker"; return 1; }
    fi
    if [[ -n "$expected_config" ]]; then
        config_hash=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$id")
        [[ "$config_hash" == "$expected_config" ]] || { log "$service Compose config differs from the marker"; return 1; }
    fi
}

wait_for_container() {
    local id=$1 timeout=$2 label=$3 started now status
    started=$(date +%s)
    while :; do
        status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)
        case "$status" in
            healthy|running) return 0 ;;
            unhealthy|exited|dead)
                docker logs --tail 100 "$id" >&2 || true
                log "$label container entered state $status"
                return 1
                ;;
        esac
        now=$(date +%s)
        if (( now - started >= timeout )); then
            docker logs --tail 100 "$id" >&2 || true
            log "timed out waiting for $label container"
            return 1
        fi
        sleep 3
    done
}

start_recorded_or_current() {
    local service=$1 recorded_id=$2 timeout=$3 expected_image=${4:-} expected_config=${5:-}
    local candidate=$recorded_id current
    [[ -z "$recorded_id" || "$recorded_id" =~ ^[a-f0-9]{64}$ ]] \
        || { log "invalid recorded ID for $service"; return 1; }
    current=$(current_service_id "$service") || return 1
    if [[ -z "$candidate" ]] || ! docker inspect "$candidate" >/dev/null 2>&1; then
        candidate=$current
    elif [[ -n "$current" && "$current" != "$candidate" ]]; then
        log "recorded $service container differs from the current unique service container"
        return 1
    fi
    [[ -n "$candidate" ]] || { log "no recoverable $service container exists"; return 1; }
    validate_container_identity "$service" "$candidate" "$expected_image" "$expected_config" || return 1
    docker update --restart=no "$candidate" >/dev/null || return 1
    docker start "$candidate" >/dev/null || return 1
    wait_for_container "$candidate" "$timeout" "$service"
}

start_exact() {
    local service=$1 id=$2 timeout=$3 expected_image=${4:-} expected_config=${5:-}
    local current
    current=$(current_service_id "$service") || return 1
    [[ "$current" == "$id" ]] \
        || { log "recorded $service container is not the unique current service container"; return 1; }
    validate_container_identity "$service" "$id" "$expected_image" "$expected_config" || return 1
    docker update --restart=no "$id" >/dev/null || return 1
    docker start "$id" >/dev/null || return 1
    wait_for_container "$id" "$timeout" "$service"
}

stop_recorded_or_current() {
    local service=$1 recorded_id=$2
    local candidate=$recorded_id current
    current=$(current_service_id "$service") || return 1
    if [[ -z "$candidate" ]] || ! docker inspect "$candidate" >/dev/null 2>&1; then
        candidate=$current
    elif [[ -n "$current" && "$current" != "$candidate" ]]; then
        log "recorded $service container differs from the current unique service container"
        return 1
    fi
    [[ -n "$candidate" ]] || return 0
    validate_container_identity "$service" "$candidate" || return 1
    docker update --restart=no "$candidate" >/dev/null || return 1
    docker stop --time 120 "$candidate" >/dev/null || return 1
}

fail_close_application_services() {
    local service ids id failed=false
    for service in gateway iuin-server minio mailpit; do
        ids=$(docker ps --all --no-trunc --quiet \
            --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
            --filter "label=com.docker.compose.service=$service") || { failed=true; continue; }
        for id in $ids; do
            validate_container_identity "$service" "$id" || { failed=true; continue; }
            docker update --restart=no "$id" >/dev/null || failed=true
            docker stop --time 120 "$id" >/dev/null || failed=true
        done
    done
    [[ "$failed" == false ]]
}

finalize_restart_policies() {
    local runtime=$1 services_text service id failed=false
    local -a services
    validate_immutable_release "$runtime" || return 1
    services_text=$(deployment_manifest_services "$runtime/deployment.manifest") || return 1
    mapfile -t services <<< "$services_text"
    for service in "${services[@]}"; do
        id=$(current_service_id "$service") || { failed=true; continue; }
        [[ -n "$id" ]] || { failed=true; continue; }
        validate_active_container "$runtime" "$service" "$id" || { failed=true; continue; }
        docker update --restart=unless-stopped "$id" >/dev/null || failed=true
    done
    [[ "$failed" == false ]]
}

recover_backup_marker() {
    local marker=$1 postgres_id minio_id mailpit_id server_id id runtime failed=false
    validate_marker "$marker" || return 1
    runtime=$(active_runtime_path) || { log "backup recovery has no valid active runtime"; return 1; }
    apply_restore_fence || { fail_close_application_services || true; return 1; }
    postgres_id=$(marker_value "$marker" postgres_id)
    minio_id=$(marker_value "$marker" minio_id)
    mailpit_id=$(marker_value "$marker" mailpit_id)
    server_id=$(marker_value "$marker" server_id)
    for id in "$postgres_id" "$minio_id" "$mailpit_id" "$server_id"; do
        [[ "$id" =~ ^[a-f0-9]{64}$ ]] || { log "backup marker has an invalid container ID"; return 1; }
    done
    validate_active_container "$runtime" postgres "$postgres_id" || return 1
    validate_active_container "$runtime" minio "$minio_id" || return 1
    validate_active_container "$runtime" mailpit "$mailpit_id" || return 1
    validate_active_container "$runtime" iuin-server "$server_id" || return 1
    start_exact postgres "$postgres_id" 300 || failed=true
    start_exact minio "$minio_id" 300 || failed=true
    start_exact mailpit "$mailpit_id" 300 || failed=true
    if [[ "$failed" == false ]]; then
        start_exact iuin-server "$server_id" 600 || failed=true
    fi
    [[ "$failed" == false ]] || return 1
    start_active_gateway_if_present "$runtime" || return 1
    systemctl restart iuin-docker-firewall.service || return 1
    run_active_health --internal || return 1
    finalize_restart_policies "$runtime" || return 1
    remove_restore_fence || return 1
    if ! run_active_health; then
        apply_restore_fence || fail_close_application_services || true
        log "interrupted backup recovery failed full health; marker retained"
        return 1
    fi
    rm -f -- "$marker" || return 1
    sync_backup_root || return 1
    log "interrupted backup containers recovered"
}

deployment_container_field() {
    local manifest=$1 service=$2 key=$3
    awk -v service="$service" -v key="$key" '
        $1 == "container=" service {
            for (i = 2; i <= NF; i++) {
                split($i, pair, "=")
                if (pair[1] == key) { print pair[2]; exit }
            }
        }
    ' "$manifest"
}

service_marker_key() {
    [[ "$1" == iuin-server ]] && printf 'server\n' || printf '%s\n' "$1"
}

deployment_value() {
    marker_value "$1" "$2"
}

# Return the strict, dependency-ordered resident service set encoded by an
# immutable deployment manifest. Format 1 is the pre-gateway layout; format 2
# adds the independently receipted Nginx gateway, which is deliberately last.
deployment_manifest_services() {
    local manifest=$1 format actual expected container_count
    [[ -f "$manifest" && ! -L "$manifest" ]] || return 1
    format=$(deployment_value "$manifest" format)
    container_count=$(grep -c '^container=' "$manifest") || return 1
    actual=$(sed -n 's/^container=\([^[:space:]]\+\) .*/\1/p' "$manifest" | LC_ALL=C sort)
    case "$format" in
        1)
            expected=$'iuin-server\nmailpit\nminio\npostgres'
            [[ "$container_count" -eq 4 && "$actual" == "$expected" ]] || return 1
            printf '%s\n' postgres minio mailpit iuin-server
            ;;
        2)
            expected=$'gateway\niuin-server\nmailpit\nminio\npostgres'
            [[ "$container_count" -eq 5 && "$actual" == "$expected" ]] || return 1
            printf '%s\n' postgres minio mailpit iuin-server gateway
            ;;
        *) return 1 ;;
    esac
}

immutable_seed_hash() {
    local root=$1 unexpected
    [[ -d "$root" && ! -L "$root" ]] || return 1
    unexpected=$(find "$root" -mindepth 1 ! -type d ! -type f -print -quit) || return 1
    [[ -z "$unexpected" ]] || return 1
    LC_ALL=C tar --sort=name --mtime='UTC 1970-01-01' \
        --owner=0 --group=0 --numeric-owner --format=gnu \
        --create --file=- --directory="$root" . \
        | sha256sum | awk '{print $1}'
}

validate_immutable_release() {
    local runtime=$1 manifest file_and_key runtime_file hash_key expected_hash service
    local configured_data_root configured_project configured_bind configured_seed_root
    local receipt_type recovery_for source_activation expected_seed_hash unexpected_seed file_and_mode mode
    local canonical_runtime services_text
    local -a services
    canonical_runtime=$(readlink -f -- "$runtime") || return 1
    manifest="$runtime/deployment.manifest"
    [[ "$canonical_runtime" == "$runtime" \
        && $(dirname -- "$runtime") == /opt/iuin/deploy/releases \
        && -d "$runtime" && ! -L "$runtime" \
        && $(stat --format '%u:%g:%a' /opt /opt/iuin /opt/iuin/deploy /opt/iuin/deploy/releases "$runtime" \
            | tr '\n' ' ') == '0:0:755 0:0:755 0:0:755 0:0:755 0:0:755 ' \
        && -f "$manifest" && ! -L "$manifest" \
        && $(stat --format '%u:%g:%a:%h' "$manifest") == 0:0:644:1 ]] || return 1
    services_text=$(deployment_manifest_services "$manifest") || return 1
    mapfile -t services <<< "$services_text"
    [[ $(deployment_value "$manifest" deployed_utc) =~ ^[0-9]{8}T[0-9]{6}Z$ \
        && $(deployment_value "$manifest" git_commit) =~ ^[a-f0-9]{40,64}$ \
        && $(deployment_value "$manifest" activation_id) =~ ^[a-f0-9]{32}$ ]] || return 1
    awk -F= 'NF < 2 || ($1 != "container" && seen[$1]++) { exit 1 }' "$manifest" || return 1
    for service in "${services[@]}"; do
        [[ $(grep -Ec "^container=$service id=[a-f0-9]{64} image_ref=[^[:space:]]+ image_id=sha256:[a-f0-9]{64} config_hash=[a-f0-9]{64}$" "$manifest") -eq 1 ]] \
            || return 1
    done
    receipt_type=$(deployment_value "$manifest" receipt_type)
    recovery_for=$(deployment_value "$manifest" recovery_for_activation)
    source_activation=$(deployment_value "$manifest" source_activation_id)
    case "$receipt_type" in
        '') [[ -z "$recovery_for" && -z "$source_activation" ]] || return 1 ;;
        recovery)
            [[ "$recovery_for" =~ ^[a-f0-9]{32}$ \
                && "$source_activation" =~ ^[a-f0-9]{32}$ ]] || return 1
            ;;
        *) return 1 ;;
    esac
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
        expected_hash=$(deployment_value "$manifest" "$hash_key")
        [[ "$expected_hash" =~ ^[a-f0-9]{64}$ \
            && -f "$runtime/$runtime_file" && ! -L "$runtime/$runtime_file" \
            && $(stat --format '%u:%h' "$runtime/$runtime_file") == 0:1 \
            && $(sha256sum "$runtime/$runtime_file" | awk '{print $1}') == "$expected_hash" ]] \
            || return 1
    done
    for file_and_mode in \
        'backup.sh:755' 'restore.sh:755' 'lib.sh:755' 'compose.yaml:644' \
        'production.env:600' 'health.sh:755' 'minio-ops.sh:755' \
        'create-admin.sh:755' 'recover-containers.sh:755' 'docker-firewall.sh:755' \
        'iuin-backup-recover.service:644' 'iuin-docker-firewall-pre.service:644' \
        'iuin-docker-firewall.service:644'; do
        runtime_file=${file_and_mode%%:*}
        mode=${file_and_mode##*:}
        [[ $(stat --format '%u:%g:%a:%h' "$runtime/$runtime_file") == "0:0:$mode:1" ]] \
            || return 1
    done
    expected_seed_hash=$(deployment_value "$manifest" seed_sha256)
    unexpected_seed=$(find "$runtime/seed" -mindepth 1 \
        \( ! -user root -o ! -group root -o -perm /022 \) -print -quit 2>/dev/null) || return 1
    [[ "$expected_seed_hash" =~ ^[a-f0-9]{64}$ \
        && $(stat --format '%u:%g:%a' "$runtime/seed") == 0:0:755 \
        && -z "$unexpected_seed" \
        && -s "$runtime/seed/profile/honors/achievements/achv_profile_anchor/icon.png" \
        && $(immutable_seed_hash "$runtime/seed") == "$expected_seed_hash" ]] || return 1
    awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/ && seen[$1]++ { exit 1 }' \
        "$runtime/production.env" || return 1
    configured_data_root=$(awk -F= '$1 == "DATA_ROOT" { sub(/^[^=]*=/, ""); print; exit }' \
        "$runtime/production.env")
    configured_project=$(awk -F= '$1 == "COMPOSE_PROJECT_NAME" { sub(/^[^=]*=/, ""); print; exit }' \
        "$runtime/production.env")
    configured_bind=$(awk -F= '$1 == "BIND_ADDRESS" { sub(/^[^=]*=/, ""); print; exit }' \
        "$runtime/production.env")
    configured_seed_root=$(awk -F= '$1 == "IUIN_SEED_ROOT" { sub(/^[^=]*=/, ""); print; exit }' \
        "$runtime/production.env")
    [[ "$configured_data_root" == "$DATA_ROOT" \
        && "$configured_project" == "$COMPOSE_PROJECT_NAME" \
        && "$configured_bind" == "$BIND_ADDRESS" \
        && "$configured_seed_root" == "$runtime/seed" ]]
}

active_runtime_path() {
    local runtime
    runtime=$(readlink -f -- /opt/iuin/deploy/current) || return 1
    validate_immutable_release "$runtime" || return 1
    printf '%s\n' "$runtime"
}

validate_active_container() {
    local runtime=$1 service=$2 id=$3 manifest expected_id expected_image expected_config
    manifest="$runtime/deployment.manifest"
    expected_id=$(deployment_container_field "$manifest" "$service" id)
    expected_image=$(deployment_container_field "$manifest" "$service" image_id)
    expected_config=$(deployment_container_field "$manifest" "$service" config_hash)
    [[ "$id" == "$expected_id" && "$expected_id" =~ ^[a-f0-9]{64}$ \
        && "$expected_image" =~ ^sha256:[a-f0-9]{64}$ \
        && "$expected_config" =~ ^[a-f0-9]{64}$ ]] || return 1
    validate_container_identity "$service" "$id" "$expected_image" "$expected_config"
}

start_active_gateway_if_present() {
    local runtime=$1 manifest format id current running health started now
    validate_immutable_release "$runtime" || return 1
    manifest="$runtime/deployment.manifest"
    format=$(deployment_value "$manifest" format)
    case "$format" in
        1) return 0 ;;
        2) ;;
        *) log "active runtime has an unsupported deployment format"; return 1 ;;
    esac
    id=$(deployment_container_field "$manifest" gateway id)
    current=$(current_service_id gateway) || return 1
    [[ "$id" =~ ^[a-f0-9]{64}$ \
        && "$current" == "$id" ]] \
        || { log "gateway receipt identity is not the unique current gateway container"; return 1; }
    validate_active_container "$runtime" gateway "$id" \
        || { log "gateway container differs from the active immutable receipt"; return 1; }
    docker update --restart=no "$id" >/dev/null || return 1
    running=$(docker inspect --format '{{.State.Running}}' "$id") || return 1
    case "$running" in
        true) ;;
        false)
            docker start "$id" >/dev/null || return 1
            ;;
        *)
            log "gateway container has an invalid running state"
            return 1
            ;;
    esac
    started=$(date +%s)
    while :; do
        running=$(docker inspect --format '{{.State.Running}}' "$id" 2>/dev/null || true)
        health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' \
            "$id" 2>/dev/null || true)
        if [[ "$running" != true ]]; then
            docker logs --tail 100 "$id" >&2 || true
            log "gateway stopped while waiting for its upstream health to recover"
            return 1
        fi
        case "$health" in
            healthy) return 0 ;;
            starting|unhealthy) ;;
            *)
                docker logs --tail 100 "$id" >&2 || true
                log "gateway has a missing or invalid Docker health state"
                return 1
                ;;
        esac
        now=$(date +%s)
        if (( now - started >= 300 )); then
            docker logs --tail 100 "$id" >&2 || true
            log "timed out waiting for gateway health after server recovery"
            return 1
        fi
        sleep 3
    done
}

legacy_runtime_uses_compat() {
    local runtime=$1 manifest receipt_type activation source_activation
    manifest="$runtime/deployment.manifest"
    [[ $(deployment_value "$manifest" git_commit) == "$legacy_commit" \
        && $(deployment_value "$manifest" health_sha256) == "$legacy_health_sha" \
        && $(deployment_value "$manifest" lib_sha256) == "$legacy_lib_sha" \
        && $(deployment_value "$manifest" compose_sha256) == "$legacy_compose_sha" \
        && $(deployment_value "$manifest" minio_ops_sha256) == "$legacy_minio_ops_sha" \
        && $(deployment_value "$manifest" recovery_sha256) == "$legacy_runtime_recovery_sha" ]] \
        || return 1
    receipt_type=$(deployment_value "$manifest" receipt_type)
    activation=$(deployment_value "$manifest" activation_id)
    source_activation=$(deployment_value "$manifest" source_activation_id)
    case "$receipt_type" in
        '') [[ "$activation" == "$legacy_activation" && -z "$source_activation" \
                && $(deployment_value "$manifest" environment_sha256) == "$legacy_environment_sha" ]] ;;
        recovery) [[ "$source_activation" =~ ^[a-f0-9]{32}$ ]] ;;
        *) return 1 ;;
    esac
}

legacy_compat_bundle_valid() {
    local runtime=$1 manifest directory files spec name mode expected_sha target
    local service id
    manifest="$runtime/deployment.manifest"
    for directory in /opt /opt/iuin /opt/iuin/deploy; do
        [[ -d "$directory" && ! -L "$directory" \
            && $(stat --format '%u:%g:%a' "$directory") == 0:0:755 ]] || return 1
    done
    for directory in "$legacy_compat_root" "$legacy_compat_dir"; do
        [[ -d "$directory" && ! -L "$directory" \
            && $(stat --format '%u:%g:%a' "$directory") == 0:0:700 ]] || return 1
    done
    files=$(find "$legacy_compat_dir" -mindepth 1 -maxdepth 1 -printf '%f\n' \
        | LC_ALL=C sort) || return 1
    [[ "$files" == $'compose.yaml\nhealth.sh\nlib.sh' ]] || return 1
    for spec in \
        "health.sh:755:$legacy_compat_health_sha" \
        "lib.sh:755:$legacy_lib_sha" \
        "compose.yaml:644:$legacy_compose_sha"; do
        IFS=: read -r name mode expected_sha <<< "$spec"
        target="$legacy_compat_dir/$name"
        [[ -f "$target" && ! -L "$target" \
            && $(stat --format '%u:%g:%a:%h' "$target") == "0:0:$mode:1" \
            && $(sha256sum "$target" | awk '{print $1}') == "$expected_sha" ]] || return 1
    done
    [[ $(sha256sum "$legacy_compat_dir/lib.sh" | awk '{print $1}') \
            == "$(deployment_value "$manifest" lib_sha256)" \
        && $(sha256sum "$legacy_compat_dir/compose.yaml" | awk '{print $1}') \
            == "$(deployment_value "$manifest" compose_sha256)" ]] || return 1
    for service in postgres minio mailpit iuin-server; do
        id=$(current_service_id "$service") || return 1
        [[ -n "$id" ]] || return 1
        validate_active_container "$runtime" "$service" "$id" || return 1
    done
}

run_active_health() {
    local runtime checker use_compat=false rc
    runtime=$(active_runtime_path) || { log "active immutable runtime validation failed"; return 1; }
    checker="$runtime/health.sh"
    if legacy_runtime_uses_compat "$runtime"; then
        legacy_compat_bundle_valid "$runtime" \
            || { log "fingerprint-pinned legacy health compatibility bundle is invalid"; return 1; }
        checker="$legacy_compat_dir/health.sh"
        use_compat=true
        log "using fingerprint-pinned health compatibility for the legacy activation"
    fi
    if ENV_FILE="$runtime/production.env" IUIN_PROJECT_DIRECTORY="$runtime" \
        /usr/bin/bash "$checker" "$@"; then
        rc=0
    else
        rc=$?
    fi
    if [[ "$use_compat" == true ]]; then
        [[ $(readlink -f -- /opt/iuin/deploy/current) == "$runtime" ]] \
            || { log "active runtime changed during compatibility health"; return 1; }
        validate_immutable_release "$runtime" \
            || { log "active runtime validation changed during compatibility health"; return 1; }
        legacy_compat_bundle_valid "$runtime" \
            || { log "legacy health compatibility bundle changed during execution"; return 1; }
    fi
    return "$rc"
}

publish_recovery_receipt() {
    local source_runtime=$1 recovery_for_activation=$2 runtime_root=/opt/iuin/deploy releases
    local deployed_at activation git_commit source_activation source_format services_text
    local release staging link_tmp spec source_name target_name mode file_and_key runtime_file hash_key
    local service id full_id image_ref image_id config_hash running
    local -a services
    validate_immutable_release "$source_runtime" || return 1
    services_text=$(deployment_manifest_services "$source_runtime/deployment.manifest") || return 1
    mapfile -t services <<< "$services_text"
    source_format=$(deployment_value "$source_runtime/deployment.manifest" format)
    [[ "$source_format" == 1 || "$source_format" == 2 ]] || return 1
    releases="$runtime_root/releases"
    deployed_at=$(date -u +'%Y%m%dT%H%M%SZ')
    activation=$(od -An -N16 -tx1 /dev/urandom | tr -d '[:space:]')
    [[ "$activation" =~ ^[a-f0-9]{32}$ ]] || return 1
    git_commit=$(deployment_value "$source_runtime/deployment.manifest" git_commit)
    source_activation=$(deployment_value "$source_runtime/deployment.manifest" activation_id)
    [[ "$recovery_for_activation" =~ ^[a-f0-9]{32}$ \
        && "$source_activation" =~ ^[a-f0-9]{32}$ ]] || return 1
    release="$releases/$git_commit-$deployed_at-$activation-recovered"
    install -d -m 0755 -o root -g root "$runtime_root" "$releases" || return 1
    staging=$(mktemp -d "$releases/.recovery-staging.XXXXXX") || return 1
    chmod 0755 "$staging" || return 1
    for spec in \
        "backup.sh:backup.sh:0755" "restore.sh:restore.sh:0755" "lib.sh:lib.sh:0755" \
        "compose.yaml:compose.yaml:0644" "health.sh:health.sh:0755" \
        "minio-ops.sh:minio-ops.sh:0755" "create-admin.sh:create-admin.sh:0755" \
        "recover-containers.sh:recover-containers.sh:0755" \
        "docker-firewall.sh:docker-firewall.sh:0755" \
        "iuin-backup-recover.service:iuin-backup-recover.service:0644" \
        "iuin-docker-firewall-pre.service:iuin-docker-firewall-pre.service:0644" \
        "iuin-docker-firewall.service:iuin-docker-firewall.service:0644"; do
        source_name=${spec%%:*}
        spec=${spec#*:}
        target_name=${spec%%:*}
        mode=${spec##*:}
        install -m "$mode" -o root -g root "$source_runtime/$source_name" "$staging/$target_name" \
            || return 1
    done
    install -d -m 0755 -o root -g root "$staging/seed" || return 1
    cp -a -- "$source_runtime/seed/." "$staging/seed/" || return 1
    chown -R root:root "$staging/seed" || return 1
    find "$staging/seed" -type d -exec chmod 0755 {} + || return 1
    find "$staging/seed" -type f -exec chmod 0644 {} + || return 1
    sed '/^IUIN_SEED_ROOT=/d' "$source_runtime/production.env" > "$staging/production.env" \
        || return 1
    printf '\nIUIN_SEED_ROOT=%s/seed\n' "$release" >> "$staging/production.env" || return 1
    chown root:root "$staging/production.env" || return 1
    chmod 0600 "$staging/production.env" || return 1
    {
        printf 'format=%s\n' "$source_format"
        printf 'deployed_utc=%s\n' "$deployed_at"
        printf 'git_commit=%s\n' "$git_commit"
        printf 'activation_id=%s\n' "$activation"
        printf 'receipt_type=recovery\n'
        printf 'recovery_for_activation=%s\n' "$recovery_for_activation"
        printf 'source_activation_id=%s\n' "$source_activation"
        printf 'seed_sha256=%s\n' "$(immutable_seed_hash "$staging/seed")"
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
            printf '%s=%s\n' "$hash_key" "$(sha256sum "$staging/$runtime_file" | awk '{print $1}')"
        done
        for service in "${services[@]}"; do
            id=$(current_service_id "$service") || return 1
            [[ "$id" =~ ^[a-f0-9]{64}$ ]] || return 1
            running=$(docker inspect --format '{{.State.Running}}' "$id")
            [[ "$running" == false ]] || return 1
            full_id=$(docker inspect --format '{{.Id}}' "$id")
            image_ref=$(docker inspect --format '{{.Config.Image}}' "$id")
            image_id=$(docker inspect --format '{{.Image}}' "$id")
            config_hash=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$id")
            [[ "$full_id" =~ ^[a-f0-9]{64}$ && "$image_id" =~ ^sha256:[a-f0-9]{64}$ \
                && "$config_hash" =~ ^[a-f0-9]{64}$ && -n "$image_ref" \
                && "$image_ref" != *[[:space:]]* ]] || return 1
            printf 'container=%s id=%s image_ref=%s image_id=%s config_hash=%s\n' \
                "$service" "$full_id" "$image_ref" "$image_id" "$config_hash"
        done
    } > "$staging/deployment.manifest" || return 1
    chmod 0644 "$staging/deployment.manifest" || return 1
    sync -f "$staging" || return 1
    mv -T -- "$staging" "$release" || return 1
    sync -f "$releases" || return 1
    validate_immutable_release "$release" || return 1
    link_tmp="$runtime_root/.current-recovered.$$"
    ln -s "$release" "$link_tmp" || return 1
    mv -Tf -- "$link_tmp" "$runtime_root/current" || return 1
    sync -f "$runtime_root" || return 1
    log "published recovery receipt for recreated containers: $release"
}

rollback_previous_deployment() {
    local marker=$1 runtime service key image_id image_ref config_hash current_id services_text gateway_id running
    local -a services retag_services
    runtime=$(marker_value "$marker" previous_release)
    validate_immutable_release "$runtime" || return 1
    services_text=$(deployment_manifest_services "$runtime/deployment.manifest") || return 1
    mapfile -t services <<< "$services_text"
    command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 || return 1
    log "recorded container was replaced; recreating the previous successful deployment snapshot"
    retag_services=(iuin-server minio)
    if [[ $(deployment_value "$runtime/deployment.manifest" format) == 2 ]]; then
        retag_services+=(gateway)
    else
        gateway_id=$(current_service_id gateway) || return 1
        if [[ -n "$gateway_id" ]]; then
            validate_container_identity gateway "$gateway_id" || return 1
            docker update --restart=no "$gateway_id" >/dev/null || return 1
            running=$(docker inspect --format '{{.State.Running}}' "$gateway_id") || return 1
            [[ "$running" == false ]] \
                || docker stop --time 120 "$gateway_id" >/dev/null || return 1
            docker rm "$gateway_id" >/dev/null || return 1
            gateway_id=$(current_service_id gateway) || return 1
            [[ -z "$gateway_id" ]] || return 1
        fi
    fi
    for service in "${retag_services[@]}"; do
        key=$(service_marker_key "$service")
        image_id=$(marker_value "$marker" "${key}_image_id")
        image_ref=$(marker_value "$marker" "${key}_image_ref")
        [[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ && -n "$image_ref" \
            && "$image_ref" != *[[:space:]]* && "$image_ref" != *@* ]] || return 1
        docker image inspect "$image_id" >/dev/null 2>&1 || return 1
        docker tag "$image_id" "$image_ref" || return 1
    done
    IUIN_RESTART_POLICY=no docker compose \
        --project-directory "$runtime" \
        --env-file "$runtime/production.env" \
        --file "$runtime/compose.yaml" \
        up --no-start --no-build --pull never "${services[@]}" || return 1
    for service in "${services[@]}"; do
        key=$(service_marker_key "$service")
        image_id=$(marker_value "$marker" "${key}_image_id")
        config_hash=$(marker_value "$marker" "${key}_config_hash")
        [[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ && "$config_hash" =~ ^[a-f0-9]{64}$ ]] || return 1
        current_id=$(current_service_id "$service") || return 1
        [[ -n "$current_id" ]] || return 1
        validate_container_identity "$service" "$current_id" "$image_id" "$config_hash" || return 1
        docker update --restart=no "$current_id" >/dev/null || return 1
    done
    systemctl restart iuin-docker-firewall.service || return 1
    publish_recovery_receipt "$runtime" "$(marker_value "$marker" activation_id)" || return 1
}

recover_deploy_marker() {
    local marker=$1 service key id image_id config_hash current_id timeout runtime current_manifest gateway_current
    local marker_commit marker_activation current_commit current_activation
    local receipt_type recovery_for source_activation expected_source_activation previous_release
    local previous_runtime phase activated=false recovered=false rollback_needed=false failed=false
    local previous_services_text current_services_text
    local -a previous_services current_services marker_services
    validate_marker "$marker" || return 1
    marker_commit=$(marker_value "$marker" git_commit)
    marker_activation=$(marker_value "$marker" activation_id)
    previous_runtime=$(marker_value "$marker" previous_runtime)
    phase=$(marker_value "$marker" phase)
    previous_release=$(marker_value "$marker" previous_release)
    [[ "$marker_commit" =~ ^[a-f0-9]{40,64}$ && "$marker_activation" =~ ^[a-f0-9]{32}$ \
        && ( "$previous_runtime" == true || "$previous_runtime" == false ) \
        && ( "$phase" == preparing || "$phase" == modifying || "$phase" == committed ) ]] \
        || { log "deployment marker metadata is invalid"; return 1; }
    if [[ "$previous_runtime" == true ]]; then
        validate_immutable_release "$previous_release" \
            || { log "previous immutable runtime recorded by the deployment marker is invalid"; return 1; }
        previous_services_text=$(deployment_manifest_services "$previous_release/deployment.manifest") || return 1
        mapfile -t previous_services <<< "$previous_services_text"
    else
        [[ -z "$previous_release" ]] || { log "first-deployment marker unexpectedly records a previous release"; return 1; }
    fi
    if ! apply_restore_fence; then
        fail_close_application_services || log "one or more application containers could not be stopped"
        log "deployment recovery could not establish its maintenance fence; marker retained"
        return 1
    fi

    if [[ "$phase" == preparing ]]; then
        if [[ "$previous_runtime" == true ]]; then
            runtime=$(active_runtime_path) || return 1
            [[ "$runtime" == "$previous_release" ]] || { log "active runtime differs from the preparing marker"; return 1; }
            marker_services=("${previous_services[@]}")
        else
            marker_services=(postgres minio mailpit iuin-server gateway)
        fi
        for service in "${marker_services[@]}"; do
            key=$(service_marker_key "$service")
            id=$(marker_value "$marker" "${key}_id")
            if [[ -z "$id" ]]; then
                [[ "$previous_runtime" == false ]] || { log "preparing marker is missing $service identity"; return 1; }
                continue
            fi
            image_id=$(marker_value "$marker" "${key}_image_id")
            config_hash=$(marker_value "$marker" "${key}_config_hash")
            [[ "$id" =~ ^[a-f0-9]{64}$ && "$image_id" =~ ^sha256:[a-f0-9]{64}$ \
                && "$config_hash" =~ ^[a-f0-9]{64}$ ]] \
                || { log "preparing marker has an invalid $service identity"; return 1; }
            timeout=300
            [[ "$service" == iuin-server ]] && timeout=600
            start_exact "$service" "$id" "$timeout" "$image_id" "$config_hash" || return 1
        done
        systemctl restart iuin-docker-firewall.service || return 1
        if [[ "$previous_runtime" == true ]]; then
            run_active_health --internal || return 1
            finalize_restart_policies "$runtime" || return 1
        fi
        remove_restore_fence || return 1
        if [[ "$previous_runtime" == true ]] && ! run_active_health; then
            apply_restore_fence || fail_close_application_services || true
            log "pre-modification deployment recovery failed full health; marker retained"
            return 1
        fi
        rm -f -- "$marker" || return 1
        sync_backup_root || return 1
        log "deployment stopped before modification; original containers recovered"
        return 0
    fi

    runtime=$(active_runtime_path 2>/dev/null || true)
    current_manifest=
    if [[ -n "$runtime" ]]; then
        current_manifest="$runtime/deployment.manifest"
        current_commit=$(deployment_value "$current_manifest" git_commit)
        current_activation=$(deployment_value "$current_manifest" activation_id)
        [[ "$current_commit" == "$marker_commit" && "$current_activation" == "$marker_activation" ]] \
            && activated=true
        receipt_type=$(deployment_value "$current_manifest" receipt_type)
        recovery_for=$(deployment_value "$current_manifest" recovery_for_activation)
        source_activation=$(deployment_value "$current_manifest" source_activation_id)
        if [[ "$receipt_type" == recovery && "$recovery_for" == "$marker_activation" \
            && "$previous_runtime" == true ]] \
            && validate_immutable_release "$previous_release"; then
            expected_source_activation=$(deployment_value "$previous_release/deployment.manifest" activation_id)
            [[ "$source_activation" == "$expected_source_activation" \
                && "$current_commit" == $(deployment_value "$previous_release/deployment.manifest" git_commit) \
                && $(deployment_value "$current_manifest" format) == $(deployment_value "$previous_release/deployment.manifest" format) ]] \
                && recovered=true
        fi
    fi

    if [[ "$activated" == true ]]; then
        log "deployment activation receipt matches; recovering the activated containers"
    elif [[ "$recovered" == true ]]; then
        log "previous rollback receipt matches; resuming recovery of the recreated containers"
    elif [[ "$phase" == committed ]]; then
        fail_close_application_services || log "one or more application containers could not be stopped"
        log "committed deployment receipt is missing or invalid; marker and fence retained"
        return 1
    elif [[ "$previous_runtime" == false ]]; then
        if fail_close_application_services; then
            log "the first deployment was interrupted before activation; application containers are fail-closed"
        else
            log "the first deployment was interrupted and one or more application containers could not be stopped"
        fi
        log "no previous immutable runtime exists, so the deployment marker is retained for inspection"
        return 1
    else
        for service in "${previous_services[@]}"; do
            key=$(service_marker_key "$service")
            id=$(marker_value "$marker" "${key}_id")
            image_id=$(marker_value "$marker" "${key}_image_id")
            config_hash=$(marker_value "$marker" "${key}_config_hash")
            [[ "$id" =~ ^[a-f0-9]{64}$ && "$image_id" =~ ^sha256:[a-f0-9]{64}$ \
                && "$config_hash" =~ ^[a-f0-9]{64}$ ]] \
                || { rollback_needed=true; break; }
            if ! validate_container_identity "$service" "$id" "$image_id" "$config_hash"; then
                rollback_needed=true
                break
            fi
            current_id=$(current_service_id "$service") || { rollback_needed=true; break; }
            [[ -z "$current_id" || "$current_id" == "$id" ]] || { rollback_needed=true; break; }
        done
        if [[ "$rollback_needed" == false \
            && $(deployment_value "$previous_release/deployment.manifest" format) == 1 ]]; then
            if ! gateway_current=$(current_service_id gateway); then
                rollback_needed=true
            elif [[ -n "$gateway_current" ]]; then
                rollback_needed=true
            fi
        fi
        if [[ "$rollback_needed" == true ]]; then
            rollback_previous_deployment "$marker" \
                || { log "previous deployment rollback failed; marker retained"; return 1; }
        fi
        runtime=$(active_runtime_path) || { log "recovered runtime receipt is invalid"; return 1; }
        current_manifest="$runtime/deployment.manifest"
    fi

    [[ -n "$current_manifest" ]] || { log "no immutable runtime is available for recovery"; return 1; }
    current_services_text=$(deployment_manifest_services "$current_manifest") || return 1
    mapfile -t current_services <<< "$current_services_text"
    for service in "${current_services[@]}"; do
        timeout=300
        [[ "$service" == iuin-server ]] && timeout=600
        id=$(deployment_container_field "$current_manifest" "$service" id)
        image_id=$(deployment_container_field "$current_manifest" "$service" image_id)
        config_hash=$(deployment_container_field "$current_manifest" "$service" config_hash)
        [[ "$id" =~ ^[a-f0-9]{64}$ && "$image_id" =~ ^sha256:[a-f0-9]{64}$ \
            && "$config_hash" =~ ^[a-f0-9]{64}$ ]] \
            || { log "missing expected identity for $service"; return 1; }
        start_exact "$service" "$id" "$timeout" "$image_id" "$config_hash" || failed=true
        [[ "$failed" == false ]] || break
    done
    [[ "$failed" == false ]] || return 1
    systemctl restart iuin-docker-firewall.service || return 1
    run_active_health --internal || return 1
    finalize_restart_policies "$runtime" || return 1
    remove_restore_fence || return 1
    if ! run_active_health; then
        if apply_restore_fence; then
            log "deployment full health failed; marker retained behind the maintenance fence"
        else
            fail_close_application_services || true
            log "deployment full health failed and the fence could not be restored; services were stopped"
        fi
        return 1
    fi
    rm -f -- "$marker" || return 1
    sync_backup_root || return 1
    log "interrupted deployment containers recovered"
}

recovery_exit_guard() {
    local rc=$? live_restore docker_stopped=false
    trap - EXIT INT TERM
    set +e
    if (( rc != 0 )) && early_marker_present; then
        if ! restore_fence_complete && ! apply_restore_fence; then
            if ! fail_close_application_services; then
                live_restore=$(timeout --signal=TERM 15 docker info \
                    --format '{{.LiveRestoreEnabled}}' 2>/dev/null || true)
                if systemctl stop docker.service docker.socket >/dev/null 2>&1 \
                    && ! systemctl is-active --quiet docker.service \
                    && ! systemctl is-active --quiet docker.socket \
                    && [[ "$live_restore" == false ]]; then
                    docker_stopped=true
                fi
                if [[ "$docker_stopped" == true ]]; then
                    log "recovery could not establish a fence or stop every application container; Docker was stopped with live-restore disabled"
                else
                    log "CRITICAL: recovery could not prove ingress fenced, application containers stopped, or Docker safely inactive"
                fi
            else
                log "recovery exited with a durable marker; application services were stopped because the fence was incomplete"
            fi
        fi
    fi
    exit "$rc"
}
trap recovery_exit_guard EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

restore_marker="$DATA_ROOT/backups/.restore-in-progress"
backup_marker="$DATA_ROOT/backups/.backup-in-progress"
deploy_marker="$DATA_ROOT/backups/.deploy-in-progress"

marker_count=0
for candidate_marker in "$restore_marker" "$backup_marker" "$deploy_marker"; do
    [[ ! -e "$candidate_marker" && ! -L "$candidate_marker" ]] || (( marker_count += 1 ))
done
if (( marker_count > 1 )); then
    apply_restore_fence || log "could not establish a complete maintenance fence for ambiguous markers"
    fail_close_application_services || log "one or more application containers could not be stopped"
    log "multiple maintenance markers are present; refusing to run conflicting recovery state machines"
    exit 1
fi

if [[ -e "$restore_marker" || -L "$restore_marker" ]]; then
    validate_marker "$restore_marker"
    phase=$(marker_value "$restore_marker" phase)
    postgres_id=$(marker_value "$restore_marker" postgres_id)
    server_id=$(marker_value "$restore_marker" server_id)
    minio_id=$(marker_value "$restore_marker" minio_id)
    mailpit_id=$(marker_value "$restore_marker" mailpit_id)
    for id in "$postgres_id" "$server_id" "$minio_id" "$mailpit_id"; do
        [[ "$id" =~ ^[a-f0-9]{64}$ ]] || { log "restore marker has an invalid container ID"; exit 1; }
    done
    runtime=$(active_runtime_path) || { log "restore recovery has no valid active runtime"; exit 1; }
    validate_active_container "$runtime" postgres "$postgres_id" || exit 1
    validate_active_container "$runtime" minio "$minio_id" || exit 1
    validate_active_container "$runtime" mailpit "$mailpit_id" || exit 1
    validate_active_container "$runtime" iuin-server "$server_id" || exit 1
    rollback=$(marker_value "$restore_marker" rollback)
    case "$rollback" in
        "$DATA_ROOT/backups"/pre-restore-*) ;;
        *) log "restore marker has an invalid rollback path"; exit 1 ;;
    esac
    [[ "$phase" == preparing || "$phase" == mutating || "$phase" == committed ]] \
        || { log "restore marker has an invalid phase"; exit 1; }
    if ! apply_restore_fence; then
        fail_close_application_services || log "one or more application containers could not be stopped"
        log "could not apply the restore ingress fence; application containers were fail-closed"
        exit 1
    fi
    if [[ "$phase" == preparing ]]; then
        failed=false
        for service_and_id in "postgres:$postgres_id" "minio:$minio_id" "mailpit:$mailpit_id" "iuin-server:$server_id"; do
            service=${service_and_id%%:*}
            id=${service_and_id#*:}
            timeout=300
            [[ "$service" == iuin-server ]] && timeout=600
            start_exact "$service" "$id" "$timeout" || { failed=true; break; }
        done
        [[ "$failed" == false ]] || { log "pre-mutation restore recovery failed; marker and fence retained"; exit 1; }
        start_active_gateway_if_present "$runtime" \
            || { log "pre-mutation restore gateway recovery failed; marker and fence retained"; exit 1; }
        systemctl restart iuin-docker-firewall.service \
            || { log "failed to refresh the container firewall; marker and fence retained"; exit 1; }
        run_active_health --internal \
            || { log "pre-mutation restore internal health failed; marker and fence retained"; exit 1; }
        finalize_restart_policies "$runtime" \
            || { log "failed to restore restart policies; marker and fence retained"; exit 1; }
        remove_restore_fence || exit 1
        if ! run_active_health; then
            apply_restore_fence || fail_close_application_services || true
            log "pre-mutation restore full health failed; marker retained"
            exit 1
        fi
        rm -f -- "$restore_marker" || exit 1
        sync_backup_root || exit 1
        log "interrupted pre-mutation restore was safely cancelled and containers recovered"
        exit 0
    fi
    if [[ "$phase" == committed ]]; then
        failed=false
        start_exact postgres "$postgres_id" 300 || failed=true
        start_exact minio "$minio_id" 300 || failed=true
        start_exact mailpit "$mailpit_id" 300 || failed=true
        if [[ "$failed" == false ]]; then
            start_exact iuin-server "$server_id" 600 || failed=true
        fi
        [[ "$failed" == false ]] \
            || { log "committed restore container recovery failed; marker and fence retained"; exit 1; }
        start_active_gateway_if_present "$runtime" \
            || { log "committed restore gateway recovery failed; marker and fence retained"; exit 1; }
        systemctl restart iuin-docker-firewall.service \
            || { log "committed restore firewall refresh failed; marker and fence retained"; exit 1; }
        run_active_health --internal \
            || { log "committed restore internal health failed; marker and fence retained"; exit 1; }
        finalize_restart_policies "$runtime" \
            || { log "committed restore restart-policy finalization failed; marker and fence retained"; exit 1; }
        remove_restore_fence || { log "committed restore fence removal failed; marker retained"; exit 1; }
        if ! run_active_health; then
            if apply_restore_fence; then
                log "committed restore full health failed; marker retained and ingress was fenced again"
            else
                fail_close_application_services || true
                log "committed restore full health failed and ingress could not be fenced; containers were stopped"
            fi
            exit 1
        fi
        rm -f -- "$restore_marker" || exit 1
        sync_backup_root || exit 1
        log "committed restore finalization recovered"
        exit 0
    fi
    failed=false
    fail_close_application_services || failed=true
    log "unfinished restore is fail-closed; application containers remain stopped"
    log "pre-restore rollback path recorded by the restore: $rollback"
    log "from the deployment repository, run: sudo deploy/production/restore.sh $rollback --recover-interrupted"
    [[ "$failed" == false ]] || log "one or more containers could not be stopped"
    exit 1
fi

recovery_failed=false
if [[ -e "$backup_marker" || -L "$backup_marker" ]]; then
    recover_backup_marker "$backup_marker" || recovery_failed=true
fi
if [[ -e "$deploy_marker" || -L "$deploy_marker" ]]; then
    recover_deploy_marker "$deploy_marker" || recovery_failed=true
fi
[[ "$recovery_failed" == false ]] || { log "automatic recovery failed; marker retained"; exit 1; }
if [[ ! -e "$backup_marker" && ! -L "$backup_marker" \
    && ! -e "$deploy_marker" && ! -L "$deploy_marker" ]]; then
    remove_restore_fence
    log "no interrupted maintenance marker is present"
fi
