import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import sharp from "sharp";
import { ImageStatus, ProductStatus, type PrismaClient } from "@prisma/client";

export type ImportProduct = {
  id: string;
  sku: string;
  name: string;
  clientProductCode: string | null;
  importIdentity: string | null;
  imageStatus: ImageStatus;
  imageSource: string | null;
  status: ProductStatus;
  deletedAt: Date | null;
  brand: { name: string };
  category: { name: string; slug: string };
  images: { id: string; url: string; isPrimary: boolean }[];
  variants: { unit: string; status: ProductStatus }[];
};

export type ImageRecord = {
  sourceZip: string;
  sourceArchivePath: string;
  sourceFolderName: string;
  sourceFilename: string;
  checksum: string;
  width: number;
  height: number;
  mimeType: string;
  normalizedName: string;
  extractedBrand: string;
  extractedQuantity: string;
  extractedVariant: string;
  tokens: string[];
  duplicateInZip: boolean;
  duplicateAcrossZips: boolean;
  buffer: Buffer;
};

export type ManifestRow = {
  sourceZip: string;
  sourceArchivePath: string;
  checksum: string;
  normalizedName: string;
  matchedProductId: string | null;
  matchedProductCode: string | null;
  matchedProductName: string | null;
  matchMethod: string;
  confidence: string;
  score: number;
  secondBestScore: number;
  scoreMargin: number;
  extractedBrand: string;
  extractedQuantity: string;
  extractedVariant: string;
  targetAssetPath: string | null;
  result: string;
  reasons: string[];
  rejectionReasons: string[];
};

export type ImportSummary = {
  zipFiles: { path: string; scanned: number; validImages: number; invalidImages: number }[];
  totalValidImages: number;
  invalidImages: number;
  exactMappingMatches: number;
  highConfidenceMatches: number;
  mediumConfidenceReviewItems: number;
  ambiguousImages: number;
  unmatchedImages: number;
  manualImagesPreserved: number;
  existingImportedImagesPreserved: number;
  existingImportedImagesReplaced: number;
  newProductImageRecords: number;
  updatedProductImageRecords: number;
  duplicateProductImageRecordsPrevented: number;
  assetsCopiedConverted: number;
  productsMovedFromPlaceholderToRealImage: number;
  productsStillUsingPlaceholders: number;
  duplicateChecksumsWithinZip: number;
  duplicateChecksumsAcrossZips: number;
  manifestPath: string;
  rows: ManifestRow[];
};

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const genericTerms = new Set(["grocery", "cloth", "biscuit", "cold", "drink", "shampoo", "soap", "harpic", "detergent", "atta", "rice", "dal", "happy", "birthday", "product", "pack", "premium", "supermarket", "catalogue", "photography", "screen", "image"]);
const aliases: Record<string, string> = {
  "h s": "head shoulders",
  "h&s": "head shoulders",
  "b netural": "b natural",
  aashirbaad: "aashirvaad",
  protien: "protein",
  facewash: "face wash",
  "f w": "face wash",
  bodylotion: "body lotion",
  "godrej no 1": "godrej no 1",
  allout: "all out",
  veseline: "vaseline",
};

export function normalizeIdentity(value: string) {
  let text = value.normalize("NFKC").toLowerCase();
  text = text.replace(/[_-]+/g, " ").replace(/&/g, " and ").replace(/[’']/g, "");
  Object.entries(aliases).forEach(([from, to]) => {
    text = text.replace(new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), to);
  });
  text = text
    .replace(/\b(\d+)\s*(gm|g|grams?)\b/g, "$1 g")
    .replace(/\b(\d+)\s*(kg|kilograms?)\b/g, "$1 kg")
    .replace(/\b(\d+)\s*(ml|milliliters?|millilitres?)\b/g, "$1 ml")
    .replace(/\b(\d+)\s*(ltr|l|liters?|litres?)\b/g, "$1 l")
    .replace(/\b(\d+)\s*\+\s*(\d+)\s*ml\b/g, "$1 + $2 ml")
    .replace(/\b(\d+)\s*[x*]\s*(\d+)\s*g\b/g, "$1 x $2 g")
    .replace(/\btwin pack\b/g, "2 pack")
    .replace(/[^a-z0-9+ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

export function tokenize(value: string) {
  return normalizeIdentity(value).split(" ").filter((token) => token.length > 1 && !genericTerms.has(token));
}

export function extractedQuantity(value: string) {
  const text = normalizeIdentity(value);
  return text.match(/\b\d+\s*(?:g|kg|ml|l|pack|pc)\b/)?.[0] || "";
}

export function safeArchivePath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return normalized && !normalized.startsWith("/") && !normalized.includes("../") && !/^[a-zA-Z]:/.test(normalized);
}

function extension(path: string) {
  const name = basename(path).toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

function mimeFromExtension(path: string) {
  const ext = extension(path);
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function candidateName(archivePath: string) {
  const folder = basename(dirname(archivePath.replace(/\\/g, "/")));
  const file = basename(archivePath);
  return folder && folder !== "." ? folder : file.replace(/\.[^.]+$/, "");
}

export async function scanImageZip(zipPath: string): Promise<{ records: ImageRecord[]; invalid: ManifestRow[]; scanned: number }> {
  const zip = new AdmZip(zipPath);
  const records: ImageRecord[] = [];
  const invalid: ManifestRow[] = [];
  let scanned = 0;
  const checksums = new Map<string, number>();
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const archivePath = entry.entryName.replace(/\\/g, "/");
    if (!safeArchivePath(archivePath) || !imageExtensions.has(extension(archivePath))) continue;
    scanned += 1;
    try {
      const buffer = entry.getData();
      const meta = await sharp(buffer).metadata();
      if (!meta.width || !meta.height || !meta.format) throw new Error("Invalid image metadata.");
      const checksum = createHash("sha256").update(buffer).digest("hex");
      checksums.set(checksum, (checksums.get(checksum) || 0) + 1);
      const name = candidateName(archivePath);
      const normalizedName = normalizeIdentity(name);
      const tokens = tokenize(name);
      records.push({
        sourceZip: zipPath,
        sourceArchivePath: archivePath,
        sourceFolderName: basename(dirname(archivePath)),
        sourceFilename: basename(archivePath),
        checksum,
        width: meta.width,
        height: meta.height,
        mimeType: mimeFromExtension(archivePath),
        normalizedName,
        extractedBrand: tokens[0] || "",
        extractedQuantity: extractedQuantity(name),
        extractedVariant: "",
        tokens,
        duplicateInZip: false,
        duplicateAcrossZips: false,
        buffer,
      });
    } catch (error) {
      invalid.push(emptyRow(zipPath, archivePath, "INVALID_IMAGE", [error instanceof Error ? error.message : "Invalid image file."]));
    }
  }
  records.forEach((record) => {
    record.duplicateInZip = (checksums.get(record.checksum) || 0) > 1;
  });
  return { records, invalid, scanned };
}

export function markCrossZipDuplicates(records: ImageRecord[]) {
  const byChecksum = new Map<string, Set<string>>();
  records.forEach((record) => {
    const set = byChecksum.get(record.checksum) || new Set<string>();
    set.add(record.sourceZip);
    byChecksum.set(record.checksum, set);
  });
  records.forEach((record) => {
    record.duplicateAcrossZips = (byChecksum.get(record.checksum)?.size || 0) > 1;
  });
}

function productUnit(product: ImportProduct) {
  return product.variants.find((variant) => variant.status === ProductStatus.ACTIVE)?.unit || product.variants[0]?.unit || "";
}

function hasManualImage(product: ImportProduct) {
  const primary = product.images.find((image) => image.isPrimary) || product.images[0];
  if (!primary?.url || primary.url.includes("/placeholders/")) return false;
  if (product.imageSource === "IMPORTED" || product.imageSource === "LOCAL") return false;
  return true;
}

function hasImportedImage(product: ImportProduct) {
  const primary = product.images.find((image) => image.isPrimary) || product.images[0];
  return Boolean(primary?.url && !primary.url.includes("/placeholders/") && (product.imageSource === "IMPORTED" || primary.url.includes("/client-catalog/")));
}

function scoreRecord(record: ImageRecord, product: ImportProduct) {
  const productText = normalizeIdentity(`${product.brand.name} ${product.name} ${productUnit(product)} ${product.category.name}`);
  const productTokens = new Set(tokenize(productText));
  const reasons: string[] = [];
  const rejectionReasons: string[] = [];
  let score = 0;
  const productQuantity = extractedQuantity(`${product.name} ${productUnit(product)}`);
  const overlap = record.tokens.filter((token) => productTokens.has(token));
  if (record.normalizedName === normalizeIdentity(product.name)) {
    score += 60;
    reasons.push("exact normalized product name");
  }
  const brand = normalizeIdentity(product.brand.name);
  if (brand && record.normalizedName.includes(brand)) {
    score += 25;
    reasons.push("brand match");
  }
  const nameTokens = tokenize(product.name);
  const nameOverlap = nameTokens.filter((token) => record.tokens.includes(token));
  if (nameTokens.length >= 2 && nameOverlap.length / nameTokens.length >= 0.7) {
    score += 35;
    reasons.push("strong product name coverage");
  }
  if (productQuantity && record.extractedQuantity === productQuantity) {
    score += 30;
    reasons.push("quantity match");
  } else if (productQuantity && record.extractedQuantity && record.extractedQuantity !== productQuantity) {
    score -= 35;
    rejectionReasons.push("quantity conflict");
  }
  if (overlap.length >= 3) {
    score += 15;
    reasons.push("strong token overlap");
  } else if (overlap.length > 0) {
    score += overlap.length * 3;
    reasons.push("token overlap");
  }
  if (record.tokens.some((token) => tokenize(product.category.name).includes(token))) {
    score += 10;
    reasons.push("category compatible");
  }
  const genericOnly = record.tokens.length > 0 && record.tokens.every((token) => genericTerms.has(token));
  if (genericOnly || record.tokens.length < 2) rejectionReasons.push("image folder too incomplete");
  return { product, score, reasons, rejectionReasons };
}

export function matchImageRecord(record: ImageRecord, products: ImportProduct[]) {
  const active = products.filter((product) => product.status === ProductStatus.ACTIVE && !product.deletedAt);
  const productCode = record.normalizedName.match(/\bpc\d+\b/)?.[0]?.toUpperCase();
  if (productCode) {
    const byCode = active.filter((product) => product.clientProductCode?.toUpperCase() === productCode);
    if (byCode.length === 1) return { product: byCode[0], method: "PRODUCT_CODE", confidence: "HIGH", score: 100, secondBestScore: 0, margin: 100, reasons: ["product code match"], rejectionReasons: [] };
  }
  const scored = active.map((product) => scoreRecord(record, product)).sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1]?.score || 0;
  if (!best) return { product: null, method: "NO_MATCH", confidence: "NO_MATCH", score: 0, secondBestScore: 0, margin: 0, reasons: [], rejectionReasons: ["no active products"] };
  const margin = best.score - second;
  const hasConflict = best.rejectionReasons.some((reason) => reason.includes("conflict") || reason.includes("incomplete"));
  if (best.score >= 90 && margin >= 20 && !hasConflict) return { product: best.product, method: "DETERMINISTIC", confidence: "HIGH", score: best.score, secondBestScore: second, margin, reasons: best.reasons, rejectionReasons: [] };
  if (best.score >= 75 && margin >= 25 && !hasConflict) return { product: best.product, method: "DETERMINISTIC", confidence: "MEDIUM", score: best.score, secondBestScore: second, margin, reasons: best.reasons, rejectionReasons: [] };
  return { product: best.product, method: "DETERMINISTIC", confidence: "AMBIGUOUS", score: best.score, secondBestScore: second, margin, reasons: best.reasons, rejectionReasons: best.rejectionReasons.length ? best.rejectionReasons : ["confidence below threshold"] };
}

function sanitizeFilename(value: string) {
  return normalizeIdentity(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "product";
}

function targetPublicPath(product: ImportProduct) {
  return `/assets/products/client-catalog/${sanitizeFilename(product.sku)}-primary.webp`;
}

function loadExactMappingRows(rootDir: string) {
  const candidates = [
    "eagle-mart-exact-stitch-image-mapping.json",
    "backend/data/client-catalog-import-manifest.json",
  ].map((path) => resolve(rootDir, path)).filter(existsSync);
  const rows: { normalizedImageName: string; productId?: string; clientProductCode?: string; action?: string; matchStatus?: string }[] = [];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (Array.isArray(parsed)) rows.push(...parsed);
    } catch {
      // Ignore malformed optional mapping files; the deterministic pass still runs.
    }
  }
  return rows.filter((row) => {
    const action = String(row.action || row.matchStatus || "MAP").toUpperCase();
    return action !== "DO_NOT_MAP" && !action.includes("REJECT");
  });
}

function exactMappedProduct(record: ImageRecord, products: ImportProduct[], exactRows: ReturnType<typeof loadExactMappingRows>) {
  const mapped = exactRows.find((row) => {
    const name = normalizeIdentity(row.normalizedImageName || "");
    return name && (record.normalizedName === name || record.normalizedName.includes(name) || name.includes(record.normalizedName));
  });
  if (!mapped) return null;
  const product = products.find((item) => item.id === mapped.productId)
    || products.find((item) => mapped.clientProductCode && item.clientProductCode?.toUpperCase() === mapped.clientProductCode.toUpperCase());
  if (!product || product.deletedAt || product.status !== ProductStatus.ACTIVE) return null;
  const compatibility = scoreRecord(record, product);
  if (compatibility.rejectionReasons.some((reason) => reason.includes("conflict"))) return null;
  return { product, method: "EXACT_MAPPING", confidence: "HIGH", score: 100, secondBestScore: 0, margin: 100, reasons: ["exact mapping manifest"], rejectionReasons: [] };
}

function emptyRow(sourceZip: string, sourceArchivePath: string, result: string, rejectionReasons: string[]): ManifestRow {
  return {
    sourceZip,
    sourceArchivePath,
    checksum: "",
    normalizedName: "",
    matchedProductId: null,
    matchedProductCode: null,
    matchedProductName: null,
    matchMethod: "NONE",
    confidence: "NONE",
    score: 0,
    secondBestScore: 0,
    scoreMargin: 0,
    extractedBrand: "",
    extractedQuantity: "",
    extractedVariant: "",
    targetAssetPath: null,
    result,
    reasons: [],
    rejectionReasons,
  };
}

function rowFrom(record: ImageRecord, match: ReturnType<typeof matchImageRecord>, result: string, targetAssetPath: string | null, extraReasons: string[] = [], extraRejections: string[] = []): ManifestRow {
  return {
    sourceZip: record.sourceZip,
    sourceArchivePath: record.sourceArchivePath,
    checksum: record.checksum,
    normalizedName: record.normalizedName,
    matchedProductId: match.product?.id || null,
    matchedProductCode: match.product?.clientProductCode || match.product?.sku || null,
    matchedProductName: match.product?.name || null,
    matchMethod: match.method,
    confidence: match.confidence,
    score: match.score,
    secondBestScore: match.secondBestScore,
    scoreMargin: match.margin,
    extractedBrand: record.extractedBrand,
    extractedQuantity: record.extractedQuantity,
    extractedVariant: record.extractedVariant,
    targetAssetPath,
    result,
    reasons: [...match.reasons, ...extraReasons],
    rejectionReasons: [...match.rejectionReasons, ...extraRejections],
  };
}

export async function importExistingProductImages(input: {
  db: PrismaClient;
  zipPaths: string[];
  rootDir: string;
  dryRun?: boolean;
  apply?: boolean;
  preserveExistingImages?: boolean;
  replaceImportedImages?: boolean;
  onlyPlaceholders?: boolean;
  manifestPath?: string;
}) {
  const preserveExistingImages = input.preserveExistingImages ?? true;
  const manifestPath = resolve(input.rootDir, input.manifestPath || "backend/data/existing-product-image-import-manifest.json");
  const scans = [];
  const invalidRows: ManifestRow[] = [];
  for (const path of input.zipPaths) {
    if (!existsSync(path)) throw new Error(`ZIP not found: ${path}`);
    const scan = await scanImageZip(path);
    scans.push({ path, scanned: scan.scanned, validImages: scan.records.length, invalidImages: scan.invalid.length, records: scan.records });
    invalidRows.push(...scan.invalid);
  }
  const records = scans.flatMap((scan) => scan.records);
  markCrossZipDuplicates(records);
  const products = await input.db.product.findMany({
    where: { deletedAt: null },
    include: { brand: true, category: true, images: true, variants: true },
  }) as ImportProduct[];
  const exactRows = loadExactMappingRows(input.rootDir);
  const rows: ManifestRow[] = [...invalidRows];
  const usedProducts = new Set<string>();
  let newProductImageRecords = 0;
  let updatedProductImageRecords = 0;
  let duplicateProductImageRecordsPrevented = 0;
  let assetsCopiedConverted = 0;
  let productsMovedFromPlaceholderToRealImage = 0;
  let manualImagesPreserved = 0;
  let existingImportedImagesPreserved = 0;
  let existingImportedImagesReplaced = 0;
  for (const record of records) {
    const match = exactMappedProduct(record, products, exactRows) || matchImageRecord(record, products);
    if (!match.product) {
      rows.push(rowFrom(record, match, "NO_MATCH", null));
      continue;
    }
    const product = match.product;
    const target = targetPublicPath(product);
    if (match.confidence === "AMBIGUOUS") {
      rows.push(rowFrom(record, match, "AMBIGUOUS", target));
      continue;
    }
    if (match.confidence === "MEDIUM") {
      rows.push(rowFrom(record, match, "MEDIUM_CONFIDENCE_REVIEW", target));
      continue;
    }
    if (usedProducts.has(product.id)) {
      rows.push(rowFrom(record, match, "DUPLICATE_ASSET", target, [], ["product already matched by a higher-priority image"]));
      continue;
    }
    if (preserveExistingImages && hasManualImage(product)) {
      manualImagesPreserved += 1;
      rows.push(rowFrom(record, match, "SKIPPED_MANUAL_IMAGE", target, ["current non-placeholder image preserved"]));
      continue;
    }
    if (input.onlyPlaceholders && hasImportedImage(product)) {
      existingImportedImagesPreserved += 1;
      rows.push(rowFrom(record, match, "DUPLICATE_ASSET", target, [], ["existing imported image preserved"]));
      continue;
    }
    if (hasImportedImage(product) && !input.replaceImportedImages) {
      existingImportedImagesPreserved += 1;
      rows.push(rowFrom(record, match, "DUPLICATE_ASSET", target, [], ["existing imported image preserved"]));
      continue;
    }
    if (hasImportedImage(product) && input.replaceImportedImages) existingImportedImagesReplaced += 1;
    usedProducts.add(product.id);
    rows.push(rowFrom(record, match, input.apply ? "IMPORTED" : match.method === "EXACT_MAPPING" ? "EXACT_MAPPING" : "HIGH_CONFIDENCE_MATCH", target));
    if (input.apply) {
      const assetDiskPath = join(input.rootDir, "frontend/public", target.replace(/^\//, ""));
      mkdirSync(dirname(assetDiskPath), { recursive: true });
      const existingSame = existsSync(assetDiskPath) ? createHash("sha256").update(readFileSync(assetDiskPath)).digest("hex") === record.checksum : false;
      if (!existingSame) {
        await sharp(record.buffer).webp({ quality: 88 }).toFile(assetDiskPath);
        assetsCopiedConverted += 1;
      }
      const existingImage = product.images.find((image) => image.url === target);
      const importedPrimary = product.images.find((image) => image.isPrimary && (product.imageSource === "IMPORTED" || image.url.includes("/client-catalog/")));
      await input.db.$transaction(async (tx) => {
        await tx.productImage.updateMany({ where: { productId: product.id }, data: { isPrimary: false } });
        if (existingImage) {
          duplicateProductImageRecordsPrevented += 1;
          updatedProductImageRecords += 1;
          await tx.productImage.update({ where: { id: existingImage.id }, data: { isPrimary: true, sortOrder: 0, alt: product.name } });
        } else if (importedPrimary) {
          updatedProductImageRecords += 1;
          await tx.productImage.update({ where: { id: importedPrimary.id }, data: { url: target, isPrimary: true, sortOrder: 0, alt: product.name } });
        } else {
          newProductImageRecords += 1;
          await tx.productImage.create({ data: { productId: product.id, url: target, alt: product.name, isPrimary: true, sortOrder: 0 } });
        }
        await tx.product.update({ where: { id: product.id }, data: { imageStatus: ImageStatus.VERIFIED, imageSource: "IMPORTED", imageCheckedAt: new Date() } });
      });
      if (!product.images.some((image) => image.url && !image.url.includes("/placeholders/"))) productsMovedFromPlaceholderToRealImage += 1;
    }
  }
  const productsStillUsingPlaceholders = await input.db.product.count({
    where: { deletedAt: null, status: ProductStatus.ACTIVE, OR: [{ images: { none: {} } }, { imageStatus: ImageStatus.PLACEHOLDER }] },
  });
  const summary: ImportSummary = {
    zipFiles: scans.map(({ records: _records, ...scan }) => scan),
    totalValidImages: records.length,
    invalidImages: invalidRows.length,
    exactMappingMatches: rows.filter((row) => row.matchMethod === "EXACT_MAPPING").length,
    highConfidenceMatches: rows.filter((row) => row.result === "HIGH_CONFIDENCE_MATCH" || row.result === "IMPORTED").length,
    mediumConfidenceReviewItems: rows.filter((row) => row.result === "MEDIUM_CONFIDENCE_REVIEW").length,
    ambiguousImages: rows.filter((row) => row.result === "AMBIGUOUS").length,
    unmatchedImages: rows.filter((row) => row.result === "NO_MATCH").length,
    manualImagesPreserved,
    existingImportedImagesPreserved,
    existingImportedImagesReplaced,
    newProductImageRecords,
    updatedProductImageRecords,
    duplicateProductImageRecordsPrevented,
    assetsCopiedConverted,
    productsMovedFromPlaceholderToRealImage,
    productsStillUsingPlaceholders,
    duplicateChecksumsWithinZip: records.filter((record) => record.duplicateInZip).length,
    duplicateChecksumsAcrossZips: records.filter((record) => record.duplicateAcrossZips).length,
    manifestPath,
    rows,
  };
  writeFileSync(manifestPath, JSON.stringify(summary, null, 2));
  return summary;
}
