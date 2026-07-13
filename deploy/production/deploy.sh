#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
require_root
load_env
require_compose

for secret in postgres_password mattermost_db_password minio_root_user minio_root_password mattermost_s3_access_key mattermost_s3_secret_key admin_initial_password; do
    require_secret "$secret"
done

export BUILD_HASH
BUILD_HASH=$(git -C "$REPO_ROOT" rev-parse --verify HEAD)

log "validating Compose configuration"
compose config --quiet

log "building the Team server and fixed MinIO source release"
compose build --pull iuin-server minio

if [[ -n "$(compose ps --quiet iuin-server)" ]]; then
    log "stopping the existing IUIN server before storage policy reconciliation"
    compose stop --timeout 120 iuin-server
fi

log "starting PostgreSQL and MinIO"
compose up --detach postgres minio
wait_for_health postgres 300
wait_for_health minio 300

log "creating the private MinIO bucket and least-privilege application user"
compose --profile ops run --rm minio-init init

log "starting IUIN server and integrated Calls"
compose up --detach iuin-server
wait_for_health iuin-server 600

"$SCRIPT_DIR/create-admin.sh"
"$SCRIPT_DIR/health.sh"

log "deployment complete: $SITE_URL"
log "the initial administrator password remains at $DATA_ROOT/secrets/admin_initial_password (mode 0600)"
