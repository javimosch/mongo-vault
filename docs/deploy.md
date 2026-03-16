# coolify-mongo-backup – Deploy to vps1

## Prerequisites

- vps1: `ubuntu@100.86.93.41` (Tailscale intranet)
- vps1 has `docker-compose` (v1) installed
- `/apps/mongo-vault` directory exists on vps1

## 1. Rsync from localhost

```bash
rsync -avz \
  --exclude='node_modules' \
  --exclude='data' \
  --exclude='.git' \
  --exclude='ref-saasbackend' \
  /home/jarancibia/ai/mongo-vault/ \
  ubuntu@100.86.93.41:/apps/mongo-vault/
```

## 2. Create .env on vps1

SSH into vps1 and create `/apps/mongo-vault/.env`:

```bash
ssh ubuntu@100.86.93.41
cd /apps/mongo-vault
cp .env.example .env
# Edit .env with production values:
#   MONGODB_URI=mongodb://mongo:27017/mongo-vault
#   ADMIN_USER=admin
#   ADMIN_PASSWORD=<strong-password>
#   ENCRYPTION_KEY=<random-32+-char-string>
nano .env
```

## 3. Start the stack

```bash
cd /apps/mongo-vault
docker-compose up -d --build
```

## 4. Configure via UI

Open `http://100.86.93.41:3011` in your browser (Tailscale required).

1. Go to **Settings** → paste your SSH private key (from `~/.ssh/id_rsa` on localhost)
2. Go to **Targets** → add a backup target (vps2 details)
3. Go to **Dashboard** → click **Run Now** to test

## 5. Update deployment

```bash
# From localhost:
rsync -avz \
  --exclude='node_modules' \
  --exclude='data' \
  --exclude='.git' \
  --exclude='ref-saasbackend' \
  /home/jarancibia/ai/mongo-vault/ \
  ubuntu@100.86.93.41:/apps/mongo-vault/

# On vps1:
ssh ubuntu@100.86.93.41 "cd /apps/mongo-vault && docker-compose up -d --build"
```

## Local Development

```bash
cd /home/jarancibia/ai/coolify-mongo-backup
npm install
# Start a local MongoDB (or use docker-compose for mongo only):
docker compose up -d mongo
npm run dev
# Open http://localhost:3011
```
