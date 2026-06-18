import { ProductStatus } from "@prisma/client";
import { z } from "zod";

const slugSchema = z.string().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a lowercase URL slug");

export const productListQuerySchema = z.object({
  q: z.string().trim().optional(),
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  discount: z.coerce.number().min(0).max(95).optional(),
  availability: z.enum(["in_stock", "out_of_stock", "low_stock"]).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  organic: z.coerce.boolean().optional(),
  local: z.coerce.boolean().optional(),
  sort: z.enum(["popular", "newest", "price_asc", "price_desc", "discount"]).default("popular"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  image: z.string().trim().optional(),
  status: z.nativeEnum(ProductStatus).default(ProductStatus.ACTIVE),
  sortOrder: z.coerce.number().int().default(0),
  parentId: z.string().trim().optional().nullable(),
});

export const brandSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  logo: z.string().trim().optional(),
  status: z.nativeEnum(ProductStatus).default(ProductStatus.ACTIVE),
});

export const variantSchema = z.object({
  id: z.string().optional(),
  sku: z.string().trim().min(2).max(80).optional(),
  label: z.string().trim().min(1).max(80).default("Default"),
  unit: z.string().trim().min(1).max(40),
  mrp: z.coerce.number().positive(),
  price: z.coerce.number().positive(),
  status: z.nativeEnum(ProductStatus).default(ProductStatus.ACTIVE),
  active: z.coerce.boolean().optional(),
  isDefault: z.coerce.boolean().optional(),
  stock: z.coerce.number().int().min(0).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
});

export const inventorySchema = z.object({
  stock: z.coerce.number().int().min(0).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(10),
});

const productBaseSchema = z.object({
  name: z.string().trim().min(2).max(180),
  slug: slugSchema.optional(),
  sku: z.string().trim().min(2).max(80),
  categoryId: z.string().trim().min(8).optional(),
  categorySlug: z.string().trim().optional(),
  category: z.string().trim().optional(),
  brandId: z.string().trim().min(8).optional(),
  brandSlug: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  description: z.string().trim().min(5),
  gst: z.coerce.number().min(0).max(99).default(5),
  tags: z.array(z.string().trim().min(1)).default([]),
  featured: z.coerce.boolean().default(false),
  organic: z.coerce.boolean().default(false),
  local: z.coerce.boolean().default(false),
  status: z.nativeEnum(ProductStatus).default(ProductStatus.ACTIVE),
  image: z.string().trim().optional(),
  variant: variantSchema.optional(),
  variants: z.array(variantSchema).min(1).optional(),
  inventory: inventorySchema.default({ stock: 0, lowStockThreshold: 10 }),
});

export const productSchema = productBaseSchema.superRefine((value, context) => {
  if (!value.variant && !value.variants?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["variants"], message: "At least one product variant is required." });
  }
});

export const productUpdateSchema = productBaseSchema.partial().extend({
  tags: z.array(z.string().trim().min(1)).optional(),
  variant: variantSchema.partial().optional(),
  variants: z.array(variantSchema).min(1).optional(),
  inventory: inventorySchema.partial().optional(),
});
