import bcrypt from "bcrypt";
import { AdminStatus, Prisma, RoleName, UserStatus } from "@prisma/client";
import { db } from "../lib/db.js";
import { signSession, type SessionPayload } from "../lib/auth.js";

export type SafeUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type SafeAdmin = {
  id: string;
  name: string;
  email: string;
  status: AdminStatus;
  role: {
    id: string;
    name: RoleName;
    permissions: Prisma.JsonValue;
  };
  createdAt: Date;
  updatedAt: Date;
};

function safeUser(user: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  passwordHash?: string;
}): SafeUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

function safeAdmin(admin: {
  id: string;
  name: string;
  email: string;
  status: AdminStatus;
  role: { id: string; name: RoleName; permissions: Prisma.JsonValue };
  createdAt: Date;
  updatedAt: Date;
  passwordHash?: string;
}): SafeAdmin {
  const { passwordHash: _passwordHash, ...safe } = admin;
  return safe;
}

export async function registerCustomer(input: { name: string; email: string; phone?: string; password: string }) {
  const existing = await db.user.findFirst({
    where: {
      OR: [
        { email: input.email.toLowerCase() },
        ...(input.phone ? [{ phone: input.phone }] : []),
      ],
    },
  });

  if (existing) {
    throw new Error("A customer with this email or phone already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await db.user.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone,
      passwordHash,
      status: UserStatus.ACTIVE,
    },
  });

  const payload: SessionPayload = { sub: user.id, kind: "customer", email: user.email };
  return { user: safeUser(user), token: signSession(payload) };
}

export async function loginCustomer(input: { email: string; password: string }) {
  const user = await db.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user) throw new Error("Invalid email or password.");
  if (user.status !== UserStatus.ACTIVE) throw new Error("Customer account is not active.");

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new Error("Invalid email or password.");

  const payload: SessionPayload = { sub: user.id, kind: "customer", email: user.email };
  return { user: safeUser(user), token: signSession(payload) };
}

export async function getCustomerById(id: string) {
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.status !== UserStatus.ACTIVE) return null;
  return safeUser(user);
}

export async function updateCustomerProfile(id: string, input: { name?: string; phone?: string }) {
  const user = await db.user.update({
    where: { id },
    data: input,
  });
  return safeUser(user);
}

function defaultNameFromEmail(email: string | null, fallback: string) {
  const source = email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!source) return fallback;
  return source.split(" ").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase()).join(" ");
}

export async function resetCustomerProfile(id: string) {
  const current = await db.user.findUnique({ where: { id } });
  if (!current) throw new Error("Customer not found.");
  const user = await db.user.update({
    where: { id },
    data: {
      name: defaultNameFromEmail(current.email, "Customer"),
      phone: null,
    },
  });
  return safeUser(user);
}

export async function updateAdminProfile(id: string, input: { name?: string }) {
  const admin = await db.adminUser.update({
    where: { id },
    data: input,
    include: { role: true },
  });
  return safeAdmin(admin);
}

export async function resetAdminProfile(id: string) {
  const current = await db.adminUser.findUnique({ where: { id }, include: { role: true } });
  if (!current) throw new Error("Admin not found.");
  const admin = await db.adminUser.update({
    where: { id },
    data: {
      name: current.role.name === RoleName.SUPER_ADMIN ? "Eagle Mart Super Admin" : defaultNameFromEmail(current.email, "Eagle Mart Admin"),
    },
    include: { role: true },
  });
  return safeAdmin(admin);
}

export async function loginAdmin(input: { email: string; password: string }) {
  const admin = await db.adminUser.findUnique({
    where: { email: input.email.toLowerCase() },
    include: { role: true },
  });
  if (!admin) throw new Error("Invalid email or password.");
  if (admin.status !== AdminStatus.ACTIVE) throw new Error("Admin account is not active.");

  const valid = await bcrypt.compare(input.password, admin.passwordHash);
  if (!valid) throw new Error("Invalid email or password.");

  const payload: SessionPayload = {
    sub: admin.id,
    kind: "admin",
    email: admin.email,
    role: admin.role.name,
  };
  return { admin: safeAdmin(admin), token: signSession(payload) };
}

export async function getAdminById(id: string) {
  const admin = await db.adminUser.findUnique({
    where: { id },
    include: { role: true },
  });
  if (!admin || admin.status !== AdminStatus.ACTIVE) return null;
  return safeAdmin(admin);
}
