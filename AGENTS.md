# AGENTS.md

Explicitly import subdirectory instruction files that must always be in context:
@server/AGENTS.md

## Pull Requests

When creating a pull request, follow `.github/PULL_REQUEST_TEMPLATE.md` exactly:

- Remove all `<!-- -->` comments.
- Omit sections that are not applicable (Ticket Link, Screenshots) — do not write N/A, just remove the header.
- The `#### Release Note` header and its "```release-note" fenced code block **must always be present** (WITHOUT escaping the ``` characters). Write `NONE` if the change has no API, schema, UI, or breaking changes.

## Cursor Cloud Agents

This repository has a checked-in Cloud Agent environment under `.cursor/`. Docker is started by `.cursor/scripts/cloud-agent-start.sh`; if Docker is unavailable in Cloud, treat that as an environment failure rather than falling back to snapshot assumptions.

The environment declares `mattermost/enterprise` as a Cursor multi-repo dependency. Cursor clones the repositories as siblings, so `server/Makefile` can use its default `../../enterprise` path; the install hook does not clone or symlink enterprise.

## IUIN Loading Page Recovery

When the IUIN/Mattermost page opens but a side device gets stuck on the initial loading page, diagnose runtime reachability before assuming a frontend build failure.

- From `/home/litangchao/IUIN_Platform`, start with `scripts/iuin-platform.sh status` and `ss -ltnp | rg ':8065'`.
- The webapp watcher can compile successfully while the backend is still unreachable from side devices; check backend binding, container state, and `IUIN_SITE_URL` separately from webpack output.
- A common cause is an interrupted/local restart leaving the backend bound only to `127.0.0.1:8065`. The healthy LAN-access state is `0.0.0.0:8065` with a site URL like `http://<server-lan-ip>:8065`.
- Recover side-device access with `scripts/iuin-platform.sh restart-public`. If LAN IP detection is blocked or wrong, run with explicit values: `IUIN_HOST=<server-lan-ip> IUIN_BIND_ADDR=0.0.0.0 IUIN_SITE_URL=http://<server-lan-ip>:8065 scripts/iuin-platform.sh restart-public`.
- Verify with `curl -I http://<server-lan-ip>:8065/`, `curl http://<server-lan-ip>:8065/api/v4/system/ping`, and a websocket handshake if the page loads but live updates/API behavior still fail.
- If websocket fails while HTTP works, inspect `MM_SERVICESETTINGS_SITEURL`, `MM_SERVICESETTINGS_ALLOWCORSFROM`, and `mattermost/server/config/config.json` `AllowCorsFrom`; it must include the actual LAN/localhost origins in use.
- For SSH local forwarding, target the address that is actually listening. If server loopback is not listening, use `ssh -N -L <local-port>:<server-lan-ip>:8065 <user>@<server>` and browse `http://127.0.0.1:<local-port>/`.
