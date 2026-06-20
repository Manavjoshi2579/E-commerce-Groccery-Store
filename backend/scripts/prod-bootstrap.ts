import bcrypt from "bcrypt";
import "../lib/load-env.js";
import { AdminStatus, PrismaClient, RoleName, SettingType } from "@prisma/client";

const prisma = new PrismaClient();

const rolePermissions: Record<RoleName, string[]> = {
  SUPER_ADMIN: ["*"],
  STORE_MANAGER: ["catalog:*", "orders:*", "reports:read"],
  INVENTORY_MANAGER: ["inventory:*", "catalog:read"],
  ORDER_MANAGER: ["orders:*", "delivery:assign"],
  DELIVERY_STAFF: ["delivery:*", "orders:read"],
  SUPPORT_STAFF: ["customers:read", "orders:read", "returns:*", "faqs:*"],
  BILLING_STAFF: ["payments:read", "invoices:*", "reports:read"],
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function validatePassword(password: string) {
  if (password.length < 12) throw new Error("PRODUCTION_SUPER_ADMIN_PASSWORD must be at least 12 characters.");
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("PRODUCTION_SUPER_ADMIN_PASSWORD must include uppercase, lowercase, and number characters.");
  }
}

async function main() {
  const name = requiredEnv("PRODUCTION_SUPER_ADMIN_NAME");
  const email = requiredEnv("PRODUCTION_SUPER_ADMIN_EMAIL").toLowerCase();
  const password = requiredEnv("PRODUCTION_SUPER_ADMIN_PASSWORD");
  validatePassword(password);

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

  const passwordHash = await bcrypt.hash(password, 12);
  const superAdminRole = roles.get(RoleName.SUPER_ADMIN);
  if (!superAdminRole) throw new Error("SUPER_ADMIN role was not created.");

  const existingSuperAdmins = await prisma.adminUser.count({
    where: {
      role: { name: RoleName.SUPER_ADMIN },
      email: { not: email },
      status: AdminStatus.ACTIVE,
    },
  });

  if (existingSuperAdmins > 0) {
    throw new Error("Another active SUPER_ADMIN already exists. Refusing to create/update production owner automatically.");
  }

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { name, passwordHash, roleId: superAdminRole.id, status: AdminStatus.ACTIVE },
    create: { name, email, passwordHash, roleId: superAdminRole.id, status: AdminStatus.ACTIVE },
    select: { id: true, email: true, name: true },
  });

  const settings = [
    ["storeName", "Eagle Mart Grocery & Essentials"],
    ["supportEmail", email],
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

  const [adminCount, customerCount, orderCount] = await Promise.all([
    prisma.adminUser.count(),
    prisma.user.count(),
    prisma.order.count(),
  ]);

  console.log("Production bootstrap completed.");
  console.log(`SUPER_ADMIN: ${admin.email}`);
  console.log(`Admin users: ${adminCount}`);
  console.log(`Customers: ${customerCount}`);
  console.log(`Orders: ${orderCount}`);
  console.log("No demo customers, demo orders, or public credentials were created by this script.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
