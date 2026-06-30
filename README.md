# MongoVault

> Self-hosted MongoDB backup manager with SSH key auth, REST API, cron scheduling, and retention management.

![MongoVault demo](docs/mv-demo.gif)

Backs up MongoDB containers on remote hosts via SSH. Runs headlessly behind a REST API — configure targets, trigger backups, monitor disk usage.

## Features

- **SSH key auth** — no agent or sidecar needed on target hosts
- **REST API** — all operations via JSON endpoints
- **Cron scheduling** — per-target cron expressions
- **Retention management** — keeps N newest backups, prunes the rest
- **Disk metrics** — host disk usage and backup size tracking
- **Multi-target** — one server, many MongoDB instances
- **Zero-downtime** — uses `mongodump --archive --gzip` via SSH, no locks

## Quick Start

```bash
git clone git@github.com:javimosch/mongo-vault.git
cd mongo-vault
npm install
npm start
```

Then create your first backup target via the API:

```bash
# Set SSH key (used for all targets)
curl -X POST http://localhost:3000/api/settings/ssh-key \
  -H 'Content-Type: application/json' \
  -d '{"privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----
..."}'

# Add a backup target
curl -X POST http://localhost:3000/api/targets \
  -H 'Content-Type: application/json' \
  -d '{
    "label": "production",
    "sshHost": "10.0.0.1",
    "sshUser": "root",
    "containerId": "mongo-shared",
    "cron": "0 2 * * *",
    "retentionCount": 30,
    "enabled": true
  }'

# Trigger an immediate backup
curl -X POST http://localhost:3000/api/backups/trigger/<target-id>
```

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/backups` | GET | List targets and backup history |
| `/api/backups/trigger/:targetId` | POST | Run backup now |
| `/api/backups/metrics` | GET | Host disk and backup size metrics |
| `/api/settings/ssh-key` | GET | Check SSH key status |
| `/api/settings/ssh-key` | POST | Set SSH private key (`{"privateKey": "..."}`) |
| `/api/targets` | POST | Create or update a backup target |
| `/api/backups/download/:targetId/:filename` | GET | Download a backup archive |

## Transition from SuperBackend (existing instances)

If you were running the previous version that depended on `@intranefr/superbackend`, the new standalone version is fully backward compatible.

**No MongoDB changes needed.** The same `globalsettings` collection stores your targets and SSH key. Just:

1. Pull the new code: `git pull origin master`
2. Remove old dep: `npm uninstall @intranefr/superbackend`
3. Install new deps: `npm install`
4. Restart: `npm start`

Your existing targets, SSH key, and backup files are preserved.

## Deployment

See [docs/deploy.md](docs/deploy.md) for production setup behind a reverse proxy, systemd service, and security hardening.

## License

MIT — Javier Leandro Arancibia
