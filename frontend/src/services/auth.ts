"use client";

import { requestApi } from "./api";

export type CustomerSession = { id: string; name: string; email: string; phone?: string | null; status?: string; createdAt?: string; updatedAt?: string };
export type AdminSession = { id: string; name: string; email: string; status?: string; role?: { id?: string; name: string; permissions?: unknown }; createdAt?: string; updatedAt?: string };

export async function getCustomerMe() {
  const data = await requestApi<{ user: CustomerSession }>("/api/auth/me");
  return data.user;
}

export async function loginCustomer(input: { email: string; password: string }) {
  const data = await requestApi<{ user: CustomerSession }>("/api/auth/login", { method: "POST", body: JSON.stringify(input) });
  return data.user;
}

export async function registerCustomer(input: { name: string; email: string; phone?: string; password: string }) {
  const data = await requestApi<{ user: CustomerSession }>("/api/auth/register", { method: "POST", body: JSON.stringify(input) });
  return data.user;
}

export async function updateCustomerProfile(input: { name?: string; phone?: string }) {
  const data = await requestApi<{ user: CustomerSession }>("/api/auth/profile", { method: "PATCH", body: JSON.stringify(input) });
  return data.user;
}

export async function resetCustomerProfile() {
  const data = await requestApi<{ user: CustomerSession }>("/api/auth/profile/reset", { method: "POST" });
  return data.user;
}

export async function logoutCustomer() {
  await requestApi<{ loggedOut: boolean }>("/api/auth/logout", { method: "POST" });
}

export async function getAdminMe() {
  const data = await requestApi<{ admin: AdminSession }>("/api/admin/auth/me");
  return data.admin;
}

export async function loginAdmin(input: { email: string; password: string }) {
  const data = await requestApi<{ admin: AdminSession }>("/api/admin/auth/login", { method: "POST", body: JSON.stringify(input) });
  return data.admin;
}

export async function updateAdminProfile(input: { name?: string }) {
  const data = await requestApi<{ admin: AdminSession }>("/api/admin/auth/profile", { method: "PATCH", body: JSON.stringify(input) });
  return data.admin;
}

export async function resetAdminProfile() {
  const data = await requestApi<{ admin: AdminSession }>("/api/admin/auth/profile/reset", { method: "POST" });
  return data.admin;
}

export async function logoutAdmin() {
  await requestApi<{ loggedOut: boolean }>("/api/admin/auth/logout", { method: "POST" });
}
