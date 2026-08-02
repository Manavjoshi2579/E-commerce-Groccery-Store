import "../lib/load-env.js";
import bcrypt from "bcrypt";
import { AdminStatus, PrismaClient, RoleName, SettingType } from "@prisma/client";

const prisma = new PrismaClient();

const seededAdminEmail = "superadmin@eagleclub.in";
const seededAdminPassword = "Eagleclub@12345";
const seededDeliveryEmail = "delivery@eagleclub.in";
const seededDeliveryPassword = "Delivery@12345";

const rolePermissions: Record<RoleName, string[]> = {
  SUPER_ADMIN: ["*"],
  STORE_MANAGER: ["catalog:*", "orders:*", "reports:read"],
  INVENTORY_MANAGER: ["inventory:*", "catalog:read"],
  CASHIER: ["pos:*", "inventory:read", "catalog:read", "invoices:create"],
  ORDER_MANAGER: ["orders:*", "delivery:assign"],
  DELIVERY_STAFF: ["delivery:*", "orders:read"],
  SUPPORT_STAFF: ["customers:read", "orders:read", "returns:*", "faqs:*"],
  BILLING_STAFF: ["payments:read", "invoices:*", "reports:read"],
};

async function main() {
  const roles = new Map<RoleName, { id: string }>();
  for (const roleName of Object.values(RoleName)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { permissions: rolePermissions[roleName] },
      create: { name: roleName, permissions: rolePermissions[roleName] },
      select: { id: true },
    });
    roles.set(roleName, role);
  }

  const passwordHash = await bcrypt.hash(seededAdminPassword, 12);
  const deliveryPasswordHash = await bcrypt.hash(seededDeliveryPassword, 12);
  const superAdminRole = roles.get(RoleName.SUPER_ADMIN);
  const deliveryRole = roles.get(RoleName.DELIVERY_STAFF);
  if (!superAdminRole) throw new Error("SUPER_ADMIN role was not created.");
  if (!deliveryRole) throw new Error("DELIVERY_STAFF role was not created.");

  const admin = await prisma.adminUser.upsert({
    where: { email: seededAdminEmail },
    update: {
      name: "Eagle Mart Super Admin",
      passwordHash,
      roleId: superAdminRole.id,
      status: AdminStatus.ACTIVE,
    },
    create: {
      name: "Eagle Mart Super Admin",
      email: seededAdminEmail,
      passwordHash,
      roleId: superAdminRole.id,
      status: AdminStatus.ACTIVE,
    },
    select: { id: true, email: true },
  });

  const deliveryAdmin = await prisma.adminUser.upsert({
    where: { email: seededDeliveryEmail },
    update: {
      name: "Eagle Mart Delivery",
      passwordHash: deliveryPasswordHash,
      roleId: deliveryRole.id,
      status: AdminStatus.ACTIVE,
    },
    create: {
      name: "Eagle Mart Delivery",
      email: seededDeliveryEmail,
      passwordHash: deliveryPasswordHash,
      roleId: deliveryRole.id,
      status: AdminStatus.ACTIVE,
    },
    select: { id: true, email: true },
  });

  await prisma.deliveryStaff.upsert({
    where: { phone: "9999999999" },
    update: { name: "Eagle Mart Delivery", adminUserId: deliveryAdmin.id, active: true },
    create: { name: "Eagle Mart Delivery", phone: "9999999999", adminUserId: deliveryAdmin.id, active: true },
  });

  const settings = [
    ["storeName", "Eagle Mart Grocery & Essentials"],
    ["supportEmail", seededAdminEmail],
    ["defaultCity", "Vadodara"],
    ["gstNumber", ""],
    ["storeAddress", "GF-4, Siddharth Annexe, Sama-Savli Main Road, Vemali, New Sama, Vadodara, Gujarat - 390024"],
  ] as const;

  for (const [key, value] of settings) {
    await prisma.setting.upsert({
      where: { key },
      update: { value, type: SettingType.STRING, updatedByAdminId: admin.id },
      create: { key, value, type: SettingType.STRING, updatedByAdminId: admin.id },
    });
  }

  console.log("Seed completed with roles and one admin login only.");
  console.log(`Admin email: ${admin.email}`);
  console.log(`Delivery email: ${deliveryAdmin.email}`);
  console.log("No demo customers, orders, coupons, delivery data, FAQs, or products were created.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
