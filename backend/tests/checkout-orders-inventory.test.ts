import bcrypt from "bcrypt";
import crypto from "crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DeliveryStatus, OrderStatus, StockMovementType, UserStatus } from "@prisma/client";
import { createApp } from "../app/app.js";
import { db } from "../lib/db.js";
import { ensureTestPrincipals } from "./test-fixtures.js";

const app = createApp();
const customer = request.agent(app);
const admin = request.agent(app);
const deliveryAdmin = request.agent(app);
const adminPassword = "Eagle" + "club@12345";
const cleanup = { userId: "", addressId: "", orderNumbers: [] as string[], offlineSaleIds: [] as string[], deliveryStaffIds: [] as string[] };
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
  await ensureTestPrincipals();
  const suffix = Date.now();
  const deliveryRole = await db.role.findUniqueOrThrow({ where: { name: "DELIVERY_STAFF" } });
  const deliveryTestAdmin = await db.adminUser.create({
    data: {
      name: "Inventory Test Delivery",
      email: `delivery-${suffix}@eagleclub.in`,
      normalizedEmail: `delivery-${suffix}@eagleclub.in`,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      roleId: deliveryRole.id,
      status: "ACTIVE",
    },
  });
  const testStaff = await db.deliveryStaff.create({
    data: { name: "Inventory Test Delivery", phone: String(8800000000 + (suffix % 1000000000)).slice(0, 10), adminUserId: deliveryTestAdmin.id, active: true },
  });
  cleanup.deliveryStaffIds.push(testStaff.id);
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
  await deliveryAdmin.post("/api/admin/auth/login").send({ email: deliveryTestAdmin.email, password: adminPassword }).expect(200);

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
  deliveryStaffId = testStaff.id;
});

afterAll(async () => {
  for (const orderNumber of cleanup.orderNumbers) {
    const order = await db.order.findUnique({ where: { orderNumber } });
    if (!order) continue;
    await db.deliveryAssignment.deleteMany({ where: { orderId: order.id } });
    await db.customerDeliveryConfirmation.deleteMany({ where: { orderId: order.id } });
    await db.orderStatusHistory.deleteMany({ where: { orderId: order.id } });
    await db.stockMovement.deleteMany({ where: { orderId: order.id } });
    await db.couponUsage.deleteMany({ where: { orderId: order.id } });
    await db.payment.deleteMany({ where: { orderId: order.id } });
    await db.invoice.deleteMany({ where: { orderId: order.id } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
  }
  for (const offlineSaleId of cleanup.offlineSaleIds) {
    const sale = await db.offlineSale.findUnique({ where: { id: offlineSaleId } });
    await db.stockMovement.deleteMany({ where: { referenceType: "OFFLINE_SALE", referenceId: sale?.referenceNumber || offlineSaleId } });
    await db.invoice.deleteMany({ where: { offlineSaleId } });
    await db.offlineSaleItem.deleteMany({ where: { offlineSaleId } });
    await db.offlineSale.deleteMany({ where: { id: offlineSaleId } });
  }
  if (cleanup.deliveryStaffIds.length) {
    await db.deliveryStaff.deleteMany({ where: { id: { in: cleanup.deliveryStaffIds } } });
  }
  if (cleanup.userId) {
    const cart = await db.cart.findUnique({ where: { userId: cleanup.userId } });
    if (cart) await db.cartItem.deleteMany({ where: { cartId: cart.id } });
    if (cart) await db.cart.delete({ where: { id: cart.id } });
    await db.address.deleteMany({ where: { userId: cleanup.userId } });
    await db.user.delete({ where: { id: cleanup.userId } });
  }
  if (inventoryId) {
    await db.inventory.update({ where: { id: inventoryId }, data: { stock: startingStock, reserved: 0 } });
  }
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

  it("places COD order, clears cart, reserves stock, and creates reservation movement", async () => {
    const before = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    const order = await placeCod(2);
    expect(order.orderNumber).toBeTruthy();
    expect(order.paymentStatus).toBe("COD Pending");

    const cart = await customer.get("/api/cart").expect(200);
    expect(cart.body.data.cart.items).toHaveLength(0);

    const after = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    expect(after.stock).toBe(before.stock);
    expect(after.reserved).toBe(before.reserved + 2);
    const movement = await db.stockMovement.findFirst({ where: { orderId: order.id, type: StockMovementType.ONLINE_RESERVATION } });
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

  it("verifies success, clears cart, and keeps stock reserved until dispatch", async () => {
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
    expect(after.stock).toBe(before.stock);
    expect(after.reserved).toBe(before.reserved + 1);
    const cart = await customer.get("/api/cart").expect(200);
    expect(cart.body.data.cart.items).toHaveLength(0);
    const movements = await db.stockMovement.count({ where: { order: { orderNumber: created.body.data.orderNumber }, type: StockMovementType.ONLINE_RESERVATION } });
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
    expect(afterCancel.stock).toBe(beforeCancel.stock);
    expect(afterCancel.reserved).toBe(Math.max(0, beforeCancel.reserved - 1));
    expect(await db.stockMovement.findFirst({ where: { orderId: order.id, type: StockMovementType.ORDER_CANCELLED } })).toBeTruthy();
  });
});

describe("admin order and inventory APIs", () => {
  it("updates order status and assigns delivery staff", async () => {
    const order = await placeCod(1);
    const status = await admin.patch(`/api/admin/orders/${order.orderNumber}/status`).send({ status: OrderStatus.CONFIRMED }).expect(200);
    expect(status.body.data.order.status).toBe("Confirmed");
    await admin.patch(`/api/admin/orders/${order.orderNumber}/status`).send({ status: OrderStatus.DELIVERED }).expect(400);

    const assigned = await admin.post(`/api/admin/orders/${order.orderNumber}/assign-delivery`).send({ deliveryStaffId }).expect(200);
    expect(assigned.body.data.order.deliveryStaff).toBeTruthy();
  });

  it("auto-assigns packed delivery orders to the linked delivery login queue", async () => {
    const order = await placeCod(1);
    const packed = await admin.patch(`/api/admin/orders/${order.orderNumber}/status`).send({ status: OrderStatus.PACKED }).expect(200);
    expect(packed.body.data.order.status).toBe("Packed");
    expect(packed.body.data.order.deliveryStaffId).toBe(deliveryStaffId);

    const queue = await deliveryAdmin.get("/api/admin/orders").expect(200);
    const orderNumbers = queue.body.data.orders.map((item: { orderNumber: string }) => item.orderNumber);
    expect(orderNumbers).toContain(order.orderNumber);
  });

  it("keeps delivery staff scoped to assigned orders and blocks manager lists", async () => {
    const assignedOrder = await placeCod(1);
    const unassignedOrder = await placeCod(1);
    await admin.post(`/api/admin/orders/${assignedOrder.orderNumber}/assign-delivery`).send({ deliveryStaffId }).expect(200);

    await deliveryAdmin.get("/api/admin/delivery-staff").expect(403);
    await deliveryAdmin.get("/api/admin/delivery-slots").expect(403);

    const response = await deliveryAdmin.get("/api/admin/orders").expect(200);
    const orderNumbers = response.body.data.orders.map((order: { orderNumber: string }) => order.orderNumber);
    expect(orderNumbers).toContain(assignedOrder.orderNumber);
    expect(orderNumbers).not.toContain(unassignedOrder.orderNumber);
  });

  it("shows all active assigned delivery orders in the delivery operations portal", async () => {
    const order = await placeCod(1);
    const otherStaff = await db.deliveryStaff.create({
      data: { name: `Route Staff ${Date.now()}`, phone: `8${String(Date.now()).slice(-9)}`, active: true },
    });
    cleanup.deliveryStaffIds.push(otherStaff.id);
    await admin.post(`/api/admin/orders/${order.orderNumber}/assign-delivery`).send({ deliveryStaffId: otherStaff.id }).expect(200);
    await admin.patch(`/api/admin/orders/${order.orderNumber}/status`).send({ status: OrderStatus.OUT_FOR_DELIVERY }).expect(200);

    const response = await deliveryAdmin.get("/api/admin/delivery-orders").expect(200);
    const visibleOrder = response.body.data.orders.find((item: { orderNumber: string }) => item.orderNumber === order.orderNumber);
    expect(visibleOrder).toBeTruthy();
    expect(visibleOrder.deliveryStaff).toBe(otherStaff.name);

    const compatibleResponse = await deliveryAdmin.get("/api/admin/orders").expect(200);
    const compatibleVisibleOrder = compatibleResponse.body.data.orders.find((item: { orderNumber: string }) => item.orderNumber === order.orderNumber);
    expect(compatibleVisibleOrder).toBeTruthy();
    expect(compatibleVisibleOrder.deliveryStaff).toBe(otherStaff.name);
  });

  it("requires customer receipt confirmation before delivery staff can complete delivery", async () => {
    const order = await placeCod(1);
    await admin.patch(`/api/admin/orders/${order.orderNumber}/status`).send({ status: OrderStatus.CONFIRMED }).expect(200);
    await admin.post(`/api/admin/orders/${order.orderNumber}/assign-delivery`).send({ deliveryStaffId }).expect(200);
    await deliveryAdmin.patch(`/api/admin/orders/${order.orderNumber}/delivery-status`).send({ status: OrderStatus.OUT_FOR_DELIVERY }).expect(200);
    await deliveryAdmin.patch(`/api/admin/orders/${order.orderNumber}/delivery-status`).send({ status: OrderStatus.DELIVERED }).expect(400);

    const confirmed = await customer.post(`/api/orders/${order.orderNumber}/confirm-received`).send({ note: "Received by customer" }).expect(200);
    expect(confirmed.body.data.order.status).toBe("Out for Delivery");
    expect(confirmed.body.data.order.customerConfirmedAt).toBeTruthy();

    await deliveryAdmin.patch(`/api/admin/orders/${order.orderNumber}/delivery-status`).send({ status: OrderStatus.DELIVERED }).expect(400);
    const paid = await deliveryAdmin.patch(`/api/admin/orders/${order.orderNumber}/payment-status`).send({ status: "PAID", note: "COD collected at doorstep" }).expect(200);
    expect(paid.body.data.order.paymentStatus).toBe("Paid");

    const delivered = await deliveryAdmin.patch(`/api/admin/orders/${order.orderNumber}/delivery-status`).send({ status: OrderStatus.DELIVERED }).expect(200);
    expect(delivered.body.data.order.status).toBe("Delivered");
    expect(delivered.body.data.order.deliveryAssignmentStatus).toBe(DeliveryStatus.DELIVERED);
  });

  it("starts delivery even when an older order is missing reserved stock", async () => {
    const order = await placeCod(1);
    await admin.patch(`/api/admin/orders/${order.orderNumber}/status`).send({ status: OrderStatus.CONFIRMED }).expect(200);
    await admin.post(`/api/admin/orders/${order.orderNumber}/assign-delivery`).send({ deliveryStaffId }).expect(200);
    await db.inventory.update({ where: { id: inventoryId }, data: { reserved: 0 } });

    const started = await deliveryAdmin.patch(`/api/admin/orders/${order.orderNumber}/delivery-status`).send({ status: OrderStatus.OUT_FOR_DELIVERY }).expect(200);
    expect(started.body.data.order.status).toBe("Out for Delivery");
    expect(started.body.data.order.deliveryAssignmentStatus).toBe(DeliveryStatus.OUT_FOR_DELIVERY);
    await deliveryAdmin.patch(`/api/admin/orders/${order.orderNumber}/delivery-status`).send({ status: OrderStatus.OUT_FOR_DELIVERY }).expect(200);
    const movement = await db.stockMovement.findFirstOrThrow({ where: { orderId: order.id, type: StockMovementType.ONLINE_SALE } });
    expect(movement.note || "").toContain("reconciled missing reservation");
  });

  it("lets payment staff reconcile COD payment status", async () => {
    const order = await placeCod(1);
    const paid = await admin.patch(`/api/admin/orders/${order.orderNumber}/payment-status`).send({ status: "PAID", note: "Counter payment collected" }).expect(200);
    expect(paid.body.data.order.paymentStatus).toBe("Paid");

    const retry = await admin.patch(`/api/admin/orders/${order.orderNumber}/payment-status`).send({ status: "COD_PENDING", note: "Correction for payment retry" }).expect(200);
    expect(retry.body.data.order.paymentStatus).toBe("COD Pending");

    const failed = await admin.patch(`/api/admin/orders/${order.orderNumber}/payment-status`).send({ status: "FAILED", note: "Customer did not pay" }).expect(200);
    expect(failed.body.data.order.paymentStatus).toBe("Failed");
  });

  it("supports compatible admin payment update routes", async () => {
    const order = await placeCod(1);
    const paid = await admin.patch(`/api/admin/payments/${order.orderNumber}/status`).send({ status: "PAID", note: "Counter alias collected" }).expect(200);
    expect(paid.body.data.order.paymentStatus).toBe("Paid");

    const retry = await admin.patch(`/api/admin/orders/${order.orderNumber}/payment`).send({ status: "COD_PENDING", note: "Alias retry" }).expect(200);
    expect(retry.body.data.order.paymentStatus).toBe("COD Pending");
  });

  it("records failed delivery attempts without completing the order", async () => {
    const order = await placeCod(1);
    await admin.patch(`/api/admin/orders/${order.orderNumber}/status`).send({ status: OrderStatus.CONFIRMED }).expect(200);
    await admin.post(`/api/admin/orders/${order.orderNumber}/assign-delivery`).send({ deliveryStaffId }).expect(200);
    await deliveryAdmin.patch(`/api/admin/orders/${order.orderNumber}/delivery-status`).send({ status: OrderStatus.OUT_FOR_DELIVERY }).expect(200);

    const failed = await deliveryAdmin.post(`/api/admin/orders/${order.orderNumber}/delivery-failure`).send({
      reason: "CUSTOMER_NOT_AVAILABLE",
      note: "Customer relative was not available at address",
    }).expect(200);

    expect(failed.body.data.order.status).toBe("Out for Delivery");
    expect(failed.body.data.order.deliveryAssignmentStatus).toBe(DeliveryStatus.FAILED);
    expect(failed.body.data.order.deliveryFailureReason).toBe("CUSTOMER_NOT_AVAILABLE");
  });

  it("adjusts inventory and records movement", async () => {
    const before = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    const adjusted = await admin.post(`/api/admin/inventory/${inventoryId}/adjust`).send({ quantity: 3, note: "Phase eight restock" }).expect(200);
    expect(adjusted.body.data.inventory.stock).toBe(before.stock + 3 - before.reserved);
    const movement = await db.stockMovement.findFirst({ where: { inventoryId, type: StockMovementType.RESTOCK, note: "Phase eight restock" } });
    expect(movement).toBeTruthy();
  });

  it("records offline store purchases in inventory movements for superadmin", async () => {
    const before = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    const response = await admin.post("/api/admin/inventory/offline-sales").send({
      note: "Walk-in store sale",
      paymentMethod: "CASH",
      cashReceived: 30,
      items: [{ productId, variantId, quantity: 1, unitPrice: 25 }],
    }).expect(201);
    cleanup.offlineSaleIds.push(response.body.data.sale.id);

    const after = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    expect(after.stock).toBe(before.stock - 1);
    expect(after.sold).toBe(before.sold + 1);
    expect(response.body.data.sale.referenceNumber).toMatch(/^POS-\d{4}-\d{6}$/);
    expect(response.body.data.sale.invoiceNumber).toMatch(/^INV-POS-\d{4}-\d{6}$/);
    expect(response.body.data.sale.receiptNumber).toMatch(/^RCPT-\d{4}-\d{6}$/);
    expect(Number(response.body.data.sale.changeDue)).toBe(5);
    const invoice = await db.invoice.findUnique({ where: { offlineSaleId: response.body.data.sale.id } });
    expect(invoice?.invoiceNumber).toBe(response.body.data.sale.invoiceNumber);
    const movement = await db.stockMovement.findFirst({ where: { referenceType: "OFFLINE_SALE", referenceId: response.body.data.sale.referenceNumber, type: StockMovementType.OFFLINE_SALE } });
    expect(movement).toBeTruthy();
  });

  it("rejects underpaid cash POS sales and accepts exact or extra cash", async () => {
    await admin.post("/api/admin/inventory/offline-sales").send({
      paymentMethod: "CASH",
      cashReceived: 24,
      items: [{ productId, variantId, quantity: 1, unitPrice: 25 }],
    }).expect(400);

    const exact = await admin.post("/api/admin/inventory/offline-sales").send({
      paymentMethod: "CASH",
      cashReceived: 25,
      items: [{ productId, variantId, quantity: 1, unitPrice: 25 }],
    }).expect(201);
    cleanup.offlineSaleIds.push(exact.body.data.sale.id);
    expect(Number(exact.body.data.sale.changeDue)).toBe(0);

    const extra = await admin.post("/api/admin/inventory/offline-sales").send({
      paymentMethod: "CASH",
      cashReceived: 50,
      items: [{ productId, variantId, quantity: 1, unitPrice: 25 }],
    }).expect(201);
    cleanup.offlineSaleIds.push(extra.body.data.sale.id);
    expect(Number(extra.body.data.sale.changeDue)).toBe(25);
  });

  it("resolves POS barcode, QR, SKU, product code and PLU from live inventory", async () => {
    const token = String(Date.now());
    const previous = await db.product.findUniqueOrThrow({ where: { id: productId }, select: { barcode: true, qrCode: true, pluCode: true, clientProductCode: true } });
    const product = await db.product.update({
      where: { id: productId },
      data: {
        clientProductCode: `PCTEST${token}`,
        barcode: `890TEST${token}`,
        qrCode: `EAGLE_PRODUCT:${productId}`,
        pluCode: `PLU${token.slice(-6)}`,
      },
    });
    const codes = [product.barcode, product.qrCode, product.sku, product.clientProductCode, product.pluCode].filter(Boolean) as string[];
    for (const code of codes) {
      const response = await admin.get(`/api/admin/inventory/pos-lookup?code=${encodeURIComponent(code)}`).expect(200);
      expect(response.body.data.match.productId).toBe(productId);
      expect(response.body.data.match.product.sku).toBe(product.sku);
      expect(response.body.data.match.stock).toEqual(expect.any(Number));
    }
    await db.product.update({ where: { id: productId }, data: previous });
  });

  it("syncs queued POS sales idempotently and records stock conflicts", async () => {
    const before = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    const key = `POS:test-device:${Date.now()}`;
    const first = await admin.post("/api/admin/inventory/offline-sync").send({
      deviceId: "test-device",
      sales: [{
        localReference: `LOCAL-${Date.now()}`,
        idempotencyKey: key,
        paymentMethod: "CASH",
        cashReceived: 50,
        items: [{ productId, variantId, quantity: 1, unitPrice: 25 }],
      }],
    }).expect(200);
    cleanup.offlineSaleIds.push(first.body.data.results[0].saleId);

    const duplicate = await admin.post("/api/admin/inventory/offline-sync").send({
      deviceId: "test-device",
      sales: [{
        localReference: `LOCAL-DUP-${Date.now()}`,
        idempotencyKey: key,
        paymentMethod: "CASH",
        cashReceived: 50,
        items: [{ productId, variantId, quantity: 1, unitPrice: 25 }],
      }],
    }).expect(200);

    const after = await db.inventory.findUniqueOrThrow({ where: { id: inventoryId } });
    expect(first.body.data.results[0].status).toBe("SYNCED");
    expect(duplicate.body.data.results[0].serverReference).toBe(first.body.data.results[0].serverReference);
    expect(after.stock).toBe(before.stock - 1);

    const conflictRef = `LOCAL-CONFLICT-${Date.now()}`;
    const conflict = await admin.post("/api/admin/inventory/offline-sync").send({
      deviceId: "test-device",
      sales: [{
        localReference: conflictRef,
        idempotencyKey: `POS:test-device:conflict:${Date.now()}`,
        paymentMethod: "CASH",
        cashReceived: 250000,
        items: [{ productId, variantId, quantity: 10000, unitPrice: 25 }],
      }],
    }).expect(200);

    expect(conflict.body.data.results[0].status).toBe("STOCK_CONFLICT");
    const savedConflict = await db.offlineSyncConflict.findUnique({ where: { localReference: conflictRef } });
    expect(savedConflict?.status).toBe("STOCK_CONFLICT");
    if (savedConflict) await db.offlineSyncConflict.delete({ where: { id: savedConflict.id } });
  });
});
