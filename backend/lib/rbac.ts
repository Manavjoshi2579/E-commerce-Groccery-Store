import { RoleName } from "@prisma/client";

export type Capability =
  | "orders:read"
  | "orders:update_status"
  | "orders:assign_delivery"
  | "delivery:read"
  | "delivery:update_own_status"
  | "delivery_staff:manage"
  | "products:read"
  | "inventory:read"
  | "inventory:update"
  | "pos:sell"
  | "billing:read"
  | "payments:update";

export const roleCapabilities: Record<RoleName, Capability[]> = {
  [RoleName.SUPER_ADMIN]: [
    "orders:read",
    "orders:update_status",
    "orders:assign_delivery",
    "delivery:read",
    "delivery:update_own_status",
    "delivery_staff:manage",
    "products:read",
    "inventory:read",
    "inventory:update",
    "pos:sell",
    "billing:read",
    "payments:update",
  ],
  [RoleName.STORE_MANAGER]: ["orders:read", "orders:update_status", "orders:assign_delivery", "delivery:read", "products:read", "inventory:read", "pos:sell", "payments:update"],
  [RoleName.INVENTORY_MANAGER]: ["products:read", "inventory:read", "inventory:update"],
  [RoleName.CASHIER]: ["products:read", "inventory:read", "pos:sell", "billing:read"],
  [RoleName.ORDER_MANAGER]: ["orders:read", "orders:update_status", "orders:assign_delivery", "delivery:read", "payments:update"],
  [RoleName.DELIVERY_STAFF]: ["orders:read", "delivery:read", "delivery:update_own_status", "payments:update"],
  [RoleName.SUPPORT_STAFF]: ["orders:read"],
  [RoleName.BILLING_STAFF]: ["orders:read", "billing:read", "payments:update"],
};

export function hasCapability(role: RoleName | undefined, capability: Capability) {
  if (!role) return false;
  return role === RoleName.SUPER_ADMIN || roleCapabilities[role]?.includes(capability);
}
