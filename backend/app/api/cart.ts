import { Router } from "express";
import { sendError, sendOk } from "../../lib/http.js";
import { requireCustomer } from "../../middleware/auth.js";
import {
  addCartItem,
  clearCart,
  getCartSummary,
  removeCartCoupon,
  removeCartItem,
  updateCartItem,
  validateCouponForCart,
} from "../../services/cart.service.js";
import { addCartItemSchema, couponValidateSchema, updateCartItemSchema } from "../../validators/cart.js";

export const cartRouter = Router();

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

cartRouter.use(requireCustomer);

cartRouter.get("/", async (req, res) => {
  return sendOk(res, { cart: await getCartSummary(req.customer!.id) });
});

cartRouter.post("/items", async (req, res) => {
  const parsed = addCartItemSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid cart item.");
  try {
    return sendOk(res, { cart: await addCartItem(req.customer!.id, parsed.data) }, 201);
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not add cart item.");
  }
});

cartRouter.patch("/items/:id", async (req, res) => {
  const parsed = updateCartItemSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid cart quantity.");
  try {
    return sendOk(res, { cart: await updateCartItem(req.customer!.id, param(req.params.id), parsed.data.quantity) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not update cart item.");
  }
});

cartRouter.delete("/items/:id", async (req, res) => {
  return sendOk(res, { cart: await removeCartItem(req.customer!.id, param(req.params.id)) });
});

cartRouter.delete("/coupon", async (req, res) => {
  return sendOk(res, { cart: await removeCartCoupon(req.customer!.id) });
});

cartRouter.post("/remove-coupon", async (req, res) => {
  return sendOk(res, { cart: await removeCartCoupon(req.customer!.id) });
});

cartRouter.delete("/", async (req, res) => {
  return sendOk(res, { cart: await clearCart(req.customer!.id) });
});

cartRouter.post("/coupon", async (req, res) => {
  const parsed = couponValidateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid coupon code.");
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
