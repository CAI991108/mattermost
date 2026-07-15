#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"
require_root
load_env
require_compose
require_secret mailpit_ui_password

case "${1:-}" in
    '') health_mode=full ;;
    --internal) health_mode=internal ;;
    *) die "usage: sudo $0 [--internal]" ;;
esac

umask 077
mailpit_curl_config=$(mktemp)
cleanup() {
    rc=$?
    trap - EXIT INT TERM
    rm -f -- "$mailpit_curl_config"
    unset mailpit_ui_password
    exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

first_jump_target() {
    local chain=$1
    iptables -w -S "$chain" 2>/dev/null | awk '
        $1 == "-A" {
            for (i = 1; i < NF; i++) {
                if ($i == "-j") { print $(i + 1); exit }
            }
        }
    '
}

managed_jump_precedes_terminal() {
    local chain=$1 managed=$2
    iptables -w -S "$chain" 2>/dev/null | awk -v managed="$managed" '
        $1 == "-A" {
            target = ""
            for (i = 1; i < NF; i++) {
                if ($i == "-j") { target = $(i + 1); break }
            }
            if (target == managed) { found = 1; exit 0 }
            if (target == "ACCEPT" || target == "DROP" || target == "RETURN") { exit 1 }
        }
        END { if (!found) exit 1 }
    '
}

chain_has_exact_fence_targets() {
    local chain=$1 targets
    targets=$(iptables -w -S "$chain" 2>/dev/null | awk '
        $1 == "-A" {
            target = ""
            for (i = 1; i < NF; i++) {
                if ($i == "-j") { target = $(i + 1); break }
            }
            print target
        }
    ') || return 1
    [[ "$targets" == $'DROP\nDROP\nDROP\nDROP\nRETURN' ]]
}

mailpit_ui_password=$(tr -d '\r\n' < "$(secret_path mailpit_ui_password)")
[[ "$mailpit_ui_password" =~ ^[a-f0-9]{64}$ ]] || die "unexpected Mailpit UI password format"
printf 'user = "%s:%s"\n' "$ADMIN_USERNAME" "$mailpit_ui_password" > "$mailpit_curl_config"
chmod 0600 "$mailpit_curl_config"
unset mailpit_ui_password

failed=0
restart_policies_ok=true
expected_restart_policy=unless-stopped
[[ "$health_mode" == full ]] || expected_restart_policy=maintenance-safe
for service in postgres minio mailpit iuin-server; do
    container_id=$(compose ps --quiet "$service")
    if [[ -z "$container_id" ]]; then
        printf '%-14s %s\n' "$service" missing
        failed=1
        continue
    fi
    status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")
    printf '%-14s %s\n' "$service" "$status"
    [[ "$status" == healthy ]] || failed=1
    restart_policy=$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id")
    if [[ "$health_mode" == full ]]; then
        [[ "$restart_policy" == unless-stopped ]] || restart_policies_ok=false
    elif [[ "$service" == postgres ]]; then
        [[ "$restart_policy" == no || "$restart_policy" == unless-stopped ]] || restart_policies_ok=false
    else
        [[ "$restart_policy" == no ]] || restart_policies_ok=false
    fi
done
if [[ "$restart_policies_ok" == true ]]; then
    printf '%-14s %s\n' restart-policy "$expected_restart_policy"
else
    printf '%-14s %s\n' restart-policy failed
    failed=1
fi

compose --profile ops run --rm --no-deps --pull never minio-init check >/dev/null || failed=1
if [[ "$health_mode" == full ]]; then
    curl --fail --silent --show-error --max-time 10 "$SITE_URL/api/v4/system/ping" \
        | jq -e '.status == "OK"' >/dev/null || failed=1
fi

server_id=$(compose ps --quiet iuin-server)
mailpit_id=$(compose ps --quiet mailpit)
if [[ $(docker port "$server_id" 8065/tcp) == "$BIND_ADDRESS:8065" ]] \
    && [[ $(docker port "$server_id" 8443/tcp) == "$BIND_ADDRESS:8443" ]] \
    && [[ $(docker port "$server_id" 8443/udp) == "$BIND_ADDRESS:8443" ]] \
    && [[ $(docker port "$mailpit_id" 8025/tcp) == "$BIND_ADDRESS:8025" ]] \
    && [[ -z "$(docker port "$mailpit_id" 1025/tcp 2>/dev/null || true)" ]]; then
    printf '%-14s %s\n' published-ports ok
else
    printf '%-14s %s\n' published-ports failed
    failed=1
fi

mail_network="${COMPOSE_PROJECT_NAME}_mail"
mail_ui_network="${COMPOSE_PROJECT_NAME}_mail_ui"
mailpit_networks=$(docker inspect --format \
    '{{range $name, $config := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$mailpit_id" \
    | awk 'NF' | LC_ALL=C sort)
smtp_bind_environment_ok=false
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$mailpit_id" \
    | grep --quiet --fixed-strings --line-regexp "MP_SMTP_BIND_ADDR=$SMTP_PRIVATE_ADDRESS:$SMTP_PORT" \
    && smtp_bind_environment_ok=true
if [[ "$mailpit_networks" == "$(printf '%s\n%s' "$mail_network" "$mail_ui_network" | sort)" \
    && $(docker network inspect --format '{{index .Options "com.docker.network.bridge.name"}}' "$mail_network") == br-iuin-mail \
    && $(docker network inspect --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' "$mail_network") == "$SMTP_PRIVATE_SUBNET" \
    && $(docker network inspect --format '{{.Internal}}' "$mail_network") == true \
    && $(docker network inspect --format '{{index .Options "com.docker.network.bridge.name"}}' "$mail_ui_network") == br-iuin-mailui \
    && "$smtp_bind_environment_ok" == true ]]; then
    printf '%-14s %s\n' smtp-bind private-only
else
    printf '%-14s %s\n' smtp-bind failed
    failed=1
fi
mail_ui_ip=$(docker inspect --format \
    "{{with index .NetworkSettings.Networks \"$mail_ui_network\"}}{{.IPAddress}}{{end}}" "$mailpit_id")
if [[ "$mail_ui_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] \
    && ! printf 'QUIT\r\n' | curl --silent --show-error --connect-timeout 2 --max-time 3 \
        "telnet://$mail_ui_ip:$SMTP_PORT" >/dev/null 2>&1; then
    printf '%-14s %s\n' smtp-ui-net closed
else
    printf '%-14s %s\n' smtp-ui-net exposed
    failed=1
fi

if [[ "$health_mode" == internal ]]; then
    printf '%-14s %s\n' host-probes fenced
elif curl --fail --silent --show-error --max-time 10 "${SMTP_UI_URL%/}/readyz" >/dev/null; then
    printf '%-14s %s\n' mailpit-api ready
else
    printf '%-14s %s\n' mailpit-api failed
    failed=1
fi

if [[ "$health_mode" == full ]]; then
    mailpit_ui_status=$(curl --silent --show-error --max-time 10 --output /dev/null \
        --write-out '%{http_code}' "${SMTP_UI_URL%/}/api/v1/messages" || true)
    if [[ "$mailpit_ui_status" == 401 ]]; then
        printf '%-14s %s\n' mailpit-auth required
    else
        printf '%-14s %s\n' mailpit-auth failed
        failed=1
    fi

    if curl --fail --silent --show-error --max-time 10 \
        --config "$mailpit_curl_config" "${SMTP_UI_URL%/}/api/v1/messages?limit=1" \
        | jq -e '.messages | type == "array"' >/dev/null; then
        printf '%-14s %s\n' mailpit-login ok
    else
        printf '%-14s %s\n' mailpit-login failed
        failed=1
    fi
fi

if compose exec --no-TTY iuin-server /bin/sh -c \
    "printf 'QUIT\\r\\n' | /usr/bin/curl --silent --show-error --connect-timeout 5 --max-time 10 telnet://mailpit:1025" \
    >/dev/null; then
    printf '%-14s %s\n' smtp-private reachable
else
    printf '%-14s %s\n' smtp-private failed
    failed=1
fi

mapfile -t resident_services < <(docker ps \
    --filter "label=com.docker.compose.project=$COMPOSE_PROJECT_NAME" \
    --format '{{.Label "com.docker.compose.service"}}' \
    | LC_ALL=C sort)
resident_count=${#resident_services[@]}
if [[ "$resident_count" -eq 4 \
    && "${resident_services[*]}" == 'iuin-server mailpit minio postgres' ]]; then
    printf '%-14s %s\n' containers "4 resident"
else
    printf '%-14s %s\n' containers "expected exact four, found $resident_count"
    failed=1
fi

calls_ready=false
for _ in {1..30}; do
    if compose exec --no-TTY iuin-server /bin/sh -c \
        "awk '\$2 ~ /:20FB$/ && \$4 == \"0A\" { found=1 } END { exit !found }' /proc/net/tcp /proc/net/tcp6 && awk '\$2 ~ /:20FB$/ { found=1 } END { exit !found }' /proc/net/udp /proc/net/udp6"; then
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

expected_docker_user_first=IUIN-FILTER
[[ "$health_mode" == full ]] || expected_docker_user_first=IUIN-RESTORE
if [[ $(docker info --format '{{.LiveRestoreEnabled}}' 2>/dev/null) == false ]]; then
    printf '%-14s %s\n' docker-runtime ok
else
    printf '%-14s %s\n' docker-runtime unsafe-live-restore
    failed=1
fi
if [[ $(docker info --format '{{.FirewallBackend.Driver}}' 2>/dev/null) == iptables ]] \
    && [[ $(first_jump_target FORWARD) == DOCKER-USER ]] \
    && iptables -w -C DOCKER-USER -j IUIN-FILTER >/dev/null 2>&1 \
    && managed_jump_precedes_terminal DOCKER-USER IUIN-FILTER \
    && [[ $(first_jump_target DOCKER-USER) == "$expected_docker_user_first" ]] \
    && [[ $(first_jump_target INPUT) == IUIN-MAIL-INPUT ]]; then
    printf '%-14s %s\n' docker-firewall ok
else
    printf '%-14s %s\n' docker-firewall missing
    failed=1
fi

firewall_ports_ok=true
for spec in tcp:8025 tcp:8065 tcp:8443 udp:8443; do
    protocol=${spec%%:*}
    port=${spec##*:}
    iptables -w -C IUIN-FILTER -i "$PUBLISH_INTERFACE" -s "$LAN_CIDR" \
        -p "$protocol" -m conntrack --ctdir ORIGINAL \
        --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j RETURN \
        >/dev/null 2>&1 || firewall_ports_ok=false
    iptables -w -C IUIN-FILTER \
        -p "$protocol" -m conntrack --ctdir ORIGINAL \
        --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP \
        >/dev/null 2>&1 || firewall_ports_ok=false
done
if [[ "$firewall_ports_ok" == true ]]; then
    printf '%-14s %s\n' firewall-ports lan-only
else
    printf '%-14s %s\n' firewall-ports failed
    failed=1
fi

if iptables -w -C IUIN-FILTER -i br-iuin-mailui -m conntrack --ctdir ORIGINAL -j DROP >/dev/null 2>&1; then
    printf '%-14s %s\n' mailpit-egress blocked
else
    printf '%-14s %s\n' mailpit-egress failed
    failed=1
fi

mailpit_host_blocked=true
iptables -w -C INPUT -j IUIN-MAIL-INPUT >/dev/null 2>&1 || mailpit_host_blocked=false
for bridge in br-iuin-mail br-iuin-mailui; do
    iptables -w -C IUIN-MAIL-INPUT -i "$bridge" -m conntrack --ctdir ORIGINAL -j DROP \
        >/dev/null 2>&1 || mailpit_host_blocked=false
done
if [[ "$mailpit_host_blocked" == true ]]; then
    printf '%-14s %s\n' mailpit-host blocked
else
    printf '%-14s %s\n' mailpit-host failed
    failed=1
fi

if ! iptables -w -C DOCKER-USER -j IUIN-UPD-FWD >/dev/null 2>&1 \
    && ! iptables -w -C INPUT -j IUIN-UPD-INPUT >/dev/null 2>&1; then
    printf '%-14s %s\n' firewall-update complete
else
    printf '%-14s %s\n' firewall-update fenced
    failed=1
fi

maintenance_fence_ok=true
if [[ "$health_mode" == internal ]]; then
    managed_jump_precedes_terminal DOCKER-USER IUIN-RESTORE || maintenance_fence_ok=false
    [[ $(first_jump_target OUTPUT) == IUIN-RESTORE-OUT ]] || maintenance_fence_ok=false
    chain_has_exact_fence_targets IUIN-RESTORE || maintenance_fence_ok=false
    chain_has_exact_fence_targets IUIN-RESTORE-OUT || maintenance_fence_ok=false
    for spec in tcp:8025 tcp:8065 tcp:8443 udp:8443; do
        protocol=${spec%%:*}
        port=${spec##*:}
        iptables -w -C IUIN-RESTORE -p "$protocol" \
            -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP \
            >/dev/null 2>&1 || maintenance_fence_ok=false
        iptables -w -C IUIN-RESTORE-OUT -p "$protocol" \
            -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP \
            >/dev/null 2>&1 || maintenance_fence_ok=false
    done
else
    ! iptables -w -C DOCKER-USER -j IUIN-RESTORE >/dev/null 2>&1 || maintenance_fence_ok=false
    ! iptables -w -C OUTPUT -j IUIN-RESTORE-OUT >/dev/null 2>&1 || maintenance_fence_ok=false
fi
if [[ "$maintenance_fence_ok" == true ]]; then
    printf '%-14s %s\n' maintenance-fence "$health_mode"
else
    printf '%-14s %s\n' maintenance-fence failed
    failed=1
fi

(( failed == 0 )) || die "one or more health checks failed"
trap - EXIT INT TERM
rm -f -- "$mailpit_curl_config"
log "all production $health_mode health checks passed"
