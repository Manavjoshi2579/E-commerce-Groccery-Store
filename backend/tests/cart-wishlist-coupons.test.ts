import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CouponType, UserStatus } from "@prisma/client";
import { createApp } from "../app/app.js";
import { db } from "../lib/db.js";
import { ensureTestPrincipals } from "./test-fixtures.js";

const app = createApp();
const customer = request.agent(app);
const admin = request.agent(app);
const adminPassword = "Eagle" + "club@12345";
const cleanup = {
  userId: "",
  couponIds: [] as string[],
  orderIds: [] as string[],
};
let productId = "";
let variantId = "";
let cartItemId = "";

beforeAll(async () => {
  await ensureTestPrincipals();
  const suffix = Date.now();
  const user = await db.user.create({
    data: {
      name: "Phase Seven Customer",
      email: `phase7-${suffix}@eagleclub.in`,
      passwordHash: await bcrypt.hash("Customer@12345", 12),
      status: UserStatus.ACTIVE,
    },
  });
  cleanup.userId = user.id;

  await customer.post("/api/auth/login").send({ email: user.email, password: "Customer@12345" }).expect(200);
  await admin.post("/api/admin/auth/login").send({ email: "superadmin@eagleclub.in", password: adminPassword }).expect(200);

  const product = await db.product.findFirstOrThrow({
    where: { deletedAt: null, status: "ACTIVE", inventory: { some: { stock: { gte: 20 } } } },
    include: { variants: true },
  });
  productId = product.id;
  variantId = product.variants[0].id;
});

afterAll(async () => {
  if (cleanup.userId) {
    const cart = await db.cart.findUnique({ where: { userId: cleanup.userId } });
    if (cart) await db.cartItem.deleteMany({ where: { cartId: cart.id } });
    if (cart) await db.cart.delete({ where: { id: cart.id } });
    const wishlist = await db.wishlist.findUnique({ where: { userId: cleanup.userId } });
    if (wishlist) await db.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id } });
    if (wishlist) await db.wishlist.delete({ where: { id: wishlist.id } });
    await db.user.delete({ where: { id: cleanup.userId } });
  }
  if (cleanup.couponIds.length) await db.coupon.deleteMany({ where: { id: { in: cleanup.couponIds } } });
  if (cleanup.orderIds.length) await db.order.deleteMany({ where: { id: { in: cleanup.orderIds } } });
  await db.$disconnect();
});

describe("customer cart APIs", () => {
  it("gets an empty cart", async () => {
    const response = await customer.delete("/api/cart").expect(200);
    expect(response.body.data.cart.items).toHaveLength(0);
    expect(response.body.data.cart.total).toBe(0);
  });

  it("adds an item and increases quantity when added again", async () => {
    const first = await customer.post("/api/cart/items").send({ productId, variantId, quantity: 2 }).expect(201);
    expect(first.body.data.cart.itemCount).toBe(2);
    cartItemId = first.body.data.cart.items[0].id;

    const second = await customer.post("/api/cart/items").send({ productId, variantId, quantity: 3 }).expect(201);
    expect(second.body.data.cart.items).toHaveLength(1);
    expect(second.body.data.cart.itemCount).toBe(5);
  });

  it("updates quantity and rejects quantity above stock", async () => {
    const update = await customer.patch(`/api/cart/items/${cartItemId}`).send({ quantity: 4 }).expect(200);
    expect(update.body.data.cart.itemCount).toBe(4);

    const rejected = await customer.patch(`/api/cart/items/${cartItemId}`).send({ quantity: 100000 }).expect(400);
    expect(rejected.body.error.message).toBe("Requested quantity exceeds available stock.");
  });

  it("removes an item and clears the cart", async () => {
    await customer.delete(`/api/cart/items/${cartItemId}`).expect(200);
    await customer.post("/api/cart/items").send({ productId, variantId, quantity: 1 }).expect(201);
    const cleared = await customer.delete("/api/cart").expect(200);
    expect(cleared.body.data.cart.items).toHaveLength(0);
  });
});

describe("wishlist APIs", () => {
  it("adds wishlist item and avoids duplicates", async () => {
    const first = await customer.post("/api/wishlist/items").send({ productId }).expect(201);
    const second = await customer.post("/api/wishlist/items").send({ productId }).expect(201);
    expect(first.body.data.wishlist.itemCount).toBe(1);
    expect(second.body.data.wishlist.itemCount).toBe(1);
  });

  it("moves wishlist item to cart", async () => {
    const response = await customer.post(`/api/wishlist/items/${productId}/move-to-cart`).expect(200);
    expect(response.body.data.wishlist.itemCount).toBe(0);
    expect(response.body.data.cart.itemCount).toBeGreaterThan(0);
  });

  it("removes wishlist item", async () => {
    await customer.post("/api/wishlist/items").send({ productId }).expect(201);
    const response = await customer.delete(`/api/wishlist/items/${productId}`).expect(200);
    expect(response.body.data.wishlist.itemCount).toBe(0);
  });
});

describe("coupon APIs", () => {
  it("applies a valid coupon", async () => {
    await customer.delete("/api/cart").expect(200);
    await customer.post("/api/cart/items").send({ productId, variantId, quantity: 8 }).expect(201);
    const coupon = await db.coupon.create({
      data: {
        code: `P7VALID${Date.now()}`,
        title: "Phase seven valid coupon",
        type: CouponType.FIXED,
        value: 25,
        minOrderAmount: 1,
        startAt: new Date(Date.now() - 60_000),
        endAt: new Date(Date.now() + 86_400_000),
        active: true,
      },
    });
    cleanup.couponIds.push(coupon.id);

    const response = await customer.post("/api/coupons/validate").send({ code: coupon.code }).expect(200);
    expect(response.body.data.valid).toBe(true);
    expect(response.body.data.discountAmount).toBe(25);
    expect(response.body.data.cart.appliedCoupon.code).toBe(coupon.code);
  });

  it("rejects invalid, expired, minimum amount, and per-user limit coupons", async () => {
    const invalid = await customer.post("/api/coupons/validate").send({ code: "NOTREAL" }).expect(200);
    expect(invalid.body.data.valid).toBe(false);

    const expired = await db.coupon.create({
      data: {
        code: `P7EXP${Date.now()}`,
        title: "Expired coupon",
        type: CouponType.FIXED,
        value: 10,
        minOrderAmount: 1,
        startAt: new Date(Date.now() - 86_400_000),
        endAt: new Date(Date.now() - 60_000),
        active: true,
      },
    });
    cleanup.couponIds.push(expired.id);
    expect((await customer.post("/api/coupons/validate").send({ code: expired.code }).expect(200)).body.data.valid).toBe(false);

    const highMin = await db.coupon.create({
      data: {
        code: `P7MIN${Date.now()}`,
        title: "High minimum coupon",
        type: CouponType.FIXED,
        value: 10,
        minOrderAmount: 999999,
        startAt: new Date(Date.now() - 60_000),
        endAt: new Date(Date.now() + 86_400_000),
        active: true,
      },
    });
    cleanup.couponIds.push(highMin.id);
    expect((await customer.post("/api/coupons/validate").send({ code: highMin.code }).expect(200)).body.data.valid).toBe(false);

    const used = await db.coupon.create({
      data: {
        code: `P7LIMIT${Date.now()}`,
        title: "Per user limit coupon",
        type: CouponType.FIXED,
        value: 10,
        minOrderAmount: 1,
        perUserLimit: 1,
        startAt: new Date(Date.now() - 60_000),
        endAt: new Date(Date.now() + 86_400_000),
        active: true,
      },
    });
    cleanup.couponIds.push(used.id);
    const order = await db.order.create({
      data: {
        orderNumber: `P7-${Date.now()}`,
        userId: cleanup.userId,
        customerName: "Phase Seven Customer",
        customerPhone: "9876543210",
        addressLine: "Coupon usage fixture",
        addressCity: "Ahmedabad",
        addressPincode: "380015",
        deliveryDate: new Date(),
        paymentMethod: "COD",
        paymentStatus: "COD_PENDING",
        subtotal: 100,
        grandTotal: 100,
      },
    });
    cleanup.orderIds.push(order.id);
    await db.couponUsage.create({ data: { couponId: used.id, userId: cleanup.userId, orderId: order.id, discountAmount: 10 } });
    expect((await customer.post("/api/coupons/validate").send({ code: used.code }).expect(200)).body.data.valid).toBe(false);
    await db.couponUsage.deleteMany({ where: { couponId: used.id, userId: cleanup.userId } });
  });

  it("supports free delivery coupons", async () => {
    const coupon = await db.coupon.create({
      data: {
        code: `P7SHIP${Date.now()}`,
        title: "Free delivery coupon",
        type: CouponType.FREE_DELIVERY,
        value: 49,
        minOrderAmount: 1,
        maxDiscount: 49,
        startAt: new Date(Date.now() - 60_000),
        endAt: new Date(Date.now() + 86_400_000),
        active: true,
      },
    });
    cleanup.couponIds.push(coupon.id);
    const response = await customer.post("/api/coupons/validate").send({ code: coupon.code }).expect(200);
    expect(response.body.data.valid).toBe(true);
    expect(response.body.data.cart.deliveryCharge).toBe(0);
  });
});

describe("admin coupon APIs", () => {
  it("creates, edits, and deletes coupons as admin", async () => {
    const code = `P7ADMIN${Date.now()}`;
    const created = await admin
      .post("/api/admin/coupons")
      .send({
        code,
        title: "Admin phase seven coupon",
        type: CouponType.FIXED,
        value: 15,
        minOrderAmount: 100,
        startAt: new Date(Date.now() - 60_000).toISOString(),
        endAt: new Date(Date.now() + 86_400_000).toISOString(),
        active: true,
      })
      .expect(201);
    cleanup.couponIds.push(created.body.data.coupon.id);

    const updated = await admin.patch(`/api/admin/coupons/${created.body.data.coupon.id}`).send({ title: "Updated coupon", active: false }).expect(200);
    expect(updated.body.data.coupon.title).toBe("Updated coupon");
    expect(updated.body.data.coupon.active).toBe(false);

    await admin.delete(`/api/admin/coupons/${created.body.data.coupon.id}`).expect(200);
  });

  it("blocks unauthenticated admin coupon access", async () => {
    await request(app).get("/api/admin/coupons").expect(401);
  });
});
