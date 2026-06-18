"use client";

import type { FAQ } from "@/types";
import { requestApi } from "./api";

export const faqCategories = [
  "Orders",
  "Payments",
  "Delivery",
  "Returns & Refunds",
  "Account",
  "Products",
  "Coupons & Offers",
  "Invoices & GST",
  "Membership & Rewards",
  "General",
] as const;

export type FAQPayload = Pick<FAQ, "question" | "answer" | "category" | "displayOrder" | "isActive">;

function mapFaq(input: any): FAQ {
  return {
    id: input.id,
    question: input.question,
    answer: input.answer,
    category: input.category,
    displayOrder: Number(input.displayOrder || 0),
    isActive: Boolean(input.isActive),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function query(params: Record<string, string | boolean | undefined> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  return search.size ? `?${search}` : "";
}

export async function fetchFaqs(params: { q?: string; category?: string } = {}) {
  const data = await requestApi<{ faqs: any[] }>(`/api/faqs${query(params)}`);
  return data.faqs.map(mapFaq);
}

export async function fetchAdminFaqs(params: { q?: string; category?: string } = {}) {
  const data = await requestApi<{ faqs: any[] }>(`/api/admin/faqs${query(params)}`);
  return data.faqs.map(mapFaq);
}

export async function createAdminFaq(payload: FAQPayload) {
  const data = await requestApi<{ faq: any }>("/api/admin/faqs", { method: "POST", body: JSON.stringify(payload) });
  return mapFaq(data.faq);
}

export async function updateAdminFaq(id: string, payload: Partial<FAQPayload>) {
  const data = await requestApi<{ faq: any }>(`/api/admin/faqs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
  return mapFaq(data.faq);
}

export async function deleteAdminFaq(id: string) {
  await requestApi<{ deleted: boolean }>(`/api/admin/faqs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function bulkUpdateAdminFaqStatus(ids: string[], isActive: boolean) {
  const data = await requestApi<{ faqs: any[] }>("/api/admin/faqs/bulk-status", { method: "PATCH", body: JSON.stringify({ ids, isActive }) });
  return data.faqs.map(mapFaq);
}
