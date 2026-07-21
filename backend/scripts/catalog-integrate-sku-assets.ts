import "../lib/load-env.js";
import { existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { ImageStatus, ProductStatus } from "@prisma/client";
import { db } from "../lib/db.js";
import { isProductImageUrl, resolveProductImage } from "../lib/product-image-resolver.js";

const assetRoot = resolve(process.cwd(), "../frontend/public/assets/products/client-catalog");
const reportPath = resolve(process.cwd(), "reports/product-image-sku-asset-integration.json");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const stat = statSync(path);
    return stat.isDirectory() ? walk(path) : [path];
  });
}

function skuFromPath(path: string) {
  const filename = path.split(/[\\/]/).pop() || "";
  const stem = filename.replace(/\.(webp|png|jpe?g|avif)$/i, "").replace(/-primary$/i, "");
  const match = stem.match(/^([a-z]{3})[-_](\d{6})$/i);
  return match ? `${match[1].toUpperCase()}-${match[2]}` : "";
}

async function main() {
  const apply = process.argv.includes("--apply");
  const files = walk(assetRoot).filter((path) => /\.(webp|png|jpe?g|avif)$/i.test(path));
  const bySku = new Map<string, string>();
  for (const file of files) {
    const sku = skuFromPath(file);
    if (!sku || bySku.has(sku)) continue;
    bySku.set(sku, `/assets/products/client-catalog/${relative(assetRoot, file).replace(/\\/g, "/")}`);
  }

  const products = await db.product.findMany({
    where: { deletedAt: null, status: ProductStatus.ACTIVE },
    include: { category: true, brand: true, images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] }, variants: true },
  });

  const rows = [];
  let applied = 0;
  for (const product of products) {
    const assetUrl = bySku.get(product.sku);
    const current = resolveProductImage(product);
    if (!assetUrl) {
      if (current.isPlaceholder) rows.push({ sku: product.sku, productId: product.id, productName: product.name, status: "MISSING_ASSET" });
      continue;
    }
    if (!isProductImageUrl(assetUrl)) {
      rows.push({ sku: product.sku, productId: product.id, productName: product.name, assetUrl, status: "REJECTED_ASSET" });
      continue;
    }
    if (!current.isPlaceholder && current.url === assetUrl) {
      rows.push({ sku: product.sku, productId: product.id, productName: product.name, assetUrl, status: "UNCHANGED" });
      continue;
    }
    if (!current.isPlaceholder && current.url !== assetUrl) {
      rows.push({ sku: product.sku, productId: product.id, productName: product.name, assetUrl, currentUrl: current.url, status: "PRESERVE_EXISTING" });
      continue;
    }
    rows.push({ sku: product.sku, productId: product.id, productName: product.name, assetUrl, status: apply ? "APPLIED" : "DRY_RUN_APPLY" });
    if (apply) {
      await db.$transaction(async (tx) => {
        await tx.productImage.updateMany({ where: { productId: product.id }, data: { isPrimary: false } });
        const existing = await tx.productImage.findFirst({ where: { productId: product.id, url: assetUrl } });
        if (existing) {
          await tx.productImage.update({ where: { id: existing.id }, data: { alt: product.name, isPrimary: true, sortOrder: 0 } });
        } else {
          await tx.productImage.create({ data: { productId: product.id, url: assetUrl, alt: product.name, isPrimary: true, sortOrder: 0 } });
        }
        await tx.product.update({ where: { id: product.id }, data: { imageStatus: ImageStatus.VERIFIED, imageSource: "IMPORTED", imageCheckedAt: new Date() } });
      });
      applied += 1;
    }
  }

  const summary = {
    mode: apply ? "apply" : "dry-run",
    skuAssetsFound: bySku.size,
    productsScanned: products.length,
    applied,
    unchanged: rows.filter((row) => row.status === "UNCHANGED").length,
    preservedExisting: rows.filter((row) => row.status === "PRESERVE_EXISTING").length,
    missingAsset: rows.filter((row) => row.status === "MISSING_ASSET").length,
    rows,
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
