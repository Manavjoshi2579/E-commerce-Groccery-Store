"use client";

import type { SupportTicket } from "@/types";
import { requestApi } from "./api";

export type SupportTicketInput = {
  name: string;
  email?: string;
  phone?: string;
  orderNumber?: string;
  category: string;
  subject: string;
  message: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
};

function mapTicket(input: any): SupportTicket {
  return {
    id: input.id,
    ticketNumber: input.ticketNumber,
    customerName: input.customerName ?? input.name,
    name: input.name ?? input.customerName,
    email: input.email,
    phone: input.phone,
    category: input.category,
    subject: input.subject,
    message: input.message,
    adminNote: input.adminNote,
    resolution: input.resolution,
    status: input.status,
    rawStatus: input.rawStatus,
    priority: input.priority,
    orderNumber: input.orderNumber,
    assignedAdmin: input.assignedAdmin,
    resolvedAdmin: input.resolvedAdmin,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    resolvedAt: input.resolvedAt,
    closedAt: input.closedAt,
  };
}

export async function fetchSupportTickets() {
  const data = await requestApi<{ tickets: any[] }>("/api/support/tickets");
  return data.tickets.map(mapTicket);
}

export async function createSupportTicket(input: SupportTicketInput) {
  const data = await requestApi<{ ticket: any }>("/api/support/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapTicket(data.ticket);
}

export async function fetchAdminSupportTickets(params: Record<string, string> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const data = await requestApi<{ tickets: any[] }>(`/api/admin/support/tickets${search.size ? `?${search}` : ""}`);
  return data.tickets.map(mapTicket);
}

export async function updateAdminSupportTicket(id: string, input: { status?: string; priority?: string; assignedAdminId?: string | null; adminNote?: string | null; resolution?: string | null }) {
  const data = await requestApi<{ ticket: any }>(`/api/admin/support/tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return mapTicket(data.ticket);
}
