import type { NextFunction, Request, Response } from "express";
import { RoleName } from "@prisma/client";
import { ADMIN_COOKIE, CUSTOMER_COOKIE, verifySession } from "../lib/auth.js";
import { sendError } from "../lib/http.js";
import { hasRole } from "../lib/roles.js";
import { getAdminById, getCustomerById } from "../services/auth.service.js";

export async function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const payload = verifySession(req.cookies?.[CUSTOMER_COOKIE]);
  if (!payload || payload.kind !== "customer") {
    return sendError(res, 401, "Customer authentication required.", "CUSTOMER_AUTH_REQUIRED");
  }

  const customer = await getCustomerById(payload.sub);
  if (!customer) {
    return sendError(res, 401, "Customer account is not active.", "CUSTOMER_INACTIVE");
  }

  req.session = payload;
  req.customer = customer;
  return next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const payload = verifySession(req.cookies?.[ADMIN_COOKIE]);
  if (!payload || payload.kind !== "admin") {
    return sendError(res, 401, "Admin authentication required.", "ADMIN_AUTH_REQUIRED");
  }

  const admin = await getAdminById(payload.sub);
  if (!admin) {
    return sendError(res, 401, "Admin account is not active.", "ADMIN_INACTIVE");
  }

  req.session = payload;
  req.admin = admin;
  return next();
}

export function requireAdminRole(allowed: RoleName[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await requireAdmin(req, res, () => {
      if (!hasRole(req.admin?.role.name, allowed)) {
        return sendError(res, 403, "Admin role is not allowed for this action.", "ADMIN_ROLE_FORBIDDEN");
      }
      return next();
    });
  };
}
