# IUIN production deployment

This directory deploys the IUIN Mattermost fork as three long-running containers:

- `iuin-server`: Team Edition built from this repository at the checked-out v11.8.3-based source, with the signed Calls v1.11.5 plugin bundled.
- `iuin-postgres`: PostgreSQL 17.10, reachable only on the private Compose network.
- `iuin-minio`: MinIO built from the fixed, security-patched `RELEASE.2025-10-15T17-29-55Z` source commit, reachable only on the private Compose network.

`minio-init` is a short-lived operations container. It creates the bucket and least-privilege application account, seeds the versioned IUIN honor assets into object storage, verifies a known asset, then exits; it is not a fourth resident service.

## Security model

Only `10.22.111.16:8065/tcp` and integrated Calls on `10.22.111.16:8443/tcp+udp` are published. PostgreSQL and both MinIO ports are never published. A dedicated `IUIN-FILTER` chain, reached from `DOCKER-USER`, accepts those published ports only from `10.0.0.0/8` arriving on `enp65s0f0`. The installer never flushes `DOCKER-USER`, changes UFW, or manages unrelated firewall rules.

Secrets are generated under `/srv/iuin/secrets` with mode `0600`, are never printed, and are ignored by Git. Mattermost gets separate least-privilege MinIO credentials rather than the MinIO root credentials. Open server registration is disabled while administrator-created and invited users remain supported.

The deployment currently uses plain HTTP on a trusted LAN. Add a TLS reverse proxy before exposing it outside that LAN. Modern browsers also require a secure HTTPS context for microphone and screen-capture APIs, so browser-based Calls may be unavailable over this temporary HTTP URL even though the media service is correctly listening; the desktop client is the practical interim option. Integrated Calls advertises `10.22.111.16` and has no TURN service, so it is intentionally LAN-only.

## First deployment

Run from the repository root:

```bash
sudo deploy/production/bootstrap.sh
sudo deploy/production/deploy.sh
```

`bootstrap.sh` is idempotent. It installs Docker only when missing, creates persistent directories, generates only missing secrets, installs the isolated firewall unit, and validates Compose. It never rotates an existing non-empty secret.

Review `deploy/production/.env` before deployment if the address, interface, LAN range, resource limits, administrator identity, or data root differ. This file is mode `0600` and contains no passwords.

The initial administrator is `litangchao` (`123090284@link.cuhk.edu.cn`). Its generated password remains only at:

```text
/srv/iuin/secrets/admin_initial_password
```

Read it locally with `sudo`, sign in, and change it immediately. `create-admin.sh` is safe to rerun: it detects the existing user and repairs the system-admin role and verified-email state.

## Operations

```bash
sudo deploy/production/health.sh
sudo deploy/production/create-admin.sh
sudo docker compose --project-directory deploy/production --env-file deploy/production/.env -f deploy/production/compose.yaml ps
sudo docker compose --project-directory deploy/production --env-file deploy/production/.env -f deploy/production/compose.yaml logs --tail 200 iuin-server
```

The source build uses Go 1.26.3 and Node 24.11.1 from digest-pinned build images. It does not download an official Mattermost server package. The package target downloads only Calls v1.11.5 and verifies its upstream GPG signature before bundling it.

## Backups and restore

Create a consistent backup with:

```bash
sudo deploy/production/backup.sh
```

The backup script briefly stops Mattermost to block writes, creates a PostgreSQL custom-format dump, stops MinIO, and archives the stopped MinIO data and metadata plus Mattermost runtime files. Traps restart MinIO and Mattermost even if backup fails. Daily backups therefore have a short maintenance interruption.

Backups are stored below `/srv/iuin/backups` and retained for 14 days by default. A copy on the same host and disk is not disaster recovery. Copy completed timestamped directories to a different machine, NAS, or object store.

`bootstrap.sh` installs and enables `iuin-backup.timer`. It persistently schedules this temporary local backup every day at 03:30 in `Asia/Shanghai`, with up to 10 minutes of randomized delay. Because `backup.sh` stops Mattermost and then MinIO to obtain a consistent snapshot, each scheduled run creates a short maintenance window. `/srv/iuin/backups` keeps 14 days by default and is only a temporary same-host copy; it does not protect against host, disk, theft, or site loss and must be replicated elsewhere for disaster recovery. On a fresh host, the service condition skips any persistent catch-up run until Mattermost has produced `/srv/iuin/mattermost/config/config.json`.

Inspect the schedule and the latest result with:

```bash
systemctl list-timers iuin-backup.timer
sudo systemctl status iuin-backup.service
sudo journalctl -u iuin-backup.service -n 100 --no-pager
```

Restore is deliberately guarded and destructive:

```bash
sudo deploy/production/restore.sh /srv/iuin/backups/20260713T120000Z --confirm-restore
```

It verifies checksums, saves a local pre-restore database and file snapshot, restores PostgreSQL and the stopped persistent file trees, reapplies MinIO bucket policy, and runs health checks. Test restore regularly on an isolated machine before relying on it.

## Persistent paths

```text
/srv/iuin/postgres
/srv/iuin/minio
/srv/iuin/mattermost/config
/srv/iuin/mattermost/logs
/srv/iuin/mattermost/plugins
/srv/iuin/mattermost/client-plugins
/srv/iuin/mattermost/data
/srv/iuin/backups
/srv/iuin/secrets
```

Do not edit or delete these directories while their containers are running. Do not commit `.env`, secrets, backups, database dumps, or generated configuration.
