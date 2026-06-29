#!/bin/bash
# MongoVault demo - clean representative output, no real infra data
export PS1='$ '
clear

echo "MongoVault -- Self-hosted MongoDB backup manager"
echo "github.com/javimosch/mongo-vault"
echo ""
sleep 0.8

echo '$ curl -s http://localhost:3000/api/backups'
echo '  [production] root@10.0.0.1:mongo-shared'
echo '  Status: success | Latest: mongo-2026-06-29T21-00-00.gz (156 MB)'
echo '  Backups: 14 of 30 retention'
echo '  [staging] root@10.0.0.2:mongo-shared'
echo '  Status: success | Latest: mongo-2026-06-29T21-05-00.gz (23 MB)'
echo '  Backups: 30 of 30 retention'
echo ''
sleep 1.5

echo '$ curl -s http://localhost:3000/api/backups/metrics'
echo '  Disk: 250 GB total, 182 GB free (27% used)'
echo '  Backups: 2.1 GB on disk (2 targets)'
echo ''
sleep 1.2

echo '$ curl -s -X POST http://localhost:3000/api/backups/trigger/abc123'
echo '  Backup started'
echo ''
sleep 1.2

echo '$ curl -s http://localhost:3000/api/settings/ssh-key'
echo '  SSH key: configured (ED25519)'
echo ''
sleep 0.8

echo 'RESTful API -- SSH key auth -- Cron -- Retention'
echo 'github.com/javimosch/mongo-vault'
sleep 1.5
exit
