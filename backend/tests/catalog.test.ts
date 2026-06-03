import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app/app.js";
import { db } from "../lib/db.js";

const app = createApp();
const superAdmin = request.agent(app);
const inventoryAdmin = request.agent(app);
const created = {
  productId: "",
  categoryId: "",
  brandId: "",
};

beforeAll(async () => {
  await superAdmin
    .post("/api/admin/auth/login")
    .send({ email: "superadmin@eagleclub.in", password: "Eagleclub@12345" })
    .expect(200);

  await inventoryAdmin
    .post("/api/admin/auth/login")
    .send({ email: "inventory@eagleclub.in", password: "Eagleclub@12345" })
    .expect(200);
});

afterAll(async () => {
  if (created.productId) {
    const variants = await db.productVariant.findMany({ where: { productId: created.productId }, select: { id: true } });
    await db.inventory.deleteMany({ where: { productId: created.productId } });
    await db.productImage.deleteMany({ where: { productId: created.productId } });
    await db.productVariant.deleteMany({ where: { id: { in: variants.map((item) => item.id) } } });
    await db.product.deleteMany({ where: { id: created.productId } });
  }
  if (created.categoryId) await db.category.deleteMany({ where: { id: created.categoryId } });
  if (created.brandId) await db.brand.deleteMany({ where: { id: created.brandId } });
  await db.$disconnect();
});

describe("public catalog APIs", () => {
  it("lists active categories and brands", async () => {
    const categories = await request(app).get("/api/categories").expect(200);
    const brands = await request(app).get("/api/brands").expect(200);

    expect(categories.body.data.categories.length).toBeGreaterThan(0);
    expect(brands.body.data.brands.length).toBeGreaterThan(0);
    expect(categories.body.data.categories[0].image).toBeTruthy();
  });

  it("lists products with pagination, filters, and product card fields", async () => {
    const response = await request(app).get("/api/products?limit=5&sort=popular").expect(200);

    expect(response.body.data.products.length).toBeGreaterThan(0);
    expect(response.body.data.pagination.total).toBeGreaterThan(0);
    expect(response.body.data.filters.categories.length).toBeGreaterThan(0);
    expect(response.body.data.products[0]).toMatchObject({
      id: expect.any(String),
      slug: expect.any(String),
      name: expect.any(String),
      sku: expect.any(String),
      brand: expect.any(String),
      category: expect.any(String),
      unit: expect.any(String),
      image: expect.any(String),
    });
  });

  it("searches and returns a product detail payload", async () => {
    const list = await request(app).get("/api/search?q=milk&limit=1").expect(200);
    const product = list.body.data.products[0] ?? (await request(app).get("/api/products?limit=1").expect(200)).body.data.products[0];

    const detail = await request(app).get(`/api/products/${product.slug}`).expect(200);
    expect(detail.body.data.product.slug).toBe(product.slug);
    expect(detail.body.data.product.relatedProducts).toBeDefined();
    expect(detail.body.data.product.frequentlyBoughtTogether).toBeDefined();
    expect(detail.body.data.product.returnPolicy).toBeTruthy();
  });
});

describe("admin catalog APIs", () => {
  it("requires admin auth for product management", async () => {
    await request(app).get("/api/admin/products").expect(401);
  });

  it("creates category, brand, and product as super admin", async () => {
    const suffix = Date.now();
    const category = await superAdmin
      .post("/api/admin/categories")
      .send({ name: `Phase Six Category ${suffix}`, slug: `phase-six-category-${suffix}`, image: "/assets/placeholders/category-placeholder.svg" })
      .expect(201);
    created.categoryId = category.body.data.category.id;

    const brand = await superAdmin
      .post("/api/admin/brands")
      .send({ name: `Phase Six Brand ${suffix}`, slug: `phase-six-brand-${suffix}`, logo: "/assets/placeholders/category-placeholder.svg" })
      .expect(201);
    created.brandId = brand.body.data.brand.id;

    const product = await superAdmin
      .post("/api/admin/products")
      .send({
        name: `Phase Six Product ${suffix}`,
        slug: `phase-six-product-${suffix}`,
        sku: `P6-${suffix}`,
        categoryId: created.categoryId,
        brandId: created.brandId,
        description: "Seeded by catalog API test.",
        gst: 5,
        tags: ["test", "catalog"],
        featured: true,
        organic: false,
        local: true,
        image: "/assets/placeholders/product-placeholder.svg",
        variant: { sku: `P6-${suffix}-1`, label: "Pack", unit: "1 kg", mrp: 120, price: 99 },
        inventory: { stock: 25, lowStockThreshold: 5 },
      })
      .expect(201);

    created.productId = product.body.data.product.id;
    expect(product.body.data.product.price).toBe(99);
    expect(product.body.data.product.stock).toBe(25);
  });

  it("lets inventory manager view products but not delete them", async () => {
    const list = await inventoryAdmin.get("/api/admin/products?limit=5").expect(200);
    expect(list.body.data.products.length).toBeGreaterThan(0);

    await inventoryAdmin.delete(`/api/admin/products/${created.productId}`).expect(403);
  });

  it("updates and soft deletes a product as super admin", async () => {
    const update = await superAdmin
      .patch(`/api/admin/products/${created.productId}`)
      .send({ name: "Phase Six Product Updated", variant: { price: 89 }, inventory: { stock: 12 } })
      .expect(200);

    expect(update.body.data.product.name).toBe("Phase Six Product Updated");
    expect(update.body.data.product.price).toBe(89);
    expect(update.body.data.product.stock).toBe(12);

    await superAdmin.delete(`/api/admin/products/${created.productId}`).expect(200);
    const deleted = await db.product.findUniqueOrThrow({ where: { id: created.productId } });
    expect(deleted.deletedAt).not.toBeNull();
  });
});
