import "../lib/load-env.js";
import { ProductStatus } from "@prisma/client";
import { db } from "../lib/db.js";

const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || process.env.GOOGLE_CSE_API_KEY || "";
const engineId = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID || process.env.GOOGLE_CSE_ID || "";
const productFallback = "/assets/placeholders/product-placeholder-generated.png";
const maxProducts = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || process.env.IMAGE_ENRICH_LIMIT || "100");
const dryRun = process.argv.includes("--dry-run");

type GoogleImageItem = {
  title?: string;
  link?: string;
  displayLink?: string;
  snippet?: string;
  mime?: string;
  image?: {
    contextLink?: string;
    width?: number;
    height?: number;
    byteSize?: number;
  };
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string) {
  const stop = new Set(["and", "the", "with", "for", "pack", "product", "image", "photo", "buy", "online", "pc", "pcs", "kg", "g", "ml", "l"]);
  return normalize(value).split(" ").filter((token) => token.length > 1 && !stop.has(token));
}

function scoreImage(item: GoogleImageItem, product: { name: string; unit: string; brand: { name: string }; category: { name: string } }) {
  const haystack = normalize([item.title, item.snippet, item.displayLink, item.image?.contextLink].filter(Boolean).join(" "));
  const nameTokens = tokens(product.name);
  const categoryTokens = tokens(product.category.name);
  const matchedName = nameTokens.filter((token) => haystack.includes(token)).length;
  const matchedCategory = categoryTokens.some((token) => haystack.includes(token)) ? 1 : 0;
  const brandNeeded = product.brand.name !== "Unbranded";
  const brandHit = !brandNeeded || haystack.includes(normalize(product.brand.name));
  const image = item.image;
  const sizeScore = image?.width && image?.height && image.width >= 250 && image.height >= 250 ? 2 : 0;
  const fileScore = item.mime?.startsWith("image/") ? 1 : 0;
  const exactNameScore = haystack.includes(normalize(product.name)) ? 5 : 0;
  const brandScore = brandHit ? 2 : -4;
  return exactNameScore + matchedName + matchedCategory + brandScore + sizeScore + fileScore;
}

function usableImageUrl(value: string | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    if (url.hostname.includes("google.") || url.hostname.includes("gstatic.")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function googleImageSearch(query: string) {
  const params = new URLSearchParams({
    key: apiKey,
    cx: engineId,
    q: query,
    searchType: "image",
    imgType: "photo",
    safe: "active",
    num: "5",
  });
  const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
  if (!response.ok) throw new Error(`Google image search failed with ${response.status}`);
  const data = await response.json() as { items?: GoogleImageItem[] };
  return data.items || [];
}

async function main() {
  if (!apiKey || !engineId) {
    console.log(JSON.stringify({
      ok: false,
      skipped: true,
      reason: "Set GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_CUSTOM_SEARCH_ENGINE_ID to enable Google image enrichment.",
    }, null, 2));
    return;
  }

  const products = await db.product.findMany({
    where: {
      status: ProductStatus.ACTIVE,
      deletedAt: null,
      images: { every: { url: productFallback } },
    },
    include: { brand: true, category: true, images: true, variants: { orderBy: { createdAt: "asc" } } },
    orderBy: { name: "asc" },
    take: Math.max(1, Math.min(maxProducts, 1000)),
  });

  const summary = { checked: 0, matched: 0, skippedLowConfidence: 0, updated: 0, dryRun };
  for (const product of products) {
    summary.checked += 1;
    const unit = product.variants[0]?.unit || "";
    const query = `${product.name} ${unit} ${product.brand.name !== "Unbranded" ? product.brand.name : product.category.name} product pack image`;
    const candidates = (await googleImageSearch(query))
      .map((item) => ({ item, url: usableImageUrl(item.link), score: scoreImage(item, { name: product.name, unit, brand: product.brand, category: product.category }) }))
      .filter((candidate) => candidate.url)
      .sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best || best.score < 7) {
      summary.skippedLowConfidence += 1;
      continue;
    }
    summary.matched += 1;
    if (!dryRun) {
      const existingPrimary = product.images.find((image) => image.isPrimary) || product.images[0];
      if (existingPrimary) {
        await db.productImage.update({ where: { id: existingPrimary.id }, data: { url: best.url, alt: product.name, isPrimary: true } });
      } else {
        await db.productImage.create({ data: { productId: product.id, url: best.url, alt: product.name, isPrimary: true, sortOrder: 1 } });
      }
      summary.updated += 1;
    }
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
