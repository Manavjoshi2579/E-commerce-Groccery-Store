"use client";

import { requestApi } from "./api";

export type CustomerSession = { id: string; name: string; email: string; phone?: string | null; status?: string; createdAt?: string; updatedAt?: string };
export type AdminSession = { id: string; name: string; email: string; status?: string; role?: { id?: string; name: string; permissions?: unknown }; createdAt?: string; updatedAt?: string };
export type AuthProviderConfig = { google: boolean; apple: boolean; email: boolean; sms: boolean; turnstile: boolean; redis: boolean };

export async function getCustomerMe() {
  const data = await requestApi<{ user: CustomerSession }>("/api/auth/me");
  return data.user;
}

export async function getAuthConfig() {
  const data = await requestApi<{ providers: AuthProviderConfig }>("/api/auth/config");
  return data.providers;
}

export async function loginCustomer(input: { email: string; password: string }) {
  const data = await requestApi<{ user: CustomerSession }>("/api/auth/login", { method: "POST", body: JSON.stringify(input) });
  return data.user;
}

export async function registerCustomer(input: { name: string; email: string; phone: string; password: string; terms?: boolean }) {
  const data = await requestApi<{ user: CustomerSession }>("/api/auth/register", { method: "POST", body: JSON.stringify(input) });
  return data.user;
}

export async function forgotCustomerPassword(input: { channel: "email" | "sms"; email?: string; phone?: string }) {
  return requestApi<{ message: string; providerConfigured: boolean; resendAfterSeconds?: number }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify(input) });
}

export async function verifyCustomerResetOtp(input: { phone: string; otp: string }) {
  return requestApi<{ grant: string }>("/api/auth/forgot-password/verify-otp", { method: "POST", body: JSON.stringify(input) });
}

export async function resetCustomerPassword(input: { token?: string; grant?: string; password: string; confirmPassword: string }) {
  return requestApi<{ reset: boolean }>("/api/auth/reset-password", { method: "POST", body: JSON.stringify(input) });
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
  return requestApi<{ admin?: AdminSession; mfaRequired?: boolean; challengeId?: string }>("/api/admin/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export async function verifyAdminMfa(input: { challengeId: string; code: string }) {
  const data = await requestApi<{ admin: AdminSession }>("/api/admin/auth/mfa/verify", { method: "POST", body: JSON.stringify(input) });
  return data.admin;
}

export async function changeAdminPassword(input: { currentPassword: string; password: string; confirmPassword: string; mfaCode?: string }) {
  return requestApi<{ changed: boolean }>("/api/admin/auth/password/change", { method: "POST", body: JSON.stringify(input) });
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
