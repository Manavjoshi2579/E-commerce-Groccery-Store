import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { phoneSchema, pincodeSchema } from "./common.js";

export const addressSchema = z.object({
  label: z.string().trim().min(2).max(40).default("Home"),
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  line: z.string().trim().min(5).max(240),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80).optional().default("Gujarat"),
  pincode: pincodeSchema,
  landmark: z.string().trim().max(160).optional().nullable(),
  isDefault: z.coerce.boolean().default(false),
});

export const checkoutSelectionSchema = z.object({
  addressId: z.string().min(8),
  deliverySlotId: z.string().min(8),
  deliveryDate: z.coerce.date(),
});

export const pincodeQuerySchema = z.object({
  pincode: pincodeSchema,
});

export const slotQuerySchema = z.object({
  pincode: pincodeSchema,
  date: z.coerce.date(),
});

export const reverseGeocodeQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(180).optional(),
});

export const returnRequestSchema = z.object({
  orderItemId: z.string().min(8).optional().nullable(),
  reason: z.string().trim().min(10).max(500),
  bankAccountHolder: z.string().trim().min(2).max(120),
  bankName: z.string().trim().min(2).max(120),
  bankAccountNumber: z.string().trim().regex(/^\d{9,18}$/, "Enter a valid bank account number"),
  bankIfsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC code"),
});

export const adminOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

export const assignDeliverySchema = z.object({
  deliveryStaffId: z.string().min(8),
});

export const deliveryStaffSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  zoneId: z.string().min(8).optional().nullable(),
});

export const inventoryPatchSchema = z.object({
  stock: z.coerce.number().int().min(0).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
});

export const inventoryAdjustSchema = z.object({
  quantity: z.coerce.number().int(),
  note: z.string().trim().max(180).optional(),
});
