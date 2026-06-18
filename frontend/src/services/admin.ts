"use client";

import type { AdminCustomer } from "@/types";
import { requestApi } from "./api";

export function mapAdminCustomer(input: any): AdminCustomer {
  return {
    id: input.id,
    name: input.name,
    email: input.email,
    phone: input.phone,
    status: input.status,
    orderCount: Number(input.orderCount || 0),
    totalSpent: Number(input.totalSpent || 0),
    addressCount: Number(input.addressCount || 0),
    reviewCount: Number(input.reviewCount || 0),
    supportTicketCount: Number(input.supportTicketCount || 0),
    lastOrderAt: input.lastOrderAt,
    deletedAt: input.deletedAt,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export async function fetchAdminCustomers(query?: string) {
  const search = query?.trim();
  const suffix = search ? `?q=${encodeURIComponent(search)}` : "";
  const data = await requestApi<{ customers: any[] }>(`/api/admin/customers${suffix}`);
  return data.customers.map(mapAdminCustomer);
}

export async function updateAdminCustomerStatus(id: string, status: AdminCustomer["status"]) {
  const data = await requestApi<{ customer: any }>(`/api/admin/customers/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return mapAdminCustomer(data.customer);
}

export async function deleteAdminCustomer(id: string) {
  await requestApi<{ deleted: boolean }>(`/api/admin/customers/${id}`, { method: "DELETE" });
}
