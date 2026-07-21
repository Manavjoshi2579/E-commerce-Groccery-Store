import type { NextFunction, Request, Response } from "express";
import { sendError } from "../lib/http.js";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

type Options = {
  windowMs: number;
  max: number;
  keyPrefix: string;
  message?: string;
};

function clientKey(req: Request) {
  const actor = req.body?.email || req.body?.phone || req.ip || "anonymous";
  return String(actor).trim().toLowerCase();
}

export function rateLimit(options: Options) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === "test") return next();
    const now = Date.now();
    const key = `${options.keyPrefix}:${clientKey(req)}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count <= options.max) return next();
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return sendError(res, 429, `${options.message ?? "Too many requests. Please try again shortly."} Retry after ${retryAfter} seconds.`, "RATE_LIMITED");
  };
}

export const strictAuthRateLimit = rateLimit({ keyPrefix: "auth", windowMs: 15 * 60 * 1000, max: 10 });
export const otpRateLimit = rateLimit({ keyPrefix: "otp", windowMs: 15 * 60 * 1000, max: 5 });
export const paymentRateLimit = rateLimit({ keyPrefix: "payment", windowMs: 60 * 1000, max: 20 });
export const adminMutationRateLimit = rateLimit({ keyPrefix: "admin-mutation", windowMs: 60 * 1000, max: 120 });
