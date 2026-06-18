"use client";

import { requestApi } from "./api";

export type AdminReturn = {
  id: string;
  reason: string;
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "COMPLETED";
  createdAt: string;
  updatedAt: string;
  user?: { name?: string; email?: string; phone?: string };
  order?: { orderNumber: string; grandTotal: string | number; paymentStatus: string; status: string };
  orderItem?: { nameSnapshot?: string; quantity?: number; product?: { name?: string; sku?: string } };
  bankAccountHolder?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  refunds?: { id: string; amount: string | number; status: "REQUESTED" | "PROCESSING" | "COMPLETED" | "REJECTED"; providerRefundId?: string | null; createdAt?: string; updatedAt?: string }[];
};

export type AdminReview = {
  id: string;
  rating: number;
  comment?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
  user?: { name?: string; email?: string; phone?: string };
  product?: { name?: string; sku?: string };
};

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
  role: { id: string; name: string };
};

export type AdminRoleRow = {
  id: string;
  name: string;
  permissions: unknown;
};

export type AdminReport = {
  summary: Record<string, number>;
  productSales: { name: string; units: number; amount: number }[];
  categorySales: { name: string; units: number; amount: number }[];
  paymentSplit: { name: string; count: number }[];
  deliveryStaff: { id: string; name: string; phone: string; assignments: number; delivered?: number; pending?: number; failed?: number }[];
};

export async function fetchAdminReturns(filters?: { q?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.q) params.set("q", filters.q);
  if (filters?.status) params.set("status", filters.status);
  const data = await requestApi<{ returns: AdminReturn[] }>(`/api/admin/returns${params.size ? `?${params}` : ""}`);
  return data.returns;
}

export async function updateAdminReturnStatus(id: string, status: AdminReturn["status"]) {
  const data = await requestApi<{ return: AdminReturn }>(`/api/admin/returns/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  return data.return;
}

export async function updateAdminReturnRefund(id: string, input: { amount?: number; status: "REQUESTED" | "PROCESSING" | "COMPLETED" | "REJECTED" }) {
  const data = await requestApi<{ return: AdminReturn }>(`/api/admin/returns/${encodeURIComponent(id)}/refund`, { method: "PATCH", body: JSON.stringify(input) });
  return data.return;
}

export async function fetchAdminReviews(filters?: { q?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.q) params.set("q", filters.q);
  if (filters?.status) params.set("status", filters.status);
  const data = await requestApi<{ reviews: AdminReview[] }>(`/api/admin/reviews${params.size ? `?${params}` : ""}`);
  return data.reviews;
}

export async function updateAdminReviewStatus(id: string, status: AdminReview["status"]) {
  const data = await requestApi<{ review: AdminReview }>(`/api/admin/reviews/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  return data.review;
}

export async function fetchAdminUsers() {
  const data = await requestApi<{ users: AdminUserRow[] }>("/api/admin/users");
  return data.users;
}

export async function fetchAdminRoles() {
  const data = await requestApi<{ roles: AdminRoleRow[] }>("/api/admin/roles");
  return data.roles;
}

export async function updateAdminUser(id: string, input: { status?: AdminUserRow["status"]; roleId?: string }) {
  const data = await requestApi<{ user: AdminUserRow }>(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
  return data.user;
}

export async function fetchAdminSettings() {
  const data = await requestApi<{ settings: { key: string; value: string; type: string; updatedAt: string }[] }>("/api/admin/settings");
  return data.settings;
}

export async function updateAdminSettings(settings: Record<string, string>) {
  const data = await requestApi<{ settings: { key: string; value: string; type: string; updatedAt: string }[] }>("/api/admin/settings", { method: "PATCH", body: JSON.stringify(settings) });
  return data.settings;
}

export async function resetAdminSettings() {
  const data = await requestApi<{ settings: { key: string; value: string; type: string; updatedAt: string }[] }>("/api/admin/settings/reset", { method: "POST" });
  return data.settings;
}

export async function fetchAdminReports() {
  const data = await requestApi<AdminReport>("/api/admin/reports");
  return data;
}
