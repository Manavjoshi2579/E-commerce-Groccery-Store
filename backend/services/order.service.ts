import { DeliveryStatus, OrderStatus, PaymentMethod, PaymentStatus, Prisma, ProductStatus, ReturnStatus, StockMovementType } from "@prisma/client";
import { db } from "../lib/db.js";
import type { RbacPrismaClient } from "../lib/prisma-rbac.js";
import { getOrCreateCart, mapCart, validateCouponForCart } from "./cart.service.js";
import { findZoneByPincode, listSlotsForPincode } from "./delivery.service.js";
import { addCartItem } from "./cart.service.js";

const orderInclude = {
  items: { include: { product: true, variant: true } },
  payment: true,
  address: true,
  deliverySlot: true,
  deliveryAssignment: { include: { deliveryStaff: true } },
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

function orderNumber() {
  return `EC-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

async function validateCheckoutSelection(userId: string, input: { addressId: string; deliverySlotId: string; deliveryDate: Date }) {
  const [cart, address, slot] = await Promise.all([
    getOrCreateCart(userId),
    db.address.findFirst({ where: { id: input.addressId, userId, deletedAt: null } }),
    db.deliverySlot.findFirst({ where: { id: input.deliverySlotId, active: true } }),
  ]);
  if (!cart.items.length) throw new Error("Cart is empty.");
  if (!address) throw new Error("Delivery address not found.");
  const zone = await findZoneByPincode(address.pincode);
  if (!zone) throw new Error("Delivery pincode is not serviceable.");
  if (!slot) throw new Error("Delivery slot is not available.");
  if (cart.coupon?.code) await validateCouponForCart(userId, cart.coupon.code, false);
  return { cart, summary: mapCart(cart), address, slot, zone };
}

async function assertStock(tx: Prisma.TransactionClient, cart: Awaited<ReturnType<typeof getOrCreateCart>>) {
  for (const item of cart.items) {
    if (item.product.status !== ProductStatus.ACTIVE || item.product.deletedAt) throw new Error(`${item.product.name} is not available.`);
    if (item.variant && item.variant.status !== ProductStatus.ACTIVE) throw new Error(`${item.product.name} variant is not available.`);
    const inventory = await tx.inventory.findFirst({ where: { productId: item.productId, variantId: item.variantId } });
    if (!inventory || inventory.stock < item.quantity) throw new Error(`Insufficient stock for ${item.product.name}.`);
  }
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

export async function validateCheckout(userId: string, input: { addressId: string; deliverySlotId: string; deliveryDate: Date }) {
  const validated = await validateCheckoutSelection(userId, input);
  return { valid: true, message: "Checkout is valid.", summary: validated.summary };
}

export async function placeCodOrder(userId: string, input: { addressId: string; deliverySlotId: string; deliveryDate: Date }) {
  const validated = await validateCheckoutSelection(userId, input);

  return db.$transaction(async (tx) => {
    await assertStock(tx, validated.cart);

    const order = await tx.order.create({
      data: {
        orderNumber: orderNumber(),
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
        deliverySlotId: validated.slot.id,
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

    for (const item of validated.cart.items) {
      const inventory = await tx.inventory.findFirstOrThrow({ where: { productId: item.productId, variantId: item.variantId } });
      await tx.inventory.update({ where: { id: inventory.id }, data: { stock: { decrement: item.quantity } } });
      await tx.stockMovement.create({
        data: { inventoryId: inventory.id, productId: item.productId, variantId: item.variantId, type: StockMovementType.SALE, quantity: item.quantity, orderId: order.id, note: `Sale ${order.orderNumber}` },
      });
    }

    if (validated.cart.couponId) {
      await tx.coupon.update({ where: { id: validated.cart.couponId }, data: { usedCount: { increment: 1 } } });
      await tx.couponUsage.create({ data: { couponId: validated.cart.couponId, userId, orderId: order.id, discountAmount: validated.summary.couponDiscount } });
    }

    await tx.cartItem.deleteMany({ where: { cartId: validated.cart.id } });
    await tx.cart.update({ where: { id: validated.cart.id }, data: { couponId: null } });

    return { order: mapOrder(order), orderNumber: order.orderNumber };
  });
}

export async function placeOnlinePlaceholderOrder(userId: string, input: { addressId: string; deliverySlotId: string; deliveryDate: Date }) {
  const validated = await validateCheckoutSelection(userId, input);
  const order = await db.order.create({
    data: {
      orderNumber: orderNumber(),
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
      deliverySlotId: validated.slot.id,
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
  return { order: mapOrder(order), orderNumber: order.orderNumber };
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
    await restoreStock(tx, order);
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

export async function listAdminOrders(client: OrderClient = db) {
  const orders = await client.order.findMany({ include: orderInclude, orderBy: { createdAt: "desc" } });
  return orders.map(mapOrder);
}

export async function getAdminOrder(idOrNumber: string, client: OrderClient = db) {
  const order = await client.order.findFirst({ where: { OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }] }, include: orderInclude });
  if (!order) throw new Error("Order not found.");
  return mapOrder(order);
}

export async function updateAdminOrderStatus(idOrNumber: string, status: OrderStatus, adminUserId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }] }, include: orderInclude });
    if (!order) throw new Error("Order not found.");
    if (status === OrderStatus.CANCELLED) await restoreStock(tx, order, adminUserId);
    const updated = await tx.order.update({ where: { id: order.id }, data: { status }, include: orderInclude });
    return mapOrder(updated);
  });
}

export async function updateDeliveryOrderStatus(idOrNumber: string, status: OrderStatus, client: RbacPrismaClient) {
  const allowed: OrderStatus[] = [OrderStatus.CONFIRMED, OrderStatus.PACKED, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED];
  if (!allowed.includes(status)) throw new Error("Invalid delivery status.");

  const order = await client.order.findFirst({
    where: {
      OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }],
      status: { notIn: [OrderStatus.CANCELLED, OrderStatus.RETURN_REQUESTED, OrderStatus.REFUNDED] },
    },
    include: orderInclude,
  });
  if (!order) throw new Error("Order not found or not assigned to this delivery staff.");

  const updated = await db.order.update({ where: { id: order.id }, data: { status }, include: orderInclude });
  return mapOrder(updated);
}

export async function assignDelivery(idOrNumber: string, deliveryStaffId: string) {
  const order = await db.order.findFirst({ where: { OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }] } });
  if (!order) throw new Error("Order not found.");
  const staff = await db.deliveryStaff.findFirst({ where: { id: deliveryStaffId, active: true } });
  if (!staff) throw new Error("Delivery staff not found.");
  await db.deliveryAssignment.upsert({
    where: { orderId: order.id },
    update: { deliveryStaffId, status: DeliveryStatus.ASSIGNED, assignedAt: new Date() },
    create: { orderId: order.id, deliveryStaffId, status: DeliveryStatus.ASSIGNED },
  });
  return getAdminOrder(order.id);
}
