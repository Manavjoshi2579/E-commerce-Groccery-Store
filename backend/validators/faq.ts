import { z } from "zod";

export const faqCategories = [
  "Orders",
  "Payments",
  "Delivery",
  "Returns & Refunds",
  "Account",
  "Products",
  "Coupons & Offers",
  "Invoices & GST",
  "Membership & Rewards",
  "General",
] as const;

export const faqQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: z.enum(faqCategories).optional(),
  includeInactive: z.coerce.boolean().optional(),
});

export const faqSchema = z.object({
  question: z.string().trim().min(5).max(220),
  answer: z.string().trim().min(10).max(2000),
  category: z.enum(faqCategories),
  displayOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
});

export const faqBulkStatusSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1),
  isActive: z.coerce.boolean(),
});
