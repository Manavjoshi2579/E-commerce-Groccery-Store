"use client";

import { products as seedProducts } from "@/data/products";
import type { Category, Product } from "@/types";
import { API_BASE, requestApi } from "./api";

const productFallback = "/assets/placeholders/product-placeholder-generated.png";
const categoryFallback = "/assets/placeholders/category-placeholder.svg";
const generatedProductImages: Record<string, string> = Object.fromEntries(seedProducts.map((product) => [product.slug, product.image]));

function asset(value: string | undefined, fallback: string) {
  return value && value.trim() ? value : fallback;
}

function productAsset(input: any) {
  const value = asset(input.image, productFallback);
  if (value === productFallback || value.includes("/assets/placeholders/")) {
    return generatedProductImages[input.slug] || productFallback;
  }
  return value;
}

export function mapApiProduct(input: any): Product {
  const variants = Array.isArray(input.variants) ? input.variants.map((variant: any, index: number) => ({
    id: variant.id,
    sku: variant.sku,
    label: variant.label || variant.unit,
    unit: variant.unit,
    mrp: Number(variant.mrp || 0),
    price: Number(variant.price ?? variant.sellingPrice ?? 0),
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

export async function bulkImportAdminProducts(csv: string) {
  const data = await requestApi<{ summary: { totalRows: number; validRows: number; invalidRows: number; created: number; updated: number; errors: { row: number; errors: string[] }[] } }>("/api/admin/products/bulk-import", {
    method: "POST",
    body: JSON.stringify({ csv }),
  });
  return data.summary;
}

export async function bulkImportAdminProductFile(file: File) {
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read import file."));
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.readAsDataURL(file);
  });
  const data = await requestApi<{ summary: { totalRows: number; validRows: number; invalidRows: number; created: number; updated: number; errors: { row: number; errors: string[] }[] } }>("/api/admin/products/bulk-import", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, contentBase64 }),
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
