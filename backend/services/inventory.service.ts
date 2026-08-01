import { Prisma, RoleName, StockMovementChannel, StockMovementType } from "@prisma/client";
import { db } from "../lib/db.js";
import { mapProduct } from "./catalog.service.js";

const inventoryInclude = {
  product: {
    include: {
      category: true,
      brand: true,
      images: { orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }] },
      variants: { orderBy: { createdAt: "asc" as const } },
      inventory: true,
      reviews: { where: { status: "APPROVED" as const }, take: 8, include: { user: { select: { name: true } } } },
    },
  },
  variant: true,
};

export const inventoryRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.INVENTORY_MANAGER];

export function mapInventory(row: any) {
  const reserved = Number(row.reserved || 0);
  const available = Math.max(0, Number(row.stock || 0) - reserved);
  return {
    id: row.id,
    productId: row.productId,
    variantId: row.variantId,
    product: mapProduct(row.product),
    variant: row.variant,
    stock: available,
    onHand: row.stock,
    reserved,
    sold: row.sold || 0,
    damaged: row.damaged || 0,
    returned: row.returned || 0,
    adjustment: row.adjustment || 0,
    lowStockThreshold: row.lowStockThreshold,
    status: available <= 0 ? "Out of stock" : available <= row.lowStockThreshold ? "Low stock" : "In stock",
  };
}

type Tx = Prisma.TransactionClient;

async function movementExists(tx: Tx, idempotencyKey?: string) {
  return idempotencyKey ? tx.stockMovement.findUnique({ where: { idempotencyKey } }) : null;
}

export async function reserveInventory(tx: Tx, input: { productId: string; variantId?: string | null; quantity: number; orderId: string; actorId?: string | null; idempotencyKey?: string }) {
  if (await movementExists(tx, input.idempotencyKey)) return;
  const inventory = await tx.inventory.findFirstOrThrow({ where: { productId: input.productId, variantId: input.variantId ?? null } });
  const available = inventory.stock - inventory.reserved;
  if (available < input.quantity) throw new Error("Insufficient stock.");
  const updated = await tx.inventory.update({ where: { id: inventory.id }, data: { reserved: { increment: input.quantity } } });
  await tx.stockMovement.create({
    data: {
      inventoryId: inventory.id,
      productId: input.productId,
      variantId: input.variantId ?? null,
      type: StockMovementType.ONLINE_RESERVATION,
      channel: StockMovementChannel.ONLINE,
      quantity: input.quantity,
      quantityBefore: available,
      quantityAfter: updated.stock - updated.reserved,
      orderId: input.orderId,
      referenceType: "ORDER",
      referenceId: input.orderId,
      actorType: "CUSTOMER",
      actorId: input.actorId ?? null,
      idempotencyKey: input.idempotencyKey,
      note: "Online order stock reservation",
    },
  });
}

export async function releaseOrderReservation(tx: Tx, order: any, input: { actorType: string; actorId?: string | null; type?: StockMovementType; note?: string }) {
  for (const item of order.items) {
    const key = `${input.type ?? StockMovementType.RESERVATION_RELEASE}:${order.id}:${item.id}`;
    if (await movementExists(tx, key)) continue;
    const inventory = await tx.inventory.findFirst({ where: { productId: item.productId, variantId: item.variantId } });
    if (!inventory) continue;
    const quantity = Math.min(inventory.reserved, item.quantity);
    if (quantity <= 0) continue;
    const before = inventory.stock - inventory.reserved;
    const updated = await tx.inventory.update({ where: { id: inventory.id }, data: { reserved: { decrement: quantity } } });
    await tx.stockMovement.create({
      data: {
        inventoryId: inventory.id,
        productId: item.productId,
        variantId: item.variantId,
        type: input.type ?? StockMovementType.RESERVATION_RELEASE,
        channel: input.actorType === "CUSTOMER" ? StockMovementChannel.ONLINE : StockMovementChannel.ADMIN,
        quantity,
        quantityBefore: before,
        quantityAfter: updated.stock - updated.reserved,
        orderId: order.id,
        referenceType: "ORDER",
        referenceId: order.id,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        idempotencyKey: key,
        note: input.note ?? `Release reservation ${order.orderNumber}`,
      },
    });
  }
}

export async function finalizeOrderSale(tx: Tx, order: any, input: { actorType: string; actorId?: string | null; note?: string }) {
  for (const item of order.items) {
    const key = `${StockMovementType.ONLINE_SALE}:${order.id}:${item.id}`;
    if (await movementExists(tx, key)) continue;
    const inventory = await tx.inventory.findFirstOrThrow({ where: { productId: item.productId, variantId: item.variantId } });
    const before = inventory.stock - inventory.reserved;
    const reservedToConsume = Math.min(inventory.reserved, item.quantity);
    if (inventory.stock < item.quantity) throw new Error(`Insufficient physical stock for ${item.nameSnapshot}.`);
    const updated = await tx.inventory.update({
      where: { id: inventory.id },
      data: { stock: { decrement: item.quantity }, reserved: { decrement: reservedToConsume }, sold: { increment: item.quantity } },
    });
    const reconciledMissingReservation = reservedToConsume < item.quantity;
    await tx.stockMovement.create({
      data: {
        inventoryId: inventory.id,
        productId: item.productId,
        variantId: item.variantId,
        type: StockMovementType.ONLINE_SALE,
        channel: StockMovementChannel.ONLINE,
        quantity: item.quantity,
        quantityBefore: before,
        quantityAfter: updated.stock - updated.reserved,
        orderId: order.id,
        referenceType: "ORDER",
        referenceId: order.id,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        idempotencyKey: key,
        note: reconciledMissingReservation
          ? `${input.note ?? `Finalize sale ${order.orderNumber}`} (reconciled missing reservation: ${item.quantity - reservedToConsume})`
          : input.note ?? `Finalize sale ${order.orderNumber}`,
      },
    });
  }
}

export async function listInventory() {
  const rows = await db.inventory.findMany({ include: inventoryInclude, orderBy: { updatedAt: "desc" } });
  return rows.map(mapInventory);
}

export async function updateInventory(id: string, input: { stock?: number; lowStockThreshold?: number }) {
  const row = await db.inventory.update({ where: { id }, data: input.stock == null ? input : { ...input, adjustment: { increment: input.stock }, reserved: 0 }, include: inventoryInclude });
  return mapInventory(row);
}

export async function adjustInventory(id: string, quantity: number, adminUserId: string, note?: string) {
  const row = await db.inventory.findUniqueOrThrow({ where: { id } });
  const nextStock = row.stock + quantity;
  if (nextStock < row.reserved) throw new Error("Inventory cannot go below reserved stock.");
  const type = quantity >= 0 ? StockMovementType.RESTOCK : StockMovementType.MANUAL_ADJUSTMENT;
  const updated = await db.inventory.update({ where: { id }, data: { stock: nextStock, adjustment: { increment: quantity } } });
  await db.stockMovement.create({
    data: { inventoryId: id, productId: row.productId, variantId: row.variantId, type, channel: StockMovementChannel.ADMIN, quantity: Math.abs(quantity), quantityBefore: row.stock - row.reserved, quantityAfter: updated.stock - updated.reserved, adminUserId, actorType: "ADMIN", actorId: adminUserId, note },
  });
  return mapInventory(await db.inventory.findUniqueOrThrow({ where: { id }, include: inventoryInclude }));
}

export async function listStockMovements() {
  return db.stockMovement.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { product: true, adminUser: { select: { name: true, email: true } }, order: { select: { orderNumber: true } } } });
}

export async function recordOfflineSale(adminUserId: string, input: { note?: string; items: { productId: string; variantId?: string | null; quantity: number; unitPrice: number }[] }) {
  return db.$transaction(async (tx) => {
    const referenceNumber = `OFF-${new Date().getFullYear()}-${Date.now()}`;
    const total = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const sale = await tx.offlineSale.create({
      data: {
        referenceNumber,
        actorId: adminUserId,
        total,
        note: input.note,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
          })),
        },
      },
      include: { items: true, actor: { select: { name: true, email: true } } },
    });

    for (const item of input.items) {
      const inventory = await tx.inventory.findFirstOrThrow({ where: { productId: item.productId, variantId: item.variantId ?? null } });
      const available = inventory.stock - inventory.reserved;
      if (available < item.quantity) throw new Error("Insufficient stock for offline sale.");
      const updated = await tx.inventory.update({ where: { id: inventory.id }, data: { stock: { decrement: item.quantity }, sold: { increment: item.quantity } } });
      await tx.stockMovement.create({
        data: {
          inventoryId: inventory.id,
          productId: item.productId,
          variantId: item.variantId ?? null,
          type: StockMovementType.OFFLINE_SALE,
          channel: StockMovementChannel.OFFLINE,
          quantity: item.quantity,
          quantityBefore: available,
          quantityAfter: updated.stock - updated.reserved,
          referenceType: "OFFLINE_SALE",
          referenceId: sale.id,
          actorType: "ADMIN",
          actorId: adminUserId,
          adminUserId,
          idempotencyKey: `OFFLINE_SALE:${sale.id}:${item.productId}:${item.variantId ?? "base"}`,
          note: input.note ?? `Offline sale ${referenceNumber}`,
        },
      });
    }

    return sale;
  });
}
