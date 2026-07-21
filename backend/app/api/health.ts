import { Router } from "express";
import { databaseCounts, checkDatabaseConnection } from "../../lib/db-health.js";
import { readinessConfig } from "../../lib/env.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const database = await checkDatabaseConnection();
  return res.status(database.connected ? 200 : 503).json({
    app: "ok",
    database: database.connected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
    ...(database.connected ? {} : { error: database.error }),
  });
});

healthRouter.get("/health/db", async (_req, res) => {
  const database = await checkDatabaseConnection();
  if (!database.connected) {
    return res.status(503).json({
      database: "disconnected",
      error: database.error,
      timestamp: new Date().toISOString(),
    });
  }
  return res.json({
    database: "connected",
    counts: await databaseCounts(),
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get("/ready", async (_req, res) => {
  const database = await checkDatabaseConnection();
  const config = readinessConfig();
  const ready = database.connected && config.databaseUrl && (process.env.NODE_ENV !== "production" || (config.jwtSecret && config.frontendOrigin));
  return res.status(ready ? 200 : 503).json({
    ready,
    database: database.connected ? "connected" : "disconnected",
    config,
    timestamp: new Date().toISOString(),
    ...(database.connected ? {} : { error: database.error }),
  });
});
