#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
require_root
if [[ "${IUIN_MAINTENANCE_SUPERVISED:-0}" != 1 ]]; then
    run_supervised_maintenance iuin-deploy "$SCRIPT_DIR/deploy.sh"
    exit $?
fi
load_env
require_compose
require_repo

legacy_compat_name=1101c2a4a3470c5155c2e149c5267ceac573a6f2-6a7a6e1244ab44a17e06adcfc127ccec
legacy_runtime_commit=1101c2a4a3470c5155c2e149c5267ceac573a6f2
legacy_runtime_activation=6a7a6e1244ab44a17e06adcfc127ccec
legacy_runtime_health_sha=42f0a86ddc45a22737ca1b6813cdda52ab460e068a2dc02e73454b5b897e5011
legacy_runtime_environment_sha=7aa4cf6e52168c132cecd4ddf6c3a6000088f887450efc2edb01654cd1b7b0bb
legacy_runtime_minio_ops_sha=93c9b04d64d3f2547692333c8f9f2091ed15cb542bdc1486fadcd5686d31f057
legacy_runtime_recovery_sha=a0aed92257a153c4771ae5d7534f35453551d544c259690a397d30d98a08cb3f
legacy_compat_health_sha=98348a4a708752fe95c58d545bdd845ced9253b23399d7a6c0344cfb6ed0ba8d
legacy_compat_lib_sha=2f2b984743e2aaea550196d3e7c39a4a3dcdd0c302c9c78b9f98ca9c27b493f6
legacy_compat_compose_sha=7bd149c5220be8405e39ba9fa295a2d352bf6468e38d136cae85e1f9dd0caafd
legacy_compat_root=/opt/iuin/deploy/compat
legacy_compat_dir="$legacy_compat_root/$legacy_compat_name"

installed_legacy_compat_valid() {
    local directory files spec target_name mode expected_sha target
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
        "lib.sh:755:$legacy_compat_lib_sha" \
        "compose.yaml:644:$legacy_compat_compose_sha"; do
        IFS=: read -r target_name mode expected_sha <<< "$spec"
        target="$legacy_compat_dir/$target_name"
        [[ -f "$target" && ! -L "$target" \
            && $(stat --format '%u:%g:%a:%h' "$target") == "0:0:$mode:1" \
            && $(sha256sum "$target" | awk '{print $1}') == "$expected_sha" ]] || return 1
    done
}

manifest_value() {
    awk -F= -v key="$2" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$1"
}

current_runtime_requires_legacy_compat() {
    local runtime manifest receipt_type source_activation
    [[ -L /opt/iuin/deploy/current ]] || return 1
    runtime=$(readlink -f -- /opt/iuin/deploy/current) || return 1
    manifest="$runtime/deployment.manifest"
    [[ -f "$manifest" && ! -L "$manifest" \
        && $(manifest_value "$manifest" git_commit) == "$legacy_runtime_commit" \
        && $(manifest_value "$manifest" health_sha256) == "$legacy_runtime_health_sha" \
        && $(manifest_value "$manifest" lib_sha256) == "$legacy_compat_lib_sha" \
        && $(manifest_value "$manifest" compose_sha256) == "$legacy_compat_compose_sha" \
        && $(manifest_value "$manifest" minio_ops_sha256) == "$legacy_runtime_minio_ops_sha" \
        && $(manifest_value "$manifest" recovery_sha256) == "$legacy_runtime_recovery_sha" ]] \
        || return 1
    receipt_type=$(manifest_value "$manifest" receipt_type)
    case "$receipt_type" in
        '') [[ $(manifest_value "$manifest" activation_id) == "$legacy_runtime_activation" \
                && $(manifest_value "$manifest" environment_sha256) == "$legacy_runtime_environment_sha" ]] ;;
        recovery)
            source_activation=$(manifest_value "$manifest" source_activation_id)
            [[ "$source_activation" =~ ^[a-f0-9]{32}$ ]]
            ;;
        *) return 1 ;;
    esac
}

for secret in postgres_password mattermost_db_password minio_root_user minio_root_password mattermost_s3_access_key mattermost_s3_secret_key admin_initial_password mailpit_ui_password mailpit_ui_auth; do
    require_secret "$secret"
done

[[ -d "$DATA_ROOT/backups" ]] || die "missing backup directory; run bootstrap.sh first"
[[ -f /etc/systemd/system/iuin-backup-recover.service ]] || die "backup recovery unit is not installed; run bootstrap.sh first"
[[ -x /usr/local/sbin/iuin-recover-containers ]] || die "container recovery helper is not installed; run bootstrap.sh first"
for runtime_pair in \
    "$SCRIPT_DIR/recover-containers.sh:/usr/local/sbin/iuin-recover-containers" \
    "$SCRIPT_DIR/backup-launcher.sh:/usr/local/sbin/iuin-backup-launcher" \
    "$SCRIPT_DIR/docker-firewall.sh:/usr/local/sbin/iuin-docker-firewall" \
    "$SCRIPT_DIR/iuin-backup-recover.service:/etc/systemd/system/iuin-backup-recover.service" \
    "$SCRIPT_DIR/iuin-backup.service:/etc/systemd/system/iuin-backup.service" \
    "$SCRIPT_DIR/iuin-backup.timer:/etc/systemd/system/iuin-backup.timer" \
    "$SCRIPT_DIR/iuin-docker-firewall-pre.service:/etc/systemd/system/iuin-docker-firewall-pre.service" \
    "$SCRIPT_DIR/iuin-docker-firewall.service:/etc/systemd/system/iuin-docker-firewall.service"; do
    source_path=${runtime_pair%%:*}
    installed_path=${runtime_pair#*:}
    cmp -s "$source_path" "$installed_path" \
        || die "installed maintenance runtime differs from this commit; run bootstrap.sh before deploy.sh"
done
[[ -f /usr/local/sbin/iuin-recover-containers \
    && ! -L /usr/local/sbin/iuin-recover-containers \
    && $(stat --format '%u:%g:%a:%h' /usr/local/sbin/iuin-recover-containers) == 0:0:755:1 \
    && $(sha256sum /usr/local/sbin/iuin-recover-containers | awk '{print $1}') \
        == "$(sha256sum "$SCRIPT_DIR/recover-containers.sh" | awk '{print $1}')" ]] \
    || die "installed recovery helper is not a protected copy of this commit; run bootstrap.sh"
installed_recovery_value() {
    awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' /etc/iuin/recovery.env
}
installed_firewall_value() {
    awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' /etc/iuin/firewall.env
}
[[ $(installed_recovery_value DATA_ROOT) == "$DATA_ROOT" \
    && $(installed_recovery_value COMPOSE_PROJECT_NAME) == "$COMPOSE_PROJECT_NAME" \
    && $(installed_recovery_value BIND_ADDRESS) == "$BIND_ADDRESS" ]] \
    || die "installed recovery environment differs from this deployment; run bootstrap.sh"
[[ $(installed_firewall_value DATA_ROOT) == "$DATA_ROOT" \
    && $(installed_firewall_value COMPOSE_PROJECT_NAME) == "$COMPOSE_PROJECT_NAME" \
    && $(installed_firewall_value BIND_ADDRESS) == "$BIND_ADDRESS" \
    && $(installed_firewall_value PUBLISH_INTERFACE) == "$PUBLISH_INTERFACE" \
    && $(installed_firewall_value LAN_CIDR) == "$LAN_CIDR" ]] \
    || die "installed firewall environment differs from this deployment; run bootstrap.sh"
systemctl is-enabled --quiet iuin-docker-firewall-pre.service \
    || die "pre-Docker firewall unit is not enabled; run bootstrap.sh"
exec 8>"$DATA_ROOT/backups/.backup.lock"
flock -w 1800 8 || die "timed out waiting for backup or restore lock"
if [[ -e "$legacy_compat_dir" || -L "$legacy_compat_dir" ]]; then
    installed_legacy_compat_valid \
        || die "installed legacy health compatibility bundle is invalid; run bootstrap.sh"
elif current_runtime_requires_legacy_compat; then
    die "legacy runtime requires its fingerprint-pinned compatibility bundle; run bootstrap.sh"
fi
if [[ -e "$DATA_ROOT/backups/.backup-in-progress" \
    || -e "$DATA_ROOT/backups/.deploy-in-progress" \
    || -e "$DATA_ROOT/backups/.restore-in-progress" ]]; then
    log "resolving an interrupted maintenance marker before any deployment change"
    flock -u 8
    systemctl start iuin-backup-recover.service || true
    flock -w 1800 8 || die "timed out reacquiring deployment lock after backup recovery"
    [[ ! -e "$DATA_ROOT/backups/.backup-in-progress" \
        && ! -e "$DATA_ROOT/backups/.deploy-in-progress" \
        && ! -e "$DATA_ROOT/backups/.restore-in-progress" ]] \
        || die "an interrupted maintenance marker remains; refusing to modify containers"
fi

activation_staging=
activation_link_tmp=
activation_release=
build_context_archive=
build_context_archive_sha256=
deployment_complete=false
deploy_marker="$DATA_ROOT/backups/.deploy-in-progress"
cleanup() {
    rc=$?
    trap - EXIT INT TERM
    set +e
    [[ -z "$activation_link_tmp" ]] || rm -f -- "$activation_link_tmp"
    [[ -z "$activation_staging" || ! -d "$activation_staging" ]] || rm -rf -- "$activation_staging"
    [[ -z "$build_context_archive" ]] || rm -f -- "$build_context_archive"
    if (( rc != 0 )) && [[ "$deployment_complete" != true ]]; then
        if [[ -e "$deploy_marker" ]]; then
            log "deployment failed; invoking persistent container recovery"
            flock -u 8 >/dev/null 2>&1 || true
            systemctl start iuin-backup-recover.service || \
                log "deployment recovery failed; marker retained at $deploy_marker"
        fi
    elif (( rc != 0 )) && [[ "$deployment_complete" == true ]]; then
        log "post-activation finalization failed; invoking recovery only for stale fence cleanup"
        flock -u 8 >/dev/null 2>&1 || true
        systemctl start iuin-backup-recover.service \
            || log "post-activation cleanup failed; the new deployment remains the committed runtime"
    fi
    exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

unique_service_id() {
    local service=$1 ids count
    ids=$(docker ps --all --no-trunc --quiet \
        --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
        --filter "label=com.docker.compose.service=$service") \
        || die "failed to enumerate $service containers"
    count=$(wc -w <<< "$ids")
    [[ "$count" -le 1 ]] || die "multiple containers claim service $service"
    printf '%s\n' "$ids"
}

write_deploy_marker() {
    local phase=$1 marker_tmp="$deploy_marker.tmp.$$" service id full_id image_ref image_id config_hash key
    {
        printf 'format=1\n'
        printf 'phase=%s\n' "$phase"
        printf 'created_utc=%s\n' "$(date -u +'%Y%m%dT%H%M%SZ')"
        printf 'git_commit=%s\n' "$BUILD_HASH"
        printf 'activation_id=%s\n' "$activation_id"
        printf 'previous_runtime=%s\n' "$previous_runtime"
        printf 'previous_release=%s\n' "$previous_release"
        for service in postgres minio mailpit iuin-server; do
            id=$(unique_service_id "$service")
            full_id=
            image_ref=
            image_id=
            config_hash=
            if [[ -n "$id" ]]; then
                full_id=$(docker inspect --format '{{.Id}}' "$id")
                image_ref=$(docker inspect --format '{{.Config.Image}}' "$id")
                image_id=$(docker inspect --format '{{.Image}}' "$id")
                config_hash=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$id")
                [[ "$full_id" =~ ^[a-f0-9]{64}$ && "$image_id" =~ ^sha256:[a-f0-9]{64}$ \
                    && "$config_hash" =~ ^[a-f0-9]{64}$ && -n "$image_ref" \
                    && "$image_ref" != *[[:space:]]* ]] \
                    || die "cannot record a valid previous $service container identity"
            fi
            key=${service//-/_}
            [[ "$key" == iuin_server ]] && key=server
            printf '%s_id=%s\n' "$key" "$full_id"
            printf '%s_image_ref=%s\n' "$key" "$image_ref"
            printf '%s_image_id=%s\n' "$key" "$image_id"
            printf '%s_config_hash=%s\n' "$key" "$config_hash"
        done
    } > "$marker_tmp"
    chmod 0600 "$marker_tmp"
    sync -f "$marker_tmp"
    mv -f -- "$marker_tmp" "$deploy_marker"
    sync -f "$DATA_ROOT/backups"
}

maintenance_forward_chain=IUIN-RESTORE
maintenance_output_chain=IUIN-RESTORE-OUT

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

maintenance_fence_complete() {
    local spec protocol port
    iptables -w -C DOCKER-USER -j "$maintenance_forward_chain" >/dev/null 2>&1 || return 1
    iptables -w -C OUTPUT -j "$maintenance_output_chain" >/dev/null 2>&1 || return 1
    first_rule_is_jump DOCKER-USER "$maintenance_forward_chain" || return 1
    first_rule_is_jump OUTPUT "$maintenance_output_chain" || return 1
    chain_has_exact_fence_targets "$maintenance_forward_chain" || return 1
    chain_has_exact_fence_targets "$maintenance_output_chain" || return 1
    for spec in tcp:8025 tcp:8065 tcp:8443 udp:8443; do
        protocol=${spec%%:*}
        port=${spec##*:}
        iptables -w -C "$maintenance_forward_chain" -p "$protocol" \
            -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP \
            >/dev/null 2>&1 || return 1
        iptables -w -C "$maintenance_output_chain" -p "$protocol" \
            -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP \
            >/dev/null 2>&1 || return 1
    done
}

apply_maintenance_fence() {
    local spec protocol port
    maintenance_fence_complete && return 0
    if iptables -w -C DOCKER-USER -j "$maintenance_forward_chain" >/dev/null 2>&1 \
        || iptables -w -C OUTPUT -j "$maintenance_output_chain" >/dev/null 2>&1; then
        log "an incomplete active maintenance fence exists; refusing to rebuild it in place"
        return 1
    fi
    for chain in "$maintenance_forward_chain" "$maintenance_output_chain"; do
        iptables -w -N "$chain" 2>/dev/null \
            || iptables -w -n -L "$chain" >/dev/null 2>&1 || return 1
        iptables -w -F "$chain" || return 1
    done
    for spec in tcp:8025 tcp:8065 tcp:8443 udp:8443; do
        protocol=${spec%%:*}
        port=${spec##*:}
        iptables -w -A "$maintenance_forward_chain" -p "$protocol" \
            -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP || return 1
        iptables -w -A "$maintenance_output_chain" -p "$protocol" \
            -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP || return 1
    done
    iptables -w -A "$maintenance_forward_chain" -j RETURN || return 1
    iptables -w -A "$maintenance_output_chain" -j RETURN || return 1
    iptables -w -I OUTPUT 1 -j "$maintenance_output_chain" || return 1
    iptables -w -I DOCKER-USER 1 -j "$maintenance_forward_chain" || return 1
    maintenance_fence_complete
}

remove_maintenance_fence() {
    local base chain
    for base_and_chain in "DOCKER-USER:$maintenance_forward_chain" "OUTPUT:$maintenance_output_chain"; do
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

deployment_value() {
    local manifest=$1 key=$2
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$manifest"
}

verify_build_context_archive() {
    [[ -n "$build_context_archive" && -f "$build_context_archive" \
        && ! -L "$build_context_archive" \
        && $(stat --format '%u:%a:%h' "$build_context_archive") == 0:600:1 \
        && "$build_context_archive_sha256" =~ ^[a-f0-9]{64}$ \
        && $(sha256sum "$build_context_archive" | awk '{print $1}') == "$build_context_archive_sha256" ]]
}

previous_runtime_environment_matches() {
    local environment=$1 expected_seed_root=$2
    local expected_data_root=$DATA_ROOT
    local expected_project=$COMPOSE_PROJECT_NAME
    local expected_bind=$BIND_ADDRESS
    local expected_publish_interface=$PUBLISH_INTERFACE
    local expected_lan_cidr=$LAN_CIDR
    local expected_smtp_address=$SMTP_PRIVATE_ADDRESS
    local expected_smtp_subnet=$SMTP_PRIVATE_SUBNET
    local rendered_values
    local -a previous_values

    # Evaluate the immutable shell-format environment in an isolated process so
    # none of its assignments can alter the running deployment state machine.
    # shellcheck disable=SC2016  # Expansion is intentionally deferred to that shell.
    rendered_values=$(/usr/bin/env -i /usr/bin/bash --noprofile --norc -c '
        set -Eeuo pipefail
        source "$1"
        printf "%s\n" \
            "${DATA_ROOT:-/srv/iuin}" \
            "${COMPOSE_PROJECT_NAME:-iuin}" \
            "${BIND_ADDRESS:-10.22.111.16}" \
            "${PUBLISH_INTERFACE:-enp65s0f0}" \
            "${LAN_CIDR:-10.0.0.0/8}" \
            "${SMTP_PRIVATE_ADDRESS:-172.30.0.2}" \
            "${SMTP_PRIVATE_SUBNET:-172.30.0.0/24}" \
            "${IUIN_SEED_ROOT:-}"
    ' previous-runtime-environment "$environment") || return 1
    mapfile -t previous_values <<< "$rendered_values"
    [[ ${#previous_values[@]} -eq 8 \
        && ${previous_values[0]} == "$expected_data_root" \
        && ${previous_values[1]} == "$expected_project" \
        && ${previous_values[2]} == "$expected_bind" \
        && ${previous_values[3]} == "$expected_publish_interface" \
        && ${previous_values[4]} == "$expected_lan_cidr" \
        && ${previous_values[5]} == "$expected_smtp_address" \
        && ${previous_values[6]} == "$expected_smtp_subnet" \
        && ${previous_values[7]} == "$expected_seed_root" ]]
}

compose_service_image() {
    local service=$1
    compose --profile ops config --format json \
        | jq -er --arg service "$service" \
            '.services[$service].image | select(type == "string" and length > 0)'
}

local_image_has_repo_digest() {
    local image_ref=$1 digest=$2 repo_digests
    repo_digests=$(docker image inspect "$image_ref" \
        --format '{{json .RepoDigests}}' 2>/dev/null) || return 1
    jq -e --arg digest "$digest" \
        'any((. // [])[]; endswith("@" + $digest))' <<< "$repo_digests" >/dev/null
}

pull_digest_pinned_image() {
    local label=$1 image_ref=$2 digest
    [[ "$image_ref" != *[[:space:]]* && "$image_ref" =~ @sha256:[a-f0-9]{64}$ ]] \
        || die "$label image is not pinned by an exact sha256 digest"
    digest=${image_ref##*@}
    if ! docker pull --platform linux/amd64 "$image_ref"; then
        local_image_has_repo_digest "$image_ref" "$digest" \
            || die "$label pull failed and the exact digest is not available locally"
        log "$label registry pull failed; using the already-verified local digest"
    fi
    local_image_has_repo_digest "$image_ref" "$digest" \
        || die "$label local image identity does not match its pinned digest"
}

validate_previous_runtime() {
    local runtime=$1 manifest service ids count id expected_id expected_image expected_config
    local project_label service_label image_id config_hash restart_policy timeout
    local file_and_key runtime_file hash_key expected_hash expected_seed_hash
    local file_and_mode mode unexpected_seed canonical_runtime
    canonical_runtime=$(readlink -f -- "$runtime") \
        || die "previous immutable runtime path cannot be resolved"
    manifest="$runtime/deployment.manifest"
    [[ "$canonical_runtime" == "$runtime" \
        && $(dirname -- "$runtime") == /opt/iuin/deploy/releases \
        && -d "$runtime" && ! -L "$runtime" \
        && $(stat --format '%u:%g:%a' /opt /opt/iuin /opt/iuin/deploy /opt/iuin/deploy/releases "$runtime" \
            | tr '\n' ' ') == '0:0:755 0:0:755 0:0:755 0:0:755 0:0:755 ' \
        && -s "$manifest" && ! -L "$manifest" \
        && $(stat --format '%u:%g:%a:%h' "$manifest") == 0:0:644:1 ]] \
        || die "previous immutable runtime is not a root-owned release directory"
    [[ $(deployment_value "$manifest" format) == 1 \
        && $(deployment_value "$manifest" git_commit) =~ ^[a-f0-9]{40,64}$ \
        && $(deployment_value "$manifest" activation_id) =~ ^[a-f0-9]{32}$ ]] \
        || die "previous immutable deployment manifest is invalid"
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
        [[ -f "$runtime/$runtime_file" && ! -L "$runtime/$runtime_file" \
            && $(stat --format '%u' "$runtime/$runtime_file") == 0 \
            && "$expected_hash" =~ ^[a-f0-9]{64}$ \
            && $(sha256sum "$runtime/$runtime_file" | awk '{print $1}') == "$expected_hash" ]] \
            || die "previous immutable runtime hash differs for $runtime_file"
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
            || die "previous immutable runtime permissions differ for $runtime_file"
    done
    expected_seed_hash=$(deployment_value "$manifest" seed_sha256)
    unexpected_seed=$(find "$runtime/seed" -mindepth 1 \
        \( ! -user root -o ! -group root -o -perm /022 \) -print -quit 2>/dev/null) \
        || die "previous immutable runtime seed cannot be inspected"
    [[ "$expected_seed_hash" =~ ^[a-f0-9]{64}$ \
        && $(stat --format '%u:%g:%a' "$runtime/seed") == 0:0:755 \
        && -z "$unexpected_seed" \
        && -s "$runtime/seed/profile/honors/achievements/achv_profile_anchor/icon.png" \
        && $(immutable_seed_hash "$runtime/seed") == "$expected_seed_hash" ]] \
        || die "previous immutable runtime seed hash differs"
    previous_runtime_environment_matches "$runtime/production.env" "$runtime/seed" \
        || die "previous runtime recovery-critical environment differs from the current deployment"
    for service in postgres minio mailpit iuin-server; do
        ids=$(docker ps --all --no-trunc --quiet \
            --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
            --filter "label=com.docker.compose.service=$service")
        count=$(wc -w <<< "$ids")
        [[ "$count" -eq 1 ]] || die "previous deployment must have exactly one $service container"
        id=$ids
        expected_id=$(deployment_container_field "$manifest" "$service" id)
        expected_image=$(deployment_container_field "$manifest" "$service" image_id)
        expected_config=$(deployment_container_field "$manifest" "$service" config_hash)
        project_label=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$id")
        service_label=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$id")
        image_id=$(docker inspect --format '{{.Image}}' "$id")
        config_hash=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$id")
        restart_policy=$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$id")
        [[ "$expected_id" =~ ^[a-f0-9]{64}$ && "$id" == "$expected_id" \
            && "$expected_image" =~ ^sha256:[a-f0-9]{64}$ && "$image_id" == "$expected_image" \
            && "$expected_config" =~ ^[a-f0-9]{64}$ && "$config_hash" == "$expected_config" \
            && "$project_label" == "$COMPOSE_PROJECT_NAME" && "$service_label" == "$service" \
            && "$restart_policy" == unless-stopped ]] \
            || die "live $service container differs from the previous immutable deployment"
        timeout=300
        [[ "$service" == iuin-server ]] && timeout=600
        wait_for_container_health "$id" "$timeout"
    done
}

repo_still_matches_build() {
    [[ $(git -c "safe.directory=$REPO_ROOT" -C "$REPO_ROOT" rev-parse --verify HEAD) == "$BUILD_HASH" \
        && -z $(git -c "safe.directory=$REPO_ROOT" -C "$REPO_ROOT" status --porcelain --untracked-files=normal) ]]
}

publish_backup_runtime() {
    local runtime_root=/opt/iuin/deploy releases deployed_at release_name release
    local spec source_name target_name mode file_and_key runtime_file hash_key expected_hash expected_seed_hash
    local tracked_root
    local service ids count id full_id image_ref image_id config_hash running
    runtime_root=/opt/iuin/deploy
    releases="$runtime_root/releases"
    deployed_at=$(date -u +'%Y%m%dT%H%M%SZ')
    release_name="$BUILD_HASH-$deployed_at-$activation_id"
    release="$releases/$release_name"

    repo_still_matches_build || die "repository changed during image preparation; refusing to publish this build"
    verify_build_context_archive \
        || die "tracked build context archive changed before runtime publication"
    install -d -m 0755 -o root -g root /opt/iuin "$runtime_root" "$releases"
    activation_staging=$(mktemp -d "$releases/.staging.XXXXXX")
    chmod 0755 "$activation_staging"
    tracked_root="$activation_staging/.tracked"
    install -d -m 0700 -o root -g root "$tracked_root"
    tar --extract --file="$build_context_archive" --directory="$tracked_root" \
        deploy/production server/data/profile/honors
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
        install -m "$mode" -o root -g root \
            "$tracked_root/deploy/production/$source_name" "$activation_staging/$target_name"
    done
    install -d -m 0755 -o root -g root "$activation_staging/seed/profile"
    cp -a "$tracked_root/server/data/profile/honors" "$activation_staging/seed/profile/honors"
    [[ -z $(find "$activation_staging/seed" -mindepth 1 ! -type d ! -type f -print -quit) ]] \
        || die "tracked deployment seed contains a non-regular entry"
    chown -R root:root "$activation_staging/seed"
    find "$activation_staging/seed" -type d -exec chmod 0755 {} +
    find "$activation_staging/seed" -type f -exec chmod 0644 {} +
    rm -rf -- "$tracked_root"
    [[ -s "$activation_staging/seed/profile/honors/achievements/achv_profile_anchor/icon.png" ]] \
        || die "tracked deployment seed is incomplete"
    sed '/^IUIN_SEED_ROOT=/d' "$ENV_FILE" > "$activation_staging/production.env"
    printf '\nIUIN_SEED_ROOT=%s/seed\n' "$release" >> "$activation_staging/production.env"
    chown root:root "$activation_staging/production.env"
    chmod 0600 "$activation_staging/production.env"

    {
        printf 'format=1\n'
        printf 'deployed_utc=%s\n' "$deployed_at"
        printf 'git_commit=%s\n' "$BUILD_HASH"
        printf 'activation_id=%s\n' "$activation_id"
        printf 'seed_sha256=%s\n' "$(immutable_seed_hash "$activation_staging/seed")"
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
            printf '%s=%s\n' "$hash_key" "$(sha256sum "$activation_staging/$runtime_file" | awk '{print $1}')"
        done
        for service in postgres minio mailpit iuin-server; do
            ids=$(docker ps --all --no-trunc --quiet \
                --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
                --filter "label=com.docker.compose.service=$service")
            count=$(wc -w <<< "$ids")
            [[ "$count" -eq 1 ]] || die "cannot publish runtime without exactly one $service container"
            id=$ids
            running=$(docker inspect --format '{{.State.Running}}' "$id")
            [[ "$running" == false ]] || die "runtime receipt must be published before $service starts"
            full_id=$(docker inspect --format '{{.Id}}' "$id")
            image_ref=$(docker inspect --format '{{.Config.Image}}' "$id")
            image_id=$(docker inspect --format '{{.Image}}' "$id")
            config_hash=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$id")
            [[ "$full_id" =~ ^[a-f0-9]{64}$ && "$image_id" =~ ^sha256:[a-f0-9]{64}$ \
                && "$config_hash" =~ ^[a-f0-9]{64}$ && -n "$image_ref" \
                && "$image_ref" != *[[:space:]]* ]] \
                || die "cannot publish runtime with an invalid $service container identity"
            printf 'container=%s id=%s image_ref=%s image_id=%s config_hash=%s\n' \
                "$service" "$full_id" "$image_ref" "$image_id" "$config_hash"
        done
    } > "$activation_staging/deployment.manifest"
    chmod 0644 "$activation_staging/deployment.manifest"

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
        expected_hash=$(deployment_value "$activation_staging/deployment.manifest" "$hash_key")
        [[ "$expected_hash" =~ ^[a-f0-9]{64}$ \
            && -f "$activation_staging/$runtime_file" && ! -L "$activation_staging/$runtime_file" \
            && $(stat --format '%u:%h' "$activation_staging/$runtime_file") == 0:1 \
            && $(sha256sum "$activation_staging/$runtime_file" | awk '{print $1}') == "$expected_hash" ]] \
            || die "staged runtime self-check failed for $runtime_file"
    done
    expected_seed_hash=$(deployment_value "$activation_staging/deployment.manifest" seed_sha256)
    [[ "$expected_seed_hash" =~ ^[a-f0-9]{64}$ \
        && $(immutable_seed_hash "$activation_staging/seed") == "$expected_seed_hash" ]] \
        || die "staged runtime seed self-check failed"
    repo_still_matches_build || die "repository changed before runtime publication"
    systemctl is-enabled --quiet iuin-backup-recover.service
    systemctl is-enabled --quiet iuin-backup.timer
    systemctl is-enabled --quiet iuin-docker-firewall-pre.service
    systemctl is-active --quiet iuin-backup.timer

    sync -f "$activation_staging"
    mv -T -- "$activation_staging" "$release"
    activation_staging=
    sync -f "$releases"
    activation_link_tmp="$runtime_root/.current.$BUILD_HASH.$$"
    ln -s "$release" "$activation_link_tmp"
    mv -Tf -- "$activation_link_tmp" "$runtime_root/current"
    activation_link_tmp=
    sync -f "$runtime_root"
    activation_release=$release
    rm -f -- "$build_context_archive"
    build_context_archive=
    build_context_archive_sha256=
    log "published immutable activation receipt before service startup: $release"
}

activation_compose() {
    docker compose \
        --project-directory "$activation_release" \
        --env-file "$activation_release/production.env" \
        --file "$activation_release/compose.yaml" \
        "$@"
}

maintenance_compose() {
    IUIN_RESTART_POLICY=no docker compose \
        --project-directory "${IUIN_PROJECT_DIRECTORY:-$SCRIPT_DIR}" \
        --env-file "$ENV_FILE" \
        --file "$SCRIPT_DIR/compose.yaml" \
        "$@"
}

run_activation_script() {
    local script=$1
    shift
    ENV_FILE="$activation_release/production.env" \
    IUIN_PROJECT_DIRECTORY="$activation_release" \
        /usr/bin/bash "$activation_release/$script" "$@"
}

fail_close_activation() {
    local service id failed=false
    for service in iuin-server minio mailpit; do
        id=$(deployment_container_field "$activation_release/deployment.manifest" "$service" id)
        [[ "$id" =~ ^[a-f0-9]{64}$ ]] || { failed=true; continue; }
        docker update --restart=no "$id" >/dev/null 2>&1 || failed=true
        docker stop --time 120 "$id" >/dev/null 2>&1 || true
        [[ $(docker inspect --format '{{.State.Running}}' "$id" 2>/dev/null) == false ]] || failed=true
    done
    [[ "$failed" == false ]]
}

finalize_backup_runtime() {
    local service id
    for service in postgres minio mailpit iuin-server; do
        id=$(deployment_container_field "$activation_release/deployment.manifest" "$service" id)
        [[ "$id" =~ ^[a-f0-9]{64}$ ]] || die "activation manifest is missing $service identity"
        docker update --restart=unless-stopped "$id" >/dev/null
        [[ $(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$id") == unless-stopped ]] \
            || die "failed to finalize restart policy for $service"
    done
    remove_maintenance_fence
    if ! run_activation_script health.sh; then
        if apply_maintenance_fence; then
            log "full health failed; the committed activation was fenced for recovery"
        else
            fail_close_activation || log "CRITICAL: activation could not be completely fail-closed"
        fi
        return 1
    fi
    rm -f -- "$deploy_marker"
    sync -f "$DATA_ROOT/backups"
    deployment_complete=true
    flock -u 8
    log "activated immutable backup runtime: $activation_release"
}

export BUILD_HASH
BUILD_HASH=$(git -c "safe.directory=$REPO_ROOT" -C "$REPO_ROOT" rev-parse --verify HEAD)
[[ -z "$(git -c "safe.directory=$REPO_ROOT" -C "$REPO_ROOT" status --porcelain --untracked-files=normal)" ]] \
    || die "refusing to deploy a dirty Git worktree; commit or remove all tracked and untracked changes first"
activation_id=$(openssl rand -hex 16)
[[ "$activation_id" =~ ^[a-f0-9]{32}$ ]] || die "failed to generate a deployment activation ID"
previous_runtime=false
previous_release=
if [[ -L /opt/iuin/deploy/current ]]; then
    previous_release=$(readlink -f -- /opt/iuin/deploy/current)
    [[ $(dirname -- "$previous_release") == /opt/iuin/deploy/releases \
        && -s "$previous_release/deployment.manifest" ]] \
        || die "active deployment runtime symlink is invalid"
    previous_runtime=true
elif [[ -e /opt/iuin/deploy/current ]]; then
    die "active deployment runtime must be a symlink"
fi
if [[ "$previous_runtime" == true ]]; then
    validate_previous_runtime "$previous_release"
fi

log "validating Compose configuration"
compose config --quiet

log "preloading digest-pinned resident and operations images"
postgres_image=$(compose_service_image postgres)
minio_init_image=$(compose_service_image minio-init)
mailpit_image=$(compose_service_image mailpit)
pull_digest_pinned_image PostgreSQL "$postgres_image"
pull_digest_pinned_image minio-init "$minio_init_image"
pull_digest_pinned_image Mailpit "$mailpit_image"

log "creating a tracked-only build context for the deployment commit"
build_context_archive=$(mktemp /tmp/iuin-build-context.XXXXXX.tar)
git -c "safe.directory=$REPO_ROOT" -C "$REPO_ROOT" archive \
    --format=tar --output="$build_context_archive" "$BUILD_HASH"
build_context_archive_sha256=$(sha256sum "$build_context_archive" | awk '{print $1}')
verify_build_context_archive || die "failed to create a protected tracked build context archive"
server_image=${SERVER_IMAGE:-iuin-server:11.8.3}
minio_image=${MINIO_IMAGE:-iuin-minio:RELEASE.2025-10-15T17-29-55Z}
[[ -n "$server_image" && "$server_image" != *[[:space:]]* \
    && -n "$minio_image" && "$minio_image" != *[[:space:]]* ]] \
    || die "local build image names are invalid"
log "building the Team server from the tracked commit archive"
verify_build_context_archive || die "tracked build context archive changed before the server build"
docker buildx build --pull --load \
    --tag "$server_image" \
    --build-arg "BUILD_HASH=$BUILD_HASH" \
    --file deploy/production/Dockerfile - < "$build_context_archive"
log "building the fixed MinIO source release from the tracked commit archive"
verify_build_context_archive || die "tracked build context archive changed before the MinIO build"
docker buildx build --pull --load \
    --tag "$minio_image" \
    --file deploy/production/Dockerfile.minio - < "$build_context_archive"

repo_still_matches_build \
    || die "repository changed during image builds; refusing to enter maintenance"
verify_build_context_archive \
    || die "tracked build context archive changed before entering maintenance"
write_deploy_marker preparing
apply_maintenance_fence
for service in postgres minio mailpit iuin-server; do
    existing_id=$(unique_service_id "$service")
    [[ -z "$existing_id" ]] || docker update --restart=no "$existing_id" >/dev/null
done

mail_network="${COMPOSE_PROJECT_NAME}_mail"
recreate_mail_network=false
if docker network inspect "$mail_network" >/dev/null 2>&1; then
    existing_mail_bridge=$(docker network inspect --format \
        '{{index .Options "com.docker.network.bridge.name"}}' "$mail_network")
    existing_mail_subnet=$(docker network inspect --format \
        '{{range .IPAM.Config}}{{.Subnet}}{{end}}' "$mail_network")
    existing_mail_internal=$(docker network inspect --format '{{.Internal}}' "$mail_network")
    if [[ "$existing_mail_bridge" != br-iuin-mail \
        || "$existing_mail_subnet" != "$SMTP_PRIVATE_SUBNET" \
        || "$existing_mail_internal" != true ]]; then
        recreate_mail_network=true
    fi
fi
compose stop --timeout 120 iuin-server mailpit minio postgres
write_deploy_marker modifying
if [[ "$recreate_mail_network" == true ]]; then
    log "recreating the private SMTP network with its fixed, firewalled bridge identity"
    compose rm --force iuin-server mailpit
    docker network rm "$mail_network" >/dev/null
fi

log "creating all four resident containers without starting them"
maintenance_compose up --no-start --pull never postgres minio mailpit iuin-server
postgres_id=$(unique_service_id postgres)
minio_id=$(unique_service_id minio)
mailpit_id=$(unique_service_id mailpit)
server_id=$(unique_service_id iuin-server)
for service_and_id in \
    "postgres:$postgres_id" "minio:$minio_id" "mailpit:$mailpit_id" "iuin-server:$server_id"; do
    [[ "${service_and_id#*:}" =~ ^[a-f0-9]{12,64}$ ]] \
        || die "failed to create ${service_and_id%%:*} container"
    docker update --restart=no "${service_and_id#*:}" >/dev/null
done
systemctl restart iuin-docker-firewall.service
publish_backup_runtime
write_deploy_marker committed

log "starting PostgreSQL, MinIO, and Mailpit under the maintenance fence"
docker start "$postgres_id" "$minio_id" "$mailpit_id" >/dev/null
wait_for_container_health "$postgres_id" 300
wait_for_container_health "$minio_id" 300
wait_for_container_health "$mailpit_id" 300

log "creating the private MinIO bucket and least-privilege application user"
activation_compose --profile ops run --rm --no-deps --pull never minio-init init

log "starting IUIN server and integrated Calls"
docker start "$server_id" >/dev/null
wait_for_container_health "$server_id" 600

run_activation_script create-admin.sh
run_activation_script health.sh --internal

runtime_build_hash=$(docker exec "$server_id" /mattermost/bin/mattermost version 2>/dev/null \
    | awk -F': ' '$1 == "Build Hash" { print $2; exit }')
[[ "$runtime_build_hash" == "$BUILD_HASH" ]] || die "running Mattermost build hash does not match deployment commit"
finalize_backup_runtime

trap - EXIT INT TERM

log "deployment complete: $SITE_URL"
log "the initial administrator password remains at $DATA_ROOT/secrets/admin_initial_password (mode 0600)"
