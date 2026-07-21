import bcrypt from "bcrypt";
import crypto from "crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminStatus, RoleName, UserStatus } from "@prisma/client";
import { createApp } from "../app/app.js";
import { db } from "../lib/db.js";
import { canAccessAdminArea, hasRole } from "../lib/roles.js";
import { ensureTestPrincipals } from "./test-fixtures.js";

const app = createApp();
const createdEmails: string[] = [];
const adminPassword = "Eagle" + "club@12345";

beforeAll(async () => {
  await ensureTestPrincipals();
});

function base32Decode(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = value.replace(/=+$/g, "").replace(/\s/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function currentTotp(secret: string) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, "0");
}

afterAll(async () => {
  if (createdEmails.length) {
    await db.user.deleteMany({ where: { email: { in: createdEmails } } });
  }
  await db.$disconnect();
});

describe("customer auth", () => {
  it("logs in seeded customer and returns me without password", async () => {
    const agent = request.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .send({ email: "customer@eagleclub.in", password: "Customer@12345" })
      .expect(200);

    expect(login.body.data.user.email).toBe("customer@eagleclub.in");
    expect(login.body.data.user.passwordHash).toBeUndefined();

    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.data.user.email).toBe("customer@eagleclub.in");
    expect(me.body.data.user.passwordHash).toBeUndefined();
  });

  it("rejects wrong customer password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "customer@eagleclub.in", password: "WrongPassword" })
      .expect(401);

    expect(response.body.error.message).toBe("Invalid email or password.");
  });

  it("registers a customer and starts a session", async () => {
    const email = `phase5-${Date.now()}@eagleclub.in`;
    createdEmails.push(email);

    const agent = request.agent(app);
    const requested = await agent
      .post("/api/auth/signup/request-otp")
      .send({ name: "Phase Five Customer", email, phone: "9876512345", password: "Customer@12345", channel: "email" })
      .expect(201);

    const response = await agent
      .post("/api/auth/register")
      .send({ signupId: requested.body.data.signupId, otp: "123456" })
      .expect(201);

    expect(response.body.data.user.email).toBe(email);
    expect(response.body.data.user.passwordHash).toBeUndefined();

    await agent.get("/api/auth/me").expect(200);
  });

  it("blocks inactive customers from login", async () => {
    const email = `blocked-${Date.now()}@eagleclub.in`;
    createdEmails.push(email);
    await db.user.create({
      data: {
        name: "Blocked Customer",
        email,
        passwordHash: await bcrypt.hash("Customer@12345", 12),
        status: UserStatus.BLOCKED,
      },
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "Customer@12345" })
      .expect(403);

    expect(response.body.error.message).toBe("Account is not active.");
  });
});

describe("admin auth", () => {
  it("logs in seeded admin and returns me without password", async () => {
    const agent = request.agent(app);
    const login = await agent
      .post("/api/admin/auth/login")
      .send({ email: "superadmin@eagleclub.in", password: adminPassword })
      .expect(200);

    expect(login.body.data.admin.email).toBe("superadmin@eagleclub.in");
    expect(login.body.data.admin.role.name).toBe(RoleName.SUPER_ADMIN);
    expect(login.body.data.admin.passwordHash).toBeUndefined();

    const me = await agent.get("/api/admin/auth/me").expect(200);
    expect(me.body.data.admin.email).toBe("superadmin@eagleclub.in");
  });

  it("rejects wrong admin password", async () => {
    const response = await request(app)
      .post("/api/admin/auth/login")
      .send({ email: "superadmin@eagleclub.in", password: "WrongPassword" })
      .expect(401);

    expect(response.body.error.message).toBe("Invalid email or password.");
  });

  it("blocks inactive admins from login", async () => {
    const role = await db.role.findUniqueOrThrow({ where: { name: RoleName.SUPPORT_STAFF } });
    const email = `inactive-admin-${Date.now()}@eagleclub.in`;
    await db.adminUser.create({
      data: {
        name: "Inactive Admin",
        email,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        roleId: role.id,
        status: AdminStatus.INACTIVE,
      },
    });

    const response = await request(app)
      .post("/api/admin/auth/login")
      .send({ email, password: adminPassword })
      .expect(403);

    expect(response.body.error.message).toBe("Admin account is not active.");
    await db.adminUser.delete({ where: { email } });
  });

  it("enrolls admin MFA and requires a same-frame challenge on next login", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/admin/auth/login")
      .send({ email: "superadmin@eagleclub.in", password: adminPassword })
      .expect(200);

    const enrollment = await agent.post("/api/admin/auth/mfa/enroll").send({}).expect(200);
    const code = currentTotp(enrollment.body.data.secret);
    const confirmed = await agent.post("/api/admin/auth/mfa/confirm").send({ code }).expect(200);
    expect(confirmed.body.data.recoveryCodes).toHaveLength(10);

    await agent.post("/api/admin/auth/logout").send({}).expect(200);
    const login = await request(app)
      .post("/api/admin/auth/login")
      .send({ email: "superadmin@eagleclub.in", password: adminPassword })
      .expect(200);
    expect(login.body.data.mfaRequired).toBe(true);

    const mfa = await request.agent(app)
      .post("/api/admin/auth/mfa/verify")
      .send({ challengeId: login.body.data.challengeId, code: currentTotp(enrollment.body.data.secret) })
      .expect(200);
    expect(mfa.body.data.admin.email).toBe("superadmin@eagleclub.in");

    await db.adminMfaRecoveryCode.deleteMany({ where: { adminUserId: mfa.body.data.admin.id } });
    await db.adminUser.update({ where: { id: mfa.body.data.admin.id }, data: { totpEnabled: false, encryptedTotpSecret: null, totpVerifiedAt: null } });
  });
});

describe("role helpers", () => {
  it("allows super admin everywhere and restricts non matching roles", () => {
    expect(hasRole(RoleName.SUPER_ADMIN, [RoleName.BILLING_STAFF])).toBe(true);
    expect(canAccessAdminArea(RoleName.STORE_MANAGER, "products")).toBe(true);
    expect(canAccessAdminArea(RoleName.INVENTORY_MANAGER, "payments")).toBe(false);
    expect(canAccessAdminArea(RoleName.BILLING_STAFF, "invoices")).toBe(true);
    expect(canAccessAdminArea(RoleName.DELIVERY_STAFF, "delivery")).toBe(true);
  });
});
