#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATA_ROOT:?DATA_ROOT is required}"
(( EUID == 0 )) || { echo "must run as root" >&2; exit 1; }
[[ "$DATA_ROOT" == /* && -d "$DATA_ROOT/backups" ]] \
    || { echo "invalid backup root" >&2; exit 1; }

exec 9>"$DATA_ROOT/backups/.backup.lock"
flock -n 9 || { echo "another backup, restore, or deployment is running" >&2; exit 1; }

release=$(readlink -f -- /opt/iuin/deploy/current)
[[ -L /opt/iuin/deploy/current \
    && $(stat --format '%u:%g' /opt/iuin/deploy/current) == 0:0 \
    && $(dirname -- "$release") == /opt/iuin/deploy/releases \
    && -d "$release" && ! -L "$release" \
    && $(stat --format '%u:%g:%a' /opt /opt/iuin /opt/iuin/deploy /opt/iuin/deploy/releases "$release" \
        | tr '\n' ' ') == '0:0:755 0:0:755 0:0:755 0:0:755 0:0:755 ' \
    && -f "$release/deployment.manifest" && ! -L "$release/deployment.manifest" \
    && $(stat --format '%u:%g:%a:%h' "$release/deployment.manifest") == 0:0:644:1 ]] \
    || { echo "active immutable backup runtime is invalid" >&2; exit 1; }

manifest_value() {
    local key=$1
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' \
        "$release/deployment.manifest"
}

immutable_seed_hash() {
    local root=$1 unexpected
    [[ -d "$root" && ! -L "$root" ]] || return 1
    unexpected=$(find "$root" -mindepth 1 ! -type d ! -type f -print -quit)
    [[ -z "$unexpected" ]] || return 1
    LC_ALL=C tar --sort=name --mtime='UTC 1970-01-01' \
        --owner=0 --group=0 --numeric-owner --format=gnu \
        --create --file=- --directory="$root" . \
        | sha256sum | awk '{print $1}'
}

deployment_format=$(manifest_value format)
case "$deployment_format" in
    1) deployment_services=(postgres minio mailpit iuin-server) ;;
    2) deployment_services=(postgres minio mailpit iuin-server gateway) ;;
    *) echo "active deployment manifest has an unsupported format" >&2; exit 1 ;;
esac
[[ $(manifest_value git_commit) =~ ^[a-f0-9]{40,64}$ \
    && $(manifest_value activation_id) =~ ^[a-f0-9]{32}$ ]] \
    || { echo "active deployment manifest metadata is invalid" >&2; exit 1; }
awk -F= 'NF < 2 || ($1 != "container" && seen[$1]++) { exit 1 }' \
    "$release/deployment.manifest" \
    || { echo "active deployment manifest has malformed or duplicate fields" >&2; exit 1; }
[[ $(grep -c '^container=' "$release/deployment.manifest") -eq ${#deployment_services[@]} ]] \
    || { echo "active deployment manifest has an invalid container receipt count for format $deployment_format" >&2; exit 1; }
for service in "${deployment_services[@]}"; do
    [[ $(grep -Ec "^container=$service id=[a-f0-9]{64} image_ref=[^[:space:]]+ image_id=sha256:[a-f0-9]{64} config_hash=[a-f0-9]{64}$" \
        "$release/deployment.manifest") -eq 1 ]] \
        || { echo "active deployment manifest is missing a valid $service container receipt" >&2; exit 1; }
done
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
    expected_hash=$(manifest_value "$hash_key")
    [[ "$expected_hash" =~ ^[a-f0-9]{64}$ \
        && -f "$release/$runtime_file" && ! -L "$release/$runtime_file" \
        && $(stat --format '%u:%h' "$release/$runtime_file") == 0:1 \
        && $(sha256sum "$release/$runtime_file" | awk '{print $1}') == "$expected_hash" ]] \
        || { echo "active immutable runtime hash is invalid for $runtime_file" >&2; exit 1; }
done
for file_and_mode in \
    'backup.sh:755' 'restore.sh:755' 'lib.sh:755' 'compose.yaml:644' \
    'production.env:600' 'health.sh:755' 'minio-ops.sh:755' \
    'create-admin.sh:755' 'recover-containers.sh:755' 'docker-firewall.sh:755' \
    'iuin-backup-recover.service:644' 'iuin-docker-firewall-pre.service:644' \
    'iuin-docker-firewall.service:644'; do
    runtime_file=${file_and_mode%%:*}
    mode=${file_and_mode##*:}
    [[ $(stat --format '%u:%g:%a:%h' "$release/$runtime_file") == "0:0:$mode:1" ]] \
        || { echo "active immutable runtime permissions are invalid for $runtime_file" >&2; exit 1; }
done
awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/ && seen[$1]++ { exit 1 }' "$release/production.env" \
    || { echo "active runtime environment has duplicate assignments" >&2; exit 1; }
configured_data_root=$(awk -F= '$1 == "DATA_ROOT" { sub(/^[^=]*=/, ""); print; exit }' \
    "$release/production.env")
[[ "$configured_data_root" == "$DATA_ROOT" ]] \
    || { echo "active runtime DATA_ROOT does not match the held maintenance lock" >&2; exit 1; }
configured_seed_root=$(awk -F= '$1 == "IUIN_SEED_ROOT" { sub(/^[^=]*=/, ""); print; exit }' \
    "$release/production.env")
expected_seed_hash=$(manifest_value seed_sha256)
unexpected_seed=$(find "$release/seed" -mindepth 1 \
    \( ! -user root -o ! -group root -o -perm /022 \) -print -quit 2>/dev/null) \
    || { echo "active immutable runtime seed cannot be inspected" >&2; exit 1; }
[[ "$configured_seed_root" == "$release/seed" \
    && "$expected_seed_hash" =~ ^[a-f0-9]{64}$ \
    && $(stat --format '%u:%g:%a' "$release/seed") == 0:0:755 \
    && -z "$unexpected_seed" \
    && -s "$release/seed/profile/honors/achievements/achv_profile_anchor/icon.png" \
    && $(immutable_seed_hash "$release/seed") == "$expected_seed_hash" ]] \
    || { echo "active immutable runtime seed is invalid" >&2; exit 1; }
[[ $(readlink -f -- /opt/iuin/deploy/current) == "$release" ]] \
    || { echo "active runtime changed during validation" >&2; exit 1; }

exec /usr/bin/env \
    IUIN_HELD_MAINTENANCE_LOCK=1 \
    "ENV_FILE=$release/production.env" \
    "IUIN_DEPLOYMENT_MANIFEST=$release/deployment.manifest" \
    /usr/bin/bash "$release/backup.sh" "$@"
