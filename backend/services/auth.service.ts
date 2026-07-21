import bcrypt from "bcrypt";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { AdminStatus, AuthActorKind, AuthSessionStatus, OAuthProvider, OtpPurpose, Prisma, RoleName, SignupVerificationChannel, UserStatus } from "@prisma/client";
import { db } from "../lib/db.js";
import { ADMIN_SESSION_MS, CUSTOMER_SESSION_MS, hashSecret, randomToken, signSession, type SessionKind, type SessionPayload } from "../lib/auth.js";
import { adminPasswordIssues, customerPasswordIssues, normalizeEmail, normalizeIndianMobile } from "../validators/auth.js";

const GENERIC_RESET_MESSAGE = "If an account exists, password reset instructions have been sent.";
const CUSTOMER_LOCK_MS = 5 * 60 * 1000;
const ADMIN_LOCK_MS = 15 * 60 * 1000;
const RESET_TOKEN_MS = 15 * 60 * 1000;
const OTP_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const SIGNUP_OTP_MS = 10 * 60 * 1000;
const MFA_CHALLENGE_MS = 5 * 60 * 1000;
const ADMIN_RESET_TOKEN_MS = 15 * 60 * 1000;
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

export class AuthError extends Error {
  constructor(message: string, public code = "AUTH_INVALID_CREDENTIALS", public status = 401, public retryAfterSeconds = 0) {
    super(message);
  }
}

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
  totpEnabled?: boolean;
  role: { id: string; name: RoleName; permissions: Prisma.JsonValue };
  createdAt: Date;
  updatedAt: Date;
};

function safeUser(user: { id: string; name: string; email: string | null; phone: string | null; status: UserStatus; createdAt: Date; updatedAt: Date; passwordHash?: string }): SafeUser {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, status: user.status, createdAt: user.createdAt, updatedAt: user.updatedAt };
}

function safeAdmin(admin: { id: string; name: string; email: string; status: AdminStatus; totpEnabled?: boolean; role: { id: string; name: RoleName; permissions: Prisma.JsonValue }; createdAt: Date; updatedAt: Date; passwordHash?: string }): SafeAdmin {
  return { id: admin.id, name: admin.name, email: admin.email, status: admin.status, totpEnabled: admin.totpEnabled, role: admin.role, createdAt: admin.createdAt, updatedAt: admin.updatedAt };
}

function clientHash(value?: string | null) {
  return value ? hashSecret(value.slice(0, 255)) : undefined;
}

function base32Encode(buffer: Buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  let output = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  for (let index = 0; index < bits.length; index += 5) {
    output += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return output;
}

function base32Decode(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = value.replace(/=+$/g, "").replace(/\s/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new AuthError("Invalid MFA secret.", "AUTH_MFA_INVALID", 400);
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function encryptionKey() {
  const configured = process.env.AUTH_ENCRYPTION_KEY;
  if (!configured && process.env.NODE_ENV === "production") throw new AuthError("AUTH_ENCRYPTION_KEY is required for admin MFA.", "AUTH_PROVIDER_UNAVAILABLE", 503);
  return crypto.createHash("sha256").update(configured || "dev-eagleclub-mfa-key-change-in-production").digest();
}

function encryptSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decryptSecret(value: string | null) {
  if (!value) return null;
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) return null;
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

function totp(secret: string, time = Date.now()) {
  const counter = Math.floor(time / 1000 / TOTP_STEP_SECONDS);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

function verifyTotpPlain(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const now = Date.now();
  return [-1, 0, 1].some((window) => totp(secret, now + window * TOTP_STEP_SECONDS * 1000) === code);
}

function recoveryCode() {
  return `${randomToken(5).toUpperCase()}-${randomToken(5).toUpperCase()}`;
}

function numericOtp() {
  if (process.env.NODE_ENV === "test") return process.env.AUTH_TEST_OTP || "123456";
  return `${crypto.randomInt(0, 1000000)}`.padStart(6, "0");
}

export async function auditAuth(eventType: string, success: boolean, input: { actorKind?: AuthActorKind; actorId?: string; ip?: string; userAgent?: string; metadata?: Prisma.InputJsonValue } = {}) {
  await db.authAuditLog.create({
    data: {
      eventType,
      success,
      actorKind: input.actorKind,
      actorId: input.actorId,
      ipHash: clientHash(input.ip),
      userAgent: input.userAgent?.slice(0, 255),
      metadata: input.metadata,
    },
  }).catch(() => undefined);
}

function ensureCustomerPassword(password: string) {
  const issues = customerPasswordIssues(password);
  if (issues.length) throw new AuthError(issues[0], "AUTH_PASSWORD_WEAK", 400);
}

function ensureAdminPassword(password: string) {
  const issues = adminPasswordIssues(password);
  if (issues.length) throw new AuthError(issues[0], "AUTH_PASSWORD_WEAK", 400);
}

async function createSession(kind: SessionKind, actorId: string, payload: Omit<SessionPayload, "sid">, ip?: string, userAgent?: string) {
  const sid = randomToken(24);
  const expiresAt = new Date(Date.now() + (kind === "admin" ? ADMIN_SESSION_MS : CUSTOMER_SESSION_MS));
  await db.authSession.create({
    data: {
      id: sid,
      tokenHash: hashSecret(sid),
      actorKind: kind === "admin" ? AuthActorKind.ADMIN : AuthActorKind.CUSTOMER,
      userId: kind === "customer" ? actorId : undefined,
      adminUserId: kind === "admin" ? actorId : undefined,
      expiresAt,
      ipHash: clientHash(ip),
      userAgent: userAgent?.slice(0, 255),
    },
  });
  return signSession({ ...payload, sid }, kind === "admin" ? "30m" : "14d");
}

export async function validateDbSession(payload: SessionPayload, kind: SessionKind) {
  const session = await db.authSession.findUnique({ where: { tokenHash: hashSecret(payload.sid) } });
  if (!session || session.status !== AuthSessionStatus.ACTIVE || session.expiresAt <= new Date()) return false;
  if (kind === "customer" && session.userId !== payload.sub) return false;
  if (kind === "admin" && session.adminUserId !== payload.sub) return false;
  await db.authSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  return true;
}

export async function revokeSession(sid?: string) {
  if (!sid) return;
  await db.authSession.updateMany({ where: { tokenHash: hashSecret(sid), status: AuthSessionStatus.ACTIVE }, data: { status: AuthSessionStatus.REVOKED, revokedAt: new Date() } });
}

async function revokeActorSessions(kind: AuthActorKind, actorId: string) {
  await db.authSession.updateMany({
    where: kind === AuthActorKind.CUSTOMER ? { actorKind: kind, userId: actorId, status: AuthSessionStatus.ACTIVE } : { actorKind: kind, adminUserId: actorId, status: AuthSessionStatus.ACTIVE },
    data: { status: AuthSessionStatus.REVOKED, revokedAt: new Date() },
  });
}

function lockedRetry(lockedUntil: Date | null) {
  return lockedUntil && lockedUntil > new Date() ? Math.ceil((lockedUntil.getTime() - Date.now()) / 1000) : 0;
}

export async function registerCustomer(input: { name: string; email: string; phone: string; password: string; terms?: boolean }, ctx: { ip?: string; userAgent?: string } = {}) {
  await auditAuth("CUSTOMER_DIRECT_SIGNUP_BLOCKED", false, { ip: ctx.ip, userAgent: ctx.userAgent });
  throw new AuthError("Verify email or mobile OTP before account creation.", "AUTH_MOBILE_NOT_VERIFIED", 400);
}

export async function requestSignupOtp(input: { name: string; email: string; phone: string; password: string; terms?: boolean; channel: "email" | "mobile" }, ctx: { ip?: string; userAgent?: string } = {}) {
  if (input.channel !== "email") throw new AuthError("Mobile OTP signup is currently disabled. Use email OTP verification.", "AUTH_PROVIDER_UNAVAILABLE", 503);
  if (input.terms === false) throw new AuthError("Terms acceptance is required.", "AUTH_FORBIDDEN", 400);
  ensureCustomerPassword(input.password);
  const email = normalizeEmail(input.email);
  const mobileNumber = normalizeIndianMobile(input.phone);
  const existing = await db.user.findFirst({ where: { OR: [{ email }, { normalizedEmail: email }, { phone: mobileNumber }, { mobileNumber }] } });
  if (existing) throw new AuthError("A customer with this email or phone already exists.", "AUTH_DUPLICATE_ACCOUNT", 409);

  const providerConfigured = process.env.NODE_ENV === "test" || (input.channel === "email" ? isSignupEmailConfigured() : isSignupSmsConfigured());
  if (!providerConfigured) {
    await auditAuth("CUSTOMER_SIGNUP_OTP_PROVIDER_MISSING", false, { ip: ctx.ip, userAgent: ctx.userAgent, metadata: { channel: input.channel } });
    throw new AuthError("Email OTP service is not configured.", "AUTH_PROVIDER_UNAVAILABLE", 503);
  }

  await db.pendingSignup.updateMany({ where: { OR: [{ normalizedEmail: email }, { mobileNumber }], consumedAt: null }, data: { consumedAt: new Date() } });
  const otp = numericOtp();
  if (process.env.NODE_ENV !== "test" && providerConfigured) await sendSignupOtp(input.channel, input.channel === "email" ? email : mobileNumber, otp);
  const pending = await db.pendingSignup.create({
    data: {
      name: input.name.trim(),
      email,
      normalizedEmail: email,
      mobileNumber,
      passwordHash: await bcrypt.hash(input.password, 12),
      channel: input.channel === "email" ? SignupVerificationChannel.EMAIL : SignupVerificationChannel.MOBILE,
      otpHash: await bcrypt.hash(otp, 12),
      expiresAt: new Date(Date.now() + SIGNUP_OTP_MS),
      resendAfter: new Date(Date.now() + OTP_RESEND_MS),
    },
  });
  await auditAuth("CUSTOMER_SIGNUP_OTP_REQUEST", true, { ip: ctx.ip, userAgent: ctx.userAgent, metadata: { channel: input.channel, providerConfigured } });
  return {
    signupId: pending.id,
    message: input.channel === "email" ? "Enter the OTP sent to your email address." : "Enter the OTP sent to your mobile number.",
    providerConfigured,
    resendAfterSeconds: 60,
  };
}

export async function verifySignupOtp(input: { signupId: string; otp: string }, ctx: { ip?: string; userAgent?: string } = {}) {
  const pending = await db.pendingSignup.findUnique({ where: { id: input.signupId } });
  if (!pending || pending.consumedAt || pending.expiresAt <= new Date() || pending.attempts >= pending.maxAttempts) {
    throw new AuthError("Invalid or expired verification code.", "AUTH_TOKEN_INVALID", 400);
  }
  const existing = await db.user.findFirst({ where: { OR: [{ email: pending.email }, { normalizedEmail: pending.normalizedEmail }, { phone: pending.mobileNumber }, { mobileNumber: pending.mobileNumber }] } });
  if (existing) throw new AuthError("A customer with this email or phone already exists.", "AUTH_DUPLICATE_ACCOUNT", 409);
  const valid = await bcrypt.compare(input.otp, pending.otpHash);
  if (!valid) {
    await db.pendingSignup.update({ where: { id: pending.id }, data: { attempts: { increment: 1 } } });
    throw new AuthError("Not valid OTP.", "AUTH_TOKEN_INVALID", 400);
  }

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: pending.name,
        email: pending.email,
        normalizedEmail: pending.normalizedEmail,
        phone: pending.mobileNumber,
        mobileNumber: pending.mobileNumber,
        passwordHash: pending.passwordHash,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: pending.channel === SignupVerificationChannel.EMAIL ? new Date() : undefined,
        mobileVerifiedAt: pending.channel === SignupVerificationChannel.MOBILE ? new Date() : undefined,
        passwordChangedAt: new Date(),
      },
    });
    await tx.pendingSignup.update({ where: { id: pending.id }, data: { consumedAt: new Date() } });
    return created;
  });
  await auditAuth("CUSTOMER_SIGNUP", true, { actorKind: AuthActorKind.CUSTOMER, actorId: user.id, ip: ctx.ip, userAgent: ctx.userAgent, metadata: { verifiedBy: pending.channel } });
  const token = await createSession("customer", user.id, { sub: user.id, kind: "customer", email: user.email }, ctx.ip, ctx.userAgent);
  return { user: safeUser(user), token };
}

export async function loginCustomer(input: { email: string; password: string }, ctx: { ip?: string; userAgent?: string } = {}) {
  const email = normalizeEmail(input.email);
  const user = await db.user.findFirst({ where: { OR: [{ email }, { normalizedEmail: email }] } });
  const invalid = new AuthError("Invalid email or password.", "AUTH_INVALID_CREDENTIALS", 401);
  if (!user) {
    await auditAuth("CUSTOMER_LOGIN_FAILURE", false, { ip: ctx.ip, userAgent: ctx.userAgent });
    throw invalid;
  }
  const retryAfter = lockedRetry(user.lockedUntil);
  if (retryAfter) throw new AuthError("Account temporarily locked. Try again later.", "AUTH_ACCOUNT_LOCKED", 423, retryAfter);
  if (user.status !== UserStatus.ACTIVE) throw new AuthError("Account is not active.", "AUTH_FORBIDDEN", 403);

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + CUSTOMER_LOCK_MS) : null;
    await db.user.update({ where: { id: user.id }, data: { failedLoginAttempts: attempts, lockedUntil } });
    await auditAuth(lockedUntil ? "CUSTOMER_ACCOUNT_LOCKOUT" : "CUSTOMER_LOGIN_FAILURE", false, { actorKind: AuthActorKind.CUSTOMER, actorId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
    throw lockedUntil ? new AuthError("Account temporarily locked. Try again later.", "AUTH_ACCOUNT_LOCKED", 423, Math.ceil(CUSTOMER_LOCK_MS / 1000)) : invalid;
  }

  const updated = await db.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await auditAuth("CUSTOMER_LOGIN_SUCCESS", true, { actorKind: AuthActorKind.CUSTOMER, actorId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
  const token = await createSession("customer", user.id, { sub: user.id, kind: "customer", email: user.email }, ctx.ip, ctx.userAgent);
  return { user: safeUser(updated), token };
}

export async function getCustomerById(id: string) {
  const user = await db.user.findUnique({ where: { id } });
  if (!user || user.status !== UserStatus.ACTIVE) return null;
  return safeUser(user);
}

export async function updateCustomerProfile(id: string, input: { name?: string; phone?: string }) {
  const phone = input.phone ? normalizeIndianMobile(input.phone) : undefined;
  const user = await db.user.update({ where: { id }, data: { name: input.name, phone, mobileNumber: phone } });
  return safeUser(user);
}

function defaultNameFromEmail(email: string | null, fallback: string) {
  const source = email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!source) return fallback;
  return source.split(" ").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase()).join(" ");
}

export async function resetCustomerProfile(id: string) {
  const current = await db.user.findUnique({ where: { id } });
  if (!current) throw new AuthError("Customer not found.", "AUTH_TOKEN_INVALID", 404);
  const user = await db.user.update({ where: { id }, data: { name: defaultNameFromEmail(current.email, "Customer"), phone: null, mobileNumber: null } });
  return safeUser(user);
}

export async function requestCustomerPasswordReset(input: { channel: "email"; email?: string }, ctx: { ip?: string; userAgent?: string } = {}) {
  const providerConfigured = isSignupEmailConfigured();
  const email = input.email ? normalizeEmail(input.email) : "";
  const user = email ? await db.user.findFirst({ where: { OR: [{ email }, { normalizedEmail: email }], status: UserStatus.ACTIVE } }) : null;

  if (user?.emailVerifiedAt) {
    const otp = `${crypto.randomInt(0, 1000000)}`.padStart(6, "0");
    if (!providerConfigured) {
      await auditAuth("CUSTOMER_PASSWORD_RESET_EMAIL_PROVIDER_MISSING", false, { actorKind: AuthActorKind.CUSTOMER, actorId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
      throw new AuthError("Email OTP service is not configured.", "AUTH_PROVIDER_UNAVAILABLE", 503);
    }
    await sendEmailOtp(user.email ?? email, otp, "Your Eagle Mart password reset code");
    await db.passwordResetToken.updateMany({ where: { actorKind: AuthActorKind.CUSTOMER, userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
    await db.passwordResetToken.create({
      data: { tokenHash: await bcrypt.hash(otp, 12), actorKind: AuthActorKind.CUSTOMER, userId: user.id, expiresAt: new Date(Date.now() + SIGNUP_OTP_MS) },
    });
  }

  await auditAuth("CUSTOMER_PASSWORD_RESET_REQUEST", true, { actorKind: AuthActorKind.CUSTOMER, actorId: user?.id, ip: ctx.ip, userAgent: ctx.userAgent });
  return { message: "Enter the OTP sent to your email address.", providerConfigured, resendAfterSeconds: 60 };
}

export async function verifyCustomerResetOtp(input: { email: string; otp: string }) {
  const email = normalizeEmail(input.email);
  const user = await db.user.findFirst({ where: { OR: [{ email }, { normalizedEmail: email }], status: UserStatus.ACTIVE } });
  if (!user?.emailVerifiedAt) throw new AuthError("Not valid OTP.", "AUTH_TOKEN_INVALID", 400);

  const records = await db.passwordResetToken.findMany({
    where: { actorKind: AuthActorKind.CUSTOMER, userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const record of records) {
    if (await bcrypt.compare(input.otp, record.tokenHash)) {
      const grant = randomToken();
      await db.passwordResetToken.update({ where: { id: record.id }, data: { tokenHash: hashSecret(grant) } });
      return { grant };
    }
  }
  throw new AuthError("Not valid OTP.", "AUTH_TOKEN_INVALID", 400);
}

export async function resetCustomerPassword(input: { token?: string; grant?: string; password: string }, ctx: { ip?: string; userAgent?: string } = {}) {
  ensureCustomerPassword(input.password);
  let userId: string | null = null;
  let consume: (() => Promise<unknown>) | null = null;
  if (input.token) {
    const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashSecret(input.token) } });
    if (record?.actorKind === AuthActorKind.CUSTOMER && !record.consumedAt && record.expiresAt > new Date() && record.userId) {
      userId = record.userId;
      consume = () => db.passwordResetToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    }
  } else if (input.grant) {
    const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashSecret(input.grant) } });
    if (record?.actorKind === AuthActorKind.CUSTOMER && !record.consumedAt && record.expiresAt > new Date() && record.userId) {
      userId = record.userId;
      consume = () => db.passwordResetToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    }
  }
  if (!userId || !consume) throw new AuthError("Reset token is invalid or expired.", "AUTH_TOKEN_INVALID", 400);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new AuthError("Reset token is invalid or expired.", "AUTH_TOKEN_INVALID", 400);
  if (await bcrypt.compare(input.password, user.passwordHash)) throw new AuthError("Choose a new password that is different from your current password.", "AUTH_PASSWORD_REUSED", 400);
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(input.password, 12), passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } }),
    consume() as Prisma.PrismaPromise<unknown>,
    db.authSession.updateMany({ where: { actorKind: AuthActorKind.CUSTOMER, userId: user.id, status: AuthSessionStatus.ACTIVE }, data: { status: AuthSessionStatus.REVOKED, revokedAt: new Date() } }),
  ]);
  await auditAuth("CUSTOMER_PASSWORD_RESET_COMPLETE", true, { actorKind: AuthActorKind.CUSTOMER, actorId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
  return { reset: true };
}

export async function updateAdminProfile(id: string, input: { name?: string }) {
  const admin = await db.adminUser.update({ where: { id }, data: input, include: { role: true } });
  return safeAdmin(admin);
}

export async function resetAdminProfile(id: string) {
  const current = await db.adminUser.findUnique({ where: { id }, include: { role: true } });
  if (!current) throw new AuthError("Admin not found.", "AUTH_TOKEN_INVALID", 404);
  const admin = await db.adminUser.update({ where: { id }, data: { name: current.role.name === RoleName.SUPER_ADMIN ? "Eagle Mart Super Admin" : defaultNameFromEmail(current.email, "Eagle Mart Admin") }, include: { role: true } });
  return safeAdmin(admin);
}

export async function loginAdmin(input: { email: string; password: string }, ctx: { ip?: string; userAgent?: string } = {}) {
  const email = normalizeEmail(input.email);
  const admin = await db.adminUser.findFirst({ where: { OR: [{ email }, { normalizedEmail: email }] }, include: { role: true } });
  const invalid = new AuthError("Invalid email or password.", "AUTH_INVALID_CREDENTIALS", 401);
  if (!admin) throw invalid;
  const retryAfter = lockedRetry(admin.lockedUntil);
  if (retryAfter) throw new AuthError("Account temporarily locked. Try again later.", "AUTH_ACCOUNT_LOCKED", 423, retryAfter);
  if (admin.status !== AdminStatus.ACTIVE) throw new AuthError("Admin account is not active.", "AUTH_FORBIDDEN", 403);
  const valid = await bcrypt.compare(input.password, admin.passwordHash);
  if (!valid) {
    const attempts = admin.failedLoginAttempts + 1;
    const lockedUntil = attempts >= 3 ? new Date(Date.now() + ADMIN_LOCK_MS) : null;
    await db.adminUser.update({ where: { id: admin.id }, data: { failedLoginAttempts: attempts, lockedUntil } });
    await auditAuth(lockedUntil ? "ADMIN_ACCOUNT_LOCKOUT" : "ADMIN_LOGIN_FAILURE", false, { actorKind: AuthActorKind.ADMIN, actorId: admin.id, ip: ctx.ip, userAgent: ctx.userAgent });
    throw lockedUntil ? new AuthError("Account temporarily locked. Try again later.", "AUTH_ACCOUNT_LOCKED", 423, Math.ceil(ADMIN_LOCK_MS / 1000)) : invalid;
  }
  if (admin.totpEnabled) {
    const challengeId = randomToken(24);
    await db.passwordResetToken.create({ data: { id: challengeId, tokenHash: hashSecret(challengeId), actorKind: AuthActorKind.ADMIN, adminUserId: admin.id, expiresAt: new Date(Date.now() + MFA_CHALLENGE_MS) } });
    return { mfaRequired: true, challengeId, admin: safeAdmin(admin) };
  }
  const updated = await db.adminUser.update({ where: { id: admin.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }, include: { role: true } });
  const token = await createSession("admin", admin.id, { sub: admin.id, kind: "admin", email: admin.email, role: admin.role.name }, ctx.ip, ctx.userAgent);
  await auditAuth("ADMIN_LOGIN_SUCCESS", true, { actorKind: AuthActorKind.ADMIN, actorId: admin.id, ip: ctx.ip, userAgent: ctx.userAgent });
  return { admin: safeAdmin(updated), token };
}

export async function verifyAdminMfa(input: { challengeId: string; code: string }, ctx: { ip?: string; userAgent?: string } = {}) {
  const challenge = await db.passwordResetToken.findUnique({ where: { tokenHash: hashSecret(input.challengeId) }, include: { adminUser: { include: { role: true } } } });
  if (!challenge?.adminUser || challenge.actorKind !== AuthActorKind.ADMIN || challenge.consumedAt || challenge.expiresAt <= new Date()) {
    throw new AuthError("Invalid MFA challenge.", "AUTH_MFA_INVALID", 401);
  }
  const admin = challenge.adminUser;
  const validRecovery = await consumeRecoveryCode(admin.id, input.code);
  const validTotp = validRecovery || verifyTotpCode(admin.encryptedTotpSecret, input.code);
  if (!validTotp) throw new AuthError("Invalid verification code.", "AUTH_MFA_INVALID", 401);
  await db.passwordResetToken.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
  const updated = await db.adminUser.update({ where: { id: admin.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), totpVerifiedAt: new Date() }, include: { role: true } });
  const token = await createSession("admin", admin.id, { sub: admin.id, kind: "admin", email: admin.email, role: admin.role.name }, ctx.ip, ctx.userAgent);
  return { admin: safeAdmin(updated), token };
}

export async function getAdminById(id: string) {
  const admin = await db.adminUser.findUnique({ where: { id }, include: { role: true } });
  if (!admin || admin.status !== AdminStatus.ACTIVE) return null;
  return safeAdmin(admin);
}

export async function changeAdminPassword(id: string, input: { currentPassword: string; password: string }, sid?: string) {
  ensureAdminPassword(input.password);
  const admin = await db.adminUser.findUnique({ where: { id } });
  if (!admin || !(await bcrypt.compare(input.currentPassword, admin.passwordHash))) throw new AuthError("Invalid current password.", "AUTH_INVALID_CREDENTIALS", 401);
  if (await bcrypt.compare(input.password, admin.passwordHash)) throw new AuthError("Choose a new password.", "AUTH_PASSWORD_REUSED", 400);
  await db.adminUser.update({ where: { id }, data: { passwordHash: await bcrypt.hash(input.password, 12), passwordChangedAt: new Date() } });
  await revokeActorSessions(AuthActorKind.ADMIN, id);
  if (sid) await db.authSession.updateMany({ where: { tokenHash: hashSecret(sid) }, data: { status: AuthSessionStatus.ACTIVE, revokedAt: null } });
  await auditAuth("ADMIN_PASSWORD_CHANGE", true, { actorKind: AuthActorKind.ADMIN, actorId: id });
}

export async function beginAdminMfaEnrollment(id: string) {
  const admin = await db.adminUser.findUnique({ where: { id }, include: { role: true } });
  if (!admin || admin.status !== AdminStatus.ACTIVE) throw new AuthError("Admin account is not active.", "AUTH_FORBIDDEN", 403);
  const secret = base32Encode(crypto.randomBytes(20));
  const issuer = process.env.TOTP_ISSUER || "Eagle Mart";
  const label = `${issuer}:${admin.email}`;
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
  await db.adminUser.update({ where: { id }, data: { encryptedTotpSecret: encryptSecret(secret), totpEnabled: false, totpVerifiedAt: null } });
  await auditAuth("ADMIN_MFA_ENROLLMENT_STARTED", true, { actorKind: AuthActorKind.ADMIN, actorId: id });
  return { secret, otpauthUrl, issuer, account: admin.email };
}

export async function confirmAdminMfaEnrollment(id: string, code: string) {
  const admin = await db.adminUser.findUnique({ where: { id }, include: { role: true } });
  const secret = decryptSecret(admin?.encryptedTotpSecret || null);
  if (!admin || !secret || !verifyTotpPlain(secret, code)) throw new AuthError("Invalid verification code.", "AUTH_MFA_INVALID", 401);
  const codes = Array.from({ length: 10 }, recoveryCode);
  await db.$transaction([
    db.adminMfaRecoveryCode.deleteMany({ where: { adminUserId: id, usedAt: null } }),
    db.adminUser.update({ where: { id }, data: { totpEnabled: true, totpVerifiedAt: new Date() } }),
    db.adminMfaRecoveryCode.createMany({ data: await Promise.all(codes.map(async (codeValue) => ({ adminUserId: id, codeHash: await bcrypt.hash(codeValue, 12) }))) }),
  ]);
  await auditAuth("ADMIN_MFA_ENABLED", true, { actorKind: AuthActorKind.ADMIN, actorId: id });
  return { recoveryCodes: codes };
}

export async function disableAdminMfa(id: string, input: { password: string; code: string }) {
  const admin = await db.adminUser.findUnique({ where: { id } });
  if (!admin || !(await bcrypt.compare(input.password, admin.passwordHash))) throw new AuthError("Invalid verification details.", "AUTH_INVALID_CREDENTIALS", 401);
  const valid = (admin.encryptedTotpSecret ? verifyTotpCode(admin.encryptedTotpSecret, input.code) : false) || await consumeRecoveryCode(id, input.code);
  if (!valid) throw new AuthError("Invalid verification code.", "AUTH_MFA_INVALID", 401);
  await db.$transaction([
    db.adminUser.update({ where: { id }, data: { totpEnabled: false, encryptedTotpSecret: null, totpVerifiedAt: null } }),
    db.adminMfaRecoveryCode.deleteMany({ where: { adminUserId: id } }),
  ]);
  await auditAuth("ADMIN_MFA_DISABLED", true, { actorKind: AuthActorKind.ADMIN, actorId: id });
  return { disabled: true };
}

export async function regenerateAdminRecoveryCodes(id: string, code: string) {
  const admin = await db.adminUser.findUnique({ where: { id } });
  if (!admin?.totpEnabled || !verifyTotpCode(admin.encryptedTotpSecret, code)) throw new AuthError("Invalid verification code.", "AUTH_MFA_INVALID", 401);
  const codes = Array.from({ length: 10 }, recoveryCode);
  await db.$transaction([
    db.adminMfaRecoveryCode.deleteMany({ where: { adminUserId: id, usedAt: null } }),
    db.adminMfaRecoveryCode.createMany({ data: await Promise.all(codes.map(async (codeValue) => ({ adminUserId: id, codeHash: await bcrypt.hash(codeValue, 12) }))) }),
  ]);
  await auditAuth("ADMIN_MFA_RECOVERY_CODES_REGENERATED", true, { actorKind: AuthActorKind.ADMIN, actorId: id });
  return { recoveryCodes: codes };
}

export async function requestAdminPasswordReset(input: { email: string }, ctx: { ip?: string; userAgent?: string } = {}) {
  const email = normalizeEmail(input.email);
  const admin = await db.adminUser.findFirst({ where: { OR: [{ email }, { normalizedEmail: email }] } });
  if (admin) {
    await db.passwordResetToken.updateMany({ where: { actorKind: AuthActorKind.ADMIN, adminUserId: admin.id, consumedAt: null }, data: { consumedAt: new Date() } });
    const token = randomToken();
    await db.passwordResetToken.create({ data: { tokenHash: hashSecret(token), actorKind: AuthActorKind.ADMIN, adminUserId: admin.id, expiresAt: new Date(Date.now() + ADMIN_RESET_TOKEN_MS) } });
    if (!isEmailConfigured()) await auditAuth("ADMIN_PASSWORD_RESET_EMAIL_PROVIDER_MISSING", false, { actorKind: AuthActorKind.ADMIN, actorId: admin.id, ip: ctx.ip, userAgent: ctx.userAgent });
  }
  await auditAuth("ADMIN_PASSWORD_RESET_REQUEST", true, { ip: ctx.ip, userAgent: ctx.userAgent });
  return { message: GENERIC_RESET_MESSAGE, providerConfigured: isEmailConfigured() };
}

export async function resetAdminPassword(input: { token: string; password: string }, ctx: { ip?: string; userAgent?: string } = {}) {
  ensureAdminPassword(input.password);
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashSecret(input.token) }, include: { adminUser: true } });
  if (!record?.adminUser || record.actorKind !== AuthActorKind.ADMIN || record.consumedAt || record.expiresAt <= new Date()) throw new AuthError("Reset token is invalid or expired.", "AUTH_TOKEN_INVALID", 400);
  if (await bcrypt.compare(input.password, record.adminUser.passwordHash)) throw new AuthError("Choose a new password.", "AUTH_PASSWORD_REUSED", 400);
  await db.$transaction([
    db.adminUser.update({ where: { id: record.adminUser.id }, data: { passwordHash: await bcrypt.hash(input.password, 12), passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
    db.authSession.updateMany({ where: { actorKind: AuthActorKind.ADMIN, adminUserId: record.adminUser.id, status: AuthSessionStatus.ACTIVE }, data: { status: AuthSessionStatus.REVOKED, revokedAt: new Date() } }),
  ]);
  await auditAuth("ADMIN_PASSWORD_RESET_COMPLETE", true, { actorKind: AuthActorKind.ADMIN, actorId: record.adminUser.id, ip: ctx.ip, userAgent: ctx.userAgent });
  return { reset: true };
}

function isEmailConfigured() {
  return Boolean(process.env.EMAIL_PROVIDER || process.env.SENDGRID_API_KEY || process.env.AWS_SES_REGION || process.env.SMTP_HOST || isGmailSmtpConfigured());
}

function isSmsConfigured() {
  return Boolean(process.env.SMS_PROVIDER || (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER));
}

function isSignupEmailConfigured() {
  return Boolean(isGenericSmtpConfigured() || isGmailSmtpConfigured() || (process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM));
}

function isSignupSmsConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

function isGmailSmtpConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function isGenericSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM);
}

function senderEmail() {
  return process.env.EMAIL_FROM || process.env.GMAIL_USER || process.env.SMTP_FROM || "";
}

async function sendGenericSmtpOtp(target: string, otp: string, subject: string) {
  if (!isGenericSmtpConfigured()) return false;
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465 || port === 25025,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  await transporter.sendMail({
    from: { name: process.env.EMAIL_FROM_NAME || "Eagle Mart", address: senderEmail() },
    to: target,
    subject,
    text: `Your Eagle Mart verification code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your Eagle Mart verification code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
  return true;
}

async function sendGmailSmtpOtp(target: string, otp: string, subject: string) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return false;
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, ""),
    },
  });
  await transporter.sendMail({
    from: { name: "Eagle Mart", address: senderEmail() || process.env.GMAIL_USER },
    to: target,
    subject,
    text: `Your Eagle Mart verification code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your Eagle Mart verification code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
  return true;
}

async function sendEmailOtp(target: string, otp: string, subject = "Your Eagle Mart verification code") {
  try {
    if (await sendGenericSmtpOtp(target, otp, subject)) return;
  } catch (error) {
    throw new AuthError(error instanceof Error ? `SMTP provider could not send OTP: ${error.message}` : "SMTP provider could not send OTP.", "AUTH_PROVIDER_UNAVAILABLE", 503);
  }

  try {
    if (await sendGmailSmtpOtp(target, otp, subject)) return;
  } catch (error) {
    const detail = error instanceof Error && /Username and Password not accepted|Invalid login|BadCredentials/i.test(error.message)
      ? "Gmail rejected the SMTP login. Use a Google App Password, not the Gmail account password."
      : "Gmail SMTP could not send OTP.";
    throw new AuthError(detail, "AUTH_PROVIDER_UNAVAILABLE", 503);
  }

  if (process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM) {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: target }] }],
        from: { email: senderEmail() },
        subject,
        content: [{ type: "text/plain", value: `Your Eagle Mart verification code is ${otp}. It expires in 10 minutes.` }],
      }),
    });
    if (!response.ok) throw new AuthError("Could not send email verification code.", "AUTH_PROVIDER_UNAVAILABLE", 503);
  }
}

async function sendSignupOtp(channel: "email" | "mobile", target: string, otp: string) {
  if (channel === "email") return sendEmailOtp(target, otp);
  if (channel === "mobile" && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: process.env.TWILIO_FROM_NUMBER, To: target.startsWith("+") ? target : `+91${target}`, Body: `Your Eagle Mart verification code is ${otp}. It expires in 10 minutes.` }),
    });
    if (!response.ok) throw new AuthError("Could not send mobile verification code.", "AUTH_PROVIDER_UNAVAILABLE", 503);
  }
}

export function providerStatus() {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL),
    apple: Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY && process.env.APPLE_CALLBACK_URL),
    email: isEmailConfigured() || isSignupEmailConfigured(),
    sms: isSmsConfigured(),
    turnstile: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY),
    redis: Boolean(process.env.REDIS_URL),
  };
}

export async function beginOAuth(provider: OAuthProvider) {
  const status = providerStatus();
  if ((provider === OAuthProvider.GOOGLE && !status.google) || (provider === OAuthProvider.APPLE && !status.apple)) {
    throw new AuthError("Authentication provider is not configured.", "AUTH_PROVIDER_UNAVAILABLE", 503);
  }
  throw new AuthError("OAuth callback credentials are configured, but provider exchange is not enabled in this build.", "AUTH_PROVIDER_UNAVAILABLE", 503);
}

export function googleAuthorizationUrl(input: { state: string; nonce: string }) {
  if (!providerStatus().google) throw new AuthError("Google authentication is not configured.", "AUTH_PROVIDER_UNAVAILABLE", 503);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_CALLBACK_URL!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function completeGoogleOAuth(input: { code: string; nonce: string }, ctx: { ip?: string; userAgent?: string } = {}) {
  if (!providerStatus().google) throw new AuthError("Google authentication is not configured.", "AUTH_PROVIDER_UNAVAILABLE", 503);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_CALLBACK_URL!,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) throw new AuthError("Google sign in failed.", "AUTH_INVALID_CREDENTIALS", 401);
  const tokenBody = await tokenResponse.json() as { id_token?: string };
  if (!tokenBody.id_token) throw new AuthError("Google sign in failed.", "AUTH_INVALID_CREDENTIALS", 401);

  const verifyResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenBody.id_token)}`);
  if (!verifyResponse.ok) throw new AuthError("Google sign in failed.", "AUTH_INVALID_CREDENTIALS", 401);
  const profile = await verifyResponse.json() as { aud?: string; iss?: string; sub?: string; email?: string; email_verified?: string | boolean; name?: string; nonce?: string; exp?: string };
  const emailVerified = profile.email_verified === true || profile.email_verified === "true";
  const validIssuer = profile.iss === "https://accounts.google.com" || profile.iss === "accounts.google.com";
  const notExpired = profile.exp ? Number(profile.exp) * 1000 > Date.now() : true;
  if (!profile.sub || !profile.email || profile.aud !== process.env.GOOGLE_CLIENT_ID || !validIssuer || !notExpired || profile.nonce !== input.nonce || !emailVerified) {
    throw new AuthError("Google account could not be verified.", "AUTH_INVALID_CREDENTIALS", 401);
  }

  const email = normalizeEmail(profile.email);
  let account = await db.oAuthAccount.findUnique({ where: { provider_providerAccountId: { provider: OAuthProvider.GOOGLE, providerAccountId: profile.sub } }, include: { user: true } });
  if (!account) {
    let user = await db.user.findFirst({ where: { OR: [{ email }, { normalizedEmail: email }] } });
    if (!user) {
      user = await db.user.create({
        data: {
          name: profile.name?.trim() || defaultNameFromEmail(email, "Google Customer"),
          email,
          normalizedEmail: email,
          passwordHash: await bcrypt.hash(randomToken(), 12),
          emailVerifiedAt: new Date(),
          status: UserStatus.ACTIVE,
        },
      });
    } else if (user.status !== UserStatus.ACTIVE) {
      throw new AuthError("Account is not active.", "AUTH_FORBIDDEN", 403);
    }
    account = await db.oAuthAccount.create({
      data: { userId: user.id, provider: OAuthProvider.GOOGLE, providerAccountId: profile.sub, providerEmail: email, emailVerified: true },
      include: { user: true },
    });
    await auditAuth("GOOGLE_ACCOUNT_LINKED", true, { actorKind: AuthActorKind.CUSTOMER, actorId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
  }

  if (account.user.status !== UserStatus.ACTIVE) throw new AuthError("Account is not active.", "AUTH_FORBIDDEN", 403);
  const user = await db.user.update({ where: { id: account.userId }, data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), emailVerifiedAt: account.user.emailVerifiedAt || new Date() } });
  const token = await createSession("customer", user.id, { sub: user.id, kind: "customer", email: user.email }, ctx.ip, ctx.userAgent);
  await auditAuth("CUSTOMER_GOOGLE_LOGIN_SUCCESS", true, { actorKind: AuthActorKind.CUSTOMER, actorId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
  return { user: safeUser(user), token };
}

function verifyTotpCode(encryptedSecret: string | null, code: string) {
  const secret = decryptSecret(encryptedSecret);
  if (!secret) return false;
  return verifyTotpPlain(secret, code);
}

async function consumeRecoveryCode(adminUserId: string, code: string) {
  if (!/^[A-Z0-9-]{8,}$/i.test(code)) return false;
  const records = await db.adminMfaRecoveryCode.findMany({ where: { adminUserId, usedAt: null } });
  for (const record of records) {
    if (await bcrypt.compare(code, record.codeHash)) {
      await db.adminMfaRecoveryCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      return true;
    }
  }
  return false;
}
