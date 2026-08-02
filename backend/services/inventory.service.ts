import { Prisma, RoleName, SettingType, StockMovementChannel, StockMovementType } from "@prisma/client";
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

async function nextSequence(tx: Tx, key: string) {
  const current = await tx.setting.findUnique({ where: { key } });
  const next = Number(current?.value || "0") + 1;
  await tx.setting.upsert({
    where: { key },
    update: { value: String(next) },
    create: { key, value: String(next), type: SettingType.NUMBER },
  });
  return next;
}

async function nextPosReferences(tx: Tx) {
  const year = new Date().getFullYear();
  const saleSequence = await nextSequence(tx, `pos-sale:${year}`);
  const invoiceSequence = await nextSequence(tx, `pos-invoice:${year}`);
  const receiptSequence = await nextSequence(tx, `pos-receipt:${year}`);
  return {
    referenceNumber: `POS-${year}-${String(saleSequence).padStart(6, "0")}`,
    invoiceNumber: `INV-POS-${year}-${String(invoiceSequence).padStart(6, "0")}`,
    receiptNumber: `RCPT-${year}-${String(receiptSequence).padStart(6, "0")}`,
  };
}

function moneyToPaise(value: number | Prisma.Decimal | null | undefined) {
  return Math.round(Number(value || 0) * 100);
}

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
  const exact = await db.inventory.findMany({
    where: {
      locationId: defaultLocation.id,
      product: {
        deletedAt: null,
        OR: [
          { barcode: needle },
          { qrCode: needle },
          { sku: needle },
          { clientProductCode: needle },
          { pluCode: needle },
        ],
      },
    },
    include: inventoryInclude,
    orderBy: [{ product: { name: "asc" } }, { updatedAt: "desc" }],
    take: 10,
  });
  if (exact.length) return exact.map(mapInventory);
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

export async function lookupPosInventory(code: string) {
  const needle = code.trim();
  if (!needle) throw new Error("Scan code is required.");
  await ensureDefaultStoreLocation();
  const priorities: Prisma.ProductWhereInput[] = [
    { barcode: needle },
    { qrCode: needle },
    { sku: needle },
    { clientProductCode: needle },
    { pluCode: needle },
  ];
  for (const productWhere of priorities) {
    const rows = await db.inventory.findMany({
      where: { product: { deletedAt: null, ...productWhere } },
      include: inventoryInclude,
      orderBy: [{ location: { isDefault: "desc" } }, { updatedAt: "desc" }],
      take: 2,
    });
    if (rows.length === 1) return { match: mapInventory(rows[0]), options: [] };
    if (rows.length > 1) return { match: null, options: rows.map(mapInventory), ambiguous: true };
  }
  return { match: null, options: [], ambiguous: false };
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

export async function listOfflineSales(filters: { q?: string; paymentMethod?: string; status?: string; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize || 25));
  const where: Prisma.OfflineSaleWhereInput = {
    ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? {
      OR: [
        { referenceNumber: { contains: filters.q } },
        { invoiceNumber: { contains: filters.q } },
        { receiptNumber: { contains: filters.q } },
        { customerReference: { contains: filters.q } },
        { actor: { name: { contains: filters.q } } },
        { location: { name: { contains: filters.q } } },
      ],
    } : {}),
  };
  const [sales, total] = await Promise.all([
    db.offlineSale.findMany({
      where,
      include: { items: { include: { product: true, variant: true } }, actor: { select: { name: true, email: true } }, location: true, invoice: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.offlineSale.count({ where }),
  ]);
  return { sales, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export async function getPosMetrics(input: { deviceQueued?: number } = {}) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const [sales, conflicts] = await Promise.all([
    db.offlineSale.findMany({ where: { createdAt: { gte: start }, status: { not: "VOIDED" } }, include: { items: true } }),
    db.offlineSyncConflict.count({ where: { status: { notIn: ["REVIEWED", "CANCELLED", "SYNCED"] } } }),
  ]);
  const cashSales = sales.filter((sale) => sale.paymentMethod === "CASH");
  const upiCardSales = sales.filter((sale) => ["UPI", "CARD"].includes(sale.paymentMethod));
  return {
    salesToday: sales.length,
    revenueToday: sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
    itemsSoldToday: sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0),
    pendingSync: input.deviceQueued || 0,
    syncConflicts: conflicts,
    cashSalesToday: cashSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
    upiCardSalesToday: upiCardSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
  };
}

export async function recordOfflineSale(adminUserId: string, input: { locationId?: string | null; idempotencyKey?: string; customerReference?: string; paymentMethod?: string; cashReceived?: number | null; note?: string; items: { productId: string; variantId?: string | null; quantity: number; unitPrice: number }[] }) {
  return db.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.offlineSale.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { items: { include: { product: true, variant: true } }, actor: { select: { name: true, email: true } }, location: true, invoice: true } });
      if (existing) return existing;
    }
    const location = input.locationId ? await tx.storeLocation.findUniqueOrThrow({ where: { id: input.locationId } }) : await ensureDefaultStoreLocation(tx);
    const references = await nextPosReferences(tx);
    const total = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    if (!Number.isFinite(total) || total <= 0) throw new Error("POS bill total must be greater than zero.");
    const paymentMethod = input.paymentMethod || "CASH";
    const cashReceived = input.cashReceived ?? null;
    if (paymentMethod === "CASH" && moneyToPaise(cashReceived) < moneyToPaise(total)) {
      throw new Error("Cash received is less than bill total.");
    }
    const sale = await tx.offlineSale.create({
      data: {
        referenceNumber: references.referenceNumber,
        invoiceNumber: references.invoiceNumber,
        receiptNumber: references.receiptNumber,
        locationId: location.id,
        idempotencyKey: input.idempotencyKey,
        customerReference: input.customerReference,
        paymentMethod,
        cashReceived,
        changeDue: paymentMethod === "CASH" && cashReceived != null ? Math.max(0, cashReceived - total) : null,
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
      include: { items: { include: { product: true, variant: true } }, actor: { select: { name: true, email: true } }, location: true, invoice: true },
    });

    await tx.invoice.create({
      data: {
        invoiceNumber: references.invoiceNumber,
        offlineSaleId: sale.id,
        subtotal: total,
        couponDiscount: 0,
        deliveryCharge: 0,
        handlingCharge: 0,
        gstTotal: 0,
        grandTotal: total,
      },
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
          referenceId: references.referenceNumber,
          actorType: "ADMIN",
          actorId: adminUserId,
          adminUserId,
          idempotencyKey: `OFFLINE_SALE:${sale.id}:${item.productId}:${item.variantId ?? "base"}`,
          metadata: { offlineSaleId: sale.id, invoiceNumber: references.invoiceNumber, receiptNumber: references.receiptNumber },
          note: input.note ?? `Offline sale ${references.referenceNumber}`,
        },
      });
    }

    return tx.offlineSale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: { include: { product: true, variant: true } }, actor: { select: { name: true, email: true } }, location: true, invoice: true } });
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
      const reason = message.slice(0, 180);
      const status = /insufficient stock/i.test(message) ? "STOCK_CONFLICT" : /not found/i.test(message) ? "PRODUCT_NOT_FOUND" : /location/i.test(message) ? "LOCATION_INVALID" : "FAILED";
      const retryable = status === "FAILED";
      const conflict = await db.offlineSyncConflict.upsert({
        where: { localReference: sale.localReference },
        update: {
          status,
          reason,
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
          reason,
          retryable,
          locationId: sale.locationId ?? null,
          cashierId: adminUserId,
          deviceId: input.deviceId,
          payload: sale as any,
          result: { message, status },
        },
      });
      results.push({ localReference: sale.localReference, status, retryable, conflictId: conflict.id, reason });
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
