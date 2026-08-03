import { RoleName } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { sendError, sendOk } from "../../../lib/http.js";
import { requireAdminRole } from "../../../middleware/auth.js";
import { requireAdminCapability } from "../../../middleware/rbac.js";
import { assignDelivery, getAdminOrder, listAdminOrders, listDeliveryOperationsOrders, markDeliveryAttemptFailed, updateAdminOrderStatus, updateAdminPaymentStatus, updateDeliveryOrderStatus } from "../../../services/order.service.js";
import { createDeliverySlot, deleteDeliverySlot, listAdminSlots, updateDeliverySlot } from "../../../services/delivery.service.js";
import { db } from "../../../lib/db.js";
import { adminOrderStatusSchema, adminPaymentStatusSchema, assignDeliverySchema, deliveryFailureSchema, deliveryStaffSchema, deliverySlotAdminSchema } from "../../../validators/checkout.js";

export const adminOrderRouter = Router();

const orderViewRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.INVENTORY_MANAGER, RoleName.ORDER_MANAGER, RoleName.BILLING_STAFF, RoleName.DELIVERY_STAFF];
const orderManageRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.ORDER_MANAGER];
const deliveryStaffManageRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.ORDER_MANAGER];

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

async function handlePaymentStatusUpdate(req: Request, res: Response) {
  const parsed = adminPaymentStatusSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid payment status.");
  try {
    return sendOk(res, { order: await updateAdminPaymentStatus(param(req.params.id), parsed.data.status, { note: parsed.data.note, actorRole: req.admin?.role.name, actorId: req.admin?.id }, req.db!) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not update payment status.");
  }
}

adminOrderRouter.get("/orders", requireAdminCapability("orders:read"), async (req, res) => {
  const orders = req.admin?.role.name === RoleName.DELIVERY_STAFF ? await listDeliveryOperationsOrders() : await listAdminOrders(req.db);
  return sendOk(res, { orders });
});

adminOrderRouter.get("/notifications", requireAdminCapability("orders:read"), async (req, res) => {
  const since = typeof req.query.since === "string" ? new Date(req.query.since) : null;
  const sinceFilter = since && !Number.isNaN(since.getTime()) ? since : new Date(Date.now() - 1000 * 60 * 60 * 24);
  const [orders, confirmations, failedAssignments, supportTickets, returns, reviews, offlineSales] = await Promise.all([
    db.order.findMany({ where: { createdAt: { gte: sinceFilter } }, orderBy: { createdAt: "desc" }, take: 10, select: { orderNumber: true, customerName: true, status: true, createdAt: true } }),
    db.customerDeliveryConfirmation.findMany({ where: { confirmedAt: { gte: sinceFilter } }, orderBy: { confirmedAt: "desc" }, take: 10, include: { order: { select: { orderNumber: true, customerName: true } } } }),
    db.deliveryAssignment.findMany({ where: { OR: [{ failedAt: { gte: sinceFilter } }, { deliveredAt: { gte: sinceFilter } }, { outForDeliveryAt: { gte: sinceFilter } }] }, orderBy: { assignedAt: "desc" }, take: 10, include: { order: { select: { orderNumber: true, customerName: true } }, deliveryStaff: { select: { name: true } } } }),
    db.supportTicket.findMany({ where: { createdAt: { gte: sinceFilter } }, orderBy: { createdAt: "desc" }, take: 10, select: { ticketNumber: true, subject: true, createdAt: true } }),
    db.returnRequest.findMany({ where: { createdAt: { gte: sinceFilter } }, orderBy: { createdAt: "desc" }, take: 10, include: { order: { select: { orderNumber: true } }, user: { select: { name: true } } } }),
    db.review.findMany({ where: { createdAt: { gte: sinceFilter } }, orderBy: { createdAt: "desc" }, take: 10, include: { product: { select: { name: true } }, user: { select: { name: true } } } }),
    db.offlineSale.findMany({ where: { createdAt: { gte: sinceFilter } }, orderBy: { createdAt: "desc" }, take: 10, select: { referenceNumber: true, total: true, paymentMethod: true, createdAt: true } }),
  ]);
  const events = [
    ...orders.map((order) => ({ id: `order:${order.orderNumber}`, type: "ORDER", title: "New order", message: `${order.orderNumber} from ${order.customerName}`, href: `/admin/orders/${order.orderNumber}`, createdAt: order.createdAt })),
    ...confirmations.map((item) => ({ id: `receipt:${item.id}`, type: "DELIVERY", title: "Customer confirmed receipt", message: `${item.order.orderNumber} confirmed by ${item.order.customerName}`, href: `/admin/delivery`, createdAt: item.confirmedAt })),
    ...failedAssignments.map((item) => ({ id: `delivery:${item.id}:${item.failedAt || item.deliveredAt || item.outForDeliveryAt || item.assignedAt}`, type: "DELIVERY", title: item.failedAt ? "Delivery attempt failed" : item.deliveredAt ? "Delivery completed" : "Out for delivery", message: `${item.order.orderNumber} - ${item.deliveryStaff.name}`, href: `/admin/delivery`, createdAt: item.failedAt || item.deliveredAt || item.outForDeliveryAt || item.assignedAt })),
    ...supportTickets.map((ticket) => ({ id: `support:${ticket.ticketNumber}`, type: "SUPPORT", title: "New support ticket", message: `${ticket.ticketNumber} - ${ticket.subject}`, href: `/admin/support`, createdAt: ticket.createdAt })),
    ...returns.map((item) => ({ id: `return:${item.id}`, type: "RETURN", title: "Return requested", message: `${item.order.orderNumber} - ${item.user.name}`, href: `/admin/returns`, createdAt: item.createdAt })),
    ...reviews.map((review) => ({ id: `review:${review.id}`, type: "REVIEW", title: "New review", message: `${review.product.name} - ${review.user.name}`, href: `/admin/reviews`, createdAt: review.createdAt })),
    ...offlineSales.map((sale) => ({ id: `pos:${sale.referenceNumber}`, type: "POS", title: "POS sale recorded", message: `${sale.referenceNumber} - ${sale.paymentMethod}`, href: `/admin/pos`, createdAt: sale.createdAt })),
  ];
  const visibleEvents = req.admin?.role.name === RoleName.DELIVERY_STAFF
    ? events.filter((event) => event.type === "ORDER" || event.type === "DELIVERY").map((event) => ({ ...event, href: "/admin/delivery" }))
    : events;
  const sortedEvents = visibleEvents.sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt))).slice(0, 20);
  return sendOk(res, { events: sortedEvents, unreadCount: sortedEvents.length, generatedAt: new Date().toISOString() });
});
adminOrderRouter.get("/delivery-orders", requireAdminCapability("delivery:read"), async (_req, res) => sendOk(res, { orders: await listDeliveryOperationsOrders() }));

adminOrderRouter.get("/delivery-staff", requireAdminRole(deliveryStaffManageRoles), async (_req, res) => {
  const staff = await db.deliveryStaff.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: { _count: { select: { assignments: true } } },
  });
  return sendOk(res, { staff });
});

adminOrderRouter.get("/delivery-slots", requireAdminRole(orderManageRoles), async (_req, res) => {
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

adminOrderRouter.post("/orders/:id/delivery-failure", requireAdminCapability("delivery:update_own_status"), async (req, res) => {
  const parsed = deliveryFailureSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid delivery failure.");
  try {
    return sendOk(res, { order: await markDeliveryAttemptFailed(param(req.params.id), parsed.data, req.db!) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not record delivery attempt.");
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

adminOrderRouter.patch("/orders/:id/payment-status", requireAdminCapability("payments:update"), handlePaymentStatusUpdate);
adminOrderRouter.patch("/orders/:id/payment", requireAdminCapability("payments:update"), handlePaymentStatusUpdate);
adminOrderRouter.patch("/payments/:id/status", requireAdminCapability("payments:update"), handlePaymentStatusUpdate);
adminOrderRouter.patch("/payments/:id/payment-status", requireAdminCapability("payments:update"), handlePaymentStatusUpdate);

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
