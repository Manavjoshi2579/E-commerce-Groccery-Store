import bcrypt from "bcrypt";
import {
  AdminStatus,
  CouponType,
  DeliveryStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
  ProductStatus,
  RoleName,
  SettingType,
  StockMovementType,
  UserStatus,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { gujaratPincodePrefixes } from "../lib/gujarat-pincodes.js";
import { invoiceNumber, slugify } from "../lib/ids.js";

const prisma = new PrismaClient();

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run demo reset in production. Use `npm run db:prod-bootstrap` for production setup.");
  process.exit(1);
}
const money = (value: number) => new Decimal(value.toFixed(2));
const demoCustomerEmails = ["customer@eagleclub.in", "priya.customer@eagleclub.in"];
const cleanCouponCodes = ["WELCOME100", "FRESH20", "FREESHIP", "FESTIVE10"];
const productFallback = "/assets/placeholders/product-placeholder-generated.png";

const rolePermissions: Record<RoleName, string[]> = {
  SUPER_ADMIN: ["*"],
  STORE_MANAGER: ["catalog:*", "orders:*", "reports:read"],
  INVENTORY_MANAGER: ["inventory:*", "catalog:read"],
  ORDER_MANAGER: ["orders:*", "delivery:assign"],
  DELIVERY_STAFF: ["delivery:*", "orders:read"],
  SUPPORT_STAFF: ["customers:read", "orders:read", "returns:*"],
  BILLING_STAFF: ["payments:read", "invoices:*", "reports:read"],
};

const adminSeeds = [
  ["Eagle Mart Super Admin", "superadmin@eagleclub.in", RoleName.SUPER_ADMIN],
  ["Store Manager", "store.manager@eagleclub.in", RoleName.STORE_MANAGER],
  ["Inventory Manager", "inventory@eagleclub.in", RoleName.INVENTORY_MANAGER],
  ["Orders Manager", "orders@eagleclub.in", RoleName.ORDER_MANAGER],
  ["Delivery Lead", "delivery@eagleclub.in", RoleName.DELIVERY_STAFF],
  ["Billing Manager", "billing@eagleclub.in", RoleName.BILLING_STAFF],
] as const;

const couponSeeds = [
  { code: "WELCOME100", title: "Rs 100 off your first premium basket", type: CouponType.FIXED, value: 100, minOrderAmount: 699, maxDiscount: 100, usageLimit: 5000, perUserLimit: 1 },
  { code: "FRESH20", title: "20% off fruits and vegetables", type: CouponType.PERCENTAGE, value: 20, minOrderAmount: 399, maxDiscount: 150, usageLimit: 3000, perUserLimit: 5 },
  { code: "FREESHIP", title: "Free delivery on premium baskets", type: CouponType.FREE_DELIVERY, value: 49, minOrderAmount: 499, maxDiscount: 49, usageLimit: 4000, perUserLimit: 10 },
  { code: "FESTIVE10", title: "10% festive savings", type: CouponType.PERCENTAGE, value: 10, minOrderAmount: 999, maxDiscount: 250, usageLimit: 2000, perUserLimit: 3 },
];

const orderPlans = [
  { orderNumber: "EC-DEMO-1001", customerEmail: "customer@eagleclub.in", status: OrderStatus.PENDING, paymentStatus: PaymentStatus.COD_PENDING, method: PaymentMethod.COD, productSlugs: ["amul-taaza-milk-1l", "fresh-tomato-1kg", "britannia-bread", "tata-salt-1kg"], quantities: [2, 2, 1, 1], couponCode: "FREESHIP", slotLabel: "Morning" },
  { orderNumber: "EC-DEMO-1002", customerEmail: "customer@eagleclub.in", status: OrderStatus.CONFIRMED, paymentStatus: PaymentStatus.COD_PENDING, method: PaymentMethod.COD, productSlugs: ["aashirvaad-atta-5kg", "tur-dal-1kg", "fortune-sunflower-oil-1l", "parle-g-biscuit-pack"], quantities: [1, 1, 1, 2], couponCode: "WELCOME100", slotLabel: "Afternoon" },
  { orderNumber: "EC-DEMO-1003", customerEmail: "priya.customer@eagleclub.in", status: OrderStatus.PACKED, paymentStatus: PaymentStatus.COD_PENDING, method: PaymentMethod.COD, productSlugs: ["india-gate-basmati-rice-5kg", "amul-butter-500g", "mother-dairy-paneer-200g"], quantities: [1, 1, 2], couponCode: null, slotLabel: "Evening" },
  { orderNumber: "EC-DEMO-1004", customerEmail: "customer@eagleclub.in", status: OrderStatus.OUT_FOR_DELIVERY, paymentStatus: PaymentStatus.COD_PENDING, method: PaymentMethod.COD, productSlugs: ["fresh-potato-1kg", "banana-1-dozen", "colgate-toothpaste", "dettol-handwash"], quantities: [2, 1, 1, 1], couponCode: "FRESH20", slotLabel: "Express", deliveryStatus: DeliveryStatus.OUT_FOR_DELIVERY },
  { orderNumber: "EC-DEMO-1005", customerEmail: "customer@eagleclub.in", status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.PAID, method: PaymentMethod.COD, productSlugs: ["surf-excel-detergent-1kg", "harpic-toilet-cleaner-1l", "himalaya-baby-shampoo", "maggi-noodles-pack-of-12"], quantities: [1, 1, 1, 1], couponCode: "FESTIVE10", slotLabel: "Morning", deliveryStatus: DeliveryStatus.DELIVERED, invoice: true },
] as const;

function fakeProductWhere(): Prisma.ProductWhereInput {
  return {
    OR: [
      { name: { contains: "product name1" } },
      { name: { contains: "New Eagle Mart Product" } },
      { name: { contains: "test product" } },
      { name: { contains: "QA product" } },
      { name: { contains: "random" } },
      { sku: { contains: "TEST" } },
      { sku: { contains: "QA" } },
      { slug: { contains: "test-product" } },
      { slug: { contains: "qa-product" } },
      { slug: { contains: "new-eagle-mart-product" } },
    ],
  };
}

function fakeBrandWhere(): Prisma.BrandWhereInput {
  return {
    products: { none: {} },
    OR: [
      { name: { contains: "New Brand" } },
      { name: { contains: "test brand" } },
      { name: { contains: "QA brand" } },
      { name: { contains: "random" } },
      { slug: { contains: "new-brand" } },
      { slug: { contains: "test-brand" } },
      { slug: { contains: "qa-brand" } },
    ],
  };
}

function getUnit(product: ProductWithVariant) {
  return product.variants[0]?.unit || product.variants[0]?.label || "1 pc";
}

type ProductWithVariant = Prisma.ProductGetPayload<{ include: { variants: true; inventory: true } }>;
type AdminMap = Map<string, { id: string }>;
type CustomerMap = Map<string, Prisma.UserGetPayload<{ include: { addresses: true } }>>;

async function cleanupTransactionalData(tx: Prisma.TransactionClient) {
  await tx.refund.deleteMany();
  await tx.returnRequest.deleteMany();
  await tx.review.deleteMany();
  await tx.deliveryAssignment.deleteMany();
  await tx.invoice.deleteMany();
  await tx.payment.deleteMany();
  await tx.couponUsage.deleteMany();
  await tx.stockMovement.deleteMany();
  await tx.orderItem.deleteMany();
  await tx.order.deleteMany();
  await tx.wishlistItem.deleteMany();
  await tx.wishlist.deleteMany();
  await tx.cartItem.deleteMany();
  await tx.cart.deleteMany();
}

async function cleanupFakeCatalog(tx: Prisma.TransactionClient) {
  const fakeProducts = await tx.product.findMany({ where: fakeProductWhere(), select: { id: true } });
  const fakeProductIds = fakeProducts.map((product) => product.id);
  if (fakeProductIds.length) {
    await tx.inventory.deleteMany({ where: { productId: { in: fakeProductIds } } });
    await tx.productVariant.deleteMany({ where: { productId: { in: fakeProductIds } } });
    await tx.productImage.deleteMany({ where: { productId: { in: fakeProductIds } } });
    await tx.product.deleteMany({ where: { id: { in: fakeProductIds } } });
  }
  await tx.brand.deleteMany({ where: fakeBrandWhere() });
}

async function ensureRolesAndAdmins(tx: Prisma.TransactionClient) {
  const passwordHash = await bcrypt.hash("Eagleclub@12345", 12);
  const roles = new Map<RoleName, { id: string }>();
  for (const name of Object.values(RoleName)) {
    const role = await tx.role.upsert({
      where: { name },
      update: { permissions: rolePermissions[name] },
      create: { name, permissions: rolePermissions[name] },
      select: { id: true },
    });
    roles.set(name, role);
  }

  const admins: AdminMap = new Map();
  for (const [name, email, roleName] of adminSeeds) {
    const admin = await tx.adminUser.upsert({
      where: { email },
      update: { name, passwordHash, roleId: roles.get(roleName)!.id, status: AdminStatus.ACTIVE },
      create: { name, email, passwordHash, roleId: roles.get(roleName)!.id, status: AdminStatus.ACTIVE },
      select: { id: true },
    });
    admins.set(email, admin);
  }
  return admins;
}

async function ensureCustomers(tx: Prisma.TransactionClient) {
  const passwordHash = await bcrypt.hash("Customer@12345", 12);
  const manav = await tx.user.upsert({
    where: { email: "customer@eagleclub.in" },
    update: { name: "Manav Shah", phone: "9876543210", passwordHash, status: UserStatus.ACTIVE },
    create: { name: "Manav Shah", email: "customer@eagleclub.in", phone: "9876543210", passwordHash, status: UserStatus.ACTIVE },
  });
  const priya = await tx.user.upsert({
    where: { email: "priya.customer@eagleclub.in" },
    update: { name: "Priya Sharma", phone: "9876543201", passwordHash, status: UserStatus.ACTIVE },
    create: { name: "Priya Sharma", email: "priya.customer@eagleclub.in", phone: "9876543201", passwordHash, status: UserStatus.ACTIVE },
  });

  await tx.address.createMany({
    data: [
      { userId: manav.id, label: "Home", name: "Manav Shah", phone: "9876543210", line: "A-1202, Eagle Heights, Satellite Road", city: "Ahmedabad", state: "Gujarat", pincode: "380015", isDefault: true },
      { userId: priya.id, label: "Home", name: "Priya Sharma", phone: "9876543201", line: "B-704, Maple Residency, C G Road", city: "Ahmedabad", state: "Gujarat", pincode: "380009", isDefault: true },
    ],
    skipDuplicates: true,
  });

  const customers = await tx.user.findMany({ where: { email: { in: demoCustomerEmails } }, include: { addresses: true } });
  await tx.user.deleteMany({ where: { email: { notIn: demoCustomerEmails } } });
  return new Map(customers.map((customer) => [customer.email!, customer]));
}

async function ensureDelivery(tx: Prisma.TransactionClient) {
  const zone = await tx.deliveryZone.upsert({
    where: { city: "Gujarat" },
    update: { pincodes: gujaratPincodePrefixes, deliveryCharge: money(49), freeDeliveryThreshold: money(799), active: true },
    create: { city: "Gujarat", pincodes: gujaratPincodePrefixes, deliveryCharge: money(49), freeDeliveryThreshold: money(799), active: true },
  });

  for (const [label, startTime, endTime, capacity] of [
    ["Morning", "07:00", "09:00", 150],
    ["Midday", "10:00", "12:00", 150],
    ["Afternoon", "14:00", "16:00", 150],
    ["Evening", "18:00", "21:00", 180],
  ] as const) {
    const existing = await tx.deliverySlot.findFirst({ where: { zoneId: zone.id, label } });
    if (existing) await tx.deliverySlot.update({ where: { id: existing.id }, data: { startTime, endTime, capacity, active: true } });
    else await tx.deliverySlot.create({ data: { zoneId: zone.id, label, startTime, endTime, capacity, active: true } });
  }

  const staff = await tx.deliveryStaff.upsert({
    where: { phone: "9876500011" },
    update: { name: "Rohan Patel", zoneId: zone.id, active: true },
    create: { name: "Rohan Patel", phone: "9876500011", zoneId: zone.id, active: true },
  });

  const slots = await tx.deliverySlot.findMany({ where: { zoneId: zone.id, active: true } });
  return { staff, slots: new Map(slots.map((slot) => [slot.label, slot])) };
}

async function ensureCoupons(tx: Prisma.TransactionClient, admins: AdminMap) {
  await tx.coupon.deleteMany({ where: { code: { notIn: cleanCouponCodes } } });
  const now = new Date();
  const startAt = new Date(now);
  startAt.setDate(startAt.getDate() - 30);
  const endAt = new Date(now);
  endAt.setDate(endAt.getDate() + 180);

  const coupons = new Map<string, { id: string; code: string; type: CouponType; value: Decimal; minOrderAmount: Decimal }>();
  for (const coupon of couponSeeds) {
    const row = await tx.coupon.upsert({
      where: { code: coupon.code },
      update: {
        title: coupon.title,
        type: coupon.type,
        value: money(coupon.value),
        minOrderAmount: money(coupon.minOrderAmount),
        maxDiscount: money(coupon.maxDiscount),
        usageLimit: coupon.usageLimit,
        perUserLimit: coupon.perUserLimit,
        usedCount: 0,
        active: true,
        deletedAt: null,
        startAt,
        endAt,
        createdByAdminId: admins.get("superadmin@eagleclub.in")?.id,
      },
      create: {
        ...coupon,
        value: money(coupon.value),
        minOrderAmount: money(coupon.minOrderAmount),
        maxDiscount: money(coupon.maxDiscount),
        usedCount: 0,
        active: true,
        startAt,
        endAt,
        createdByAdminId: admins.get("superadmin@eagleclub.in")?.id,
      },
      select: { id: true, code: true, type: true, value: true, minOrderAmount: true },
    });
    coupons.set(row.code, row);
  }
  return coupons;
}

async function ensureCatalogHealth(tx: Prisma.TransactionClient) {
  const products = await tx.product.findMany({
    where: { deletedAt: null },
    include: { images: true, variants: true, inventory: true },
    orderBy: { name: "asc" },
  });

  for (const [index, product] of products.entries()) {
    if (!product.images.length) {
      await tx.productImage.create({ data: { productId: product.id, url: productFallback, alt: product.name, isPrimary: true, sortOrder: 1 } });
    }
    if (!product.variants.length) {
      const variant = await tx.productVariant.create({
        data: { productId: product.id, sku: `${product.sku}-V1`, label: "1 pc", unit: "1 pc", mrp: money(100), price: money(90), status: ProductStatus.ACTIVE },
      });
      await tx.inventory.create({ data: { productId: product.id, variantId: variant.id, stock: 40, lowStockThreshold: 10 } });
      continue;
    }

    for (const [variantIndex, variant] of product.variants.entries()) {
      const existing = product.inventory.find((item) => item.variantId === variant.id);
      const stock = 35 + ((index + variantIndex) % 55);
      if (existing) await tx.inventory.update({ where: { id: existing.id }, data: { stock, lowStockThreshold: Math.max(8, Math.round(stock * 0.18)) } });
      else await tx.inventory.create({ data: { productId: product.id, variantId: variant.id, stock, lowStockThreshold: Math.max(8, Math.round(stock * 0.18)) } });
    }
  }
}

async function resolveOrderProducts(tx: Prisma.TransactionClient, slugs: readonly string[]) {
  const products = await tx.product.findMany({
    where: { slug: { in: [...slugs] }, deletedAt: null, status: ProductStatus.ACTIVE },
    include: { variants: { where: { status: ProductStatus.ACTIVE }, orderBy: { createdAt: "asc" } }, inventory: true },
  });
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const fallback = await tx.product.findMany({
    where: { deletedAt: null, status: ProductStatus.ACTIVE, variants: { some: { status: ProductStatus.ACTIVE } }, inventory: { some: { stock: { gt: 5 } } } },
    include: { variants: { where: { status: ProductStatus.ACTIVE }, orderBy: { createdAt: "asc" } }, inventory: true },
    take: 10,
    orderBy: [{ featured: "desc" }, { name: "asc" }],
  });
  return slugs.map((slug, index) => bySlug.get(slug) ?? fallback[index % fallback.length]).filter(Boolean);
}

function calculateTotals(items: { product: ProductWithVariant; quantity: number }[], coupon?: { type: CouponType; value: Decimal } | null) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.product.variants[0].price) * item.quantity, 0);
  const discount = items.reduce((sum, item) => sum + Math.max(0, Number(item.product.variants[0].mrp) - Number(item.product.variants[0].price)) * item.quantity, 0);
  const gstTotal = items.reduce((sum, item) => sum + (Number(item.product.variants[0].price) * item.quantity * Number(item.product.gst)) / 100, 0);
  let couponDiscount = 0;
  let deliveryCharge = subtotal >= 699 ? 0 : 39;
  if (coupon) {
    if (coupon.type === CouponType.FIXED) couponDiscount = Math.min(Number(coupon.value), subtotal);
    if (coupon.type === CouponType.PERCENTAGE) couponDiscount = Math.round((subtotal * Number(coupon.value)) / 100);
    if (coupon.type === CouponType.FREE_DELIVERY) {
      couponDiscount = deliveryCharge;
      deliveryCharge = 0;
    }
  }
  const handlingCharge = 12;
  const grandTotal = Math.max(0, subtotal - couponDiscount + gstTotal + deliveryCharge + handlingCharge);
  return { subtotal, discount, gstTotal, couponDiscount, deliveryCharge, handlingCharge, grandTotal };
}

async function createDemoOrders(
  tx: Prisma.TransactionClient,
  customers: CustomerMap,
  coupons: Map<string, { id: string; code: string; type: CouponType; value: Decimal; minOrderAmount: Decimal }>,
  delivery: Awaited<ReturnType<typeof ensureDelivery>>,
) {
  for (const [orderIndex, plan] of orderPlans.entries()) {
    const customer = customers.get(plan.customerEmail);
    if (!customer) throw new Error(`Missing demo customer ${plan.customerEmail}`);
    const address = customer.addresses.find((item) => item.isDefault) ?? customer.addresses[0];
    if (!address) throw new Error(`Missing address for ${plan.customerEmail}`);
    const coupon = plan.couponCode ? coupons.get(plan.couponCode) : null;
    const products = await resolveOrderProducts(tx, plan.productSlugs);
    if (products.length < 3) throw new Error("Need at least three active products to create demo orders.");
    const items = products.map((product, index) => ({ product, quantity: plan.quantities[index] ?? 1 }));
    const totals = calculateTotals(items, coupon);
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + orderIndex + 1);
    const slot = delivery.slots.get(plan.slotLabel) ?? Array.from(delivery.slots.values())[0];

    const order = await tx.order.create({
      data: {
        orderNumber: plan.orderNumber,
        userId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        addressId: address.id,
        addressLabel: address.label,
        addressLine: address.line,
        addressCity: address.city,
        addressState: address.state,
        addressPincode: address.pincode,
        deliveryDate,
        deliverySlotId: slot?.id,
        status: plan.status,
        paymentStatus: plan.paymentStatus,
        paymentMethod: plan.method,
        couponId: coupon?.id,
        subtotal: money(totals.subtotal),
        discount: money(totals.discount),
        couponDiscount: money(totals.couponDiscount),
        gstTotal: money(totals.gstTotal),
        deliveryCharge: money(totals.deliveryCharge),
        handlingCharge: money(totals.handlingCharge),
        grandTotal: money(totals.grandTotal),
      },
    });

    for (const item of items) {
      const variant = item.product.variants[0];
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: item.product.id,
          variantId: variant.id,
          nameSnapshot: item.product.name,
          skuSnapshot: variant.sku,
          quantity: item.quantity,
          mrp: variant.mrp,
          sellingPrice: variant.price,
          discount: money(Math.max(0, Number(variant.mrp) - Number(variant.price)) * item.quantity),
          gst: item.product.gst,
          lineTotal: money(Number(variant.price) * item.quantity),
        },
      });
      const inventory = await tx.inventory.findFirst({ where: { productId: item.product.id, variantId: variant.id } });
      if (inventory) {
        await tx.inventory.update({ where: { id: inventory.id }, data: { stock: { decrement: item.quantity } } });
        await tx.stockMovement.create({
          data: { inventoryId: inventory.id, productId: item.product.id, variantId: variant.id, type: StockMovementType.SALE, quantity: item.quantity, orderId: order.id, note: `Demo sale ${order.orderNumber}` },
        });
      }
    }

    await tx.payment.create({
      data: {
        orderId: order.id,
        method: plan.method,
        status: plan.paymentStatus,
        amount: money(totals.grandTotal),
        razorpayOrderId: plan.method === PaymentMethod.RAZORPAY ? `order_demo_${orderIndex + 1}` : null,
        razorpayPaymentId: plan.method === PaymentMethod.RAZORPAY && plan.paymentStatus === PaymentStatus.PAID ? `pay_demo_${orderIndex + 1}` : null,
      },
    });

    if (coupon) {
      await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      await tx.couponUsage.create({ data: { couponId: coupon.id, userId: customer.id, orderId: order.id, discountAmount: money(totals.couponDiscount) } });
    }

    if (plan.deliveryStatus) {
      await tx.deliveryAssignment.create({
        data: {
          orderId: order.id,
          deliveryStaffId: delivery.staff.id,
          status: plan.deliveryStatus,
          pickedUpAt: plan.deliveryStatus === DeliveryStatus.OUT_FOR_DELIVERY || plan.deliveryStatus === DeliveryStatus.DELIVERED ? new Date() : null,
          deliveredAt: plan.deliveryStatus === DeliveryStatus.DELIVERED ? new Date() : null,
        },
      });
    }

    if (plan.invoice) {
      await tx.invoice.create({
        data: {
          invoiceNumber: invoiceNumber(order.orderNumber),
          orderId: order.id,
          subtotal: money(totals.subtotal),
          couponDiscount: money(totals.couponDiscount),
          deliveryCharge: money(totals.deliveryCharge),
          handlingCharge: money(totals.handlingCharge),
          gstTotal: money(totals.gstTotal),
          grandTotal: money(totals.grandTotal),
          pdfUrl: `/invoices/${invoiceNumber(order.orderNumber)}.pdf`,
        },
      });
    }
  }
}

async function ensureSettings(tx: Prisma.TransactionClient, admins: AdminMap) {
  await tx.setting.upsert({ where: { key: "storeName" }, update: { value: "Eagle Mart Grocery & Essentials", type: SettingType.STRING, updatedByAdminId: admins.get("superadmin@eagleclub.in")?.id }, create: { key: "storeName", value: "Eagle Mart Grocery & Essentials", type: SettingType.STRING, updatedByAdminId: admins.get("superadmin@eagleclub.in")?.id } });
  await tx.setting.upsert({ where: { key: "supportEmail" }, update: { value: "support@eaglemart.in", type: SettingType.STRING, updatedByAdminId: admins.get("superadmin@eagleclub.in")?.id }, create: { key: "supportEmail", value: "support@eaglemart.in", type: SettingType.STRING, updatedByAdminId: admins.get("superadmin@eagleclub.in")?.id } });
  await tx.setting.upsert({ where: { key: "defaultCity" }, update: { value: "Ahmedabad", type: SettingType.STRING, updatedByAdminId: admins.get("superadmin@eagleclub.in")?.id }, create: { key: "defaultCity", value: "Ahmedabad", type: SettingType.STRING, updatedByAdminId: admins.get("superadmin@eagleclub.in")?.id } });
  await tx.setting.upsert({ where: { key: "gstNumber" }, update: { value: "24ABCDE1234F1Z5", type: SettingType.STRING, updatedByAdminId: admins.get("superadmin@eagleclub.in")?.id }, create: { key: "gstNumber", value: "24ABCDE1234F1Z5", type: SettingType.STRING, updatedByAdminId: admins.get("superadmin@eagleclub.in")?.id } });
}

async function validateDemoState() {
  const issues: string[] = [];
  const duplicateProductSlugs = await prisma.$queryRaw<{ slug: string; count: bigint }[]>`SELECT slug, COUNT(*) AS count FROM Product GROUP BY slug HAVING COUNT(*) > 1`;
  const duplicateProductSkus = await prisma.$queryRaw<{ sku: string; count: bigint }[]>`SELECT sku, COUNT(*) AS count FROM Product GROUP BY sku HAVING COUNT(*) > 1`;
  const duplicateCouponCodes = await prisma.$queryRaw<{ code: string; count: bigint }[]>`SELECT code, COUNT(*) AS count FROM Coupon GROUP BY code HAVING COUNT(*) > 1`;
  const orphanOrders = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM \`Order\` o LEFT JOIN User u ON o.userId = u.id WHERE o.userId IS NOT NULL AND u.id IS NULL`;
  const orphanOrderItems = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM OrderItem oi LEFT JOIN \`Order\` o ON oi.orderId = o.id LEFT JOIN Product p ON oi.productId = p.id WHERE o.id IS NULL OR p.id IS NULL`;
  const orphanPayments = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM Payment p LEFT JOIN \`Order\` o ON p.orderId = o.id WHERE o.id IS NULL`;
  const orphanInvoices = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM Invoice i LEFT JOIN \`Order\` o ON i.orderId = o.id WHERE o.id IS NULL`;
  const productsMissingCatalog = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM Product p LEFT JOIN Brand b ON p.brandId = b.id LEFT JOIN Category c ON p.categoryId = c.id WHERE b.id IS NULL OR c.id IS NULL`;
  if (duplicateProductSlugs.length) issues.push("duplicate product slugs");
  if (duplicateProductSkus.length) issues.push("duplicate product SKUs");
  if (duplicateCouponCodes.length) issues.push("duplicate coupon codes");
  if (Number(orphanOrders[0]?.count ?? 0) > 0) issues.push("orphan orders");
  if (Number(orphanOrderItems[0]?.count ?? 0) > 0) issues.push("orphan order items");
  if (Number(orphanPayments[0]?.count ?? 0) > 0) issues.push("orphan payments");
  if (Number(orphanInvoices[0]?.count ?? 0) > 0) issues.push("orphan invoices");
  if (Number(productsMissingCatalog[0]?.count ?? 0) > 0) issues.push("products missing brand/category");
  if (await prisma.product.count({ where: { inventory: { none: {} } } })) issues.push("products missing inventory");
  if (await prisma.product.count({ where: { images: { none: {} } } })) issues.push("products missing image path");
  if (await prisma.order.count({ where: { userId: { not: null }, user: { is: null } } })) issues.push("orders missing valid customer");
  return issues;
}

async function finalCounts() {
  const [users, admins, categories, brands, products, inventory, coupons, orders, payments, invoices, stockMovements] = await Promise.all([
    prisma.user.count(),
    prisma.adminUser.count(),
    prisma.category.count({ where: { deletedAt: null } }),
    prisma.brand.count({ where: { deletedAt: null } }),
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.inventory.count(),
    prisma.coupon.count(),
    prisma.order.count(),
    prisma.payment.count(),
    prisma.invoice.count(),
    prisma.stockMovement.count(),
  ]);
  return { users, admins, categories, brands, products, inventory, coupons, orders, payments, invoices, stockMovements };
}

async function main() {
  await prisma.$transaction(async (tx) => {
    await cleanupTransactionalData(tx);
    await cleanupFakeCatalog(tx);
    const admins = await ensureRolesAndAdmins(tx);
    await ensureSettings(tx, admins);
    const customers = await ensureCustomers(tx);
    const delivery = await ensureDelivery(tx);
    const coupons = await ensureCoupons(tx, admins);
    await ensureCatalogHealth(tx);
    await createDemoOrders(tx, customers, coupons, delivery);
    for (const email of demoCustomerEmails) {
      const customer = customers.get(email);
      if (customer) await tx.cart.create({ data: { userId: customer.id } });
    }
  }, { timeout: 60_000 });

  const issues = await validateDemoState();
  const counts = await finalCounts();
  console.log("Eagle Mart demo reset completed.");
  console.table(counts);
  if (issues.length) {
    console.error(`Validation issues: ${issues.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("Validation checks passed.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
