const path = require("path");

const envFile =
  process.env.ENV_FILE ||
  (process.env.MODE ? `.env.${process.env.MODE}` : ".env");
const envPath = path.resolve(process.cwd(), envFile);
require("dotenv").config({ path: envPath });

console.log(`Environment file loaded: ${envPath}`);

const express = require("express");

const isDev = process.env.NODE_ENV !== "production";
let saasbackend;
if (isDev) {
  try {
    saasbackend = require("../ref-saasbackend");
  } catch (e) {
    saasbackend = require("@intranefr/superbackend");
  }
} else {
  saasbackend = require("@intranefr/superbackend");
}
globalThis.saasbackend = saasbackend;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure environment variables for saasbackend middleware are set correctly
process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || process.env.ADMIN_USER || "admin";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";

const saasRouter = saasbackend.middleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: process.env.CORS_ORIGIN || "*",
  basicAuth: {
    enabled: true,
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD,
  },
  telegram: { enabled: false },
  cron: { enabled: false },
});

// Middleware to fix audit page 302 issue by bypassing the problematic requireModuleAccessWithIframe check
// when valid basic auth is provided.
const AuditEvent = require('../ref-saasbackend/src/models/AuditEvent');
app.get("/saas/api/admin/audit", async (req, res, next) => {
  const authHeader = req.headers?.authorization || '';
  if (authHeader.startsWith('Basic ')) {
    try {
      const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf-8');
      const [username, password] = credentials.split(':');
      if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        // Valid basic auth, bypass saas-backend's audit API and handle it directly
        try {
          const {
            page = 1,
            pageSize = 10,
            action,
            target,
            userId,
            orgId,
            startDate,
            endDate,
            search,
          } = req.query;

          const query = {};
          if (action) query.action = action;
          if (target) query.target = target;
          if (userId) query.userId = userId;
          if (orgId) query.orgId = orgId;
          if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
          }
          if (search) {
            query.$or = [
              { action: { $regex: search, $options: "i" } },
              { target: { $regex: search, $options: "i" } },
              { details: { $regex: search, $options: "i" } },
            ];
          }

          const total = await AuditEvent.countDocuments(query);
          const items = await AuditEvent.find(query)
            .sort({ timestamp: -1 })
            .skip((page - 1) * pageSize)
            .limit(parseInt(pageSize));

          return res.json({
            items,
            total,
            page: parseInt(page),
            pageSize: parseInt(pageSize),
            totalPages: Math.ceil(total / pageSize),
          });
        } catch (error) {
          console.error("[mongo-vault] Audit API bypass error:", error);
          return res.status(500).json({ error: "Failed to fetch audit events" });
        }
      }
    } catch (e) {}
  }
  next();
});

app.use("/saas", saasRouter);

app.use(express.static(path.join(__dirname, "views")));

const targetRoutes = require("./routes/target.routes");
const backupRoutes = require("./routes/backup.routes");
const settingsRoutes = require("./routes/settings.routes");
const restoreRoutes = require("./routes/restore.routes");

app.use("/api/targets", targetRoutes);
app.use("/api/backups", backupRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/restores", restoreRoutes);

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

app.get("*", (req, res) => {
  res.redirect("/");
});

const PORT = process.env.PORT || 3011;

async function start() {
  console.log(`[mongo-vault] Starting server on port ${PORT}`);

  if (saasRouter.connectionPromise) {
    console.log("[mongo-vault] ⏳ Waiting for MongoDB connection...");

    const isConnected = await saasRouter.connectionPromise;
    if (!isConnected) {
      console.error(
        "[mongo-vault] ❌ Failed to connect to MongoDB. Check MONGODB_URI and authentication.",
      );
      process.exit(1);
    }
  }

  const scheduler = require("./services/scheduler.service");
  await scheduler.init();

  app.listen(PORT, () => {
    console.log(`[mongo-vault] Server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("[mongo-vault] Fatal startup error:", err);
  process.exit(1);
});
