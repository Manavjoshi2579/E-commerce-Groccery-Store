import "../lib/load-env.js";
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, resolve, join } from "node:path";
import { ProductStatus } from "@prisma/client";
import { db } from "../lib/db.js";
import { resolveProductImage } from "../lib/product-image-resolver.js";

const root = resolve(process.cwd(), "..");
const zipPaths = [
  resolve(root, "stitch_indian_e_commerce_product_photographer.zip"),
  "C:/Users/manav/Downloads/stitch_ai_product_image_generator.zip",
  "C:/Users/manav/Downloads/stitch_eagle_mart_product_catalogue_images.zip",
  "C:/Users/manav/Downloads/stitch_eagle_mart_catalogue_completion.zip",
  "C:/Users/manav/Downloads/stitch_ai_image_generator.zip",
].filter(existsSync);

const stopWords = new Set(
  "premium indian grocery catalogue photography product products pack packet pouch bottle jar box pure white background centered supermarket e commerce of a an the and or in on another variant second with for small large retail".split(
    " ",
  ),
);

const synonyms = new Map<string, string[]>([
  ["lassi", ["lassi", "lasii"]],
  ["lasii", ["lassi", "lasii"]],
  ["jhado", ["jhado", "jhadu", "broom"]],
  ["phenyl", ["phenyl", "floor", "cleaner"]],
  ["mirch", ["mirch", "chilli", "chili", "pepper"]],
  ["chilli", ["mirch", "chilli", "chili", "pepper"]],
  ["jeera", ["jeera", "cumin"]],
  ["ararot", ["ararot", "arrowroot"]],
  ["emali", ["emali", "imli", "tamarind"]],
  ["imli", ["emali", "imli", "tamarind"]],
  ["daal", ["daal", "dal"]],
  ["dal", ["daal", "dal"]],
  ["maggi", ["maggi", "noodles", "noodle"]],
  ["noodles", ["maggi", "noodles", "noodle"]],
  ["biscuit", ["biscuit", "biscuits", "cookie", "cookies"]],
  ["cookies", ["biscuit", "biscuits", "cookie", "cookies"]],
  ["namkeen", ["namkeen", "bhujia", "sev", "mixture"]],
  ["500gm", ["500gm", "500g", "500"]],
  ["250gm", ["250gm", "250g", "250"]],
  ["100gm", ["100gm", "100g", "100"]],
  ["1kg", ["1kg", "1"]],
  ["10rs", ["10rs", "10"]],
]);

function tokens(value: string) {
  const out = new Set<string>();
  for (const token of value.toLowerCase().replace(/&/g, " and ").replace(/\+/g, " plus ").replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean)) {
    if (stopWords.has(token)) continue;
    out.add(token);
    for (const synonym of synonyms.get(token) || []) out.add(synonym);
  }
  return out;
}

function matchScore(product: { name: string; brand: { name: string } }, description: string) {
  const assetTokens = tokens(description);
  const productTokens = [...tokens(`${product.name} ${product.brand.name === "Unbranded" ? "" : product.brand.name}`)].filter((token) => token !== "unbranded");
  if (!productTokens.length) return 0;
  let hits = 0;
  for (const token of productTokens) {
    if (assetTokens.has(token)) hits += /^\d/.test(token) ? 1.5 : 1;
  }
  return hits / productTokens.length;
}

function hash(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function assetHash(url: string) {
  if (!url.startsWith("/assets/products/client-catalog/")) return "";
  const path = resolve(root, "frontend/public", url.slice(1));
  return existsSync(path) ? hash(readFileSync(path)) : "";
}

const provenance = new Map<string, string>();
for (const zipPath of zipPaths) {
  const zip = new AdmZip(zipPath);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !/\.(png|jpe?g|webp|avif)$/i.test(entry.entryName)) continue;
    provenance.set(hash(entry.getData()), basename(dirname(entry.entryName)));
  }
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

for (const folder of [resolve(root, "stitch_e_commerce_product_image_generator"), resolve(root, ".codex_tmp/stitch_e_commerce_product_image_generator")]) {
  for (const file of walk(folder).filter((path) => /\.(png|jpe?g|webp|avif)$/i.test(path))) {
    provenance.set(hash(readFileSync(file)), basename(dirname(file)));
  }
}

const products = await db.product.findMany({
  where: { deletedAt: null, status: ProductStatus.ACTIVE },
  include: { brand: true, images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] } },
  orderBy: [{ sku: "asc" }],
});

const rows = products.map((product) => {
  const resolved = resolveProductImage(product);
  const description = provenance.get(assetHash(resolved.url)) || "";
  return {
    sku: product.sku,
    name: product.name,
    imageUrl: resolved.url,
    provenance: description || "unknown-local-asset",
    score: Number(matchScore(product, description).toFixed(3)),
  };
});

const suspicious = rows.filter((row) => row.provenance !== "unknown-local-asset" && row.score < 0.2);
console.log(
  JSON.stringify(
    {
      productsScanned: rows.length,
      suspiciousCount: suspicious.length,
      lassi: rows.filter((row) => /\blassi\b/i.test(row.name)),
      suspicious,
    },
    null,
    2,
  ),
);

await db.$disconnect();
