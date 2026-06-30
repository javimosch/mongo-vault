# MongoVault Deployment

## Quick Start (local dev)

```bash
git clone git@github.com:javimosch/mongo-vault.git
cd mongo-vault
npm install
# Start a local MongoDB (for testing)
docker run -d --name mv-mongo -p 27017:27017 mongo:7
cp .env.example .env
npm start
# Open http://localhost:3011 (login: admin/changeme)
```

## Production Deployment

### Option A: Docker Compose (recommended)

```bash
cd /apps/mongo-vault
cp .env.example .env
# Edit .env with production values:
#   MONGODB_URI=mongodb://mongo:27017/mongo-vault
#   ADMIN_PASSWORD=<strong-password>
#   CORS_ORIGIN=https://your-domain.com
nano .env
docker compose up -d --build
```

### Option B: Manual (rsync to server)

```bash
rsync -avz \
  --exclude='node_modules' \
  --exclude='data' \
  --exclude='.git' \
  /home/user/mongo-vault/ \
  user@server:/apps/mongo-vault/

ssh user@server "cd /apps/mongo-vault && npm install --omit=dev && cp .env.example .env && nano .env && nohup node src/server.js &"
```

## Transition from SuperBackend (v0.x → v1.0)

If your instance previously used `@intranefr/superbackend`:

1. **No MongoDB migration needed** — same `globalsettings` collection stores targets and SSH key
2. **Update code**: `git pull origin master`
3. **Remove old dep**: `npm uninstall @intranefr/superbackend`
4. **Install new deps**: `npm install`
5. **Remove obsolete env vars** from `.env`:
   - `ENCRYPTION_KEY` — no longer used
   - `ADMIN_USER` → renamed to `ADMIN_USER` (still works, but file explicit)
6. **Restart**: `npm start`

### For Docker Compose users

Update your `docker-compose.yml` — the app no longer needs MongoDB as a linked service (it connects directly via `MONGODB_URI`). The `mongo` service is optional only if you need a local MongoDB instance.

## Health Check

```bash
curl -u admin:changeme http://localhost:3011/api/backups
# → {"data": [...]}
```

## Reverse Proxy (Traefik / Nginx)

```yaml
# Traefik example
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.mongo-vault.rule=Host(`mv.example.com`)"
  - "traefik.http.services.mongo-vault.loadbalancer.server.port=3011"
```
