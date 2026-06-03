import { z } from "zod";

export const cuidSchema = z.string().min(8);
export const emailSchema = z.string().email();
export const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, "Expected a valid 10 digit Indian mobile number");
export const pincodeSchema = z.string().regex(/^\d{6}$/, "Expected a 6 digit pincode");
export const moneySchema = z.coerce.number().nonnegative();
export const quantitySchema = z.coerce.number().int().positive();

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
