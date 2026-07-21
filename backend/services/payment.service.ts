import crypto from "crypto";
import Razorpay from "razorpay";
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma, ProductStatus, SettingType, StockMovementType } from "@prisma/client";
import { db } from "../lib/db.js";
import { getOrCreateCart, mapCart, validateCouponForCart } from "./cart.service.js";
import { findZoneByPincode } from "./delivery.service.js";
import { mapOrder } from "./order.service.js";

const orderInclude = {
  items: { include: { product: true, variant: true } },
  payment: true,
  address: true,
  deliverySlot: true,
  deliveryAssignment: { include: { deliveryStaff: true } },
  coupon: true,
  invoice: true,
};

function decimal(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

function razorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "";
}

function razorpaySecret() {
  return process.env.RAZORPAY_KEY_SECRET || "";
}

function razorpayAvailable() {
  return Boolean(razorpayKeyId() && razorpaySecret());
}

export function paymentProviderStatus() {
  return {
    razorpay: razorpayAvailable(),
    onlinePayment: razorpayAvailable(),
  };
}

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
}

function signature(orderId: string, paymentId: string) {
  return crypto.createHmac("sha256", razorpaySecret()).update(`${orderId}|${paymentId}`).digest("hex");
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

async function nextInvoiceNumber(tx: Prisma.TransactionClient) {
  const year = new Date().getFullYear();
  const sequence = await nextSequence(tx, `invoice:${year}`);
  return `INV-${year}-${String(sequence).padStart(6, "0")}`;
}

function webhookSignature(body: Buffer) {
  return crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET || "").update(body).digest("hex");
}

async function validateSelection(userId: string, input: { addressId: string; deliverySlotId: string; deliveryDate?: Date; couponCode?: string }) {
  const [cart, address, slot] = await Promise.all([
    getOrCreateCart(userId),
    db.address.findFirst({ where: { id: input.addressId, userId, deletedAt: null } }),
    db.deliverySlot.findFirst({ where: { id: input.deliverySlotId, active: true } }),
  ]);
  if (!cart.items.length) throw new Error("Cart is empty.");
  if (!address) throw new Error("Delivery address not found.");
  if (!(await findZoneByPincode(address.pincode))) throw new Error("Delivery pincode is not serviceable.");
  if (!slot) throw new Error("Delivery slot is not available.");
  if (input.couponCode) await validateCouponForCart(userId, input.couponCode, true);
  const freshCart = await getOrCreateCart(userId);
  if (freshCart.coupon?.code) await validateCouponForCart(userId, freshCart.coupon.code, false);
  for (const item of freshCart.items) {
    if (item.product.status !== ProductStatus.ACTIVE || item.product.deletedAt) throw new Error(`${item.product.name} is not available.`);
    if (item.variant && item.variant.status !== ProductStatus.ACTIVE) throw new Error(`${item.product.name} variant is not available.`);
    const inventory = await db.inventory.findFirst({ where: { productId: item.productId, variantId: item.variantId } });
    if (!inventory || inventory.stock < item.quantity) throw new Error(`Insufficient stock for ${item.product.name}.`);
  }
  return { cart: freshCart, address, slot, summary: mapCart(freshCart), deliveryDate: input.deliveryDate || tomorrow() };
}

async function createProviderOrder(amountPaise: number, receipt: string, notes?: Record<string, string>) {
  if (process.env.NODE_ENV === "test" || process.env.RAZORPAY_MOCK === "true") {
    return { id: `order_mock_${receipt}`, amount: amountPaise, currency: "INR", receipt };
  }
  const client = new Razorpay({ key_id: razorpayKeyId(), key_secret: razorpaySecret() });
  return client.orders.create({ amount: amountPaise, currency: "INR", receipt, notes });
}

export async function createRazorpayOrder(userId: string, input: { addressId: string; deliverySlotId: string; deliveryDate?: Date; couponCode?: string; notes?: Record<string, string> }) {
  if (!razorpayAvailable()) throw new Error("Online payment is temporarily unavailable. Please use Cash on Delivery.");
  const selected = await validateSelection(userId, input);
  const order = await db.$transaction(async (tx) => tx.order.create({
    data: {
      orderNumber: await nextOrderNumber(tx),
      userId,
      customerName: selected.address.name,
      customerPhone: selected.address.phone,
      addressId: selected.address.id,
      addressLabel: selected.address.label,
      addressLine: selected.address.line,
      addressCity: selected.address.city,
      addressState: selected.address.state,
      addressPincode: selected.address.pincode,
      deliveryDate: selected.deliveryDate,
      deliverySlotId: selected.slot.id,
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: PaymentMethod.RAZORPAY,
      couponId: selected.cart.couponId,
      subtotal: selected.summary.subtotal,
      discount: selected.summary.discount,
      couponDiscount: selected.summary.couponDiscount,
      gstTotal: selected.summary.tax,
      deliveryCharge: selected.summary.deliveryCharge,
      handlingCharge: selected.summary.handlingCharge,
      grandTotal: selected.summary.total,
      items: {
        create: selected.cart.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          unitSnapshot: item.customUnit ?? item.variant?.unit ?? item.variant?.label ?? "",
          nameSnapshot: item.product.name,
          skuSnapshot: item.variant?.sku ?? item.product.sku,
          quantity: item.quantity,
          mrp: item.customMrp ?? item.variant?.mrp ?? item.unitPriceSnapshot,
          sellingPrice: item.customPrice ?? item.variant?.price ?? item.unitPriceSnapshot,
          discount: Math.max(0, decimal(item.customMrp ?? item.variant?.mrp) - decimal(item.customPrice ?? item.variant?.price)) * item.quantity,
          gst: item.product.gst,
          lineTotal: decimal(item.customPrice ?? item.variant?.price ?? item.unitPriceSnapshot) * item.quantity,
        })),
      },
      payment: { create: { method: PaymentMethod.RAZORPAY, status: PaymentStatus.PENDING, amount: selected.summary.total } },
    },
    include: orderInclude,
  }));
  const providerOrder = await createProviderOrder(Math.round(selected.summary.total * 100), order.orderNumber, input.notes);
  await db.payment.update({ where: { orderId: order.id }, data: { razorpayOrderId: providerOrder.id, rawPayload: { providerOrder: providerOrder as any } } });
  return {
    orderNumber: order.orderNumber,
    razorpayOrderId: providerOrder.id,
    amount: selected.summary.total,
    currency: "INR",
    keyId: razorpayKeyId(),
    prefill: {
      name: selected.address.name,
      contact: selected.address.phone,
      email: selected.cart.userId ? (await db.user.findUnique({ where: { id: userId } }))?.email : undefined,
    },
  };
}

async function finalizePaidOrder(tx: Prisma.TransactionClient, orderId: string, rawPayload: Prisma.InputJsonValue = {}) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  if (order.payment?.status === PaymentStatus.PAID) return order;
  for (const item of order.items) {
    const inventory = await tx.inventory.findFirstOrThrow({ where: { productId: item.productId, variantId: item.variantId } });
    if (inventory.stock < item.quantity) throw new Error(`Insufficient stock for ${item.nameSnapshot}.`);
  }
  for (const item of order.items) {
    const inventory = await tx.inventory.findFirstOrThrow({ where: { productId: item.productId, variantId: item.variantId } });
    await tx.inventory.update({ where: { id: inventory.id }, data: { stock: { decrement: item.quantity } } });
    await tx.stockMovement.create({
      data: { inventoryId: inventory.id, productId: item.productId, variantId: item.variantId, type: StockMovementType.SALE, quantity: item.quantity, orderId: order.id, note: `Razorpay sale ${order.orderNumber}` },
    });
  }
  await tx.payment.update({ where: { orderId }, data: { status: PaymentStatus.PAID, rawPayload } });
  const updated = await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.CONFIRMED, paymentStatus: PaymentStatus.PAID }, include: orderInclude });
  await tx.invoice.upsert({
    where: { orderId },
    create: {
      invoiceNumber: await nextInvoiceNumber(tx),
      orderId,
      subtotal: order.subtotal,
      couponDiscount: order.couponDiscount,
      deliveryCharge: order.deliveryCharge,
      handlingCharge: order.handlingCharge,
      gstTotal: order.gstTotal,
      grandTotal: order.grandTotal,
    },
    update: {},
  });
  if (order.couponId) {
    await tx.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } });
    await tx.couponUsage.upsert({
      where: { couponId_orderId: { couponId: order.couponId, orderId } },
      create: { couponId: order.couponId, userId: order.userId, orderId, discountAmount: order.couponDiscount },
      update: {},
    });
  }
  if (order.userId) {
    const cart = await tx.cart.findUnique({ where: { userId: order.userId } });
    if (cart) {
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({ where: { id: cart.id }, data: { couponId: null } });
    }
  }
  return updated;
}

export async function verifyRazorpayPayment(userId: string, input: { orderNumber: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  if (!razorpayAvailable()) throw new Error("Online payment is temporarily unavailable. Please use Cash on Delivery.");
  const order = await db.order.findFirst({ where: { userId, orderNumber: input.orderNumber }, include: orderInclude });
  if (!order || !order.payment || order.payment.razorpayOrderId !== input.razorpay_order_id) throw new Error("Payment order not found.");
  if (order.payment.status === PaymentStatus.PAID) return { success: true, orderNumber: order.orderNumber, order: mapOrder(order) };
  if (signature(input.razorpay_order_id, input.razorpay_payment_id) !== input.razorpay_signature) {
    await db.payment.update({ where: { orderId: order.id }, data: { status: PaymentStatus.FAILED, razorpayPaymentId: input.razorpay_payment_id, rawPayload: input as any } });
    await db.order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.FAILED } });
    throw new Error("Payment verification failed. Your cart is safe.");
  }
  const paid = await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { orderId: order.id }, data: { razorpayPaymentId: input.razorpay_payment_id } });
    return finalizePaidOrder(tx, order.id, input as any);
  });
  return { success: true, orderNumber: paid.orderNumber, order: mapOrder(paid) };
}

export async function markRazorpayFailed(userId: string, input: { orderNumber: string; razorpay_order_id?: string; errorCode?: string; errorDescription?: string; metadata?: unknown }) {
  const order = await db.order.findFirst({ where: { userId, orderNumber: input.orderNumber }, include: { payment: true } });
  if (!order || !order.payment) throw new Error("Payment order not found.");
  if (order.payment.status === PaymentStatus.PAID) return { success: true, orderNumber: order.orderNumber };
  await db.payment.update({ where: { orderId: order.id }, data: { status: PaymentStatus.FAILED, rawPayload: input as any } });
  await db.order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.FAILED } });
  return { success: true, orderNumber: order.orderNumber };
}

export async function handleRazorpayWebhook(body: Buffer, signatureHeader?: string) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) throw new Error("Webhook secret is not configured.");
  if (!signatureHeader || webhookSignature(body) !== signatureHeader) throw new Error("Invalid webhook signature.");
  const event = JSON.parse(body.toString("utf8"));
  const payloadPayment = event.payload?.payment?.entity;
  const payloadOrder = event.payload?.order?.entity;
  const razorpayOrderId = payloadPayment?.order_id || payloadOrder?.id;
  if (!razorpayOrderId) return { received: true };
  const payment = await db.payment.findFirst({ where: { razorpayOrderId }, include: { order: true } });
  if (!payment) return { received: true };
  if (event.event === "payment.failed") {
    if (payment.status !== PaymentStatus.PAID) {
      await db.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED, rawPayload: event } });
      await db.order.update({ where: { id: payment.orderId }, data: { paymentStatus: PaymentStatus.FAILED } });
    }
    return { received: true };
  }
  if (event.event === "payment.captured" || event.event === "order.paid") {
    await db.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { razorpayPaymentId: payloadPayment?.id ?? payment.razorpayPaymentId } });
      await finalizePaidOrder(tx, payment.orderId, event);
    });
  }
  return { received: true };
}
