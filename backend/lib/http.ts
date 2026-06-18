import type { Request, Response } from "express";
import { databaseConnectionMessage } from "./db-health.js";

export type ApiResult<T> = {
  ok: true;
  data: T;
};

export type ApiError = {
  ok: false;
  error: {
    message: string;
    code?: string;
  };
};

export function sendOk<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ ok: true, data } satisfies ApiResult<T>);
}

export function sendError(res: Response, status: number, message: string, code?: string) {
  const dbFailed = /database server|can't reach|connect.*database|connection.*database|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|DATABASE_URL|Environment variable not found/i.test(message);
  return res.status(dbFailed ? 503 : status).json({ ok: false, error: { message: dbFailed ? databaseConnectionMessage : message, code: dbFailed ? "DATABASE_CONNECTION_FAILED" : code } } satisfies ApiError);
}

export function isProduction(req?: Request) {
  return process.env.NODE_ENV === "production" || req?.protocol === "https";
}
