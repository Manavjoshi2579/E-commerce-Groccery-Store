import { CouponType } from "@prisma/client";
import { z } from "zod";

export const addCartItemSchema = z.object({
  productId: z.string().min(8),
  variantId: z.string().min(8).optional(),
  quantity: z.coerce.number().int().positive().default(1),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0),
});

export const couponValidateSchema = z.object({
  code: z.string().trim().min(2).max(50).transform((value) => value.toUpperCase()),
});

export const adminCouponSchema = z.object({
  code: z.string().trim().min(2).max(50).transform((value) => value.toUpperCase()),
  title: z.string().trim().min(2).max(160),
  type: z.nativeEnum(CouponType),
  value: z.coerce.number().nonnegative(),
  minOrderAmount: z.coerce.number().nonnegative().default(0),
  maxDiscount: z.coerce.number().nonnegative().optional().nullable(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
  perUserLimit: z.coerce.number().int().positive().optional().nullable(),
  active: z.coerce.boolean().default(true),
});
