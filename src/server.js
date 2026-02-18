const path = require('path');

const envFile = process.env.ENV_FILE || (process.env.MODE ? `.env.${process.env.MODE}` : '.env');
require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });

const express = require('express');

const isDev = process.env.NODE_ENV !== 'production';
let saasbackend;
if (isDev) {
  try {
    saasbackend = require('../ref-saasbackend');
  } catch (e) {
    saasbackend = require('@intranefr/superbackend');
  }
} else {
  saasbackend = require('@intranefr/superbackend');
}
globalThis.saasbackend = saasbackend;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const saasRouter = saasbackend.middleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  basicAuth: {
    enabled: true,
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD || 'changeme',
  },
  telegram: { enabled: false },
  cron: { enabled: false },
});
app.use('/saas', saasRouter);

app.use(express.static(path.join(__dirname, 'views')));

const targetRoutes = require('./routes/target.routes');
const backupRoutes = require('./routes/backup.routes');
const settingsRoutes = require('./routes/settings.routes');
const restoreRoutes = require('./routes/restore.routes');

app.use('/api/targets', targetRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/restores', restoreRoutes);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

const PORT = process.env.PORT || 3011;

async function start() {
  if (saasRouter.connectionPromise) {
    await saasRouter.connectionPromise;
  }

  const scheduler = require('./services/scheduler.service');
  await scheduler.init();

  app.listen(PORT, () => {
    console.log(`[mongo-vault] Server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[mongo-vault] Fatal startup error:', err);
  process.exit(1);
});
