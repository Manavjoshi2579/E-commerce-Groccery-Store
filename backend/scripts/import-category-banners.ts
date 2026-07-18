import AdmZip from "adm-zip";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { db } from "../lib/db.js";

type Mapping = {
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  sourceArchive: string;
  sourcePath: string;
  targetFilename: string;
  matchMethod: string;
  confidence: number;
  status: "MAP" | "PRESERVE_EXISTING" | "MISSING_IMAGE" | "REVIEW_REQUIRED" | "DO_NOT_MAP";
  notes?: string;
};

const repoRoot = path.resolve(process.cwd(), "..");
const manifestPath = path.resolve(process.cwd(), "data/category-banner-mapping.json");
const outputDir = path.resolve(repoRoot, "frontend/public/assets/categories");
const missingReportPath = path.resolve(process.cwd(), "data/category-banner-missing.csv");
const placeholderUrl = "/assets/categories/category-placeholder.webp";

function argValue(name: string) {
  const prefix = `${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function defaultArchivePath() {
  return path.resolve(process.env.USERPROFILE || "", "Downloads/stitch_premium_grocery_marketplace_banner (1).zip");
}

async function ensurePlaceholder() {
  const target = path.join(outputDir, "category-placeholder.webp");
  try {
    await fs.access(target);
  } catch {
    await sharp({
      create: {
        width: 1376,
        height: 768,
        channels: 4,
        background: { r: 247, g: 242, b: 232, alpha: 1 },
      },
    }).webp({ quality: 82 }).toFile(target);
  }
}

function validateMappings(mappings: Mapping[]) {
  const mappedSources = new Map<string, string>();
  const mappedCategories = new Set<string>();
  for (const mapping of mappings) {
    if (mapping.status !== "MAP") continue;
    if (!mapping.categoryId || !mapping.categorySlug || !mapping.sourcePath || !mapping.targetFilename) throw new Error(`Invalid MAP entry for ${mapping.categorySlug || mapping.categoryName}.`);
    if (mappedCategories.has(mapping.categorySlug)) throw new Error(`Duplicate category mapping: ${mapping.categorySlug}`);
    mappedCategories.add(mapping.categorySlug);
    const previous = mappedSources.get(mapping.sourcePath);
    if (previous) throw new Error(`Source image ${mapping.sourcePath} is mapped to both ${previous} and ${mapping.categorySlug}.`);
    mappedSources.set(mapping.sourcePath, mapping.categorySlug);
  }
}

async function inspectArchive(zip: AdmZip) {
  const seenChecksums = new Map<string, string[]>();
  const images = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || path.basename(entry.entryName).toLowerCase() !== "screen.png") continue;
    if (path.isAbsolute(entry.entryName) || entry.entryName.split(/[\\/]/).includes("..")) throw new Error(`Unsafe archive path: ${entry.entryName}`);
    const buffer = entry.getData();
    const metadata = await sharp(buffer).metadata();
    if (metadata.format !== "png" && metadata.format !== "jpeg" && metadata.format !== "webp") throw new Error(`Unsupported image type at ${entry.entryName}`);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    seenChecksums.set(checksum, [...(seenChecksums.get(checksum) || []), entry.entryName]);
    images.push({ sourcePath: entry.entryName, checksum, mime: `image/${metadata.format}`, width: metadata.width, height: metadata.height });
  }
  return { images, duplicateChecksums: Array.from(seenChecksums.entries()).filter(([, paths]) => paths.length > 1) };
}

async function writeMissingReport(mappings: Mapping[]) {
  const missing = mappings.filter((mapping) => mapping.categoryId && (mapping.status === "MISSING_IMAGE" || mapping.status === "REVIEW_REQUIRED"));
  const rows = ["categoryId,categoryName,categorySlug,productCount,currentImageUrl,reason,suggestedSubject"];
  for (const mapping of missing) {
    const category = await db.category.findUnique({ where: { id: mapping.categoryId }, select: { image: true, _count: { select: { products: true } } } });
    rows.push([mapping.categoryId, mapping.categoryName, mapping.categorySlug, String(category?._count.products || 0), category?.image || "", mapping.notes || mapping.status, `Dedicated ${mapping.categoryName} category banner`].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
  }
  await fs.writeFile(missingReportPath, `${rows.join("\n")}\n`, "utf8");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || !process.argv.includes("--apply");
  const archivePath = path.resolve(argValue("--archive") || defaultArchivePath());
  const mappings = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Mapping[];
  validateMappings(mappings);
  const zip = new AdmZip(archivePath);
  const audit = await inspectArchive(zip);
  await fs.mkdir(outputDir, { recursive: true });
  await ensurePlaceholder();
  await writeMissingReport(mappings);

  const updates = [];
  for (const mapping of mappings.filter((item) => item.status === "MAP")) {
    const entry = zip.getEntry(mapping.sourcePath);
    if (!entry) throw new Error(`Mapped source not found: ${mapping.sourcePath}`);
    const targetPath = path.join(outputDir, mapping.targetFilename);
    const publicUrl = `/assets/categories/${mapping.targetFilename}`;
    updates.push({ categorySlug: mapping.categorySlug, sourcePath: mapping.sourcePath, targetPath, publicUrl });
    if (!dryRun) {
      await sharp(entry.getData()).resize({ width: 1376, height: 768, fit: "inside", withoutEnlargement: true }).webp({ quality: 86 }).toFile(targetPath);
      await db.category.update({ where: { id: mapping.categoryId }, data: { image: publicUrl } });
    }
  }

  console.log(JSON.stringify({
    mode: dryRun ? "dry-run" : "apply",
    archivePath,
    imagesScanned: audit.images.length,
    validImages: audit.images.length,
    duplicateChecksums: audit.duplicateChecksums,
    mappedCategories: updates.length,
    missingCategories: mappings.filter((item) => item.categoryId && item.status === "MISSING_IMAGE").length,
    reviewRequired: mappings.filter((item) => item.status === "REVIEW_REQUIRED").length,
    targetPaths: updates.map((item) => ({ categorySlug: item.categorySlug, targetPath: item.targetPath, publicUrl: item.publicUrl })),
    missingReportPath,
    placeholderUrl,
  }, null, 2));
}

main().finally(() => db.$disconnect());
