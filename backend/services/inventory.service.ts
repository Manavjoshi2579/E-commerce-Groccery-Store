import { RoleName, StockMovementType } from "@prisma/client";
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
  return {
    id: row.id,
    productId: row.productId,
    variantId: row.variantId,
    product: mapProduct(row.product),
    variant: row.variant,
    stock: row.stock,
    lowStockThreshold: row.lowStockThreshold,
    status: row.stock <= 0 ? "Out of stock" : row.stock <= row.lowStockThreshold ? "Low stock" : "In stock",
  };
}

export async function listInventory() {
  const rows = await db.inventory.findMany({ include: inventoryInclude, orderBy: { updatedAt: "desc" } });
  return rows.map(mapInventory);
}

export async function updateInventory(id: string, input: { stock?: number; lowStockThreshold?: number }) {
  const row = await db.inventory.update({ where: { id }, data: input, include: inventoryInclude });
  return mapInventory(row);
}

export async function adjustInventory(id: string, quantity: number, adminUserId: string, note?: string) {
  const row = await db.inventory.findUniqueOrThrow({ where: { id } });
  const nextStock = row.stock + quantity;
  if (nextStock < 0) throw new Error("Inventory cannot go below zero.");
  const type = quantity >= 0 ? StockMovementType.RESTOCK : StockMovementType.MANUAL_ADJUSTMENT;
  await db.inventory.update({ where: { id }, data: { stock: nextStock } });
  await db.stockMovement.create({
    data: { inventoryId: id, productId: row.productId, variantId: row.variantId, type, quantity: Math.abs(quantity), adminUserId, note },
  });
  return mapInventory(await db.inventory.findUniqueOrThrow({ where: { id }, include: inventoryInclude }));
}

export async function listStockMovements() {
  return db.stockMovement.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { product: true, adminUser: { select: { name: true, email: true } }, order: { select: { orderNumber: true } } } });
}
