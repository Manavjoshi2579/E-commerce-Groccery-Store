export type Product = {
  id: string;
  slug: string;
  name: string;
  sku: string;
  brand: string;
  brandId?: string;
  brandSlug?: string;
  category: string;
  categoryId?: string;
  categorySlug?: string;
  unit: string;
  mrp: number;
  price: number;
  gst: number;
  rating: number;
  reviews: number;
  stock: number;
  lowStock: number;
  image: string;
  images?: { id: string; url: string; alt?: string; isPrimary?: boolean }[];
  variants?: { id: string; unit: string; price: number; mrp: number }[];
  tags: string[];
  featured?: boolean;
  organic?: boolean;
  local?: boolean;
  active?: boolean;
  description: string;
};

export type Category = {
  id: string;
  slug: string;
  name: string;
  image: string;
};

export type Coupon = {
  id?: string;
  code: string;
  title: string;
  discountType: "flat" | "percent" | "shipping";
  type?: "FIXED" | "PERCENTAGE" | "FREE_DELIVERY";
  value: number;
  minOrder: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  startAt?: string;
  endAt?: string;
  usageLimit?: number;
  perUserLimit?: number;
  active: boolean;
};

export type Address = {
  id: string;
  label: string;
  name: string;
  phone: string;
  line: string;
  city: string;
  pincode: string;
};

export type CartItem = {
  id?: string;
  productId: string;
  variantId?: string;
  qty: number;
};

export type OrderStatus = "Placed" | "Confirmed" | "Packed" | "Out for Delivery" | "Delivered" | "Cancelled";
export type PaymentStatus = "Paid" | "COD Pending" | "Failed" | "Refunded";

export type Order = {
  orderNumber: string;
  customerName: string;
  items: CartItem[];
  address: Address;
  deliveryDate: string;
  deliverySlot: string;
  paymentMethod: "COD" | "Razorpay";
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  createdAt: string;
  couponCode?: string;
  deliveryStaff?: string;
};

export type CouponDraft = Coupon;
