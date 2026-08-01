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
  if (password.length < 12) throw new Error("Production admin passwords must be at least 12 characters.");
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Production admin passwords must include uppercase, lowercase, and number characters.");
  }
}

async function main() {
  const name = requiredEnv("PRODUCTION_SUPER_ADMIN_NAME");
  const email = requiredEnv("PRODUCTION_SUPER_ADMIN_EMAIL").toLowerCase();
  const password = requiredEnv("PRODUCTION_SUPER_ADMIN_PASSWORD");
  validatePassword(password);
  const deliveryEmail = process.env.PRODUCTION_DELIVERY_ADMIN_EMAIL?.trim().toLowerCase();
  const deliveryPassword = process.env.PRODUCTION_DELIVERY_ADMIN_PASSWORD?.trim();
  const deliveryName = process.env.PRODUCTION_DELIVERY_ADMIN_NAME?.trim() || "Eagle Mart Delivery";
  const deliveryPhone = process.env.PRODUCTION_DELIVERY_STAFF_PHONE?.trim() || "9999999999";
  if (deliveryEmail || deliveryPassword) {
    if (!deliveryEmail || !deliveryPassword) throw new Error("Set both PRODUCTION_DELIVERY_ADMIN_EMAIL and PRODUCTION_DELIVERY_ADMIN_PASSWORD, or neither.");
    validatePassword(deliveryPassword);
  }

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

  let deliveryAdminEmail = "";
  if (deliveryEmail && deliveryPassword) {
    const deliveryRole = roles.get(RoleName.DELIVERY_STAFF);
    if (!deliveryRole) throw new Error("DELIVERY_STAFF role was not created.");
    const deliveryPasswordHash = await bcrypt.hash(deliveryPassword, 12);
    const deliveryAdmin = await prisma.adminUser.upsert({
      where: { email: deliveryEmail },
      update: { name: deliveryName, passwordHash: deliveryPasswordHash, roleId: deliveryRole.id, status: AdminStatus.ACTIVE },
      create: { name: deliveryName, email: deliveryEmail, passwordHash: deliveryPasswordHash, roleId: deliveryRole.id, status: AdminStatus.ACTIVE },
      select: { id: true, email: true },
    });
    await prisma.deliveryStaff.upsert({
      where: { phone: deliveryPhone },
      update: { name: deliveryName, adminUserId: deliveryAdmin.id, active: true },
      create: { name: deliveryName, phone: deliveryPhone, adminUserId: deliveryAdmin.id, active: true },
    });
    deliveryAdminEmail = deliveryAdmin.email;
  }

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
  if (deliveryAdminEmail) console.log(`DELIVERY_STAFF: ${deliveryAdminEmail}`);
  console.log(`Admin users: ${adminCount}`);
  console.log(`Customers: ${customerCount}`);
  console.log(`Orders: ${orderCount}`);
  console.log("No demo customers, demo orders, or public credentials were created by this script.");
  console.log("Catalog data is not changed by this script. Run `npm run db:prod-catalog -- ../products.xlsx` to import the current product/category catalog.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
