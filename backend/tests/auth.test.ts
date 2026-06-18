import bcrypt from "bcrypt";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { AdminStatus, RoleName, UserStatus } from "@prisma/client";
import { createApp } from "../app/app.js";
import { db } from "../lib/db.js";
import { canAccessAdminArea, hasRole } from "../lib/roles.js";

const app = createApp();
const createdEmails: string[] = [];
const adminPassword = "Eagle" + "club@12345";

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
    const response = await agent
      .post("/api/auth/register")
      .send({ name: "Phase Five Customer", email, phone: "9876512345", password: "Customer@12345" })
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
      .expect(401);

    expect(response.body.error.message).toBe("Customer account is not active.");
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
      .expect(401);

    expect(response.body.error.message).toBe("Admin account is not active.");
    await db.adminUser.delete({ where: { email } });
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
