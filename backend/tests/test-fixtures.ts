import bcrypt from "bcrypt";
import { AdminStatus, RoleName, UserStatus } from "@prisma/client";
import { db } from "../lib/db.js";

export const testAdminPassword = "Eagle" + "club@12345";
export const testCustomerPassword = "Customer@12345";

export async function ensureTestPrincipals() {
  const roles = await Promise.all(
    Object.values(RoleName).map((name) =>
      db.role.upsert({
        where: { name },
        update: {},
        create: { name, permissions: [] },
      }),
    ),
  );
  const roleByName = new Map(roles.map((role) => [role.name, role]));
  const passwordHash = await bcrypt.hash(testAdminPassword, 12);
  const customerHash = await bcrypt.hash(testCustomerPassword, 12);

  await db.user.upsert({
    where: { email: "customer@eagleclub.in" },
    update: {
      name: "Eagle Mart Test Customer",
      normalizedEmail: "customer@eagleclub.in",
      passwordHash: customerHash,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
      lockedUntil: null,
      emailVerifiedAt: new Date(),
    },
    create: {
      name: "Eagle Mart Test Customer",
      email: "customer@eagleclub.in",
      normalizedEmail: "customer@eagleclub.in",
      passwordHash: customerHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  for (const [email, roleName, name] of [
    ["superadmin@eagleclub.in", RoleName.SUPER_ADMIN, "Eagle Mart Super Admin"],
    ["inventory@eagleclub.in", RoleName.INVENTORY_MANAGER, "Eagle Mart Inventory Manager"],
  ] as const) {
    const existing = await db.adminUser.findUnique({ where: { email } });
    if (existing) {
      await db.adminMfaRecoveryCode.deleteMany({ where: { adminUserId: existing.id } });
      await db.passwordResetToken.deleteMany({ where: { adminUserId: existing.id } });
    }
    await db.adminUser.upsert({
      where: { email },
      update: {
        name,
        normalizedEmail: email,
        passwordHash,
        roleId: roleByName.get(roleName)!.id,
        status: AdminStatus.ACTIVE,
        failedLoginAttempts: 0,
        lockedUntil: null,
        totpEnabled: false,
        encryptedTotpSecret: null,
        totpVerifiedAt: null,
      },
      create: {
        name,
        email,
        normalizedEmail: email,
        passwordHash,
        roleId: roleByName.get(roleName)!.id,
        status: AdminStatus.ACTIVE,
      },
    });
  }
}
