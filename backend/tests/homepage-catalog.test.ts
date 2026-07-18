import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProductStatus } from "@prisma/client";
import { createApp } from "../app/app.js";
import { db } from "../lib/db.js";

const app = createApp();
const stamp = Date.now();
const ids = { categoryId: "", brandId: "", productId: "", variantId: "" };

describe("homepage catalogue synchronization", () => {
  beforeAll(async () => {
    const category = await db.category.create({
      data: { name: `Food Items Test ${stamp}`, slug: `food-items-test-${stamp}`, status: ProductStatus.ACTIVE },
    });
    const brand = await db.brand.create({
      data: { name: `Catalogue Brand ${stamp}`, slug: `catalogue-brand-${stamp}`, status: ProductStatus.ACTIVE },
    });
    const product = await db.product.create({
      data: {
        name: `Homepage Catalogue Product ${stamp}`,
        slug: `homepage-catalogue-product-${stamp}`,
        sku: `HOME-${stamp}`,
        categoryId: category.id,
        brandId: brand.id,
        description: "Temporary product for homepage catalogue tests.",
        gst: 5,
        tags: [],
        featured: true,
        status: ProductStatus.ACTIVE,
      },
    });
    const variant = await db.productVariant.create({
      data: { productId: product.id, sku: `HOME-${stamp}-1`, label: "1 pc", unit: "1 pc", mrp: 100, price: 90, status: ProductStatus.ACTIVE },
    });
    await db.inventory.create({ data: { productId: product.id, variantId: variant.id, stock: 10, lowStockThreshold: 5 } });
    ids.categoryId = category.id;
    ids.brandId = brand.id;
    ids.productId = product.id;
    ids.variantId = variant.id;
  });

  afterAll(async () => {
    await db.inventory.deleteMany({ where: { productId: ids.productId } });
    await db.productVariant.deleteMany({ where: { productId: ids.productId } });
    await db.productImage.deleteMany({ where: { productId: ids.productId } });
    await db.product.deleteMany({ where: { id: ids.productId } });
    await db.category.deleteMany({ where: { id: ids.categoryId } });
    await db.brand.deleteMany({ where: { id: ids.brandId } });
    await db.$disconnect();
  });

  it("returns active placeholder products in homepage groups", async () => {
    const response = await request(app).get("/api/catalog/home").expect(200);
    const packaged = response.body.data.sections.find((section: any) => section.slug === "packaged-food");
    expect(packaged.products.some((product: any) => product.id === ids.productId)).toBe(true);
    const product = packaged.products.find((item: any) => item.id === ids.productId);
    expect(product.primaryImageUrl).toContain("/assets/placeholders/");
    expect(product.costPrice).toBeUndefined();
  });

  it("uses grouped category slugs on the normal product endpoint", async () => {
    const response = await request(app).get("/api/products").query({ category: "packaged-food", search: `Homepage Catalogue Product ${stamp}`, limit: 20 }).expect(200);
    expect(response.body.data.products.some((product: any) => product.id === ids.productId)).toBe(true);
  });
});
