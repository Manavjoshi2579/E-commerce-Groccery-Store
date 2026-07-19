import { ImageStatus } from "@prisma/client";

export const productImageFallback = "/assets/products/product-placeholder.svg";

type ProductImageLike = {
  url: string | null;
  alt?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
};

type ProductImageSourceLike = {
  name: string;
  imageStatus?: ImageStatus | null;
  images?: ProductImageLike[];
};

const blockedProductImageSegments = [
  "/assets/categories/",
  "/assets/banners/",
  "/assets/placeholders/",
  "/placeholders/category-",
  "\\",
  "../",
];

function normalizeRelativeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("file:")) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return "";
  const withoutDuplicateUploads = trimmed.replace(/(^|\/)uploads\/uploads\//g, "$1uploads/");
  return withoutDuplicateUploads.startsWith("/") ? withoutDuplicateUploads : `/${withoutDuplicateUploads}`;
}

export function isProductImageUrl(value: string | null | undefined) {
  const normalized = normalizeRelativeUrl(String(value || ""));
  if (!normalized) return false;
  return !blockedProductImageSegments.some((segment) => normalized.includes(segment));
}

export function resolveProductImage(product: ProductImageSourceLike) {
  const images = [...(product.images || [])].sort((a, b) => {
    if (Boolean(a.isPrimary) !== Boolean(b.isPrimary)) return a.isPrimary ? -1 : 1;
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });
  const primary = images.find((image) => isProductImageUrl(image.url));
  const url = normalizeRelativeUrl(primary?.url || "");
  const resolvedUrl = url || productImageFallback;
  return {
    url: resolvedUrl,
    alt: primary?.alt || product.name,
    status: resolvedUrl === productImageFallback ? "Placeholder" : product.imageStatus === ImageStatus.NEEDS_REVIEW ? "Review Required" : "Image Available",
    isPlaceholder: resolvedUrl === productImageFallback,
  };
}
