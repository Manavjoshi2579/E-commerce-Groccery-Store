import "../lib/load-env.js";
import { resolve } from "node:path";
import { db } from "../lib/db.js";
import { importExistingProductImages } from "../lib/existing-image-import.js";

function values(flag: string) {
  const result: string[] = [];
  process.argv.forEach((arg, index) => {
    if (arg === flag && process.argv[index + 1]) result.push(process.argv[index + 1]);
    if (arg.startsWith(`${flag}=`)) result.push(arg.slice(flag.length + 1));
  });
  return result;
}

function value(flag: string, fallback: string) {
  return values(flag)[0] || fallback;
}

async function main() {
  const rootDir = resolve(process.cwd(), "..");
  const zipPaths = values("--zip").map((path) => resolve(path));
  if (!zipPaths.length) throw new Error("Provide at least one explicit --zip path.");
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run") || !apply;
  const summary = await importExistingProductImages({
    db,
    rootDir,
    zipPaths,
    apply,
    dryRun,
    preserveExistingImages: !process.argv.includes("--replace-existing-images"),
    replaceImportedImages: process.argv.includes("--replace-imported-images"),
    onlyPlaceholders: process.argv.includes("--only-placeholders") || !process.argv.includes("--replace-imported-images"),
    manifestPath: value("--manifest", "backend/data/existing-product-image-import-manifest.json"),
  });
  console.log(JSON.stringify({
    mode: apply ? "apply" : dryRun ? "dry-run" : "dry-run",
    zipFiles: summary.zipFiles,
    totalValidImages: summary.totalValidImages,
    invalidImages: summary.invalidImages,
    exactMappingMatches: summary.exactMappingMatches,
    highConfidenceMatches: summary.highConfidenceMatches,
    mediumConfidenceReviewItems: summary.mediumConfidenceReviewItems,
    ambiguousImages: summary.ambiguousImages,
    unmatchedImages: summary.unmatchedImages,
    manualImagesPreserved: summary.manualImagesPreserved,
    existingImportedImagesPreserved: summary.existingImportedImagesPreserved,
    existingImportedImagesReplaced: summary.existingImportedImagesReplaced,
    newProductImageRecords: summary.newProductImageRecords,
    updatedProductImageRecords: summary.updatedProductImageRecords,
    duplicateProductImageRecordsPrevented: summary.duplicateProductImageRecordsPrevented,
    assetsCopiedConverted: summary.assetsCopiedConverted,
    productsMovedFromPlaceholderToRealImage: summary.productsMovedFromPlaceholderToRealImage,
    productsStillUsingPlaceholders: summary.productsStillUsingPlaceholders,
    duplicateChecksumsWithinZip: summary.duplicateChecksumsWithinZip,
    duplicateChecksumsAcrossZips: summary.duplicateChecksumsAcrossZips,
    manifestPath: summary.manifestPath,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
