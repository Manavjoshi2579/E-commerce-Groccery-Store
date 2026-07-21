import { Router } from "express";
import { clearSessionCookie, randomToken, setSessionCookie } from "../../lib/auth.js";
import { sendError, sendOk } from "../../lib/http.js";
import { requireCustomer } from "../../middleware/auth.js";
import { otpRateLimit, strictAuthRateLimit } from "../../middleware/rate-limit.js";
import { AuthError, beginOAuth, completeGoogleOAuth, getCustomerById, googleAuthorizationUrl, loginCustomer, providerStatus, requestCustomerPasswordReset, requestSignupOtp, resetCustomerPassword, resetCustomerProfile, revokeSession, updateCustomerProfile, verifyCustomerResetOtp, verifySignupOtp } from "../../services/auth.service.js";
import { forgotPasswordSchema, loginSchema, profileSchema, resetPasswordSchema, signupOtpRequestSchema, signupOtpVerifySchema, verifyOtpSchema } from "../../validators/auth.js";
import { OAuthProvider } from "@prisma/client";

export const customerAuthRouter = Router();
const GOOGLE_OAUTH_COOKIE = "ec_google_oauth";

function frontendUrl(path: string) {
  const origin = (process.env.FRONTEND_ORIGIN || "http://localhost:3000").split(",")[0]?.trim() || "http://localhost:3000";
  return `${origin}${path}`;
}

function oauthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60 * 1000,
    path: "/api/auth/google",
    domain: process.env.COOKIE_DOMAIN || undefined,
  };
}

customerAuthRouter.post("/register", strictAuthRateLimit, async (req, res) => {
  const parsed = signupOtpVerifySchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "Verify email or mobile OTP before account creation.", "AUTH_MOBILE_NOT_VERIFIED");

  try {
    const result = await verifySignupOtp(parsed.data, { ip: req.ip, userAgent: req.get("user-agent") });
    setSessionCookie(res, "customer", result.token);
    return sendOk(res, { user: result.user }, 201);
  } catch (error) {
    return sendAuthError(res, error, "Registration failed.");
  }
});

customerAuthRouter.post("/signup/request-otp", otpRateLimit, async (req, res) => {
  const parsed = signupOtpRequestSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid signup payload.");
  try {
    return sendOk(res, await requestSignupOtp(parsed.data, { ip: req.ip, userAgent: req.get("user-agent") }), 201);
  } catch (error) {
    return sendAuthError(res, error, "Could not send verification code.");
  }
});

customerAuthRouter.post("/signup/verify-otp", strictAuthRateLimit, async (req, res) => {
  const parsed = signupOtpVerifySchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid verification payload.", "AUTH_TOKEN_INVALID");
  try {
    const result = await verifySignupOtp(parsed.data, { ip: req.ip, userAgent: req.get("user-agent") });
    setSessionCookie(res, "customer", result.token);
    return sendOk(res, { user: result.user }, 201);
  } catch (error) {
    return sendAuthError(res, error, "Registration failed.");
  }
});

customerAuthRouter.post("/login", strictAuthRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid login payload.");

  try {
    const result = await loginCustomer(parsed.data, { ip: req.ip, userAgent: req.get("user-agent") });
    setSessionCookie(res, "customer", result.token);
    return sendOk(res, { user: result.user });
  } catch (error) {
    return sendAuthError(res, error, "Login failed.");
  }
});

customerAuthRouter.post("/logout", async (req, res) => {
  await revokeSession(req.session?.sid);
  clearSessionCookie(res, "customer");
  return sendOk(res, { loggedOut: true });
});

customerAuthRouter.get("/config", (_req, res) => sendOk(res, { providers: providerStatus() }));

customerAuthRouter.post("/forgot-password", otpRateLimit, async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid recovery payload.", "AUTH_TOKEN_INVALID");
  try {
    return sendOk(res, await requestCustomerPasswordReset(parsed.data, { ip: req.ip, userAgent: req.get("user-agent") }));
  } catch (error) {
    return sendAuthError(res, error, "Could not start password recovery.");
  }
});

customerAuthRouter.post("/forgot-password/verify-otp", strictAuthRateLimit, async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid verification payload.", "AUTH_TOKEN_INVALID");
  try {
    return sendOk(res, await verifyCustomerResetOtp(parsed.data));
  } catch (error) {
    return sendAuthError(res, error, "Invalid or expired verification code.");
  }
});

customerAuthRouter.post("/reset-password", strictAuthRateLimit, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid reset payload.", "AUTH_TOKEN_INVALID");
  try {
    const result = await resetCustomerPassword(parsed.data, { ip: req.ip, userAgent: req.get("user-agent") });
    clearSessionCookie(res, "customer");
    return sendOk(res, result);
  } catch (error) {
    return sendAuthError(res, error, "Could not reset password.");
  }
});

customerAuthRouter.get("/google", async (req, res) => {
  try {
    const state = randomToken(18);
    const nonce = randomToken(18);
    const returnTo = typeof req.query.returnTo === "string" && req.query.returnTo.startsWith("/") && !req.query.returnTo.startsWith("//") ? req.query.returnTo : "/account";
    res.cookie(GOOGLE_OAUTH_COOKIE, JSON.stringify({ state, nonce, returnTo }), oauthCookieOptions());
    return res.redirect(googleAuthorizationUrl({ state, nonce }));
  } catch (error) {
    return sendAuthError(res, error, "Google is unavailable.");
  }
});

customerAuthRouter.get("/google/callback", async (req, res) => {
  const cookieValue = req.cookies?.[GOOGLE_OAUTH_COOKIE];
  res.clearCookie(GOOGLE_OAUTH_COOKIE, oauthCookieOptions());
  try {
    const saved = cookieValue ? JSON.parse(cookieValue) as { state?: string; nonce?: string; returnTo?: string } : {};
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!saved.state || !saved.nonce || saved.state !== state || !code) throw new AuthError("Google sign in expired. Please try again.", "AUTH_TOKEN_INVALID", 401);
    const result = await completeGoogleOAuth({ code, nonce: saved.nonce }, { ip: req.ip, userAgent: req.get("user-agent") });
    setSessionCookie(res, "customer", result.token);
    return res.redirect(frontendUrl(saved.returnTo || "/account"));
  } catch {
    return res.redirect(frontendUrl("/login?error=google"));
  }
});
customerAuthRouter.get("/apple", async (_req, res) => sendAuthError(res, await beginOAuth(OAuthProvider.APPLE).catch((error) => error), "Apple is unavailable."));

customerAuthRouter.get("/me", requireCustomer, async (req, res) => {
  const customer = await getCustomerById(req.customer!.id);
  if (!customer) return sendError(res, 401, "Customer account is not active.");
  return sendOk(res, { user: customer });
});

customerAuthRouter.patch("/profile", requireCustomer, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid profile payload.");

  const user = await updateCustomerProfile(req.customer!.id, parsed.data);
  return sendOk(res, { user });
});

customerAuthRouter.post("/profile/reset", requireCustomer, async (req, res) => {
  try {
    const user = await resetCustomerProfile(req.customer!.id);
    return sendOk(res, { user });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not reset profile.");
  }
});

function sendAuthError(res: Parameters<typeof sendError>[0], error: unknown, fallback: string) {
  if (error instanceof AuthError) {
    return res.status(error.status).json({ ok: false, error: { code: error.code, message: error.message, retryAfterSeconds: error.retryAfterSeconds } });
  }
  return sendError(res, 400, fallback, "AUTH_TOKEN_INVALID");
}
