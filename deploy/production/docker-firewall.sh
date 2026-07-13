#!/usr/bin/env bash
set -Eeuo pipefail

action=${1:-apply}
: "${BIND_ADDRESS:?BIND_ADDRESS is required}"
: "${PUBLISH_INTERFACE:?PUBLISH_INTERFACE is required}"
: "${LAN_CIDR:?LAN_CIDR is required}"
chain=IUIN-FILTER

(( EUID == 0 )) || { echo "must run as root" >&2; exit 1; }

remove_jump() {
    while iptables -w -C DOCKER-USER -j "$chain" >/dev/null 2>&1; do
        iptables -w -D DOCKER-USER -j "$chain"
    done
}

remove_policy() {
    if iptables -w -n -L DOCKER-USER >/dev/null 2>&1; then
        remove_jump
    fi
    if iptables -w -n -L "$chain" >/dev/null 2>&1; then
        iptables -w -F "$chain"
        iptables -w -X "$chain"
    fi
}

case "$action" in
    apply)
        for _ in $(seq 1 30); do
            iptables -w -n -L DOCKER-USER >/dev/null 2>&1 && break
            sleep 1
        done
        iptables -w -n -L DOCKER-USER >/dev/null 2>&1 || { echo "DOCKER-USER chain is unavailable" >&2; exit 1; }
        iptables -w -N "$chain" 2>/dev/null || true
        iptables -w -F "$chain"

        # Do not block reply traffic, container egress, inter-container traffic,
        # SSH, or any host port not owned by this deployment.
        iptables -w -A "$chain" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
        for spec in tcp:8065 tcp:8443 udp:8443; do
            protocol=${spec%%:*}
            port=${spec##*:}
            iptables -w -A "$chain" -i "$PUBLISH_INTERFACE" -s "$LAN_CIDR" \
                -p "$protocol" -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j RETURN
            iptables -w -A "$chain" -i "$PUBLISH_INTERFACE" \
                -p "$protocol" -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP
        done
        iptables -w -A "$chain" -j RETURN
        remove_jump
        iptables -w -I DOCKER-USER 1 -j "$chain"
        ;;
    remove)
        remove_policy
        ;;
    *)
        echo "usage: $0 {apply|remove}" >&2
        exit 2
        ;;
esac
