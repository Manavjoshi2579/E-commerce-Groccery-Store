import bcrypt from "bcrypt";
import crypto from "crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OrderStatus, StockMovementType, UserStatus } from "@prisma/client";
import { createApp } from "../app/app.js";
import { db } from "../lib/db.js";

const app = createApp();
const customer = request.agent(app);
const admin = request.agent(app);
const adminPassword = "Eagle" + "club@12345";
const cleanup = { userId: "", addressId: "", orderNumbers: [] as string[] };
let productId = "";
let variantId = "";
let inventoryId = "";
let deliverySlotId = "";
let deliveryStaffId = "";
let startingStock = 0;
process.env.RAZORPAY_KEY_ID ||= "rzp_test_demo";
process.env.RAZORPAY_KEY_SECRET ||= "test_secret";
process.env.RAZORPAY_WEBHOOK_SECRET ||= "webhook_secret";

beforeAll(async () => {
  const suffix = Date.now();
  const user = await db.user.create({
    data: {
      name: "Phase Eight Customer",
      email: `phase8-${suffix}@eagleclub.in`,
      passwordHash: await bcrypt.hash("Customer@12345", 12),
      status: UserStatus.ACTIVE,
    },
  });
  cleanup.userId = user.id;
  await customer.post("/api/auth/login").send({ email: user.email, password: "Customer@12345" }).expect(200);
  await admin.post("/api/admin/auth/login").send({ email: "superadmin@eagleclub.in", password: adminPassword }).expect(200);

  const inventory = await db.inventory.findFirstOrThrow({
    where: { stock: { gte: 20 }, variantId: { not: null }, product: { status: "ACTIVE", deletedAt: null } },
    include: { product: true, variant: true },
  });
  productId = inventory.productId;
  variantId = inventory.variantId!;
  inventoryId = inventory.id;
  startingStock = inventory.stock;

  const zone = await db.deliveryZone.findFirstOrThrow({ where: { active: true } });
  const pincode = Array.isArray(zone.pincodes) ? String(zone.pincodes[0]) : "380015";
  const address = await customer
    .post("/api/account/addresses")
    .send({ label: "Home", name: "Phase Eight", phone: "9876543210", line: "Phase eight address", city: zone.city, state: "Gujarat", pincode, isDefault: true })
    .expect(201);
  cleanup.addressId = address.body.data.address.id;

  const slot = await db.deliverySlot.findFirstOrThrow({ where: { active: true } });
  deliverySlotId = slot.id;
  const staff = await db.deliveryStaff.findFirstOrThrow({ where: { active: true } });
  deliveryStaffId = staff.id;
});

afterAll(async () => {
  for (const orderNumber of cleanup.orderNumbers) {
    const order = await db.order.findUnique({ where: { orderNumber } });
    if (!order) continue;
    await db.deliveryAssignment.deleteMany({ where: { orderId: order.id } });
    await db.stockMovement.deleteMany({ where: { orderId: order.id } });
    await db.couponUsage.deleteMany({ where: { orderId: order.id } });
    await db.payment.deleteMany({ where: { orderId: order.id } });
    await db.invoice.deleteMany({ where: { orderId: order.id } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
  }
  if (cleanup.userId) {
    const cart = await db.cart.findUnique({ where: { userId: cleanup.userId } });
    if (cart) await db.cartItem.deleteMany({ where: { cartId: cart.id } });
    if (cart) await db.cart.delete({ where: { id: cart.id } });
    await db.address.deleteMany({ where: { userId: cleanup.userId } });
    await db.user.delete({ where: { id: cleanup.userId } });
  }
  await db.inventory.update({ where: { id: inventoryId }, data: { stock: startingStock } });
  await db.$disconnect();
});

async function seedCart(quantity = 2) {
  await customer.delete("/api/cart").expect(200);
  await customer.post("/api/cart/items").send({ productId, variantId, quantity }).expect(201);
}

async function placeCod(quantity = 2) {
  await seedCart(quantity);
  const response = await customer
    .post("/api/checkout/place-cod-order")
    .send({ addressId: cleanup.addressId, deliverySlotId, deliveryDate: "2026-06-05" })
    .expect(201);
  cleanup.orderNumbers.push(response.body.data.orderNumber);
  return response.body.data.order;
}

describe("delivery serviceability", () => {
  it("accepts configured and unconfigured delivery pincodes", async () => {
    const zone = await db.deliveryZone.findFirstOrThrow({ where: { active: true } });
    const pincode = Array.isArray(zone.pincodes) ? String(zone.pincodes.find((entry) => /^\d{6}$/.test(String(entry)))) : "";
    expect(pincode).toMatch(/^\d{6}$/);

    const serviceable = await request(app).get(`/api/delivery/check-pincode?pincode=${pincode}`).expect(200);
    expect(serviceable.body.data.serviceable).toBe(true);

    const unconfigured = await request(app).get("/api/delivery/check-pincode?pincode=110001").expect(200);
    expect(unconfigured.body.data.serviceable).toBe(true);
  });
});

describe("checkout and COD order flow", () => {
  it("returns checkout summary and rejects empty carts", async () => {
    await customer.delete("/api/cart").expect(200);
    const summary = await customer.get("/api/checkout/summary").expect(200);
    expect(summary.body.data.cart.items).toHaveLength(0);

    await customer
      .post("/api/checkout/place-cod-order")
      .send({ addressId: cleanup.addressId, deliverySlotId, deliveryDate: "2026-06-05" })
      .expect(400);
  });

  it("places COD order, clears cart, decreases stock, and creates SALE movement", async () => {
    const before = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    const order = await placeCod(2);
    expect(order.orderNumber).toBeTruthy();
    expect(order.paymentStatus).toBe("COD Pending");

    const cart = await customer.get("/api/cart").expect(200);
    expect(cart.body.data.cart.items).toHaveLength(0);

    const after = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    expect(after.stock).toBe(before.stock - 2);
    const movement = await db.stockMovement.findFirst({ where: { orderId: order.id, type: StockMovementType.SALE } });
    expect(movement).toBeTruthy();
  });

  it("rejects insufficient stock", async () => {
    await customer.delete("/api/cart").expect(200);
    await customer.post("/api/cart/items").send({ productId, variantId, quantity: startingStock + 999 }).expect(400);
  });
});

describe("razorpay payment flow", () => {
  function validSignature(razorpayOrderId: string, paymentId: string) {
    return crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${razorpayOrderId}|${paymentId}`).digest("hex");
  }

  it("requires auth and rejects empty carts", async () => {
    await request(app).post("/api/payments/razorpay/create-order").send({ addressId: cleanup.addressId, deliverySlotId }).expect(401);
    await customer.delete("/api/cart").expect(200);
    await customer.post("/api/payments/razorpay/create-order").send({ addressId: cleanup.addressId, deliverySlotId, deliveryDate: "2026-06-05" }).expect(400);
  });

  it("creates a Razorpay order without reducing stock or clearing cart", async () => {
    await seedCart(2);
    const before = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    const response = await customer.post("/api/payments/razorpay/create-order").send({ addressId: cleanup.addressId, deliverySlotId, deliveryDate: "2026-06-05" }).expect(201);
    cleanup.orderNumbers.push(response.body.data.orderNumber);
    expect(response.body.data.razorpayOrderId).toContain("order_mock_");
    expect(response.body.data.amount).toBeGreaterThan(0);
    const after = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    expect(after.stock).toBe(before.stock);
    const cart = await customer.get("/api/cart").expect(200);
    expect(cart.body.data.cart.items).toHaveLength(1);
  });

  it("rejects invalid signature without clearing cart or reducing stock", async () => {
    await seedCart(1);
    const before = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    const created = await customer.post("/api/payments/razorpay/create-order").send({ addressId: cleanup.addressId, deliverySlotId, deliveryDate: "2026-06-05" }).expect(201);
    cleanup.orderNumbers.push(created.body.data.orderNumber);
    await customer.post("/api/payments/razorpay/verify").send({
      orderNumber: created.body.data.orderNumber,
      razorpay_order_id: created.body.data.razorpayOrderId,
      razorpay_payment_id: `pay_bad_${Date.now()}`,
      razorpay_signature: "invalid",
    }).expect(400);
    const after = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    expect(after.stock).toBe(before.stock);
    const cart = await customer.get("/api/cart").expect(200);
    expect(cart.body.data.cart.items).toHaveLength(1);
  });

  it("verifies success, clears cart, reduces stock once, and duplicate verify is idempotent", async () => {
    await seedCart(1);
    const before = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    const created = await customer.post("/api/payments/razorpay/create-order").send({ addressId: cleanup.addressId, deliverySlotId, deliveryDate: "2026-06-05" }).expect(201);
    cleanup.orderNumbers.push(created.body.data.orderNumber);
    const paymentId = `pay_ok_${Date.now()}`;
    const payload = {
      orderNumber: created.body.data.orderNumber,
      razorpay_order_id: created.body.data.razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSignature(created.body.data.razorpayOrderId, paymentId),
    };
    await customer.post("/api/payments/razorpay/verify").send(payload).expect(200);
    await customer.post("/api/payments/razorpay/verify").send(payload).expect(200);
    const after = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    expect(after.stock).toBe(before.stock - 1);
    const cart = await customer.get("/api/cart").expect(200);
    expect(cart.body.data.cart.items).toHaveLength(0);
    const movements = await db.stockMovement.count({ where: { order: { orderNumber: created.body.data.orderNumber }, type: StockMovementType.SALE } });
    expect(movements).toBe(1);
  });

  it("marks failed payment while keeping cart and stock unchanged", async () => {
    await seedCart(1);
    const before = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    const created = await customer.post("/api/payments/razorpay/create-order").send({ addressId: cleanup.addressId, deliverySlotId, deliveryDate: "2026-06-05" }).expect(201);
    cleanup.orderNumbers.push(created.body.data.orderNumber);
    await customer.post("/api/payments/razorpay/failed").send({ orderNumber: created.body.data.orderNumber, razorpay_order_id: created.body.data.razorpayOrderId, errorDescription: "User cancelled" }).expect(200);
    const after = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    expect(after.stock).toBe(before.stock);
    const cart = await customer.get("/api/cart").expect(200);
    expect(cart.body.data.cart.items).toHaveLength(1);
  });

  it("rejects invalid webhook signature", async () => {
    await request(app)
      .post("/api/payments/razorpay/webhook")
      .set("x-razorpay-signature", "bad")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ event: "payment.captured" }))
      .expect(400);
  });
});

describe("order APIs", () => {
  it("returns order history, tracking, reorder, and cancel restores stock", async () => {
    const order = await placeCod(1);
    const history = await customer.get("/api/orders").expect(200);
    expect(history.body.data.orders.some((item: any) => item.orderNumber === order.orderNumber)).toBe(true);

    const tracking = await customer.get(`/api/orders/${order.orderNumber}/tracking`).expect(200);
    expect(tracking.body.data.timeline.length).toBeGreaterThan(0);

    const reorder = await customer.post(`/api/orders/${order.orderNumber}/reorder`).expect(200);
    expect(reorder.body.data.cart.itemCount).toBeGreaterThan(0);

    const beforeCancel = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    const cancel = await customer.post(`/api/orders/${order.orderNumber}/cancel`).send({ reason: "Test cancel" }).expect(200);
    expect(cancel.body.data.order.status).toBe("Cancelled");
    const afterCancel = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    expect(afterCancel.stock).toBe(beforeCancel.stock + 1);
    expect(await db.stockMovement.findFirst({ where: { orderId: order.id, type: StockMovementType.CANCELLED_ORDER } })).toBeTruthy();
  });
});

describe("admin order and inventory APIs", () => {
  it("updates order status and assigns delivery staff", async () => {
    const order = await placeCod(1);
    const status = await admin.patch(`/api/admin/orders/${order.orderNumber}/status`).send({ status: OrderStatus.CONFIRMED }).expect(200);
    expect(status.body.data.order.status).toBe("Confirmed");

    const assigned = await admin.post(`/api/admin/orders/${order.orderNumber}/assign-delivery`).send({ deliveryStaffId }).expect(200);
    expect(assigned.body.data.order.deliveryStaff).toBeTruthy();
  });

  it("adjusts inventory and records movement", async () => {
    const before = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    const adjusted = await admin.post(`/api/admin/inventory/${inventoryId}/adjust`).send({ quantity: 3, note: "Phase eight restock" }).expect(200);
    expect(adjusted.body.data.inventory.stock).toBe(before.stock + 3);
    const movement = await db.stockMovement.findFirst({ where: { inventoryId, type: StockMovementType.RESTOCK, note: "Phase eight restock" } });
    expect(movement).toBeTruthy();
  });
});
