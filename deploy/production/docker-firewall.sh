#!/usr/bin/env bash
set -Eeuo pipefail

action=${1:-apply}
: "${BIND_ADDRESS:?BIND_ADDRESS is required}"
: "${PUBLISH_INTERFACE:?PUBLISH_INTERFACE is required}"
: "${LAN_CIDR:?LAN_CIDR is required}"
: "${COMPOSE_PROJECT_NAME:=iuin}"
: "${DATA_ROOT:=/srv/iuin}"
: "${LEGACY_MAIL_BRIDGE:=}"
chain=IUIN-FILTER
input_chain=IUIN-MAIL-INPUT
update_forward_chain=IUIN-UPD-FWD
update_input_chain=IUIN-UPD-INPUT
mail_bridge=br-iuin-mail
mail_ui_bridge=br-iuin-mailui
web_bridge=br-iuin-web
gateway_publish_bridge=br-iuin-gwpub
mail_bridges=("$mail_bridge")

(( EUID == 0 )) || { echo "must run as root" >&2; exit 1; }

append_mail_bridge() {
    local candidate=$1 existing
    [[ "$candidate" =~ ^[[:alnum:]_.-]{1,15}$ ]] \
        || { echo "invalid mail bridge name: $candidate" >&2; return 1; }
    for existing in "${mail_bridges[@]}"; do
        [[ "$existing" != "$candidate" ]] || return 0
    done
    mail_bridges+=("$candidate")
}

if [[ -n "$LEGACY_MAIL_BRIDGE" ]]; then
    append_mail_bridge "$LEGACY_MAIL_BRIDGE"
fi

if [[ "$action" == apply ]] \
    && docker network inspect "${COMPOSE_PROJECT_NAME}_mail" >/dev/null 2>&1; then
    detected_mail_bridge=$(docker network inspect --format \
        '{{index .Options "com.docker.network.bridge.name"}}' "${COMPOSE_PROJECT_NAME}_mail")
    if [[ -z "$detected_mail_bridge" || "$detected_mail_bridge" == '<no value>' ]]; then
        mail_network_id=$(docker network inspect --format '{{.Id}}' "${COMPOSE_PROJECT_NAME}_mail")
        detected_mail_bridge="br-${mail_network_id:0:12}"
    fi
    append_mail_bridge "$detected_mail_bridge"
fi

remove_jump() {
    while iptables -w -C DOCKER-USER -j "$chain" >/dev/null 2>&1; do
        iptables -w -D DOCKER-USER -j "$chain"
    done
}

remove_input_jump() {
    while iptables -w -C INPUT -j "$input_chain" >/dev/null 2>&1; do
        iptables -w -D INPUT -j "$input_chain"
    done
}

remove_update_guards() {
    while iptables -w -C DOCKER-USER -j "$update_forward_chain" >/dev/null 2>&1; do
        iptables -w -D DOCKER-USER -j "$update_forward_chain"
    done
    while iptables -w -C INPUT -j "$update_input_chain" >/dev/null 2>&1; do
        iptables -w -D INPUT -j "$update_input_chain"
    done
    for guard in "$update_forward_chain" "$update_input_chain"; do
        if iptables -w -n -L "$guard" >/dev/null 2>&1; then
            iptables -w -F "$guard"
            iptables -w -X "$guard"
        fi
    done
}

install_update_guards() {
    local spec protocol port bridge forward_active=false input_active=false
    local -a guard_bridges=(
        "${mail_bridges[@]}" "$mail_ui_bridge" "$web_bridge" "$gateway_publish_bridge"
    )
    iptables -w -C DOCKER-USER -j "$update_forward_chain" >/dev/null 2>&1 && forward_active=true
    iptables -w -C INPUT -j "$update_input_chain" >/dev/null 2>&1 && input_active=true

    iptables -w -N "$update_forward_chain" 2>/dev/null \
        || iptables -w -n -L "$update_forward_chain" >/dev/null 2>&1 || return 1
    if [[ "$forward_active" == false ]]; then
        iptables -w -F "$update_forward_chain" || return 1
    fi
    for bridge in "$mail_ui_bridge" "$gateway_publish_bridge"; do
        iptables -w -C "$update_forward_chain" -i "$bridge" \
            -m conntrack --ctdir ORIGINAL -j DROP >/dev/null 2>&1 \
            || iptables -w -I "$update_forward_chain" 1 -i "$bridge" \
                -m conntrack --ctdir ORIGINAL -j DROP || return 1
    done
    for spec in tcp:8025 tcp:8065 tcp:8443 udp:8443; do
        protocol=${spec%%:*}
        port=${spec##*:}
        iptables -w -C "$update_forward_chain" -p "$protocol" \
            -m conntrack --ctdir ORIGINAL --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP \
            >/dev/null 2>&1 \
            || iptables -w -I "$update_forward_chain" 1 -p "$protocol" \
                -m conntrack --ctdir ORIGINAL --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP \
            || return 1
    done
    iptables -w -C "$update_forward_chain" -j RETURN >/dev/null 2>&1 \
        || iptables -w -A "$update_forward_chain" -j RETURN || return 1

    iptables -w -N "$update_input_chain" 2>/dev/null \
        || iptables -w -n -L "$update_input_chain" >/dev/null 2>&1 || return 1
    if [[ "$input_active" == false ]]; then
        iptables -w -F "$update_input_chain" || return 1
    fi
    for bridge in "${guard_bridges[@]}"; do
        iptables -w -C "$update_input_chain" -i "$bridge" -m conntrack --ctdir ORIGINAL -j DROP \
            >/dev/null 2>&1 \
            || iptables -w -I "$update_input_chain" 1 -i "$bridge" -m conntrack --ctdir ORIGINAL -j DROP \
            || return 1
    done
    iptables -w -C "$update_input_chain" -j RETURN >/dev/null 2>&1 \
        || iptables -w -A "$update_input_chain" -j RETURN || return 1

    iptables -w -C DOCKER-USER -j "$update_forward_chain" >/dev/null 2>&1 \
        || iptables -w -I DOCKER-USER 1 -j "$update_forward_chain" || return 1
    iptables -w -C INPUT -j "$update_input_chain" >/dev/null 2>&1 \
        || iptables -w -I INPUT 1 -j "$update_input_chain" || return 1
}

remove_policy() {
    if iptables -w -n -L DOCKER-USER >/dev/null 2>&1; then
        remove_jump
    fi
    if iptables -w -n -L "$chain" >/dev/null 2>&1; then
        iptables -w -F "$chain"
        iptables -w -X "$chain"
    fi
    remove_input_jump
    if iptables -w -n -L "$input_chain" >/dev/null 2>&1; then
        iptables -w -F "$input_chain"
        iptables -w -X "$input_chain"
    fi
    remove_update_guards
}

maintenance_forward_chain=IUIN-RESTORE
maintenance_output_chain=IUIN-RESTORE-OUT

maintenance_marker_present() {
    [[ -e "$DATA_ROOT/backups/.backup-in-progress" || -L "$DATA_ROOT/backups/.backup-in-progress" \
        || -e "$DATA_ROOT/backups/.deploy-in-progress" || -L "$DATA_ROOT/backups/.deploy-in-progress" \
        || -e "$DATA_ROOT/backups/.restore-in-progress" || -L "$DATA_ROOT/backups/.restore-in-progress" ]]
}

first_rule_is_jump() {
    local chain_name=$1 target=$2 first_rule
    first_rule=$(iptables -w -S "$chain_name" 2>/dev/null \
        | awk '$1 == "-A" { print; exit }') || return 1
    [[ "$first_rule" == "-A $chain_name -j $target" ]]
}

chain_has_exact_fence_targets() {
    local chain_name=$1 targets
    targets=$(iptables -w -S "$chain_name" 2>/dev/null | awk '
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

maintenance_fence_payload_complete() {
    local spec protocol port
    chain_has_exact_fence_targets "$maintenance_forward_chain" || return 1
    chain_has_exact_fence_targets "$maintenance_output_chain" || return 1
    for spec in tcp:8025 tcp:8065 tcp:8443 udp:8443; do
        protocol=${spec%%:*}
        port=${spec##*:}
        iptables -w -C "$maintenance_forward_chain" -p "$protocol" \
            -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP \
            >/dev/null 2>&1 || return 1
        iptables -w -C "$maintenance_output_chain" -p "$protocol" \
            -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP \
            >/dev/null 2>&1 || return 1
    done
}

maintenance_fence_complete() {
    iptables -w -C DOCKER-USER -j "$maintenance_forward_chain" >/dev/null 2>&1 || return 1
    iptables -w -C OUTPUT -j "$maintenance_output_chain" >/dev/null 2>&1 || return 1
    first_rule_is_jump DOCKER-USER "$maintenance_forward_chain" || return 1
    first_rule_is_jump OUTPUT "$maintenance_output_chain" || return 1
    maintenance_fence_payload_complete
}

install_maintenance_fence() {
    local spec protocol port chain_name
    maintenance_fence_complete && return 0
    # A normal policy refresh inserts IUIN-FILTER and the transient update guard
    # ahead of existing jumps. If (and only if) both maintenance chains still
    # have the exact fail-closed payload, safely move their existing jumps back
    # to position one instead of treating ordering drift as content corruption.
    if maintenance_fence_payload_complete \
        && iptables -w -C DOCKER-USER -j "$maintenance_forward_chain" >/dev/null 2>&1 \
        && iptables -w -C OUTPUT -j "$maintenance_output_chain" >/dev/null 2>&1; then
        while iptables -w -C DOCKER-USER -j "$maintenance_forward_chain" >/dev/null 2>&1; do
            iptables -w -D DOCKER-USER -j "$maintenance_forward_chain" || return 1
        done
        while iptables -w -C OUTPUT -j "$maintenance_output_chain" >/dev/null 2>&1; do
            iptables -w -D OUTPUT -j "$maintenance_output_chain" || return 1
        done
        iptables -w -I OUTPUT 1 -j "$maintenance_output_chain" || return 1
        iptables -w -I DOCKER-USER 1 -j "$maintenance_forward_chain" || return 1
        maintenance_fence_complete && return 0
        return 1
    fi
    if iptables -w -C DOCKER-USER -j "$maintenance_forward_chain" >/dev/null 2>&1 \
        || iptables -w -C OUTPUT -j "$maintenance_output_chain" >/dev/null 2>&1; then
        echo "an incomplete active maintenance fence exists" >&2
        return 1
    fi
    for chain_name in "$maintenance_forward_chain" "$maintenance_output_chain"; do
        iptables -w -N "$chain_name" 2>/dev/null \
            || iptables -w -n -L "$chain_name" >/dev/null 2>&1 || return 1
        iptables -w -F "$chain_name" || return 1
    done
    for spec in tcp:8025 tcp:8065 tcp:8443 udp:8443; do
        protocol=${spec%%:*}
        port=${spec##*:}
        iptables -w -A "$maintenance_forward_chain" -p "$protocol" \
            -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP || return 1
        iptables -w -A "$maintenance_output_chain" -p "$protocol" \
            -m conntrack --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP || return 1
    done
    iptables -w -A "$maintenance_forward_chain" -j RETURN || return 1
    iptables -w -A "$maintenance_output_chain" -j RETURN || return 1
    iptables -w -I OUTPUT 1 -j "$maintenance_output_chain" || return 1
    iptables -w -I DOCKER-USER 1 -j "$maintenance_forward_chain" || return 1
    maintenance_fence_complete
}

case "$action" in
    apply|preapply)
        if [[ "$action" == preapply ]]; then
            iptables -w -N DOCKER-USER 2>/dev/null \
                || iptables -w -n -L DOCKER-USER >/dev/null 2>&1 \
                || { echo "cannot create DOCKER-USER chain" >&2; exit 1; }
        else
            for _ in $(seq 1 30); do
                iptables -w -n -L DOCKER-USER >/dev/null 2>&1 && break
                sleep 1
            done
        fi
        iptables -w -n -L DOCKER-USER >/dev/null 2>&1 || { echo "DOCKER-USER chain is unavailable" >&2; exit 1; }
        install_update_guards
        iptables -w -N "$chain" 2>/dev/null || true
        iptables -w -F "$chain"
        iptables -w -N "$input_chain" 2>/dev/null || true
        iptables -w -F "$input_chain"

        # Docker only publishes ports for containers with a gateway-backed
        # network. Mailpit and Nginx each get a dedicated, non-masqueraded
        # publishing bridge. Block every connection initiated from either bridge;
        # replies to inbound published-port requests use the REPLY direction.
        for bridge in "$mail_ui_bridge" "$gateway_publish_bridge"; do
            iptables -w -A "$chain" -i "$bridge" -m conntrack --ctdir ORIGINAL -j DROP
        done
        for spec in tcp:8025 tcp:8065 tcp:8443 udp:8443; do
            protocol=${spec%%:*}
            port=${spec##*:}
            iptables -w -A "$chain" -i "$PUBLISH_INTERFACE" -s "$LAN_CIDR" \
                -p "$protocol" -m conntrack --ctdir ORIGINAL \
                --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j RETURN
            # Drop the deployment's published port on every other ingress path
            # as well; otherwise a packet routed to BIND_ADDRESS through a
            # second host interface would fall through to the final RETURN.
            iptables -w -A "$chain" \
                -p "$protocol" -m conntrack --ctdir ORIGINAL \
                --ctorigdst "$BIND_ADDRESS" --ctorigdstport "$port" -j DROP
        done
        # Do not block reply traffic, other container egress, inter-container
        # traffic, SSH, or any host port not owned by this deployment.
        iptables -w -A "$chain" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
        iptables -w -A "$chain" -j RETURN
        remove_jump
        iptables -w -I DOCKER-USER 1 -j "$chain"

        # Private service bridges may not initiate connections to host services.
        # Keep established replies so the host can still probe published ports.
        for bridge in "${mail_bridges[@]}" "$mail_ui_bridge" "$web_bridge" \
            "$gateway_publish_bridge"; do
            iptables -w -A "$input_chain" -i "$bridge" -m conntrack --ctdir ORIGINAL -j DROP
        done
        iptables -w -A "$input_chain" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
        iptables -w -A "$input_chain" -j RETURN
        remove_input_jump
        iptables -w -I INPUT 1 -j "$input_chain"
        if maintenance_marker_present; then
            install_maintenance_fence
        fi
        remove_update_guards
        ;;
    remove)
        remove_policy
        ;;
    *)
        echo "usage: $0 {apply|preapply|remove}" >&2
        exit 2
        ;;
esac
