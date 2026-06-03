import { Router } from "express";
import { clearSessionCookie, setSessionCookie } from "../../lib/auth.js";
import { sendError, sendOk } from "../../lib/http.js";
import { requireCustomer } from "../../middleware/auth.js";
import { getCustomerById, loginCustomer, registerCustomer, updateCustomerProfile } from "../../services/auth.service.js";
import { loginSchema, profileSchema, registerSchema } from "../../validators/auth.js";

export const customerAuthRouter = Router();

customerAuthRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid registration payload.");

  try {
    const result = await registerCustomer(parsed.data);
    setSessionCookie(res, "customer", result.token);
    return sendOk(res, { user: result.user }, 201);
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Registration failed.");
  }
});

customerAuthRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid login payload.");

  try {
    const result = await loginCustomer(parsed.data);
    setSessionCookie(res, "customer", result.token);
    return sendOk(res, { user: result.user });
  } catch (error) {
    return sendError(res, 401, error instanceof Error ? error.message : "Login failed.");
  }
});

customerAuthRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res, "customer");
  return sendOk(res, { loggedOut: true });
});

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
