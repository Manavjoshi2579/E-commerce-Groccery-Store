import bcrypt from "bcrypt";
import crypto from "crypto";
import { AdminStatus, AuthActorKind, AuthSessionStatus, OAuthProvider, OtpPurpose, Prisma, RoleName, UserStatus } from "@prisma/client";
import { db } from "../lib/db.js";
import { ADMIN_SESSION_MS, CUSTOMER_SESSION_MS, hashSecret, randomToken, signSession, type SessionKind, type SessionPayload } from "../lib/auth.js";
import { adminPasswordIssues, customerPasswordIssues, normalizeEmail, normalizeIndianMobile } from "../validators/auth.js";

const GENERIC_RESET_MESSAGE = "If an account exists, password reset instructions have been sent.";
const CUSTOMER_LOCK_MS = 5 * 60 * 1000;
const ADMIN_LOCK_MS = 15 * 60 * 1000;
const RESET_TOKEN_MS = 15 * 60 * 1000;
const OTP_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const MFA_CHALLENGE_MS = 5 * 60 * 1000;

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
  if (input.terms === false) throw new AuthError("Terms acceptance is required.", "AUTH_FORBIDDEN", 400);
  ensureCustomerPassword(input.password);
  const email = normalizeEmail(input.email);
  const mobileNumber = normalizeIndianMobile(input.phone);
  const existing = await db.user.findFirst({ where: { OR: [{ email }, { normalizedEmail: email }, { phone: mobileNumber }, { mobileNumber }] } });
  if (existing) throw new AuthError("A customer with this email or phone already exists.", "AUTH_DUPLICATE_ACCOUNT", 409);

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await db.user.create({
    data: { name: input.name.trim(), email, normalizedEmail: email, phone: mobileNumber, mobileNumber, passwordHash, status: UserStatus.ACTIVE, passwordChangedAt: new Date() },
  });
  await auditAuth("CUSTOMER_SIGNUP", true, { actorKind: AuthActorKind.CUSTOMER, actorId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
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

export async function requestCustomerPasswordReset(input: { channel: "email" | "sms"; email?: string; phone?: string }, ctx: { ip?: string; userAgent?: string } = {}) {
  if (input.channel === "email") {
    const email = input.email ? normalizeEmail(input.email) : "";
    const user = email ? await db.user.findFirst({ where: { OR: [{ email }, { normalizedEmail: email }] } }) : null;
    if (user) {
      await db.passwordResetToken.updateMany({ where: { actorKind: AuthActorKind.CUSTOMER, userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
      const token = randomToken();
      await db.passwordResetToken.create({ data: { tokenHash: hashSecret(token), actorKind: AuthActorKind.CUSTOMER, userId: user.id, expiresAt: new Date(Date.now() + RESET_TOKEN_MS) } });
      if (!isEmailConfigured()) await auditAuth("CUSTOMER_PASSWORD_RESET_EMAIL_PROVIDER_MISSING", false, { actorKind: AuthActorKind.CUSTOMER, actorId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
    }
    await auditAuth("CUSTOMER_PASSWORD_RESET_REQUEST", true, { ip: ctx.ip, userAgent: ctx.userAgent });
    return { message: GENERIC_RESET_MESSAGE, providerConfigured: isEmailConfigured() };
  }

  const phone = input.phone ? normalizeIndianMobile(input.phone) : "";
  const user = phone ? await db.user.findFirst({ where: { OR: [{ phone }, { mobileNumber: phone }] } }) : null;
  if (user) {
    await db.mobileOtpChallenge.updateMany({ where: { purpose: OtpPurpose.PASSWORD_RESET, userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } });
    const otp = `${crypto.randomInt(0, 1000000)}`.padStart(6, "0");
    await db.mobileOtpChallenge.create({
      data: { otpHash: await bcrypt.hash(otp, 12), purpose: OtpPurpose.PASSWORD_RESET, userId: user.id, mobileNumber: phone, expiresAt: new Date(Date.now() + OTP_MS), resendAfter: new Date(Date.now() + OTP_RESEND_MS) },
    });
    if (!isSmsConfigured()) await auditAuth("CUSTOMER_PASSWORD_RESET_SMS_PROVIDER_MISSING", false, { actorKind: AuthActorKind.CUSTOMER, actorId: user.id, ip: ctx.ip, userAgent: ctx.userAgent });
  }
  return { message: GENERIC_RESET_MESSAGE, providerConfigured: isSmsConfigured(), resendAfterSeconds: 60 };
}

export async function verifyCustomerResetOtp(input: { phone: string; otp: string }) {
  const phone = normalizeIndianMobile(input.phone);
  const challenge = await db.mobileOtpChallenge.findFirst({ where: { mobileNumber: phone, purpose: OtpPurpose.PASSWORD_RESET, consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!challenge || challenge.expiresAt <= new Date() || challenge.attempts >= challenge.maxAttempts) throw new AuthError("Invalid or expired verification code.", "AUTH_TOKEN_INVALID", 400);
  const valid = await bcrypt.compare(input.otp, challenge.otpHash);
  if (!valid) {
    await db.mobileOtpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new AuthError("Invalid or expired verification code.", "AUTH_TOKEN_INVALID", 400);
  }
  const grant = randomToken();
  await db.mobileOtpChallenge.update({ where: { id: challenge.id }, data: { verifiedAt: new Date(), resetGrantHash: hashSecret(grant) } });
  return { grant };
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
    const record = await db.mobileOtpChallenge.findUnique({ where: { resetGrantHash: hashSecret(input.grant) } });
    if (record && !record.consumedAt && record.verifiedAt && record.expiresAt > new Date() && record.userId) {
      userId = record.userId;
      consume = () => db.mobileOtpChallenge.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
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

function isEmailConfigured() {
  return Boolean(process.env.EMAIL_PROVIDER || process.env.SENDGRID_API_KEY || process.env.AWS_SES_REGION || process.env.SMTP_HOST);
}

function isSmsConfigured() {
  return Boolean(process.env.SMS_PROVIDER || (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER));
}

export function providerStatus() {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL),
    apple: Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY && process.env.APPLE_CALLBACK_URL),
    email: isEmailConfigured(),
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
  if (!encryptedSecret || !/^\d{6}$/.test(code)) return false;
  return false;
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
