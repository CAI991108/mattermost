#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
require_root
load_env
require_compose
require_secret mailpit_ui_password
require_secret admin_initial_password

umask 077
exec 8>"$DATA_ROOT/backups/.smtp-test.lock"
flock -n 8 || die "another SMTP end-to-end probe is already running"
curl_config=$(mktemp)
cookie_jar=$(mktemp)
mattermost_config=$(mktemp)
before_ids=$(mktemp)
response=$(mktemp)
session_active=false
cleanup() {
    rc=$?
    trap - EXIT INT TERM
    if [[ "$session_active" == true ]]; then
        if [[ -s "$mattermost_config" ]]; then
            logout_args=(--config "$mattermost_config")
        else
            logout_args=(--cookie "$cookie_jar" --header 'X-Requested-With: XMLHttpRequest')
        fi
        if ! curl --fail --silent --show-error --max-time 10 "${logout_args[@]}" \
            --request POST "${SITE_URL%/}/api/v4/users/logout" >/dev/null 2>&1; then
            printf 'error: failed to invalidate the temporary Mattermost administrator session\n' >&2
            (( rc == 0 )) && rc=1
        fi
    fi
    rm -f -- "$curl_config" "$cookie_jar" "$mattermost_config" "$before_ids" "$response"
    unset csrf_token mailpit_ui_password
    exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mailpit_ui_password=$(tr -d '\r\n' < "$(secret_path mailpit_ui_password)")
[[ "$mailpit_ui_password" =~ ^[a-f0-9]{64}$ ]] || die "unexpected Mailpit UI password format"
printf 'user = "%s:%s"\n' "$ADMIN_USERNAME" "$mailpit_ui_password" > "$curl_config"
chmod 0600 "$curl_config"

mailpit_api() {
    curl --fail --silent --show-error --max-time 10 \
        --config "$curl_config" "$@"
}

admin_password_path=$(secret_path admin_initial_password)
[[ -s "$admin_password_path" && $(wc -l < "$admin_password_path") -eq 1 ]] \
    || die "administrator password secret must contain exactly one non-empty line"
jq -n \
    --arg login_id "$ADMIN_USERNAME" \
    --rawfile password "$admin_password_path" \
    --arg device_id 'iuin-smtp-probe' \
    '{login_id: $login_id,
      password: ($password | rtrimstr("\n") | rtrimstr("\r")),
      device_id: $device_id}' \
    | curl --fail-with-body --silent --show-error --max-time 15 \
        --cookie-jar "$cookie_jar" \
        --output /dev/null \
        --header 'Content-Type: application/json' \
        --header 'X-Requested-With: XMLHttpRequest' \
        --data-binary @- \
        "${SITE_URL%/}/api/v4/users/login"
session_active=true

csrf_token=$(awk '$6 == "MMCSRF" { print $7; exit }' "$cookie_jar")
[[ "$csrf_token" =~ ^[a-z0-9]{26}$ ]] || die "Mattermost login did not return a valid CSRF cookie"
printf 'cookie = "%s"\nheader = "X-CSRF-Token: %s"\n' "$cookie_jar" "$csrf_token" > "$mattermost_config"
chmod 0600 "$mattermost_config"
unset csrf_token

mattermost_api() {
    curl --fail-with-body --silent --show-error --max-time 15 \
        --config "$mattermost_config" "$@"
}

logout_session() {
    curl --fail --silent --show-error --max-time 10 \
        --config "$mattermost_config" \
        --request POST "${SITE_URL%/}/api/v4/users/logout" >/dev/null \
        || return 1
    session_active=false
}

mailpit_api "${SMTP_UI_URL%/}/api/v1/messages?limit=100" \
    | jq -r '.messages[]?.ID' > "$before_ids"

log "requesting Mattermost's ordinary test email for $ADMIN_EMAIL"
printf 'null\n' \
    | mattermost_api \
        --request POST \
        --header 'Content-Type: application/json' \
        --data-binary @- \
        "${SITE_URL%/}/api/v4/email/test" >/dev/null

for _ in {1..30}; do
    if mailpit_api "${SMTP_UI_URL%/}/api/v1/messages?limit=100" \
        | jq -e \
            --rawfile before "$before_ids" \
            --arg recipient "$ADMIN_EMAIL" \
            --arg sender "$SMTP_FROM_ADDRESS" \
            --arg reply_to "$SMTP_REPLY_TO_ADDRESS" \
            '.messages[] as $message
             | select(($before | split("\n") | index($message.ID)) == null)
             | select(any($message.To[]?; .Address == $recipient))
             | select($message.From.Address == $sender)
             | select(any($message.ReplyTo[]?; .Address == $reply_to))
             | select($message.Subject == "Mattermost - Testing Email Settings")
             | {ID: $message.ID}' > "$response"; then
        logout_session || die "failed to invalidate the temporary Mattermost administrator session"
        printf '%-14s %s\n' smtp-end-to-end passed
        jq -r '"captured_id=" + .ID' "$response"
        log "no password-recovery token was created and no email was delivered externally"
        exit 0
    fi
    sleep 2
done

die "Mattermost did not deliver the expected test message to Mailpit within 60 seconds"
