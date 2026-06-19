import { CouponType, PrismaClient, ProductStatus, SettingType } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { daysFromNow } from "../lib/dates.js";
import { slugify } from "../lib/ids.js";

const prisma = new PrismaClient();
const money = (value: number) => new Decimal(value);

type ProductSeed = {
  name: string;
  category: string;
  brand: string;
  unit: string;
  mrp: number;
  price: number;
  gst: number;
  stock: number;
  rating: number;
  reviews: number;
  image: string;
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
  "Baby Care",
  "Organic Store",
];

const products: ProductSeed[] = [
  { name: "Aashirvaad Atta 5kg", category: "Atta, Rice & Dal", brand: "Aashirvaad", unit: "5 kg", mrp: 285, price: 249, gst: 5, stock: 64, rating: 4.8, reviews: 1240, image: "/assets/products/aashirvaad-atta-5kg.png", tags: ["Staple", "Atta & Flour"], featured: true },
  { name: "India Gate Basmati Rice 5kg", category: "Atta, Rice & Dal", brand: "India Gate", unit: "5 kg", mrp: 899, price: 779, gst: 5, stock: 41, rating: 4.8, reviews: 420, image: "/assets/products/india-gate-basmati-rice-5kg.png", tags: ["Premium", "Rice"], featured: true },
  { name: "Tur Dal 1kg", category: "Atta, Rice & Dal", brand: "Eagle Mart Select", unit: "1 kg", mrp: 210, price: 184, gst: 5, stock: 48, rating: 4.6, reviews: 289, image: "/assets/products/tur-dal-1kg.png", tags: ["Dal & Lentils"], featured: true },
  { name: "Tata Salt 1kg", category: "Masala & Oil", brand: "Tata", unit: "1 kg", mrp: 28, price: 25, gst: 5, stock: 120, rating: 4.7, reviews: 1100, image: "/assets/products/tata-salt-1kg.png", tags: ["Daily Essential", "Salt & Sugar"] },
  { name: "Fortune Sunflower Oil 1L", category: "Masala & Oil", brand: "Fortune", unit: "1 L", mrp: 170, price: 148, gst: 5, stock: 58, rating: 4.4, reviews: 533, image: "/assets/products/fortune-sunflower-oil-1l.png", tags: ["Deal", "Cooking Oils"], featured: true },
  { name: "Everest Turmeric Powder 200g", category: "Masala & Oil", brand: "Everest", unit: "200 g", mrp: 92, price: 82, gst: 5, stock: 70, rating: 4.5, reviews: 318, image: "/assets/products/turmeric-powder.png", tags: ["Spices"] },
  { name: "Amul Taaza Milk 1L", category: "Dairy, Bread & Eggs", brand: "Amul", unit: "1 L", mrp: 68, price: 65, gst: 0, stock: 75, rating: 4.7, reviews: 860, image: "/assets/products/amul-taaza-milk-1l.png", tags: ["Fresh", "Milk & Cream"], featured: true },
  { name: "Amul Butter 500g", category: "Dairy, Bread & Eggs", brand: "Amul", unit: "500 g", mrp: 285, price: 269, gst: 12, stock: 30, rating: 4.8, reviews: 620, image: "/assets/products/amul-butter-500g.png", tags: ["Dairy"] },
  { name: "Britannia Bread", category: "Dairy, Bread & Eggs", brand: "Britannia", unit: "400 g", mrp: 55, price: 50, gst: 5, stock: 24, rating: 4.3, reviews: 244, image: "/assets/products/britannia-bread.png", tags: ["Fresh", "Bread & Bakery"] },
  { name: "Fresh Tomato 1kg", category: "Fruits & Vegetables", brand: "Eagle Mart Farms", unit: "1 kg", mrp: 70, price: 52, gst: 0, stock: 72, rating: 4.4, reviews: 560, image: "/assets/products/fresh-tomato-1kg.png", tags: ["Fresh", "Local", "Fresh Vegetables"], featured: true, local: true },
  { name: "Fresh Potato 1kg", category: "Fruits & Vegetables", brand: "Eagle Mart Farms", unit: "1 kg", mrp: 52, price: 39, gst: 0, stock: 95, rating: 4.3, reviews: 710, image: "/assets/products/fresh-potato-1kg.png", tags: ["Local", "Fresh Vegetables"], local: true },
  { name: "Banana 1 dozen", category: "Fruits & Vegetables", brand: "Eagle Mart Farms", unit: "12 pcs", mrp: 95, price: 78, gst: 0, stock: 43, rating: 4.6, reviews: 411, image: "/assets/products/banana-1-dozen.png", tags: ["Fresh", "Local"], featured: true, local: true },
  { name: "Coriander bunch", category: "Fruits & Vegetables", brand: "Eagle Mart Farms", unit: "1 bunch", mrp: 25, price: 15, gst: 0, stock: 36, rating: 4.2, reviews: 180, image: "/assets/products/coriander-bunch.png", tags: ["Local", "Herbs"], local: true },
  { name: "Red Label Tea 500g", category: "Snacks & Beverages", brand: "Brooke Bond", unit: "500 g", mrp: 320, price: 294, gst: 18, stock: 44, rating: 4.5, reviews: 392, image: "/assets/products/black-tea.png", tags: ["Bestseller", "Tea"] },
  { name: "Parle-G Biscuit Pack", category: "Snacks & Beverages", brand: "Parle", unit: "800 g", mrp: 115, price: 99, gst: 18, stock: 96, rating: 4.6, reviews: 860, image: "/assets/products/parle-g-biscuit-pack.png", tags: ["Value", "Snack"] },
  { name: "Haldiram Namkeen 400g", category: "Snacks & Beverages", brand: "Haldiram", unit: "400 g", mrp: 120, price: 105, gst: 12, stock: 58, rating: 4.4, reviews: 310, image: "/assets/products/namkeen.png", tags: ["Snacks & Farsans"] },
  { name: "Maggi Noodles Pack of 12", category: "Packaged Food", brand: "Maggi", unit: "840 g", mrp: 168, price: 150, gst: 12, stock: 90, rating: 4.7, reviews: 940, image: "/assets/products/maggi-noodles-pack-12.png", tags: ["Family Pack", "Ready to Eat"], featured: true },
  { name: "Kissan Tomato Ketchup 500g", category: "Packaged Food", brand: "Kissan", unit: "500 g", mrp: 160, price: 142, gst: 12, stock: 44, rating: 4.3, reviews: 260, image: "/assets/products/tomato-ketchup.png", tags: ["Sauces & Spreads"] },
  { name: "Quaker Oats 1kg", category: "Packaged Food", brand: "Quaker", unit: "1 kg", mrp: 220, price: 198, gst: 18, stock: 42, rating: 4.5, reviews: 230, image: "/assets/products/oats.png", tags: ["Breakfast Cereals", "Healthy"] },
  { name: "Surf Excel Detergent 1kg", category: "Household Essentials", brand: "Surf Excel", unit: "1 kg", mrp: 260, price: 235, gst: 18, stock: 31, rating: 4.5, reviews: 288, image: "/assets/products/surf-excel-detergent-1kg.png", tags: ["Laundry"] },
  { name: "Harpic Toilet Cleaner 1L", category: "Household Essentials", brand: "Harpic", unit: "1 L", mrp: 210, price: 189, gst: 18, stock: 20, rating: 4.4, reviews: 190, image: "/assets/products/harpic-toilet-cleaner-1l.png", tags: ["Surface Cleaners"] },
  { name: "Vim Dishwash Liquid 500ml", category: "Household Essentials", brand: "Vim", unit: "500 ml", mrp: 125, price: 110, gst: 18, stock: 46, rating: 4.3, reviews: 180, image: "/assets/products/dishwash-liquid.png", tags: ["Dishwash"] },
  { name: "Colgate Toothpaste", category: "Personal Care", brand: "Colgate", unit: "200 g", mrp: 145, price: 129, gst: 18, stock: 65, rating: 4.5, reviews: 510, image: "/assets/products/colgate-toothpaste.png", tags: ["Oral Care"] },
  { name: "Dettol Handwash", category: "Personal Care", brand: "Dettol", unit: "750 ml", mrp: 109, price: 98, gst: 18, stock: 45, rating: 4.6, reviews: 376, image: "/assets/products/dettol-handwash.png", tags: ["Hygiene"] },
  { name: "Dove Shampoo 340ml", category: "Personal Care", brand: "Dove", unit: "340 ml", mrp: 360, price: 325, gst: 18, stock: 32, rating: 4.4, reviews: 260, image: "/assets/products/shampoo.png", tags: ["Hair Care"] },
  { name: "Himalaya Baby Shampoo", category: "Baby Care", brand: "Himalaya", unit: "400 ml", mrp: 260, price: 229, gst: 18, stock: 22, rating: 4.4, reviews: 130, image: "/assets/products/himalaya-baby-shampoo.png", tags: ["Baby Skin & Bath"] },
  { name: "Pampers Diaper Pants 32 pcs", category: "Baby Care", brand: "Pampers", unit: "32 pcs", mrp: 699, price: 625, gst: 12, stock: 18, rating: 4.5, reviews: 210, image: "/assets/products/diaper.png", tags: ["Diapering"] },
  { name: "24 Mantra Organic Tur Dal 1kg", category: "Organic Store", brand: "24 Mantra", unit: "1 kg", mrp: 260, price: 232, gst: 5, stock: 21, rating: 4.5, reviews: 165, image: "/assets/products/organic-tur-dal.png", tags: ["Organic", "Dal & Lentils"], organic: true },
  { name: "Organic India Honey 500g", category: "Organic Store", brand: "Organic India", unit: "500 g", mrp: 340, price: 305, gst: 12, stock: 18, rating: 4.6, reviews: 148, image: "/assets/products/organic-honey.png", tags: ["Organic", "Natural"], organic: true },
  { name: "Eagle Mart Organic Spices Kit", category: "Organic Store", brand: "Eagle Mart Organic", unit: "5 pcs", mrp: 450, price: 399, gst: 5, stock: 13, rating: 4.4, reviews: 96, image: "/assets/products/organic-spices-kit.png", tags: ["Organic", "Premium"], organic: true },
];

const faqSeeds = [
  ["Orders", "How can I place an order?", "Browse products, add items to cart, proceed to checkout, select delivery address and payment method, then place your order."],
  ["Orders", "How can I track my order?", "Visit My Orders and select the order to view tracking updates."],
  ["Payments", "Which payment methods are accepted?", "UPI, Credit Card, Debit Card, Net Banking, Wallets, and Cash on Delivery where available."],
  ["Delivery", "Do you deliver to my area?", "Use the pincode checker to verify service availability."],
  ["Returns & Refunds", "What is your return policy?", "Eligible items may be returned according to the Return Policy."],
  ["Account", "How do I create an account?", "Use the Sign Up page and verify your details."],
  ["Products", "Are products fresh and authentic?", "Eagle Mart sources products from trusted suppliers and quality partners."],
  ["Coupons & Offers", "How do I apply a coupon?", "Enter the coupon code in cart or checkout before placing the order."],
] as const;

async function upsertCatalog() {
  const categoryMap = new Map<string, { id: string }>();
  for (const [index, name] of categories.entries()) {
    const category = await prisma.category.upsert({
      where: { slug: slugify(name) },
      update: { name, image: `/assets/categories/${slugify(name)}.png`, status: ProductStatus.ACTIVE, sortOrder: index + 1 },
      create: { slug: slugify(name), name, image: `/assets/categories/${slugify(name)}.png`, status: ProductStatus.ACTIVE, sortOrder: index + 1 },
      select: { id: true },
    });
    categoryMap.set(name, category);
  }

  const brandNames = [...new Set(products.map((product) => product.brand))];
  const brandMap = new Map<string, { id: string }>();
  for (const name of brandNames) {
    const brand = await prisma.brand.upsert({
      where: { slug: slugify(name) },
      update: { name, status: ProductStatus.ACTIVE },
      create: { slug: slugify(name), name, status: ProductStatus.ACTIVE },
      select: { id: true },
    });
    brandMap.set(name, brand);
  }

  for (const [index, item] of products.entries()) {
    const slug = slugify(item.name);
    const category = categoryMap.get(item.category);
    const brand = brandMap.get(item.brand);
    if (!category || !brand) throw new Error(`Missing catalog relation for ${item.name}`);

    const product = await prisma.product.upsert({
      where: { slug },
      update: {
        name: item.name,
        categoryId: category.id,
        brandId: brand.id,
        description: `${item.name} is selected for Eagle Mart Grocery & Essentials with reliable freshness, transparent pricing, and careful doorstep handling.`,
        gst: money(item.gst),
        ratingAvg: money(item.rating),
        reviewCount: item.reviews,
        tags: item.tags,
        featured: item.featured ?? false,
        organic: item.organic ?? false,
        local: item.local ?? false,
        status: ProductStatus.ACTIVE,
      },
      create: {
        slug,
        name: item.name,
        sku: `EM-${String(index + 101).padStart(4, "0")}`,
        categoryId: category.id,
        brandId: brand.id,
        description: `${item.name} is selected for Eagle Mart Grocery & Essentials with reliable freshness, transparent pricing, and careful doorstep handling.`,
        gst: money(item.gst),
        ratingAvg: money(item.rating),
        reviewCount: item.reviews,
        tags: item.tags,
        featured: item.featured ?? false,
        organic: item.organic ?? false,
        local: item.local ?? false,
        status: ProductStatus.ACTIVE,
      },
      select: { id: true },
    });

    const existingImage = await prisma.productImage.findFirst({
      where: { productId: product.id, sortOrder: 1 },
      select: { id: true },
    });
    if (existingImage) {
      await prisma.productImage.update({
        where: { id: existingImage.id },
        data: { url: item.image, alt: item.name, isPrimary: true },
      });
    } else {
      await prisma.productImage.create({
        data: { productId: product.id, url: item.image, alt: item.name, isPrimary: true, sortOrder: 1 },
      });
    }

    const variantData = {
      sku: `${slug.toUpperCase().replace(/-/g, "-")}-${slugify(item.unit).toUpperCase()}`,
      label: item.unit,
      mrp: money(item.mrp),
      price: money(item.price),
      status: ProductStatus.ACTIVE,
    };
    const existingVariant = await prisma.productVariant.findFirst({
      where: { productId: product.id, unit: item.unit },
      select: { id: true },
    });
    if (existingVariant) {
      await prisma.productVariant.update({
        where: { id: existingVariant.id },
        data: variantData,
      });
    } else {
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          unit: item.unit,
          ...variantData,
        },
      });
    }

    const inventoryData = {
      stock: item.stock,
      lowStockThreshold: Math.max(8, Math.round(item.stock * 0.16)),
    };
    const existingInventory = await prisma.inventory.findFirst({
      where: { productId: product.id },
      select: { id: true },
    });
    if (existingInventory) {
      await prisma.inventory.update({
        where: { id: existingInventory.id },
        data: inventoryData,
      });
    } else {
      await prisma.inventory.create({
        data: {
          productId: product.id,
          ...inventoryData,
        },
      });
    }
  }
}

async function upsertOperationalContent() {
  const zones = [
    ["Vadodara", ["390001", "390007", "390020", "390024"], 49, 799],
  ] as const;

  await prisma.deliveryZone.updateMany({
    where: { city: { in: ["Gujarat", "India"] } },
    data: { active: false },
  });

  for (const [name, pincodes, fee, freeAbove] of zones) {
    await prisma.deliveryZone.upsert({
      where: { city: name },
      update: { pincodes: [...pincodes], deliveryCharge: money(fee), freeDeliveryThreshold: money(freeAbove), active: true },
      create: { city: name, pincodes: [...pincodes], deliveryCharge: money(fee), freeDeliveryThreshold: money(freeAbove), active: true },
    });
  }

  const today = new Date();
  const vadodaraZone = await prisma.deliveryZone.findUnique({ where: { city: "Vadodara" }, select: { id: true } });
  const slotSeeds = [
    ["8 AM - 10 AM", "08:00", "10:00"],
    ["10 AM - 12 PM", "10:00", "12:00"],
    ["4 PM - 6 PM", "16:00", "18:00"],
    ["6 PM - 8 PM", "18:00", "20:00"],
  ] as const;

  if (vadodaraZone) {
    for (const [label, startTime, endTime] of slotSeeds) {
      const existingSlot = await prisma.deliverySlot.findFirst({
        where: { zoneId: vadodaraZone.id, label },
        select: { id: true },
      });
      const slotData = { zoneId: vadodaraZone.id, label, startTime, endTime, capacity: 35, active: true };
      if (existingSlot) {
        await prisma.deliverySlot.update({ where: { id: existingSlot.id }, data: slotData });
      } else {
        await prisma.deliverySlot.create({ data: slotData });
      }
    }
  }

  await prisma.coupon.upsert({
    where: { code: "WELCOME50" },
    update: { type: CouponType.FIXED, value: money(50), minOrderAmount: money(499), maxDiscount: money(50), active: true, startAt: today, endAt: daysFromNow(90), usageLimit: 1000, perUserLimit: 1 },
    create: { code: "WELCOME50", title: "Welcome savings", type: CouponType.FIXED, value: money(50), minOrderAmount: money(499), maxDiscount: money(50), active: true, startAt: today, endAt: daysFromNow(90), usageLimit: 1000, perUserLimit: 1 },
  });

  for (const [index, [category, question, answer]] of faqSeeds.entries()) {
    const existingFaq = await prisma.fAQ.findFirst({ where: { question }, select: { id: true } });
    const faqData = { category, question, answer, displayOrder: index + 1, isActive: true };
    if (existingFaq) {
      await prisma.fAQ.update({ where: { id: existingFaq.id }, data: faqData });
    } else {
      await prisma.fAQ.create({ data: faqData });
    }
  }

  await prisma.setting.upsert({
    where: { key: "storeAddress" },
    update: { value: "GF-4, Siddharth Annexe, Sama-Savli Main Road, Vemali, New Sama, Vadodara, Gujarat - 390024", type: SettingType.STRING },
    create: { key: "storeAddress", value: "GF-4, Siddharth Annexe, Sama-Savli Main Road, Vemali, New Sama, Vadodara, Gujarat - 390024", type: SettingType.STRING },
  });
}

async function main() {
  await upsertCatalog();
  await upsertOperationalContent();

  const [categoryCount, brandCount, productCount, customerCount, orderCount] = await Promise.all([
    prisma.category.count(),
    prisma.brand.count(),
    prisma.product.count(),
    prisma.user.count(),
    prisma.order.count(),
  ]);

  console.log("Production catalog loaded.");
  console.log(`Categories: ${categoryCount}`);
  console.log(`Brands: ${brandCount}`);
  console.log(`Products: ${productCount}`);
  console.log(`Customers: ${customerCount}`);
  console.log(`Orders: ${orderCount}`);
  console.log("No demo customers, demo orders, or public credentials were created.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
