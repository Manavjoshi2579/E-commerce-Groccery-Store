import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import type { Response } from "express";
import type { RoleName } from "@prisma/client";

export type SessionKind = "customer" | "admin";

export type SessionPayload = {
  sub: string;
  sid: string;
  kind: SessionKind;
  email?: string | null;
  role?: RoleName;
};

export const CUSTOMER_COOKIE = "ec_customer_session";
export const ADMIN_COOKIE = "ec_admin_session";
export const CUSTOMER_SESSION_MS = 1000 * 60 * 60 * 24 * 14;
export const ADMIN_SESSION_MS = 1000 * 60 * 30;

function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production.");
  }
  return "dev-eagleclub-session-secret-change-in-production";
}

export function hashSecret(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function signSession(payload: SessionPayload, expiresIn: SignOptions["expiresIn"]) {
  return jwt.sign(payload, secret(), { expiresIn });
}

export function verifySession(token?: string): SessionPayload | null {
  if (!token) return null;
  try {
    return jwt.verify(token, secret()) as SessionPayload;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, kind: SessionKind, token: string) {
  res.cookie(kind === "admin" ? ADMIN_COOKIE : CUSTOMER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: kind === "admin" ? ADMIN_SESSION_MS : CUSTOMER_SESSION_MS,
    path: "/",
    domain: process.env.COOKIE_DOMAIN || undefined,
  });
}

export function clearSessionCookie(res: Response, kind: SessionKind) {
  res.clearCookie(kind === "admin" ? ADMIN_COOKIE : CUSTOMER_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    domain: process.env.COOKIE_DOMAIN || undefined,
  });
}
