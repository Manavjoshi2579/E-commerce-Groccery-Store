import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProductStatus } from "@prisma/client";
import fs from "node:fs";
import { createApp } from "../app/app.js";
import { db } from "../lib/db.js";

const app = createApp();
const stamp = Date.now();
const ids = { categoryId: "", brandId: "", productId: "", variantId: "" };

describe("homepage catalogue synchronization", () => {
  beforeAll(async () => {
    const category = await db.category.create({
      data: { name: `Food Items Test ${stamp}`, slug: `food-items-test-${stamp}`, image: "/assets/categories/category-placeholder.webp", status: ProductStatus.ACTIVE },
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
    const section = response.body.data.sections.find((item: any) => item.slug === `food-items-test-${stamp}`);
    expect(section).toBeTruthy();
    expect(section.bannerImageUrl).toBe("/assets/categories/category-placeholder.webp");
    expect(section.productCount).toBe(section.products.length);
    expect(section.products.some((product: any) => product.id === ids.productId)).toBe(true);
    const product = section.products.find((item: any) => item.id === ids.productId);
    expect(product.primaryImageUrl).toBe("/assets/products/product-placeholder.svg");
    expect(product.primaryImageUrl).not.toBe(section.bannerImageUrl);
    expect(product.costPrice).toBeUndefined();
  });

  it("returns category banner metadata from the public category API", async () => {
    const response = await request(app).get(`/api/categories/food-items-test-${stamp}`).expect(200);
    expect(response.body.data.category.bannerImageUrl).toBe("/assets/categories/category-placeholder.webp");
    expect(response.body.data.category.productCount).toBe(1);
    expect(response.body.data.category.activeProductCount).toBe(1);
    expect(response.body.data.category.homepageVisible).toBe(true);
  });

  it("keeps category banner manifest slug based and non-duplicated", () => {
    const mappings = JSON.parse(fs.readFileSync(new URL("../data/category-banner-mapping.json", import.meta.url), "utf8"));
    const mapped = mappings.filter((item: any) => item.status === "MAP");
    expect(mapped.length).toBeLessThan(16);
    expect(new Set(mapped.map((item: any) => item.categorySlug)).size).toBe(mapped.length);
    expect(new Set(mapped.map((item: any) => item.sourcePath)).size).toBe(mapped.length);
    expect(mapped.every((item: any) => item.categoryId && item.categorySlug && item.targetFilename === `${item.categorySlug}.webp`)).toBe(true);
  });

  it("uses grouped category slugs on the normal product endpoint", async () => {
    const response = await request(app).get("/api/products").query({ category: "packaged-food", search: `Homepage Catalogue Product ${stamp}`, limit: 20 }).expect(200);
    expect(response.body.data.products.some((product: any) => product.id === ids.productId)).toBe(true);
  });
});
