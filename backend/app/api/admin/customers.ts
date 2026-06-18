import { Router } from "express";
import { UserStatus } from "@prisma/client";
import { sendError, sendOk } from "../../../lib/http.js";
import { requireAdminRole } from "../../../middleware/auth.js";
import { customerManageRoles, customerRoles, listAdminCustomers, softDeleteAdminCustomer, updateAdminCustomerStatus } from "../../../services/customer.service.js";

export const adminCustomerRouter = Router();

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

adminCustomerRouter.get("/customers", requireAdminRole(customerRoles), async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  return sendOk(res, { customers: await listAdminCustomers(q) });
});

adminCustomerRouter.patch("/customers/:id/status", requireAdminRole(customerManageRoles), async (req, res) => {
  const status = String(req.body?.status || "").toUpperCase();
  if (!Object.values(UserStatus).includes(status as UserStatus)) return sendError(res, 400, "Invalid customer status.");
  try {
    return sendOk(res, { customer: await updateAdminCustomerStatus(param(req.params.id), status as UserStatus) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not update customer status.");
  }
});

adminCustomerRouter.delete("/customers/:id", requireAdminRole(customerManageRoles), async (req, res) => {
  try {
    return sendOk(res, await softDeleteAdminCustomer(param(req.params.id)));
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not delete customer.");
  }
});
