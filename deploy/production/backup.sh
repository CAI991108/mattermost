#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
require_root
load_env
require_compose

exec 9>"$DATA_ROOT/backups/.backup.lock"
flock -n 9 || die "another backup or restore is running"

timestamp=$(date -u +'%Y%m%dT%H%M%SZ')
staging="$DATA_ROOT/backups/.partial-$timestamp"
destination="$DATA_ROOT/backups/$timestamp"
mkdir -m 0700 "$staging"

server_was_running=false
minio_was_running=false
cleanup() {
    rc=$?
    trap - EXIT INT TERM
    if [[ "$minio_was_running" == true ]]; then
        compose up --detach minio >/dev/null || true
        (wait_for_health minio 300) || true
    fi
    if [[ "$server_was_running" == true ]]; then
        compose up --detach iuin-server >/dev/null || true
        (wait_for_health iuin-server 600) || true
    fi
    if (( rc != 0 )); then
        log "backup failed; partial data remains at $staging"
    fi
    exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ -n "$(compose ps --quiet iuin-server)" ]]; then
    server_was_running=true
    log "stopping IUIN server to quiesce writes"
    compose stop --timeout 120 iuin-server
fi

log "dumping PostgreSQL"
compose exec --no-TTY postgres pg_dump \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --format=custom \
    --no-owner \
    --no-privileges > "$staging/postgres.dump"
[[ -s "$staging/postgres.dump" ]] || die "PostgreSQL dump is empty"

if [[ -n "$(compose ps --quiet minio)" ]]; then
    minio_was_running=true
    log "stopping MinIO before archiving its data and metadata"
    compose stop --timeout 120 minio
fi

tar --create --gzip --numeric-owner --file "$staging/minio.tar.gz" --directory "$DATA_ROOT" minio
tar --create --gzip --numeric-owner --file "$staging/mattermost-runtime.tar.gz" \
    --directory "$DATA_ROOT" mattermost/config mattermost/plugins mattermost/client-plugins mattermost/data

{
    printf 'created_utc=%s\n' "$timestamp"
    printf 'git_commit=%s\n' "$(git -C "$REPO_ROOT" rev-parse HEAD)"
    printf 'site_url=%s\n' "$SITE_URL"
    printf 'quiesced=true\n'
    compose config --images | sort | sed 's/^/image=/'
} > "$staging/manifest.txt"

(cd "$staging" && sha256sum postgres.dump minio.tar.gz mattermost-runtime.tar.gz manifest.txt > SHA256SUMS)
mv "$staging" "$destination"
chmod -R go-rwx "$destination"

if [[ "$minio_was_running" == true ]]; then
    compose up --detach minio
    wait_for_health minio 300
    minio_was_running=false
fi
if [[ "$server_was_running" == true ]]; then
    compose up --detach iuin-server
    wait_for_health iuin-server 600
    server_was_running=false
fi

find "$DATA_ROOT/backups" -mindepth 1 -maxdepth 1 -type d \
    -name '20??????T??????Z' -mtime "+$BACKUP_RETENTION_DAYS" -print -exec rm -rf -- {} +

trap - EXIT INT TERM
log "backup complete: $destination"
log "this local backup is not disaster recovery; copy it to another machine or object store"
