import type { Order } from "@/types";
import { defaultAddresses } from "./users";

export const initialOrders: Order[] = [
  {
    orderNumber: "EC-9480",
    customerName: "Manav Shah",
    items: [{ productId: "prd-1", qty: 2 }, { productId: "prd-5", qty: 1 }, { productId: "prd-13", qty: 2 }],
    address: defaultAddresses[0],
    deliveryDate: "2026-06-04",
    deliverySlot: "7:00 AM - 9:00 AM",
    paymentMethod: "Razorpay",
    paymentStatus: "Paid",
    status: "Delivered",
    createdAt: "2026-06-02T10:00:00.000Z",
    couponCode: "FRESH20",
    deliveryStaff: "Rohan Patel",
  },
  {
    orderNumber: "EC-9481",
    customerName: "Priya Sharma",
    items: [{ productId: "prd-4", qty: 1 }, { productId: "prd-7", qty: 2 }, { productId: "prd-21", qty: 1 }],
    address: defaultAddresses[1],
    deliveryDate: "2026-06-03",
    deliverySlot: "6:00 PM - 9:00 PM",
    paymentMethod: "COD",
    paymentStatus: "COD Pending",
    status: "Packed",
    createdAt: "2026-06-03T06:30:00.000Z",
    deliveryStaff: "Neha Joshi",
  },
];
