import bcrypt from "bcrypt";
import {
  AdminStatus,
  CouponType,
  DeliveryStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  ProductStatus,
  RefundStatus,
  ReturnStatus,
  ReviewStatus,
  RoleName,
  SettingType,
  StockMovementType,
  UserStatus,
} from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { daysFromNow } from "../lib/dates.js";
import { invoiceNumber, orderNumber, slugify } from "../lib/ids.js";

const prisma = new PrismaClient();

const imageFor = (query: string) => `https://source.unsplash.com/700x700/?${encodeURIComponent(query)}`;
const money = (value: number) => new Decimal(value);
const gstAmount = (subtotal: number, gstPercent: number) => Number(((subtotal * gstPercent) / 100).toFixed(2));

type SeedProduct = {
  name: string;
  category: string;
  brand: string;
  unit: string;
  mrp: number;
  price: number;
  gst: number;
  stock: number;
  lowStockThreshold: number;
  rating: number;
  reviewCount: number;
  imageQuery: string;
  tags: string[];
  featured?: boolean;
  organic?: boolean;
  local?: boolean;
};

const categories = [
  "Fruits & Vegetables",
  "Dairy, Bread & Eggs",
  "Atta, Rice & Dal",
  "Masala & Oil",
  "Snacks & Beverages",
  "Packaged Food",
  "Household Essentials",
  "Personal Care",
  "Organic Store",
  "Baby Care",
];

const products: SeedProduct[] = [
  { name: "Amul Taaza Milk 1L", category: "Dairy, Bread & Eggs", brand: "Amul", unit: "1 L", mrp: 72, price: 68, gst: 5, stock: 92, lowStockThreshold: 12, rating: 4.7, reviewCount: 842, imageQuery: "milk bottle", tags: ["Fresh Everyday", "Bestseller"], featured: true },
  { name: "Amul Butter 500g", category: "Dairy, Bread & Eggs", brand: "Amul", unit: "500 g", mrp: 285, price: 268, gst: 12, stock: 36, lowStockThreshold: 10, rating: 4.8, reviewCount: 611, imageQuery: "butter", tags: ["Club Pick"], featured: true },
  { name: "Mother Dairy Paneer 200g", category: "Dairy, Bread & Eggs", brand: "Mother Dairy", unit: "200 g", mrp: 95, price: 88, gst: 5, stock: 28, lowStockThreshold: 10, rating: 4.5, reviewCount: 312, imageQuery: "paneer", tags: ["Fresh"] },
  { name: "Aashirvaad Atta 5kg", category: "Atta, Rice & Dal", brand: "Aashirvaad", unit: "5 kg", mrp: 310, price: 279, gst: 5, stock: 65, lowStockThreshold: 15, rating: 4.6, reviewCount: 702, imageQuery: "wheat flour", tags: ["Deal"], featured: true },
  { name: "India Gate Basmati Rice 5kg", category: "Atta, Rice & Dal", brand: "India Gate", unit: "5 kg", mrp: 899, price: 779, gst: 5, stock: 41, lowStockThreshold: 12, rating: 4.8, reviewCount: 420, imageQuery: "basmati rice", tags: ["Premium"], featured: true },
  { name: "Tata Salt 1kg", category: "Masala & Oil", brand: "Tata", unit: "1 kg", mrp: 28, price: 25, gst: 5, stock: 120, lowStockThreshold: 20, rating: 4.7, reviewCount: 1100, imageQuery: "salt pack", tags: ["Daily Essential"] },
  { name: "Fortune Sunflower Oil 1L", category: "Masala & Oil", brand: "Fortune", unit: "1 L", mrp: 170, price: 148, gst: 5, stock: 58, lowStockThreshold: 15, rating: 4.4, reviewCount: 533, imageQuery: "sunflower oil bottle", tags: ["Deal"], featured: true },
  { name: "Tur Dal 1kg", category: "Atta, Rice & Dal", brand: "Eagleclub Select", unit: "1 kg", mrp: 210, price: 184, gst: 5, stock: 18, lowStockThreshold: 10, rating: 4.6, reviewCount: 289, imageQuery: "tur dal lentils", tags: ["Premium"], featured: true },
  { name: "Red Label Tea 500g", category: "Snacks & Beverages", brand: "Brooke Bond", unit: "500 g", mrp: 320, price: 294, gst: 18, stock: 44, lowStockThreshold: 12, rating: 4.5, reviewCount: 392, imageQuery: "tea pack", tags: ["Bestseller"] },
  { name: "Maggi Noodles Pack of 12", category: "Packaged Food", brand: "Maggi", unit: "840 g", mrp: 168, price: 150, gst: 12, stock: 90, lowStockThreshold: 20, rating: 4.7, reviewCount: 940, imageQuery: "instant noodles", tags: ["Family Pack"] },
  { name: "Parle-G Biscuit Pack", category: "Snacks & Beverages", brand: "Parle", unit: "800 g", mrp: 115, price: 99, gst: 18, stock: 96, lowStockThreshold: 20, rating: 4.6, reviewCount: 860, imageQuery: "biscuit pack", tags: ["Value"] },
  { name: "Britannia Bread", category: "Dairy, Bread & Eggs", brand: "Britannia", unit: "400 g", mrp: 55, price: 50, gst: 5, stock: 24, lowStockThreshold: 14, rating: 4.3, reviewCount: 244, imageQuery: "bread loaf", tags: ["Fresh"] },
  { name: "Fresh Tomato 1kg", category: "Fruits & Vegetables", brand: "Eagleclub Farms", unit: "1 kg", mrp: 70, price: 52, gst: 0, stock: 72, lowStockThreshold: 18, rating: 4.4, reviewCount: 560, imageQuery: "fresh tomato", tags: ["Local", "Fresh"], featured: true, local: true },
  { name: "Fresh Onion 1kg", category: "Fruits & Vegetables", brand: "Eagleclub Farms", unit: "1 kg", mrp: 58, price: 44, gst: 0, stock: 80, lowStockThreshold: 18, rating: 4.5, reviewCount: 620, imageQuery: "red onion", tags: ["Local"], local: true },
  { name: "Fresh Potato 1kg", category: "Fruits & Vegetables", brand: "Eagleclub Farms", unit: "1 kg", mrp: 52, price: 39, gst: 0, stock: 95, lowStockThreshold: 18, rating: 4.3, reviewCount: 710, imageQuery: "potato", tags: ["Local"], local: true },
  { name: "Banana 1 dozen", category: "Fruits & Vegetables", brand: "Eagleclub Farms", unit: "12 pcs", mrp: 95, price: 78, gst: 0, stock: 43, lowStockThreshold: 12, rating: 4.6, reviewCount: 411, imageQuery: "banana bunch", tags: ["Fresh"], featured: true, local: true },
  { name: "Apple 1kg", category: "Fruits & Vegetables", brand: "Eagleclub Select", unit: "1 kg", mrp: 240, price: 199, gst: 0, stock: 22, lowStockThreshold: 10, rating: 4.7, reviewCount: 352, imageQuery: "red apples", tags: ["Premium"], featured: true },
  { name: "Coriander bunch", category: "Fruits & Vegetables", brand: "Eagleclub Farms", unit: "1 bunch", mrp: 25, price: 15, gst: 0, stock: 9, lowStockThreshold: 8, rating: 4.2, reviewCount: 180, imageQuery: "coriander", tags: ["Local"], local: true },
  { name: "Surf Excel Detergent 1kg", category: "Household Essentials", brand: "Surf Excel", unit: "1 kg", mrp: 260, price: 235, gst: 18, stock: 31, lowStockThreshold: 10, rating: 4.5, reviewCount: 288, imageQuery: "detergent", tags: ["Household"] },
  { name: "Harpic Toilet Cleaner 1L", category: "Household Essentials", brand: "Harpic", unit: "1 L", mrp: 210, price: 189, gst: 18, stock: 20, lowStockThreshold: 10, rating: 4.4, reviewCount: 190, imageQuery: "toilet cleaner", tags: ["Household"] },
  { name: "Dettol Handwash", category: "Personal Care", brand: "Dettol", unit: "750 ml", mrp: 109, price: 98, gst: 18, stock: 45, lowStockThreshold: 12, rating: 4.6, reviewCount: 376, imageQuery: "handwash", tags: ["Hygiene"] },
  { name: "Colgate Toothpaste", category: "Personal Care", brand: "Colgate", unit: "200 g", mrp: 130, price: 115, gst: 18, stock: 40, lowStockThreshold: 12, rating: 4.5, reviewCount: 432, imageQuery: "toothpaste", tags: ["Care"] },
  { name: "Himalaya Baby Shampoo", category: "Baby Care", brand: "Himalaya", unit: "400 ml", mrp: 260, price: 229, gst: 18, stock: 12, lowStockThreshold: 10, rating: 4.4, reviewCount: 30, imageQuery: "baby shampoo", tags: ["Baby Care"] },
];

async function resetData() {
  await prisma.refund.deleteMany();
  await prisma.returnRequest.deleteMany();
  await prisma.review.deleteMany();
  await prisma.deliveryAssignment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.couponUsage.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.wishlistItem.deleteMany();
  await prisma.wishlist.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.deliveryStaff.deleteMany();
  await prisma.deliverySlot.deleteMany();
  await prisma.deliveryZone.deleteMany();
  await prisma.address.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.role.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await resetData();

  const passwordHash = await bcrypt.hash("Eagleclub@12345", 12);
  const customerPasswordHash = await bcrypt.hash("Customer@12345", 12);

  const rolePermissions: Record<RoleName, string[]> = {
    SUPER_ADMIN: ["*"],
    STORE_MANAGER: ["catalog:*", "orders:*", "reports:read"],
    INVENTORY_MANAGER: ["inventory:*", "catalog:read"],
    ORDER_MANAGER: ["orders:*", "delivery:assign"],
    DELIVERY_STAFF: ["delivery:*", "orders:read"],
    SUPPORT_STAFF: ["customers:read", "orders:read", "returns:*"],
    BILLING_STAFF: ["payments:read", "invoices:*", "reports:read"],
  };

  const roles = new Map<RoleName, { id: string }>();
  for (const name of Object.values(RoleName)) {
    const role = await prisma.role.create({
      data: { name, permissions: rolePermissions[name] },
      select: { id: true },
    });
    roles.set(name, role);
  }

  const adminSeeds = [
    ["Eagleclub Super Admin", "superadmin@eagleclub.in", RoleName.SUPER_ADMIN],
    ["Store Manager", "store.manager@eagleclub.in", RoleName.STORE_MANAGER],
    ["Inventory Manager", "inventory@eagleclub.in", RoleName.INVENTORY_MANAGER],
    ["Orders Manager", "orders@eagleclub.in", RoleName.ORDER_MANAGER],
    ["Delivery Lead", "delivery@eagleclub.in", RoleName.DELIVERY_STAFF],
    ["Billing Manager", "billing@eagleclub.in", RoleName.BILLING_STAFF],
  ] as const;

  const admins = [];
  for (const [name, email, roleName] of adminSeeds) {
    admins.push(await prisma.adminUser.create({
      data: {
        name,
        email,
        passwordHash,
        status: AdminStatus.ACTIVE,
        roleId: roles.get(roleName)!.id,
      },
    }));
  }

  const customer = await prisma.user.create({
    data: {
      name: "Manav Shah",
      email: "customer@eagleclub.in",
      phone: "9876543210",
      passwordHash: customerPasswordHash,
      status: UserStatus.ACTIVE,
    },
  });

  const homeAddress = await prisma.address.create({
    data: {
      userId: customer.id,
      label: "Home",
      name: "Manav Shah",
      phone: "9876543210",
      line: "A-1202, Eagle Heights, Satellite Road",
      city: "Ahmedabad",
      state: "Gujarat",
      pincode: "380015",
      isDefault: true,
    },
  });

  await prisma.address.create({
    data: {
      userId: customer.id,
      label: "Office",
      name: "Manav Shah",
      phone: "9876543210",
      line: "Premium Plaza, C G Road",
      city: "Ahmedabad",
      state: "Gujarat",
      pincode: "380009",
    },
  });

  const zoneSeeds = [
    ["Mumbai", ["400001", "400050", "400076"], 49, 799],
    ["Ahmedabad", ["380009", "380015", "380054"], 39, 699],
    ["Vadodara", ["390001", "390007", "390020"], 49, 799],
    ["Surat", ["395003", "395007", "395009"], 49, 799],
    ["Rajkot", ["360001", "360005", "360007"], 59, 899],
  ] as const;

  const zones = new Map<string, { id: string }>();
  for (const [city, pincodes, deliveryCharge, freeDeliveryThreshold] of zoneSeeds) {
    const zone = await prisma.deliveryZone.create({
      data: {
        city,
        pincodes,
        deliveryCharge: money(deliveryCharge),
        freeDeliveryThreshold: money(freeDeliveryThreshold),
        active: true,
      },
      select: { id: true },
    });
    zones.set(city, zone);
  }

  const ahmedabad = zones.get("Ahmedabad")!;
  const slots = await Promise.all([
    prisma.deliverySlot.create({ data: { zoneId: ahmedabad.id, label: "Morning", startTime: "08:00", endTime: "11:00", capacity: 60 } }),
    prisma.deliverySlot.create({ data: { zoneId: ahmedabad.id, label: "Afternoon", startTime: "12:00", endTime: "15:00", capacity: 50 } }),
    prisma.deliverySlot.create({ data: { zoneId: ahmedabad.id, label: "Evening", startTime: "17:00", endTime: "20:00", capacity: 70 } }),
    prisma.deliverySlot.create({ data: { zoneId: ahmedabad.id, label: "Express", startTime: "00:00", endTime: "23:59", capacity: 25 } }),
  ]);

  const staffSeeds = [
    ["Rohan Patel", "9876500011", "Ahmedabad"],
    ["Aman Shah", "9876500012", "Mumbai"],
    ["Neha Joshi", "9876500013", "Surat"],
    ["Kiran Mehta", "9876500014", "Vadodara"],
  ] as const;

  const staff = [];
  for (const [name, phone, city] of staffSeeds) {
    staff.push(await prisma.deliveryStaff.create({
      data: { name, phone, zoneId: zones.get(city)!.id, active: true },
    }));
  }

  const categoryMap = new Map<string, { id: string }>();
  for (const [index, name] of categories.entries()) {
    const category = await prisma.category.create({
      data: {
        name,
        slug: slugify(name),
        image: imageFor(name),
        sortOrder: index + 1,
        status: ProductStatus.ACTIVE,
      },
      select: { id: true },
    });
    categoryMap.set(name, category);
  }

  const brandNames = [...new Set(products.map((product) => product.brand))];
  const brandMap = new Map<string, { id: string }>();
  for (const name of brandNames) {
    const brand = await prisma.brand.create({
      data: { name, slug: slugify(name), status: ProductStatus.ACTIVE },
      select: { id: true },
    });
    brandMap.set(name, brand);
  }

  const createdProducts = [];
  for (const [index, item] of products.entries()) {
    const product = await prisma.product.create({
      data: {
        name: item.name,
        slug: slugify(item.name),
        sku: `EC-${String(index + 101).padStart(4, "0")}`,
        categoryId: categoryMap.get(item.category)!.id,
        brandId: brandMap.get(item.brand)!.id,
        description: `${item.name} is selected for Eagleclub Grocery & Essentials with reliable freshness, transparent pricing, and careful doorstep handling.`,
        gst: money(item.gst),
        ratingAvg: money(item.rating),
        reviewCount: item.reviewCount,
        tags: item.tags,
        featured: item.featured ?? false,
        organic: item.organic ?? (item.tags.includes("Premium") || item.tags.includes("Fresh")),
        local: item.local ?? item.tags.includes("Local"),
        status: ProductStatus.ACTIVE,
      },
    });

    await prisma.productImage.create({
      data: {
        productId: product.id,
        url: imageFor(item.imageQuery),
        alt: item.name,
        isPrimary: true,
        sortOrder: 1,
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `${product.sku}-V1`,
        label: item.unit,
        unit: item.unit,
        mrp: money(item.mrp),
        price: money(item.price),
        status: ProductStatus.ACTIVE,
      },
    });

    const inventory = await prisma.inventory.create({
      data: {
        productId: product.id,
        variantId: variant.id,
        stock: item.stock,
        lowStockThreshold: item.lowStockThreshold,
      },
    });

    await prisma.stockMovement.create({
      data: {
        inventoryId: inventory.id,
        productId: product.id,
        variantId: variant.id,
        type: StockMovementType.RESTOCK,
        quantity: item.stock,
        note: "Initial seed stock",
        adminUserId: admins[2].id,
      },
    });

    createdProducts.push({ product, variant, seed: item });
  }

  const couponSeeds = [
    { code: "WELCOME100", title: "Rs 100 off your first premium basket", type: CouponType.FIXED, value: 100, minOrderAmount: 699, maxDiscount: 100, usageLimit: 5000, perUserLimit: 1 },
    { code: "FRESH20", title: "20% off fruits and vegetables", type: CouponType.PERCENTAGE, value: 20, minOrderAmount: 399, maxDiscount: 150, usageLimit: 3000, perUserLimit: 5 },
    { code: "FREESHIP", title: "Free delivery on club baskets", type: CouponType.FREE_DELIVERY, value: 49, minOrderAmount: 499, maxDiscount: 49, usageLimit: 4000, perUserLimit: 10 },
    { code: "FESTIVE10", title: "10% festive savings", type: CouponType.PERCENTAGE, value: 10, minOrderAmount: 999, maxDiscount: 250, usageLimit: 2000, perUserLimit: 3 },
  ];

  const createdCoupons = [];
  for (const coupon of couponSeeds) {
    createdCoupons.push(await prisma.coupon.create({
      data: {
        ...coupon,
        value: money(coupon.value),
        minOrderAmount: money(coupon.minOrderAmount),
        maxDiscount: money(coupon.maxDiscount),
        startAt: daysFromNow(-30),
        endAt: daysFromNow(180),
        active: true,
        createdByAdminId: admins[0].id,
      },
    }));
  }

  await prisma.cart.create({
    data: {
      userId: customer.id,
      couponId: createdCoupons[0].id,
      items: {
        create: createdProducts.slice(0, 2).map(({ product, variant, seed }) => ({
          productId: product.id,
          variantId: variant.id,
          quantity: 1,
          unitPriceSnapshot: money(seed.price),
        })),
      },
    },
  });

  await prisma.wishlist.create({
    data: {
      userId: customer.id,
      items: {
        create: createdProducts.slice(4, 6).map(({ product }) => ({ productId: product.id })),
      },
    },
  });

  const orderProducts = [createdProducts[0], createdProducts[4], createdProducts[12]];
  const subtotal = orderProducts.reduce((sum, item, index) => sum + item.seed.price * (index === 2 ? 2 : 1), 0);
  const discount = orderProducts.reduce((sum, item, index) => sum + (item.seed.mrp - item.seed.price) * (index === 2 ? 2 : 1), 0);
  const gstTotal = orderProducts.reduce((sum, item, index) => sum + gstAmount(item.seed.price * (index === 2 ? 2 : 1), item.seed.gst), 0);
  const couponDiscount = 120;
  const deliveryCharge = 0;
  const handlingCharge = 12;
  const grandTotal = subtotal - couponDiscount + gstTotal + deliveryCharge + handlingCharge;

  const deliveredOrder = await prisma.order.create({
    data: {
      orderNumber: orderNumber(9480),
      userId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      addressId: homeAddress.id,
      addressLabel: homeAddress.label,
      addressLine: homeAddress.line,
      addressCity: homeAddress.city,
      addressState: homeAddress.state,
      addressPincode: homeAddress.pincode,
      deliveryDate: daysFromNow(1),
      deliverySlotId: slots[0].id,
      status: OrderStatus.DELIVERED,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.RAZORPAY,
      couponId: createdCoupons[1].id,
      subtotal: money(subtotal),
      discount: money(discount),
      couponDiscount: money(couponDiscount),
      gstTotal: money(gstTotal),
      deliveryCharge: money(deliveryCharge),
      handlingCharge: money(handlingCharge),
      grandTotal: money(grandTotal),
    },
  });

  for (const [index, item] of orderProducts.entries()) {
    const quantity = index === 2 ? 2 : 1;
    await prisma.orderItem.create({
      data: {
        orderId: deliveredOrder.id,
        productId: item.product.id,
        variantId: item.variant.id,
        nameSnapshot: item.seed.name,
        skuSnapshot: item.product.sku,
        quantity,
        mrp: money(item.seed.mrp),
        sellingPrice: money(item.seed.price),
        discount: money((item.seed.mrp - item.seed.price) * quantity),
        gst: money(item.seed.gst),
        lineTotal: money(item.seed.price * quantity),
      },
    });
  }

  const payment = await prisma.payment.create({
    data: {
      orderId: deliveredOrder.id,
      method: PaymentMethod.RAZORPAY,
      status: PaymentStatus.PAID,
      amount: money(grandTotal),
      razorpayOrderId: "order_seed_9480",
      razorpayPaymentId: "pay_seed_9480",
    },
  });

  await prisma.invoice.create({
    data: {
      invoiceNumber: invoiceNumber(deliveredOrder.orderNumber),
      orderId: deliveredOrder.id,
      subtotal: money(subtotal),
      couponDiscount: money(couponDiscount),
      deliveryCharge: money(deliveryCharge),
      handlingCharge: money(handlingCharge),
      gstTotal: money(gstTotal),
      grandTotal: money(grandTotal),
    },
  });

  await prisma.deliveryAssignment.create({
    data: {
      orderId: deliveredOrder.id,
      deliveryStaffId: staff[0].id,
      status: DeliveryStatus.DELIVERED,
      deliveredAt: daysFromNow(1),
    },
  });

  await prisma.couponUsage.create({
    data: {
      couponId: createdCoupons[1].id,
      userId: customer.id,
      orderId: deliveredOrder.id,
      discountAmount: money(couponDiscount),
    },
  });

  await prisma.review.create({
    data: {
      userId: customer.id,
      productId: createdProducts[0].product.id,
      rating: 5,
      comment: "Fresh delivery and excellent packaging.",
      status: ReviewStatus.APPROVED,
    },
  });

  const returnRequest = await prisma.returnRequest.create({
    data: {
      orderId: deliveredOrder.id,
      userId: customer.id,
      reason: "Seed return request for refund workflow validation.",
      status: ReturnStatus.REQUESTED,
    },
  });

  await prisma.refund.create({
    data: {
      returnRequestId: returnRequest.id,
      paymentId: payment.id,
      amount: money(50),
      status: RefundStatus.REQUESTED,
    },
  });

  await prisma.order.create({
    data: {
      orderNumber: orderNumber(9481),
      userId: customer.id,
      customerName: "Priya Sharma",
      customerPhone: "9876543201",
      addressId: homeAddress.id,
      addressLabel: homeAddress.label,
      addressLine: homeAddress.line,
      addressCity: homeAddress.city,
      addressState: homeAddress.state,
      addressPincode: homeAddress.pincode,
      deliveryDate: daysFromNow(2),
      deliverySlotId: slots[2].id,
      status: OrderStatus.PACKED,
      paymentStatus: PaymentStatus.COD_PENDING,
      paymentMethod: PaymentMethod.COD,
      subtotal: money(812),
      discount: money(88),
      couponDiscount: money(0),
      gstTotal: money(41),
      deliveryCharge: money(0),
      handlingCharge: money(12),
      grandTotal: money(865),
      payment: {
        create: {
          method: PaymentMethod.COD,
          status: PaymentStatus.COD_PENDING,
          amount: money(865),
        },
      },
    },
  });

  await prisma.setting.createMany({
    data: [
      { key: "storeName", value: "Eagleclub Grocery & Essentials", type: SettingType.STRING, updatedByAdminId: admins[0].id },
      { key: "supportEmail", value: "support@eagleclub.in", type: SettingType.STRING, updatedByAdminId: admins[0].id },
      { key: "defaultCity", value: "Ahmedabad", type: SettingType.STRING, updatedByAdminId: admins[0].id },
      { key: "gstNumber", value: "24ABCDE1234F1Z5", type: SettingType.STRING, updatedByAdminId: admins[0].id },
    ],
  });

  console.log("Eagleclub seed completed.");
  console.log("Admin credentials:");
  for (const [, email] of adminSeeds) console.log(`- ${email} / Eagleclub@12345`);
  console.log("Customer credentials:");
  console.log("- customer@eagleclub.in / Customer@12345");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
