import { z } from "zod";

export const razorpayCreateOrderSchema = z.object({
  addressId: z.string().min(8),
  deliverySlotId: z.string().min(8),
  deliveryDate: z.coerce.date().optional(),
  couponCode: z.string().trim().max(40).optional(),
  notes: z.record(z.string(), z.string()).optional(),
});

export const razorpayVerifySchema = z.object({
  orderNumber: z.string().min(4),
  razorpay_order_id: z.string().min(4),
  razorpay_payment_id: z.string().min(4),
  razorpay_signature: z.string().min(10),
});

export const razorpayFailedSchema = z.object({
  orderNumber: z.string().min(4),
  razorpay_order_id: z.string().min(4).optional(),
  errorCode: z.string().max(120).optional(),
  errorDescription: z.string().max(300).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
