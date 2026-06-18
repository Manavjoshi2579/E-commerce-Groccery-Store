import { Router } from "express";
import { sendError, sendOk } from "../../../lib/http.js";
import { requireAdminRole } from "../../../middleware/auth.js";
import {
  couponManageRoles,
  couponViewRoles,
  createAdminCoupon,
  listAdminCoupons,
  softDeleteAdminCoupon,
  updateAdminCoupon,
} from "../../../services/coupon.service.js";
import { adminCouponSchema, adminCouponUpdateSchema } from "../../../validators/cart.js";

export const adminCouponRouter = Router();

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

adminCouponRouter.get("/coupons", requireAdminRole(couponViewRoles), async (_req, res) => {
  return sendOk(res, { coupons: await listAdminCoupons() });
});

adminCouponRouter.post("/coupons", requireAdminRole(couponManageRoles), async (req, res) => {
  const parsed = adminCouponSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid coupon payload.");
  try {
    return sendOk(res, { coupon: await createAdminCoupon(parsed.data, req.admin!.id) }, 201);
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not create coupon.");
  }
});

adminCouponRouter.patch("/coupons/:id", requireAdminRole(couponManageRoles), async (req, res) => {
  const parsed = adminCouponUpdateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid coupon payload.");
  return sendOk(res, { coupon: await updateAdminCoupon(param(req.params.id), parsed.data) });
});

adminCouponRouter.delete("/coupons/:id", requireAdminRole(couponManageRoles), async (req, res) => {
  await softDeleteAdminCoupon(param(req.params.id));
  return sendOk(res, { deleted: true });
});
