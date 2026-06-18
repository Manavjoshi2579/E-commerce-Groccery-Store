import { CouponType } from "@prisma/client";
import { z } from "zod";

export const addCartItemSchema = z.object({
  productId: z.string().min(8),
  variantId: z.string().min(8).optional(),
  quantity: z.coerce.number().int().positive().default(1),
  customUnit: z.string().trim().min(1).max(40).optional(),
  customPrice: z.coerce.number().positive().optional(),
  customMrp: z.coerce.number().positive().optional(),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0),
});

export const couponValidateSchema = z.object({
  code: z.string().trim().min(2).max(50).transform((value) => value.toUpperCase()),
});

const adminCouponBaseSchema = z.object({
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

function refineCoupon(value: Partial<z.infer<typeof adminCouponBaseSchema>>, context: z.RefinementCtx) {
  if (value.endAt && value.startAt && value.endAt <= value.startAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endAt"], message: "Coupon end date must be after start date." });
  }
  if (value.type === CouponType.PERCENTAGE && value.value != null && value.value > 95) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Percentage coupon value must be 95 or less." });
  }
}

export const adminCouponSchema = adminCouponBaseSchema.superRefine(refineCoupon);

export const adminCouponUpdateSchema = adminCouponBaseSchema.partial().superRefine(refineCoupon);
