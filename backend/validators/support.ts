import { SupportTicketPriority, SupportTicketStatus } from "@prisma/client";
import { z } from "zod";

export const supportTicketSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().min(8).max(20).optional().or(z.literal("")),
  orderNumber: z.string().trim().max(80).optional().or(z.literal("")),
  category: z.enum(["Order", "Delivery", "Payment", "Refund", "Product", "Account", "Other"]).default("Order"),
  subject: z.string().trim().min(4).max(160),
  message: z.string().trim().min(10).max(3000),
  priority: z.nativeEnum(SupportTicketPriority).default(SupportTicketPriority.MEDIUM),
});

export const adminSupportTicketSchema = z.object({
  status: z.nativeEnum(SupportTicketStatus).optional(),
  priority: z.nativeEnum(SupportTicketPriority).optional(),
  assignedAdminId: z.string().trim().optional().nullable(),
  adminNote: z.string().trim().max(3000).optional().nullable(),
  resolution: z.string().trim().max(3000).optional().nullable(),
});
