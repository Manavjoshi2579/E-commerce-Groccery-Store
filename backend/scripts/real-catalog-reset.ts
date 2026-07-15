import "../lib/load-env.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcrypt";
import { AdminStatus, Prisma, ProductStatus, RoleName, SettingType } from "@prisma/client";
import { db } from "../lib/db.js";
import { replaceClientCatalogFromWorkbook } from "../services/catalog.service.js";

const seededAdminEmail = "superadmin@eagleclub.in";
const seededAdminPassword = "Eagleclub@12345";

const rolePermissions: Record<RoleName, string[]> = {
  SUPER_ADMIN: ["*"],
  STORE_MANAGER: ["catalog:*", "orders:*", "reports:read"],
  INVENTORY_MANAGER: ["inventory:*", "catalog:read"],
  ORDER_MANAGER: ["orders:*", "delivery:assign"],
  DELIVERY_STAFF: ["delivery:*", "orders:read"],
  SUPPORT_STAFF: ["customers:read", "orders:read", "returns:*", "faqs:*"],
  BILLING_STAFF: ["payments:read", "invoices:*", "reports:read"],
};

const preservedSettingKeys = [
  "storeName",
  "supportEmail",
  "defaultCity",
  "gstNumber",
  "storeAddress",
  "catalog:client-imported-at",
];

async function deleteOperationalData(tx: Prisma.TransactionClient) {
  await tx.refund.deleteMany();
  await tx.returnRequest.deleteMany();
  await tx.review.deleteMany();
  await tx.deliveryAssignment.deleteMany();
  await tx.invoice.deleteMany();
  await tx.payment.deleteMany();
  await tx.couponUsage.deleteMany();
  await tx.stockMovement.deleteMany();
  await tx.orderItem.deleteMany();
  await tx.order.deleteMany();
  await tx.wishlistItem.deleteMany();
  await tx.wishlist.deleteMany();
  await tx.cartItem.deleteMany();
  await tx.cart.deleteMany();
  await tx.supportTicket.deleteMany();
  await tx.fAQ.deleteMany();
  await tx.coupon.deleteMany();
  await tx.deliveryStaff.deleteMany();
  await tx.deliverySlot.deleteMany();
  await tx.deliveryZone.deleteMany();
  await tx.oAuthAccount.deleteMany();
  await tx.mobileOtpChallenge.deleteMany();
  await tx.emailVerificationToken.deleteMany();
  await tx.passwordResetToken.deleteMany();
  await tx.authSession.deleteMany();
  await tx.authAuditLog.deleteMany();
  await tx.address.deleteMany();
  await tx.user.deleteMany();
}

async function keepSeededAdminOnly(tx: Prisma.TransactionClient) {
  const roles = new Map<RoleName, { id: string }>();
  for (const roleName of Object.values(RoleName)) {
    const role = await tx.role.upsert({
      where: { name: roleName },
      update: { permissions: rolePermissions[roleName] },
      create: { name: roleName, permissions: rolePermissions[roleName] },
      select: { id: true },
    });
    roles.set(roleName, role);
  }

  const passwordHash = await bcrypt.hash(seededAdminPassword, 12);
  const superAdminRole = roles.get(RoleName.SUPER_ADMIN);
  if (!superAdminRole) throw new Error("SUPER_ADMIN role was not created.");

  const admin = await tx.adminUser.upsert({
    where: { email: seededAdminEmail },
    update: {
      name: "Eagle Mart Super Admin",
      passwordHash,
      roleId: superAdminRole.id,
      status: AdminStatus.ACTIVE,
      totpEnabled: false,
      encryptedTotpSecret: null,
      totpVerifiedAt: null,
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

  await tx.setting.updateMany({ data: { updatedByAdminId: null } });
  await tx.adminMfaRecoveryCode.deleteMany({ where: { adminUser: { email: { not: seededAdminEmail } } } });
  await tx.adminUser.deleteMany({ where: { email: { not: seededAdminEmail } } });

  const settings = [
    ["storeName", "Eagle Mart Grocery & Essentials"],
    ["supportEmail", seededAdminEmail],
    ["defaultCity", "Vadodara"],
    ["gstNumber", ""],
    ["storeAddress", "GF-4, Siddharth Annexe, Sama-Savli Main Road, Vemali, New Sama, Vadodara, Gujarat - 390024"],
  ] as const;

  for (const [key, value] of settings) {
    await tx.setting.upsert({
      where: { key },
      update: { value, type: SettingType.STRING, updatedByAdminId: admin.id },
      create: { key, value, type: SettingType.STRING, updatedByAdminId: admin.id },
    });
  }

  await tx.setting.deleteMany({ where: { key: { notIn: preservedSettingKeys } } });
  return admin;
}

async function removeNonWorkbookCatalogRows(tx: Prisma.TransactionClient) {
  const nonWorkbookProducts = await tx.product.findMany({
    where: { importIdentity: null },
    select: { id: true },
  });
  const productIds = nonWorkbookProducts.map((product) => product.id);
  if (productIds.length) {
    await tx.inventory.deleteMany({ where: { productId: { in: productIds } } });
    await tx.productImage.deleteMany({ where: { productId: { in: productIds } } });
    await tx.productVariant.deleteMany({ where: { productId: { in: productIds } } });
    await tx.product.deleteMany({ where: { id: { in: productIds } } });
  }

  const archivedWorkbookProducts = await tx.product.findMany({
    where: { importIdentity: { not: null }, deletedAt: { not: null } },
    select: { id: true },
  });
  const archivedProductIds = archivedWorkbookProducts.map((product) => product.id);
  if (archivedProductIds.length) {
    await tx.inventory.deleteMany({ where: { productId: { in: archivedProductIds } } });
    await tx.productImage.deleteMany({ where: { productId: { in: archivedProductIds } } });
    await tx.productVariant.deleteMany({ where: { productId: { in: archivedProductIds } } });
    await tx.product.deleteMany({ where: { id: { in: archivedProductIds } } });
  }
  await tx.category.deleteMany({ where: { products: { none: {} }, children: { none: {} } } });
  await tx.brand.deleteMany({ where: { products: { none: {} } } });
  await tx.product.updateMany({
    where: { importIdentity: { not: null }, deletedAt: null },
    data: { status: ProductStatus.ACTIVE },
  });
  return productIds.length;
}

async function counts() {
  const [
    admins,
    roles,
    users,
    addresses,
    carts,
    wishlists,
    orders,
    payments,
    invoices,
    coupons,
    reviews,
    returns,
    refunds,
    support,
    faqs,
    deliveryZones,
    deliverySlots,
    deliveryStaff,
    products,
    clientProducts,
    categories,
    brands,
    settings,
  ] = await Promise.all([
    db.adminUser.count(),
    db.role.count(),
    db.user.count(),
    db.address.count(),
    db.cart.count(),
    db.wishlist.count(),
    db.order.count(),
    db.payment.count(),
    db.invoice.count(),
    db.coupon.count(),
    db.review.count(),
    db.returnRequest.count(),
    db.refund.count(),
    db.supportTicket.count(),
    db.fAQ.count(),
    db.deliveryZone.count(),
    db.deliverySlot.count(),
    db.deliveryStaff.count(),
    db.product.count({ where: { deletedAt: null, status: ProductStatus.ACTIVE } }),
    db.product.count({ where: { importIdentity: { not: null }, deletedAt: null, status: ProductStatus.ACTIVE } }),
    db.category.count({ where: { deletedAt: null } }),
    db.brand.count({ where: { deletedAt: null } }),
    db.setting.count(),
  ]);
  return {
    admins,
    roles,
    users,
    addresses,
    carts,
    wishlists,
    orders,
    payments,
    invoices,
    coupons,
    reviews,
    returns,
    refunds,
    support,
    faqs,
    deliveryZones,
    deliverySlots,
    deliveryStaff,
    products,
    clientProducts,
    categories,
    brands,
    settings,
  };
}

async function main() {
  const workbookArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const workbookPath = resolve(workbookArg || "../products.xlsx");
  const dryRun = process.argv.includes("--dry-run");
  const workbook = readFileSync(workbookPath).toString("base64");

  if (dryRun) {
    const importSummary = await replaceClientCatalogFromWorkbook({ filename: "products.xlsx", contentBase64: workbook }, true);
    console.log(JSON.stringify({ dryRun: true, importSummary, currentCounts: await counts() }, null, 2));
    return;
  }

  await db.$transaction(async (tx) => {
    await deleteOperationalData(tx);
    await keepSeededAdminOnly(tx);
  }, { timeout: 120_000 });

  const importSummary = await replaceClientCatalogFromWorkbook({ filename: "products.xlsx", contentBase64: workbook }, false);
  const removedNonWorkbookProducts = await db.$transaction(removeNonWorkbookCatalogRows, { timeout: 120_000 });
  const finalCounts = await counts();

  console.log(JSON.stringify({
    workbookPath,
    adminLoginKept: seededAdminEmail,
    removedNonWorkbookProducts,
    importSummary,
    finalCounts,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
