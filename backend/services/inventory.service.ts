import { Prisma, RoleName, StockMovementChannel, StockMovementType } from "@prisma/client";
import { db } from "../lib/db.js";
import { mapProduct } from "./catalog.service.js";

export const defaultLocationCode = "MAIN-STORE";
const defaultLocation = {
  id: "default-store",
  code: defaultLocationCode,
  name: "Eagle Mart Main Store",
  type: "STORE",
  addressLine: "GF-4, Siddharth Annexe, Sama-Savli Main Road, Vemali, New Sama",
  city: "Vadodara",
  state: "Gujarat",
  pincode: "390024",
  active: true,
  isDefault: true,
};

const inventoryInclude = {
  location: true,
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
export const posRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.INVENTORY_MANAGER, RoleName.CASHIER];

export async function ensureDefaultStoreLocation(tx: any = db) {
  return tx.storeLocation.upsert({
    where: { code: defaultLocationCode },
    update: { ...defaultLocation, id: undefined },
    create: defaultLocation,
  });
}

export function mapInventory(row: any) {
  const reserved = Number(row.reserved || 0);
  const safetyStock = Number(row.safetyStock || 0);
  const available = Math.max(0, Number(row.stock || 0) - reserved - safetyStock);
  return {
    id: row.id,
    locationId: row.locationId,
    location: row.location ? { id: row.location.id, code: row.location.code, name: row.location.name } : null,
    productId: row.productId,
    variantId: row.variantId,
    product: mapProduct(row.product),
    variant: row.variant,
    stock: available,
    onHand: row.stock,
    reserved,
    available,
    safetyStock,
    reorderLevel: row.reorderLevel || 0,
    incoming: row.incoming || 0,
    outgoing: row.outgoing || 0,
    sold: row.sold || 0,
    damaged: row.damaged || 0,
    expired: row.expired || 0,
    returned: row.returned || 0,
    adjustment: row.adjustment || 0,
    lowStockThreshold: row.lowStockThreshold,
    status: available <= 0 ? "Out of stock" : available <= row.lowStockThreshold ? "Low stock" : "In stock",
    updatedAt: row.updatedAt,
  };
}

type Tx = Prisma.TransactionClient;

async function movementExists(tx: Tx, idempotencyKey?: string) {
  return idempotencyKey ? tx.stockMovement.findUnique({ where: { idempotencyKey } }) : null;
}

async function findInventoryForSku(tx: Tx, input: { productId: string; variantId?: string | null; locationId?: string | null }) {
  const location = input.locationId ? null : await ensureDefaultStoreLocation(tx);
  return tx.inventory.findFirstOrThrow({
    where: { productId: input.productId, variantId: input.variantId ?? null, locationId: input.locationId ?? location.id },
  });
}

export async function reserveInventory(tx: Tx, input: { productId: string; variantId?: string | null; quantity: number; orderId: string; actorId?: string | null; idempotencyKey?: string }) {
  if (await movementExists(tx, input.idempotencyKey)) return;
  const inventory = await findInventoryForSku(tx, input);
  const available = inventory.stock - inventory.reserved - inventory.safetyStock;
  if (available < input.quantity) throw new Error("Insufficient stock.");
  const updated = await tx.inventory.update({ where: { id: inventory.id }, data: { reserved: { increment: input.quantity } } });
  await tx.stockMovement.create({
    data: {
      inventoryId: inventory.id,
      locationId: inventory.locationId,
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
    const location = await ensureDefaultStoreLocation(tx);
    const inventory = await tx.inventory.findFirst({ where: { productId: item.productId, variantId: item.variantId, locationId: location.id } });
    if (!inventory) continue;
    const quantity = Math.min(inventory.reserved, item.quantity);
    if (quantity <= 0) continue;
    const before = inventory.stock - inventory.reserved - inventory.safetyStock;
    const updated = await tx.inventory.update({ where: { id: inventory.id }, data: { reserved: { decrement: quantity } } });
    await tx.stockMovement.create({
      data: {
        inventoryId: inventory.id,
        locationId: inventory.locationId,
        productId: item.productId,
        variantId: item.variantId,
        type: input.type ?? StockMovementType.RESERVATION_RELEASE,
        channel: input.actorType === "CUSTOMER" ? StockMovementChannel.ONLINE : StockMovementChannel.ADMIN,
        quantity,
        quantityBefore: before,
        quantityAfter: updated.stock - updated.reserved - updated.safetyStock,
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
    const inventory = await findInventoryForSku(tx, { productId: item.productId, variantId: item.variantId });
    const before = inventory.stock - inventory.reserved - inventory.safetyStock;
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
        locationId: inventory.locationId,
        productId: item.productId,
        variantId: item.variantId,
        type: StockMovementType.ONLINE_SALE,
        channel: StockMovementChannel.ONLINE,
        quantity: item.quantity,
        quantityBefore: before,
        quantityAfter: updated.stock - updated.reserved - updated.safetyStock,
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
  await ensureDefaultStoreLocation();
  await db.inventory.updateMany({ where: { locationId: null }, data: { locationId: defaultLocation.id } });
  const rows = await db.inventory.findMany({ include: inventoryInclude, orderBy: { updatedAt: "desc" } });
  return rows.map(mapInventory);
}

export async function searchPosInventory(query: string) {
  const needle = query.trim();
  if (!needle) return [];
  await ensureDefaultStoreLocation();
  const rows = await db.inventory.findMany({
    where: {
      locationId: defaultLocation.id,
      product: {
        deletedAt: null,
        OR: [
          { name: { contains: needle } },
          { sku: { contains: needle } },
          { clientProductCode: { contains: needle } },
          { barcode: { contains: needle } },
          { qrCode: { contains: needle } },
          { pluCode: { contains: needle } },
          { category: { name: { contains: needle } } },
          { brand: { name: { contains: needle } } },
        ],
      },
    },
    include: inventoryInclude,
    orderBy: [{ product: { name: "asc" } }, { updatedAt: "desc" }],
    take: 30,
  });
  return rows.map(mapInventory);
}

export async function updateInventory(id: string, input: { stock?: number; lowStockThreshold?: number }) {
  const row = await db.inventory.update({ where: { id }, data: input.stock == null ? input : { ...input, adjustment: { increment: input.stock }, reserved: 0 }, include: inventoryInclude });
  return mapInventory(row);
}

export async function adjustInventory(id: string, quantity: number, adminUserId: string, note?: string) {
  const row = await db.inventory.findUniqueOrThrow({ where: { id } });
  const nextStock = row.stock + quantity;
  if (nextStock < row.reserved + row.safetyStock) throw new Error("Inventory cannot go below reserved and safety stock.");
  const type = quantity >= 0 ? StockMovementType.RESTOCK : StockMovementType.MANUAL_ADJUSTMENT;
  const updated = await db.inventory.update({ where: { id }, data: { stock: nextStock, adjustment: { increment: quantity } } });
  await db.stockMovement.create({
    data: { inventoryId: id, locationId: row.locationId, productId: row.productId, variantId: row.variantId, type, channel: StockMovementChannel.ADMIN, quantity: Math.abs(quantity), quantityBefore: row.stock - row.reserved - row.safetyStock, quantityAfter: updated.stock - updated.reserved - updated.safetyStock, adminUserId, actorType: "ADMIN", actorId: adminUserId, note },
  });
  return mapInventory(await db.inventory.findUniqueOrThrow({ where: { id }, include: inventoryInclude }));
}

export async function recordStockInward(adminUserId: string, input: { inventoryId: string; quantity: number; vendor?: string; invoiceReference?: string; note?: string }) {
  return db.$transaction(async (tx) => {
    const row = await tx.inventory.findUniqueOrThrow({ where: { id: input.inventoryId } });
    const before = row.stock - row.reserved - row.safetyStock;
    const updated = await tx.inventory.update({
      where: { id: row.id },
      data: { stock: { increment: input.quantity }, incoming: { increment: input.quantity } },
    });
    await tx.stockMovement.create({
      data: {
        inventoryId: row.id,
        locationId: row.locationId,
        productId: row.productId,
        variantId: row.variantId,
        type: StockMovementType.STOCK_INWARD,
        channel: StockMovementChannel.ADMIN,
        quantity: input.quantity,
        quantityBefore: before,
        quantityAfter: updated.stock - updated.reserved - updated.safetyStock,
        referenceType: "STOCK_INWARD",
        referenceId: input.invoiceReference || null,
        adminUserId,
        actorType: "ADMIN",
        actorId: adminUserId,
        metadata: { vendor: input.vendor || null, invoiceReference: input.invoiceReference || null },
        note: input.note ?? "Stock inward",
      },
    });
    return mapInventory(await tx.inventory.findUniqueOrThrow({ where: { id: row.id }, include: inventoryInclude }));
  });
}

export async function listStockMovements() {
  return db.stockMovement.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { product: true, location: true, adminUser: { select: { name: true, email: true } }, order: { select: { orderNumber: true } } } });
}

export async function recordOfflineSale(adminUserId: string, input: { locationId?: string | null; idempotencyKey?: string; customerReference?: string; paymentMethod?: string; cashReceived?: number | null; note?: string; items: { productId: string; variantId?: string | null; quantity: number; unitPrice: number }[] }) {
  return db.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.offlineSale.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: true, actor: { select: { name: true, email: true } } } });
      if (existing) return existing;
    }
    const location = input.locationId ? await tx.storeLocation.findUniqueOrThrow({ where: { id: input.locationId } }) : await ensureDefaultStoreLocation(tx);
    const referenceNumber = `OFF-${new Date().getFullYear()}-${Date.now()}`;
    const total = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const sale = await tx.offlineSale.create({
      data: {
        referenceNumber,
        locationId: location.id,
        idempotencyKey: input.idempotencyKey,
        customerReference: input.customerReference,
        paymentMethod: input.paymentMethod || "CASH",
        cashReceived: input.cashReceived ?? null,
        changeDue: input.paymentMethod === "CASH" && input.cashReceived != null ? Math.max(0, input.cashReceived - total) : null,
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
      const inventory = await tx.inventory.findFirstOrThrow({ where: { productId: item.productId, variantId: item.variantId ?? null, locationId: location.id } });
      const available = inventory.stock - inventory.reserved - inventory.safetyStock;
      if (available < item.quantity) throw new Error("Insufficient stock for offline sale.");
      const updatedCount = await tx.inventory.updateMany({
        where: { id: inventory.id, reserved: inventory.reserved, stock: { gte: inventory.reserved + inventory.safetyStock + item.quantity } },
        data: { stock: { decrement: item.quantity }, sold: { increment: item.quantity } },
      });
      if (updatedCount.count !== 1) throw new Error(`Insufficient stock for offline sale: ${item.productId}.`);
      const updated = await tx.inventory.findUniqueOrThrow({ where: { id: inventory.id } });
      await tx.stockMovement.create({
        data: {
          inventoryId: inventory.id,
          locationId: inventory.locationId,
          productId: item.productId,
          variantId: item.variantId ?? null,
          type: StockMovementType.OFFLINE_SALE,
          channel: StockMovementChannel.OFFLINE,
          quantity: item.quantity,
          quantityBefore: available,
          quantityAfter: updated.stock - updated.reserved - updated.safetyStock,
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

export async function syncOfflineSales(adminUserId: string, input: { deviceId: string; sales: { localReference: string; idempotencyKey: string; locationId?: string | null; customerReference?: string; paymentMethod: string; cashReceived?: number | null; note?: string; items: { productId: string; variantId?: string | null; quantity: number; unitPrice: number; cachedAvailable?: number }[] }[] }) {
  const results = [];
  for (const sale of input.sales) {
    try {
      const committed = await recordOfflineSale(adminUserId, sale);
      results.push({ localReference: sale.localReference, status: "SYNCED", retryable: false, serverReference: committed.referenceNumber, saleId: committed.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Offline sale sync failed.";
      const status = /insufficient stock/i.test(message) ? "STOCK_CONFLICT" : /not found/i.test(message) ? "PRODUCT_NOT_FOUND" : /location/i.test(message) ? "LOCATION_INVALID" : "FAILED";
      const retryable = status === "FAILED";
      const conflict = await db.offlineSyncConflict.upsert({
        where: { localReference: sale.localReference },
        update: {
          status,
          reason: message,
          retryable,
          locationId: sale.locationId ?? null,
          cashierId: adminUserId,
          deviceId: input.deviceId,
          payload: sale as any,
          result: { message, status },
        },
        create: {
          localReference: sale.localReference,
          idempotencyKey: sale.idempotencyKey,
          status,
          reason: message,
          retryable,
          locationId: sale.locationId ?? null,
          cashierId: adminUserId,
          deviceId: input.deviceId,
          payload: sale as any,
          result: { message, status },
        },
      });
      results.push({ localReference: sale.localReference, status, retryable, conflictId: conflict.id, reason: message });
    }
  }
  return results;
}

export async function listOfflineSyncConflicts(filters: { status?: string; q?: string }) {
  const where: Prisma.OfflineSyncConflictWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? {
      OR: [
        { localReference: { contains: filters.q } },
        { serverReference: { contains: filters.q } },
        { idempotencyKey: { contains: filters.q } },
        { reason: { contains: filters.q } },
      ],
    } : {}),
  };
  return db.offlineSyncConflict.findMany({
    where,
    include: { location: true, cashier: { select: { name: true, email: true } }, reviewedBy: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function resolveOfflineSyncConflict(id: string, adminUserId: string, input: { status: string; resolutionNote: string }) {
  return db.offlineSyncConflict.update({
    where: { id },
    data: { status: input.status, resolutionNote: input.resolutionNote, reviewedAt: new Date(), reviewedById: adminUserId },
    include: { location: true, cashier: { select: { name: true, email: true } }, reviewedBy: { select: { name: true, email: true } } },
  });
}
