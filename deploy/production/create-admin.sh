#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
require_root
load_env
require_compose
require_secret admin_initial_password

wait_for_health iuin-server 300

mmctl=(compose exec --no-TTY iuin-server /mattermost/bin/mmctl --local)
if "${mmctl[@]}" user search "$ADMIN_USERNAME" >/dev/null 2>&1; then
    log "administrator account $ADMIN_USERNAME already exists"
else
    admin_password=$(tr -d '\r\n' < "$(secret_path admin_initial_password)")
    [[ -n "$admin_password" ]] || die "administrator password is empty"
    "${mmctl[@]}" user create \
        --username "$ADMIN_USERNAME" \
        --email "$ADMIN_EMAIL" \
        --password "$admin_password" \
        --system-admin \
        --email-verified \
        --disable-welcome-email
    unset admin_password
fi

# Both commands are safe to repeat and repair manually changed role/verification state.
"${mmctl[@]}" user edit email "$ADMIN_USERNAME" "$ADMIN_EMAIL"
"${mmctl[@]}" roles system-admin "$ADMIN_USERNAME"
"${mmctl[@]}" user verify "$ADMIN_USERNAME"
log "administrator $ADMIN_USERNAME is present, verified, and a system admin"
