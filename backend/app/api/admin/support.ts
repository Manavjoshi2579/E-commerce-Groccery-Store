import { RoleName } from "@prisma/client";
import { Router } from "express";
import { sendError, sendOk } from "../../../lib/http.js";
import { requireAdminRole } from "../../../middleware/auth.js";
import { getAdminSupportTicket, listAdminSupportTickets, updateAdminSupportTicket } from "../../../services/support.service.js";
import { adminSupportTicketSchema } from "../../../validators/support.js";

export const adminSupportRouter = Router();

const supportRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.ORDER_MANAGER, RoleName.SUPPORT_STAFF];

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

adminSupportRouter.get("/support/tickets", requireAdminRole(supportRoles), async (req, res) => {
  return sendOk(res, { tickets: await listAdminSupportTickets({ status: String(req.query.status || ""), priority: String(req.query.priority || ""), q: String(req.query.q || "") }) });
});

adminSupportRouter.get("/support/tickets/:id", requireAdminRole(supportRoles), async (req, res) => {
  try {
    return sendOk(res, { ticket: await getAdminSupportTicket(param(req.params.id)) });
  } catch (error) {
    return sendError(res, 404, error instanceof Error ? error.message : "Support ticket not found.");
  }
});

adminSupportRouter.patch("/support/tickets/:id", requireAdminRole(supportRoles), async (req, res) => {
  const parsed = adminSupportTicketSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid support update.");
  try {
    return sendOk(res, { ticket: await updateAdminSupportTicket(param(req.params.id), req.admin!.id, parsed.data) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not update support ticket.");
  }
});
