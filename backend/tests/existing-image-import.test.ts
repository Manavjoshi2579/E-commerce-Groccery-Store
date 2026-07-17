import { describe, expect, it } from "vitest";
import AdmZip from "adm-zip";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { ImageStatus, ProductStatus } from "@prisma/client";
import { matchImageRecord, normalizeIdentity, safeArchivePath, scanImageZip, type ImageRecord, type ImportProduct } from "../lib/existing-image-import.js";

async function makeImage() {
  return sharp({ create: { width: 32, height: 32, channels: 4, background: "#d4af37" } }).png().toBuffer();
}

function product(patch: Partial<ImportProduct> = {}): ImportProduct {
  return {
    id: "p1",
    sku: "AAS-ATTA-10KG",
    name: "Aashirvaad Chakki Atta 10kg",
    clientProductCode: "PC100",
    importIdentity: "aashirvaad chakki atta 10kg|food items|1 pc|row 4",
    imageStatus: ImageStatus.PLACEHOLDER,
    imageSource: null,
    status: ProductStatus.ACTIVE,
    deletedAt: null,
    brand: { name: "Aashirvaad" },
    category: { name: "Food Items", slug: "food-items" },
    images: [],
    variants: [{ unit: "10 kg", status: ProductStatus.ACTIVE }],
    ...patch,
  };
}

function record(name: string): ImageRecord {
  return {
    sourceZip: "test.zip",
    sourceArchivePath: `${name}/screen.png`,
    sourceFolderName: name,
    sourceFilename: "screen.png",
    checksum: "abc",
    width: 32,
    height: 32,
    mimeType: "image/png",
    normalizedName: normalizeIdentity(name),
    extractedBrand: normalizeIdentity(name).split(" ")[0] || "",
    extractedQuantity: normalizeIdentity(name).match(/\b\d+\s*(?:g|kg|ml|l|pack|pc)\b/)?.[0] || "",
    extractedVariant: "",
    tokens: normalizeIdentity(name).split(" ").filter((token) => token.length > 1),
    duplicateInZip: false,
    duplicateAcrossZips: false,
    buffer: Buffer.from("x"),
  };
}

describe("existing product image import", () => {
  it("normalizes common image identity aliases and quantities", () => {
    expect(normalizeIdentity("premium_photo_of_aashirbaad_chakki_atta_10kg_bag")).toContain("aashirvaad");
    expect(normalizeIdentity("Veseline-bodylotion-500ml")).toBe("vaseline body lotion 500 ml");
  });

  it("prevents zip-slip paths", () => {
    expect(safeArchivePath("folder/screen.png")).toBe(true);
    expect(safeArchivePath("../screen.png")).toBe(false);
    expect(safeArchivePath("C:/tmp/screen.png")).toBe(false);
  });

  it("scans nested screen images", async () => {
    const dir = mkdtempSync(join(tmpdir(), "existing-images-"));
    const zipPath = join(dir, "images.zip");
    const zip = new AdmZip();
    zip.addFile("aashirvaad_chakki_atta_10kg_bag/screen.png", await makeImage());
    zip.writeZip(zipPath);
    const result = await scanImageZip(zipPath);
    expect(result.scanned).toBe(1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].width).toBe(32);
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses product code matches before semantic matching", () => {
    const match = matchImageRecord(record("PC100 premium supermarket product"), [product()]);
    expect(match.confidence).toBe("HIGH");
    expect(match.method).toBe("PRODUCT_CODE");
  });

  it("rejects quantity conflicts as ambiguous", () => {
    const match = matchImageRecord(record("aashirvaad chakki atta 5kg bag"), [product()]);
    expect(match.confidence).toBe("AMBIGUOUS");
    expect(match.rejectionReasons).toContain("quantity conflict");
  });

  it("keeps generic image names ambiguous", () => {
    const match = matchImageRecord(record("premium supermarket grocery product"), [product()]);
    expect(match.confidence).toBe("AMBIGUOUS");
  });
});
