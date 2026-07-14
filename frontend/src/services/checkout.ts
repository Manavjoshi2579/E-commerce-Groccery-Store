"use client";

import type { Address, Order, Product } from "@/types";
import { mapApiProduct } from "./catalog";
import { mapCoupon } from "./commerce";
import { requestApi } from "./api";

export function mapAddress(input: any): Address {
  return {
    id: input.id,
    label: input.label || "Home",
    name: input.name,
    phone: input.phone,
    line: input.line,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
    landmark: input.landmark,
    isDefault: Boolean(input.isDefault),
  };
}

export function mapOrder(input: any): Order {
  return {
    id: input.id,
    orderNumber: input.orderNumber,
    customerName: input.customerName,
    items: (input.items || []).map((item: any) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      qty: item.qty ?? item.quantity,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      mrp: item.mrp == null ? undefined : Number(item.mrp),
      price: item.price == null ? undefined : Number(item.price),
      lineTotal: item.lineTotal == null ? undefined : Number(item.lineTotal),
    })),
    address: mapAddress(input.address),
    deliveryDate: input.deliveryDate,
    deliverySlot: input.deliverySlot,
    paymentMethod: input.paymentMethod === "Razorpay" ? "Razorpay" : "COD",
    paymentStatus: input.paymentStatus,
    paymentId: input.paymentId,
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    status: input.status,
    rawStatus: input.rawStatus,
    returns: (input.returns || []).map((item: any) => ({
      id: item.id,
      orderItemId: item.orderItemId,
      reason: item.reason,
      status: item.status,
      bankDetails: item.bankDetails,
      refunds: (item.refunds || []).map((refund: any) => ({
        id: refund.id,
        amount: Number(refund.amount || 0),
        status: refund.status,
        providerRefundId: refund.providerRefundId,
        createdAt: refund.createdAt,
        updatedAt: refund.updatedAt,
      })),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    createdAt: input.createdAt,
    couponCode: input.couponCode,
    deliveryStaff: input.deliveryStaff,
    deliveryStaffId: input.deliveryStaffId,
    deliveryAssignmentId: input.deliveryAssignmentId,
    deliveryAssignmentStatus: input.deliveryAssignmentStatus,
    deliveryAssignedAt: input.deliveryAssignedAt,
    deliveryPickedUpAt: input.deliveryPickedUpAt,
    deliveryDeliveredAt: input.deliveryDeliveredAt,
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    invoicePdfUrl: input.invoicePdfUrl,
    subtotal: Number(input.subtotal || 0),
    discount: Number(input.discount || 0),
    couponDiscount: Number(input.couponDiscount || 0),
    gstTotal: Number(input.gstTotal || 0),
    deliveryCharge: Number(input.deliveryCharge || 0),
    handlingCharge: Number(input.handlingCharge || 0),
    grandTotal: Number(input.grandTotal || 0),
  };
}

export async function fetchAddresses() {
  const data = await requestApi<{ addresses: any[] }>("/api/account/addresses");
  return data.addresses.map(mapAddress);
}

export async function createAddress(address: Omit<Address, "id">) {
  const data = await requestApi<{ address: any }>("/api/account/addresses", { method: "POST", body: JSON.stringify(address) });
  return mapAddress(data.address);
}

export async function updateAddress(address: Address) {
  const data = await requestApi<{ address: any }>(`/api/account/addresses/${address.id}`, { method: "PATCH", body: JSON.stringify(address) });
  return mapAddress(data.address);
}

export async function deleteAddress(id: string) {
  await requestApi<{ deleted: boolean }>(`/api/account/addresses/${id}`, { method: "DELETE" });
}

export async function fetchDeliverySlots(pincode: string, date: string) {
  const data = await requestApi<{ slots: any[]; serviceable: boolean; zone: any }>(`/api/delivery/slots?pincode=${encodeURIComponent(pincode)}&date=${encodeURIComponent(date)}`);
  return data;
}

export async function checkPincode(pincode: string) {
  return requestApi<{ serviceable: boolean; message: string; zone: any }>(`/api/delivery/check-pincode?pincode=${encodeURIComponent(pincode)}`);
}

export async function reverseGeocodeLocation(latitude: number, longitude: number) {
  const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude) });
  return requestApi<{ pincode: string; place: string; provider: string; serviceable: boolean; message: string; zone: any }>(`/api/delivery/reverse-geocode?${params}`);
}

export async function checkoutSummary() {
  const data = await requestApi<any>("/api/checkout/summary");
  return {
    cart: data.cart,
    addresses: (data.addresses || []).map(mapAddress),
    deliverySlots: data.deliverySlots || [],
  };
}

export async function placeCodOrder(input: { addressId: string; deliverySlotId?: string | null; deliveryDate: string; fulfillmentType?: "DELIVERY" | "PICKUP" }) {
  const data = await requestApi<{ order: any; orderNumber: string }>("/api/checkout/place-cod-order", { method: "POST", body: JSON.stringify(input) });
  return mapOrder(data.order);
}

export async function fetchOrders() {
  const data = await requestApi<{ orders: any[] }>("/api/orders");
  return data.orders.map(mapOrder);
}

export async function fetchOrder(orderNumber: string) {
  const data = await requestApi<{ order: any }>(`/api/orders/${orderNumber}`);
  return mapOrder(data.order);
}

export async function fetchTracking(orderNumber: string) {
  const data = await requestApi<{ order: any; timeline: any[] }>(`/api/orders/${orderNumber}/tracking`);
  return { order: mapOrder(data.order), timeline: data.timeline };
}

export async function reorderBackend(orderNumber: string) {
  return requestApi<{ cart: any }>(`/api/orders/${orderNumber}/reorder`, { method: "POST" });
}

export async function cancelBackendOrder(orderNumber: string) {
  const data = await requestApi<{ order: any }>(`/api/orders/${orderNumber}/cancel`, { method: "POST" });
  return mapOrder(data.order);
}

export async function requestReturnBackend(orderNumber: string, input: { orderItemId?: string | null; reason: string; bankAccountHolder: string; bankName: string; bankAccountNumber: string; bankIfsc: string }) {
  const data = await requestApi<{ order: any }>(`/api/orders/${orderNumber}/return`, { method: "POST", body: JSON.stringify(input) });
  return mapOrder(data.order);
}

export async function fetchAdminOrders() {
  const data = await requestApi<{ orders: any[] }>("/api/admin/orders");
  return data.orders.map(mapOrder);
}

export async function fetchAdminOrder(orderNumber: string) {
  const data = await requestApi<{ order: any }>(`/api/admin/orders/${encodeURIComponent(orderNumber)}`);
  return mapOrder(data.order);
}

export async function updateAdminOrderStatus(orderNumber: string, status: string) {
  const data = await requestApi<{ order: any }>(`/api/admin/orders/${orderNumber}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  return mapOrder(data.order);
}

export async function updateDeliveryOrderStatus(orderNumber: string, status: string) {
  const data = await requestApi<{ order: any }>(`/api/admin/orders/${orderNumber}/delivery-status`, { method: "PATCH", body: JSON.stringify({ status }) });
  return mapOrder(data.order);
}

export async function assignAdminDelivery(orderNumber: string, deliveryStaffId: string) {
  const data = await requestApi<{ order: any }>(`/api/admin/orders/${orderNumber}/assign-delivery`, { method: "POST", body: JSON.stringify({ deliveryStaffId }) });
  return mapOrder(data.order);
}

export async function fetchAdminDeliveryStaff() {
  const data = await requestApi<{ staff: { id: string; name: string; phone: string; _count?: { assignments?: number } }[] }>("/api/admin/delivery-staff");
  return data.staff;
}

export async function createAdminDeliveryStaff(input: { name: string; phone: string }) {
  const data = await requestApi<{ staff: { id: string; name: string; phone: string; _count?: { assignments?: number } } }>("/api/admin/delivery-staff", { method: "POST", body: JSON.stringify(input) });
  return data.staff;
}

export async function deleteAdminDeliveryStaff(id: string) {
  return requestApi<{ deleted: boolean; deactivated: boolean }>(`/api/admin/delivery-staff/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchAdminDeliverySlots() {
  const data = await requestApi<{ slots: any[] }>("/api/admin/delivery-slots");
  return data.slots;
}

export async function createAdminDeliverySlot(input: { label: string; startTime: string; endTime: string; capacity: number; active?: boolean }) {
  const data = await requestApi<{ slot: any }>("/api/admin/delivery-slots", { method: "POST", body: JSON.stringify(input) });
  return data.slot;
}

export async function updateAdminDeliverySlot(id: string, input: Partial<{ label: string; startTime: string; endTime: string; capacity: number; active: boolean }>) {
  const data = await requestApi<{ slot: any }>(`/api/admin/delivery-slots/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
  return data.slot;
}

export async function deleteAdminDeliverySlot(id: string) {
  return requestApi<{ deleted: boolean; deactivated: boolean }>(`/api/admin/delivery-slots/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchAdminInventory() {
  const data = await requestApi<{ inventory: any[] }>("/api/admin/inventory");
  return data.inventory.map((item) => ({
    id: item.id,
    productId: item.productId,
    variantId: item.variantId,
    stock: item.stock,
    lowStockThreshold: item.lowStockThreshold,
    product: mapApiProduct(item.product),
    status: item.status,
  }));
}

export async function adjustAdminInventory(id: string, quantity: number) {
  const data = await requestApi<{ inventory: any }>(`/api/admin/inventory/${id}/adjust`, { method: "POST", body: JSON.stringify({ quantity, note: "Adjusted from admin UI" }) });
  return {
    id: data.inventory.id,
    productId: data.inventory.productId,
    stock: data.inventory.stock,
    product: mapApiProduct(data.inventory.product),
  };
}

export { mapApiProduct, mapCoupon };
