"use client";

import { categories as seedCategories } from "@/data/categories";
import { products as seedProducts } from "@/data/products";
import type { Category, Product } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const productFallback = "/assets/placeholders/product-placeholder.svg";
const categoryFallback = "/assets/placeholders/category-placeholder.svg";

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  if (typeof window !== "undefined") {
    const downUntil = Number(sessionStorage.getItem("ec-api-down-until") || 0);
    if (downUntil > Date.now()) throw new Error("API temporarily unavailable");
  }
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const body = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok || !body.ok) throw new Error(body.ok ? "API request failed" : body.error.message);
    return body.data;
  } catch (error) {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("ec-api-down-until", String(Date.now() + 15_000));
    }
    throw error;
  }
}

function asset(value: string | undefined, fallback: string) {
  return value && value.trim() ? value : fallback;
}

export function mapApiProduct(input: any): Product {
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
    unit: input.unit || input.variants?.[0]?.unit || "",
    mrp: Number(input.mrp || 0),
    price: Number(input.price ?? input.sellingPrice ?? 0),
    gst: Number(input.gst ?? input.taxPercentage ?? 0),
    rating: Number(input.rating ?? input.ratingAvg ?? 0),
    reviews: Number(input.reviews ?? input.reviewCount ?? 0),
    stock: Number(input.stock ?? 0),
    lowStock: Number(input.lowStock ?? 10),
    image: asset(input.image, productFallback),
    images: input.images,
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
  try {
    const data = await requestApi<{ categories: any[] }>("/api/categories");
    return data.categories.map(mapApiCategory);
  } catch {
    return seedCategories;
  }
}

export async function fetchBrands() {
  try {
    const data = await requestApi<{ brands: any[] }>("/api/brands");
    return data.brands.map((brand) => ({ id: brand.id, slug: brand.slug, name: brand.name, logo: asset(brand.logo, categoryFallback) }));
  } catch {
    return [];
  }
}

export async function fetchProducts(params: Record<string, string | number | boolean | undefined> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  try {
    const data = await requestApi<{ products: any[]; pagination: any; filters: any }>(`/api/products${search.size ? `?${search}` : ""}`);
    return { products: data.products.map(mapApiProduct), pagination: data.pagination, filters: data.filters, source: "api" as const };
  } catch {
    return { products: seedProducts, pagination: { page: 1, limit: seedProducts.length, total: seedProducts.length, totalPages: 1 }, filters: {}, source: "fallback" as const };
  }
}

export async function fetchProduct(slug: string) {
  try {
    const data = await requestApi<{ product: any }>(`/api/products/${slug}`);
    return mapApiProduct(data.product);
  } catch {
    return seedProducts.find((product) => product.slug === slug) || seedProducts[0];
  }
}

export async function fetchAdminProducts() {
  const data = await requestApi<{ products: any[] }>("/api/admin/products?limit=60");
  return data.products.map(mapApiProduct);
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

function toAdminPayload(product: Product) {
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
    variant: {
      label: "Default",
      unit: product.unit,
      mrp: product.mrp,
      price: product.price,
    },
    inventory: {
      stock: product.stock,
      lowStockThreshold: product.lowStock,
    },
  };
}
