import bcrypt from "bcrypt";
import { AdminStatus, RoleName } from "@prisma/client";
import { db } from "../lib/db.js";

export const defaultDeliveryAdminEmail = "delivery@eagleclub.in";
export const defaultDeliveryAdminPassword = "Delivery@12345";

export function deliveryAdminConfig() {
  return {
    email: (process.env.DELIVERY_ADMIN_EMAIL || defaultDeliveryAdminEmail).trim().toLowerCase(),
    password: process.env.DELIVERY_ADMIN_PASSWORD || defaultDeliveryAdminPassword,
    name: (process.env.DELIVERY_ADMIN_NAME || "Eagle Mart Delivery").trim(),
    phone: (process.env.DELIVERY_STAFF_PHONE || "9999999999").trim(),
  };
}

export function validateDeliveryAdminPassword(value: string) {
  if (value.length < 12) throw new Error("DELIVERY_ADMIN_PASSWORD must be at least 12 characters.");
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw new Error("DELIVERY_ADMIN_PASSWORD must include uppercase, lowercase, number and symbol characters.");
  }
}

export async function ensureDeliveryAdminAccount() {
  const config = deliveryAdminConfig();
  validateDeliveryAdminPassword(config.password);
  const passwordHash = await bcrypt.hash(config.password, 12);
  const role = await db.role.upsert({
    where: { name: RoleName.DELIVERY_STAFF },
    update: { permissions: ["delivery:*", "orders:read"] },
    create: { name: RoleName.DELIVERY_STAFF, permissions: ["delivery:*", "orders:read"] },
  });
  const existing = await db.adminUser.findFirst({
    where: { OR: [{ email: config.email }, { normalizedEmail: config.email }] },
  });
  const admin = existing
    ? await db.adminUser.update({
        where: { id: existing.id },
        data: {
          name: config.name,
          email: config.email,
          normalizedEmail: config.email,
          passwordHash,
          roleId: role.id,
          status: AdminStatus.ACTIVE,
          failedLoginAttempts: 0,
          lockedUntil: null,
          totpEnabled: false,
          encryptedTotpSecret: null,
          totpVerifiedAt: null,
        },
      })
    : await db.adminUser.create({
        data: {
          name: config.name,
          email: config.email,
          normalizedEmail: config.email,
          passwordHash,
          roleId: role.id,
          status: AdminStatus.ACTIVE,
        },
      });
  await db.deliveryStaff.upsert({
    where: { phone: config.phone },
    update: { name: config.name, adminUserId: admin.id, active: true },
    create: { name: config.name, phone: config.phone, adminUserId: admin.id, active: true },
  });
  return { email: config.email, phone: config.phone };
}
