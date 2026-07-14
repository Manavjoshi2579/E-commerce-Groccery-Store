"use client";

import type { Order } from "@/types";
import { requestApi } from "./api";
import { mapOrder } from "./checkout";

export type RazorpayCreateOrderResponse = {
  orderNumber: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  prefill: { name?: string; email?: string; contact?: string };
};

export type RazorpayCheckoutResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpayCheckoutResponse) => void;
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void; on: (event: string, callback: (response: any) => void) => void };
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadRazorpayScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("Razorpay is available only in the browser."));
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Razorpay. Please try again or choose Cash on Delivery.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Razorpay. Please try again or choose Cash on Delivery."));
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export function createRazorpayOrder(input: { addressId: string; deliverySlotId: string; deliveryDate: string; couponCode?: string }) {
  return requestApi<RazorpayCreateOrderResponse>("/api/payments/razorpay/create-order", { method: "POST", body: JSON.stringify(input) });
}

export async function fetchPaymentConfig() {
  const data = await requestApi<{ providers: { razorpay: boolean; onlinePayment: boolean } }>("/api/payments/config");
  return data.providers;
}

export async function verifyRazorpayPayment(input: { orderNumber: string } & RazorpayCheckoutResponse) {
  const data = await requestApi<{ success: boolean; orderNumber: string; order: any }>("/api/payments/razorpay/verify", { method: "POST", body: JSON.stringify(input) });
  return { ...data, order: data.order ? mapOrder(data.order) as Order : undefined };
}

export function markRazorpayFailed(input: { orderNumber: string; razorpay_order_id?: string; errorCode?: string; errorDescription?: string; metadata?: unknown }) {
  return requestApi<{ success: boolean; orderNumber: string }>("/api/payments/razorpay/failed", { method: "POST", body: JSON.stringify(input) });
}
