#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
require_root
load_env
require_compose

failed=0
for service in postgres minio iuin-server; do
    container_id=$(compose ps --quiet "$service")
    if [[ -z "$container_id" ]]; then
        printf '%-14s %s\n' "$service" missing
        failed=1
        continue
    fi
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")
    printf '%-14s %s\n' "$service" "$status"
    [[ "$status" == healthy ]] || failed=1
done

compose --profile ops run --rm minio-init check >/dev/null || failed=1
curl --fail --silent --show-error --max-time 10 "$SITE_URL/api/v4/system/ping" | jq -e '.status == "OK"' >/dev/null || failed=1

server_id=$(compose ps --quiet iuin-server)
if [[ $(docker port "$server_id" 8065/tcp) == "$BIND_ADDRESS:8065" ]] \
    && [[ $(docker port "$server_id" 8443/tcp) == "$BIND_ADDRESS:8443" ]] \
    && [[ $(docker port "$server_id" 8443/udp) == "$BIND_ADDRESS:8443" ]]; then
    printf '%-14s %s\n' published-ports ok
else
    printf '%-14s %s\n' published-ports failed
    failed=1
fi

calls_ready=false
for _ in {1..30}; do
    if compose exec --no-TTY iuin-server /bin/sh -c \
        "grep -q ':20FB ' /proc/net/tcp /proc/net/tcp6 && grep -q ':20FB ' /proc/net/udp /proc/net/udp6"; then
        calls_ready=true
        break
    fi
    sleep 2
done
if [[ "$calls_ready" == true ]]; then
    printf '%-14s %s\n' calls-media ok
else
    printf '%-14s %s\n' calls-media failed
    failed=1
fi

if iptables -w -C DOCKER-USER -j IUIN-FILTER >/dev/null 2>&1; then
    printf '%-14s %s\n' docker-firewall ok
else
    printf '%-14s %s\n' docker-firewall missing
    failed=1
fi

(( failed == 0 )) || die "one or more health checks failed"
log "all production health checks passed"
