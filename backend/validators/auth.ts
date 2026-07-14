import { z } from "zod";
import { emailSchema, phoneSchema } from "./common.js";

const weakPasswords = ["password", "password123", "12345678", "qwerty123", "eaglemart", "welcome123"];

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeIndianMobile(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

export function customerPasswordIssues(password: string) {
  const lower = password.toLowerCase();
  const issues: string[] = [];
  if (password.length < 8) issues.push("Use at least 8 characters.");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) issues.push("Use letters and numbers.");
  if (weakPasswords.includes(lower)) issues.push("Choose a less common password.");
  return issues;
}

export function adminPasswordIssues(password: string) {
  const issues: string[] = [];
  if (password.length < 12) issues.push("Use at least 12 characters.");
  if (!/[A-Z]/.test(password)) issues.push("Add an uppercase letter.");
  if (!/[a-z]/.test(password)) issues.push("Add a lowercase letter.");
  if (!/\d/.test(password)) issues.push("Add a number.");
  if (!/[^A-Za-z0-9]/.test(password)) issues.push("Add a symbol.");
  return issues;
}

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: emailSchema.transform(normalizeEmail),
  phone: z.string().transform(normalizeIndianMobile).pipe(phoneSchema),
  password: z.string().refine((value) => customerPasswordIssues(value).length === 0, "Password is too weak"),
  terms: z.boolean().optional(),
  turnstileToken: z.string().optional(),
});

export const loginSchema = z.object({
  email: emailSchema.transform(normalizeEmail),
  password: z.string().min(1, "Password is required"),
  turnstileToken: z.string().optional(),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).optional(),
  phone: phoneSchema.optional(),
});

export const adminProfileSchema = z.object({
  name: z.string().trim().min(2).optional(),
});

export const forgotPasswordSchema = z.object({
  channel: z.enum(["email", "sms"]),
  email: emailSchema.transform(normalizeEmail).optional(),
  phone: z.string().transform(normalizeIndianMobile).pipe(phoneSchema).optional(),
  turnstileToken: z.string().optional(),
});

export const verifyOtpSchema = z.object({
  phone: z.string().transform(normalizeIndianMobile).pipe(phoneSchema),
  otp: z.string().regex(/^\d{6}$/),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).optional(),
  grant: z.string().min(20).optional(),
  password: z.string().min(1),
  confirmPassword: z.string().min(1),
}).refine((value) => value.token || value.grant, "Reset token is required").refine((value) => value.password === value.confirmPassword, "Passwords do not match");

export const adminMfaVerifySchema = z.object({
  challengeId: z.string().min(8),
  code: z.string().regex(/^\d{6}$|^[A-Z0-9-]{8,}$/i),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  password: z.string().min(1),
  confirmPassword: z.string().min(1),
  mfaCode: z.string().optional(),
}).refine((value) => value.password === value.confirmPassword, "Passwords do not match");
