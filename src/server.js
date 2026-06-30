const path = require('path');
const mongoose = require('mongoose');

const envFile = process.env.ENV_FILE || (process.env.MODE ? `.env.${process.env.MODE}` : '.env');
const envPath = path.resolve(process.cwd(), envFile);
require('dotenv').config({ path: envPath });
console.log(`[mongo-vault] Environment file loaded: ${envPath}`);

const express = require('express');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── CORS ────────────────────────────────────────────────────────────────
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Basic Auth ─────────────────────────────────────────────────────────
const ADMIN_USER = process.env.ADMIN_USER || process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'changeme';

function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="MongoVault"');
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      return next();
    }
  } catch {
    // fall through to 401
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="MongoVault"');
  res.status(401).json({ error: 'Invalid credentials' });
}

// Public endpoints (no auth)
app.use(express.static(path.join(__dirname, 'views')));

// API routes (authenticated)
const targetRoutes = require('./routes/target.routes');
const backupRoutes = require('./routes/backup.routes');
const settingsRoutes = require('./routes/settings.routes');
const restoreRoutes = require('./routes/restore.routes');

app.use('/api/targets', basicAuth, targetRoutes);
app.use('/api/backups', basicAuth, backupRoutes);
app.use('/api/settings', basicAuth, settingsRoutes);
app.use('/api/restores', basicAuth, restoreRoutes);

// Audit endpoint (admin)
const AuditEvent = require('./models/AuditEvent');
app.get('/saas/api/admin/audit', basicAuth, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, action, target, startDate, endDate, search, outcome, from } = req.query;

    const query = {};
    if (action) query.action = { $regex: action, $options: 'i' };
    if (target) query.target = target;
    if (outcome) query.outcome = outcome;

    // date range
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    if (from) dateFilter.$gte = new Date(from);
    if (Object.keys(dateFilter).length) query.createdAt = dateFilter;

    if (search) {
      query.$or = [
        { action: { $regex: search, $options: 'i' } },
        { target: { $regex: search, $options: 'i' } },
        { 'meta.filename': { $regex: search, $options: 'i' } },
      ];
    }

    const total = await AuditEvent.countDocuments(query);
    const items = await AuditEvent.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(pageSize))
      .limit(parseInt(pageSize))
      .lean();

    // Map _id → id for the Vue frontend
    const events = items.map(e => ({
      ...e,
      id: e._id,
      _id: undefined,
      at: e.createdAt,
      __v: undefined,
    }));

    res.json({ events, total, page: parseInt(page), pageSize: parseInt(pageSize), totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    console.error('[audit] Endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'index.html'));
});

// Catch-all → landing
app.get('*', (req, res) => {
  res.redirect('/');
});

// ── Start ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3011;
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mongo-vault';

async function start() {
  console.log(`[mongo-vault] Connecting to MongoDB: ${MONGO_URI.replace(/\/\/.*@/, '//***@')}`);

  try {
    await mongoose.connect(MONGO_URI);
    console.log('[mongo-vault] ✅ MongoDB connected');
  } catch (err) {
    console.error('[mongo-vault] ❌ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }

  const scheduler = require('./services/scheduler.service');
  await scheduler.init();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[mongo-vault] 🚀 Server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[mongo-vault] Fatal startup error:', err);
  process.exit(1);
});
