import cookieParser from "cookie-parser";
import compression from "compression";
import cors from "cors";
import express from "express";
import { catalogRouter } from "./api/catalog.js";
import { cartRouter } from "./api/cart.js";
import { checkoutRouter } from "./api/checkout.js";
import { couponRouter } from "./api/coupons.js";
import { accountRouter } from "./api/account.js";
import { deliveryRouter } from "./api/delivery.js";
import { faqRouter } from "./api/faqs.js";
import { customerAuthRouter } from "./api/auth.js";
import { orderRouter } from "./api/orders.js";
import { paymentRouter, razorpayWebhookHandler } from "./api/payments.js";
import { wishlistRouter } from "./api/wishlist.js";
import { adminAuthRouter } from "./api/admin/auth.js";
import { adminCatalogRouter } from "./api/admin/catalog.js";
import { adminCouponRouter } from "./api/admin/coupons.js";
import { adminCustomerRouter } from "./api/admin/customers.js";
import { adminInventoryRouter } from "./api/admin/inventory.js";
import { adminFaqRouter } from "./api/admin/faqs.js";
import { adminMiscRouter } from "./api/admin/misc.js";
import { adminOrderRouter } from "./api/admin/orders.js";
import { adminSupportRouter } from "./api/admin/support.js";
import { healthRouter } from "./api/health.js";
import { supportRouter } from "./api/support.js";
import { databaseConnectionMessage, isDatabaseError } from "../lib/db-health.js";
import { sendError } from "../lib/http.js";
import { logger } from "../lib/logger.js";
import { csrfProtection } from "../middleware/csrf.js";
import { adminMutationRateLimit } from "../middleware/rate-limit.js";

function allowedOrigins() {
  const configured = process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN || "http://localhost:3000";
  return configured.split(",").map((origin) => origin.trim()).filter(Boolean);
}

function cacheHeaders(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.method !== "GET") {
    res.setHeader("Cache-Control", "no-store");
    return next();
  }
  const path = req.path;
  const publicCatalog = ["/api/catalog/home", "/api/categories", "/api/brands"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    || path.startsWith("/api/products")
    || path.startsWith("/api/search");
  if (publicCatalog) {
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
    res.setHeader("Vary", "Accept-Encoding");
    return next();
  }
  if (path.startsWith("/api/admin") || path.startsWith("/api/account") || path.startsWith("/api/cart") || path.startsWith("/api/orders") || path.startsWith("/api/wishlist")) {
    res.setHeader("Cache-Control", "private, no-store");
  }
  return next();
}

function requestTimeout(req: express.Request, res: express.Response, next: express.NextFunction) {
  const timeoutMs = Number(process.env.API_REQUEST_TIMEOUT_MS || 15000);
  const timer = setTimeout(() => {
    if (res.headersSent) return;
    logger.warn("api_request_timeout", { method: req.method, path: req.path, timeoutMs });
    sendError(res, 503, "Request timed out. Please try again.", "REQUEST_TIMEOUT");
  }, timeoutMs);
  res.on("finish", () => clearTimeout(timer));
  res.on("close", () => clearTimeout(timer));
  next();
}

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("etag", "strong");
  app.set("trust proxy", 1);
  app.use(compression({ threshold: 1024 }));
  app.use(requestTimeout);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  app.use(cacheHeaders);
  app.use(cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins().includes(origin)) return callback(null, true);
      return callback(new Error("CORS origin is not allowed."));
    },
    credentials: true,
  }));
  app.post("/api/payments/razorpay/webhook", express.raw({ type: "application/json" }), razorpayWebhookHandler);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(csrfProtection);

  app.get("/health", (_req, res) => res.json({ ok: true, service: "eagleclub-backend" }));
  app.use("/api", healthRouter);
  app.use("/api/auth", customerAuthRouter);
  app.use("/api/admin/auth", adminAuthRouter);
  app.use("/api/admin", adminMutationRateLimit, adminCatalogRouter);
  app.use("/api/admin", adminMutationRateLimit, adminCouponRouter);
  app.use("/api/admin", adminMutationRateLimit, adminCustomerRouter);
  app.use("/api/admin", adminMutationRateLimit, adminOrderRouter);
  app.use("/api/admin", adminMutationRateLimit, adminInventoryRouter);
  app.use("/api/admin", adminMutationRateLimit, adminFaqRouter);
  app.use("/api/admin", adminMutationRateLimit, adminMiscRouter);
  app.use("/api/admin", adminMutationRateLimit, adminSupportRouter);
  app.use("/api/account", accountRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/cart", cartRouter);
  app.use("/api/checkout", checkoutRouter);
  app.use("/api/delivery", deliveryRouter);
  app.use("/api", faqRouter);
  app.use("/api/orders", orderRouter);
  app.use("/api/payments", paymentRouter);
  app.use("/api/wishlist", wishlistRouter);
  app.use("/api/coupons", couponRouter);
  app.use("/api", catalogRouter);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (isDatabaseError(error)) return sendError(res, 503, databaseConnectionMessage, "DATABASE_CONNECTION_FAILED");
    return sendError(res, 500, error instanceof Error ? error.message : "Unexpected server error.");
  });

  return app;
}
