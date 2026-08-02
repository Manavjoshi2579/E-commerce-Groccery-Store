import { DeliveryStatus, FulfillmentType, OrderStatus, PaymentMethod, PaymentStatus, Prisma, ProductStatus, ReturnStatus, RoleName, SettingType, StockMovementType } from "@prisma/client";
import { db } from "../lib/db.js";
import type { RbacPrismaClient } from "../lib/prisma-rbac.js";
import { getOrCreateCart, mapCart, validateCouponForCart } from "./cart.service.js";
import { assertDeliverySlotAvailability, findZoneByPincode, listSlotsForPincode } from "./delivery.service.js";
import { addCartItem } from "./cart.service.js";
import { finalizeOrderSale, releaseOrderReservation, reserveInventory } from "./inventory.service.js";

const orderInclude = {
  items: { include: { product: true, variant: true } },
  payment: true,
  address: true,
  deliverySlot: true,
  deliveryAssignment: { include: { deliveryStaff: true } },
  deliveryConfirmation: true,
  coupon: true,
  invoice: true,
  returns: { include: { orderItem: true, refunds: true } },
};

function decimal(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

function statusLabel(status: OrderStatus) {
  const map: Record<OrderStatus, string> = {
    PENDING: "Placed",
    CONFIRMED: "Confirmed",
    PACKED: "Packed",
    OUT_FOR_DELIVERY: "Out for Delivery",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
    RETURN_REQUESTED: "Return Requested",
    REFUNDED: "Refunded",
  };
  return map[status];
}

function paymentLabel(status?: PaymentStatus) {
  if (status === PaymentStatus.COD_PENDING) return "COD Pending";
  if (status === PaymentStatus.PAID) return "Paid";
  if (status === PaymentStatus.FAILED) return "Failed";
  if (status === PaymentStatus.REFUNDED) return "Refunded";
  return "Pending";
}

function maskAccountNumber(value?: string | null) {
  if (!value) return null;
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

export function mapOrder(order: any) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    items: order.items.map((item: any) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      qty: item.quantity,
      quantity: item.quantity,
      name: item.nameSnapshot,
      sku: item.skuSnapshot,
      unit: item.unitSnapshot ?? item.variant?.unit ?? item.variant?.label ?? "",
      mrp: decimal(item.mrp),
      price: decimal(item.sellingPrice),
      lineTotal: decimal(item.lineTotal),
    })),
    address: {
      id: order.addressId ?? "",
      label: order.addressLabel ?? "Delivery",
      name: order.customerName,
      phone: order.customerPhone ?? "",
      line: order.addressLine,
      city: order.addressCity,
      state: order.addressState,
      pincode: order.addressPincode,
    },
    deliveryDate: order.deliveryDate?.toISOString?.().slice(0, 10) ?? order.deliveryDate,
    deliverySlot: order.deliverySlot?.label ?? "",
    deliverySlotId: order.deliverySlotId,
    fulfillmentType: order.fulfillmentType ?? FulfillmentType.DELIVERY,
    paymentMethod: order.payment?.method === PaymentMethod.RAZORPAY ? "Razorpay" : "COD",
    paymentStatus: paymentLabel(order.payment?.status),
    razorpayOrderId: order.payment?.razorpayOrderId,
    razorpayPaymentId: order.payment?.razorpayPaymentId,
    paymentId: order.payment?.id,
    status: statusLabel(order.status),
    rawStatus: order.status,
    subtotal: decimal(order.subtotal),
    discount: decimal(order.discount),
    couponDiscount: decimal(order.couponDiscount),
    gstTotal: decimal(order.gstTotal),
    deliveryCharge: decimal(order.deliveryCharge),
    handlingCharge: decimal(order.handlingCharge),
    grandTotal: decimal(order.grandTotal),
    couponCode: order.coupon?.code,
    deliveryStaff: order.deliveryAssignment?.deliveryStaff?.name,
    deliveryStaffId: order.deliveryAssignment?.deliveryStaffId,
    deliveryAssignmentId: order.deliveryAssignment?.id,
    deliveryAssignmentStatus: order.deliveryAssignment?.status,
    deliveryAssignedAt: order.deliveryAssignment?.assignedAt,
    deliveryPickedUpAt: order.deliveryAssignment?.pickedUpAt,
    deliveryDeliveredAt: order.deliveryAssignment?.deliveredAt,
    deliveryOutForDeliveryAt: order.deliveryAssignment?.outForDeliveryAt,
    deliveryHandedOverAt: order.deliveryAssignment?.handedOverAt,
    deliveryFailedAt: order.deliveryAssignment?.failedAt,
    deliveryFailureReason: order.deliveryAssignment?.failureReason,
    deliveryFailureNote: order.deliveryAssignment?.failureNote,
    customerConfirmedAt: order.deliveryConfirmation?.confirmedAt,
    customerConfirmationNote: order.deliveryConfirmation?.note,
    invoiceNumber: order.invoice?.invoiceNumber,
    invoiceDate: order.invoice?.invoiceDate,
    invoicePdfUrl: order.invoice?.pdfUrl,
    returns: (order.returns || []).map((item: any) => ({
      id: item.id,
      orderItemId: item.orderItemId,
      reason: item.reason,
      status: item.status,
      bankDetails: item.bankAccountNumber ? {
        accountHolder: item.bankAccountHolder,
        bankName: item.bankName,
        accountNumberMasked: maskAccountNumber(item.bankAccountNumber),
        ifsc: item.bankIfsc,
      } : null,
      refunds: (item.refunds || []).map((refund: any) => ({
        id: refund.id,
        amount: decimal(refund.amount),
        status: refund.status,
        providerRefundId: refund.providerRefundId,
        createdAt: refund.createdAt,
        updatedAt: refund.updatedAt,
      })),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    createdAt: order.createdAt,
  };
}

async function nextSequence(tx: Prisma.TransactionClient, key: string) {
  const current = await tx.setting.findUnique({ where: { key } });
  const next = Number(current?.value || "0") + 1;
  await tx.setting.upsert({
    where: { key },
    update: { value: String(next) },
    create: { key, value: String(next), type: SettingType.NUMBER },
  });
  return next;
}

async function nextOrderNumber(tx: Prisma.TransactionClient) {
  const year = new Date().getFullYear();
  const sequence = await nextSequence(tx, `order:${year}`);
  return `ORD-${year}-${String(sequence).padStart(6, "0")}`;
}

async function createInvoiceForOrder(tx: Prisma.TransactionClient, order: any) {
  const year = new Date().getFullYear();
  const sequence = await nextSequence(tx, `invoice:${year}`);
  return tx.invoice.create({
    data: {
      invoiceNumber: `INV-${year}-${String(sequence).padStart(6, "0")}`,
      orderId: order.id,
      subtotal: order.subtotal,
      couponDiscount: order.couponDiscount,
      deliveryCharge: order.deliveryCharge,
      handlingCharge: order.handlingCharge,
      gstTotal: order.gstTotal,
      grandTotal: order.grandTotal,
    },
  });
}

type CheckoutSelection = { addressId: string; deliverySlotId?: string | null; deliveryDate: Date; fulfillmentType?: "DELIVERY" | "PICKUP" };

async function validateCheckoutSelection(userId: string, input: CheckoutSelection) {
  const fulfillmentType = input.fulfillmentType === "PICKUP" ? FulfillmentType.PICKUP : FulfillmentType.DELIVERY;
  const [cart, address, slot] = await Promise.all([
    getOrCreateCart(userId),
    db.address.findFirst({ where: { id: input.addressId, userId, deletedAt: null } }),
    input.deliverySlotId ? db.deliverySlot.findFirst({ where: { id: input.deliverySlotId, active: true } }) : null,
  ]);
  if (!cart.items.length) throw new Error("Cart is empty.");
  if (!address) throw new Error("Delivery address not found.");
  const zone = fulfillmentType === FulfillmentType.DELIVERY ? await findZoneByPincode(address.pincode) : null;
  if (fulfillmentType === FulfillmentType.DELIVERY && !zone) throw new Error("Delivery pincode is not serviceable.");
  if (fulfillmentType === FulfillmentType.DELIVERY && !slot) throw new Error("Delivery slot is not available.");
  if (cart.coupon?.code) await validateCouponForCart(userId, cart.coupon.code, false);
  const summary = mapCart(cart);
  if (fulfillmentType === FulfillmentType.PICKUP) {
    summary.deliveryCharge = 0;
    summary.total = summary.subtotal - summary.discount - summary.couponDiscount + summary.tax + summary.handlingCharge;
  }
  return { cart, summary, address, slot, zone, fulfillmentType };
}

async function assertStock(tx: Prisma.TransactionClient, cart: Awaited<ReturnType<typeof getOrCreateCart>>) {
  for (const item of cart.items) {
    if (item.product.status !== ProductStatus.ACTIVE || item.product.deletedAt) throw new Error(`${item.product.name} is not available.`);
    if (item.variant && item.variant.status !== ProductStatus.ACTIVE) throw new Error(`${item.product.name} variant is not available.`);
    const inventory = await tx.inventory.findFirst({ where: { productId: item.productId, variantId: item.variantId } });
    if (!inventory || inventory.stock - inventory.reserved < item.quantity) throw new Error(`Insufficient stock for ${item.product.name}.`);
  }
}

async function recordStatusHistory(tx: Prisma.TransactionClient, order: { id: string; status: OrderStatus }, status: OrderStatus, actorType: string, actorId?: string | null, reason?: string) {
  if (order.status === status) return;
  await tx.orderStatusHistory.create({
    data: { orderId: order.id, previousStatus: order.status, newStatus: status, actorType, actorId, reason },
  });
}

export async function checkoutSummary(userId: string, input?: { addressId?: string; deliverySlotId?: string; deliveryDate?: Date }) {
  const cart = await getOrCreateCart(userId);
  const [addresses, zones] = await Promise.all([
    db.address.findMany({ where: { userId, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] }),
    db.deliveryZone.findMany({ where: { active: true } }),
  ]);
  const address = input?.addressId ? addresses.find((item) => item.id === input.addressId) : addresses[0];
  const slots = address ? (await listSlotsForPincode(address.pincode, input?.deliveryDate ?? new Date())).slots : [];
  return { cart: mapCart(cart), address, addresses, deliveryZones: zones, deliverySlots: slots, selected: input ?? null };
}

export async function validateCheckout(userId: string, input: CheckoutSelection) {
  const validated = await validateCheckoutSelection(userId, input);
  return { valid: true, message: "Checkout is valid.", summary: validated.summary };
}

export async function placeCodOrder(userId: string, input: CheckoutSelection) {
  const validated = await validateCheckoutSelection(userId, input);

  return db.$transaction(async (tx) => {
    await assertDeliverySlotAvailability(tx, validated.slot?.id, input.deliveryDate, validated.summary.total, validated.fulfillmentType);
    await assertStock(tx, validated.cart);

    const order = await tx.order.create({
      data: {
        orderNumber: await nextOrderNumber(tx),
        userId,
        customerName: validated.address.name,
        customerPhone: validated.address.phone,
        addressId: validated.address.id,
        addressLabel: validated.address.label,
        addressLine: validated.address.line,
        addressCity: validated.address.city,
        addressState: validated.address.state,
        addressPincode: validated.address.pincode,
        deliveryDate: input.deliveryDate,
        deliverySlotId: validated.slot?.id,
        fulfillmentType: validated.fulfillmentType,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.COD_PENDING,
        paymentMethod: PaymentMethod.COD,
        couponId: validated.cart.couponId,
        subtotal: validated.summary.subtotal,
        discount: validated.summary.discount,
        couponDiscount: validated.summary.couponDiscount,
        gstTotal: validated.summary.tax,
        deliveryCharge: validated.summary.deliveryCharge,
        handlingCharge: validated.summary.handlingCharge,
        grandTotal: validated.summary.total,
        items: {
          create: validated.cart.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            unitSnapshot: item.customUnit ?? item.variant?.unit ?? item.variant?.label ?? "",
            nameSnapshot: item.product.name,
            skuSnapshot: item.variant?.sku ?? item.product.sku,
            quantity: item.quantity,
            mrp: item.customMrp ?? item.variant?.mrp ?? item.unitPriceSnapshot,
            sellingPrice: item.customPrice ?? item.variant?.price ?? item.unitPriceSnapshot,
            discount: decimal(item.customMrp ?? item.variant?.mrp) > decimal(item.customPrice ?? item.variant?.price) ? (decimal(item.customMrp ?? item.variant?.mrp) - decimal(item.customPrice ?? item.variant?.price)) * item.quantity : 0,
            gst: item.product.gst,
            lineTotal: decimal(item.customPrice ?? item.variant?.price ?? item.unitPriceSnapshot) * item.quantity,
          })),
        },
        payment: { create: { method: PaymentMethod.COD, status: PaymentStatus.COD_PENDING, amount: validated.summary.total } },
      },
      include: orderInclude,
    });
    await createInvoiceForOrder(tx, order);

    for (const item of validated.cart.items) {
      await reserveInventory(tx, { productId: item.productId, variantId: item.variantId, quantity: item.quantity, orderId: order.id, actorId: userId, idempotencyKey: `ONLINE_RESERVATION:${order.id}:${item.id}` });
    }

    if (validated.cart.couponId) {
      await tx.coupon.update({ where: { id: validated.cart.couponId }, data: { usedCount: { increment: 1 } } });
      await tx.couponUsage.create({ data: { couponId: validated.cart.couponId, userId, orderId: order.id, discountAmount: validated.summary.couponDiscount } });
    }

    await tx.cartItem.deleteMany({ where: { cartId: validated.cart.id } });
    await tx.cart.update({ where: { id: validated.cart.id }, data: { couponId: null } });

    const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
    return { order: mapOrder(fresh), orderNumber: order.orderNumber };
  });
}

export async function placeOnlinePlaceholderOrder(userId: string, input: CheckoutSelection) {
  const validated = await validateCheckoutSelection(userId, input);
  return db.$transaction(async (tx) => {
    await assertDeliverySlotAvailability(tx, validated.slot?.id, input.deliveryDate, validated.summary.total, validated.fulfillmentType);
    await assertStock(tx, validated.cart);
    const order = await tx.order.create({
      data: {
        orderNumber: await nextOrderNumber(tx),
        userId,
        customerName: validated.address.name,
        customerPhone: validated.address.phone,
        addressId: validated.address.id,
        addressLabel: validated.address.label,
        addressLine: validated.address.line,
        addressCity: validated.address.city,
        addressState: validated.address.state,
        addressPincode: validated.address.pincode,
        deliveryDate: input.deliveryDate,
        deliverySlotId: validated.slot?.id,
        fulfillmentType: validated.fulfillmentType,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.RAZORPAY,
        couponId: validated.cart.couponId,
        subtotal: validated.summary.subtotal,
        discount: validated.summary.discount,
        couponDiscount: validated.summary.couponDiscount,
        gstTotal: validated.summary.tax,
        deliveryCharge: validated.summary.deliveryCharge,
        handlingCharge: validated.summary.handlingCharge,
        grandTotal: validated.summary.total,
        items: {
          create: validated.cart.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            unitSnapshot: item.customUnit ?? item.variant?.unit ?? item.variant?.label ?? "",
            nameSnapshot: item.product.name,
            skuSnapshot: item.variant?.sku ?? item.product.sku,
            quantity: item.quantity,
            mrp: item.customMrp ?? item.variant?.mrp ?? item.unitPriceSnapshot,
            sellingPrice: item.customPrice ?? item.variant?.price ?? item.unitPriceSnapshot,
            discount: 0,
            gst: item.product.gst,
            lineTotal: decimal(item.customPrice ?? item.variant?.price ?? item.unitPriceSnapshot) * item.quantity,
          })),
        },
        payment: { create: { method: PaymentMethod.RAZORPAY, status: PaymentStatus.PENDING, amount: validated.summary.total } },
      },
      include: orderInclude,
    });
    await createInvoiceForOrder(tx, order);
    for (const item of validated.cart.items) {
      await reserveInventory(tx, { productId: item.productId, variantId: item.variantId, quantity: item.quantity, orderId: order.id, actorId: userId, idempotencyKey: `ONLINE_RESERVATION:${order.id}:${item.id}` });
    }
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
    return { order: mapOrder(fresh), orderNumber: order.orderNumber };
  });
}

export async function listOrders(userId: string) {
  const orders = await db.order.findMany({ where: { userId }, include: orderInclude, orderBy: { createdAt: "desc" } });
  return orders.map(mapOrder);
}

export async function getOrder(userId: string, orderNumber: string) {
  const order = await db.order.findFirst({ where: { userId, orderNumber }, include: orderInclude });
  if (!order) throw new Error("Order not found.");
  return mapOrder(order);
}

export async function tracking(userId: string, orderNumber: string) {
  const order = await getOrder(userId, orderNumber);
  const steps = ["Placed", "Confirmed", "Packed", "Out for Delivery", "Delivered"];
  return { order, timeline: steps.map((step) => ({ label: step, completed: steps.indexOf(step) <= steps.indexOf(order.status) })) };
}

const cancelable: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PACKED];

async function restoreStock(tx: Prisma.TransactionClient, order: any, adminUserId?: string) {
  const saleMovement = await tx.stockMovement.findFirst({ where: { orderId: order.id, type: { in: [StockMovementType.SALE, StockMovementType.ONLINE_SALE] } } });
  if (!saleMovement) return;
  const existingRestore = await tx.stockMovement.findFirst({ where: { orderId: order.id, type: StockMovementType.CANCELLED_ORDER } });
  if (existingRestore) return;
  for (const item of order.items) {
    const inventory = await tx.inventory.findFirst({ where: { productId: item.productId, variantId: item.variantId } });
    if (!inventory) continue;
    await tx.inventory.update({ where: { id: inventory.id }, data: { stock: { increment: item.quantity } } });
    await tx.stockMovement.create({
      data: { inventoryId: inventory.id, productId: item.productId, variantId: item.variantId, type: StockMovementType.CANCELLED_ORDER, quantity: item.quantity, orderId: order.id, adminUserId, note: `Cancel ${order.orderNumber}` },
    });
  }
}

export async function cancelOrder(userId: string, orderNumber: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { userId, orderNumber }, include: orderInclude });
    if (!order) throw new Error("Order not found.");
    if (!cancelable.includes(order.status)) throw new Error("Order cannot be cancelled now.");
    await releaseOrderReservation(tx, order, { actorType: "CUSTOMER", actorId: userId, type: StockMovementType.ORDER_CANCELLED, note: `Cancel ${order.orderNumber}` });
    await restoreStock(tx, order);
    await recordStatusHistory(tx, order, OrderStatus.CANCELLED, "CUSTOMER", userId);
    const updated = await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELLED }, include: orderInclude });
    return mapOrder(updated);
  });
}

export async function requestReturn(userId: string, orderNumber: string, input: { orderItemId?: string | null; reason: string; bankAccountHolder: string; bankName: string; bankAccountNumber: string; bankIfsc: string }) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { userId, orderNumber }, include: orderInclude });
    if (!order) throw new Error("Order not found.");
    if (order.status !== OrderStatus.DELIVERED) throw new Error("Only delivered orders can be returned.");

    const orderItemId = input.orderItemId || null;
    if (orderItemId && !order.items.some((item) => item.id === orderItemId)) throw new Error("Selected item is not part of this order.");

    const existing = await tx.returnRequest.findFirst({ where: { orderId: order.id, userId, orderItemId } });
    if (existing && existing.status !== ReturnStatus.REJECTED) throw new Error("A return request is already active for this selection.");

    if (existing) {
      await tx.returnRequest.update({
        where: { id: existing.id },
        data: {
          reason: input.reason,
          bankAccountHolder: input.bankAccountHolder,
          bankName: input.bankName,
          bankAccountNumber: input.bankAccountNumber,
          bankIfsc: input.bankIfsc,
          status: ReturnStatus.REQUESTED,
        },
      });
    } else {
      await tx.returnRequest.create({
        data: {
          orderId: order.id,
          orderItemId,
          userId,
          reason: input.reason,
          bankAccountHolder: input.bankAccountHolder,
          bankName: input.bankName,
          bankAccountNumber: input.bankAccountNumber,
          bankIfsc: input.bankIfsc,
          status: ReturnStatus.REQUESTED,
        },
      });
    }

    const updated = await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.RETURN_REQUESTED }, include: orderInclude });
    return mapOrder(updated);
  });
}

export async function reorder(userId: string, orderNumber: string) {
  const order = await db.order.findFirst({ where: { userId, orderNumber }, include: { items: true } });
  if (!order) throw new Error("Order not found.");
  for (const item of order.items) {
    await addCartItem(userId, { productId: item.productId, variantId: item.variantId ?? undefined, quantity: item.quantity });
  }
  return mapCart(await getOrCreateCart(userId));
}

type OrderClient = typeof db | RbacPrismaClient;

async function findDefaultDeliveryStaff(tx: Prisma.TransactionClient, zoneId?: string | null) {
  const linkedLoginStaff = await tx.deliveryStaff.findFirst({
    where: { active: true, adminUser: { role: { name: RoleName.DELIVERY_STAFF }, status: "ACTIVE" } },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
  });
  if (linkedLoginStaff) return linkedLoginStaff;

  const zonedStaff = zoneId
    ? await tx.deliveryStaff.findFirst({
        where: { active: true, zoneId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
      })
    : null;
  if (zonedStaff) return zonedStaff;

  return tx.deliveryStaff.findFirst({
    where: { active: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
  });
}

async function ensureDeliveryAssignmentForDispatch(tx: Prisma.TransactionClient, order: { id: string; deliverySlot?: { zoneId?: string | null } | null }) {
  const existing = await tx.deliveryAssignment.findUnique({ where: { orderId: order.id } });
  if (existing) return existing;

  const staff = await findDefaultDeliveryStaff(tx, order.deliverySlot?.zoneId);
  if (!staff) return null;

  return tx.deliveryAssignment.create({
    data: {
      orderId: order.id,
      deliveryStaffId: staff.id,
      status: DeliveryStatus.ASSIGNED,
      metadata: { autoAssigned: true, reason: "Order moved to packed/dispatch queue" },
    },
  });
}

export async function listAdminOrders(client: OrderClient = db) {
  const orderClient = client.order as any;
  const orders = await orderClient.findMany({ include: orderInclude, orderBy: { createdAt: "desc" } });
  return orders.map(mapOrder);
}

export async function listDeliveryOperationsOrders() {
  const orders = await db.order.findMany({
    where: {
      deliveryAssignment: { isNot: null },
      status: { notIn: [OrderStatus.CANCELLED, OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED, OrderStatus.REFUNDED] },
    },
    include: orderInclude,
    orderBy: [
      { deliveryDate: "asc" },
      { createdAt: "desc" },
    ],
  });
  return orders.map(mapOrder);
}

export async function getAdminOrder(idOrNumber: string, client: OrderClient = db) {
  const orderClient = client.order as any;
  const order = await orderClient.findFirst({ where: { OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }] }, include: orderInclude });
  if (!order) throw new Error("Order not found.");
  return mapOrder(order);
}

export async function updateAdminOrderStatus(idOrNumber: string, status: OrderStatus, adminUserId: string) {
  if (status === OrderStatus.DELIVERED) throw new Error("Delivered status is completed by delivery staff after customer receipt confirmation.");
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }] }, include: orderInclude });
    if (!order) throw new Error("Order not found.");
    if (order.status === status) return mapOrder(order);
    await recordStatusHistory(tx, order, status, "ADMIN", adminUserId);
    if (status === OrderStatus.PACKED || status === OrderStatus.OUT_FOR_DELIVERY) {
      await ensureDeliveryAssignmentForDispatch(tx, order);
    }
    if (status === OrderStatus.CANCELLED) {
      await releaseOrderReservation(tx, order, { actorType: "ADMIN", actorId: adminUserId, type: StockMovementType.ORDER_CANCELLED, note: `Admin cancel ${order.orderNumber}` });
      await restoreStock(tx, order, adminUserId);
    }
    if (status === OrderStatus.OUT_FOR_DELIVERY) {
      await finalizeOrderSale(tx, order, { actorType: "ADMIN", actorId: adminUserId, note: `Dispatch ${order.orderNumber}` });
      await tx.deliveryAssignment.updateMany({ where: { orderId: order.id }, data: { status: DeliveryStatus.OUT_FOR_DELIVERY, outForDeliveryAt: new Date(), failedAt: null, failureReason: null, failureNote: null } });
    }
    const updated = await tx.order.update({ where: { id: order.id }, data: { status }, include: orderInclude });
    return mapOrder(updated);
  });
}

export async function updateDeliveryOrderStatus(idOrNumber: string, status: OrderStatus, client: RbacPrismaClient) {
  const allowed: OrderStatus[] = [OrderStatus.PACKED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED];
  if (!allowed.includes(status)) throw new Error("Invalid delivery status.");

  const orderClient = client.order as any;
  const order = await orderClient.findFirst({
    where: {
      OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }],
      status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURN_REQUESTED, OrderStatus.REFUNDED] },
    },
    include: orderInclude,
  });
  if (!order) throw new Error("Order not found or not assigned to this delivery staff.");
  if (order.status === status) return mapOrder(order);

  return db.$transaction(async (tx) => {
    await recordStatusHistory(tx, order, status, "DELIVERY", undefined);
    if (status === OrderStatus.OUT_FOR_DELIVERY) {
      await finalizeOrderSale(tx, order, { actorType: "DELIVERY", note: `Out for delivery ${order.orderNumber}` });
      await tx.deliveryAssignment.updateMany({ where: { orderId: order.id }, data: { status: DeliveryStatus.OUT_FOR_DELIVERY, outForDeliveryAt: new Date(), failedAt: null, failureReason: null, failureNote: null } });
    }
    if (status === OrderStatus.PACKED) await tx.deliveryAssignment.updateMany({ where: { orderId: order.id }, data: { status: DeliveryStatus.PICKED_UP, pickedUpAt: new Date(), failedAt: null, failureReason: null, failureNote: null } });
    if (status === OrderStatus.DELIVERED) {
      if (!order.deliveryConfirmation) throw new Error("Customer receipt confirmation is required before completing delivery.");
      if (order.payment?.method === PaymentMethod.COD && order.payment.status !== PaymentStatus.PAID) throw new Error("COD payment must be collected before completing delivery.");
      await tx.deliveryAssignment.updateMany({ where: { orderId: order.id }, data: { status: DeliveryStatus.DELIVERED, deliveredAt: new Date() } });
    }
    const updated = await tx.order.update({ where: { id: order.id }, data: { status }, include: orderInclude });
    return mapOrder(updated);
  });
}

export async function updateAdminPaymentStatus(idOrNumber: string, status: PaymentStatus, input: { note?: string; actorRole?: string; actorId?: string }, client: OrderClient = db) {
  const orderClient = client.order as any;
  const order = await orderClient.findFirst({
    where: { OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }] },
    include: orderInclude,
  });
  if (!order) throw new Error("Order not found or not assigned to this staff.");
  if (!order.payment) throw new Error("Payment record not found for this order.");
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) throw new Error("Payment cannot be changed for a closed order.");
  if (input.actorRole === "DELIVERY_STAFF" && order.payment.method !== PaymentMethod.COD) {
    throw new Error("Delivery staff can only confirm COD collection.");
  }
  if (input.actorRole === "DELIVERY_STAFF" && status !== PaymentStatus.PAID && status !== PaymentStatus.FAILED) {
    throw new Error("Delivery staff can mark COD as collected or not collected only.");
  }

  const updated = await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { orderId: order.id },
      data: {
        status,
        rawPayload: {
          ...(typeof order.payment?.rawPayload === "object" && order.payment.rawPayload ? order.payment.rawPayload as Record<string, unknown> : {}),
          manualPaymentUpdate: {
            status,
            note: input.note || null,
            actorRole: input.actorRole || null,
            actorId: input.actorId || null,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    });
    const nextOrderStatus = status === PaymentStatus.PAID && order.status === OrderStatus.PENDING ? OrderStatus.CONFIRMED : order.status;
    return tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: status, status: nextOrderStatus },
      include: orderInclude,
    });
  });
  return mapOrder(updated);
}

export async function markDeliveryAttemptFailed(idOrNumber: string, input: { reason: string; note?: string }, client: RbacPrismaClient) {
  const orderClient = client.order as any;
  const order = await orderClient.findFirst({
    where: {
      OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }],
      status: { notIn: [OrderStatus.CANCELLED, OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED, OrderStatus.REFUNDED] },
    },
    include: orderInclude,
  });
  if (!order) throw new Error("Order not found or not assigned to this delivery staff.");

  const now = new Date();
  const updated = await db.$transaction(async (tx) => {
    await tx.deliveryAssignment.updateMany({
      where: { orderId: order.id },
      data: {
        status: DeliveryStatus.FAILED,
        failedAt: now,
        failureReason: input.reason,
        failureNote: input.note,
        metadata: { failedReason: input.reason, failedNote: input.note || null },
      },
    });
    return tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
  return mapOrder(updated);
}

export async function assignDelivery(idOrNumber: string, deliveryStaffId: string) {
  const order = await db.order.findFirst({ where: { OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }] } });
  if (!order) throw new Error("Order not found.");
  const staff = await db.deliveryStaff.findFirst({ where: { id: deliveryStaffId, active: true } });
  if (!staff) throw new Error("Delivery staff not found.");
  await db.deliveryAssignment.upsert({
    where: { orderId: order.id },
    update: { deliveryStaffId, status: DeliveryStatus.ASSIGNED, assignedAt: new Date(), failedAt: null, failureReason: null, failureNote: null },
    create: { orderId: order.id, deliveryStaffId, status: DeliveryStatus.ASSIGNED },
  });
  return getAdminOrder(order.id);
}

export async function confirmOrderReceived(userId: string, orderNumber: string, note?: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { userId, orderNumber }, include: orderInclude });
    if (!order) throw new Error("Order not found.");
    if (order.status !== OrderStatus.OUT_FOR_DELIVERY && order.status !== OrderStatus.PACKED) throw new Error("This order is not eligible for receipt confirmation.");
    await tx.customerDeliveryConfirmation.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id, customerId: userId, note },
      update: { note },
    });
    await tx.deliveryAssignment.updateMany({ where: { orderId: order.id }, data: { handedOverAt: new Date(), metadata: { customerConfirmed: true } } });
    const updated = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
    return mapOrder(updated);
  });
}
