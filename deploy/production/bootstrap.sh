#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
require_root

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

install_docker() {
    if command -v docker >/dev/null 2>&1 \
        && command -v dockerd >/dev/null 2>&1 \
        && docker compose version >/dev/null 2>&1 \
        && systemctl cat docker.service >/dev/null 2>&1; then
        return
    fi

    [[ -r /etc/os-release ]] || die "unsupported operating system"
    # shellcheck disable=SC1091
    source /etc/os-release
    case "${ID:-}" in
        ubuntu|debian) ;;
        *) die "automatic Docker installation supports Ubuntu and Debian only" ;;
    esac

    log "installing Docker Engine from Docker's apt repository"
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y ca-certificates curl gnupg
    install -d -m 0755 /etc/apt/keyrings
    curl --fail --silent --show-error --location "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
    chmod 0644 /etc/apt/keyrings/docker.asc
    arch=$(dpkg --print-architecture)
    codename=${VERSION_CODENAME:?missing VERSION_CODENAME}
    printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' \
        "$arch" "$ID" "$codename" > /etc/apt/sources.list.d/docker.list
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y \
        containerd.io docker-buildx-plugin docker-ce docker-ce-cli docker-compose-plugin
}

install_docker
DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y \
    ca-certificates curl iproute2 iptables jq openssl tar util-linux

# Persistent maintenance markers rely on stopping Docker as a final fail-closed
# fallback if both iptables and individual container stops fail. Docker's
# live-restore mode would defeat that fallback, so preserve every other daemon
# setting while disabling it atomically.
docker_config_changed=false
docker_config=/etc/docker/daemon.json
install -d -m 0755 -o root -g root /etc/docker
if [[ -e "$docker_config" ]]; then
    [[ -f "$docker_config" && ! -L "$docker_config" \
        && $(stat --format '%u:%g:%h' "$docker_config") == 0:0:1 ]] \
        || die "$docker_config must be a root-owned, single-link regular file"
fi
docker_config_tmp=$(mktemp /etc/docker/.daemon.json.XXXXXX)
if [[ -e "$docker_config" ]]; then
    jq -e 'if type == "object" then .["live-restore"] = false else error("daemon config must be an object") end' \
        "$docker_config" > "$docker_config_tmp"
else
    printf '{}\n' | jq -e '.["live-restore"] = false' > "$docker_config_tmp"
fi
chown root:root "$docker_config_tmp"
chmod 0644 "$docker_config_tmp"
if [[ ! -e "$docker_config" ]] || ! cmp -s "$docker_config_tmp" "$docker_config"; then
    mv -f -- "$docker_config_tmp" "$docker_config"
    sync -f /etc/docker
    docker_config_changed=true
else
    rm -f -- "$docker_config_tmp"
fi

if [[ ! -e "$ENV_FILE" ]]; then
    install -m 0600 -o root -g root "$SCRIPT_DIR/.env.example" "$ENV_FILE"
else
    chown root:root "$ENV_FILE"
    chmod 0600 "$ENV_FILE"
fi
load_env
require_repo

log "creating persistent directories below $DATA_ROOT"
install -d -m 0750 -o root -g root "$DATA_ROOT"
install -d -m 0700 -o 70 -g 70 "$DATA_ROOT/postgres"
install -d -m 0700 -o 1000 -g 1000 "$DATA_ROOT/minio"
install -d -m 0700 -o 3000 -g 3000 "$DATA_ROOT/mailpit"
install -d -m 0700 -o root -g root "$DATA_ROOT/backups" "$DATA_ROOT/secrets"
for directory in config logs plugins client-plugins data; do
    install -d -m 0750 -o 2000 -g 2000 "$DATA_ROOT/mattermost/$directory"
done

seed_source="$REPO_ROOT/server/data/profile/honors"
seed_target="$DATA_ROOT/seed/profile/honors"
[[ -d "$seed_source" ]] || die "missing IUIN honor seed directory: $seed_source"
install -d -m 0755 -o root -g root "$DATA_ROOT/seed" "$DATA_ROOT/seed/profile" "$seed_target"
cp -RL -- "$seed_source/." "$seed_target/"
chown -R root:root "$DATA_ROOT/seed"
find "$DATA_ROOT/seed" -type d -exec chmod 0755 {} +
find "$DATA_ROOT/seed" -type f -exec chmod 0644 {} +

write_secret() {
    local name=$1 owner=$2 group=$3 mode=$4 value=$5 path
    path="$DATA_ROOT/secrets/$name"
    if [[ -e "$path" ]]; then
        [[ -s "$path" ]] || die "refusing to replace empty existing secret $path"
        chown "$owner:$group" "$path"
        chmod "$mode" "$path"
        return
    fi
    printf '%s\n' "$value" > "$path.tmp"
    chown "$owner:$group" "$path.tmp"
    chmod "$mode" "$path.tmp"
    mv -n "$path.tmp" "$path"
}

db_password=$(openssl rand -hex 32)
if [[ -s "$DATA_ROOT/secrets/postgres_password" ]]; then
    db_password=$(tr -d '\r\n' < "$DATA_ROOT/secrets/postgres_password")
elif [[ -s "$DATA_ROOT/secrets/mattermost_db_password" ]]; then
    db_password=$(tr -d '\r\n' < "$DATA_ROOT/secrets/mattermost_db_password")
fi
write_secret postgres_password 70 70 0600 "$db_password"
write_secret mattermost_db_password 2000 2000 0600 "$db_password"
unset db_password

if ! cmp -s "$DATA_ROOT/secrets/postgres_password" "$DATA_ROOT/secrets/mattermost_db_password"; then
    die "database secret copies differ; repair them manually before continuing"
fi

write_secret minio_root_user 1000 0 0640 "$(openssl rand -hex 10)"
write_secret minio_root_password 1000 0 0640 "$(openssl rand -hex 32)"
write_secret mattermost_s3_access_key 2000 0 0640 "$(openssl rand -hex 10)"
write_secret mattermost_s3_secret_key 2000 0 0640 "$(openssl rand -hex 32)"
write_secret admin_initial_password root root 0600 "Mm1-$(openssl rand -hex 24)"

mailpit_password_path="$DATA_ROOT/secrets/mailpit_ui_password"
mailpit_auth_path="$DATA_ROOT/secrets/mailpit_ui_auth"
if [[ -e "$mailpit_auth_path" && ! -s "$mailpit_password_path" ]]; then
    die "Mailpit UI auth exists but its recoverable password is missing: $mailpit_password_path"
fi
write_secret mailpit_ui_password root root 0600 "$(openssl rand -hex 32)"
if [[ ! -e "$mailpit_auth_path" ]]; then
    mailpit_ui_password=$(tr -d '\r\n' < "$mailpit_password_path")
    mailpit_ui_hash=$(printf '%s' "$mailpit_ui_password" | openssl passwd -6 -stdin)
    write_secret mailpit_ui_auth 3000 3000 0600 "$ADMIN_USERNAME:$mailpit_ui_hash"
    unset mailpit_ui_password mailpit_ui_hash
else
    [[ -s "$mailpit_auth_path" ]] || die "refusing to use empty existing secret $mailpit_auth_path"
    chown 3000:3000 "$mailpit_auth_path"
    chmod 0600 "$mailpit_auth_path"
fi

[[ $(wc -l < "$mailpit_auth_path") -eq 1 ]] || die "Mailpit auth file must contain exactly one credential"
mailpit_ui_password=$(tr -d '\r\n' < "$mailpit_password_path")
mailpit_auth_line=$(tr -d '\r\n' < "$mailpit_auth_path")
mailpit_auth_username=${mailpit_auth_line%%:*}
mailpit_auth_hash=${mailpit_auth_line#*:}
IFS='$' read -r empty algorithm salt digest remainder <<< "$mailpit_auth_hash"
[[ "$mailpit_auth_username" == "$ADMIN_USERNAME" && -z "$empty" && "$algorithm" == 6 \
    && "$salt" =~ ^[./a-zA-Z0-9]{1,16}$ && -n "$digest" && -z "${remainder:-}" ]] \
    || die "Mailpit auth file does not match the configured administrator or SHA-512 crypt format"
computed_mailpit_hash=$(printf '%s' "$mailpit_ui_password" | openssl passwd -6 -salt "$salt" -stdin)
[[ "$computed_mailpit_hash" == "$mailpit_auth_hash" ]] \
    || die "Mailpit UI password and authentication hash do not match"
unset mailpit_ui_password mailpit_auth_line mailpit_auth_username mailpit_auth_hash \
    empty algorithm salt digest remainder computed_mailpit_hash

log "installing the isolated DOCKER-USER firewall policy"
install -d -m 0755 /etc/iuin
legacy_mail_bridge=
mail_network="${COMPOSE_PROJECT_NAME}_mail"
if docker info >/dev/null 2>&1 && docker network inspect "$mail_network" >/dev/null 2>&1; then
    legacy_mail_bridge=$(docker network inspect --format \
        '{{index .Options "com.docker.network.bridge.name"}}' "$mail_network")
    if [[ -z "$legacy_mail_bridge" || "$legacy_mail_bridge" == '<no value>' ]]; then
        mail_network_id=$(docker network inspect --format '{{.Id}}' "$mail_network")
        legacy_mail_bridge="br-${mail_network_id:0:12}"
    fi
    [[ "$legacy_mail_bridge" =~ ^[[:alnum:]_.-]{1,15}$ ]] \
        || die "existing private mail network has an invalid bridge identity"
    [[ "$legacy_mail_bridge" != br-iuin-mail ]] || legacy_mail_bridge=
fi
printf 'BIND_ADDRESS=%s\nPUBLISH_INTERFACE=%s\nLAN_CIDR=%s\nCOMPOSE_PROJECT_NAME=%s\nDATA_ROOT=%s\nLEGACY_MAIL_BRIDGE=%s\n' \
    "$BIND_ADDRESS" "$PUBLISH_INTERFACE" "$LAN_CIDR" "$COMPOSE_PROJECT_NAME" "$DATA_ROOT" \
    "$legacy_mail_bridge" \
    > /etc/iuin/firewall.env
chmod 0644 /etc/iuin/firewall.env
install -m 0755 -o root -g root "$SCRIPT_DIR/docker-firewall.sh" /usr/local/sbin/iuin-docker-firewall
install -m 0755 -o root -g root "$SCRIPT_DIR/backup-launcher.sh" /usr/local/sbin/iuin-backup-launcher
install -m 0644 -o root -g root "$SCRIPT_DIR/iuin-docker-firewall-pre.service" /etc/systemd/system/iuin-docker-firewall-pre.service
install -m 0644 -o root -g root "$SCRIPT_DIR/iuin-docker-firewall.service" /etc/systemd/system/iuin-docker-firewall.service
backup_runtime_root=/opt/iuin/deploy
backup_timer_was_active=false
systemctl is-active --quiet iuin-backup.timer && backup_timer_was_active=true
backup_environment_tmp=
recovery_environment_tmp=
compat_staging=
recovery_helper_tmp=
runtime_install_cleanup() {
    rc=$?
    trap - EXIT INT TERM
    [[ -z "$backup_environment_tmp" ]] || rm -f -- "$backup_environment_tmp"
    [[ -z "$recovery_environment_tmp" ]] || rm -f -- "$recovery_environment_tmp"
    [[ -z "$recovery_helper_tmp" ]] || rm -f -- "$recovery_helper_tmp"
    if [[ -n "$compat_staging" && -d "$compat_staging" && ! -L "$compat_staging" ]]; then
        rm -f -- "$compat_staging/health.sh" "$compat_staging/lib.sh" \
            "$compat_staging/compose.yaml" || true
        rmdir -- "$compat_staging" || true
    fi
    if (( rc != 0 )) && [[ "$backup_timer_was_active" == true ]]; then
        systemctl start iuin-backup.timer >/dev/null 2>&1 || true
    fi
    exit "$rc"
}
trap runtime_install_cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
systemctl stop iuin-backup.timer >/dev/null 2>&1 || true
exec 7>"$DATA_ROOT/backups/.backup.lock"
flock -w 1800 7 || die "timed out waiting for backup, restore, or deployment lock"
install -d -m 0755 -o root -g root /opt/iuin "$backup_runtime_root" "$backup_runtime_root/releases"

legacy_compat_root="$backup_runtime_root/compat"
legacy_compat_dir="$legacy_compat_root/$legacy_compat_name"
legacy_compat_bundle_valid() {
    local bundle=$1 files spec target_name mode expected_sha target
    [[ -d "$bundle" && ! -L "$bundle" \
        && $(stat --format '%u:%g:%a' "$bundle") == 0:0:700 ]] || return 1
    files=$(find "$bundle" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort) || return 1
    [[ "$files" == $'compose.yaml\nhealth.sh\nlib.sh' ]] || return 1
    for spec in \
        "health.sh:755:$legacy_compat_health_sha" \
        "lib.sh:755:$legacy_compat_lib_sha" \
        "compose.yaml:644:$legacy_compat_compose_sha"; do
        IFS=: read -r target_name mode expected_sha <<< "$spec"
        target="$bundle/$target_name"
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
    [[ -L "$backup_runtime_root/current" ]] || return 1
    runtime=$(readlink -f -- "$backup_runtime_root/current") || return 1
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

install -d -m 0700 -o root -g root "$legacy_compat_root"
[[ $(stat --format '%u:%g:%a' /opt /opt/iuin "$backup_runtime_root" | tr '\n' ' ') \
    == '0:0:755 0:0:755 0:0:755 ' \
    && $(stat --format '%u:%g:%a' "$legacy_compat_root") == 0:0:700 \
    && ! -L /opt && ! -L /opt/iuin && ! -L "$backup_runtime_root" \
    && ! -L "$legacy_compat_root" ]] \
    || die "legacy health compatibility path is not root-controlled"
if [[ -e "$legacy_compat_dir" || -L "$legacy_compat_dir" ]]; then
    legacy_compat_bundle_valid "$legacy_compat_dir" \
        || die "existing legacy health compatibility bundle is invalid"
elif current_runtime_requires_legacy_compat; then
    [[ $(sha256sum "$SCRIPT_DIR/health.sh" | awk '{print $1}') == "$legacy_compat_health_sha" \
        && $(sha256sum "$SCRIPT_DIR/lib.sh" | awk '{print $1}') == "$legacy_compat_lib_sha" \
        && $(sha256sum "$SCRIPT_DIR/compose.yaml" | awk '{print $1}') == "$legacy_compat_compose_sha" ]] \
        || die "repository cannot construct the fingerprint-pinned legacy compatibility bundle"
    compat_staging=$(mktemp -d "$legacy_compat_root/.staging.XXXXXX")
    chown root:root "$compat_staging"
    chmod 0700 "$compat_staging"
    install -m 0755 -o root -g root "$SCRIPT_DIR/health.sh" "$compat_staging/health.sh"
    install -m 0755 -o root -g root "$SCRIPT_DIR/lib.sh" "$compat_staging/lib.sh"
    install -m 0644 -o root -g root "$SCRIPT_DIR/compose.yaml" "$compat_staging/compose.yaml"
    legacy_compat_bundle_valid "$compat_staging" \
        || die "staged legacy health compatibility bundle failed validation"
    sync -f "$compat_staging/health.sh" "$compat_staging/lib.sh" "$compat_staging/compose.yaml"
    sync -f "$compat_staging"
    mv -T -- "$compat_staging" "$legacy_compat_dir"
    compat_staging=
    sync -f "$legacy_compat_root"
fi

# Publish the helper only after its fingerprint-pinned compatibility dependency
# is durable, so an interrupted bootstrap leaves the previously installed
# recovery path intact.
[[ -d /usr/local/sbin && ! -L /usr/local/sbin \
    && $(stat --format '%u:%g:%a' /usr /usr/local /usr/local/sbin | tr '\n' ' ') \
        == '0:0:755 0:0:755 0:0:755 ' ]] \
    || die "recovery helper path is not root-controlled"
recovery_helper_tmp=$(mktemp /usr/local/sbin/.iuin-recover-containers.XXXXXX)
install -m 0755 -o root -g root "$SCRIPT_DIR/recover-containers.sh" "$recovery_helper_tmp"
[[ -f "$recovery_helper_tmp" && ! -L "$recovery_helper_tmp" \
    && $(stat --format '%u:%g:%a:%h' "$recovery_helper_tmp") == 0:0:755:1 \
    && $(sha256sum "$recovery_helper_tmp" | awk '{print $1}') \
        == "$(sha256sum "$SCRIPT_DIR/recover-containers.sh" | awk '{print $1}')" ]] \
    || die "staged recovery helper failed validation"
sync -f "$recovery_helper_tmp"
mv -Tf -- "$recovery_helper_tmp" /usr/local/sbin/iuin-recover-containers
recovery_helper_tmp=
sync -f /usr/local/sbin
[[ -f /usr/local/sbin/iuin-recover-containers \
    && ! -L /usr/local/sbin/iuin-recover-containers \
    && $(stat --format '%u:%g:%a:%h' /usr/local/sbin/iuin-recover-containers) == 0:0:755:1 \
    && $(sha256sum /usr/local/sbin/iuin-recover-containers | awk '{print $1}') \
        == "$(sha256sum "$SCRIPT_DIR/recover-containers.sh" | awk '{print $1}')" ]] \
    || die "published recovery helper failed validation"
backup_script="$backup_runtime_root/current/backup.sh"
backup_environment="$backup_runtime_root/current/production.env"
deployment_manifest="$backup_runtime_root/current/deployment.manifest"
for environment_path in "$backup_script" "$backup_environment" "$deployment_manifest"; do
    [[ "$environment_path" != *[[:space:]#=]* ]] || die "runtime path contains characters unsupported by systemd EnvironmentFile"
done
backup_environment_file=/etc/iuin/backup.env
backup_environment_tmp="$backup_environment_file.tmp.$$"
printf 'IUIN_BACKUP_SCRIPT=%s\nENV_FILE=%s\nIUIN_DEPLOYMENT_MANIFEST=%s\n' \
    "$backup_script" "$backup_environment" "$deployment_manifest" > "$backup_environment_tmp"
chmod 0644 "$backup_environment_tmp"
mv -f -- "$backup_environment_tmp" "$backup_environment_file"
recovery_environment_file=/etc/iuin/recovery.env
recovery_environment_tmp="$recovery_environment_file.tmp.$$"
[[ "$DATA_ROOT" != *[[:space:]#=]* ]] || die "DATA_ROOT contains characters unsupported by systemd EnvironmentFile"
printf 'DATA_ROOT=%s\nCOMPOSE_PROJECT_NAME=%s\nBIND_ADDRESS=%s\n' \
    "$DATA_ROOT" "$COMPOSE_PROJECT_NAME" "$BIND_ADDRESS" > "$recovery_environment_tmp"
chmod 0644 "$recovery_environment_tmp"
mv -f -- "$recovery_environment_tmp" "$recovery_environment_file"
install -m 0644 -o root -g root "$SCRIPT_DIR/iuin-backup.service" /etc/systemd/system/iuin-backup.service
install -m 0644 -o root -g root "$SCRIPT_DIR/iuin-backup.timer" /etc/systemd/system/iuin-backup.timer
install -m 0644 -o root -g root "$SCRIPT_DIR/iuin-backup-recover.service" /etc/systemd/system/iuin-backup-recover.service
systemctl daemon-reload
if ! systemctl enable iuin-docker-firewall-pre.service \
    || ! systemctl restart iuin-docker-firewall-pre.service; then
    if ! systemctl stop docker.service docker.socket; then
        die "pre-Docker firewall failed and Docker could not be stopped; disconnect this host from the LAN"
    fi
    die "pre-Docker firewall failed to apply; Docker was stopped to keep published ports fail-closed"
fi
systemctl enable docker
if [[ "$docker_config_changed" == true ]]; then
    log "restarting Docker with live-restore disabled behind the pre-Docker firewall"
    docker_start_action=(restart docker)
else
    docker_start_action=(start docker)
fi
if ! systemctl "${docker_start_action[@]}"; then
    systemctl stop docker.service docker.socket >/dev/null 2>&1 || true
    die "Docker failed to start behind the pre-Docker firewall"
fi
if [[ $(docker info --format '{{.FirewallBackend.Driver}}' 2>/dev/null) != iptables ]]; then
    systemctl stop docker.service docker.socket >/dev/null 2>&1 || true
    die "Docker must use the iptables firewall backend; Docker was stopped fail-closed"
fi
if [[ $(docker info --format '{{.LiveRestoreEnabled}}' 2>/dev/null) != false ]]; then
    systemctl stop docker.service docker.socket >/dev/null 2>&1 || true
    die "Docker live-restore must be disabled for fail-closed recovery; Docker was stopped"
fi
require_compose
if ! systemctl enable iuin-docker-firewall.service \
    || ! systemctl restart iuin-docker-firewall.service; then
    systemctl stop docker.service docker.socket >/dev/null 2>&1 || true
    die "post-Docker firewall failed; Docker was stopped fail-closed"
fi
flock -u 7
systemctl enable --now iuin-backup-recover.service
systemctl enable --now iuin-backup.timer
if [[ ! -x "$backup_runtime_root/current/backup.sh" ]]; then
    log "backup units are enabled but remain dormant until deploy.sh atomically activates a successful deployment snapshot"
fi
trap - EXIT INT TERM

compose config --quiet
log "bootstrap complete; secrets were generated without being printed"
log "Mailpit UI credentials are stored at $DATA_ROOT/secrets/mailpit_ui_password (username: $ADMIN_USERNAME)"
log "after a successful deployment, temporary local backups run daily at 03:30 Asia/Shanghai (with up to 10 minutes of randomized delay)"
log "next: sudo $SCRIPT_DIR/deploy.sh"
