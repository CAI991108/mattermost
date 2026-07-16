# IUIN production deployment

This directory deploys the IUIN Mattermost fork as five long-running containers:

- `iuin-gateway`: an independent, digest-pinned Nginx reverse proxy. It currently serves plain HTTP at `http://10.22.111.16:8065`; certificate installation and TLS enablement are deliberately deferred.
- `iuin-server`: Team Edition built from this repository at the checked-out v11.8.3-based source, with the signed Calls v1.11.5 plugin bundled.
- `iuin-postgres`: PostgreSQL 17.10, reachable only on the private Compose network.
- `iuin-minio`: MinIO built from the fixed, security-patched `RELEASE.2025-10-15T17-29-55Z` source commit, reachable only on the private Compose network.
- `iuin-mailpit`: digest-pinned Mailpit v1.30.4 SMTP capture service with persistent SQLite storage and an authenticated Web UI/API.

`minio-init` is a short-lived operations container. It creates the bucket and least-privilege application account, seeds the versioned IUIN honor assets into object storage, verifies a known asset, then exits; it is not a sixth resident service.

## Security model

Only the Nginx gateway on `10.22.111.16:8065/tcp`, the Mailpit Web UI/API on `10.22.111.16:8025/tcp`, and integrated Calls media on `10.22.111.16:8443/tcp+udp` are published. The `iuin-server` port 8065 is exposed only to the gateway on their private Compose Web network; it has no host port mapping. PostgreSQL, both MinIO ports, and SMTP port 1025 are never published. Mattermost reaches SMTP as `mailpit:1025` across a dedicated internal Compose network; Mailpit binds SMTP only to the fixed private address `172.30.0.2`, not to its UI interface. A second dedicated bridge exists only because Docker requires a gateway-backed network for the 8025 host mapping; IP masquerading is disabled and `IUIN-FILTER` drops the original direction of every connection initiated from that bridge, including connections established before a policy refresh, so Mailpit cannot relay or fetch externally. No relay or forwarding configuration is present. The same `IUIN-FILTER` chain, reached from `DOCKER-USER`, accepts the published ports only from `10.0.0.0/8` arriving on `enp65s0f0`. A required pre-Docker systemd unit installs these fail-closed rules before Docker may restart `unless-stopped` containers; any persistent backup, deploy, or restore marker also installs an ingress and host-output maintenance fence before Docker starts. Bootstrap atomically disables Docker `live-restore` and direct container routing while preserving all other daemon settings, so stopping Docker remains a valid last-resort isolation mechanism and container IPs cannot bypass the published-port policy. The installer never flushes `DOCKER-USER`, changes UFW, or manages unrelated firewall rules.

Secrets are generated under `/srv/iuin/secrets`, are never printed, and are ignored by Git. Mattermost gets separate least-privilege MinIO credentials rather than the MinIO root credentials. Mailpit receives only a SHA-512 crypt password hash; its recoverable UI password remains root-only on the host. Open server registration is disabled while administrator-created and invited users remain supported.

The Nginx gateway currently uses plain HTTP on a trusted LAN. Install the certificate and enable TLS on this existing gateway before exposing it outside that LAN. Until then, Mattermost credentials and sessions, Mailpit's HTTP Basic credentials, captured message bodies, invitation links, and password-reset links are not encrypted on the wire and can be observed or modified by a hostile system on the same network. Treat the configured `10.0.0.0/8` as trusted, do not reuse the generated Mailpit password, and rotate both Mailpit and administrator credentials after TLS is introduced. Modern browsers also require a secure HTTPS context for microphone and screen-capture APIs, so browser-based Calls may be unavailable over this temporary HTTP URL even though the media service is correctly listening; the desktop client is the practical interim option. Integrated Calls advertises `10.22.111.16` and has no TURN service, so it is intentionally LAN-only.

## First deployment

Run from the repository root:

```bash
sudo deploy/production/bootstrap.sh
sudo deploy/production/deploy.sh
```

`bootstrap.sh` is idempotent. It installs Docker only when missing, creates persistent directories, generates only missing secrets, preserves existing Docker daemon settings except for requiring `live-restore=false`, installs both the required pre-Docker firewall gate and post-Docker policy refresh, and validates Compose. It never rotates an existing non-empty secret. If the pre-Docker gate cannot be applied, bootstrap stops Docker rather than leave published ports fail-open.

Review `deploy/production/.env` before deployment if the address, interface, LAN range, resource limits, administrator identity, or data root differ. This file is mode `0600` and contains no passwords.

The initial administrator is `litangchao` (`123090284@link.cuhk.edu.cn`). Its generated password remains only at:

```text
/srv/iuin/secrets/admin_initial_password
```

Read it locally with `sudo`, sign in, and change it immediately. `create-admin.sh` is safe to rerun: it detects the existing user and repairs the system-admin role and verified-email state.

Mailpit captures Mattermost notifications, invitations, and password-reset messages but does not deliver them to real inboxes. Its interfaces are:

```text
Web UI:   http://10.22.111.16:8025/
REST API: http://10.22.111.16:8025/api/v1/
SMTP:     mailpit:1025 (private Compose network only)
```

The Web UI/API username is `litangchao`. Its independent generated password is stored only at:

```text
/srv/iuin/secrets/mailpit_ui_password
```

Read it locally with `sudo`. The corresponding SHA-512 crypt hash is stored on the host at `/srv/iuin/secrets/mailpit_ui_auth` and mounted read-only in the container at `/run/secrets/mailpit_ui_auth`.

## Operations

```bash
sudo deploy/production/health.sh
sudo deploy/production/smtp-test.sh
sudo deploy/production/create-admin.sh
sudo docker compose --project-directory deploy/production --env-file deploy/production/.env -f deploy/production/compose.yaml ps
sudo docker compose --project-directory deploy/production --env-file deploy/production/.env -f deploy/production/compose.yaml logs --tail 200 gateway
sudo docker compose --project-directory deploy/production --env-file deploy/production/.env -f deploy/production/compose.yaml logs --tail 200 iuin-server
sudo docker inspect --format "{{.State.Health.Status}}" iuin-gateway
curl -fsS http://10.22.111.16:8065/api/v4/system/ping
```

`smtp-test.sh` opens a short-lived administrator session, calls Mattermost's ordinary test-email endpoint, verifies through the authenticated Mailpit API that a new test message with the exact test subject and configured From, Reply-To, and recipient addresses was captured, and requires successful logout before reporting success. It never creates a password-recovery token, prints only the captured message ID, and does not deliver anything externally. If the administrator has changed the initial password, this diagnostic requires the root-only `admin_initial_password` secret to be updated first.

The source build uses Go 1.26.3 and Node 24.11.1 from digest-pinned build images. It does not download an official Mattermost server package. The package target downloads only Calls v1.11.5 and verifies its upstream GPG signature before bundling it.

## Backups and restore

Create a consistent backup with:

```bash
sudo deploy/production/backup.sh
```

The backup script briefly stops Mattermost to block writes, stops Mailpit to checkpoint its SQLite/WAL database, creates a PostgreSQL custom-format dump, stops MinIO, and archives the stopped MinIO, Mailpit, and Mattermost data. It records and validates the exact unique container identities before the first stop and traps restart them even if backup fails. After services restart, the same strict restore validator reads the complete PostgreSQL data stream and all archive metadata before the timestamped backup is published or retention cleanup runs. Daily backups therefore have a short maintenance interruption.

Backups are stored below `/srv/iuin/backups` and retained for 14 days by default. A copy on the same host and disk is not disaster recovery. Copy completed timestamped directories to a different machine, NAS, or object store.

`bootstrap.sh` enables the backup timer and boot-recovery unit, but their path condition keeps them dormant when no successful deployment snapshot exists. After building, `deploy.sh` creates all five containers in the stopped state and atomically publishes a versioned, root-owned runtime receipt containing their exact IDs plus the hashed backup, restore, health, Compose, and recovery code. Current runtime receipts use deployment format 2 and current backups use backup format 3, both covering the five-container topology. Recovery and verification deliberately remain backward-compatible with strict deployment format 1 and backup format 2 receipts from the earlier four-container topology. Only then may a stateful service start. The deployment marker remains in the durable `committed` phase until all services pass internal checks behind the maintenance fence, the running Mattermost build hash matches, restart policies are finalized, the fence is removed, and the immutable runtime passes full external health. This ordering makes crash recovery forward-only after any new binary can touch persistent data. The timer runs every day at 03:30 in `Asia/Shanghai`, with up to 10 minutes of randomized delay, and never reads the mutable Git worktree. A persistent in-progress marker records the exact service container IDs; `iuin-backup-recover.service` consumes it after a host restart, covering power loss or an untrappable process kill. `/srv/iuin/backups` keeps 14 days by default and is only a temporary same-host copy; it does not protect against host, disk, theft, or site loss and must be replicated elsewhere for disaster recovery.

Inspect the schedule and the latest result with:

```bash
systemctl list-timers iuin-backup.timer
sudo systemctl status iuin-backup.service
sudo journalctl -u iuin-backup.service -n 100 --no-pager
```

Restore is deliberately guarded and destructive:

```bash
sudo deploy/production/restore.sh /srv/iuin/backups/20260713T120000Z --verify-only
sudo deploy/production/restore.sh /srv/iuin/backups/20260713T120000Z --confirm-restore
```

The verification mode does not stop or modify services. It requires an exact checksum inventory, reads both the PostgreSQL catalog and complete data stream in a networkless, read-only tool container, requires a non-empty configured MinIO bucket and every persistent tree, and rejects links, special files, duplicate or aliased targets, and paths outside the expected roots. A confirmed restore then saves and verifies a complete local pre-restore database and file backup before mutation. During mutation, a persistent marker, host/ingress fence, and temporary `restart=no` policies keep an unverified result fail-closed across power loss. If the target database transaction or later file/internal-health steps fail, it automatically rolls back PostgreSQL, MinIO, Mailpit, and Mattermost together; if that rollback itself fails, application containers remain stopped. Once restored data reaches the durable `committed` phase it is never rolled back: a final full-health failure instead re-establishes the fence and lets the recovery unit retry finalization. After a process kill or host restart in the earlier `mutating` phase, run the exact rollback command printed by the recovery unit, using `--recover-interrupted` instead of `--confirm-restore`. Test restore regularly on an isolated machine before relying on it.

## Persistent paths

```text
/srv/iuin/postgres
/srv/iuin/minio
/srv/iuin/mailpit
/srv/iuin/mattermost/config
/srv/iuin/mattermost/logs
/srv/iuin/mattermost/plugins
/srv/iuin/mattermost/client-plugins
/srv/iuin/mattermost/data
/srv/iuin/backups
/srv/iuin/secrets
```

Do not edit or delete these directories while their containers are running. Do not commit `.env`, secrets, backups, database dumps, or generated configuration.
