import { db } from "./db.js";

export const databaseConnectionMessage = "Database connection failed. Please check backend database configuration.";

export function isDatabaseError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    ["P1000", "P1001", "P1002", "P1003", "P1010", "P1017"].includes(code) ||
    /database server|can't reach|connect.*database|connection.*database|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|DATABASE_URL|Environment variable not found/i.test(message)
  );
}

export function publicErrorMessage(error: unknown, fallback: string) {
  return isDatabaseError(error) ? databaseConnectionMessage : error instanceof Error ? error.message : fallback;
}

export async function checkDatabaseConnection() {
  if (!process.env.DATABASE_URL) {
    return { connected: false, error: "DATABASE_URL is missing." };
  }
  try {
    await db.$queryRaw`SELECT 1`;
    return { connected: true, error: null };
  } catch (error) {
    return { connected: false, error: error instanceof Error ? error.message : "Unknown database error." };
  }
}

export async function databaseCounts() {
  const [users, admins, categories, products, orders, payments] = await Promise.all([
    db.user.count(),
    db.adminUser.count(),
    db.category.count(),
    db.product.count(),
    db.order.count(),
    db.payment.count(),
  ]);
  return { users, admins, categories, products, orders, payments };
}
