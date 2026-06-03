"use client";

import type { CartItem, Coupon, Product } from "@/types";
import { mapApiProduct } from "./catalog";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
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
}

export type CartSummary = {
  cartId: string;
  items: CartItem[];
  products: Product[];
  subtotal: number;
  discount: number;
  couponDiscount: number;
  tax: number;
  deliveryCharge: number;
  handlingCharge: number;
  total: number;
  appliedCoupon: Coupon | null;
  itemCount: number;
};

export function mapCoupon(input: any): Coupon {
  return {
    id: input.id,
    code: input.code,
    title: input.title,
    type: input.type,
    discountType: input.discountType || (input.type === "FIXED" ? "flat" : input.type === "PERCENTAGE" ? "percent" : "shipping"),
    value: Number(input.value || 0),
    minOrder: Number(input.minOrder ?? input.minOrderAmount ?? 0),
    minOrderAmount: Number(input.minOrderAmount ?? input.minOrder ?? 0),
    maxDiscount: input.maxDiscount == null ? undefined : Number(input.maxDiscount),
    startAt: input.startAt,
    endAt: input.endAt,
    usageLimit: input.usageLimit,
    perUserLimit: input.perUserLimit,
    active: Boolean(input.active ?? true),
  };
}

function mapCart(input: any): CartSummary {
  const products = (input.items || []).map((item: any) => mapApiProduct(item.product));
  return {
    cartId: input.cartId,
    items: (input.items || []).map((item: any) => ({ id: item.id, productId: item.productId, variantId: item.variantId, qty: item.qty ?? item.quantity })),
    products,
    subtotal: Number(input.subtotal || 0),
    discount: Number(input.discount || 0),
    couponDiscount: Number(input.couponDiscount || 0),
    tax: Number(input.tax ?? input.gst ?? 0),
    deliveryCharge: Number(input.deliveryCharge ?? input.delivery ?? 0),
    handlingCharge: Number(input.handlingCharge ?? input.handling ?? 0),
    total: Number(input.total || 0),
    appliedCoupon: input.appliedCoupon ? mapCoupon(input.appliedCoupon) : null,
    itemCount: Number(input.itemCount || 0),
  };
}

export async function getBackendCart() {
  const data = await requestApi<{ cart: any }>("/api/cart");
  return mapCart(data.cart);
}

export async function addBackendCartItem(productId: string, quantity = 1, variantId?: string) {
  const data = await requestApi<{ cart: any }>("/api/cart/items", {
    method: "POST",
    body: JSON.stringify({ productId, variantId, quantity }),
  });
  return mapCart(data.cart);
}

export async function updateBackendCartItem(itemId: string, quantity: number) {
  const data = await requestApi<{ cart: any }>(`/api/cart/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
  });
  return mapCart(data.cart);
}

export async function removeBackendCartItem(itemId: string) {
  const data = await requestApi<{ cart: any }>(`/api/cart/items/${itemId}`, { method: "DELETE" });
  return mapCart(data.cart);
}

export async function clearBackendCart() {
  const data = await requestApi<{ cart: any }>("/api/cart", { method: "DELETE" });
  return mapCart(data.cart);
}

export async function applyBackendCoupon(code: string) {
  const data = await requestApi<{ valid: boolean; message: string; cart: any; coupon: any; discountAmount: number }>("/api/coupons/validate", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  return { ...data, cart: mapCart(data.cart), coupon: data.coupon ? mapCoupon(data.coupon) : null };
}

export async function getBackendWishlist() {
  const data = await requestApi<{ wishlist: any }>("/api/wishlist");
  return {
    items: (data.wishlist.items || []).map((item: any) => ({ id: item.id, productId: item.productId, product: mapApiProduct(item.product) })),
    itemCount: Number(data.wishlist.itemCount || 0),
  };
}

export async function addBackendWishlistItem(productId: string) {
  const data = await requestApi<{ wishlist: any }>("/api/wishlist/items", {
    method: "POST",
    body: JSON.stringify({ productId }),
  });
  return {
    items: (data.wishlist.items || []).map((item: any) => ({ id: item.id, productId: item.productId, product: mapApiProduct(item.product) })),
    itemCount: Number(data.wishlist.itemCount || 0),
  };
}

export async function removeBackendWishlistItem(productOrItemId: string) {
  const data = await requestApi<{ wishlist: any }>(`/api/wishlist/items/${productOrItemId}`, { method: "DELETE" });
  return {
    items: (data.wishlist.items || []).map((item: any) => ({ id: item.id, productId: item.productId, product: mapApiProduct(item.product) })),
    itemCount: Number(data.wishlist.itemCount || 0),
  };
}

export async function moveBackendWishlistToCart(productOrItemId: string) {
  const data = await requestApi<{ wishlist: any; cart: any }>(`/api/wishlist/items/${productOrItemId}/move-to-cart`, { method: "POST" });
  return {
    wishlist: {
      items: (data.wishlist.items || []).map((item: any) => ({ id: item.id, productId: item.productId, product: mapApiProduct(item.product) })),
      itemCount: Number(data.wishlist.itemCount || 0),
    },
    cart: mapCart(data.cart),
  };
}

export async function fetchAdminCoupons() {
  const data = await requestApi<{ coupons: any[] }>("/api/admin/coupons");
  return data.coupons.map(mapCoupon);
}

export async function createAdminCoupon(coupon: Coupon) {
  const data = await requestApi<{ coupon: any }>("/api/admin/coupons", {
    method: "POST",
    body: JSON.stringify(toAdminCouponPayload(coupon)),
  });
  return mapCoupon(data.coupon);
}

export async function updateAdminCoupon(coupon: Coupon) {
  const data = await requestApi<{ coupon: any }>(`/api/admin/coupons/${coupon.id}`, {
    method: "PATCH",
    body: JSON.stringify(toAdminCouponPayload(coupon)),
  });
  return mapCoupon(data.coupon);
}

export async function deleteAdminCoupon(id: string) {
  await requestApi<{ deleted: boolean }>(`/api/admin/coupons/${id}`, { method: "DELETE" });
}

function toAdminCouponPayload(coupon: Coupon) {
  const now = new Date();
  return {
    code: coupon.code,
    title: coupon.title,
    type: coupon.type || (coupon.discountType === "flat" ? "FIXED" : coupon.discountType === "percent" ? "PERCENTAGE" : "FREE_DELIVERY"),
    value: coupon.value,
    minOrderAmount: coupon.minOrderAmount ?? coupon.minOrder,
    maxDiscount: coupon.maxDiscount,
    startAt: coupon.startAt || new Date(now.getTime() - 60_000).toISOString(),
    endAt: coupon.endAt || new Date(now.getTime() + 30 * 86_400_000).toISOString(),
    usageLimit: coupon.usageLimit,
    perUserLimit: coupon.perUserLimit,
    active: coupon.active,
  };
}
