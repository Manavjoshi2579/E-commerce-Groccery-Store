import { RoleName } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { db } from "../lib/db.js";
import { sendError } from "../lib/http.js";
import { prismaForAdmin } from "../lib/prisma-rbac.js";
import { type Capability, hasCapability } from "../lib/rbac.js";
import { requireAdmin } from "./auth.js";

async function resolveDeliveryStaffId(req: Request) {
  if (req.admin?.role.name !== RoleName.DELIVERY_STAFF) return null;

  const directNameMatch = await db.deliveryStaff.findFirst({
    where: { active: true, name: req.admin.name },
    select: { id: true },
  });
  if (directNameMatch) return directNameMatch.id;

  return null;
}

export function requireAdminCapability(capability: Capability) {
  return async (req: Request, res: Response, next: NextFunction) => {
    await requireAdmin(req, res, async () => {
      const role = req.admin?.role.name;
      if (!hasCapability(role, capability)) {
        return sendError(res, 403, "Admin role is not allowed for this action.", "ADMIN_ROLE_FORBIDDEN");
      }

      req.db = prismaForAdmin({
        adminUserId: req.admin!.id,
        role: role!,
        deliveryStaffId: await resolveDeliveryStaffId(req),
      });

      return next();
    });
  };
}
