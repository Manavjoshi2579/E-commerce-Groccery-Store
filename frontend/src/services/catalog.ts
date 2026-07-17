"use client";

import type { Category, Product } from "@/types";
import { API_BASE, requestApi } from "./api";

const productFallback = "/assets/placeholders/product-placeholder-generated.png";
const categoryFallback = "/assets/placeholders/category-placeholder.svg";

function asset(value: string | undefined, fallback: string) {
  return value && value.trim() ? value : fallback;
}

function productAsset(input: any) {
  const primary = input.primaryImageUrl || input.images?.find?.((image: any) => image?.isPrimary)?.url || input.images?.[0]?.url || input.image;
  return asset(primary, productFallback);
}

export function mapApiProduct(input: any): Product {
  const variants = Array.isArray(input.variants) ? input.variants.map((variant: any, index: number) => ({
    id: variant.id,
    sku: variant.sku,
    label: variant.label || variant.unit,
    unit: variant.unit,
    mrp: Number(variant.mrp || 0),
    price: Number(variant.price ?? variant.sellingPrice ?? 0),
    costPrice: variant.costPrice == null ? null : Number(variant.costPrice),
    stock: Number(variant.stock ?? input.stock ?? 0),
    lowStock: Number(variant.lowStock ?? variant.lowStockThreshold ?? 10),
    lowStockThreshold: Number(variant.lowStockThreshold ?? variant.lowStock ?? 10),
    active: variant.active ?? variant.status === "ACTIVE",
    status: variant.status,
    isDefault: Boolean(variant.isDefault) || index === 0,
  })) : [];
  return {
    id: input.id,
    slug: input.slug,
    name: input.name,
    sku: input.sku,
    clientProductCode: input.clientProductCode,
    brand: input.brand,
    brandId: input.brandId,
    brandSlug: input.brandSlug,
    category: input.category,
    categoryId: input.categoryId,
    categorySlug: input.categorySlug,
    unit: input.unit || variants[0]?.unit || "",
    mrp: Number(input.mrp || 0),
    price: Number(input.price ?? input.sellingPrice ?? 0),
    gst: Number(input.gst ?? input.taxPercentage ?? 0),
    rating: Number(input.rating ?? input.ratingAvg ?? 0),
    reviews: Number(input.reviews ?? input.reviewCount ?? 0),
    stock: Number(input.stock ?? 0),
    lowStock: Number(input.lowStock ?? 10),
    image: productAsset(input),
    imageStatus: input.imageStatus || "Placeholder",
    imageSource: input.imageSource,
    images: input.images,
    variants,
    tags: Array.isArray(input.tags) ? input.tags : [],
    featured: Boolean(input.featured ?? input.isFeatured),
    organic: Boolean(input.organic ?? input.isOrganic),
    local: Boolean(input.local ?? input.isLocal),
    active: input.active ?? input.status === "ACTIVE",
    description: input.description || "",
  };
}

export function mapApiCategory(input: any): Category {
  return {
    id: input.id,
    slug: input.slug,
    name: input.name,
    image: asset(input.image, categoryFallback),
  };
}

export async function fetchCategories() {
  const data = await requestApi<{ categories: any[] }>("/api/categories");
  return data.categories.map(mapApiCategory);
}

export async function fetchBrands() {
  const data = await requestApi<{ brands: any[] }>("/api/brands");
  return data.brands.map((brand) => ({ id: brand.id, slug: brand.slug, name: brand.name, logo: asset(brand.logo, categoryFallback) }));
}

export async function fetchProducts(params: Record<string, string | number | boolean | undefined> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  const data = await requestApi<{ products: any[]; pagination: any; filters: any }>(`/api/products${search.size ? `?${search}` : ""}`);
  return { products: data.products.map(mapApiProduct), pagination: data.pagination, filters: data.filters, source: "api" as const };
}

export async function fetchProduct(slug: string) {
  const data = await requestApi<{ product: any }>(`/api/products/${slug}`);
  return mapApiProduct(data.product);
}

export async function fetchAdminProducts(params: Record<string, string | number | boolean | undefined> = {}) {
  const search = new URLSearchParams({ limit: "25", ...Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => [key, String(value)])) });
  const data = await requestApi<{ products: any[]; pagination?: any }>(`/api/admin/products?${search}`);
  return { products: data.products.map(mapApiProduct), pagination: data.pagination };
}

export async function fetchAdminProduct(id: string) {
  const data = await requestApi<{ product: any }>(`/api/admin/products/${encodeURIComponent(id)}`);
  return mapApiProduct(data.product);
}

export async function replaceAdminProductImage(id: string, imageUrl: string) {
  const data = await requestApi<{ product: any }>(`/api/admin/products/${encodeURIComponent(id)}/image`, {
    method: "PATCH",
    body: JSON.stringify({ imageUrl }),
  });
  return mapApiProduct(data.product);
}

export async function fetchAdminCategories() {
  const data = await requestApi<{ categories: any[] }>("/api/admin/categories");
  return data.categories.map(mapApiCategory);
}

export async function createAdminCategory(name: string) {
  const data = await requestApi<{ category: any }>("/api/admin/categories", {
    method: "POST",
    body: JSON.stringify({ name, image: categoryFallback }),
  });
  return mapApiCategory(data.category);
}

export async function updateAdminCategory(id: string, name: string) {
  const data = await requestApi<{ category: any }>(`/api/admin/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name, image: categoryFallback }),
  });
  return mapApiCategory(data.category);
}

export async function deleteAdminCategory(id: string) {
  await requestApi<{ deleted: boolean }>(`/api/admin/categories/${id}`, { method: "DELETE" });
}

export async function fetchAdminBrands() {
  const data = await requestApi<{ brands: any[] }>("/api/admin/brands");
  return data.brands.map((brand) => ({ id: brand.id, slug: brand.slug, name: brand.name, logo: asset(brand.logo, categoryFallback) }));
}

export async function createAdminBrand(name: string) {
  const data = await requestApi<{ brand: any }>("/api/admin/brands", {
    method: "POST",
    body: JSON.stringify({ name, logo: categoryFallback }),
  });
  return { id: data.brand.id, slug: data.brand.slug, name: data.brand.name, logo: data.brand.logo };
}

export async function updateAdminBrand(id: string, name: string) {
  const data = await requestApi<{ brand: any }>(`/api/admin/brands/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name, logo: categoryFallback }),
  });
  return { id: data.brand.id, slug: data.brand.slug, name: data.brand.name, logo: data.brand.logo };
}

export async function deleteAdminBrand(id: string) {
  await requestApi<{ deleted: boolean }>(`/api/admin/brands/${id}`, { method: "DELETE" });
}

export async function createAdminProduct(product: Product) {
  const data = await requestApi<{ product: any }>("/api/admin/products", {
    method: "POST",
    body: JSON.stringify(toAdminPayload(product)),
  });
  return mapApiProduct(data.product);
}

export async function updateAdminProduct(product: Product) {
  const data = await requestApi<{ product: any }>(`/api/admin/products/${product.id}`, {
    method: "PATCH",
    body: JSON.stringify(toAdminPayload(product)),
  });
  return mapApiProduct(data.product);
}

export async function deleteAdminProduct(id: string) {
  await requestApi<{ deleted: boolean }>(`/api/admin/products/${id}`, { method: "DELETE" });
}

export async function downloadProductBulkTemplate() {
  const response = await fetch(`${API_BASE}/api/admin/products/bulk-template`, { credentials: "include" });
  if (!response.ok) throw new Error("Could not download product template.");
  return response.text();
}

export async function downloadProductBulkTemplateXlsx() {
  const response = await fetch(`${API_BASE}/api/admin/products/bulk-template.xlsx`, { credentials: "include" });
  if (!response.ok) throw new Error("Could not download XLSX product template.");
  return response.blob();
}

export type BulkImportMode = "create_update" | "create_only" | "update_only";
export type BulkImportSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  created: number;
  updated: number;
  skipped?: number;
  failed?: number;
  valid?: number;
  warnings?: { row: number; warnings: string[] }[] | number;
  invalid?: number;
  newProducts?: number;
  productsToUpdate?: number;
  conflicts?: number;
  rows?: { row: number; status: "valid" | "warning" | "error"; action: "create" | "update" | "skip"; errors: { message: string }[]; warnings: { message: string }[]; data?: Record<string, string>; image?: { url: string; status: "none" | "valid" | "invalid"; message: string } }[];
  failedRowsCsv?: string;
  errors: { row: number; errors: string[] }[];
};

export async function bulkImportAdminProducts(csv: string, mode: BulkImportMode = "create_update", dryRun = false, overwriteExistingPrimaryImage = false) {
  const data = await requestApi<{ summary: BulkImportSummary }>("/api/admin/products/bulk-import", {
    method: "POST",
    body: JSON.stringify({ csv, mode, dryRun, overwriteExistingPrimaryImage }),
  });
  return data.summary;
}

export async function bulkImportAdminProductFile(file: File, mode: BulkImportMode = "create_update", dryRun = false, overwriteExistingPrimaryImage = false) {
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read import file."));
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.readAsDataURL(file);
  });
  const data = await requestApi<{ summary: BulkImportSummary }>("/api/admin/products/bulk-import", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, contentBase64, mode, dryRun, overwriteExistingPrimaryImage }),
  });
  return data.summary;
}

function toAdminPayload(product: Product) {
  const variants = product.variants?.length ? product.variants.map((variant, index) => ({
    id: variant.id,
    sku: variant.sku,
    label: variant.label || variant.unit,
    unit: variant.unit,
    mrp: variant.mrp,
    price: variant.price,
    costPrice: variant.costPrice ?? undefined,
    stock: variant.stock ?? (index === 0 ? product.stock : 0),
    lowStockThreshold: variant.lowStockThreshold ?? variant.lowStock ?? product.lowStock,
    active: variant.active !== false,
    isDefault: Boolean(variant.isDefault) || index === 0,
    status: variant.active === false ? "INACTIVE" : "ACTIVE",
  })) : [{
    label: "Default",
    unit: product.unit,
    mrp: product.mrp,
    price: product.price,
    stock: product.stock,
    lowStockThreshold: product.lowStock,
    active: true,
    isDefault: true,
    status: "ACTIVE",
  }];
  return {
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    clientProductCode: product.clientProductCode,
    categoryId: product.categoryId,
    category: product.category,
    brandId: product.brandId,
    brand: product.brand,
    description: product.description || product.name,
    gst: product.gst,
    tags: product.tags,
    featured: product.featured,
    organic: product.organic,
    local: product.local,
    status: product.active === false ? "INACTIVE" : "ACTIVE",
    image: product.image,
    variants,
    variant: variants[0],
    inventory: {
      stock: product.stock,
      lowStockThreshold: product.lowStock,
    },
  };
}
