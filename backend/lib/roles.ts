import { RoleName } from "@prisma/client";

const routePermissions: Record<string, RoleName[]> = {
  products: [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.INVENTORY_MANAGER, RoleName.ORDER_MANAGER],
  categories: [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER],
  brands: [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER],
  inventory: [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.INVENTORY_MANAGER],
  "stock-movement": [RoleName.SUPER_ADMIN, RoleName.INVENTORY_MANAGER],
  orders: [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.ORDER_MANAGER, RoleName.SUPPORT_STAFF, RoleName.DELIVERY_STAFF],
  customers: [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.ORDER_MANAGER, RoleName.SUPPORT_STAFF],
  coupons: [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.INVENTORY_MANAGER, RoleName.ORDER_MANAGER, RoleName.BILLING_STAFF],
  reports: [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.INVENTORY_MANAGER, RoleName.ORDER_MANAGER, RoleName.BILLING_STAFF],
  delivery: [RoleName.SUPER_ADMIN, RoleName.ORDER_MANAGER, RoleName.DELIVERY_STAFF],
  payments: [RoleName.SUPER_ADMIN, RoleName.BILLING_STAFF],
  invoices: [RoleName.SUPER_ADMIN, RoleName.BILLING_STAFF],
  returns: [RoleName.SUPER_ADMIN, RoleName.SUPPORT_STAFF],
  refunds: [RoleName.SUPER_ADMIN, RoleName.SUPPORT_STAFF, RoleName.BILLING_STAFF],
  faqs: [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.SUPPORT_STAFF],
};

export function hasRole(role: RoleName | undefined, allowed: RoleName[]) {
  if (!role) return false;
  return role === RoleName.SUPER_ADMIN || allowed.includes(role);
}

export function canAccessAdminArea(role: RoleName | undefined, area: string) {
  const allowed = routePermissions[area] ?? [RoleName.SUPER_ADMIN];
  return hasRole(role, allowed);
}

export function rolePermissionsFor(area: string) {
  return routePermissions[area] ?? [RoleName.SUPER_ADMIN];
}
