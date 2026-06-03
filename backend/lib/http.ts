import type { Request, Response } from "express";

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
  return res.status(status).json({ ok: false, error: { message, code } } satisfies ApiError);
}

export function isProduction(req?: Request) {
  return process.env.NODE_ENV === "production" || req?.protocol === "https";
}
