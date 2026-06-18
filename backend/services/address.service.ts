import { db } from "../lib/db.js";

export function mapAddress(address: any) {
  return {
    id: address.id,
    label: address.label,
    name: address.name,
    phone: address.phone,
    line: address.line,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    landmark: address.landmark,
    isDefault: address.isDefault,
  };
}

export async function listAddresses(userId: string) {
  const rows = await db.address.findMany({ where: { userId, deletedAt: null }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
  return rows.map(mapAddress);
}

export async function createAddress(userId: string, input: any) {
  return db.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { userId, deletedAt: null } });
    if (input.isDefault || count === 0) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    const address = await tx.address.create({ data: { ...input, userId, isDefault: input.isDefault || count === 0 } });
    return mapAddress(address);
  });
}

export async function updateAddress(userId: string, id: string, input: any) {
  return db.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, userId, deletedAt: null } });
    if (!existing) throw new Error("Address not found.");
    if (input.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    const address = await tx.address.update({ where: { id }, data: input });
    return mapAddress(address);
  });
}

export async function deleteAddress(userId: string, id: string) {
  const address = await db.address.findFirst({ where: { id, userId, deletedAt: null } });
  if (!address) throw new Error("Address not found.");
  await db.address.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } });
}

export async function setDefaultAddress(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const existing = await tx.address.findFirst({ where: { id, userId, deletedAt: null } });
    if (!existing) throw new Error("Address not found.");
    await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    const address = await tx.address.update({ where: { id }, data: { isDefault: true } });
    return mapAddress(address);
  });
}
