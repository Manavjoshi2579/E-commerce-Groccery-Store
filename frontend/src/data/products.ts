import type { Product } from "@/types";

const img = (q: string) => `https://source.unsplash.com/700x700/?${encodeURIComponent(q)}`;

export const products: Product[] = [
  ["amul-taaza-milk-1l", "Amul Taaza Milk 1L", "Amul", "Dairy, Bread & Eggs", "1 L", 72, 68, 5, 4.7, 842, 92, "milk bottle", ["Fresh Everyday", "Bestseller"], true],
  ["amul-butter-500g", "Amul Butter 500g", "Amul", "Dairy, Bread & Eggs", "500 g", 285, 268, 12, 4.8, 611, 36, "butter", ["Club Pick"], true],
  ["mother-dairy-paneer-200g", "Mother Dairy Paneer 200g", "Mother Dairy", "Dairy, Bread & Eggs", "200 g", 95, 88, 5, 4.5, 312, 28, "paneer", ["Fresh"], false],
  ["aashirvaad-atta-5kg", "Aashirvaad Atta 5kg", "Aashirvaad", "Atta, Rice & Dal", "5 kg", 310, 279, 5, 4.6, 702, 65, "wheat flour", ["Deal"], true],
  ["india-gate-basmati-rice-5kg", "India Gate Basmati Rice 5kg", "India Gate", "Atta, Rice & Dal", "5 kg", 899, 779, 5, 4.8, 420, 41, "basmati rice", ["Premium"], true],
  ["tata-salt-1kg", "Tata Salt 1kg", "Tata", "Masala & Oil", "1 kg", 28, 25, 5, 4.7, 1100, 120, "salt pack", ["Daily Essential"], false],
  ["fortune-sunflower-oil-1l", "Fortune Sunflower Oil 1L", "Fortune", "Masala & Oil", "1 L", 170, 148, 5, 4.4, 533, 58, "sunflower oil bottle", ["Deal"], true],
  ["tur-dal-1kg", "Premium Tur Dal 1kg", "Eagleclub Select", "Atta, Rice & Dal", "1 kg", 210, 184, 5, 4.6, 289, 18, "tur dal lentils", ["Premium"], true],
  ["red-label-tea-500g", "Red Label Tea 500g", "Brooke Bond", "Snacks & Beverages", "500 g", 320, 294, 18, 4.5, 392, 44, "tea pack", ["Bestseller"], false],
  ["maggi-noodles-pack-12", "Maggi Noodles Pack of 12", "Maggi", "Packaged Food", "840 g", 168, 150, 12, 4.7, 940, 90, "instant noodles", ["Family Pack"], false],
  ["parle-g-biscuit-pack", "Parle-G Biscuit Pack", "Parle", "Snacks & Beverages", "800 g", 115, 99, 18, 4.6, 860, 96, "biscuit pack", ["Value"], false],
  ["britannia-bread", "Britannia Bread", "Britannia", "Dairy, Bread & Eggs", "400 g", 55, 50, 5, 4.3, 244, 24, 14, "bread loaf", ["Fresh"], false],
  ["fresh-tomato-1kg", "Fresh Tomato 1kg", "Eagleclub Farms", "Fruits & Vegetables", "1 kg", 70, 52, 0, 4.4, 560, 72, "fresh tomato", ["Local", "Fresh"], true],
  ["fresh-onion-1kg", "Fresh Onion 1kg", "Eagleclub Farms", "Fruits & Vegetables", "1 kg", 58, 44, 0, 4.5, 620, 80, "red onion", ["Local"], false],
  ["fresh-potato-1kg", "Fresh Potato 1kg", "Eagleclub Farms", "Fruits & Vegetables", "1 kg", 52, 39, 0, 4.3, 710, 95, "potato", ["Local"], false],
  ["banana-1-dozen", "Banana 1 dozen", "Eagleclub Farms", "Fruits & Vegetables", "12 pcs", 95, 78, 0, 4.6, 411, 43, "banana bunch", ["Fresh"], true],
  ["apple-1kg", "Apple 1kg", "Eagleclub Select", "Fruits & Vegetables", "1 kg", 240, 199, 0, 4.7, 352, 22, "red apples", ["Premium"], true],
  ["coriander-bunch", "Coriander bunch", "Eagleclub Farms", "Fruits & Vegetables", "1 bunch", 25, 15, 0, 4.2, 180, 9, 8, "coriander", ["Local"], false],
  ["surf-excel-detergent-1kg", "Surf Excel Detergent 1kg", "Surf Excel", "Household Essentials", "1 kg", 260, 235, 18, 4.5, 288, 31, "detergent", ["Household"], false],
  ["harpic-toilet-cleaner-1l", "Harpic Toilet Cleaner 1L", "Harpic", "Household Essentials", "1 L", 210, 189, 18, 4.4, 190, 20, "toilet cleaner", ["Household"], false],
  ["dettol-handwash", "Dettol Handwash", "Dettol", "Personal Care", "750 ml", 109, 98, 18, 4.6, 376, 45, "handwash", ["Hygiene"], false],
  ["colgate-toothpaste", "Colgate Toothpaste", "Colgate", "Personal Care", "200 g", 130, 115, 18, 4.5, 432, 40, "toothpaste", ["Care"], false],
  ["himalaya-baby-shampoo", "Himalaya Baby Shampoo", "Himalaya", "Baby Care", "400 ml", 260, 229, 18, 4.4, 30, 12, "baby shampoo", ["Baby Care"], false],
].map((p, index) => {
  const raw = p as unknown[];
  const [slug, name, brand, category, unit, mrp, price, gst, rating, reviews, stock] = raw as [string, string, string, string, string, number, number, number, number, number, number];
  const hasLowStock = typeof raw[11] === "number";
  const lowStock = (hasLowStock ? raw[11] : Math.max(10, Math.round(Number(stock) * 0.12))) as number;
  const query = (hasLowStock ? raw[12] : raw[11]) as string;
  const tags = (hasLowStock ? raw[13] : raw[12]) as string[];
  const featured = (hasLowStock ? raw[14] : raw[13]) as boolean;
  return {
    id: `prd-${index + 1}`,
    slug,
    name,
    sku: `EC-${String(index + 101).padStart(4, "0")}`,
    brand,
    category,
    unit,
    mrp,
    price,
    gst,
    rating,
    reviews,
    stock,
    lowStock,
    image: img(query),
    tags,
    featured,
    organic: tags.includes("Premium") || tags.includes("Fresh"),
    local: tags.includes("Local"),
    active: true,
    description: `${name} is selected for Eagleclub Grocery & Essentials with reliable freshness, transparent pricing, and careful doorstep handling.`,
  };
});
