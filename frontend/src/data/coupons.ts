import type { Coupon } from "@/types";

export const coupons: Coupon[] = [
  { code: "WELCOME100", title: "Rs 100 off your first premium basket", discountType: "flat", value: 100, minOrder: 699, active: true },
  { code: "FRESH20", title: "20% off fruits and vegetables", discountType: "percent", value: 20, minOrder: 399, active: true },
  { code: "FREESHIP", title: "Free delivery on club baskets", discountType: "shipping", value: 49, minOrder: 499, active: true },
  { code: "FESTIVE10", title: "10% festive savings", discountType: "percent", value: 10, minOrder: 999, active: true },
];
