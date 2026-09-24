#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_PATH=$(readlink -f -- "${BASH_SOURCE[0]}")
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd -P)
active_runtime=/opt/iuin/deploy/current
if [[ "$SCRIPT_DIR" != /opt/iuin/deploy/releases/* \
    && ( -e "$active_runtime" || -L "$active_runtime" ) ]]; then
    [[ -L "$active_runtime" ]] \
        || { echo "active deployment runtime must be a symlink" >&2; exit 1; }
    active_release=$(readlink -f -- "$active_runtime") \
        || { echo "active deployment runtime symlink is invalid" >&2; exit 1; }
    active_restore=$(readlink -f -- "$active_runtime/restore.sh") \
        || { echo "active immutable restore entrypoint is invalid" >&2; exit 1; }
    active_manifest="$active_release/deployment.manifest"
    active_restore_hash=$(awk -F= '$1 == "restore_sha256" { sub(/^[^=]*=/, ""); print; exit }' \
        "$active_manifest" 2>/dev/null || true)
    [[ $(stat --format '%u:%g' "$active_runtime") == 0:0 \
        && $(dirname -- "$active_release") == /opt/iuin/deploy/releases \
        && -d "$active_release" && ! -L "$active_release" \
        && $(stat --format '%u:%g:%a' /opt /opt/iuin /opt/iuin/deploy /opt/iuin/deploy/releases "$active_release" \
            | tr '\n' ' ') == '0:0:755 0:0:755 0:0:755 0:0:755 0:0:755 ' \
        && -f "$active_manifest" && ! -L "$active_manifest" \
        && $(stat --format '%u:%g:%a:%h' "$active_manifest") == 0:0:644:1 \
        && "$active_restore" == "$active_release/restore.sh" \
        && -x "$active_restore" && ! -L "$active_restore" \
        && $(stat --format '%u:%g:%a:%h' "$active_restore") == 0:0:755:1 \
        && "$active_restore_hash" =~ ^[a-f0-9]{64}$ \
        && $(sha256sum "$active_restore" | awk '{print $1}') == "$active_restore_hash" ]] \
        || { echo "active immutable restore entrypoint is missing or outside the release root" >&2; exit 1; }
    exec /usr/bin/env \
        "ENV_FILE=$active_release/production.env" \
        "IUIN_PROJECT_DIRECTORY=$active_release" \
        /usr/bin/bash "$active_restore" "$@"
fi
if [[ "$SCRIPT_DIR" == /opt/iuin/deploy/releases/* ]]; then
    export ENV_FILE="$SCRIPT_DIR/production.env"
    export IUIN_PROJECT_DIRECTORY="$SCRIPT_DIR"
fi

active_manifest_value() {
    local manifest=$1 key=$2
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$manifest"
}

active_immutable_seed_hash() {
    local root=$1 unexpected
    [[ -d "$root" && ! -L "$root" ]] || return 1
    unexpected=$(find "$root" -mindepth 1 ! -type d ! -type f -print -quit)
    [[ -z "$unexpected" ]] || return 1
    LC_ALL=C tar --sort=name --mtime='UTC 1970-01-01' \
        --owner=0 --group=0 --numeric-owner --format=gnu \
        --create --file=- --directory="$root" . \
        | sha256sum | awk '{print $1}'
}

validate_active_release_runtime() {
    local manifest="$SCRIPT_DIR/deployment.manifest"
    local current_release file_and_key runtime_file hash_key expected_hash
    local configured_seed_root expected_seed_hash file_and_mode mode unexpected_seed
    local deployment_format service
    local -a deployment_services

    [[ -L "$active_runtime" ]] \
        || { echo "active deployment runtime must be a symlink" >&2; exit 1; }
    current_release=$(readlink -f -- "$active_runtime") \
        || { echo "active deployment runtime symlink is invalid" >&2; exit 1; }
    [[ "$current_release" == "$SCRIPT_DIR" \
        && $(dirname -- "$SCRIPT_DIR") == /opt/iuin/deploy/releases \
        && -d "$SCRIPT_DIR" && ! -L "$SCRIPT_DIR" \
        && $(stat --format '%u:%g:%a' /opt /opt/iuin /opt/iuin/deploy /opt/iuin/deploy/releases "$SCRIPT_DIR" \
            | tr '\n' ' ') == '0:0:755 0:0:755 0:0:755 0:0:755 0:0:755 ' \
        && -f "$manifest" && ! -L "$manifest" \
        && $(stat --format '%u:%g:%a:%h' "$manifest") == 0:0:644:1 ]] \
        || { echo "active immutable restore runtime is invalid" >&2; exit 1; }
    deployment_format=$(active_manifest_value "$manifest" format)
    case "$deployment_format" in
        1) deployment_services=(postgres minio mailpit iuin-server) ;;
        2) deployment_services=(postgres minio mailpit iuin-server gateway) ;;
        *) echo "active deployment manifest has an unsupported format" >&2; exit 1 ;;
    esac
    [[ $(active_manifest_value "$manifest" git_commit) =~ ^[a-f0-9]{40,64}$ \
        && $(active_manifest_value "$manifest" activation_id) =~ ^[a-f0-9]{32}$ ]] \
        || { echo "active deployment manifest metadata is invalid" >&2; exit 1; }
    awk -F= 'NF < 2 || ($1 != "container" && seen[$1]++) { exit 1 }' "$manifest" \
        || { echo "active deployment manifest has malformed or duplicate fields" >&2; exit 1; }
    [[ $(grep -c '^container=' "$manifest") -eq ${#deployment_services[@]} ]] \
        || { echo "active deployment manifest has an invalid container receipt count for format $deployment_format" >&2; exit 1; }
    for service in "${deployment_services[@]}"; do
        [[ $(grep -Ec "^container=$service id=[a-f0-9]{64} image_ref=[^[:space:]]+ image_id=sha256:[a-f0-9]{64} config_hash=[a-f0-9]{64}$" \
            "$manifest") -eq 1 ]] \
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
        expected_hash=$(active_manifest_value "$manifest" "$hash_key")
        [[ "$expected_hash" =~ ^[a-f0-9]{64}$ \
            && -f "$SCRIPT_DIR/$runtime_file" && ! -L "$SCRIPT_DIR/$runtime_file" \
            && $(stat --format '%u:%h' "$SCRIPT_DIR/$runtime_file") == 0:1 \
            && $(sha256sum "$SCRIPT_DIR/$runtime_file" | awk '{print $1}') == "$expected_hash" ]] \
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
        [[ $(stat --format '%u:%g:%a:%h' "$SCRIPT_DIR/$runtime_file") == "0:0:$mode:1" ]] \
            || { echo "active immutable runtime permissions are invalid for $runtime_file" >&2; exit 1; }
    done
    awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/ && seen[$1]++ { exit 1 }' \
        "$SCRIPT_DIR/production.env" \
        || { echo "active runtime environment has duplicate assignments" >&2; exit 1; }
    configured_seed_root=$(active_manifest_value "$SCRIPT_DIR/production.env" IUIN_SEED_ROOT)
    expected_seed_hash=$(active_manifest_value "$manifest" seed_sha256)
    unexpected_seed=$(find "$SCRIPT_DIR/seed" -mindepth 1 \
        \( ! -user root -o ! -group root -o -perm /022 \) -print -quit 2>/dev/null) \
        || { echo "active immutable runtime seed cannot be inspected" >&2; exit 1; }
    [[ "$configured_seed_root" == "$SCRIPT_DIR/seed" \
        && "$expected_seed_hash" =~ ^[a-f0-9]{64}$ \
        && $(stat --format '%u:%g:%a' "$SCRIPT_DIR/seed") == 0:0:755 \
        && -z "$unexpected_seed" \
        && -s "$SCRIPT_DIR/seed/profile/honors/achievements/achv_profile_anchor/icon.png" \
        && $(active_immutable_seed_hash "$SCRIPT_DIR/seed") == "$expected_seed_hash" ]] \
        || { echo "active immutable runtime seed is invalid" >&2; exit 1; }
    [[ $(readlink -f -- "$active_runtime") == "$SCRIPT_DIR" ]] \
        || { echo "active runtime changed during validation" >&2; exit 1; }
}

if [[ "$SCRIPT_DIR" == /opt/iuin/deploy/releases/* ]]; then
    validate_active_release_runtime
fi
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
require_root
load_env
require_compose
umask 077

[[ $# == 2 && ( $2 == --confirm-restore || $2 == --verify-only || $2 == --recover-interrupted ) ]] \
    || die "usage: sudo $0 BACKUP_DIRECTORY {--verify-only|--confirm-restore|--recover-interrupted}"
restore_mode=$2

backup_dir=$(realpath -- "$1")
case "$backup_dir" in
    "$DATA_ROOT/backups"/*) ;;
    *) die "backup must be below $DATA_ROOT/backups" ;;
esac
if [[ "$restore_mode" != --verify-only && "${IUIN_MAINTENANCE_SUPERVISED:-0}" != 1 ]]; then
    run_supervised_maintenance iuin-restore "$SCRIPT_DIR/restore.sh" "$backup_dir" "$restore_mode"
    exit $?
fi

archive_contains_only() {
    local archive=$1
    local required_spec=$2
    shift 2
    local entry canonical ancestor prefix required allowed type_line member_type file_size list_file verbose_file
    local -a required_regular=()
    local -A seen=() regular_seen=() canonical_seen=() canonical_type=() has_descendant=()
    IFS=, read -r -a required_regular <<< "$required_spec"
    for prefix in "$@"; do
        seen["$prefix"]=false
    done
    for required in "${required_regular[@]}"; do
        [[ -n "$required" ]] && regular_seen["$required"]=false
    done

    list_file=$(mktemp)
    verbose_file=$(mktemp)
    if ! tar --list --gzip --file "$archive" > "$list_file" \
        || ! tar --list --verbose --numeric-owner --gzip --file "$archive" > "$verbose_file"; then
        rm -f -- "$list_file" "$verbose_file"
        die "archive is unreadable: $archive"
    fi
    exec 7<"$verbose_file"
    while IFS= read -r entry; do
        IFS= read -r type_line <&7 \
            || { exec 7<&-; rm -f -- "$list_file" "$verbose_file"; die "archive listings disagree: $archive"; }
        member_type=${type_line:0:1}
        case "$member_type" in
            -|d) ;;
            *)
                exec 7<&-
                rm -f -- "$list_file" "$verbose_file"
                die "archive contains a link or special file: $archive"
                ;;
        esac
        entry=${entry#./}
        [[ -n "$entry" ]] \
            || { rm -f -- "$list_file" "$verbose_file"; die "archive contains the extraction root itself: $archive"; }
        [[ "$entry" != /* && "$entry" != ".." && "$entry" != ../* \
            && "$entry" != */../* && "$entry" != */.. \
            && "$entry" != ./* && "$entry" != *//* \
            && "$entry" != */./* && "$entry" != */. \
            && "$entry" != *\\* ]] \
            || { rm -f -- "$list_file" "$verbose_file"; die "unsafe archive path in $archive: $entry"; }
        canonical=${entry%/}
        [[ -n "$canonical" && -z "${canonical_seen[$canonical]+present}" ]] \
            || { rm -f -- "$list_file" "$verbose_file"; die "duplicate archive target in $archive: $entry"; }
        if [[ "$member_type" == - && "${has_descendant[$canonical]:-}" == true ]]; then
            rm -f -- "$list_file" "$verbose_file"
            die "regular archive member contains an existing child: $entry"
        fi
        ancestor=$canonical
        while [[ "$ancestor" == */* ]]; do
            ancestor=${ancestor%/*}
            [[ "${canonical_type[$ancestor]:-}" != - ]] \
                || { rm -f -- "$list_file" "$verbose_file"; die "regular archive member is an ancestor of $entry"; }
            has_descendant["$ancestor"]=true
        done
        canonical_seen["$canonical"]=true
        canonical_type["$canonical"]=$member_type
        allowed=false
        for prefix in "$@"; do
            case "$entry" in
                "$prefix"|"$prefix"/)
                    allowed=true
                    [[ "$member_type" == d ]] && seen["$prefix"]=true
                    break
                    ;;
                "$prefix"/*)
                    allowed=true
                    break
                    ;;
            esac
        done
        [[ "$allowed" == true ]] \
            || { rm -f -- "$list_file" "$verbose_file"; die "unexpected archive path in $archive: $entry"; }
        if [[ "$member_type" == - ]]; then
            file_size=$(awk '{print $3}' <<< "$type_line")
            if [[ "$file_size" =~ ^[0-9]+$ && "$file_size" -gt 0 ]]; then
                for required in "${required_regular[@]}"; do
                    case "$required" in
                        */) [[ "$entry" == "$required"* && "$entry" != "$required" ]] && regular_seen["$required"]=true ;;
                        *) [[ "$entry" == "$required" ]] && regular_seen["$required"]=true ;;
                    esac
                done
            fi
        fi
    done < "$list_file"
    if IFS= read -r type_line <&7; then
        exec 7<&-
        rm -f -- "$list_file" "$verbose_file"
        die "archive listings disagree: $archive"
    fi
    exec 7<&-
    for prefix in "$@"; do
        [[ "${seen[$prefix]}" == true ]] \
            || { rm -f -- "$list_file" "$verbose_file"; die "archive is missing required tree: $prefix"; }
    done
    for required in "${required_regular[@]}"; do
        [[ -z "$required" || "${regular_seen[$required]}" == true ]] \
            || { rm -f -- "$list_file" "$verbose_file"; die "archive is missing required non-empty regular file: $required"; }
    done
    rm -f -- "$list_file" "$verbose_file"
}

manifest_value() {
    local manifest=$1 key=$2
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$manifest"
}

manifest_key_count() {
    local manifest=$1 key=$2
    awk -F= -v key="$key" '$1 == key { count++ } END { print count + 0 }' "$manifest"
}

require_manifest_key_count() {
    local manifest=$1 key=$2 expected=$3
    [[ $(manifest_key_count "$manifest" "$key") -eq $expected ]] \
        || die "manifest has an invalid $key field count"
}

validate_manifest() {
    local directory=$1 include_mailpit=$2 manifest created pre_restore format git_commit source_backup
    local embedded_commit embedded_hash reconstructed service optional_hash optional_hash_key
    local receipt_type recovery_for source_activation
    local deployment_container_line live_container_line
    local expected_deployment_format
    local -a manifest_services
    manifest="$directory/manifest.txt"
    created=$(manifest_value "$manifest" created_utc)
    [[ "$created" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || die "manifest has an invalid created_utc"
    require_manifest_key_count "$manifest" created_utc 1

    pre_restore=$(manifest_value "$manifest" pre_restore)
    if [[ "$pre_restore" == true ]]; then
        [[ "$include_mailpit" == true ]] || die "pre-restore backup must include Mailpit"
        [[ $(wc -l < "$manifest") -eq 3 ]] || die "pre-restore manifest has unexpected fields"
        require_manifest_key_count "$manifest" pre_restore 1
        require_manifest_key_count "$manifest" source_backup 1
        source_backup=$(manifest_value "$manifest" source_backup)
        case "$source_backup" in
            "$DATA_ROOT/backups"/*) ;;
            *) die "pre-restore manifest has an invalid source backup path" ;;
        esac
        return
    fi

    format=$(manifest_value "$manifest" backup_format)
    case "$format" in
        2) expected_deployment_format=1; manifest_services=(postgres minio mailpit iuin-server) ;;
        3) expected_deployment_format=2; manifest_services=(postgres minio mailpit iuin-server gateway) ;;
    esac
    if [[ "$format" == 2 || "$format" == 3 ]]; then
        [[ "$include_mailpit" == true ]] || die "backup format $format must include Mailpit"
        awk -F= '$1 !~ /^(backup_format|created_utc|git_commit|site_url|quiesced|deployment_manifest_sha256|deployment_format|deployment_deployed_utc|deployment_git_commit|deployment_activation_id|deployment_receipt_type|deployment_recovery_for_activation|deployment_source_activation_id|deployment_seed_sha256|deployment_backup_sha256|deployment_restore_sha256|deployment_lib_sha256|deployment_compose_sha256|deployment_environment_sha256|deployment_health_sha256|deployment_minio_ops_sha256|deployment_create_admin_sha256|deployment_recovery_sha256|deployment_firewall_sha256|deployment_recovery_unit_sha256|deployment_firewall_pre_unit_sha256|deployment_firewall_post_unit_sha256|deployment_container|live_container)$/ { exit 1 }' "$manifest" \
            || die "backup format $format manifest contains an unexpected field"
        for service in backup_format created_utc git_commit site_url quiesced deployment_manifest_sha256 \
            deployment_format deployment_deployed_utc deployment_git_commit deployment_activation_id \
            deployment_backup_sha256 deployment_lib_sha256 deployment_compose_sha256 deployment_environment_sha256; do
            require_manifest_key_count "$manifest" "$service" 1
        done
        require_manifest_key_count "$manifest" deployment_container "${#manifest_services[@]}"
        require_manifest_key_count "$manifest" live_container "${#manifest_services[@]}"
        [[ $(manifest_value "$manifest" quiesced) == true ]] || die "backup was not marked quiesced"
        [[ $(manifest_value "$manifest" site_url) =~ ^https?://[^[:space:]]+$ ]] \
            || die "backup format $format manifest has an invalid site_url"
        git_commit=$(manifest_value "$manifest" git_commit)
        embedded_commit=$(manifest_value "$manifest" deployment_git_commit)
        [[ "$git_commit" =~ ^[a-f0-9]{40,64}$ && "$embedded_commit" == "$git_commit" ]] \
            || die "backup format $format manifest has an invalid or inconsistent git_commit"
        [[ $(manifest_value "$manifest" deployment_format) == "$expected_deployment_format" ]] \
            || die "embedded deployment manifest has an unsupported format"
        [[ $(manifest_value "$manifest" deployment_deployed_utc) =~ ^[0-9]{8}T[0-9]{6}Z$ ]] \
            || die "embedded deployment manifest has an invalid timestamp"
        [[ $(manifest_value "$manifest" deployment_activation_id) =~ ^[a-f0-9]{32}$ ]] \
            || die "embedded deployment manifest has an invalid activation ID"
        for service in deployment_manifest_sha256 deployment_backup_sha256 deployment_lib_sha256 \
            deployment_compose_sha256 deployment_environment_sha256; do
            [[ $(manifest_value "$manifest" "$service") =~ ^[a-f0-9]{64}$ ]] \
                || die "manifest has an invalid $service"
        done
        for optional_hash_key in deployment_seed_sha256 deployment_restore_sha256 deployment_health_sha256 \
            deployment_minio_ops_sha256 deployment_create_admin_sha256 deployment_recovery_sha256 \
            deployment_firewall_sha256 deployment_recovery_unit_sha256 \
            deployment_firewall_pre_unit_sha256 deployment_firewall_post_unit_sha256; do
            optional_hash=$(manifest_value "$manifest" "$optional_hash_key")
            if [[ -n "$optional_hash" ]]; then
                require_manifest_key_count "$manifest" "$optional_hash_key" 1
                [[ "$optional_hash" =~ ^[a-f0-9]{64}$ ]] \
                    || die "manifest has an invalid $optional_hash_key"
            else
                require_manifest_key_count "$manifest" "$optional_hash_key" 0
            fi
        done
        receipt_type=$(manifest_value "$manifest" deployment_receipt_type)
        recovery_for=$(manifest_value "$manifest" deployment_recovery_for_activation)
        source_activation=$(manifest_value "$manifest" deployment_source_activation_id)
        case "$receipt_type" in
            '')
                require_manifest_key_count "$manifest" deployment_receipt_type 0
                require_manifest_key_count "$manifest" deployment_recovery_for_activation 0
                require_manifest_key_count "$manifest" deployment_source_activation_id 0
                ;;
            recovery)
                require_manifest_key_count "$manifest" deployment_receipt_type 1
                require_manifest_key_count "$manifest" deployment_recovery_for_activation 1
                require_manifest_key_count "$manifest" deployment_source_activation_id 1
                [[ "$recovery_for" =~ ^[a-f0-9]{32}$ \
                    && "$source_activation" =~ ^[a-f0-9]{32}$ ]] \
                    || die "backup has invalid recovery receipt metadata"
                ;;
            *) die "backup has an invalid deployment receipt type" ;;
        esac
        reconstructed=$(mktemp)
        awk -F= '$1 ~ /^deployment_/ && $1 != "deployment_manifest_sha256" { sub(/^deployment_/, ""); print }' \
            "$manifest" > "$reconstructed"
        embedded_hash=$(sha256sum "$reconstructed" | awk '{print $1}')
        rm -f -- "$reconstructed"
        [[ "$embedded_hash" == "$(manifest_value "$manifest" deployment_manifest_sha256)" ]] \
            || die "embedded deployment manifest hash does not match"
        for service in "${manifest_services[@]}"; do
            grep -Eq "^deployment_container=$service id=[a-f0-9]{64} image_ref=[^[:space:]]+ image_id=sha256:[a-f0-9]{64} config_hash=[a-f0-9]{64}$" "$manifest" \
                || die "embedded deployment manifest is missing a valid $service container"
            grep -Eq "^live_container=$service id=[a-f0-9]{64} image_ref=[^[:space:]]+ image_id=sha256:[a-f0-9]{64} config_hash=[a-f0-9]{64}$" "$manifest" \
                || die "backup manifest is missing a valid live $service container"
            deployment_container_line=$(grep -E "^deployment_container=$service " "$manifest")
            live_container_line=$(grep -E "^live_container=$service " "$manifest")
            [[ "${deployment_container_line#*=}" == "${live_container_line#*=}" ]] \
                || die "live $service identity differs from the embedded deployment receipt"
        done
        return
    fi

    [[ -z "$format" && "$include_mailpit" == false ]] \
        || die "backup does not match the legacy, format 2, or format 3 schema"
    awk -F= '$1 !~ /^(created_utc|git_commit|site_url|quiesced|image)$/ { exit 1 }' "$manifest" \
        || die "legacy manifest contains an unexpected field"
    [[ $(wc -l < "$manifest") -eq 7 ]] || die "legacy manifest has an invalid field count"
    for service in git_commit site_url quiesced; do
        require_manifest_key_count "$manifest" "$service" 1
    done
    require_manifest_key_count "$manifest" image 3
    git_commit=$(manifest_value "$manifest" git_commit)
    [[ "$git_commit" =~ ^[a-f0-9]{40,64}$ ]] || die "legacy manifest has an invalid git_commit"
    [[ $(manifest_value "$manifest" quiesced) == true ]] || die "legacy backup was not marked quiesced"
    [[ $(manifest_value "$manifest" site_url) =~ ^https?://[^[:space:]]+$ ]] \
        || die "legacy manifest has an invalid site_url"
    awk -F= '$1 == "image" && $2 !~ /^[^[:space:]]+$/ { exit 1 }' "$manifest" \
        || die "legacy manifest has an invalid image field"
}

validate_backup() {
    local directory=$1
    local include_mailpit=false file hash name extra last_byte
    local -a expected checksum_names

    for file in SHA256SUMS postgres.dump minio.tar.gz mattermost-runtime.tar.gz manifest.txt; do
        [[ -s "$directory/$file" ]] || die "missing backup file: $file"
    done
    if [[ -e "$directory/mailpit.tar.gz" ]]; then
        [[ -s "$directory/mailpit.tar.gz" ]] || die "Mailpit backup is empty"
        include_mailpit=true
    fi

    expected=(postgres.dump minio.tar.gz mattermost-runtime.tar.gz manifest.txt)
    if [[ "$include_mailpit" == true ]]; then
        expected+=(mailpit.tar.gz)
    fi
    last_byte=$(tail -c 1 "$directory/SHA256SUMS" | od -An -t u1 | tr -d '[:space:]')
    [[ "$last_byte" == 10 ]] || die "SHA256SUMS must end with a newline"
    checksum_names=()
    while read -r hash name extra; do
        [[ -z "${extra:-}" && "$hash" =~ ^[a-f0-9]{64}$ && -n "${name:-}" ]] \
            || die "malformed SHA256SUMS"
        name=${name#\*}
        [[ "$name" != */* ]] || die "SHA256SUMS contains an unsafe filename"
        checksum_names+=("$name")
    done < "$directory/SHA256SUMS"
    [[ ${#checksum_names[@]} -eq ${#expected[@]} ]] || die "SHA256SUMS does not exactly cover the restore payload"
    for file in "${expected[@]}"; do
        printf '%s\n' "${checksum_names[@]}" | grep --fixed-strings --line-regexp --quiet "$file" \
            || die "SHA256SUMS does not cover $file"
    done
    (cd "$directory" && sha256sum --strict --check --status SHA256SUMS) || die "backup checksum validation failed"
    validate_manifest "$directory" "$include_mailpit"
    docker run --rm --interactive --pull never --network none --read-only \
        --user 70:70 --cap-drop ALL --security-opt no-new-privileges:true \
        --tmpfs /tmp:rw,noexec,nosuid,size=16m \
        --entrypoint pg_restore "$postgres_tool_image" --list \
        < "$directory/postgres.dump" >/dev/null \
        || die "PostgreSQL dump catalog is unreadable"
    docker run --rm --interactive --pull never --network none --read-only \
        --user 70:70 --cap-drop ALL --security-opt no-new-privileges:true \
        --tmpfs /tmp:rw,noexec,nosuid,size=16m \
        --entrypoint pg_restore "$postgres_tool_image" --file=/dev/null \
        < "$directory/postgres.dump" >/dev/null \
        || die "PostgreSQL dump data stream is unreadable"
    archive_contains_only "$directory/minio.tar.gz" \
        "minio/.minio.sys/format.json,minio/$MINIO_BUCKET/" minio
    archive_contains_only "$directory/mattermost-runtime.tar.gz" 'mattermost/config/config.json' \
        mattermost/config mattermost/plugins mattermost/client-plugins mattermost/data
    if [[ "$include_mailpit" == true ]]; then
        archive_contains_only "$directory/mailpit.tar.gz" 'mailpit/mailpit.db' mailpit
    fi
    printf '%s\n' "$include_mailpit"
}

unique_service_id() {
    local service=$1 ids count
    ids=$(docker ps --all --no-trunc --quiet \
        --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
        --filter "label=com.docker.compose.service=$service")
    count=$(wc -w <<< "$ids")
    [[ "$count" -eq 1 ]] || die "expected exactly one $service container, found $count"
    [[ "$ids" =~ ^[a-f0-9]{64}$ ]] || die "$service container has an invalid full container ID"
    printf '%s\n' "$ids"
}

running_service_id() {
    local service=$1 id running
    id=$(unique_service_id "$service")
    running=$(docker inspect --format '{{.State.Running}}' "$id")
    [[ "$running" == true ]] || die "$service container must be running"
    printf '%s\n' "$id"
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

validate_active_container_identities() {
    local manifest=/opt/iuin/deploy/current/deployment.manifest
    local service_and_id service id expected_id expected_image expected_config
    local project_label service_label image_id config_hash ids count
    local -a active_identity_receipts
    [[ -s "$manifest" && ! -L "$manifest" && $(stat --format '%u' "$manifest") == 0 ]] \
        || die "active immutable deployment manifest is missing or invalid"
    active_identity_receipts=(
        "postgres:$postgres_id" "minio:$minio_id" "mailpit:$mailpit_id" "iuin-server:$server_id"
    )
    if [[ "$active_deployment_format" == 2 ]]; then
        active_identity_receipts+=("gateway:$gateway_id")
    fi
    for service_and_id in "${active_identity_receipts[@]}"; do
        service=${service_and_id%%:*}
        id=${service_and_id#*:}
        ids=$(docker ps --all --no-trunc --quiet \
            --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
            --filter "label=com.docker.compose.service=$service")
        count=$(wc -w <<< "$ids")
        [[ "$count" -eq 1 && "$ids" == "$id" ]] \
            || die "$service is not the unique container recorded for this restore"
        expected_id=$(deployment_container_field "$manifest" "$service" id)
        expected_image=$(deployment_container_field "$manifest" "$service" image_id)
        expected_config=$(deployment_container_field "$manifest" "$service" config_hash)
        project_label=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$id")
        service_label=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$id")
        image_id=$(docker inspect --format '{{.Image}}' "$id")
        config_hash=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$id")
        [[ "$expected_id" =~ ^[a-f0-9]{64}$ && "$id" == "$expected_id" \
            && "$expected_image" =~ ^sha256:[a-f0-9]{64}$ && "$image_id" == "$expected_image" \
            && "$expected_config" =~ ^[a-f0-9]{64}$ && "$config_hash" == "$expected_config" \
            && "$project_label" == "$COMPOSE_PROJECT_NAME" && "$service_label" == "$service" ]] \
            || die "$service container differs from the active immutable deployment manifest"
    done
}

restore_marker_value() {
    local marker=$1 key=$2
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$marker"
}

restore_database() {
    local directory=$1
    docker exec --interactive "$postgres_id" pg_restore \
        --username "$POSTGRES_USER" \
        --dbname "$POSTGRES_DB" \
        --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction \
        < "$directory/postgres.dump"
}

restore_files() {
    local directory=$1 include_mailpit=$2 item
    find "$DATA_ROOT/minio" -mindepth 1 -delete || return 1
    for item in config plugins client-plugins data; do
        find "$DATA_ROOT/mattermost/$item" -mindepth 1 -delete || return 1
    done
    tar --extract --gzip --numeric-owner --same-owner --file "$directory/minio.tar.gz" --directory "$DATA_ROOT" || return 1
    tar --extract --gzip --numeric-owner --same-owner --file "$directory/mattermost-runtime.tar.gz" --directory "$DATA_ROOT" || return 1
    if [[ "$include_mailpit" == true ]]; then
        find "$DATA_ROOT/mailpit" -mindepth 1 -delete || return 1
        tar --extract --gzip --numeric-owner --same-owner --file "$directory/mailpit.tar.gz" --directory "$DATA_ROOT" || return 1
    fi
    chown -R 1000:1000 "$DATA_ROOT/minio" || return 1
    chown -R 2000:2000 "$DATA_ROOT/mattermost/config" "$DATA_ROOT/mattermost/plugins" \
        "$DATA_ROOT/mattermost/client-plugins" "$DATA_ROOT/mattermost/data" || return 1
    chown -R 3000:3000 "$DATA_ROOT/mailpit" || return 1
}

stop_application_containers() {
    local id failed=false running
    for id in "$server_id" "$minio_id" "$mailpit_id"; do
        docker stop --time 120 "$id" >/dev/null 2>&1 || true
        running=$(docker inspect --format '{{.State.Running}}' "$id" 2>/dev/null || true)
        [[ "$running" == false ]] || failed=true
    done
    [[ "$failed" == false ]]
}

set_application_restart_policy() {
    local policy=$1 id
    local -a policy_ids=("$server_id" "$minio_id" "$mailpit_id")
    if [[ "$active_deployment_format" == 2 ]]; then
        policy_ids+=("$gateway_id")
    fi
    for id in "${policy_ids[@]}"; do
        docker update --restart="$policy" "$id" >/dev/null || return 1
    done
}

stop_gateway_for_fail_close() {
    local running
    [[ "$active_deployment_format" == 2 ]] || return 0
    running=$(docker inspect --format '{{.State.Running}}' "$gateway_id" 2>/dev/null || true)
    case "$running" in
        true) docker stop --time 120 "$gateway_id" >/dev/null 2>&1 || true ;;
        false) ;;
        *) return 1 ;;
    esac
    [[ $(docker inspect --format '{{.State.Running}}' "$gateway_id" 2>/dev/null) == false ]]
}

enforce_application_fail_closed() {
    local failed=false live_restore
    set_application_restart_policy no || failed=true
    stop_application_containers || failed=true
    stop_gateway_for_fail_close || failed=true
    [[ "$failed" == false ]] && return 0
    log "container-level fail-close was incomplete; stopping Docker and its activation socket"
    live_restore=$(timeout --signal=TERM 15 docker info \
        --format '{{.LiveRestoreEnabled}}' 2>/dev/null || true)
    systemctl stop docker.service docker.socket || return 1
    [[ "$live_restore" == false ]] \
        && ! systemctl is-active --quiet docker.service \
        && ! systemctl is-active --quiet docker.socket
}

wait_for_recovering_container_health() {
    local container=$1 timeout=${2:-300} started now state running status
    started=$(date +%s)
    while :; do
        state=$(docker inspect --format \
            '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
            "$container" 2>/dev/null || true)
        running=${state%% *}
        status=${state#* }
        if [[ "$running" != true ]]; then
            docker logs --tail 100 "$container" >&2 || true
            log "container $container stopped while waiting for dependency recovery" >&2
            return 1
        fi
        case "$status" in
            healthy|running)
                (wait_for_container_health "$container" 1) || return 1
                return 0
                ;;
            starting|unhealthy) ;;
            *)
                docker logs --tail 100 "$container" >&2 || true
                log "container $container entered unexpected health state $status" >&2
                return 1
                ;;
        esac
        now=$(date +%s)
        if (( now - started >= timeout )); then
            docker logs --tail 100 "$container" >&2 || true
            log "timed out waiting for container $container to recover health" >&2
            return 1
        fi
        sleep 3
    done
}

start_original_containers() {
    local gateway_running
    docker start "$minio_id" "$mailpit_id" >/dev/null || return 1
    (wait_for_container_health "$minio_id" 300) || return 1
    (wait_for_container_health "$mailpit_id" 300) || return 1
    compose --profile ops run --rm --no-deps --pull never minio-init reconcile || return 1
    docker start "$server_id" >/dev/null || return 1
    (wait_for_container_health "$server_id" 600) || return 1
    if [[ "$active_deployment_format" == 2 ]]; then
        gateway_running=$(docker inspect --format '{{.State.Running}}' "$gateway_id" 2>/dev/null || true)
        case "$gateway_running" in
            true) ;;
            false) docker start "$gateway_id" >/dev/null || return 1 ;;
            *) return 1 ;;
        esac
        [[ $(docker inspect --format '{{.State.Running}}' "$gateway_id" 2>/dev/null) == true ]] \
            || return 1
        wait_for_recovering_container_health "$gateway_id" 300 || return 1
    fi
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
    local base chain
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
        log "an incomplete active restore fence exists; refusing to flush it"
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

write_restore_marker() {
    local phase=$1
    restore_marker_tmp="$restore_marker.tmp.$$"
    if ! {
        printf 'format=1\n'
        printf 'phase=%s\n' "$phase"
        printf 'created_utc=%s\n' "$(date -u +'%Y%m%dT%H%M%SZ')"
        printf 'rollback=%s\n' "$rollback"
        printf 'postgres_id=%s\n' "$postgres_id"
        printf 'server_id=%s\n' "$server_id"
        printf 'minio_id=%s\n' "$minio_id"
        printf 'mailpit_id=%s\n' "$mailpit_id"
    } > "$restore_marker_tmp"; then
        return 1
    fi
    chmod 0600 "$restore_marker_tmp" || return 1
    sync -f "$restore_marker_tmp" || return 1
    mv -f -- "$restore_marker_tmp" "$restore_marker" || return 1
    restore_marker_tmp=
    sync -f "$DATA_ROOT/backups" || return 1
}

clear_restore_marker() {
    rm -f -- "$restore_marker" || return 1
    sync -f "$DATA_ROOT/backups" || return 1
}

if [[ "$restore_mode" != --verify-only || "${IUIN_HELD_MAINTENANCE_LOCK:-0}" != 1 ]]; then
    exec 9>"$DATA_ROOT/backups/.backup.lock"
    flock -n 9 || die "another backup or restore is running"
fi
if [[ "$SCRIPT_DIR" == /opt/iuin/deploy/releases/* ]]; then
    current_release=$(readlink -f -- "$active_runtime")
    if [[ "$current_release" != "$SCRIPT_DIR" ]]; then
        log "active deployment changed while restore was waiting; restarting from the current immutable release"
        flock -u 9
        current_restore=$(readlink -f -- "$active_runtime/restore.sh")
        exec /usr/bin/env \
            "ENV_FILE=$current_release/production.env" \
            "IUIN_PROJECT_DIRECTORY=$current_release" \
            /usr/bin/bash "$current_restore" "$@"
    fi
fi
compose_config_json=$(compose config --format json) \
    || die "failed to resolve the active Compose configuration"
postgres_tool_image=$(jq -er '.services.postgres.image' <<< "$compose_config_json") \
    || die "active Compose configuration is missing the PostgreSQL image"
[[ "$postgres_tool_image" =~ ^[^[:space:]]+@sha256:[a-f0-9]{64}$ ]] \
    || die "PostgreSQL validation image must use an exact digest-pinned reference"
docker image inspect "$postgres_tool_image" >/dev/null 2>&1 \
    || die "the digest-pinned PostgreSQL validation image is not available locally"
restore_mailpit=$(validate_backup "$backup_dir")
if [[ "$restore_mode" == --verify-only ]]; then
    log "backup payload, checksums, PostgreSQL catalog, and archive paths are valid: $backup_dir"
    exit 0
fi
minio_init_image=$(jq -er '.services["minio-init"].image' <<< "$compose_config_json") \
    || die "active Compose configuration is missing the minio-init image"
[[ "$minio_init_image" =~ ^[^[:space:]]+@sha256:[a-f0-9]{64}$ ]] \
    || die "minio-init image must use an exact digest-pinned reference"
docker image inspect "$minio_init_image" >/dev/null 2>&1 \
    || die "the digest-pinned minio-init image is not available locally"

[[ ! -e "$DATA_ROOT/backups/.backup-in-progress" && ! -L "$DATA_ROOT/backups/.backup-in-progress" ]] \
    || die "an interrupted backup marker must be recovered before restore"
[[ ! -e "$DATA_ROOT/backups/.deploy-in-progress" && ! -L "$DATA_ROOT/backups/.deploy-in-progress" ]] \
    || die "an interrupted deployment marker must be recovered before restore"

for runtime_pair in \
    "$SCRIPT_DIR/recover-containers.sh:/usr/local/sbin/iuin-recover-containers" \
    "$SCRIPT_DIR/docker-firewall.sh:/usr/local/sbin/iuin-docker-firewall" \
    "$SCRIPT_DIR/iuin-backup-recover.service:/etc/systemd/system/iuin-backup-recover.service" \
    "$SCRIPT_DIR/iuin-docker-firewall-pre.service:/etc/systemd/system/iuin-docker-firewall-pre.service" \
    "$SCRIPT_DIR/iuin-docker-firewall.service:/etc/systemd/system/iuin-docker-firewall.service"; do
    source_path=${runtime_pair%%:*}
    installed_path=${runtime_pair#*:}
    cmp -s "$source_path" "$installed_path" \
        || die "installed recovery runtime differs from this restore script; run bootstrap.sh first"
done
installed_environment_value() {
    local file=$1 key=$2
    awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$file"
}
[[ $(installed_environment_value /etc/iuin/recovery.env DATA_ROOT) == "$DATA_ROOT" \
    && $(installed_environment_value /etc/iuin/recovery.env COMPOSE_PROJECT_NAME) == "$COMPOSE_PROJECT_NAME" \
    && $(installed_environment_value /etc/iuin/recovery.env BIND_ADDRESS) == "$BIND_ADDRESS" \
    && $(installed_environment_value /etc/iuin/firewall.env DATA_ROOT) == "$DATA_ROOT" \
    && $(installed_environment_value /etc/iuin/firewall.env COMPOSE_PROJECT_NAME) == "$COMPOSE_PROJECT_NAME" \
    && $(installed_environment_value /etc/iuin/firewall.env BIND_ADDRESS) == "$BIND_ADDRESS" \
    && $(installed_environment_value /etc/iuin/firewall.env PUBLISH_INTERFACE) == "$PUBLISH_INTERFACE" \
    && $(installed_environment_value /etc/iuin/firewall.env LAN_CIDR) == "$LAN_CIDR" ]] \
    || die "installed recovery environment differs from this deployment; run bootstrap.sh"

restore_marker="$DATA_ROOT/backups/.restore-in-progress"
interrupted_recovery=false
active_deployment_manifest=/opt/iuin/deploy/current/deployment.manifest
active_deployment_format=$(active_manifest_value "$active_deployment_manifest" format)
case "$active_deployment_format" in
    1) ;;
    2) ;;
    *) die "active deployment manifest has an unsupported format" ;;
esac
gateway_id=
if [[ "$active_deployment_format" == 2 ]]; then
    if [[ "$restore_mode" == --recover-interrupted ]]; then
        gateway_id=$(unique_service_id gateway)
    else
        gateway_id=$(running_service_id gateway)
    fi
fi
postgres_id=$(running_service_id postgres)
[[ "$postgres_id" =~ ^[a-f0-9]{64}$ ]] || die "postgres must be running with a valid full container ID before restore"
if [[ "$restore_mode" == --recover-interrupted ]]; then
    interrupted_recovery=true
    [[ -f "$restore_marker" && ! -L "$restore_marker" \
        && $(stat --format '%u:%a:%h' "$restore_marker") == 0:600:1 \
        && $(restore_marker_value "$restore_marker" format) == 1 ]] \
        || die "no valid interrupted restore marker is available"
    awk -F= 'NF < 2 || seen[$1]++ { exit 1 }' "$restore_marker" \
        || die "interrupted restore marker has a malformed or duplicate field"
    [[ $(restore_marker_value "$restore_marker" phase) == mutating ]] \
        || die "only a restore in mutating phase can be recovered from its rollback backup"
    recorded_rollback=$(restore_marker_value "$restore_marker" rollback)
    [[ "$backup_dir" == "$recorded_rollback" ]] \
        || die "recovery target must exactly match the rollback path recorded in $restore_marker"
    recorded_postgres_id=$(restore_marker_value "$restore_marker" postgres_id)
    [[ "$recorded_postgres_id" == "$postgres_id" && "$recorded_postgres_id" =~ ^[a-f0-9]{64}$ ]] \
        || die "running PostgreSQL does not match the interrupted restore marker"
    server_id=$(restore_marker_value "$restore_marker" server_id)
    minio_id=$(restore_marker_value "$restore_marker" minio_id)
    mailpit_id=$(restore_marker_value "$restore_marker" mailpit_id)
    for service_and_id in \
        "postgres:$postgres_id" "iuin-server:$server_id" "minio:$minio_id" "mailpit:$mailpit_id"; do
        id=${service_and_id#*:}
        [[ "$id" =~ ^[a-f0-9]{64}$ ]] || die "${service_and_id%%:*} has an invalid recorded container ID"
        docker inspect "$id" >/dev/null 2>&1 || die "recorded ${service_and_id%%:*} container no longer exists"
    done
    [[ "$restore_mailpit" == true ]] || die "pre-restore rollback payload must include Mailpit"
    rollback=$backup_dir
    rollback_ready=true
    mutation_started=true
    restore_guard_active=true
else
    [[ ! -e "$restore_marker" ]] \
        || die "an interrupted restore is pending; use its recorded rollback path with --recover-interrupted"
    server_id=$(running_service_id iuin-server)
    minio_id=$(running_service_id minio)
    mailpit_id=$(running_service_id mailpit)
    for service_and_id in "iuin-server:$server_id" "minio:$minio_id" "mailpit:$mailpit_id"; do
        [[ "${service_and_id#*:}" =~ ^[a-f0-9]{64}$ ]] \
            || die "${service_and_id%%:*} must be running with a valid full container ID before restore"
    done
    rollback="$DATA_ROOT/backups/pre-restore-$(date -u +'%Y%m%dT%H%M%SZ')"
    rollback_ready=false
    mutation_started=false
    restore_guard_active=false
fi
validate_active_container_identities
restore_committed=false
restore_fence_active=false
systemctl is-enabled --quiet iuin-backup-recover.service \
    || die "cross-reboot recovery unit must be enabled before a destructive restore"
systemctl is-enabled --quiet iuin-docker-firewall-pre.service \
    || die "pre-Docker firewall unit must be enabled before a destructive restore"
if [[ "$interrupted_recovery" == false ]]; then
    restore_policy_ids=("$server_id" "$minio_id" "$mailpit_id")
    if [[ "$active_deployment_format" == 2 ]]; then
        restore_policy_ids+=("$gateway_id")
    fi
    for id in "${restore_policy_ids[@]}"; do
        [[ $(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$id") == unless-stopped ]] \
            || die "application containers must use restart policy unless-stopped before restore"
    done
fi
wait_for_container_health "$postgres_id" 300
if [[ "$interrupted_recovery" == false ]]; then
    wait_for_container_health "$minio_id" 300
    wait_for_container_health "$mailpit_id" 300
    wait_for_container_health "$server_id" 600
    if [[ "$active_deployment_format" == 2 ]]; then
        wait_for_container_health "$gateway_id" 300
    fi
fi
restore_marker_tmp=
cleanup() {
    rc=$?
    trap - EXIT INT TERM
    set +e
    [[ -z "$restore_marker_tmp" ]] || rm -f -- "$restore_marker_tmp"
    if [[ -f "$restore_marker" && ! -L "$restore_marker" \
        && $(stat --format '%u:%a:%h' "$restore_marker" 2>/dev/null) == 0:600:1 \
        && $(restore_marker_value "$restore_marker" format) == 1 \
        && $(restore_marker_value "$restore_marker" phase) == committed ]]; then
        restore_committed=true
    fi
    (( rc != 0 )) || exit 0
    if [[ "$restore_committed" == true ]]; then
        log "restore data was durably committed before the finalization error; rollback is disabled"
        if restore_fence_complete || apply_restore_fence; then
            restore_fence_active=true
            log "committed services remain fenced; the recovery unit will retry finalization"
        else
            if enforce_application_fail_closed; then
                log "the committed restore could not be fenced, so services were fail-closed"
            else
                log "CRITICAL: neither the ingress fence nor application fail-close could be guaranteed"
            fi
        fi
        exit "$rc"
    fi

    recovery_ready=true
    if [[ "$mutation_started" == true ]]; then
        recovery_ready=false
        log "restore failed after data mutation; attempting automatic rollback from $rollback"
        if stop_application_containers \
            && [[ "$rollback_ready" == true ]] \
            && restore_database "$rollback" \
            && restore_files "$rollback" true \
            && sync -f "$DATA_ROOT"; then
            recovery_ready=true
            log "pre-restore database and files were rolled back"
        else
            log "automatic rollback failed; keeping Mattermost, MinIO, and Mailpit stopped"
        fi
    else
        log "restore failed before a committed database or file change"
    fi

    if [[ "$recovery_ready" == true ]]; then
        if restore_fence_complete || apply_restore_fence; then
            restore_fence_active=true
        else
            recovery_ready=false
            log "failed to establish the recovery fence"
        fi
    fi
    if [[ "$recovery_ready" == true ]]; then
        if set_application_restart_policy no \
            && start_original_containers \
            && "$SCRIPT_DIR/health.sh" --internal \
            && sync -f "$DATA_ROOT" \
            && set_application_restart_policy unless-stopped; then
            if [[ "$restore_guard_active" == true ]]; then
                if write_restore_marker committed; then
                    restore_committed=true
                else
                    recovery_ready=false
                    log "failed to persist the committed recovery phase"
                fi
            fi
        else
            recovery_ready=false
            log "container recovery failed after restore error"
        fi
    fi

    if [[ "$recovery_ready" == true && "$restore_fence_active" == true ]]; then
        if remove_restore_fence \
            && { restore_fence_active=false; "$SCRIPT_DIR/health.sh"; } \
            && { [[ "$restore_guard_active" != true ]] || clear_restore_marker; }; then
            restore_fence_active=false
            restore_guard_active=false
            log "the original containers were restarted and passed full health checks"
        else
            recovery_ready=false
            if restore_fence_complete || apply_restore_fence; then
                restore_fence_active=true
                log "final health or marker cleanup failed; committed services were fenced again"
            else
                if enforce_application_fail_closed; then
                    log "final health failed and the fence could not be restored; services were fail-closed"
                else
                    log "CRITICAL: final health failed and fail-close could not be guaranteed"
                fi
            fi
        fi
    fi
    if [[ "$recovery_ready" != true ]]; then
        if [[ "$restore_committed" != true ]]; then
            enforce_application_fail_closed \
                || log "CRITICAL: application fail-close could not be guaranteed"
        fi
        if [[ "$restore_committed" == true ]]; then
            log "no data rollback is required; the committed marker was retained for recovery"
        elif [[ "$rollback_ready" == true ]]; then
            log "manual recovery is required; verified pre-restore backup: $rollback"
            log "after resolving the underlying error, run: sudo $SCRIPT_DIR/restore.sh $rollback --recover-interrupted"
        else
            log "manual recovery is required; the incomplete pre-restore snapshot must be inspected: $rollback"
        fi
    fi
    exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ "$interrupted_recovery" == false ]]; then
    write_restore_marker preparing
    restore_guard_active=true
fi
apply_restore_fence
restore_fence_active=true
log "stopping IUIN, MinIO, and Mailpit for destructive restore"
stop_application_containers

if [[ "$interrupted_recovery" == false ]]; then
mkdir -m 0700 "$rollback"
docker exec --interactive "$postgres_id" pg_dump \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --format=custom --no-owner --no-privileges > "$rollback/postgres.dump"
[[ -s "$rollback/postgres.dump" ]] || die "pre-restore PostgreSQL dump is empty"
tar --create --gzip --numeric-owner --file "$rollback/minio.tar.gz" --directory "$DATA_ROOT" minio
tar --create --gzip --numeric-owner --file "$rollback/mailpit.tar.gz" --directory "$DATA_ROOT" mailpit
tar --create --gzip --numeric-owner --file "$rollback/mattermost-runtime.tar.gz" \
    --directory "$DATA_ROOT" mattermost/config mattermost/plugins mattermost/client-plugins mattermost/data
printf 'created_utc=%s\npre_restore=true\nsource_backup=%s\n' \
    "$(date -u +'%Y%m%dT%H%M%SZ')" "$backup_dir" > "$rollback/manifest.txt"
(cd "$rollback" && sha256sum postgres.dump minio.tar.gz mailpit.tar.gz mattermost-runtime.tar.gz manifest.txt > SHA256SUMS)
validate_backup "$rollback" >/dev/null
sync -f "$DATA_ROOT/backups"
rollback_ready=true
write_restore_marker mutating
fi
set_application_restart_policy no

log "restoring PostgreSQL in one transaction"
mutation_started=true
restore_database "$backup_dir"

log "restoring MinIO and Mattermost persistent files"
if [[ "$restore_mailpit" == true ]]; then
    log "restoring Mailpit persistent mail capture"
else
    log "backup predates Mailpit; preserving the current Mailpit database"
fi
restore_files "$backup_dir" "$restore_mailpit"
sync -f "$DATA_ROOT"

start_original_containers
"$SCRIPT_DIR/health.sh" --internal
sync -f "$DATA_ROOT"
set_application_restart_policy unless-stopped
write_restore_marker committed
restore_committed=true
remove_restore_fence
restore_fence_active=false
"$SCRIPT_DIR/health.sh"
clear_restore_marker
restore_guard_active=false

trap - EXIT INT TERM
if [[ "$interrupted_recovery" == true ]]; then
    log "interrupted restore recovered from verified rollback backup: $rollback"
else
    log "restore complete; verified pre-restore rollback backup: $rollback"
fi
