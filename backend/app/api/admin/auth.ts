import { Router } from "express";
import { clearSessionCookie, setSessionCookie } from "../../../lib/auth.js";
import { sendError, sendOk } from "../../../lib/http.js";
import { requireAdmin } from "../../../middleware/auth.js";
import { getAdminById, loginAdmin, resetAdminProfile, updateAdminProfile } from "../../../services/auth.service.js";
import { adminProfileSchema, loginSchema } from "../../../validators/auth.js";

export const adminAuthRouter = Router();

adminAuthRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid login payload.");

  try {
    const result = await loginAdmin(parsed.data);
    setSessionCookie(res, "admin", result.token);
    return sendOk(res, { admin: result.admin });
  } catch (error) {
    return sendError(res, 401, error instanceof Error ? error.message : "Admin login failed.");
  }
});

adminAuthRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res, "admin");
  return sendOk(res, { loggedOut: true });
});

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
