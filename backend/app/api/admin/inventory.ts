import { Router } from "express";
import { sendError, sendOk } from "../../../lib/http.js";
import { requireAdminRole } from "../../../middleware/auth.js";
import { adjustInventory, getPosMetrics, inventoryRoles, listInventory, listOfflineSales, listOfflineSyncConflicts, listStockMovements, lookupPosInventory, posRoles, recordOfflineSale, recordStockInward, resolveOfflineSyncConflict, searchPosInventory, syncOfflineSales, updateInventory } from "../../../services/inventory.service.js";
import { inventoryAdjustSchema, inventoryPatchSchema, offlineSaleSchema, offlineSaleSyncSchema, offlineSyncConflictResolutionSchema, stockInwardSchema } from "../../../validators/checkout.js";

export const adminInventoryRouter = Router();

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

adminInventoryRouter.get("/inventory", requireAdminRole(inventoryRoles), async (_req, res) => sendOk(res, { inventory: await listInventory() }));

adminInventoryRouter.get("/inventory/pos-search", requireAdminRole(posRoles), async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  return sendOk(res, { inventory: await searchPosInventory(q) });
});

adminInventoryRouter.get("/inventory/pos-lookup", requireAdminRole(posRoles), async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  try {
    return sendOk(res, await lookupPosInventory(code));
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not resolve scan code.");
  }
});

adminInventoryRouter.get("/inventory/pos-metrics", requireAdminRole(posRoles), async (req, res) => {
  const deviceQueued = typeof req.query.deviceQueued === "string" ? Number(req.query.deviceQueued) : 0;
  return sendOk(res, { metrics: await getPosMetrics({ deviceQueued: Number.isFinite(deviceQueued) ? deviceQueued : 0 }) });
});

adminInventoryRouter.get("/inventory/offline-sales", requireAdminRole(posRoles), async (req, res) => {
  return sendOk(res, await listOfflineSales({
    q: typeof req.query.q === "string" ? req.query.q : undefined,
    paymentMethod: typeof req.query.paymentMethod === "string" ? req.query.paymentMethod : undefined,
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    page: typeof req.query.page === "string" ? Number(req.query.page) : undefined,
    pageSize: typeof req.query.pageSize === "string" ? Number(req.query.pageSize) : undefined,
  }));
});

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

adminInventoryRouter.post("/inventory/inward", requireAdminRole(inventoryRoles), async (req, res) => {
  const parsed = stockInwardSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid stock inward payload.");
  try {
    return sendOk(res, { inventory: await recordStockInward(req.admin!.id, parsed.data) }, 201);
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not record stock inward.");
  }
});

adminInventoryRouter.post("/inventory/offline-sales", requireAdminRole(posRoles), async (req, res) => {
  const parsed = offlineSaleSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid offline sale payload.");
  try {
    return sendOk(res, { sale: await recordOfflineSale(req.admin!.id, parsed.data) }, 201);
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not record offline sale.");
  }
});

adminInventoryRouter.post("/inventory/offline-sync", requireAdminRole(posRoles), async (req, res) => {
  const parsed = offlineSaleSyncSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid offline sync payload.");
  return sendOk(res, { results: await syncOfflineSales(req.admin!.id, parsed.data) });
});

adminInventoryRouter.get("/inventory/offline-sync-conflicts", requireAdminRole(inventoryRoles), async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  return sendOk(res, { conflicts: await listOfflineSyncConflicts({ status, q }) });
});

adminInventoryRouter.patch("/inventory/offline-sync-conflicts/:id", requireAdminRole(inventoryRoles), async (req, res) => {
  const parsed = offlineSyncConflictResolutionSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid conflict resolution payload.");
  try {
    return sendOk(res, { conflict: await resolveOfflineSyncConflict(param(req.params.id), req.admin!.id, parsed.data) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not resolve sync conflict.");
  }
});
