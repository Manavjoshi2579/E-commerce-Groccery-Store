import { RoleName } from "@prisma/client";
import { Router } from "express";
import { sendError, sendOk } from "../../../lib/http.js";
import { requireAdminRole } from "../../../middleware/auth.js";
import { requireAdminCapability } from "../../../middleware/rbac.js";
import { assignDelivery, getAdminOrder, listAdminOrders, updateAdminOrderStatus, updateDeliveryOrderStatus } from "../../../services/order.service.js";
import { createDeliverySlot, deleteDeliverySlot, listAdminSlots, updateDeliverySlot } from "../../../services/delivery.service.js";
import { db } from "../../../lib/db.js";
import { adminOrderStatusSchema, assignDeliverySchema, deliveryStaffSchema, deliverySlotAdminSchema } from "../../../validators/checkout.js";

export const adminOrderRouter = Router();

const orderViewRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.INVENTORY_MANAGER, RoleName.ORDER_MANAGER, RoleName.BILLING_STAFF, RoleName.DELIVERY_STAFF];
const orderManageRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.ORDER_MANAGER, RoleName.DELIVERY_STAFF];
const deliveryStaffManageRoles = [RoleName.SUPER_ADMIN, RoleName.DELIVERY_STAFF];

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

adminOrderRouter.get("/orders", requireAdminCapability("orders:read"), async (req, res) => sendOk(res, { orders: await listAdminOrders(req.db) }));

adminOrderRouter.get("/delivery-staff", requireAdminRole(orderViewRoles), async (_req, res) => {
  const staff = await db.deliveryStaff.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: { _count: { select: { assignments: true } } },
  });
  return sendOk(res, { staff });
});

adminOrderRouter.get("/delivery-slots", requireAdminRole(orderViewRoles), async (_req, res) => {
  return sendOk(res, { slots: await listAdminSlots() });
});

adminOrderRouter.post("/delivery-slots", requireAdminRole(orderManageRoles), async (req, res) => {
  const parsed = deliverySlotAdminSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid delivery slot.");
  return sendOk(res, { slot: await createDeliverySlot(parsed.data) }, 201);
});

adminOrderRouter.patch("/delivery-slots/:id", requireAdminRole(orderManageRoles), async (req, res) => {
  const parsed = deliverySlotAdminSchema.partial().safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid delivery slot.");
  return sendOk(res, { slot: await updateDeliverySlot(param(req.params.id), parsed.data) });
});

adminOrderRouter.delete("/delivery-slots/:id", requireAdminRole(orderManageRoles), async (req, res) => {
  try {
    return sendOk(res, await deleteDeliverySlot(param(req.params.id)));
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not delete delivery slot.");
  }
});

adminOrderRouter.post("/delivery-staff", requireAdminRole(deliveryStaffManageRoles), async (req, res) => {
  const parsed = deliveryStaffSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid delivery staff.");
  try {
    const existing = await db.deliveryStaff.findUnique({ where: { phone: parsed.data.phone } });
    if (existing?.active) return sendError(res, 409, "A delivery staff member with this phone already exists.");
    const staff = existing
      ? await db.deliveryStaff.update({ where: { id: existing.id }, data: { ...parsed.data, active: true }, include: { _count: { select: { assignments: true } } } })
      : await db.deliveryStaff.create({ data: parsed.data, include: { _count: { select: { assignments: true } } } });
    return sendOk(res, { staff }, 201);
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not create delivery staff.");
  }
});

adminOrderRouter.delete("/delivery-staff/:id", requireAdminRole(deliveryStaffManageRoles), async (req, res) => {
  try {
    const id = param(req.params.id);
    const staff = await db.deliveryStaff.findUnique({ where: { id }, include: { _count: { select: { assignments: true } } } });
    if (!staff) return sendError(res, 404, "Delivery staff not found.");
    if (staff._count.assignments > 0) {
      await db.deliveryStaff.update({ where: { id }, data: { active: false } });
      return sendOk(res, { deleted: false, deactivated: true });
    }
    await db.deliveryStaff.delete({ where: { id } });
    return sendOk(res, { deleted: true, deactivated: false });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not delete delivery staff.");
  }
});

adminOrderRouter.get("/orders/:id", requireAdminCapability("orders:read"), async (req, res) => {
  try {
    return sendOk(res, { order: await getAdminOrder(param(req.params.id), req.db) });
  } catch (error) {
    return sendError(res, 404, error instanceof Error ? error.message : "Order not found.");
  }
});

adminOrderRouter.patch("/orders/:id/delivery-status", requireAdminCapability("delivery:update_own_status"), async (req, res) => {
  const parsed = adminOrderStatusSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid delivery status.");
  try {
    return sendOk(res, { order: await updateDeliveryOrderStatus(param(req.params.id), parsed.data.status, req.db!) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not update delivery status.");
  }
});

adminOrderRouter.patch("/orders/:id/status", requireAdminRole(orderManageRoles), async (req, res) => {
  const parsed = adminOrderStatusSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid order status.");
  try {
    return sendOk(res, { order: await updateAdminOrderStatus(param(req.params.id), parsed.data.status, req.admin!.id) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not update order.");
  }
});

adminOrderRouter.post("/orders/:id/assign-delivery", requireAdminRole(orderManageRoles), async (req, res) => {
  const parsed = assignDeliverySchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid delivery assignment.");
  try {
    return sendOk(res, { order: await assignDelivery(param(req.params.id), parsed.data.deliveryStaffId) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not assign delivery.");
  }
});

adminOrderRouter.post("/orders/:id/cancel", requireAdminRole(orderManageRoles), async (req, res) => {
  try {
    return sendOk(res, { order: await updateAdminOrderStatus(param(req.params.id), "CANCELLED", req.admin!.id) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not cancel order.");
  }
});
