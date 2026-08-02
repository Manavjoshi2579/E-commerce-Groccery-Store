import { db } from "../lib/db.js";

function digits(input: string) {
  let hash = 0;
  for (const char of input) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return String(hash).padStart(10, "0").slice(-10);
}

export function productIdentifierSet(product: { id: string; sku: string; clientProductCode?: string | null }) {
  const source = (product.clientProductCode || product.sku || product.id).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const numeric = digits(`${product.id}:${product.sku}:${product.clientProductCode || ""}`);
  return {
    barcode: `89${numeric}`,
    qrCode: `EAGLE:${source}:${numeric}`,
    pluCode: numeric.slice(-8),
  };
}

export async function ensureProductIdentifiers() {
  const products = await db.product.findMany({
    where: {
      deletedAt: null,
      OR: [{ barcode: null }, { qrCode: null }, { pluCode: null }],
    },
    select: { id: true, sku: true, clientProductCode: true, barcode: true, qrCode: true, pluCode: true },
  });

  let updated = 0;
  for (const product of products) {
    const identifiers = productIdentifierSet(product);
    await db.product.update({
      where: { id: product.id },
      data: {
        barcode: product.barcode || identifiers.barcode,
        qrCode: product.qrCode || identifiers.qrCode,
        pluCode: product.pluCode || identifiers.pluCode,
      },
    });
    updated += 1;
  }
  return { scanned: products.length, updated };
}
