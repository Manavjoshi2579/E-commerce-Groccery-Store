export type Product = {
  id: string;
  slug: string;
  name: string;
  sku: string;
  clientProductCode?: string | null;
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
  primaryImageUrl?: string;
  imageAlt?: string;
  imageStatus?: "Image Available" | "Placeholder" | "Missing" | "Broken" | "Review Required" | "Needs Review" | "Verified";
  imageSource?: string | null;
  images?: { id: string; url: string; alt?: string; isPrimary?: boolean }[];
  variants?: ProductVariant[];
  tags: string[];
  featured?: boolean;
  organic?: boolean;
  local?: boolean;
  active?: boolean;
  description: string;
};

export type ProductVariant = {
  id?: string;
  sku?: string;
  label?: string;
  unit: string;
  mrp: number;
  price: number;
  costPrice?: number | null;
  stock?: number;
  lowStock?: number;
  lowStockThreshold?: number;
  active?: boolean;
  status?: string;
  isDefault?: boolean;
};

export type Category = {
  id: string;
  slug: string;
  name: string;
  image: string;
  imageUrl?: string;
  bannerImageUrl?: string | null;
  description?: string;
  productCount?: number;
  activeProductCount?: number;
  displayOrder?: number;
  sortOrder?: number;
  homepageVisible?: boolean;
  active?: boolean;
  status?: string;
  parentCategory?: { id: string; name: string; slug: string } | null;
  parentId?: string | null;
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
  usedCount?: number;
  active: boolean;
};

export type Address = {
  id: string;
  label: string;
  name: string;
  phone: string;
  line: string;
  city: string;
  state?: string;
  pincode: string;
  landmark?: string;
  isDefault?: boolean;
};

export type CartItem = {
  id?: string;
  productId: string;
  variantId?: string;
  qty: number;
  name?: string;
  sku?: string;
  unit?: string;
  mrp?: number;
  price?: number;
  gst?: number;
  lineTotal?: number;
};

export type OrderStatus = "Placed" | "Confirmed" | "Packed" | "Out for Delivery" | "Delivered" | "Cancelled" | "Return Requested" | "Refunded";
export type PaymentStatus = "Paid" | "COD Pending" | "Failed" | "Refunded";

export type ReturnRequest = {
  id: string;
  orderItemId?: string | null;
  reason: string;
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "COMPLETED";
  bankDetails?: {
    accountHolder?: string | null;
    bankName?: string | null;
    accountNumberMasked?: string | null;
    ifsc?: string | null;
  } | null;
  refunds?: {
    id: string;
    amount: number;
    status: "REQUESTED" | "PROCESSING" | "COMPLETED" | "REJECTED";
    providerRefundId?: string | null;
    createdAt: string;
    updatedAt?: string;
  }[];
  createdAt: string;
  updatedAt?: string;
};

export type Order = {
  id?: string;
  orderNumber: string;
  customerName: string;
  items: CartItem[];
  address: Address;
  deliveryDate: string;
  deliverySlot: string;
  paymentMethod: "COD" | "Razorpay";
  paymentStatus: PaymentStatus;
  paymentId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  status: OrderStatus;
  returns?: ReturnRequest[];
  createdAt: string;
  couponCode?: string;
  deliveryStaff?: string;
  deliveryStaffId?: string;
  deliveryAssignmentId?: string;
  deliveryAssignmentStatus?: string;
  deliveryAssignedAt?: string;
  deliveryPickedUpAt?: string;
  deliveryDeliveredAt?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoicePdfUrl?: string | null;
  rawStatus?: string;
  subtotal?: number;
  discount?: number;
  couponDiscount?: number;
  gstTotal?: number;
  deliveryCharge?: number;
  handlingCharge?: number;
  grandTotal?: number;
};

export type CouponDraft = Coupon;

export type SupportTicket = {
  id: string;
  ticketNumber: string;
  customerName?: string;
  name?: string;
  email?: string;
  phone?: string;
  category: string;
  subject: string;
  message: string;
  adminNote?: string;
  resolution?: string;
  status: "Open" | "In Progress" | "Resolved" | "Closed";
  rawStatus?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  orderNumber?: string;
  assignedAdmin?: { id: string; name: string; email: string };
  resolvedAdmin?: { id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
};

export type FAQ = {
  id: string;
  question: string;
  answer: string;
  category: string;
  displayOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminCustomer = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
  orderCount: number;
  totalSpent: number;
  addressCount: number;
  reviewCount: number;
  supportTicketCount: number;
  lastOrderAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
