#!/bin/bash
# MongoVault demo - REST API backup management
export PS1='$ '
clear

API="http://100.86.93.41:3011"

echo "MongoVault -- Self-hosted MongoDB backup manager"
echo "github.com/javimosch/mongo-vault"
echo ""
sleep 0.8

echo "$ curl -s $API/api/backups"
curl -s $API/api/backups 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
for item in data.get('data', []):
    t = item['target']
    newest = item['backups'][0]
    print('  [{}] root@{}:{}'.format(t['label'], t['sshHost'], t['containerId']))
    print('  Status: {} | Latest: {} ({:.0f} MB)'.format(item['status']['status'], newest['filename'], newest['size']/1024/1024))
    print('  Backups: {} of {} retention'.format(len(item['backups']), t['retentionCount']))
"
sleep 1.5

echo ""
echo "$ curl -s $API/api/backups/metrics"
curl -s $API/api/backups/metrics 2>/dev/null | python3 -c "
import sys, json
m = json.load(sys.stdin)['host']
free = m['freeDisk'] / 1024**3
bkp = m['backupsSize'] / 1024**3
print('  Disk: {:.0f} GB total, {:.0f} GB free'.format(m['totalDisk']/1024**3, free))
print('  Backups: {:.1f} GB on disk'.format(bkp))
"
sleep 1.2

echo ""
echo "$ curl -s -X POST $API/api/backups/trigger/0af76992"
curl -s -X POST $API/api/backups/trigger/0af76992 2>/dev/null | python3 -c "
import sys, json; print('  ' + json.load(sys.stdin)['message'])"
sleep 1.2

echo ""
echo "$ curl -s $API/api/settings/ssh-key"
curl -s $API/api/settings/ssh-key 2>/dev/null | python3 -c "
import sys, json; print('  SSH key: ' + ('configured' if json.load(sys.stdin).get('hasKey') else 'missing'))"
sleep 0.8

echo ""
echo "RESTful API -- SSH key auth -- Cron -- Retention"
echo "github.com/javimosch/mongo-vault"
sleep 1.5
exit
