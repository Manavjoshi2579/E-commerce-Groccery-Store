import { z } from "zod";
import { emailSchema, phoneSchema } from "./common.js";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).optional(),
  phone: phoneSchema.optional(),
});

export const adminProfileSchema = z.object({
  name: z.string().trim().min(2).optional(),
});
