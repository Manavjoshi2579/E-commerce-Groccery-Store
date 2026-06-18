import { AdminStatus, OrderStatus, PaymentStatus, Prisma, RefundStatus, ReturnStatus, ReviewStatus, RoleName, SettingType, StockMovementType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { sendError, sendOk } from "../../../lib/http.js";
import { db } from "../../../lib/db.js";
import { requireAdminRole } from "../../../middleware/auth.js";

export const adminMiscRouter = Router();

const superRoles = [RoleName.SUPER_ADMIN];
const opsRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.ORDER_MANAGER, RoleName.SUPPORT_STAFF];
const reportRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.INVENTORY_MANAGER, RoleName.ORDER_MANAGER, RoleName.BILLING_STAFF];

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

async function restockReturn(tx: Prisma.TransactionClient, returnId: string, adminUserId: string) {
  const returnRequest = await tx.returnRequest.findUnique({
    where: { id: returnId },
    include: { order: { include: { items: true } }, orderItem: true },
  });
  if (!returnRequest) throw new Error("Return request not found.");

  const items = returnRequest.orderItem ? [returnRequest.orderItem] : returnRequest.order.items;
  for (const item of items) {
    const note = `Return ${returnRequest.id}:${item.id}`;
    const existing = await tx.stockMovement.findFirst({ where: { orderId: returnRequest.orderId, type: StockMovementType.RETURN, note } });
    if (existing) continue;
    const inventory = await tx.inventory.findFirst({ where: { productId: item.productId, variantId: item.variantId } });
    if (!inventory) continue;
    await tx.inventory.update({ where: { id: inventory.id }, data: { stock: { increment: item.quantity } } });
    await tx.stockMovement.create({
      data: {
        inventoryId: inventory.id,
        productId: item.productId,
        variantId: item.variantId,
        type: StockMovementType.RETURN,
        quantity: item.quantity,
        orderId: returnRequest.orderId,
        adminUserId,
        note,
      },
    });
  }
}

function decimal(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

async function calculateRefundAmount(tx: Prisma.TransactionClient, returnId: string) {
  const returnRequest = await tx.returnRequest.findUnique({
    where: { id: returnId },
    include: { order: { include: { items: true } }, orderItem: true },
  });
  if (!returnRequest) throw new Error("Return request not found.");
  if (returnRequest.orderItem) return decimal(returnRequest.orderItem.lineTotal);
  return decimal(returnRequest.order.grandTotal);
}

async function ensureRefund(tx: Prisma.TransactionClient, returnId: string, status: RefundStatus = RefundStatus.REQUESTED, amount?: number) {
  const returnRequest = await tx.returnRequest.findUnique({ where: { id: returnId }, include: { order: { include: { payment: true } }, refunds: true } });
  if (!returnRequest) throw new Error("Return request not found.");
  if (!returnRequest.order.payment) throw new Error("Payment record not found for this order.");
  const refundAmount = amount ?? await calculateRefundAmount(tx, returnId);
  const existing = returnRequest.refunds[0];
  if (existing) {
    return tx.refund.update({ where: { id: existing.id }, data: { amount: refundAmount, status } });
  }
  return tx.refund.create({
    data: {
      returnRequestId: returnId,
      paymentId: returnRequest.order.payment.id,
      amount: refundAmount,
      status,
    },
  });
}

adminMiscRouter.get("/returns", requireAdminRole(opsRoles), async (req, res) => {
  const q = String(req.query.q || "").trim();
  const status = String(req.query.status || "").trim() as ReturnStatus | "";
  const returns = await db.returnRequest.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [
        { reason: { contains: q } },
        { order: { orderNumber: { contains: q } } },
        { user: { name: { contains: q } } },
        { user: { phone: { contains: q } } },
      ] } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      order: { select: { orderNumber: true, grandTotal: true, paymentStatus: true, status: true } },
      orderItem: { include: { product: { select: { name: true, sku: true } } } },
      refunds: true,
    },
  });
  return sendOk(res, { returns });
});

adminMiscRouter.patch("/returns/:id/status", requireAdminRole(opsRoles), async (req, res) => {
  const parsed = z.object({ status: z.nativeEnum(ReturnStatus) }).safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid return status.");
  try {
    const item = await db.$transaction(async (tx) => {
      const id = param(req.params.id);
      const updated = await tx.returnRequest.update({ where: { id }, data: { status: parsed.data.status } });
      if (parsed.data.status === ReturnStatus.APPROVED) await ensureRefund(tx, id, RefundStatus.REQUESTED);
      if (parsed.data.status === ReturnStatus.COMPLETED) {
        await restockReturn(tx, id, req.admin!.id);
        await ensureRefund(tx, id, RefundStatus.PROCESSING);
      }
      if (parsed.data.status === ReturnStatus.REJECTED) {
        const activeReturns = await tx.returnRequest.count({
          where: { orderId: updated.orderId, id: { not: updated.id }, status: { not: ReturnStatus.REJECTED } },
        });
        if (!activeReturns) await tx.order.update({ where: { id: updated.orderId }, data: { status: OrderStatus.DELIVERED } });
      }
      return tx.returnRequest.findUnique({
        where: { id },
        include: {
          user: { select: { name: true, email: true, phone: true } },
          order: { select: { orderNumber: true, grandTotal: true, paymentStatus: true, status: true } },
          orderItem: { include: { product: { select: { name: true, sku: true } } } },
          refunds: true,
        },
      });
    });
    return sendOk(res, { return: item });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not update return.");
  }
});

adminMiscRouter.patch("/returns/:id/refund", requireAdminRole(reportRoles), async (req, res) => {
  const parsed = z.object({
    amount: z.coerce.number().positive().optional(),
    status: z.nativeEnum(RefundStatus),
  }).safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid refund payload.");
  try {
    const item = await db.$transaction(async (tx) => {
      const id = param(req.params.id);
      const refund = await ensureRefund(tx, id, parsed.data.status, parsed.data.amount);
      const freshRefund = await tx.refund.findUniqueOrThrow({ where: { id: refund.id }, include: { returnRequest: true, payment: true } });
      if (parsed.data.status === RefundStatus.COMPLETED) {
        await tx.payment.update({ where: { id: freshRefund.paymentId }, data: { status: PaymentStatus.REFUNDED } });
        await tx.order.update({ where: { id: freshRefund.payment.orderId }, data: { status: OrderStatus.REFUNDED, paymentStatus: PaymentStatus.REFUNDED } });
        await tx.returnRequest.update({ where: { id }, data: { status: ReturnStatus.COMPLETED } });
        await restockReturn(tx, id, req.admin!.id);
      }
      return tx.returnRequest.findUnique({
        where: { id },
        include: {
          user: { select: { name: true, email: true, phone: true } },
          order: { select: { orderNumber: true, grandTotal: true, paymentStatus: true, status: true } },
          orderItem: { include: { product: { select: { name: true, sku: true } } } },
          refunds: true,
        },
      });
    });
    return sendOk(res, { return: item });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not update refund.");
  }
});

adminMiscRouter.get("/reviews", requireAdminRole(opsRoles), async (req, res) => {
  const q = String(req.query.q || "").trim();
  const status = String(req.query.status || "").trim() as ReviewStatus | "";
  const reviews = await db.review.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [
        { comment: { contains: q } },
        { product: { name: { contains: q } } },
        { user: { name: { contains: q } } },
      ] } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      product: { select: { name: true, sku: true } },
    },
  });
  return sendOk(res, { reviews });
});

adminMiscRouter.patch("/reviews/:id/status", requireAdminRole(opsRoles), async (req, res) => {
  const parsed = z.object({ status: z.nativeEnum(ReviewStatus) }).safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid review status.");
  try {
    const review = await db.review.update({ where: { id: param(req.params.id) }, data: { status: parsed.data.status } });
    return sendOk(res, { review });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not update review.");
  }
});

adminMiscRouter.get("/users", requireAdminRole(superRoles), async (_req, res) => {
  const users = await db.adminUser.findMany({
    orderBy: { createdAt: "desc" },
    include: { role: true },
  });
  return sendOk(res, { users: users.map(({ passwordHash: _passwordHash, ...user }) => user) });
});

adminMiscRouter.get("/roles", requireAdminRole(superRoles), async (_req, res) => {
  const roles = await db.role.findMany({ orderBy: { name: "asc" } });
  return sendOk(res, { roles });
});

adminMiscRouter.patch("/users/:id", requireAdminRole(superRoles), async (req, res) => {
  const parsed = z.object({
    status: z.nativeEnum(AdminStatus).optional(),
    roleId: z.string().min(8).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid admin user payload.");
  if (!parsed.data.status && !parsed.data.roleId) return sendError(res, 400, "No changes provided.");
  try {
    const saved = await db.$transaction(async (tx) => {
      const id = param(req.params.id);
      const current = await tx.adminUser.findUnique({ where: { id }, include: { role: true } });
      if (!current) throw new Error("Admin user not found.");
      const nextRole = parsed.data.roleId ? await tx.role.findUnique({ where: { id: parsed.data.roleId } }) : current.role;
      if (!nextRole) throw new Error("Role not found.");
      const removesActiveSuperAdmin = current.status === AdminStatus.ACTIVE && current.role.name === RoleName.SUPER_ADMIN &&
        ((parsed.data.status && parsed.data.status !== AdminStatus.ACTIVE) || nextRole.name !== RoleName.SUPER_ADMIN);
      if (removesActiveSuperAdmin) {
        const activeSuperAdmins = await tx.adminUser.count({
          where: { status: AdminStatus.ACTIVE, role: { name: RoleName.SUPER_ADMIN }, id: { not: current.id } },
        });
        if (!activeSuperAdmins) throw new Error("At least one active super admin is required.");
      }
      const user = await tx.adminUser.update({
        where: { id },
        data: {
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
          ...(parsed.data.roleId ? { roleId: parsed.data.roleId } : {}),
        },
        include: { role: true },
      });
      const { passwordHash: _passwordHash, ...safe } = user;
      return safe;
    });
    return sendOk(res, { user: saved });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not update admin user.");
  }
});

adminMiscRouter.get("/settings", requireAdminRole(superRoles), async (_req, res) => {
  const settings = await db.setting.findMany({ orderBy: { key: "asc" } });
  return sendOk(res, { settings });
});

adminMiscRouter.patch("/settings", requireAdminRole(superRoles), async (req, res) => {
  const parsed = z.record(z.string(), z.string().max(2000)).safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Invalid settings payload.");
  const settings = await Promise.all(Object.entries(parsed.data).map(([key, value]) => db.setting.upsert({
    where: { key },
    update: { value, updatedByAdminId: req.admin!.id },
    create: { key, value, type: SettingType.STRING, updatedByAdminId: req.admin!.id },
  })));
  return sendOk(res, { settings });
});

adminMiscRouter.post("/settings/reset", requireAdminRole(superRoles), async (req, res) => {
  const defaults = {
    city: "Ahmedabad",
    defaultCity: "Ahmedabad",
    gstNumber: "24ABCDE1234F1Z5",
    storeName: "Eagle Mart Grocery & Essentials",
    support: "support@eaglemart.in",
    supportEmail: "support@eaglemart.in",
  };
  const settings = await Promise.all(Object.entries(defaults).map(([key, value]) => db.setting.upsert({
    where: { key },
    update: { value, type: SettingType.STRING, updatedByAdminId: req.admin!.id },
    create: { key, value, type: SettingType.STRING, updatedByAdminId: req.admin!.id },
  })));
  return sendOk(res, { settings });
});

adminMiscRouter.get("/reports", requireAdminRole(reportRoles), async (_req, res) => {
  const [orders, products, categories, payments, staff] = await Promise.all([
    db.order.findMany({ include: { items: { include: { product: { include: { category: true } } } }, deliveryAssignment: { include: { deliveryStaff: true } } } }),
    db.product.findMany({ include: { category: true, variants: true } }),
    db.category.findMany(),
    db.payment.findMany(),
    db.deliveryStaff.findMany({ where: { active: true }, include: { assignments: { include: { order: true } }, _count: { select: { assignments: true } } } }),
  ]);
  const sales = orders.reduce((sum, order) => sum + Number(order.grandTotal), 0);
  const productSales = new Map<string, { name: string; units: number; amount: number }>();
  const categorySales = new Map<string, { name: string; units: number; amount: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      const productName = item.product?.name || item.nameSnapshot || "Product";
      const lineTotal = Number(item.lineTotal);
      const currentProduct = productSales.get(productName) || { name: productName, units: 0, amount: 0 };
      currentProduct.units += item.quantity;
      currentProduct.amount += lineTotal;
      productSales.set(productName, currentProduct);
      const categoryName = item.product?.category?.name || "Uncategorized";
      const currentCategory = categorySales.get(categoryName) || { name: categoryName, units: 0, amount: 0 };
      currentCategory.units += item.quantity;
      currentCategory.amount += lineTotal;
      categorySales.set(categoryName, currentCategory);
    }
  }
  return sendOk(res, {
    summary: {
      sales,
      orders: orders.length,
      paid: orders.filter((order) => order.paymentStatus === "PAID").length,
      codPending: orders.filter((order) => order.paymentStatus === "COD_PENDING").length,
      delivered: orders.filter((order) => order.status === "DELIVERED").length,
      products: products.length,
      categories: categories.length,
      payments: payments.length,
      deliveryStaff: staff.length,
    },
    productSales: [...productSales.values()].sort((a, b) => b.units - a.units).slice(0, 10),
    categorySales: [...categorySales.values()].sort((a, b) => b.amount - a.amount),
    paymentSplit: [
      { name: "Razorpay", count: orders.filter((order) => order.paymentMethod === "RAZORPAY").length },
      { name: "COD", count: orders.filter((order) => order.paymentMethod === "COD").length },
    ],
    deliveryStaff: staff.map((item) => {
      const delivered = item.assignments.filter((assignment) => assignment.order.status === OrderStatus.DELIVERED).length;
      const failedStatuses: OrderStatus[] = [OrderStatus.CANCELLED, OrderStatus.RETURN_REQUESTED, OrderStatus.REFUNDED];
      const failed = item.assignments.filter((assignment) => failedStatuses.includes(assignment.order.status)).length;
      const pending = item._count.assignments - delivered - failed;
      return { id: item.id, name: item.name, phone: item.phone, assignments: item._count.assignments, delivered, pending, failed };
    }),
  });
});
