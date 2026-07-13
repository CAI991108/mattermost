#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
require_root

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
systemctl enable --now docker
require_compose

if [[ ! -e "$ENV_FILE" ]]; then
    install -m 0600 -o root -g root "$SCRIPT_DIR/.env.example" "$ENV_FILE"
else
    chown root:root "$ENV_FILE"
    chmod 0600 "$ENV_FILE"
fi
load_env

log "creating persistent directories below $DATA_ROOT"
install -d -m 0750 -o root -g root "$DATA_ROOT"
install -d -m 0700 -o 70 -g 70 "$DATA_ROOT/postgres"
install -d -m 0700 -o 1000 -g 1000 "$DATA_ROOT/minio"
install -d -m 0700 -o root -g root "$DATA_ROOT/backups" "$DATA_ROOT/secrets"
for directory in config logs plugins client-plugins data; do
    install -d -m 0750 -o 2000 -g 2000 "$DATA_ROOT/mattermost/$directory"
done

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

log "installing the isolated DOCKER-USER firewall policy"
install -d -m 0755 /etc/iuin
printf 'BIND_ADDRESS=%s\nPUBLISH_INTERFACE=%s\nLAN_CIDR=%s\n' \
    "$BIND_ADDRESS" "$PUBLISH_INTERFACE" "$LAN_CIDR" > /etc/iuin/firewall.env
chmod 0644 /etc/iuin/firewall.env
install -m 0755 -o root -g root "$SCRIPT_DIR/docker-firewall.sh" /usr/local/sbin/iuin-docker-firewall
install -m 0644 -o root -g root "$SCRIPT_DIR/iuin-docker-firewall.service" /etc/systemd/system/iuin-docker-firewall.service
backup_script=$(realpath -e -- "$SCRIPT_DIR/backup.sh")
[[ "$backup_script" != *[[:space:]#=]* ]] || die "backup script path contains characters unsupported by systemd EnvironmentFile"
printf 'IUIN_BACKUP_SCRIPT=%s\n' "$backup_script" > /etc/iuin/backup.env
chmod 0644 /etc/iuin/backup.env
install -m 0644 -o root -g root "$SCRIPT_DIR/iuin-backup.service" /etc/systemd/system/iuin-backup.service
install -m 0644 -o root -g root "$SCRIPT_DIR/iuin-backup.timer" /etc/systemd/system/iuin-backup.timer
systemctl daemon-reload
systemctl enable iuin-docker-firewall.service
systemctl restart iuin-docker-firewall.service
systemctl enable --now iuin-backup.timer

compose config --quiet
log "bootstrap complete; secrets were generated without being printed"
log "temporary local backups are scheduled daily at 03:30 Asia/Shanghai (with up to 10 minutes of randomized delay)"
log "next: sudo $SCRIPT_DIR/deploy.sh"
