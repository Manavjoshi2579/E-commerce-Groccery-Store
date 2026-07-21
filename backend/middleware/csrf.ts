import type { NextFunction, Request, Response } from "express";
import { sendError } from "../lib/http.js";

function allowedOrigins() {
  const configured = process.env.FRONTEND_ORIGIN || process.env.CORS_ORIGIN || "http://localhost:3000";
  return new Set(configured.split(",").map((origin) => origin.trim()).filter(Boolean));
}

function requestOrigin(req: Request) {
  const origin = req.get("origin");
  if (origin) return origin;
  const referer = req.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.path === "/api/payments/razorpay/webhook") return next();
  const origin = requestOrigin(req);
  if (!origin && process.env.NODE_ENV !== "production") return next();
  if (origin && allowedOrigins().has(origin)) return next();
  return sendError(res, 403, "Security check failed. Please refresh and try again.", "CSRF_FORBIDDEN");
}
