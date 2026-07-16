import "../lib/load-env.js";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { ImageStatus, ProductStatus } from "@prisma/client";
import { db } from "../lib/db.js";
import { replaceClientCatalogFromWorkbook } from "../services/catalog.service.js";

type WorkbookRow = {
  workbookRow: number;
  productName: string;
  normalizedName: string;
  sourceCategory: string;
  normalizedCategory: string;
  categorySlug: string;
  normalizedUnit: string;
  clientProductCode: string;
  importIdentity: string;
  brand: string;
  rejected: boolean;
};

type ImageEntry = {
  archivePath: string;
  extractedPath: string;
  description: string;
  checksum: string;
  width: number;
  height: number;
  duplicate: boolean;
  valid: boolean;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const productAssetRoot = resolve(root, "frontend/public/assets/products/client-catalog");
const manifestPath = resolve(root, "backend/data/client-catalog-import-manifest.json");
const categoryNames: Record<string, string> = {
  "food items": "Food Items",
  "skin care": "Skin Care",
  haircare: "Hair Care",
  "home care": "Home Care",
  "personal care": "Personal Care",
  cleaning: "Cleaning",
  detergent: "Detergents",
  disposal: "Disposables",
  toothpaste: "Oral Care",
  dishwash: "Dishwashing",
  "baby care": "Baby Care",
  pooja: "Pooja Essentials",
  study: "Stationery",
  "electric applience": "Electrical Appliances",
  "body-care": "Body Care",
  "bars-covered-with-chocolate": "Chocolates & Confectionery",
};
const brandNames = [
  "Head & Shoulders", "Fair & Lovely", "Surf Excel", "Center Fresh", "Clinic Plus", "Lacto Calamine", "Laxman Rekha", "Rooh Afza", "Taj Mahal",
  "B Natural", "Act II", "All Out", "Ambi Pur", "Oral-B", "M Caffeine", "McVitie's", "Good Day", "Aashirvaad", "7M", "Americana",
  "Acnofight", "AJS", "Amul", "Ananda", "Aplus", "Apsara", "Ariel", "Babyhug", "Britannia", "Bujialalji", "Badshah", "Bakeri",
  "Bambino", "Beardo", "Bella Vita", "Bikaji", "Bisleri", "Bonn", "Boroplus", "Bournvita", "Camay", "Cadbury", "Candid", "Catch",
  "Cello", "Cinthol", "Closeup", "Coca-Cola", "Colgate", "Colin", "Continental", "Cremica", "Cuddles", "Dabur", "Daawat", "Dalda",
  "Dant Kanti", "Del Monte", "Denver", "Dettol", "Dove", "Dukes", "Elmore", "Everest", "Eveready", "Exo", "Ezee", "Fem", "Fiama",
  "Fine Life", "Fogg", "Fortune", "Gainda", "Gala", "Garnier", "Goldiee", "Godrej", "Gillette", "Hajmola", "Haldiram", "Hamam",
  "Hamdard", "Harpic", "Hershey", "Himalaya", "Hit", "Homelite", "Horlicks", "Huggies", "Indulekha", "Invasol", "Jabsons",
  "Jaguar", "Jivo", "Johnson's", "Joy", "Jovees", "Just Herbs", "Kangaro", "Keo Karpin", "Kesh King", "Khadi", "Kissan", "Knorr",
  "Kurkure", "Lakme", "Lifebuoy", "Lijjat", "Limca", "Lipton", "Lizol", "Lotte", "Lotus", "Lux", "MDH", "Maggi", "Maxo", "MBD",
  "Milkfood", "Milton", "Munch", "Nescafe", "Nestle", "Nihar", "Nivea", "Odonil", "Odomos", "Oleev", "Oreo", "Palmolive", "Parachute",
  "Parle", "Patanjali", "Pears", "Pepsodent", "Ponds", "Quaker", "Real", "Revlon", "Rin", "Saffola", "Santoor", "Savlon",
  "Sensodyne", "Set Wet", "Sofy", "Snickers", "Spinz", "Stayfree", "Streax", "Sunsilk", "Tata", "Tide", "Tops", "Tresemme",
  "Ujala", "Unibic", "Vaseline", "Veeba", "Veet", "Verka", "Vim", "Vivel", "Whisper", "Wipro", "Woosh", "Yardley", "YiPPee",
  "Yutika", "Zandu",
].sort((a, b) => b.length - a.length);
const brandAliases: Record<string, string> = {
  "h s": "Head & Shoulders", hs: "Head & Shoulders", "f l": "Fair & Lovely", fl: "Fair & Lovely", "b netural": "B Natural",
  "b natural": "B Natural", aashirbaad: "Aashirvaad", tresmme: "Tresemme", tresemme: "Tresemme", veseline: "Vaseline", vaseline: "Vaseline",
  "mcvities": "McVitie's", "mc vities": "McVitie's", dawat: "Daawat",
};
const stopWords = new Set(["premium", "supermarket", "catalog", "catalogue", "photography", "screen", "image", "product", "packshot", "product image", "front", "front pack", "white", "background", "pack", "pouch", "bag", "box", "bottle", "jar", "transparent", "classic", "and", "of", "the", "a", "an", "blue", "red", "yellow"]);

function argValue(name: string, fallback: string) {
  const arg = process.argv.find((item) => item.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : fallback;
}

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function slugify(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeSearch(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/&/g, " and ").replace(/['']/g, "").replace(/[-_/]+/g, " ").replace(/\bf\s*w\b/g, "face wash").replace(/\bfw\b/g, "face wash").replace(/\bshamp\b/g, "shampoo").replace(/\baata\b/g, "atta").replace(/\bpeenuts\b/g, "peanuts").replace(/\belachi\b/g, "elaichi").replace(/\bgm\b/g, "g").replace(/\bltr\b/g, "l").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizeUnit(value: string) {
  const raw = clean(value);
  if (!raw) return "";
  if (/^\d+(?:\.\d+)?$/.test(raw)) return `${raw} pc`;
  return raw.replace(/(\d)\s*(kg|g|gm|ml|ltr|l|pc|pcs|pack|pair|dozen)\b/gi, (_, amount, unit) => {
    const normalized = String(unit).toLowerCase().replace(/^gm$/, "g").replace(/^ltr$/, "L").replace(/^l$/, "L");
    return `${amount} ${normalized}`;
  }).replace(/\s+/g, " ").trim();
}

function normalizedCategory(value: string) {
  const raw = clean(value);
  return categoryNames[raw.toLowerCase()] || raw.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

function brandFromName(value: string) {
  const normalized = normalizeSearch(value);
  for (const [alias, brand] of Object.entries(brandAliases)) {
    if (normalized === alias || normalized.startsWith(`${alias} `)) return brand;
  }
  return brandNames.find((brand) => {
    const key = normalizeSearch(brand);
    return normalized === key || normalized.startsWith(`${key} `);
  }) || "Unbranded";
}

function identity(row: WorkbookRow) {
  return [row.productName, row.normalizedCategory, row.normalizedUnit, `row-${row.workbookRow}`].map(normalizeSearch).join("|");
}

function tokenSet(value: string) {
  return new Set(normalizeSearch(value).split(" ").filter((token) => token.length > 1 && !stopWords.has(token)));
}

function sizeTokens(value: string) {
  const text = normalizeSearch(value).replace(/(\d+)\s*x\s*(\d+)\s*g\b/g, "$1x$2g").replace(/(\d+)\s*x\s*(\d+)\s*ml\b/g, "$1x$2ml");
  const tokens = new Set<string>();
  for (const match of text.matchAll(/(\d+)x(\d+(?:\.\d+)?)(kg|g|ml|l|pc|pcs|pack|pair|dozen)\b/g)) tokens.add(`${match[1]}x${match[2]}${match[3]}`);
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|pc|pcs|pack|pair|dozen)\b/g)) tokens.add(`${match[1]}${match[2]}`);
  return tokens;
}

function brandInText(value: string) {
  return brandFromName(value);
}

function productTypeTokens(value: string) {
  const typeWords = ["shampoo", "soap", "powder", "liquid", "detergent", "noodles", "sauce", "methi", "jeera", "atta", "salt", "ghee", "butter", "juice", "biscuit", "cookies", "toothpaste", "brush", "cream", "oil", "rice", "dal", "masala", "plates", "cap", "scrub", "file", "pencil", "eraser"];
  const tokens = tokenSet(value);
  return new Set(typeWords.filter((word) => tokens.has(word)));
}

function readWorkbook(workbookPath: string) {
  const wb = XLSX.read(readFileSync(workbookPath), { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "" });
  const workbookRows: WorkbookRow[] = rows.map((row, index) => {
    const normalized = normalizedCategory(clean(row["Category Name"]));
    const item = {
      workbookRow: index + 2,
      productName: clean(row["Product Name"]),
      normalizedName: normalizeSearch(clean(row["Product Name"])),
      sourceCategory: clean(row["Category Name"]),
      normalizedCategory: normalized,
      categorySlug: slugify(normalized),
      normalizedUnit: normalizeUnit(clean(row["Unit Name"])),
      clientProductCode: clean(row["Product Code"]),
      importIdentity: "",
      brand: brandFromName(clean(row["Product Name"])),
      rejected: /\b(test product|demo|ad|donation|mrp sticker|damage)\b/i.test(clean(row["Product Name"])),
    };
    item.importIdentity = identity(item);
    return item;
  });
  return {
    sheetName,
    headers: rows[0] ? Object.keys(rows[0]) : [],
    rows: workbookRows,
    rawRows: rows,
  };
}

function pngDimensions(buffer: Buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function extractZip(zipPath: string) {
  const temp = resolve(process.env.TEMP || root, `eagle-client-images-${Date.now()}`);
  mkdirSync(temp, { recursive: true });
  execFileSync("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${temp.replace(/'/g, "''")}' -Force`], { stdio: "ignore" });
  return temp;
}

function imageEntries(zipPath: string) {
  const extracted = extractZip(zipPath);
  const files = walk(extracted).filter((file) => basename(file).toLowerCase() === "screen.png");
  const checksumCounts = new Map<string, number>();
  const entries = files.map((file) => {
    const buffer = readFileSync(file);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    checksumCounts.set(checksum, (checksumCounts.get(checksum) || 0) + 1);
    const dimensions = pngDimensions(buffer);
    return {
      archivePath: relative(extracted, file).replace(/\\/g, "/"),
      extractedPath: file,
      description: basename(dirname(file)).replace(/^premium_supermarket_catalogue_photography_of_/, "").replace(/_/g, " "),
      checksum,
      width: dimensions?.width || 0,
      height: dimensions?.height || 0,
      valid: Boolean(dimensions),
      duplicate: false,
    };
  });
  for (const entry of entries) entry.duplicate = (checksumCounts.get(entry.checksum) || 0) > 1;
  return { extracted, entries };
}

function matchImage(entry: ImageEntry, rows: WorkbookRow[]) {
  if (!entry.valid) return { status: "INVALID_IMAGE", confidence: 0, secondBestScore: 0, margin: 0, reasons: [], rejections: ["Invalid PNG image"] };
  if (entry.duplicate) return { status: "DUPLICATE_IMAGE", confidence: 0, secondBestScore: 0, margin: 0, reasons: [], rejections: ["Duplicate image checksum"] };
  const imageTokens = tokenSet(entry.description);
  const imageSizes = sizeTokens(entry.description);
  const imageBrand = brandInText(entry.description);
  const imageTypes = productTypeTokens(entry.description);
  const candidates = rows.filter((row) => !row.rejected).map((row) => {
    const productTokens = tokenSet(`${row.productName} ${row.normalizedUnit}`);
    const productSizes = sizeTokens(`${row.productName} ${row.normalizedUnit}`);
    const productTypes = productTypeTokens(row.productName);
    const common = [...productTokens].filter((token) => imageTokens.has(token));
    const reasons: string[] = [];
    const rejections: string[] = [];
    const brandConflict = imageBrand !== "Unbranded" && row.brand !== "Unbranded" && imageBrand !== row.brand;
    const sizeConflict = imageSizes.size > 0 && productSizes.size > 0 && ![...imageSizes].some((token) => productSizes.has(token));
    const typeConflict = imageTypes.size > 0 && productTypes.size > 0 && ![...imageTypes].some((token) => productTypes.has(token));
    let score = 0;
    if (row.brand !== "Unbranded" && imageBrand === row.brand) { score += 30; reasons.push(`brand:${row.brand}`); }
    if (row.brand === "Unbranded" && imageBrand === "Unbranded") score += 2;
    const sharedTypes = [...productTypes].filter((token) => imageTypes.has(token));
    if (sharedTypes.length) { score += 25; reasons.push(`type:${sharedTypes.join("/")}`); }
    if (imageSizes.size > 0 && [...imageSizes].some((token) => productSizes.has(token))) { score += 25; reasons.push(`quantity:${[...imageSizes].filter((token) => productSizes.has(token)).join("/")}`); }
    if (common.length >= 3) score += 15;
    else score += common.length * 4;
    if (common.length) reasons.push(`tokens:${common.slice(0, 8).join("/")}`);
    if (row.categorySlug && imageTokens.has(row.categorySlug.split("-")[0])) score += 10;
    if (brandConflict) rejections.push(`wrong brand:${imageBrand} vs ${row.brand}`);
    if (sizeConflict) rejections.push("conflicting quantity");
    if (typeConflict && common.length < 3) rejections.push("conflicting product type");
    if (rejections.length) score = -100;
    return { row, score, common, reasons, rejections, imageSizes, productSizes };
  }).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const next = candidates[1];
  const secondBestScore = Math.max(0, next?.score || 0);
  const margin = (best?.score || 0) - secondBestScore;
  if (!best || best.score < 35) return { status: "NO_PRODUCT_MATCH", confidence: Math.max(0, best?.score || 0), secondBestScore, margin, reasons: best?.reasons || [], rejections: ["No strong product match"] };
  if (best.rejections.some((reason) => reason.includes("brand"))) return { status: "CONFLICTING_BRAND", confidence: best.score, secondBestScore, margin, reasons: best.reasons, rejections: best.rejections };
  if (best.rejections.some((reason) => reason.includes("quantity"))) return { status: "CONFLICTING_QUANTITY", confidence: best.score, secondBestScore, margin, reasons: best.reasons, rejections: best.rejections };
  if (best.rejections.length) return { status: "CONFLICTING_VARIANT", confidence: best.score, secondBestScore, margin, reasons: best.reasons, rejections: best.rejections };
  if (margin < 12) return { status: "AMBIGUOUS", confidence: best.score, secondBestScore, margin, reasons: best.reasons, rejections: ["Multiple plausible product matches"], row: best.row };
  const status = best.score >= 70 ? "MATCHED_HIGH_CONFIDENCE" : "MATCHED_MEDIUM_CONFIDENCE";
  return { status, confidence: best.score, secondBestScore, margin, reasons: best.reasons, rejections: [], row: best.row };
}

async function linkMatchedImages(manifest: any[], overwrite: boolean) {
  let linked = 0;
  for (const item of manifest.filter((row) => row.matchStatus === "MATCHED_HIGH_CONFIDENCE" || (row.matchStatus === "MATCHED_MEDIUM_CONFIDENCE" && row.scoreMargin >= 20))) {
    const product = await db.product.findUnique({ where: { importIdentity: item.importIdentity }, include: { images: true } });
    if (!product || product.status !== ProductStatus.ACTIVE) {
      item.matchStatus = "PRODUCT_REJECTED";
      continue;
    }
    const existingPrimary = product.images.find((image) => image.isPrimary);
    if (!overwrite && product.imageStatus === ImageStatus.VERIFIED && existingPrimary && !existingPrimary.url.includes("/placeholder")) {
      item.matchStatus = "AMBIGUOUS";
      item.matchReason = "Existing verified product image preserved";
      continue;
    }
    const categoryDir = join(productAssetRoot, item.categorySlug);
    mkdirSync(categoryDir, { recursive: true });
    const finalPath = `/assets/products/client-catalog/${item.categorySlug}/${product.sku}.png`;
    copyFileSync(item.extractedPath, join(categoryDir, `${product.sku}.png`));
    await db.$transaction([
      db.productImage.updateMany({ where: { productId: product.id }, data: { isPrimary: false } }),
      db.productImage.create({ data: { productId: product.id, url: finalPath, alt: product.name, isPrimary: true, sortOrder: 0 } }),
      db.product.update({ where: { id: product.id }, data: { imageStatus: ImageStatus.VERIFIED, imageSource: finalPath, imageCheckedAt: new Date() } }),
    ]);
    item.productId = product.id;
    item.generatedSku = product.sku;
    item.finalImagePath = finalPath;
    linked += 1;
  }
  return linked;
}

async function main() {
  const workbookPath = resolve(root, argValue("--workbook", "products.xlsx"));
  const zipPath = resolve(argValue("--zip", "C:/Users/manav/Downloads/stitch_eagle_mart_product_catalogue_images.zip"));
  const apply = process.argv.includes("--apply");
  const overwriteImages = process.argv.includes("--overwrite-manual-images");
  const deleteUnreferencedOldProducts = process.argv.includes("--delete-unreferenced-old-products");
  if (!existsSync(workbookPath)) throw new Error(`Workbook not found: ${workbookPath}`);
  if (!existsSync(zipPath)) throw new Error(`Image ZIP not found: ${zipPath}`);

  const workbook = readWorkbook(workbookPath);
  const { extracted, entries } = imageEntries(zipPath);
  const matches = entries.map((entry) => ({ entry, match: matchImage(entry, workbook.rows) }));
  const manifest = matches.map(({ entry, match }) => ({
    workbookRow: "row" in match && match.row ? match.row.workbookRow : null,
    productName: "row" in match && match.row ? match.row.productName : "",
    normalizedName: "row" in match && match.row ? match.row.normalizedName : "",
    normalizedCategory: "row" in match && match.row ? match.row.normalizedCategory : "",
    categorySlug: "row" in match && match.row ? match.row.categorySlug : "",
    normalizedUnit: "row" in match && match.row ? match.row.normalizedUnit : "",
    clientProductCode: "row" in match && match.row ? match.row.clientProductCode : "",
    importIdentity: "row" in match && match.row ? match.row.importIdentity : "",
    generatedSku: "",
    productId: "",
    sourceArchivePath: entry.archivePath,
    sourceImageArchivePath: entry.archivePath,
    normalizedImageName: normalizeSearch(entry.description),
    extractedPath: entry.extractedPath,
    finalImagePath: "",
    matchStatus: match.status,
    confidenceScore: match.confidence,
    matchConfidence: match.confidence,
    secondBestScore: match.secondBestScore,
    scoreMargin: match.margin,
    matchedBrand: "row" in match && match.row ? match.row.brand : "",
    matchedQuantity: "row" in match && match.row ? [...sizeTokens(`${match.row.productName} ${match.row.normalizedUnit}`)].join(", ") : "",
    matchedUnit: "row" in match && match.row ? match.row.normalizedUnit : "",
    matchReasons: match.reasons,
    rejectionReasons: match.rejections,
    candidateCount: workbook.rows.length,
    matchReason: match.reasons?.join("; ") || match.rejections?.join("; "),
    imageWidth: entry.width,
    imageHeight: entry.height,
    checksum: entry.checksum,
  }));

  const workbookBase64 = readFileSync(workbookPath).toString("base64");
  const importSummary = await replaceClientCatalogFromWorkbook({ filename: basename(workbookPath), contentBase64: workbookBase64 }, !apply, { deleteUnreferencedOldProducts });
  let imagesLinked = 0;
  if (apply) {
    imagesLinked = await linkMatchedImages(manifest, overwriteImages);
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest.map(({ extractedPath: _omit, ...row }) => row), null, 2));
  }

  const duplicateRows = workbook.rawRows.length - new Set(workbook.rows.map((row) => row.importIdentity)).size;
  const categories = new Set(workbook.rows.map((row) => row.normalizedCategory));
  const unbranded = workbook.rows.filter((row) => row.brand === "Unbranded").length;
  const summary = {
    dryRun: !apply,
    workbook: { sheetName: workbook.sheetName, rowCount: workbook.rows.length, headers: workbook.headers, duplicateRows },
    importSummary,
    categoriesNormalized: categories.size,
    unbrandedProducts: unbranded,
    zipImagesProcessed: entries.length,
    validPngImages: entries.filter((entry) => entry.valid).length,
    duplicateImageFiles: entries.filter((entry) => entry.duplicate).length,
    imagesConfidentlyMatched: manifest.filter((row) => row.matchStatus === "MATCHED_HIGH_CONFIDENCE" || row.matchStatus === "MATCHED_MEDIUM_CONFIDENCE").length,
    imagesLinked,
    ambiguousImagesLeftUnmapped: manifest.filter((row) => row.matchStatus === "AMBIGUOUS" || row.matchStatus === "NO_PRODUCT_MATCH" || String(row.matchStatus).startsWith("CONFLICTING")).length,
    invalidImages: manifest.filter((row) => row.matchStatus === "INVALID_IMAGE").length,
    duplicateImagesUnmapped: manifest.filter((row) => row.matchStatus === "DUPLICATE_IMAGE").length,
    productsRetainingPlaceholders: Math.max(0, workbook.rows.length - imagesLinked),
    archiveSafety: deleteUnreferencedOldProducts ? "destructive deletion enabled for unreferenced old products" : "default archive-old-products behavior",
    backupCommand: "mysqldump --single-transaction --routines --triggers \"$DATABASE_URL\" > eagle-mart-catalog-backup.sql",
    manifestPath: apply ? manifestPath : null,
  };
  console.log(JSON.stringify(summary, null, 2));
  rmSync(extracted, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
