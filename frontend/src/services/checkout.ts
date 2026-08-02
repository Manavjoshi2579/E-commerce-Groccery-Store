"use client";

import type { Address, Order, Product } from "@/types";
import { mapApiProduct } from "./catalog";
import { mapCoupon } from "./commerce";
import { clearApiCache, requestApi } from "./api";

export function mapAddress(input: any): Address {
  const address = input || {};
  return {
    id: address.id || "",
    label: address.label || "Home",
    name: address.name || "Customer",
    phone: address.phone || "",
    line: address.line || "Address not available",
    city: address.city || "",
    state: address.state || "",
    pincode: address.pincode || "",
    landmark: address.landmark,
    isDefault: Boolean(address.isDefault),
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
    deliveryOutForDeliveryAt: input.deliveryOutForDeliveryAt,
    deliveryHandedOverAt: input.deliveryHandedOverAt,
    deliveryDeliveredAt: input.deliveryDeliveredAt,
    deliveryFailedAt: input.deliveryFailedAt,
    deliveryFailureReason: input.deliveryFailureReason,
    deliveryFailureNote: input.deliveryFailureNote,
    customerConfirmedAt: input.customerConfirmedAt,
    customerConfirmationNote: input.customerConfirmationNote,
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

export async function confirmReceivedBackend(orderNumber: string, note?: string) {
  const data = await requestApi<{ order: any }>(`/api/orders/${orderNumber}/confirm-received`, { method: "POST", body: JSON.stringify({ note }) });
  return mapOrder(data.order);
}

export async function fetchAdminOrders() {
  const data = await requestApi<{ orders: any[] }>("/api/admin/orders");
  return data.orders.map(mapOrder);
}

export async function fetchAdminDeliveryOrders() {
  const mergeOrders = (groups: Order[][]) => {
    const rows = new Map<string, Order>();
    groups.flat().forEach((order) => rows.set(order.orderNumber, order));
    return Array.from(rows.values()).sort((a, b) => {
      const aTime = new Date(a.deliveryDate || a.createdAt).getTime();
      const bTime = new Date(b.deliveryDate || b.createdAt).getTime();
      if (aTime !== bTime) return aTime - bTime;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  };
  try {
    const [deliveryResult, ordersResult] = await Promise.allSettled([
      requestApi<{ orders: any[] }>("/api/admin/delivery-orders"),
      requestApi<{ orders: any[] }>("/api/admin/orders"),
    ]);
    const errors = [deliveryResult, ordersResult].filter((result) => result.status === "rejected") as PromiseRejectedResult[];
    const rows = [
      deliveryResult.status === "fulfilled" ? deliveryResult.value.orders.map(mapOrder) : [],
      ordersResult.status === "fulfilled" ? ordersResult.value.orders.map(mapOrder) : [],
    ];
    const merged = mergeOrders(rows).filter((order) => Boolean(order.deliveryAssignmentId || order.deliveryStaff));
    if (merged.length || errors.length < 2) return merged;
    throw errors[0].reason;
  } catch (error) {
    if (!(error instanceof Error) || !/404|not found/i.test(error.message)) throw error;
    return fetchAdminOrders();
  }
}

export async function fetchAdminOrder(orderNumber: string) {
  const data = await requestApi<{ order: any }>(`/api/admin/orders/${encodeURIComponent(orderNumber)}`);
  return mapOrder(data.order);
}

export async function updateAdminOrderStatus(orderNumber: string, status: string) {
  const data = await requestApi<{ order: any }>(`/api/admin/orders/${orderNumber}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  return mapOrder(data.order);
}

export async function updateAdminPaymentStatus(orderNumber: string, status: string, note?: string) {
  const body = JSON.stringify({ status, note });
  const paths = [
    `/api/admin/orders/${encodeURIComponent(orderNumber)}/payment-status`,
    `/api/admin/orders/${encodeURIComponent(orderNumber)}/payment`,
    `/api/admin/payments/${encodeURIComponent(orderNumber)}/status`,
    `/api/admin/payments/${encodeURIComponent(orderNumber)}/payment-status`,
  ];
  let lastError: unknown;
  for (const path of paths) {
    try {
      const data = await requestApi<{ order: any }>(path, { method: "PATCH", body });
      return mapOrder(data.order);
    } catch (error) {
      lastError = error;
      if (!(error instanceof Error) || !/404|not found/i.test(error.message)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not update payment.");
}

export async function updateDeliveryOrderStatus(orderNumber: string, status: string) {
  const data = await requestApi<{ order: any }>(`/api/admin/orders/${orderNumber}/delivery-status`, { method: "PATCH", body: JSON.stringify({ status }) });
  return mapOrder(data.order);
}

export async function markDeliveryAttemptFailed(orderNumber: string, input: { reason: string; note?: string }) {
  const data = await requestApi<{ order: any }>(`/api/admin/orders/${orderNumber}/delivery-failure`, { method: "POST", body: JSON.stringify(input) });
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
    locationId: item.locationId,
    location: item.location,
    productId: item.productId,
    variantId: item.variantId,
    stock: item.stock,
    onHand: item.onHand,
    reserved: item.reserved,
    sold: item.sold,
    damaged: item.damaged,
    returned: item.returned,
    adjustment: item.adjustment,
    lowStockThreshold: item.lowStockThreshold,
    product: mapApiProduct(item.product),
    variant: item.variant,
    status: item.status,
  }));
}

export async function searchAdminPosInventory(query: string) {
  const data = await requestApi<{ inventory: any[] }>(`/api/admin/inventory/pos-search?q=${encodeURIComponent(query)}`);
  return data.inventory.map((item) => ({
    id: item.id,
    locationId: item.locationId,
    location: item.location,
    productId: item.productId,
    variantId: item.variantId,
    stock: item.stock,
    onHand: item.onHand,
    reserved: item.reserved,
    sold: item.sold,
    damaged: item.damaged,
    returned: item.returned,
    adjustment: item.adjustment,
    lowStockThreshold: item.lowStockThreshold,
    product: mapApiProduct(item.product),
    variant: item.variant,
    status: item.status,
  }));
}

export async function lookupAdminPosInventory(code: string) {
  const data = await requestApi<{ match: any | null; options: any[]; ambiguous?: boolean }>(`/api/admin/inventory/pos-lookup?code=${encodeURIComponent(code)}`);
  return {
    ...data,
    match: data.match ? { ...data.match, product: mapApiProduct(data.match.product) } : null,
    options: (data.options || []).map((item) => ({ ...item, product: mapApiProduct(item.product) })),
  };
}

export async function fetchAdminPosMetrics(deviceQueued = 0) {
  const data = await requestApi<{ metrics: any }>(`/api/admin/inventory/pos-metrics?deviceQueued=${encodeURIComponent(String(deviceQueued))}`);
  return data.metrics;
}

export async function fetchAdminOfflineSales(filters?: { q?: string; paymentMethod?: string; status?: string; page?: number; pageSize?: number }) {
  const params = new URLSearchParams();
  if (filters?.q) params.set("q", filters.q);
  if (filters?.paymentMethod) params.set("paymentMethod", filters.paymentMethod);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));
  return requestApi<{ sales: any[]; pagination: any }>(`/api/admin/inventory/offline-sales${params.size ? `?${params}` : ""}`);
}

export async function adjustAdminInventory(id: string, quantity: number) {
  const data = await requestApi<{ inventory: any }>(`/api/admin/inventory/${id}/adjust`, { method: "POST", body: JSON.stringify({ quantity, note: "Adjusted from admin UI" }) });
  clearStockCaches();
  return {
    id: data.inventory.id,
    productId: data.inventory.productId,
    variantId: data.inventory.variantId,
    stock: data.inventory.stock,
    lowStockThreshold: data.inventory.lowStockThreshold,
    product: mapApiProduct(data.inventory.product),
    status: data.inventory.status,
  };
}

export async function createAdminStockInward(input: { inventoryId: string; quantity: number; vendor?: string; invoiceReference?: string; note?: string }) {
  const data = await requestApi<{ inventory: any }>("/api/admin/inventory/inward", { method: "POST", body: JSON.stringify(input) });
  clearStockCaches();
  return data.inventory;
}

export async function fetchAdminInventoryMovements() {
  const data = await requestApi<{ movements: any[] }>("/api/admin/inventory/movements");
  return data.movements || [];
}

export async function createAdminOfflineSale(input: { locationId?: string | null; idempotencyKey?: string; customerReference?: string; paymentMethod?: "CASH" | "UPI" | "CARD" | "OTHER"; cashReceived?: number | null; note?: string; items: { productId: string; variantId?: string | null; quantity: number; unitPrice: number }[] }) {
  const data = await requestApi<{ sale: any }>("/api/admin/inventory/offline-sales", { method: "POST", body: JSON.stringify(input) });
  clearStockCaches();
  return data.sale;
}

export async function syncAdminOfflineSales(input: { deviceId: string; sales: any[] }) {
  const data = await requestApi<{ results: any[] }>("/api/admin/inventory/offline-sync", { method: "POST", body: JSON.stringify(input) });
  clearStockCaches();
  return data.results;
}

export async function fetchAdminOfflineSyncConflicts(filters?: { status?: string; q?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.q) params.set("q", filters.q);
  const data = await requestApi<{ conflicts: any[] }>(`/api/admin/inventory/offline-sync-conflicts${params.size ? `?${params}` : ""}`);
  return data.conflicts;
}

export async function resolveAdminOfflineSyncConflict(id: string, input: { status: string; resolutionNote: string }) {
  const data = await requestApi<{ conflict: any }>(`/api/admin/inventory/offline-sync-conflicts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
  return data.conflict;
}

export { mapApiProduct, mapCoupon };

function clearStockCaches() {
  clearApiCache("/api/products");
  clearApiCache("/api/catalog/home");
  clearApiCache("/api/cart");
  clearApiCache("/api/admin/inventory");
}
