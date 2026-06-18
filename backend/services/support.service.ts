import { Prisma, SupportTicketStatus } from "@prisma/client";
import { db } from "../lib/db.js";

const ticketInclude = {
  user: { select: { id: true, name: true, email: true, phone: true } },
  order: { select: { id: true, orderNumber: true, status: true, paymentStatus: true, grandTotal: true } },
  assignedAdmin: { select: { id: true, name: true, email: true } },
  resolvedAdmin: { select: { id: true, name: true, email: true } },
};

function decimal(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

function ticketNumber() {
  return `SUP-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function statusLabel(status: SupportTicketStatus) {
  const labels: Record<SupportTicketStatus, string> = {
    OPEN: "Open",
    IN_PROGRESS: "In Progress",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
  };
  return labels[status];
}

export function mapSupportTicket(ticket: any) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    customerName: ticket.name,
    name: ticket.name,
    email: ticket.email,
    phone: ticket.phone,
    category: ticket.category,
    subject: ticket.subject,
    message: ticket.message,
    adminNote: ticket.adminNote,
    resolution: ticket.resolution,
    status: statusLabel(ticket.status),
    rawStatus: ticket.status,
    priority: ticket.priority,
    orderNumber: ticket.order?.orderNumber,
    order: ticket.order ? {
      id: ticket.order.id,
      orderNumber: ticket.order.orderNumber,
      status: ticket.order.status,
      paymentStatus: ticket.order.paymentStatus,
      grandTotal: decimal(ticket.order.grandTotal),
    } : null,
    assignedAdmin: ticket.assignedAdmin,
    resolvedAdmin: ticket.resolvedAdmin,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
  };
}

export async function createSupportTicket(userId: string | null, input: any) {
  const order = input.orderNumber
    ? await db.order.findFirst({ where: { orderNumber: input.orderNumber, ...(userId ? { userId } : {}) } })
    : null;
  const user = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
  const ticket = await db.supportTicket.create({
    data: {
      ticketNumber: ticketNumber(),
      userId,
      orderId: order?.id,
      name: input.name || user?.name || "Customer",
      email: input.email || user?.email,
      phone: input.phone || user?.phone,
      category: input.category,
      subject: input.subject,
      message: input.message,
      priority: input.priority,
    },
    include: ticketInclude,
  });
  return mapSupportTicket(ticket);
}

export async function listCustomerSupportTickets(userId: string) {
  const rows = await db.supportTicket.findMany({
    where: { userId },
    include: ticketInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapSupportTicket);
}

export async function listAdminSupportTickets(query: { status?: string; priority?: string; q?: string }) {
  const where: Prisma.SupportTicketWhereInput = {};
  if (query.status) where.status = query.status as any;
  if (query.priority) where.priority = query.priority as any;
  if (query.q) {
    where.OR = [
      { ticketNumber: { contains: query.q } },
      { name: { contains: query.q } },
      { email: { contains: query.q } },
      { phone: { contains: query.q } },
      { subject: { contains: query.q } },
      { order: { orderNumber: { contains: query.q } } },
    ];
  }
  const rows = await db.supportTicket.findMany({ where, include: ticketInclude, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  return rows.map(mapSupportTicket);
}

export async function getAdminSupportTicket(id: string) {
  const ticket = await db.supportTicket.findFirst({ where: { OR: [{ id }, { ticketNumber: id }] }, include: ticketInclude });
  if (!ticket) throw new Error("Support ticket not found.");
  return mapSupportTicket(ticket);
}

export async function updateAdminSupportTicket(id: string, adminId: string, input: any) {
  const existing = await db.supportTicket.findFirst({ where: { OR: [{ id }, { ticketNumber: id }] } });
  if (!existing) throw new Error("Support ticket not found.");
  const status = input.status ?? existing.status;
  const now = new Date();
  const ticket = await db.supportTicket.update({
    where: { id: existing.id },
    data: {
      status,
      priority: input.priority,
      assignedAdminId: input.assignedAdminId === undefined ? existing.assignedAdminId : input.assignedAdminId || null,
      adminNote: input.adminNote === undefined ? existing.adminNote : input.adminNote || null,
      resolution: input.resolution === undefined ? existing.resolution : input.resolution || null,
      resolvedAdminId: status === SupportTicketStatus.RESOLVED || status === SupportTicketStatus.CLOSED ? adminId : existing.resolvedAdminId,
      resolvedAt: status === SupportTicketStatus.RESOLVED && !existing.resolvedAt ? now : existing.resolvedAt,
      closedAt: status === SupportTicketStatus.CLOSED && !existing.closedAt ? now : existing.closedAt,
    },
    include: ticketInclude,
  });
  return mapSupportTicket(ticket);
}
