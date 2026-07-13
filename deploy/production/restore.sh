#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
require_root
load_env
require_compose

[[ $# == 2 && $2 == --confirm-restore ]] || die "usage: sudo $0 BACKUP_DIRECTORY --confirm-restore"
backup_dir=$(realpath -- "$1")
case "$backup_dir" in
    "$DATA_ROOT/backups"/*) ;;
    *) die "backup must be below $DATA_ROOT/backups" ;;
esac
for file in SHA256SUMS postgres.dump minio.tar.gz mattermost-runtime.tar.gz manifest.txt; do
    [[ -s "$backup_dir/$file" ]] || die "missing backup file: $file"
done
(cd "$backup_dir" && sha256sum --check SHA256SUMS)

exec 9>"$DATA_ROOT/backups/.backup.lock"
flock -n 9 || die "another backup or restore is running"

log "stopping IUIN and MinIO for destructive restore"
compose stop --timeout 120 iuin-server minio

rollback="$DATA_ROOT/backups/pre-restore-$(date -u +'%Y%m%dT%H%M%SZ')"
mkdir -m 0700 "$rollback"
compose exec --no-TTY postgres pg_dump \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --format=custom --no-owner --no-privileges > "$rollback/postgres.dump"
tar --create --gzip --numeric-owner --file "$rollback/minio.tar.gz" --directory "$DATA_ROOT" minio
tar --create --gzip --numeric-owner --file "$rollback/mattermost-runtime.tar.gz" \
    --directory "$DATA_ROOT" mattermost/config mattermost/plugins mattermost/client-plugins mattermost/data

log "restoring PostgreSQL"
compose exec --no-TTY postgres pg_restore \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction < "$backup_dir/postgres.dump"

log "restoring MinIO and Mattermost persistent files"
find "$DATA_ROOT/minio" -mindepth 1 -delete
for directory in config plugins client-plugins data; do
    find "$DATA_ROOT/mattermost/$directory" -mindepth 1 -delete
done
tar --extract --gzip --numeric-owner --same-owner --file "$backup_dir/minio.tar.gz" --directory "$DATA_ROOT"
tar --extract --gzip --numeric-owner --same-owner --file "$backup_dir/mattermost-runtime.tar.gz" --directory "$DATA_ROOT"

chown -R 1000:1000 "$DATA_ROOT/minio"
chown -R 2000:2000 "$DATA_ROOT/mattermost/config" "$DATA_ROOT/mattermost/plugins" \
    "$DATA_ROOT/mattermost/client-plugins" "$DATA_ROOT/mattermost/data"

compose up --detach minio
wait_for_health minio 300
compose --profile ops run --rm minio-init init
compose up --detach iuin-server
wait_for_health iuin-server 600
"$SCRIPT_DIR/health.sh"

log "restore complete; the pre-restore file snapshot is at $rollback"
