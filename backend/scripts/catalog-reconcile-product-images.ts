import "../lib/load-env.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import { ImageStatus, ProductStatus } from "@prisma/client";
import { db } from "../lib/db.js";
import {
  matchImageRecord,
  markCrossZipDuplicates,
  normalizeIdentity,
  scanImageZip,
  type ImageRecord,
  type ImportProduct,
} from "../lib/existing-image-import.js";
import { isProductImageUrl, productImageFallback, resolveProductImage } from "../lib/product-image-resolver.js";

type MatchStatus = "MAP" | "PRESERVE_EXISTING" | "REVIEW_REQUIRED" | "UNMATCHED" | "REJECTED" | "PLACEHOLDER";
type Confidence = "EXACT" | "HIGH_CONFIDENCE" | "REVIEW_REQUIRED" | "REJECTED" | "UNMATCHED";

const defaultArchives = [
  "C:/Users/manav/Downloads/stitch_ai_product_image_generator.zip",
  "C:/Users/manav/Downloads/stitch_ai_image_generator.zip",
  "C:/Users/manav/Downloads/stitch_eagle_mart_product_catalogue_images.zip",
];

function values(flag: string) {
  return process.argv.flatMap((arg, index, args) => {
    if (arg === flag && args[index + 1]) return [args[index + 1]];
    if (arg.startsWith(`${flag}=`)) return [arg.slice(flag.length + 1)];
    return [];
  });
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function csvCell(value: unknown) {
  const text = Array.isArray(value) ? value.join("; ") : value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(path: string, rows: Record<string, unknown>[]) {
  mkdirSync(dirname(path), { recursive: true });
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
  writeFileSync(path, [headers.join(","), ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(","))].join("\n"));
}

function sanitizeSku(sku: string) {
  return sku.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function targetPublicPath(product: ImportProduct) {
  return `/assets/products/client-catalog/${sanitizeSku(product.sku)}-primary.webp`;
}

function hasManualImage(product: ImportProduct) {
  const resolved = resolveProductImage(product);
  if (resolved.isPlaceholder) return false;
  if (product.imageSource === "IMPORTED" || resolved.url.includes("/client-catalog/")) return false;
  return true;
}

function quantityCompatible(record: ImageRecord, product: ImportProduct) {
  const productIdentity = normalizeIdentity(`${product.name} ${product.variants[0]?.unit || ""}`);
  const productQuantity = productIdentity.match(/\b\d+\s*(?:g|kg|ml|l|pack|pc)\b/)?.[0] || "";
  return !productQuantity || !record.extractedQuantity || productQuantity === record.extractedQuantity;
}

const incompatibleTermGroups = [
  ["turmeric", "amchoor", "coriander", "chilli", "garam", "hing"],
  ["shampoo", "conditioner", "soap", "lotion", "cream", "gel", "oil"],
  ["powder", "liquid", "bar"],
  ["refill", "bottle", "jar", "pouch", "tube"],
];

function hasIdentityConflict(record: ImageRecord, product: ImportProduct) {
  const recordText = normalizeIdentity(`${record.normalizedName} ${record.sourceArchivePath}`);
  const productText = normalizeIdentity(`${product.name} ${product.variants[0]?.unit || ""}`);
  return incompatibleTermGroups.some((group) => {
    const productTerms = group.filter((term) => productText.includes(term));
    const recordTerms = group.filter((term) => recordText.includes(term));
    return productTerms.length > 0 && recordTerms.length > 0 && !productTerms.some((term) => recordTerms.includes(term));
  });
}

function confidenceFor(record: ImageRecord, product: ImportProduct | null, match: ReturnType<typeof matchImageRecord>): Confidence {
  if (!product) return "UNMATCHED";
  if (!quantityCompatible(record, product)) return "REJECTED";
  if (hasIdentityConflict(record, product)) return "REJECTED";
  if (match.method === "PRODUCT_ID" || match.method === "SKU" || match.method === "PRODUCT_CODE") return "EXACT";
  if (match.confidence === "HIGH" && match.score >= 90 && match.margin >= 20) return "HIGH_CONFIDENCE";
  return "REVIEW_REQUIRED";
}

function statusFor(confidence: Confidence, product: ImportProduct | null, productAlreadyUsed: boolean, manualPreserved: boolean): MatchStatus {
  if (!product) return "UNMATCHED";
  if (manualPreserved) return "PRESERVE_EXISTING";
  if (productAlreadyUsed) return "REJECTED";
  if (confidence === "EXACT" || confidence === "HIGH_CONFIDENCE") return "MAP";
  if (confidence === "UNMATCHED") return "UNMATCHED";
  if (confidence === "REJECTED") return "REJECTED";
  return "REVIEW_REQUIRED";
}

async function scanArchives(paths: string[]) {
  const zipFiles = [];
  const records: ImageRecord[] = [];
  const invalidRows = [];
  for (const path of paths) {
    if (!existsSync(path)) throw new Error(`Archive not found: ${path}`);
    const scan = await scanImageZip(path);
    records.push(...scan.records);
    invalidRows.push(...scan.invalid);
    zipFiles.push({ path, scanned: scan.scanned, validImages: scan.records.length, invalidImages: scan.invalid.length });
  }
  markCrossZipDuplicates(records);
  return { zipFiles, records, invalidRows };
}

async function productsForImport() {
  return db.product.findMany({
    where: { deletedAt: null },
    include: { brand: true, category: true, images: true, variants: true },
  }) as Promise<ImportProduct[]>;
}

async function repairDuplicatePrimaries(apply: boolean) {
  const groups = await db.productImage.groupBy({ by: ["productId"], where: { isPrimary: true }, _count: { _all: true } });
  const duplicateGroups = groups.filter((group) => group._count._all > 1);
  let repaired = 0;
  if (!apply) return { issues: duplicateGroups.length, repaired };
  for (const group of duplicateGroups) {
    const images = await db.productImage.findMany({ where: { productId: group.productId, isPrimary: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    const [keep, ...extra] = images;
    if (!keep) continue;
    await db.productImage.updateMany({ where: { id: { in: extra.map((item) => item.id) } }, data: { isPrimary: false } });
    repaired += extra.length;
  }
  return { issues: duplicateGroups.length, repaired };
}

async function main() {
  const rootDir = resolve(process.cwd(), "..");
  const apply = hasFlag("--apply");
  const archives = (values("--archive").length ? values("--archive") : defaultArchives).map((path) => resolve(path));
  const manifestPath = resolve(rootDir, values("--manifest")[0] || "backend/data/product-image-master-mapping.json");
  const reviewPath = resolve(rootDir, "backend/data/product-image-review-overrides.json");
  const reconciliationJsonPath = resolve(rootDir, "backend/reports/product-image-reconciliation.json");
  const reconciliationCsvPath = resolve(rootDir, "backend/reports/product-image-reconciliation.csv");
  const reviewCsvPath = resolve(rootDir, "backend/reports/product-image-review.csv");
  const missingCsvPath = resolve(rootDir, "backend/reports/products-still-missing-images.csv");

  const [{ zipFiles, records, invalidRows }, products, duplicatePrimaryRepair] = await Promise.all([
    scanArchives(archives),
    productsForImport(),
    repairDuplicatePrimaries(apply),
  ]);

  const activeProducts = products.filter((product) => product.status === ProductStatus.ACTIVE && !product.deletedAt);
  const usedProducts = new Set<string>();
  const usedChecksums = new Set<string>();
  let manualImagesPreserved = 0;
  let exactApplied = 0;
  let highApplied = 0;
  let filesWritten = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  const rows = [];
  for (const invalid of invalidRows) {
    rows.push({
      productId: "",
      sku: "",
      productCode: "",
      productName: "",
      category: "",
      sourceArchive: invalid.sourceZip,
      sourcePath: invalid.sourceArchivePath,
      sourceChecksum: "",
      targetFilename: "",
      mappingMethod: "INVALID_IMAGE",
      confidence: "REJECTED" satisfies Confidence,
      status: "REJECTED" satisfies MatchStatus,
      notes: invalid.rejectionReasons.join("; "),
    });
  }

  for (const record of records) {
    const match = matchImageRecord(record, activeProducts);
    const product = match.product;
    const confidence = confidenceFor(record, product, match);
    const alreadyUsed = Boolean(product && usedProducts.has(product.id)) || usedChecksums.has(record.checksum);
    const manualPreserved = Boolean(product && hasManualImage(product));
    const status = statusFor(confidence, product, alreadyUsed, manualPreserved);
    const target = product ? targetPublicPath(product) : "";

    if (manualPreserved) manualImagesPreserved += 1;
    if (status === "MAP" && product) {
      usedProducts.add(product.id);
      usedChecksums.add(record.checksum);
      if (apply) {
        const diskPath = join(rootDir, "frontend/public", target.replace(/^\//, ""));
        mkdirSync(dirname(diskPath), { recursive: true });
        if (!existsSync(diskPath)) {
          await sharp(record.buffer).resize({ width: 900, height: 900, fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).webp({ quality: 88 }).toFile(diskPath);
          filesWritten += 1;
        }
        const existing = await db.productImage.findFirst({ where: { productId: product.id, url: target } });
        const importedPrimary = product.images.find((image) => image.isPrimary && image.url.includes("/client-catalog/"));
        await db.$transaction(async (tx) => {
          await tx.productImage.updateMany({ where: { productId: product.id }, data: { isPrimary: false } });
          if (existing) {
            await tx.productImage.update({ where: { id: existing.id }, data: { alt: product.name, isPrimary: true, sortOrder: 0 } });
            recordsUpdated += 1;
          } else if (importedPrimary) {
            await tx.productImage.update({ where: { id: importedPrimary.id }, data: { url: target, alt: product.name, isPrimary: true, sortOrder: 0 } });
            recordsUpdated += 1;
          } else {
            await tx.productImage.create({ data: { productId: product.id, url: target, alt: product.name, isPrimary: true, sortOrder: 0 } });
            recordsCreated += 1;
          }
          await tx.product.update({ where: { id: product.id }, data: { imageStatus: ImageStatus.VERIFIED, imageSource: "IMPORTED", imageCheckedAt: new Date() } });
        });
      }
      if (confidence === "EXACT") exactApplied += 1;
      if (confidence === "HIGH_CONFIDENCE") highApplied += 1;
    }

    rows.push({
      productId: product?.id || "",
      sku: product?.sku || "",
      productCode: product?.clientProductCode || "",
      productName: product?.name || "",
      category: product?.category.name || "",
      sourceArchive: record.sourceZip.split(/[\\/]/).pop(),
      sourcePath: record.sourceArchivePath,
      sourceChecksum: record.checksum,
      targetFilename: target ? target.split("/").pop() : "",
      mappingMethod: match.method,
      confidence,
      status,
      notes: [...match.reasons, ...match.rejectionReasons, alreadyUsed ? "duplicate product or image assignment" : "", manualPreserved ? "existing manual image preserved" : ""].filter(Boolean).join("; "),
    });
  }

  const freshProducts = await productsForImport();
  const missingRows = freshProducts
    .filter((product) => product.status === ProductStatus.ACTIVE && !product.deletedAt)
    .filter((product) => {
      const resolved = resolveProductImage(product);
      return resolved.isPlaceholder || !isProductImageUrl(resolved.url);
    })
    .map((product) => ({
      productId: product.id,
      sku: product.sku,
      productCode: product.clientProductCode || "",
      productName: product.name,
      category: product.category.name,
      brand: product.brand.name,
      quantity: product.variants[0]?.unit || "",
      currentImageState: resolveProductImage(product).status,
      reasonNotMapped: "No exact or high-confidence unique image mapping was approved.",
      recommendedFilename: `${product.sku}.webp`,
      suggestedFutureAction: "Capture or approve a product-specific image for this SKU.",
    }));

  const verifiedProducts = freshProducts.filter((product) => !resolveProductImage(product).isPlaceholder).length;
  const placeholderProducts = freshProducts.length - verifiedProducts;
  const uniqueHashes = new Set(records.map((record) => record.checksum)).size;
  const mappedRows = rows.filter((row) => row.status === "MAP");
  const duplicateImageAssignments = mappedRows.length - new Set(mappedRows.map((row) => row.sourceChecksum)).size;
  const duplicateProductAssignments = rows.filter((row) => row.status === "REJECTED" && row.notes.includes("duplicate")).length;
  const report = {
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    totals: {
      totalProducts: freshProducts.length,
      activeProducts: freshProducts.filter((product) => product.status === ProductStatus.ACTIVE && !product.deletedAt).length,
      productsWithProductImageRows: freshProducts.filter((product) => product.images.length > 0).length,
      productsWithReachablePrimaryImage: verifiedProducts,
      productsWithPlaceholderImages: placeholderProducts,
      productsWithoutImages: missingRows.length,
      manuallyUploadedImages: freshProducts.filter(hasManualImage).length,
      urlImportedImages: freshProducts.filter((product) => product.imageSource && product.imageSource !== "IMPORTED").length,
      historicalImportedImages: freshProducts.filter((product) => product.imageSource === "IMPORTED").length,
      imagesScanned: records.length,
      uniqueImages: uniqueHashes,
      exactMappings: exactApplied,
      highConfidenceMappings: highApplied,
      reviewRequiredMappings: rows.filter((row) => row.status === "REVIEW_REQUIRED").length,
      rejectedMappings: rows.filter((row) => row.status === "REJECTED").length,
      unmatchedUploadedImages: rows.filter((row) => row.status === "UNMATCHED").length,
      duplicateProductAssignments,
      duplicateImageAssignments,
      duplicatePrimaryIssuesRepaired: duplicatePrimaryRepair.repaired,
      orphanProductImageRowsRepaired: 0,
      filesWritten,
      productImageRecordsCreated: recordsCreated,
      productImageRecordsUpdated: recordsUpdated,
      existingManualImagesPreserved: manualImagesPreserved,
    },
    archives: zipFiles,
    paths: {
      sharedImageResolver: "backend/lib/product-image-resolver.ts",
      masterMappingManifest: "backend/data/product-image-master-mapping.json",
      reviewOverride: "backend/data/product-image-review-overrides.json",
      missingImageReport: "backend/reports/products-still-missing-images.csv",
      imageStorage: "frontend/public/assets/products/client-catalog",
    },
  };

  mkdirSync(dirname(manifestPath), { recursive: true });
  mkdirSync(dirname(reviewPath), { recursive: true });
  mkdirSync(dirname(reconciliationJsonPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(rows, null, 2));
  writeFileSync(reviewPath, JSON.stringify(rows.filter((row) => row.status === "REVIEW_REQUIRED").map((row) => ({ sku: row.sku, decision: "PENDING", targetFilename: row.targetFilename, notes: row.notes })), null, 2));
  writeFileSync(reconciliationJsonPath, JSON.stringify(report, null, 2));
  writeCsv(reconciliationCsvPath, rows);
  writeCsv(reviewCsvPath, rows.filter((row) => row.status === "REVIEW_REQUIRED"));
  writeCsv(missingCsvPath, missingRows);
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
