import type { NextFunction, Request, Response } from "express";
import { RoleName } from "@prisma/client";
import { ADMIN_COOKIE, CUSTOMER_COOKIE, verifySession } from "../lib/auth.js";
import { sendError } from "../lib/http.js";
import { hasRole } from "../lib/roles.js";
import { getAdminById, getCustomerById, validateDbSession } from "../services/auth.service.js";

export async function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const payload = verifySession(req.cookies?.[CUSTOMER_COOKIE]);
  if (!payload || payload.kind !== "customer" || !(await validateDbSession(payload, "customer"))) {
    return sendError(res, 401, "Customer authentication required.", "AUTH_SESSION_EXPIRED");
  }

  const customer = await getCustomerById(payload.sub);
  if (!customer) {
    return sendError(res, 401, "Customer account is not active.", "AUTH_FORBIDDEN");
  }

  req.session = payload;
  req.customer = customer;
  return next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const payload = verifySession(req.cookies?.[ADMIN_COOKIE]);
  if (!payload || payload.kind !== "admin" || !(await validateDbSession(payload, "admin"))) {
    return sendError(res, 401, "Admin authentication required.", "AUTH_SESSION_EXPIRED");
  }

  const admin = await getAdminById(payload.sub);
  if (!admin) {
    return sendError(res, 401, "Admin account is not active.", "AUTH_FORBIDDEN");
  }

  req.session = payload;
  req.admin = admin;
  return next();
}

export function requireAdminRole(allowed: RoleName[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await requireAdmin(req, res, () => {
      if (!hasRole(req.admin?.role.name, allowed)) {
        return sendError(res, 403, "Admin role is not allowed for this action.", "AUTH_FORBIDDEN");
      }
      return next();
    });
  };
}
