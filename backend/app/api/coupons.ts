import { Router } from "express";
import { sendOk } from "../../lib/http.js";
import { requireCustomer } from "../../middleware/auth.js";
import { getCartSummary, validateCouponForCart } from "../../services/cart.service.js";
import { listAvailableCoupons } from "../../services/coupon.service.js";
import { couponValidateSchema } from "../../validators/cart.js";

export const couponRouter = Router();

couponRouter.get("/", async (_req, res) => {
  return sendOk(res, { coupons: await listAvailableCoupons() });
});

couponRouter.post("/validate", requireCustomer, async (req, res) => {
  const parsed = couponValidateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendOk(res, { valid: false, coupon: null, discountAmount: 0, cart: await getCartSummary(req.customer!.id), message: parsed.error.issues[0]?.message || "Invalid coupon code." });
  }
  try {
    return sendOk(res, await validateCouponForCart(req.customer!.id, parsed.data.code));
  } catch (error) {
    return sendOk(res, {
      valid: false,
      coupon: null,
      discountAmount: 0,
      cart: await getCartSummary(req.customer!.id),
      message: error instanceof Error ? error.message : "Coupon is invalid.",
    });
  }
});
