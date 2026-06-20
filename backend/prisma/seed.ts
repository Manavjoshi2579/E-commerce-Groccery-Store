import "../lib/load-env.js";
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
import { gujaratPincodePrefixes } from "../lib/gujarat-pincodes.js";
import { invoiceNumber, orderNumber, slugify } from "../lib/ids.js";

const prisma = new PrismaClient();

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run demo seed in production. Use `npm run db:prod-bootstrap` to create roles and one real SUPER_ADMIN.");
  process.exit(1);
}

const productFallback = "/assets/placeholders/product-placeholder-generated.png";
const categoryImagePath = (name: string) => `/assets/categories/${slugify(name)}.png`;
const productImages: Record<string, string> = {
  "aashirvaad-atta-5kg": "/assets/products/aashirvaad-atta-5kg.png",
  "amul-butter-500g": "/assets/products/amul-butter-500g.png",
  "amul-taaza-milk-1l": "/assets/products/amul-taaza-milk-1l.png",
  "banana-1-dozen": "/assets/products/banana-1-dozen.png",
  "britannia-bread": "/assets/products/britannia-bread.png",
  "colgate-toothpaste": "/assets/products/colgate-toothpaste.png",
  "coriander-bunch": "/assets/products/coriander-bunch.png",
  "dettol-handwash": "/assets/products/dettol-handwash.png",
  "fortune-sunflower-oil-1l": "/assets/products/fortune-sunflower-oil-1l.png",
  "fresh-potato-1kg": "/assets/products/fresh-potato-1kg.png",
  "fresh-tomato-1kg": "/assets/products/fresh-tomato-1kg.png",
  "harpic-toilet-cleaner-1l": "/assets/products/harpic-toilet-cleaner-1l.png",
  "himalaya-baby-shampoo": "/assets/products/himalaya-baby-shampoo.png",
  "india-gate-basmati-rice-5kg": "/assets/products/india-gate-basmati-rice-5kg.png",
  "maggi-noodles-pack-of-12": "/assets/products/maggi-noodles-pack-12.png",
  "maggi-noodles-pack-12": "/assets/products/maggi-noodles-pack-12.png",
  "mother-dairy-paneer-200g": "/assets/products/mother-dairy-paneer-200g.png",
  "parle-g-biscuit-pack": "/assets/products/parle-g-biscuit-pack.png",
  "surf-excel-detergent-1kg": "/assets/products/surf-excel-detergent-1kg.png",
  "tata-salt-1kg": "/assets/products/tata-salt-1kg.png",
  "tur-dal-1kg": "/assets/products/tur-dal-1kg.png",
};
const productImagePath = (name: string) => productImages[slugify(name)] ?? productFallback;
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
  imageSlug?: string;
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
  { name: "Tur Dal 1kg", category: "Atta, Rice & Dal", brand: "Eagle Mart Select", unit: "1 kg", mrp: 210, price: 184, gst: 5, stock: 18, lowStockThreshold: 10, rating: 4.6, reviewCount: 289, imageQuery: "tur dal lentils", tags: ["Premium"], featured: true },
  { name: "Red Label Tea 500g", category: "Snacks & Beverages", brand: "Brooke Bond", unit: "500 g", mrp: 320, price: 294, gst: 18, stock: 44, lowStockThreshold: 12, rating: 4.5, reviewCount: 392, imageQuery: "tea pack", tags: ["Bestseller"] },
  { name: "Maggi Noodles Pack of 12", category: "Packaged Food", brand: "Maggi", unit: "840 g", mrp: 168, price: 150, gst: 12, stock: 90, lowStockThreshold: 20, rating: 4.7, reviewCount: 940, imageQuery: "instant noodles", tags: ["Family Pack"] },
  { name: "Parle-G Biscuit Pack", category: "Snacks & Beverages", brand: "Parle", unit: "800 g", mrp: 115, price: 99, gst: 18, stock: 96, lowStockThreshold: 20, rating: 4.6, reviewCount: 860, imageQuery: "biscuit pack", tags: ["Value"] },
  { name: "Britannia Bread", category: "Dairy, Bread & Eggs", brand: "Britannia", unit: "400 g", mrp: 55, price: 50, gst: 5, stock: 24, lowStockThreshold: 14, rating: 4.3, reviewCount: 244, imageQuery: "bread loaf", tags: ["Fresh"] },
  { name: "Fresh Tomato 1kg", category: "Fruits & Vegetables", brand: "Eagle Mart Farms", unit: "1 kg", mrp: 70, price: 52, gst: 0, stock: 72, lowStockThreshold: 18, rating: 4.4, reviewCount: 560, imageQuery: "fresh tomato", tags: ["Local", "Fresh"], featured: true, local: true },
  { name: "Fresh Onion 1kg", category: "Fruits & Vegetables", brand: "Eagle Mart Farms", unit: "1 kg", mrp: 58, price: 44, gst: 0, stock: 80, lowStockThreshold: 18, rating: 4.5, reviewCount: 620, imageQuery: "red onion", tags: ["Local"], local: true },
  { name: "Fresh Potato 1kg", category: "Fruits & Vegetables", brand: "Eagle Mart Farms", unit: "1 kg", mrp: 52, price: 39, gst: 0, stock: 95, lowStockThreshold: 18, rating: 4.3, reviewCount: 710, imageQuery: "potato", tags: ["Local"], local: true },
  { name: "Banana 1 dozen", category: "Fruits & Vegetables", brand: "Eagle Mart Farms", unit: "12 pcs", mrp: 95, price: 78, gst: 0, stock: 43, lowStockThreshold: 12, rating: 4.6, reviewCount: 411, imageQuery: "banana bunch", tags: ["Fresh"], featured: true, local: true },
  { name: "Apple 1kg", category: "Fruits & Vegetables", brand: "Eagle Mart Select", unit: "1 kg", mrp: 240, price: 199, gst: 0, stock: 22, lowStockThreshold: 10, rating: 4.7, reviewCount: 352, imageQuery: "red apples", tags: ["Premium"], featured: true },
  { name: "Coriander bunch", category: "Fruits & Vegetables", brand: "Eagle Mart Farms", unit: "1 bunch", mrp: 25, price: 15, gst: 0, stock: 9, lowStockThreshold: 8, rating: 4.2, reviewCount: 180, imageQuery: "coriander", tags: ["Local"], local: true },
  { name: "Surf Excel Detergent 1kg", category: "Household Essentials", brand: "Surf Excel", unit: "1 kg", mrp: 260, price: 235, gst: 18, stock: 31, lowStockThreshold: 10, rating: 4.5, reviewCount: 288, imageQuery: "detergent", tags: ["Household"] },
  { name: "Harpic Toilet Cleaner 1L", category: "Household Essentials", brand: "Harpic", unit: "1 L", mrp: 210, price: 189, gst: 18, stock: 20, lowStockThreshold: 10, rating: 4.4, reviewCount: 190, imageQuery: "toilet cleaner", tags: ["Household"] },
  { name: "Dettol Handwash", category: "Personal Care", brand: "Dettol", unit: "750 ml", mrp: 109, price: 98, gst: 18, stock: 45, lowStockThreshold: 12, rating: 4.6, reviewCount: 376, imageQuery: "handwash", tags: ["Hygiene"] },
  { name: "Colgate Toothpaste", category: "Personal Care", brand: "Colgate", unit: "200 g", mrp: 130, price: 115, gst: 18, stock: 40, lowStockThreshold: 12, rating: 4.5, reviewCount: 432, imageQuery: "toothpaste", tags: ["Care"] },
  { name: "Himalaya Baby Shampoo", category: "Baby Care", brand: "Himalaya", unit: "400 ml", mrp: 260, price: 229, gst: 18, stock: 12, lowStockThreshold: 10, rating: 4.4, reviewCount: 30, imageQuery: "baby shampoo", tags: ["Baby Care"] },
];

const productExpansion = [
  ["Daawat Basmati Rice 1kg", "Atta, Rice & Dal", "Daawat", "1 kg", 210, 189, 5, 72, "basmati-rice", "Rice", ["Premium"]],
  ["Eagle Mart Sona Masuri Rice 5kg", "Atta, Rice & Dal", "Eagle Mart Staples", "5 kg", 420, 379, 5, 61, "non-basmati-rice", "Rice", ["Staple"]],
  ["Tata Toor Dal 1kg", "Atta, Rice & Dal", "Tata", "1 kg", 220, 198, 5, 48, "toor-dal", "Dal & Lentils", ["Staple"]],
  ["Rajdhani Moong Dal 1kg", "Atta, Rice & Dal", "Rajdhani", "1 kg", 190, 169, 5, 52, "moong-dal", "Dal & Lentils", ["Protein Rich"]],
  ["Eagle Mart Masoor Dal 1kg", "Atta, Rice & Dal", "Eagle Mart Staples", "1 kg", 155, 138, 5, 58, "masoor-dal", "Dal & Lentils", ["Staple"]],
  ["Rajdhani Chana Dal 1kg", "Atta, Rice & Dal", "Rajdhani", "1 kg", 145, 128, 5, 36, "chana-dal", "Dal & Lentils", ["Staple"]],
  ["Eagle Mart Urad Dal 1kg", "Atta, Rice & Dal", "Eagle Mart Staples", "1 kg", 185, 164, 5, 34, "urad-dal", "Dal & Lentils", ["Staple"]],
  ["Rajdhani Rajma 1kg", "Atta, Rice & Dal", "Rajdhani", "1 kg", 230, 205, 5, 29, "rajma", "Dal & Lentils", ["North Indian"]],
  ["Eagle Mart Chole 1kg", "Atta, Rice & Dal", "Eagle Mart Staples", "1 kg", 190, 169, 5, 33, "chole", "Dal & Lentils", ["Staple"]],
  ["Pillsbury Maida 1kg", "Atta, Rice & Dal", "Pillsbury", "1 kg", 72, 63, 5, 45, "maida", "Atta & Flour", ["Bakery"]],
  ["Rajdhani Besan 1kg", "Atta, Rice & Dal", "Rajdhani", "1 kg", 145, 129, 5, 42, "besan", "Atta & Flour", ["Fresh Flour"]],
  ["Eagle Mart Sooji Rava 500g", "Atta, Rice & Dal", "Eagle Mart Staples", "500 g", 55, 48, 5, 56, "sooji-rava", "Atta & Flour", ["Breakfast"]],
  ["Fortune Mustard Oil 1L", "Masala & Oil", "Fortune", "1 L", 185, 165, 5, 46, "mustard-oil", "Cooking Oils", ["Cooking Oil"]],
  ["Saffola Groundnut Oil 1L", "Masala & Oil", "Saffola", "1 L", 220, 199, 5, 35, "groundnut-oil", "Cooking Oils", ["Cooking Oil"]],
  ["Fortune Soyabean Oil 1L", "Masala & Oil", "Fortune", "1 L", 155, 139, 5, 39, "soyabean-oil", "Cooking Oils", ["Cooking Oil"]],
  ["Amul Pure Ghee 500ml", "Masala & Oil", "Amul", "500 ml", 340, 318, 12, 25, "ghee", "Cooking Oils", ["Premium"]],
  ["Everest Turmeric Powder 200g", "Masala & Oil", "Everest", "200 g", 92, 82, 5, 70, "turmeric-powder", "Spices", ["Spice"]],
  ["MDH Red Chilli Powder 200g", "Masala & Oil", "MDH", "200 g", 110, 98, 5, 62, "red-chilli-powder", "Spices", ["Spice"]],
  ["Everest Coriander Powder 200g", "Masala & Oil", "Everest", "200 g", 88, 78, 5, 68, "coriander-powder", "Spices", ["Spice"]],
  ["Eagle Mart Cumin Seeds 100g", "Masala & Oil", "Eagle Mart Select", "100 g", 95, 82, 5, 40, "cumin-seeds", "Spices", ["Whole Spice"]],
  ["Eagle Mart Mustard Seeds 100g", "Masala & Oil", "Eagle Mart Select", "100 g", 48, 39, 5, 55, "mustard-seeds", "Spices", ["Whole Spice"]],
  ["MDH Garam Masala 100g", "Masala & Oil", "MDH", "100 g", 98, 88, 5, 49, "garam-masala", "Spices", ["Spice"]],
  ["Everest Kitchen King Masala 100g", "Masala & Oil", "Everest", "100 g", 92, 82, 5, 51, "kitchen-king-masala", "Spices", ["Spice"]],
  ["Eagle Mart Hing 50g", "Masala & Oil", "Eagle Mart Select", "50 g", 120, 105, 12, 22, "hing", "Spices", ["Spice"]],
  ["Madhur Sugar 1kg", "Masala & Oil", "Madhur", "1 kg", 62, 55, 5, 90, "sugar", "Salt & Sugar", ["Daily Essential"]],
  ["Mother Dairy Curd 400g", "Dairy, Bread & Eggs", "Mother Dairy", "400 g", 50, 45, 5, 42, "curd-yogurt", "Milk & Cream", ["Fresh"]],
  ["Britannia Cheese Slices 200g", "Dairy, Bread & Eggs", "Britannia", "200 g", 165, 148, 12, 21, "cheese", "Milk & Cream", ["Dairy"]],
  ["Modern Brown Bread 400g", "Dairy, Bread & Eggs", "Modern", "400 g", 60, 54, 5, 33, "bread", "Bread & Bakery", ["Fresh"]],
  ["Eagle Mart Eggs 12 pcs", "Dairy, Bread & Eggs", "Eagle Mart Dairy", "12 pcs", 120, 105, 0, 27, "eggs", "Eggs", ["Protein"]],
  ["Lipton Green Tea 100g", "Snacks & Beverages", "Lipton", "100 g", 210, 188, 18, 37, "green-tea", "Beverages", ["Tea"]],
  ["Tetley Black Tea 250g", "Snacks & Beverages", "Tetley", "250 g", 240, 215, 18, 32, "black-tea", "Beverages", ["Tea"]],
  ["Nescafe Classic Coffee 100g", "Snacks & Beverages", "Nescafe", "100 g", 330, 299, 18, 44, "coffee", "Beverages", ["Coffee"]],
  ["Haldiram Namkeen 400g", "Snacks & Beverages", "Haldiram", "400 g", 120, 105, 12, 58, "namkeen", "Snacks & Farsans", ["Snack"]],
  ["Eagle Mart Potato Chips 150g", "Snacks & Beverages", "Eagle Mart Select", "150 g", 70, 62, 12, 66, "chips", "Snacks & Farsans", ["Snack"]],
  ["Real Mixed Fruit Juice 1L", "Snacks & Beverages", "Real", "1 L", 130, 116, 12, 48, "juice", "Beverages", ["Beverage"]],
  ["Eagle Mart Cola 2L", "Snacks & Beverages", "Eagle Mart Select", "2 L", 110, 99, 28, 38, "cold-drinks", "Beverages", ["Beverage"]],
  ["Kissan Tomato Ketchup 500g", "Packaged Food", "Kissan", "500 g", 160, 142, 12, 44, "tomato-ketchup", "Sauces & Spreads", ["Sauce"]],
  ["Eagle Mart Soy Sauce 200ml", "Packaged Food", "Eagle Mart Select", "200 ml", 75, 65, 12, 31, "soy-sauce", "Sauces & Spreads", ["Sauce"]],
  ["Eagle Mart Vinegar 500ml", "Packaged Food", "Eagle Mart Select", "500 ml", 60, 52, 12, 34, "vinegar", "Sauces & Spreads", ["Sauce"]],
  ["Kissan Mixed Fruit Jam 500g", "Packaged Food", "Kissan", "500 g", 195, 175, 12, 29, "jam", "Sauces & Spreads", ["Spread"]],
  ["Dabur Honey 500g", "Packaged Food", "Dabur", "500 g", 260, 232, 12, 26, "honey", "Sauces & Spreads", ["Natural"]],
  ["Eagle Mart Peanut Butter 400g", "Packaged Food", "Eagle Mart Select", "400 g", 230, 205, 12, 21, "peanut-butter", "Sauces & Spreads", ["Protein"]],
  ["Kellogg's Cornflakes 500g", "Packaged Food", "Kellogg's", "500 g", 240, 215, 18, 36, "cornflakes", "Breakfast Cereals", ["Breakfast"]],
  ["Quaker Oats 1kg", "Packaged Food", "Quaker", "1 kg", 220, 198, 18, 42, "oats", "Breakfast Cereals", ["Healthy"]],
  ["Eagle Mart Muesli 500g", "Packaged Food", "Eagle Mart Select", "500 g", 330, 295, 18, 18, "muesli", "Breakfast Cereals", ["Breakfast"]],
  ["Eagle Mart Mango Pickle 400g", "Packaged Food", "Eagle Mart Select", "400 g", 150, 132, 12, 28, "pickle", "Pickles & Papad", ["Indian"]],
  ["Eagle Mart Papad 200g", "Packaged Food", "Eagle Mart Select", "200 g", 85, 74, 12, 40, "papad", "Pickles & Papad", ["Indian"]],
  ["MTR Ready-to-Eat Paneer Meal 300g", "Packaged Food", "MTR", "300 g", 160, 142, 12, 25, "ready-to-eat-meals", "Ready to Eat", ["Quick Meal"]],
  ["Knorr Soup 50g", "Packaged Food", "Knorr", "50 g", 65, 58, 12, 53, "ready-to-eat-meals", "Ready to Eat", ["Quick Meal"]],
  ["Ariel Detergent Powder 1kg", "Household Essentials", "Ariel", "1 kg", 265, 238, 18, 34, "detergent-powder", "Laundry", ["Laundry"]],
  ["Vim Dishwash Bar 200g", "Household Essentials", "Vim", "200 g", 35, 30, 18, 84, "dishwash-bar", "Dishwash", ["Dishwash"]],
  ["Vim Dishwash Liquid 500ml", "Household Essentials", "Vim", "500 ml", 125, 110, 18, 46, "dishwash-liquid", "Dishwash", ["Dishwash"]],
  ["Lizol Floor Cleaner 1L", "Household Essentials", "Lizol", "1 L", 230, 205, 18, 29, "floor-cleaner", "Surface Cleaners", ["Cleaner"]],
  ["Colin Glass Cleaner 500ml", "Household Essentials", "Colin", "500 ml", 115, 99, 18, 25, "glass-cleaner", "Surface Cleaners", ["Cleaner"]],
  ["Good Knight Mosquito Repellent", "Household Essentials", "Good Knight", "1 pc", 105, 92, 18, 33, "mosquito-repellent", "Pest Control", ["Pest Control"]],
  ["Eagle Mart Phenyl 1L", "Household Essentials", "Eagle Mart Home", "1 L", 90, 78, 18, 30, "phenyl", "Surface Cleaners", ["Cleaner"]],
  ["Eagle Mart Bucket 15L", "Household Essentials", "Eagle Mart Home", "1 pc", 220, 190, 18, 16, "bucket", "Utility Items", ["Utility"]],
  ["Eagle Mart Floor Mop", "Household Essentials", "Eagle Mart Home", "1 pc", 350, 315, 18, 14, "mop", "Utility Items", ["Utility"]],
  ["Eagle Mart Broom", "Household Essentials", "Eagle Mart Home", "1 pc", 140, 125, 18, 24, "broom", "Utility Items", ["Utility"]],
  ["Eagle Mart Dustbin 10L", "Household Essentials", "Eagle Mart Home", "1 pc", 390, 345, 18, 12, "dustbin", "Utility Items", ["Utility"]],
  ["Dove Shampoo 340ml", "Personal Care", "Dove", "340 ml", 360, 325, 18, 32, "shampoo", "Hair Care", ["Hair Care"]],
  ["Sunsilk Conditioner 180ml", "Personal Care", "Sunsilk", "180 ml", 210, 188, 18, 28, "conditioner", "Hair Care", ["Hair Care"]],
  ["Parachute Hair Oil 250ml", "Personal Care", "Parachute", "250 ml", 130, 115, 18, 44, "hair-oil", "Hair Care", ["Hair Care"]],
  ["Dove Body Wash 250ml", "Personal Care", "Dove", "250 ml", 280, 248, 18, 27, "body-wash", "Bath & Shower", ["Bath"]],
  ["Nivea Soap Bar 100g", "Personal Care", "Nivea", "100 g", 65, 58, 18, 60, "soap-bar", "Bath & Shower", ["Bath"]],
  ["Himalaya Face Wash 100ml", "Personal Care", "Himalaya", "100 ml", 170, 152, 18, 36, "face-wash", "Face Care", ["Face Care"]],
  ["Nivea Face Cream 100ml", "Personal Care", "Nivea", "100 ml", 250, 225, 18, 24, "face-cream", "Face Care", ["Face Care"]],
  ["Oral-B Toothbrush 1 pc", "Personal Care", "Oral-B", "1 pc", 80, 70, 18, 52, "toothbrush", "Oral Care", ["Oral Care"]],
  ["Eagle Mart Talcum Powder 100g", "Personal Care", "Eagle Mart Care", "100 g", 95, 82, 18, 30, "talcum-powder", "Bath & Shower", ["Care"]],
  ["Nivea Deodorant 150ml", "Personal Care", "Nivea", "150 ml", 230, 205, 18, 26, "deodorant", "Bath & Shower", ["Care"]],
  ["Pampers Diaper Pants 32 pcs", "Baby Care", "Pampers", "32 pcs", 699, 625, 12, 18, "diaper", "Diapering", ["Baby Care"]],
  ["Huggies Diaper Pants 64 pcs", "Baby Care", "Huggies", "64 pcs", 1199, 1069, 12, 11, "diaper", "Diapering", ["Baby Care"]],
  ["Johnson's Baby Lotion 200ml", "Baby Care", "Johnson's Baby", "200 ml", 230, 205, 18, 22, "baby-lotion", "Baby Skin & Bath", ["Baby Care"]],
  ["Johnson's Baby Oil 200ml", "Baby Care", "Johnson's Baby", "200 ml", 210, 188, 18, 20, "baby-oil", "Baby Skin & Bath", ["Baby Care"]],
  ["Himalaya Baby Powder 200g", "Baby Care", "Himalaya", "200 g", 190, 169, 18, 18, "baby-powder", "Baby Skin & Bath", ["Baby Care"]],
  ["Himalaya Baby Soap 75g", "Baby Care", "Himalaya", "75 g", 70, 62, 18, 35, "baby-soap", "Baby Skin & Bath", ["Baby Care"]],
  ["Mee Mee Feeding Bottle 250ml", "Baby Care", "Mee Mee", "250 ml", 260, 232, 18, 16, "feeding-bottle", "Feeding", ["Feeding"]],
  ["Mee Mee Sipper 300ml", "Baby Care", "Mee Mee", "300 ml", 240, 215, 18, 15, "sipper", "Feeding", ["Feeding"]],
  ["24 Mantra Organic Tur Dal 1kg", "Organic Store", "24 Mantra", "1 kg", 260, 232, 5, 21, "organic-tur-dal", "Dal & Lentils", ["Organic"]],
  ["24 Mantra Organic Besan 500g", "Organic Store", "24 Mantra", "500 g", 125, 112, 5, 24, "organic-besan", "Atta & Flour", ["Organic"]],
  ["Organic India Honey 500g", "Organic Store", "Organic India", "500 g", 340, 305, 12, 18, "organic-honey", "Sauces & Spreads", ["Organic"]],
  ["Organic India Tea 100g", "Organic Store", "Organic India", "100 g", 220, 198, 18, 22, "organic-tea", "Beverages", ["Organic"]],
  ["Eagle Mart Organic Spices Kit", "Organic Store", "Eagle Mart Organic", "5 pcs", 450, 399, 5, 13, "organic-spices-kit", "Spices", ["Organic", "Premium"]],
  ["Fresh Capsicum 500g", "Fruits & Vegetables", "Eagle Mart Fresh", "500 g", 70, 58, 0, 55, "fresh-tomato-1kg", "Fresh Vegetables", ["Fresh", "Local"]],
  ["Fresh Carrot 500g", "Fruits & Vegetables", "Eagle Mart Fresh", "500 g", 55, 44, 0, 60, "fresh-potato-1kg", "Fresh Vegetables", ["Fresh", "Local"]],
  ["Fresh Cucumber 500g", "Fruits & Vegetables", "Eagle Mart Fresh", "500 g", 50, 39, 0, 58, "coriander-bunch", "Fresh Vegetables", ["Fresh", "Local"]],
  ["Lemon 250g", "Fruits & Vegetables", "Eagle Mart Fresh", "250 g", 45, 35, 0, 44, "banana-1-dozen", "Fresh Vegetables", ["Fresh", "Local"]],
  ["Green Chilli 250g", "Fruits & Vegetables", "Eagle Mart Fresh", "250 g", 38, 29, 0, 30, "coriander-bunch", "Herbs", ["Fresh", "Local"]],
  ["Spinach 1 bunch", "Fruits & Vegetables", "Eagle Mart Fresh", "1 bunch", 35, 25, 0, 26, "coriander-bunch", "Leafy Greens", ["Fresh", "Local"]],
  ["Cauliflower 1 pc", "Fruits & Vegetables", "Eagle Mart Fresh", "1 pc", 70, 58, 0, 22, "fresh-tomato-1kg", "Fresh Vegetables", ["Fresh", "Local"]],
  ["Cabbage 1 pc", "Fruits & Vegetables", "Eagle Mart Fresh", "1 pc", 55, 44, 0, 24, "fresh-potato-1kg", "Fresh Vegetables", ["Fresh", "Local"]],
] as const;

products.push(...productExpansion.map(([name, category, brand, unit, mrp, price, gst, stock, imageSlug, subcategory, tags], index) => {
  const productTags = [...tags, subcategory] as string[];
  return {
    name,
    category,
    brand,
    unit,
    mrp,
    price,
    gst,
    stock,
    lowStockThreshold: Math.max(8, Math.round(stock * 0.16)),
    rating: Number((4.1 + (index % 8) * 0.08).toFixed(1)),
    reviewCount: 60 + index * 9,
    imageQuery: name,
    imageSlug,
    tags: productTags,
    featured: index % 9 === 0,
    organic: category === "Organic Store" || productTags.includes("Organic"),
    local: category === "Fruits & Vegetables" || productTags.includes("Local"),
  };
}));

const faqSeeds = [
  ["Orders", "How can I place an order?", "Browse products, add items to cart, proceed to checkout, select delivery address and payment method, then place your order."],
  ["Orders", "Can I cancel my order?", "Orders may be cancelled before dispatch from the Orders section."],
  ["Orders", "How can I track my order?", "Visit My Orders and select the order to view live tracking updates."],
  ["Payments", "Which payment methods are accepted?", "UPI, Credit Card, Debit Card, Net Banking, Wallets, and Cash on Delivery where available."],
  ["Payments", "Is online payment secure?", "Yes. Eagle Mart uses secure payment gateways and encrypted transactions."],
  ["Payments", "Why did my payment fail?", "Payment failures may occur due to bank issues, network interruptions, or insufficient balance."],
  ["Delivery", "How long does delivery take?", "Delivery time depends on location, slot availability, and product stock."],
  ["Delivery", "Can I choose a delivery slot?", "Yes, available delivery slots are shown during checkout."],
  ["Delivery", "Do you deliver to my area?", "Use the pincode checker to verify service availability."],
  ["Returns & Refunds", "What is your return policy?", "Eligible items may be returned according to the Return Policy."],
  ["Returns & Refunds", "When will I receive my refund?", "Refunds are generally processed within a few business days after approval."],
  ["Returns & Refunds", "Can I return opened products?", "Certain categories may not be eligible for return once opened."],
  ["Account", "How do I create an account?", "Use the Sign Up page and verify your details."],
  ["Account", "I forgot my password. What should I do?", "Use the Forgot Password option on the login page."],
  ["Account", "How can I update my profile?", "Visit Account Settings and edit your profile details."],
  ["Products", "Are products fresh and authentic?", "Eagle Mart sources products from trusted suppliers and quality partners."],
  ["Products", "Why is a product unavailable?", "Products may become unavailable due to stock limitations."],
  ["Products", "How do I know product expiry information?", "Relevant expiry and product details are shown on product pages where applicable."],
  ["Coupons & Offers", "How do I apply a coupon?", "Enter the coupon code in cart or checkout before placing the order."],
  ["Coupons & Offers", "Can multiple coupons be combined?", "Only one coupon may be applied per order unless otherwise specified."],
  ["Coupons & Offers", "Why is my coupon not working?", "Coupons may have expiry dates, usage limits, or minimum order requirements."],
  ["Invoices & GST", "Can I download my invoice?", "Yes. Invoices are available in My Orders after order completion."],
  ["Invoices & GST", "Is GST included in product pricing?", "Product pricing and applicable taxes are displayed during checkout."],
  ["Invoices & GST", "Can I get a GST invoice?", "Eligible orders can generate GST-compliant invoices."],
  ["Membership & Rewards", "Does Eagle Mart offer loyalty rewards?", "Rewards and membership programs may be offered through promotions."],
  ["Membership & Rewards", "How can I earn rewards?", "Eligible purchases and campaigns may provide reward benefits."],
  ["General", "What is Eagle Mart?", "Eagle Mart is a premium grocery and essentials delivery platform."],
  ["General", "How can I contact support?", "Visit the Contact Us page or Support section in your account."],
  ["General", "Is there a minimum order value?", "Minimum order values may vary by location and delivery policies."],
] as const;

async function resetData() {
  await prisma.fAQ.deleteMany();
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

  const passwordHash = await bcrypt.hash("Eagle" + "club@12345", 12);
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
    ["Eagle Mart Super Admin", "superadmin@eagleclub.in", RoleName.SUPER_ADMIN],
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
    ["Gujarat", gujaratPincodePrefixes, 49, 799],
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
        image: categoryImagePath(name),
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
        description: `${item.name} is selected for Eagle Mart Grocery & Essentials with reliable freshness, transparent pricing, and careful doorstep handling.`,
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
        url: item.imageSlug ? `/assets/products/${item.imageSlug}.png` : productImagePath(item.name),
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
      { key: "storeName", value: "Eagle Mart Grocery & Essentials", type: SettingType.STRING, updatedByAdminId: admins[0].id },
      { key: "supportEmail", value: "support@eaglemart.in", type: SettingType.STRING, updatedByAdminId: admins[0].id },
      { key: "defaultCity", value: "Ahmedabad", type: SettingType.STRING, updatedByAdminId: admins[0].id },
      { key: "gstNumber", value: "24ABCDE1234F1Z5", type: SettingType.STRING, updatedByAdminId: admins[0].id },
    ],
  });

  await prisma.fAQ.createMany({
    data: faqSeeds.map(([category, question, answer], index) => ({
      category,
      question,
      answer,
      displayOrder: index + 1,
      isActive: true,
    })),
  });

  console.log("Eagle Mart seed completed.");
  console.log("Admin credentials:");
  for (const [, email] of adminSeeds) console.log(`- ${email} / configured admin password`);
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
