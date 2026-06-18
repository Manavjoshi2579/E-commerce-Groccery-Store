import { Router } from "express";
import { sendError, sendOk } from "../../lib/http.js";
import { requireCustomer } from "../../middleware/auth.js";
import { checkoutSummary, placeCodOrder, placeOnlinePlaceholderOrder, validateCheckout } from "../../services/order.service.js";
import { checkoutSelectionSchema } from "../../validators/checkout.js";

export const checkoutRouter = Router();

checkoutRouter.use(requireCustomer);

checkoutRouter.get("/summary", async (req, res) => {
  return sendOk(res, await checkoutSummary(req.customer!.id));
});

checkoutRouter.post("/validate", async (req, res) => {
  const parsed = checkoutSelectionSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid checkout payload.");
  try {
    return sendOk(res, await validateCheckout(req.customer!.id, parsed.data));
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Checkout validation failed.");
  }
});

checkoutRouter.post("/place-cod-order", async (req, res) => {
  const parsed = checkoutSelectionSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid checkout payload.");
  try {
    return sendOk(res, await placeCodOrder(req.customer!.id, parsed.data), 201);
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not place order.");
  }
});

checkoutRouter.post("/place-online-placeholder-order", async (req, res) => {
  const parsed = checkoutSelectionSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid checkout payload.");
  try {
    return sendOk(res, await placeOnlinePlaceholderOrder(req.customer!.id, parsed.data), 201);
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not create online placeholder order.");
  }
});
