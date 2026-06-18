import { Router } from "express";
import { sendError, sendOk } from "../../../lib/http.js";
import { requireAdminRole } from "../../../middleware/auth.js";
import { adjustInventory, inventoryRoles, listInventory, listStockMovements, updateInventory } from "../../../services/inventory.service.js";
import { inventoryAdjustSchema, inventoryPatchSchema } from "../../../validators/checkout.js";

export const adminInventoryRouter = Router();

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

adminInventoryRouter.get("/inventory", requireAdminRole(inventoryRoles), async (_req, res) => sendOk(res, { inventory: await listInventory() }));

adminInventoryRouter.patch("/inventory/:id", requireAdminRole(inventoryRoles), async (req, res) => {
  const parsed = inventoryPatchSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid inventory payload.");
  return sendOk(res, { inventory: await updateInventory(param(req.params.id), parsed.data) });
});

adminInventoryRouter.post("/inventory/:id/adjust", requireAdminRole(inventoryRoles), async (req, res) => {
  const parsed = inventoryAdjustSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid adjustment payload.");
  try {
    return sendOk(res, { inventory: await adjustInventory(param(req.params.id), parsed.data.quantity, req.admin!.id, parsed.data.note) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not adjust inventory.");
  }
});

adminInventoryRouter.get("/inventory/movements", requireAdminRole(inventoryRoles), async (_req, res) => sendOk(res, { movements: await listStockMovements() }));
