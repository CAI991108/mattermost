#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck disable=SC2034
DEFAULT_REPO_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIR/../.." && pwd)
REPO_ROOT=${IUIN_REPO_ROOT:-$DEFAULT_REPO_ROOT}
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
    : "${SMTP_UI_URL:=http://10.22.111.16:8025}"
    : "${SMTP_HOST:=mailpit}"
    : "${SMTP_PORT:=1025}"
    : "${SMTP_PRIVATE_ADDRESS:=172.30.0.2}"
    : "${SMTP_PRIVATE_SUBNET:=172.30.0.0/24}"
    : "${SMTP_FROM_NAME:=IUIN}"
    : "${SMTP_FROM_ADDRESS:=mattermost@iuin.test}"
    : "${SMTP_REPLY_TO_ADDRESS:=no-reply@iuin.test}"
    : "${SMTP_SUPPORT_ADDRESS:=support@iuin.test}"
    : "${POSTGRES_DB:=mattermost}"
    : "${POSTGRES_USER:=mattermost}"
    : "${MINIO_BUCKET:=mattermost}"
    : "${ADMIN_USERNAME:=litangchao}"
    : "${ADMIN_EMAIL:=123090284@link.cuhk.edu.cn}"
    : "${MAILPIT_MAX_MESSAGES:=1000}"
    : "${MAILPIT_MAX_AGE:=14d}"
    : "${MAILPIT_MAX_MESSAGE_SIZE:=25}"
    : "${MAILPIT_SMTP_MAX_RECIPIENTS:=50}"
    : "${BACKUP_RETENTION_DAYS:=14}"

    [[ "$DATA_ROOT" == /* ]] || die "DATA_ROOT must be an absolute path"
    [[ "$COMPOSE_PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "invalid COMPOSE_PROJECT_NAME"
    [[ "$BIND_ADDRESS" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "invalid BIND_ADDRESS"
    [[ "$PUBLISH_INTERFACE" =~ ^[[:alnum:]_.:-]+$ ]] || die "invalid PUBLISH_INTERFACE"
    [[ "$LAN_CIDR" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$ ]] || die "invalid LAN_CIDR"
    [[ "$POSTGRES_DB" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || die "invalid POSTGRES_DB"
    [[ "$POSTGRES_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || die "invalid POSTGRES_USER"
    [[ "$MINIO_BUCKET" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || die "invalid MINIO_BUCKET"
    [[ "$ADMIN_USERNAME" =~ ^[a-z0-9._-]+$ ]] || die "invalid ADMIN_USERNAME"
    [[ "$ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || die "invalid ADMIN_EMAIL"
    [[ "$SMTP_UI_URL" =~ ^http://[^/[:space:]]+(:[0-9]+)?/?$ ]] || die "invalid SMTP_UI_URL"
    [[ "$SMTP_HOST" =~ ^[a-zA-Z0-9.-]+$ ]] || die "invalid SMTP_HOST"
    [[ "$SMTP_PRIVATE_ADDRESS" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "invalid SMTP_PRIVATE_ADDRESS"
    [[ "$SMTP_PRIVATE_SUBNET" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$ ]] || die "invalid SMTP_PRIVATE_SUBNET"
    if [[ ! "$SMTP_PORT" =~ ^[0-9]+$ ]] || (( 10#$SMTP_PORT <= 0 || 10#$SMTP_PORT > 65535 )); then
        die "invalid SMTP_PORT"
    fi
    if [[ "$SMTP_FROM_NAME" == *$'\r'* || "$SMTP_FROM_NAME" == *$'\n'* ]]; then
        die "invalid SMTP_FROM_NAME"
    fi
    for email in "$SMTP_FROM_ADDRESS" "$SMTP_REPLY_TO_ADDRESS" "$SMTP_SUPPORT_ADDRESS"; do
        [[ "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || die "invalid SMTP email address"
    done
    [[ "$MAILPIT_MAX_MESSAGES" =~ ^[1-9][0-9]*$ ]] || die "invalid MAILPIT_MAX_MESSAGES"
    [[ "$MAILPIT_MAX_AGE" =~ ^[1-9][0-9]*[hd]$ ]] || die "invalid MAILPIT_MAX_AGE"
    [[ "$MAILPIT_MAX_MESSAGE_SIZE" =~ ^[1-9][0-9]*$ ]] || die "invalid MAILPIT_MAX_MESSAGE_SIZE"
    [[ "$MAILPIT_SMTP_MAX_RECIPIENTS" =~ ^[1-9][0-9]*$ ]] || die "invalid MAILPIT_SMTP_MAX_RECIPIENTS"
    [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || die "invalid BACKUP_RETENTION_DAYS"
}

require_repo() {
    [[ "$REPO_ROOT" == /* && -e "$REPO_ROOT/.git" ]] || die "IUIN_REPO_ROOT must reference the repository root"
}

compose() {
    local project_directory=${IUIN_PROJECT_DIRECTORY:-$SCRIPT_DIR}
    docker compose \
        --project-directory "$project_directory" \
        --env-file "$ENV_FILE" \
        --file "$SCRIPT_DIR/compose.yaml" \
        "$@"
}

require_docker() {
    command -v docker >/dev/null 2>&1 || die "Docker is not installed"
    docker info >/dev/null 2>&1 || die "Docker daemon is not available"
}

require_compose() {
    require_docker
    docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is not installed"
}

run_supervised_maintenance() {
    local unit_prefix=$1
    shift
    local unit
    unit="${unit_prefix}-$(date -u +'%Y%m%dT%H%M%SZ')-$$"
    command -v systemd-run >/dev/null 2>&1 || die "systemd-run is required for supervised maintenance"
    systemd-run --quiet --wait --collect --pipe \
        --unit="$unit" \
        --property=TimeoutStartSec=12h \
        --property=TimeoutStopSec=2h \
        --property=OnFailure=iuin-backup-recover.service \
        /usr/bin/env \
            IUIN_MAINTENANCE_SUPERVISED=1 \
            "ENV_FILE=$ENV_FILE" \
            "IUIN_REPO_ROOT=$REPO_ROOT" \
            /usr/bin/bash "$@"
}

secret_path() {
    printf '%s/secrets/%s' "$DATA_ROOT" "$1"
}

require_secret() {
    local path
    path=$(secret_path "$1")
    [[ -s "$path" ]] || die "required secret is missing or empty: $path"
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

wait_for_container_health() {
    local container=$1
    local timeout=${2:-300}
    local started now status
    started=$(date +%s)
    while :; do
        status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)
        case "$status" in
            healthy|running) return 0 ;;
            unhealthy|exited|dead)
                docker logs --tail 100 "$container" >&2 || true
                die "container $container entered state $status"
                ;;
        esac
        now=$(date +%s)
        if (( now - started >= timeout )); then
            docker logs --tail 100 "$container" >&2 || true
            die "timed out waiting for container $container"
        fi
        sleep 3
    done
}
