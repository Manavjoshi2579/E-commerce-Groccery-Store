import "../lib/load-env.js";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, basename } from "node:path";
import { ImageStatus, ProductStatus } from "@prisma/client";
import { db } from "../lib/db.js";
import { resolveProductImage } from "../lib/product-image-resolver.js";

const sourceArg = process.argv.find((arg) => arg.startsWith("--source="))?.slice("--source=".length);
const apply = process.argv.includes("--apply");
const noReport = process.argv.includes("--no-report");

if (!sourceArg) {
  console.error("Usage: npm run catalog:integrate-named-assets -- --source=<extracted-folder> [--apply]");
  process.exit(1);
}

const sourceRoot = resolve(sourceArg);
const assetRoot = resolve(process.cwd(), "../frontend/public/assets/products/client-catalog");
const reportPath = resolve(process.cwd(), "reports/named-zip-image-integration.json");

const stopWords = new Set(
  "premium e commerce ecommerce packshot retail packet pack pouch box bottle jar plastic centered front facing pure white background slight three quarter product generic simple known for its selected with in and or of the a an small large brand can tube wrapper container assorted neutral packaging".split(
    " ",
  ),
);

const synonyms = new Map([
  ["chili", "mirch"],
  ["chilli", "mirch"],
  ["coriander", "dhania"],
  ["nigella", "kalonji"],
  ["noodles", "noodle"],
  ["odomos", "odomas"],
  ["peeler", "peelar"],
  ["sesame", "til"],
  ["stapler", "stepler"],
  ["sunfeast", "yippee"],
  ["tamarind", "imli"],
  ["toothbrushes", "toothbrush"],
  ["vanilla", "vanila"],
  ["vermilion", "roli"],
  ["yogurt", "dahi"],
]);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const stat = statSync(path);
    return stat.isDirectory() ? walk(path) : [path];
  });
}

function tokens(value: string) {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/\+/g, " plus ")
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => synonyms.get(token) || token)
        .filter((token) => !stopWords.has(token)),
    ),
  ];
}

type MatchProduct = {
  name: string;
  sku: string;
  brand: { name: string };
};

function matchScore(assetDescription: string, product: MatchProduct) {
  const assetTokens = tokens(assetDescription);
  const productTokens = tokens(product.name);
  const brandTokens = tokens(product.brand.name).filter((token) => token !== "unbranded");
  const assetTokenSet = new Set(assetTokens);
  const productHits = productTokens.filter((token) => assetTokenSet.has(token));
  const brandHits = brandTokens.filter((token) => assetTokenSet.has(token));
  const productRecall = productTokens.length ? productHits.length / productTokens.length : 0;
  const assetPrecision = assetTokens.length ? productHits.length / assetTokens.length : 0;
  const numericTokens = productTokens.filter((token) => /^\d/.test(token));

  let score = 0.65 * productRecall + 0.25 * assetPrecision;
  if (brandTokens.length && brandHits.length) score += 0.25;
  if (productTokens.length <= 2 && productHits.length === productTokens.length && (brandHits.length || productTokens.length === 2)) {
    score += 0.2;
  }
  if (numericTokens.length && numericTokens.every((token) => assetTokenSet.has(token))) score += 0.15;
  if (numericTokens.length && !numericTokens.every((token) => assetTokenSet.has(token))) score -= 0.25;
  return score;
}

function isAutoMatch(score: number, secondScore: number) {
  return score >= 0.62 && score - secondScore >= 0.08;
}

async function main() {
  const files = walk(sourceRoot).filter((path) => /\.(png|jpe?g|webp)$/i.test(path));
  const products = await db.product.findMany({
    where: { deletedAt: null, status: ProductStatus.ACTIVE },
    include: { brand: true, category: true, images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] }, variants: true },
    orderBy: [{ name: "asc" }, { sku: "asc" }],
  });
  const pendingProducts = products.filter((product) => resolveProductImage(product).isPlaceholder);
  const usedProducts = new Set<string>();
  const rows = [];

  mkdirSync(assetRoot, { recursive: true });

  for (const file of files) {
    const assetDescription = basename(dirname(file));
    const ranked = pendingProducts
      .filter((product) => !usedProducts.has(product.id))
      .map((product) => ({ product, score: matchScore(assetDescription, product) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const second = ranked[1];
    const status = best && isAutoMatch(best.score, second?.score || 0) ? (apply ? "APPLIED" : "DRY_RUN_APPLY") : "NEEDS_REVIEW";
    const targetFilename = best ? `${best.product.sku.toLowerCase()}-primary${extname(file).toLowerCase()}` : "";
    const targetPath = targetFilename ? join(assetRoot, targetFilename) : "";
    const assetUrl = targetFilename ? `/assets/products/client-catalog/${targetFilename}` : "";

    rows.push({
      status,
      assetDescription,
      source: relative(process.cwd(), file).replace(/\\/g, "/"),
      sku: best?.product.sku,
      productName: best?.product.name,
      category: best?.product.category.name,
      brand: best?.product.brand.name,
      score: Number((best?.score || 0).toFixed(3)),
      secondSku: second?.product.sku,
      secondProductName: second?.product.name,
      secondScore: Number((second?.score || 0).toFixed(3)),
      assetUrl,
    });

    if (status !== "APPLIED" || !best) continue;
    copyFileSync(file, targetPath);
    usedProducts.add(best.product.id);
    await db.$transaction(async (tx) => {
      await tx.productImage.updateMany({ where: { productId: best.product.id }, data: { isPrimary: false } });
      const existingImage = await tx.productImage.findFirst({ where: { productId: best.product.id, url: assetUrl } });
      if (existingImage) {
        await tx.productImage.update({ where: { id: existingImage.id }, data: { alt: best.product.name, isPrimary: true, sortOrder: 0 } });
      } else {
        await tx.productImage.create({ data: { productId: best.product.id, url: assetUrl, alt: best.product.name, isPrimary: true, sortOrder: 0 } });
      }
      await tx.product.update({
        where: { id: best.product.id },
        data: { imageStatus: ImageStatus.VERIFIED, imageSource: "IMPORTED", imageCheckedAt: new Date() },
      });
    });
  }

  const summary = {
    mode: apply ? "apply" : "dry-run",
    sourceRoot,
    filesScanned: files.length,
    pendingProductsScanned: pendingProducts.length,
    applied: rows.filter((row) => row.status === "APPLIED").length,
    dryRunApply: rows.filter((row) => row.status === "DRY_RUN_APPLY").length,
    needsReview: rows.filter((row) => row.status === "NEEDS_REVIEW").length,
    rows,
  };

  if (!noReport) {
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  }
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
