#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck disable=SC2034
REPO_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIR/../.." && pwd)
ENV_FILE=${ENV_FILE:-$SCRIPT_DIR/.env}

die() {
    printf 'error: %s\n' "$*" >&2
    exit 1
}

log() {
    printf '[iuin] %s\n' "$*"
}

require_root() {
    (( EUID == 0 )) || die "run this command as root (sudo $0)"
}

load_env() {
    [[ -r "$ENV_FILE" ]] || die "missing $ENV_FILE; run bootstrap.sh first"
    # This is an administrator-owned, non-secret deployment configuration file.
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a

    : "${COMPOSE_PROJECT_NAME:=iuin}"
    : "${DATA_ROOT:=/srv/iuin}"
    : "${BIND_ADDRESS:=10.22.111.16}"
    : "${PUBLISH_INTERFACE:=enp65s0f0}"
    : "${LAN_CIDR:=10.0.0.0/8}"
    : "${SITE_URL:=http://10.22.111.16:8065}"
    : "${POSTGRES_DB:=mattermost}"
    : "${POSTGRES_USER:=mattermost}"
    : "${MINIO_BUCKET:=mattermost}"
    : "${ADMIN_USERNAME:=litangchao}"
    : "${ADMIN_EMAIL:=123090284@link.cuhk.edu.cn}"
    : "${BACKUP_RETENTION_DAYS:=14}"

    [[ "$DATA_ROOT" == /* ]] || die "DATA_ROOT must be an absolute path"
    [[ "$BIND_ADDRESS" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "invalid BIND_ADDRESS"
    [[ "$PUBLISH_INTERFACE" =~ ^[[:alnum:]_.:-]+$ ]] || die "invalid PUBLISH_INTERFACE"
    [[ "$LAN_CIDR" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$ ]] || die "invalid LAN_CIDR"
    [[ "$POSTGRES_DB" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || die "invalid POSTGRES_DB"
    [[ "$POSTGRES_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || die "invalid POSTGRES_USER"
    [[ "$MINIO_BUCKET" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || die "invalid MINIO_BUCKET"
    [[ "$ADMIN_USERNAME" =~ ^[a-z0-9._-]+$ ]] || die "invalid ADMIN_USERNAME"
    [[ "$ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || die "invalid ADMIN_EMAIL"
    [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || die "invalid BACKUP_RETENTION_DAYS"
}

compose() {
    docker compose \
        --project-directory "$SCRIPT_DIR" \
        --env-file "$ENV_FILE" \
        --file "$SCRIPT_DIR/compose.yaml" \
        "$@"
}

require_compose() {
    command -v docker >/dev/null 2>&1 || die "Docker is not installed"
    docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is not installed"
    docker info >/dev/null 2>&1 || die "Docker daemon is not available"
}

secret_path() {
    printf '%s/secrets/%s' "$DATA_ROOT" "$1"
}

require_secret() {
    local path
    path=$(secret_path "$1")
    [[ -s "$path" ]] || die "required secret is missing or empty: $path"
}

wait_for_health() {
    local service=$1
    local timeout=${2:-300}
    local started now status
    started=$(date +%s)
    while :; do
        status=$(compose ps --format json "$service" 2>/dev/null | jq -r 'if type == "array" then (.[0].Health // .[0].State // "missing") else (.Health // .State // "missing") end' 2>/dev/null || true)
        case "$status" in
            healthy|running) return 0 ;;
            unhealthy|exited|dead) compose logs --tail 100 "$service" >&2 || true; die "$service entered state $status" ;;
        esac
        now=$(date +%s)
        (( now - started < timeout )) || { compose logs --tail 100 "$service" >&2 || true; die "timed out waiting for $service"; }
        sleep 3
    done
}
