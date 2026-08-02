#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
NGINX_CONFIG="$SCRIPT_DIR/nginx.conf"

assert_config_contains() {
    local expected="$1"

    if ! grep -Fq -- "$expected" "$NGINX_CONFIG"; then
        printf 'missing nginx branding rule: %s\n' "$expected" >&2
        return 1
    fi
}

assert_config_contains "location ^~ /static/plugins/com.mattermost.calls/ {"
assert_config_contains 'proxy_set_header Accept-Encoding "";'
assert_config_contains "sub_filter_types *;"
assert_config_contains "sub_filter_once off;"
assert_config_contains "sub_filter 'Set up audio devices to be used for Mattermost calls' 'Set up audio devices to be used for calls';"
assert_config_contains "sub_filter '设置用于 Mattermost 通话的音频设备' '设置用于通话的音频设备';"

printf 'Calls branding proxy rules are present\n'
