import { Router } from "express";
import { clearSessionCookie, setSessionCookie } from "../../../lib/auth.js";
import { sendError, sendOk } from "../../../lib/http.js";
import { requireAdmin } from "../../../middleware/auth.js";
import { otpRateLimit, strictAuthRateLimit } from "../../../middleware/rate-limit.js";
import { AuthError, beginAdminMfaEnrollment, changeAdminPassword, confirmAdminMfaEnrollment, disableAdminMfa, getAdminById, loginAdmin, providerStatus, regenerateAdminRecoveryCodes, requestAdminPasswordReset, resetAdminPassword, resetAdminProfile, revokeSession, updateAdminProfile, verifyAdminMfa } from "../../../services/auth.service.js";
import { adminMfaConfirmSchema, adminMfaDisableSchema, adminMfaVerifySchema, adminPasswordResetRequestSchema, adminPasswordResetSchema, adminProfileSchema, changePasswordSchema, loginSchema } from "../../../validators/auth.js";

export const adminAuthRouter = Router();

adminAuthRouter.post("/login", strictAuthRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid login payload.");

  try {
    const result = await loginAdmin(parsed.data, { ip: req.ip, userAgent: req.get("user-agent") });
    if ("mfaRequired" in result) return sendOk(res, { mfaRequired: true, challengeId: result.challengeId });
    setSessionCookie(res, "admin", result.token);
    return sendOk(res, { admin: result.admin, mfaRequired: false });
  } catch (error) {
    return sendAuthError(res, error, "Admin login failed.");
  }
});

adminAuthRouter.post("/mfa/verify", strictAuthRateLimit, async (req, res) => {
  const parsed = adminMfaVerifySchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid MFA payload.", "AUTH_MFA_INVALID");
  try {
    const result = await verifyAdminMfa(parsed.data, { ip: req.ip, userAgent: req.get("user-agent") });
    setSessionCookie(res, "admin", result.token);
    return sendOk(res, { admin: result.admin });
  } catch (error) {
    return sendAuthError(res, error, "MFA verification failed.");
  }
});

adminAuthRouter.post("/forgot-password", otpRateLimit, async (req, res) => {
  const parsed = adminPasswordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid recovery payload.", "AUTH_TOKEN_INVALID");
  try {
    return sendOk(res, await requestAdminPasswordReset(parsed.data, { ip: req.ip, userAgent: req.get("user-agent") }));
  } catch (error) {
    return sendAuthError(res, error, "Could not start password recovery.");
  }
});

adminAuthRouter.post("/reset-password", strictAuthRateLimit, async (req, res) => {
  const parsed = adminPasswordResetSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid reset payload.", "AUTH_TOKEN_INVALID");
  try {
    clearSessionCookie(res, "admin");
    return sendOk(res, await resetAdminPassword(parsed.data, { ip: req.ip, userAgent: req.get("user-agent") }));
  } catch (error) {
    return sendAuthError(res, error, "Could not reset password.");
  }
});

adminAuthRouter.post("/logout", async (req, res) => {
  await revokeSession(req.session?.sid);
  clearSessionCookie(res, "admin");
  return sendOk(res, { loggedOut: true });
});

adminAuthRouter.get("/config", requireAdmin, (_req, res) => sendOk(res, { providers: providerStatus() }));

adminAuthRouter.get("/me", requireAdmin, async (req, res) => {
  const admin = await getAdminById(req.admin!.id);
  if (!admin) return sendError(res, 401, "Admin account is not active.");
  return sendOk(res, { admin });
});

adminAuthRouter.patch("/profile", requireAdmin, async (req, res) => {
  const parsed = adminProfileSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid profile payload.");
  try {
    return sendOk(res, { admin: await updateAdminProfile(req.admin!.id, parsed.data) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not update admin profile.");
  }
});

adminAuthRouter.post("/profile/reset", requireAdmin, async (req, res) => {
  try {
    return sendOk(res, { admin: await resetAdminProfile(req.admin!.id) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not reset admin profile.");
  }
});

adminAuthRouter.post("/password/change", requireAdmin, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid password payload.", "AUTH_TOKEN_INVALID");
  try {
    await changeAdminPassword(req.admin!.id, parsed.data, req.session?.sid);
    clearSessionCookie(res, "admin");
    return sendOk(res, { changed: true });
  } catch (error) {
    return sendAuthError(res, error, "Could not change password.");
  }
});

adminAuthRouter.post("/mfa/enroll", requireAdmin, async (req, res) => {
  try {
    return sendOk(res, await beginAdminMfaEnrollment(req.admin!.id));
  } catch (error) {
    return sendAuthError(res, error, "Could not start MFA enrollment.");
  }
});

adminAuthRouter.post("/mfa/confirm", requireAdmin, async (req, res) => {
  const parsed = adminMfaConfirmSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid MFA payload.", "AUTH_MFA_INVALID");
  try {
    return sendOk(res, await confirmAdminMfaEnrollment(req.admin!.id, parsed.data.code));
  } catch (error) {
    return sendAuthError(res, error, "Could not confirm MFA.");
  }
});

adminAuthRouter.post("/mfa/disable", requireAdmin, async (req, res) => {
  const parsed = adminMfaDisableSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid MFA payload.", "AUTH_MFA_INVALID");
  try {
    return sendOk(res, await disableAdminMfa(req.admin!.id, parsed.data));
  } catch (error) {
    return sendAuthError(res, error, "Could not disable MFA.");
  }
});

adminAuthRouter.post("/mfa/recovery-codes", requireAdmin, async (req, res) => {
  const parsed = adminMfaConfirmSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid MFA payload.", "AUTH_MFA_INVALID");
  try {
    return sendOk(res, await regenerateAdminRecoveryCodes(req.admin!.id, parsed.data.code));
  } catch (error) {
    return sendAuthError(res, error, "Could not regenerate recovery codes.");
  }
});

function sendAuthError(res: Parameters<typeof sendError>[0], error: unknown, fallback: string) {
  if (error instanceof AuthError) {
    return res.status(error.status).json({ ok: false, error: { code: error.code, message: error.message, retryAfterSeconds: error.retryAfterSeconds } });
  }
  return sendError(res, 400, error instanceof Error ? error.message : fallback, "AUTH_TOKEN_INVALID");
}
