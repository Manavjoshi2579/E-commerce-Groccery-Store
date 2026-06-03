import { CouponType, RoleName } from "@prisma/client";
import { db } from "../lib/db.js";

function decimal(value: any) {
  return value == null ? 0 : Number(value);
}

export function mapCoupon(coupon: any) {
  return {
    id: coupon.id,
    code: coupon.code,
    title: coupon.title,
    type: coupon.type,
    discountType: coupon.type === CouponType.FIXED ? "flat" : coupon.type === CouponType.PERCENTAGE ? "percent" : "shipping",
    value: decimal(coupon.value),
    minOrderAmount: decimal(coupon.minOrderAmount),
    minOrder: decimal(coupon.minOrderAmount),
    maxDiscount: decimal(coupon.maxDiscount),
    startAt: coupon.startAt,
    endAt: coupon.endAt,
    usageLimit: coupon.usageLimit,
    perUserLimit: coupon.perUserLimit,
    usedCount: coupon.usedCount,
    active: coupon.active,
  };
}

export async function listAdminCoupons() {
  const coupons = await db.coupon.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  return coupons.map(mapCoupon);
}

export async function createAdminCoupon(input: any, adminId: string) {
  const coupon = await db.coupon.create({
    data: {
      ...input,
      createdByAdminId: adminId,
    },
  });
  return mapCoupon(coupon);
}

export async function updateAdminCoupon(id: string, input: any) {
  const coupon = await db.coupon.update({ where: { id }, data: input });
  return mapCoupon(coupon);
}

export async function softDeleteAdminCoupon(id: string) {
  await db.coupon.update({ where: { id }, data: { active: false, deletedAt: new Date() } });
}

export const couponViewRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.BILLING_STAFF];
export const couponManageRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER];
