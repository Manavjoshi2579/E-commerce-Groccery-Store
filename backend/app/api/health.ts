import { Router } from "express";
import { databaseCounts, checkDatabaseConnection } from "../../lib/db-health.js";

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
