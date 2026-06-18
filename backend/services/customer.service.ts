import { RoleName, UserStatus } from "@prisma/client";
import { db } from "../lib/db.js";

export const customerRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.INVENTORY_MANAGER, RoleName.ORDER_MANAGER, RoleName.SUPPORT_STAFF, RoleName.BILLING_STAFF];
export const customerManageRoles = [RoleName.SUPER_ADMIN];

function decimal(value: unknown) {
  return value == null ? 0 : Number(value);
}

function mapCustomer(customer: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  orders: { grandTotal: unknown; createdAt: Date }[];
  addresses: unknown[];
  reviews: unknown[];
  supportTickets: unknown[];
}) {
  const totalSpent = customer.orders.reduce((sum, order) => sum + decimal(order.grandTotal), 0);
  const lastOrderAt = customer.orders[0]?.createdAt ?? null;
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    status: customer.status,
    deletedAt: customer.deletedAt,
    orderCount: customer.orders.length,
    totalSpent,
    addressCount: customer.addresses.length,
    reviewCount: customer.reviews.length,
    supportTicketCount: customer.supportTickets.length,
    lastOrderAt,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export async function listAdminCustomers(query?: string) {
  const q = query?.trim();
  const customers = await db.user.findMany({
    where: q
      ? {
          deletedAt: null,
          OR: [
            { name: { contains: q } },
            { email: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : { deletedAt: null },
    include: {
      orders: { select: { grandTotal: true, createdAt: true }, orderBy: { createdAt: "desc" } },
      addresses: { where: { deletedAt: null }, select: { id: true } },
      reviews: { select: { id: true } },
      supportTickets: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return customers.map(mapCustomer);
}

export async function updateAdminCustomerStatus(id: string, status: UserStatus) {
  if (![UserStatus.ACTIVE, UserStatus.INACTIVE, UserStatus.BLOCKED].includes(status)) throw new Error("Invalid customer status.");
  const customer = await db.user.update({
    where: { id },
    data: { status },
    include: {
      orders: { select: { grandTotal: true, createdAt: true }, orderBy: { createdAt: "desc" } },
      addresses: { where: { deletedAt: null }, select: { id: true } },
      reviews: { select: { id: true } },
      supportTickets: { select: { id: true } },
    },
  });
  return mapCustomer(customer);
}

export async function softDeleteAdminCustomer(id: string) {
  const suffix = `deleted-${Date.now()}-${id.slice(-6)}`;
  const customer = await db.user.update({
    where: { id },
    data: {
      status: UserStatus.BLOCKED,
      deletedAt: new Date(),
      email: `${suffix}@deleted.local`,
      phone: null,
    },
  });
  await db.cartItem.deleteMany({ where: { cart: { userId: id } } });
  await db.cart.deleteMany({ where: { userId: id } });
  await db.wishlistItem.deleteMany({ where: { wishlist: { userId: id } } });
  await db.wishlist.deleteMany({ where: { userId: id } });
  return { id: customer.id, deleted: true };
}
