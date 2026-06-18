import type { Product } from "@/types";

const productFallback = "/assets/placeholders/product-placeholder-generated.png";

const productImageKeys = [
  "aashirvaad-atta-5kg", "amul-butter-500g", "amul-taaza-milk-1l", "banana-1-dozen", "britannia-bread",
  "colgate-toothpaste", "coriander-bunch", "dettol-handwash", "fortune-sunflower-oil-1l", "fresh-potato-1kg",
  "fresh-tomato-1kg", "harpic-toilet-cleaner-1l", "himalaya-baby-shampoo", "india-gate-basmati-rice-5kg",
  "maggi-noodles-pack-12", "mother-dairy-paneer-200g", "parle-g-biscuit-pack", "surf-excel-detergent-1kg",
  "tata-salt-1kg", "tur-dal-1kg", "basmati-rice", "non-basmati-rice", "toor-dal", "moong-dal", "masoor-dal",
  "chana-dal", "urad-dal", "rajma", "chole", "whole-wheat-atta", "maida", "besan", "sooji-rava",
  "mustard-oil", "groundnut-oil", "sunflower-oil", "soyabean-oil", "ghee", "turmeric-powder",
  "red-chilli-powder", "coriander-powder", "cumin-seeds", "mustard-seeds", "garam-masala",
  "kitchen-king-masala", "hing", "salt", "sugar", "milk", "curd-yogurt", "paneer", "butter", "cheese",
  "bread", "eggs", "green-tea", "black-tea", "coffee", "biscuits", "noodles", "chips", "namkeen",
  "cold-drinks", "juice", "tomato-ketchup", "soy-sauce", "vinegar", "jam", "honey", "peanut-butter",
  "breakfast-cereal", "oats", "muesli", "cornflakes", "pickle", "papad", "ready-to-eat-meals",
  "detergent-powder", "dishwash-bar", "dishwash-liquid", "floor-cleaner", "toilet-cleaner", "glass-cleaner",
  "mosquito-repellent", "phenyl", "bucket", "mop", "broom", "dustbin", "shampoo", "conditioner", "hair-oil",
  "body-wash", "soap-bar", "face-wash", "face-cream", "toothpaste", "toothbrush", "talcum-powder",
  "deodorant", "diaper", "baby-lotion", "baby-oil", "baby-powder", "baby-soap", "feeding-bottle", "sipper",
  "organic-tur-dal", "organic-besan", "organic-honey", "organic-tea", "organic-spices-kit",
];

const productImages = Object.fromEntries(productImageKeys.map((key) => [key, `/assets/products/${key}.png`]));

const imageAliases: [RegExp, string][] = [
  [/taaza|milk/i, "milk"], [/butter/i, "butter"], [/paneer/i, "paneer"], [/bread/i, "bread"], [/egg/i, "eggs"],
  [/basmati/i, "basmati-rice"], [/sona|non-basmati/i, "non-basmati-rice"], [/tur|toor|arhar/i, "toor-dal"],
  [/moong/i, "moong-dal"], [/masoor/i, "masoor-dal"], [/chana dal/i, "chana-dal"], [/urad/i, "urad-dal"],
  [/rajma/i, "rajma"], [/chole|chickpea/i, "chole"], [/atta|wheat/i, "whole-wheat-atta"], [/maida/i, "maida"],
  [/besan/i, "besan"], [/sooji|rava/i, "sooji-rava"], [/mustard oil/i, "mustard-oil"],
  [/groundnut/i, "groundnut-oil"], [/sunflower oil/i, "sunflower-oil"], [/soyabean|soybean oil/i, "soyabean-oil"],
  [/ghee/i, "ghee"], [/turmeric/i, "turmeric-powder"], [/chilli/i, "red-chilli-powder"],
  [/coriander powder/i, "coriander-powder"], [/cumin/i, "cumin-seeds"], [/mustard seeds/i, "mustard-seeds"],
  [/garam/i, "garam-masala"], [/kitchen king/i, "kitchen-king-masala"], [/hing|asafoetida/i, "hing"],
  [/salt/i, "salt"], [/sugar/i, "sugar"], [/green tea/i, "green-tea"], [/black tea|red label|tea/i, "black-tea"],
  [/coffee/i, "coffee"], [/biscuit|parle/i, "biscuits"], [/noodle|maggi/i, "noodles"], [/chip/i, "chips"],
  [/namkeen/i, "namkeen"], [/cold drink|cola/i, "cold-drinks"], [/juice/i, "juice"], [/ketchup/i, "tomato-ketchup"],
  [/soy sauce/i, "soy-sauce"], [/vinegar/i, "vinegar"], [/jam/i, "jam"], [/honey/i, "honey"],
  [/peanut butter/i, "peanut-butter"], [/cereal/i, "breakfast-cereal"], [/oats/i, "oats"], [/muesli/i, "muesli"],
  [/cornflakes/i, "cornflakes"], [/pickle/i, "pickle"], [/papad/i, "papad"], [/ready-to-eat|meal/i, "ready-to-eat-meals"],
  [/detergent|surf/i, "detergent-powder"], [/dishwash bar/i, "dishwash-bar"], [/dishwash liquid/i, "dishwash-liquid"],
  [/floor cleaner/i, "floor-cleaner"], [/toilet cleaner|harpic/i, "toilet-cleaner"], [/glass cleaner/i, "glass-cleaner"],
  [/mosquito/i, "mosquito-repellent"], [/phenyl/i, "phenyl"], [/bucket/i, "bucket"], [/mop/i, "mop"],
  [/broom/i, "broom"], [/dustbin/i, "dustbin"], [/shampoo/i, "shampoo"], [/conditioner/i, "conditioner"],
  [/hair oil/i, "hair-oil"], [/body wash/i, "body-wash"], [/soap/i, "soap-bar"], [/face wash/i, "face-wash"],
  [/face cream/i, "face-cream"], [/toothpaste|colgate/i, "toothpaste"], [/toothbrush/i, "toothbrush"],
  [/talcum/i, "talcum-powder"], [/deodorant/i, "deodorant"], [/diaper/i, "diaper"], [/baby lotion/i, "baby-lotion"],
  [/baby oil/i, "baby-oil"], [/baby powder/i, "baby-powder"], [/baby soap/i, "baby-soap"],
  [/feeding bottle/i, "feeding-bottle"], [/sipper/i, "sipper"], [/organic tur/i, "organic-tur-dal"],
  [/organic besan/i, "organic-besan"], [/organic honey/i, "organic-honey"], [/organic tea/i, "organic-tea"],
  [/spices kit/i, "organic-spices-kit"], [/tomato/i, "fresh-tomato-1kg"], [/potato/i, "fresh-potato-1kg"],
  [/banana/i, "banana-1-dozen"], [/coriander bunch|coriander$/i, "coriander-bunch"],
];

const slugify = (value: string) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const imageFor = (slug: string, name: string) => {
  if (productImages[slug]) return productImages[slug];
  const alias = imageAliases.find(([pattern]) => pattern.test(name));
  return alias ? productImages[alias[1]] || productFallback : productFallback;
};

type ProductRow = {
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  unit: string;
  mrp: number;
  price: number;
  gst: number;
  stock: number;
  lowStock?: number;
  rating: number;
  reviews: number;
  tags?: string[];
  featured?: boolean;
  organic?: boolean;
  local?: boolean;
};

const rows: ProductRow[] = [
  { name: "Amul Taaza Milk 1L", brand: "Amul", category: "Dairy, Bread & Eggs", subcategory: "Milk & Cream", unit: "1 L", mrp: 72, price: 68, gst: 5, stock: 92, rating: 4.7, reviews: 842, tags: ["Fresh Everyday", "Bestseller"], featured: true },
  { name: "Amul Butter 500g", brand: "Amul", category: "Dairy, Bread & Eggs", subcategory: "Milk & Cream", unit: "500 g", mrp: 285, price: 268, gst: 12, stock: 36, rating: 4.8, reviews: 611, tags: ["Club Pick"], featured: true },
  { name: "Mother Dairy Paneer 200g", brand: "Mother Dairy", category: "Dairy, Bread & Eggs", subcategory: "Milk & Cream", unit: "200 g", mrp: 95, price: 88, gst: 5, stock: 28, rating: 4.5, reviews: 312, tags: ["Fresh"] },
  { name: "Aashirvaad Atta 5kg", brand: "Aashirvaad", category: "Atta, Rice & Dal", subcategory: "Atta & Flour", unit: "5 kg", mrp: 310, price: 279, gst: 5, stock: 65, rating: 4.6, reviews: 702, tags: ["Deal"], featured: true },
  { name: "India Gate Basmati Rice 5kg", brand: "India Gate", category: "Atta, Rice & Dal", subcategory: "Rice", unit: "5 kg", mrp: 899, price: 779, gst: 5, stock: 41, rating: 4.8, reviews: 420, tags: ["Premium"], featured: true },
  { name: "Tata Salt 1kg", brand: "Tata", category: "Masala & Oil", subcategory: "Salt & Sugar", unit: "1 kg", mrp: 28, price: 25, gst: 5, stock: 120, rating: 4.7, reviews: 1100, tags: ["Daily Essential"] },
  { name: "Fortune Sunflower Oil 1L", brand: "Fortune", category: "Masala & Oil", subcategory: "Cooking Oils", unit: "1 L", mrp: 170, price: 148, gst: 5, stock: 58, rating: 4.4, reviews: 533, tags: ["Deal"], featured: true },
  { name: "Premium Tur Dal 1kg", brand: "Eagle Mart Select", category: "Atta, Rice & Dal", subcategory: "Dal & Lentils", unit: "1 kg", mrp: 210, price: 184, gst: 5, stock: 18, lowStock: 10, rating: 4.6, reviews: 289, tags: ["Premium"], featured: true },
  { name: "Red Label Tea 500g", brand: "Brooke Bond", category: "Snacks & Beverages", subcategory: "Beverages", unit: "500 g", mrp: 320, price: 294, gst: 18, stock: 44, rating: 4.5, reviews: 392, tags: ["Bestseller"] },
  { name: "Maggi Noodles Pack of 12", brand: "Maggi", category: "Snacks & Beverages", subcategory: "Snacks & Farsans", unit: "840 g", mrp: 168, price: 150, gst: 12, stock: 90, rating: 4.7, reviews: 940, tags: ["Family Pack"] },
  { name: "Parle-G Biscuit Pack", brand: "Parle", category: "Snacks & Beverages", subcategory: "Snacks & Farsans", unit: "800 g", mrp: 115, price: 99, gst: 18, stock: 96, rating: 4.6, reviews: 860, tags: ["Value"] },
  { name: "Britannia Bread", brand: "Britannia", category: "Dairy, Bread & Eggs", subcategory: "Bread & Bakery", unit: "400 g", mrp: 55, price: 50, gst: 5, stock: 24, lowStock: 14, rating: 4.3, reviews: 244, tags: ["Fresh"] },
  { name: "Fresh Tomato 1kg", brand: "Eagle Mart Farms", category: "Fruits & Vegetables", subcategory: "Fresh Vegetables", unit: "1 kg", mrp: 70, price: 52, gst: 0, stock: 72, rating: 4.4, reviews: 560, tags: ["Local", "Fresh"], featured: true, local: true },
  { name: "Fresh Onion 1kg", brand: "Eagle Mart Farms", category: "Fruits & Vegetables", subcategory: "Fresh Vegetables", unit: "1 kg", mrp: 58, price: 44, gst: 0, stock: 80, rating: 4.5, reviews: 620, tags: ["Local"], local: true },
  { name: "Fresh Potato 1kg", brand: "Eagle Mart Farms", category: "Fruits & Vegetables", subcategory: "Fresh Vegetables", unit: "1 kg", mrp: 52, price: 39, gst: 0, stock: 95, rating: 4.3, reviews: 710, tags: ["Local"], local: true },
  { name: "Banana 1 dozen", brand: "Eagle Mart Farms", category: "Fruits & Vegetables", subcategory: "Fresh Fruits", unit: "12 pcs", mrp: 95, price: 78, gst: 0, stock: 43, rating: 4.6, reviews: 411, tags: ["Fresh"], featured: true, local: true },
  { name: "Apple 1kg", brand: "Eagle Mart Select", category: "Fruits & Vegetables", subcategory: "Fresh Fruits", unit: "1 kg", mrp: 240, price: 199, gst: 0, stock: 22, rating: 4.7, reviews: 352, tags: ["Premium"], featured: true },
  { name: "Coriander bunch", brand: "Eagle Mart Farms", category: "Fruits & Vegetables", subcategory: "Herbs", unit: "1 bunch", mrp: 25, price: 15, gst: 0, stock: 9, lowStock: 8, rating: 4.2, reviews: 180, tags: ["Local"], local: true },
  { name: "Surf Excel Detergent 1kg", brand: "Surf Excel", category: "Household Essentials", subcategory: "Laundry", unit: "1 kg", mrp: 260, price: 235, gst: 18, stock: 31, rating: 4.5, reviews: 288, tags: ["Household"] },
  { name: "Harpic Toilet Cleaner 1L", brand: "Harpic", category: "Household Essentials", subcategory: "Surface Cleaners", unit: "1 L", mrp: 210, price: 189, gst: 18, stock: 20, rating: 4.4, reviews: 190, tags: ["Household"] },
  { name: "Dettol Handwash", brand: "Dettol", category: "Personal Care", subcategory: "Bath & Shower", unit: "750 ml", mrp: 109, price: 98, gst: 18, stock: 45, rating: 4.6, reviews: 376, tags: ["Hygiene"] },
  { name: "Colgate Toothpaste", brand: "Colgate", category: "Personal Care", subcategory: "Oral Care", unit: "200 g", mrp: 130, price: 115, gst: 18, stock: 40, rating: 4.5, reviews: 432, tags: ["Care"] },
  { name: "Himalaya Baby Shampoo", brand: "Himalaya", category: "Baby Care", subcategory: "Baby Skin & Bath", unit: "400 ml", mrp: 260, price: 229, gst: 18, stock: 12, rating: 4.4, reviews: 30, tags: ["Baby Care"] },
  { name: "Daawat Basmati Rice 1kg", brand: "Daawat", category: "Atta, Rice & Dal", subcategory: "Rice", unit: "1 kg", mrp: 210, price: 189, gst: 5, stock: 72, rating: 4.5, reviews: 288, tags: ["Premium"] },
  { name: "Eagle Mart Sona Masuri Rice 5kg", brand: "Eagle Mart Staples", category: "Atta, Rice & Dal", subcategory: "Rice", unit: "5 kg", mrp: 420, price: 379, gst: 5, stock: 61, rating: 4.4, reviews: 201, tags: ["Staple"] },
  { name: "Tata Toor Dal 1kg", brand: "Tata", category: "Atta, Rice & Dal", subcategory: "Dal & Lentils", unit: "1 kg", mrp: 220, price: 198, gst: 5, stock: 48, rating: 4.5, reviews: 245, tags: ["Staple"] },
  { name: "Rajdhani Moong Dal 1kg", brand: "Rajdhani", category: "Atta, Rice & Dal", subcategory: "Dal & Lentils", unit: "1 kg", mrp: 190, price: 169, gst: 5, stock: 52, rating: 4.4, reviews: 190, tags: ["Protein Rich"] },
  { name: "Eagle Mart Masoor Dal 1kg", brand: "Eagle Mart Staples", category: "Atta, Rice & Dal", subcategory: "Dal & Lentils", unit: "1 kg", mrp: 155, price: 138, gst: 5, stock: 58, rating: 4.3, reviews: 166, tags: ["Staple"] },
  { name: "Rajdhani Chana Dal 1kg", brand: "Rajdhani", category: "Atta, Rice & Dal", subcategory: "Dal & Lentils", unit: "1 kg", mrp: 145, price: 128, gst: 5, stock: 36, rating: 4.4, reviews: 149, tags: ["Staple"] },
  { name: "Eagle Mart Urad Dal 1kg", brand: "Eagle Mart Staples", category: "Atta, Rice & Dal", subcategory: "Dal & Lentils", unit: "1 kg", mrp: 185, price: 164, gst: 5, stock: 34, rating: 4.3, reviews: 132, tags: ["Staple"] },
  { name: "Rajdhani Rajma 1kg", brand: "Rajdhani", category: "Atta, Rice & Dal", subcategory: "Dal & Lentils", unit: "1 kg", mrp: 230, price: 205, gst: 5, stock: 29, rating: 4.5, reviews: 207, tags: ["North Indian"] },
  { name: "Eagle Mart Chole 1kg", brand: "Eagle Mart Staples", category: "Atta, Rice & Dal", subcategory: "Dal & Lentils", unit: "1 kg", mrp: 190, price: 169, gst: 5, stock: 33, rating: 4.4, reviews: 176, tags: ["Staple"] },
  { name: "Pillsbury Maida 1kg", brand: "Pillsbury", category: "Atta, Rice & Dal", subcategory: "Atta & Flour", unit: "1 kg", mrp: 72, price: 63, gst: 5, stock: 45, rating: 4.2, reviews: 98, tags: ["Bakery"] },
  { name: "Rajdhani Besan 1kg", brand: "Rajdhani", category: "Atta, Rice & Dal", subcategory: "Atta & Flour", unit: "1 kg", mrp: 145, price: 129, gst: 5, stock: 42, rating: 4.4, reviews: 188, tags: ["Fresh Flour"] },
  { name: "Eagle Mart Sooji Rava 500g", brand: "Eagle Mart Staples", category: "Atta, Rice & Dal", subcategory: "Atta & Flour", unit: "500 g", mrp: 55, price: 48, gst: 5, stock: 56, rating: 4.3, reviews: 119, tags: ["Breakfast"] },
  { name: "Fortune Mustard Oil 1L", brand: "Fortune", category: "Masala & Oil", subcategory: "Cooking Oils", unit: "1 L", mrp: 185, price: 165, gst: 5, stock: 46, rating: 4.4, reviews: 233, tags: ["Cooking Oil"] },
  { name: "Saffola Groundnut Oil 1L", brand: "Saffola", category: "Masala & Oil", subcategory: "Cooking Oils", unit: "1 L", mrp: 220, price: 199, gst: 5, stock: 35, rating: 4.5, reviews: 162, tags: ["Cooking Oil"] },
  { name: "Fortune Soyabean Oil 1L", brand: "Fortune", category: "Masala & Oil", subcategory: "Cooking Oils", unit: "1 L", mrp: 155, price: 139, gst: 5, stock: 39, rating: 4.3, reviews: 144, tags: ["Cooking Oil"] },
  { name: "Amul Pure Ghee 500ml", brand: "Amul", category: "Masala & Oil", subcategory: "Cooking Oils", unit: "500 ml", mrp: 340, price: 318, gst: 12, stock: 25, rating: 4.8, reviews: 436, tags: ["Premium"], featured: true },
  { name: "Everest Turmeric Powder 200g", brand: "Everest", category: "Masala & Oil", subcategory: "Spices", unit: "200 g", mrp: 92, price: 82, gst: 5, stock: 70, rating: 4.5, reviews: 290, tags: ["Spice"] },
  { name: "MDH Red Chilli Powder 200g", brand: "MDH", category: "Masala & Oil", subcategory: "Spices", unit: "200 g", mrp: 110, price: 98, gst: 5, stock: 62, rating: 4.4, reviews: 224, tags: ["Spice"] },
  { name: "Everest Coriander Powder 200g", brand: "Everest", category: "Masala & Oil", subcategory: "Spices", unit: "200 g", mrp: 88, price: 78, gst: 5, stock: 68, rating: 4.3, reviews: 181, tags: ["Spice"] },
  { name: "Eagle Mart Cumin Seeds 100g", brand: "Eagle Mart Select", category: "Masala & Oil", subcategory: "Spices", unit: "100 g", mrp: 95, price: 82, gst: 5, stock: 40, rating: 4.3, reviews: 112, tags: ["Whole Spice"] },
  { name: "Eagle Mart Mustard Seeds 100g", brand: "Eagle Mart Select", category: "Masala & Oil", subcategory: "Spices", unit: "100 g", mrp: 48, price: 39, gst: 5, stock: 55, rating: 4.2, reviews: 90, tags: ["Whole Spice"] },
  { name: "MDH Garam Masala 100g", brand: "MDH", category: "Masala & Oil", subcategory: "Spices", unit: "100 g", mrp: 98, price: 88, gst: 5, stock: 49, rating: 4.5, reviews: 255, tags: ["Spice"] },
  { name: "Everest Kitchen King Masala 100g", brand: "Everest", category: "Masala & Oil", subcategory: "Spices", unit: "100 g", mrp: 92, price: 82, gst: 5, stock: 51, rating: 4.5, reviews: 238, tags: ["Spice"] },
  { name: "Eagle Mart Hing 50g", brand: "Eagle Mart Select", category: "Masala & Oil", subcategory: "Spices", unit: "50 g", mrp: 120, price: 105, gst: 12, stock: 22, rating: 4.2, reviews: 75, tags: ["Spice"] },
  { name: "Madhur Sugar 1kg", brand: "Madhur", category: "Masala & Oil", subcategory: "Salt & Sugar", unit: "1 kg", mrp: 62, price: 55, gst: 5, stock: 90, rating: 4.4, reviews: 210, tags: ["Daily Essential"] },
  { name: "Mother Dairy Curd 400g", brand: "Mother Dairy", category: "Dairy, Bread & Eggs", subcategory: "Milk & Cream", unit: "400 g", mrp: 50, price: 45, gst: 5, stock: 42, rating: 4.4, reviews: 155, tags: ["Fresh"] },
  { name: "Britannia Cheese Slices 200g", brand: "Britannia", category: "Dairy, Bread & Eggs", subcategory: "Milk & Cream", unit: "200 g", mrp: 165, price: 148, gst: 12, stock: 21, rating: 4.5, reviews: 198, tags: ["Dairy"] },
  { name: "Modern Brown Bread 400g", brand: "Modern", category: "Dairy, Bread & Eggs", subcategory: "Bread & Bakery", unit: "400 g", mrp: 60, price: 54, gst: 5, stock: 33, rating: 4.2, reviews: 104, tags: ["Fresh"] },
  { name: "Eagle Mart Eggs 12 pcs", brand: "Eagle Mart Dairy", category: "Dairy, Bread & Eggs", subcategory: "Eggs", unit: "12 pcs", mrp: 120, price: 105, gst: 0, stock: 27, rating: 4.5, reviews: 134, tags: ["Protein"] },
  { name: "Lipton Green Tea 100g", brand: "Lipton", category: "Snacks & Beverages", subcategory: "Beverages", unit: "100 g", mrp: 210, price: 188, gst: 18, stock: 37, rating: 4.4, reviews: 189, tags: ["Tea"] },
  { name: "Tetley Black Tea 250g", brand: "Tetley", category: "Snacks & Beverages", subcategory: "Beverages", unit: "250 g", mrp: 240, price: 215, gst: 18, stock: 32, rating: 4.4, reviews: 156, tags: ["Tea"] },
  { name: "Nescafe Classic Coffee 100g", brand: "Nescafe", category: "Snacks & Beverages", subcategory: "Beverages", unit: "100 g", mrp: 330, price: 299, gst: 18, stock: 44, rating: 4.7, reviews: 392, tags: ["Coffee"], featured: true },
  { name: "Haldiram Namkeen 400g", brand: "Haldiram", category: "Snacks & Beverages", subcategory: "Snacks & Farsans", unit: "400 g", mrp: 120, price: 105, gst: 12, stock: 58, rating: 4.5, reviews: 260, tags: ["Snack"] },
  { name: "Eagle Mart Potato Chips 150g", brand: "Eagle Mart Select", category: "Snacks & Beverages", subcategory: "Snacks & Farsans", unit: "150 g", mrp: 70, price: 62, gst: 12, stock: 66, rating: 4.2, reviews: 141, tags: ["Snack"] },
  { name: "Real Mixed Fruit Juice 1L", brand: "Real", category: "Snacks & Beverages", subcategory: "Beverages", unit: "1 L", mrp: 130, price: 116, gst: 12, stock: 48, rating: 4.4, reviews: 175, tags: ["Beverage"] },
  { name: "Eagle Mart Cola 2L", brand: "Eagle Mart Select", category: "Snacks & Beverages", subcategory: "Beverages", unit: "2 L", mrp: 110, price: 99, gst: 28, stock: 38, rating: 4.1, reviews: 81, tags: ["Beverage"] },
  { name: "Kissan Tomato Ketchup 500g", brand: "Kissan", category: "Packaged Food", subcategory: "Sauces & Spreads", unit: "500 g", mrp: 160, price: 142, gst: 12, stock: 44, rating: 4.5, reviews: 230, tags: ["Sauce"] },
  { name: "Eagle Mart Soy Sauce 200ml", brand: "Eagle Mart Select", category: "Packaged Food", subcategory: "Sauces & Spreads", unit: "200 ml", mrp: 75, price: 65, gst: 12, stock: 31, rating: 4.1, reviews: 61, tags: ["Sauce"] },
  { name: "Eagle Mart Vinegar 500ml", brand: "Eagle Mart Select", category: "Packaged Food", subcategory: "Sauces & Spreads", unit: "500 ml", mrp: 60, price: 52, gst: 12, stock: 34, rating: 4.1, reviews: 58, tags: ["Sauce"] },
  { name: "Kissan Mixed Fruit Jam 500g", brand: "Kissan", category: "Packaged Food", subcategory: "Sauces & Spreads", unit: "500 g", mrp: 195, price: 175, gst: 12, stock: 29, rating: 4.4, reviews: 142, tags: ["Spread"] },
  { name: "Dabur Honey 500g", brand: "Dabur", category: "Packaged Food", subcategory: "Sauces & Spreads", unit: "500 g", mrp: 260, price: 232, gst: 12, stock: 26, rating: 4.6, reviews: 315, tags: ["Natural"] },
  { name: "Eagle Mart Peanut Butter 400g", brand: "Eagle Mart Select", category: "Packaged Food", subcategory: "Sauces & Spreads", unit: "400 g", mrp: 230, price: 205, gst: 12, stock: 21, rating: 4.3, reviews: 104, tags: ["Protein"] },
  { name: "Kellogg's Cornflakes 500g", brand: "Kellogg's", category: "Packaged Food", subcategory: "Breakfast Cereals", unit: "500 g", mrp: 240, price: 215, gst: 18, stock: 36, rating: 4.5, reviews: 196, tags: ["Breakfast"] },
  { name: "Quaker Oats 1kg", brand: "Quaker", category: "Packaged Food", subcategory: "Breakfast Cereals", unit: "1 kg", mrp: 220, price: 198, gst: 18, stock: 42, rating: 4.6, reviews: 243, tags: ["Healthy"] },
  { name: "Eagle Mart Muesli 500g", brand: "Eagle Mart Select", category: "Packaged Food", subcategory: "Breakfast Cereals", unit: "500 g", mrp: 330, price: 295, gst: 18, stock: 18, rating: 4.3, reviews: 82, tags: ["Breakfast"] },
  { name: "Eagle Mart Mango Pickle 400g", brand: "Eagle Mart Select", category: "Packaged Food", subcategory: "Pickles & Papad", unit: "400 g", mrp: 150, price: 132, gst: 12, stock: 28, rating: 4.4, reviews: 122, tags: ["Indian"] },
  { name: "Eagle Mart Papad 200g", brand: "Eagle Mart Select", category: "Packaged Food", subcategory: "Pickles & Papad", unit: "200 g", mrp: 85, price: 74, gst: 12, stock: 40, rating: 4.2, reviews: 76, tags: ["Indian"] },
  { name: "MTR Ready-to-Eat Paneer Meal 300g", brand: "MTR", category: "Packaged Food", subcategory: "Ready to Eat", unit: "300 g", mrp: 160, price: 142, gst: 12, stock: 25, rating: 4.2, reviews: 98, tags: ["Quick Meal"] },
  { name: "Knorr Soup 50g", brand: "Knorr", category: "Packaged Food", subcategory: "Ready to Eat", unit: "50 g", mrp: 65, price: 58, gst: 12, stock: 53, rating: 4.1, reviews: 88, tags: ["Quick Meal"] },
  { name: "Ariel Detergent Powder 1kg", brand: "Ariel", category: "Household Essentials", subcategory: "Laundry", unit: "1 kg", mrp: 265, price: 238, gst: 18, stock: 34, rating: 4.5, reviews: 220, tags: ["Laundry"] },
  { name: "Vim Dishwash Bar 200g", brand: "Vim", category: "Household Essentials", subcategory: "Dishwash", unit: "200 g", mrp: 35, price: 30, gst: 18, stock: 84, rating: 4.4, reviews: 180, tags: ["Dishwash"] },
  { name: "Vim Dishwash Liquid 500ml", brand: "Vim", category: "Household Essentials", subcategory: "Dishwash", unit: "500 ml", mrp: 125, price: 110, gst: 18, stock: 46, rating: 4.4, reviews: 196, tags: ["Dishwash"] },
  { name: "Lizol Floor Cleaner 1L", brand: "Lizol", category: "Household Essentials", subcategory: "Surface Cleaners", unit: "1 L", mrp: 230, price: 205, gst: 18, stock: 29, rating: 4.5, reviews: 210, tags: ["Cleaner"] },
  { name: "Colin Glass Cleaner 500ml", brand: "Colin", category: "Household Essentials", subcategory: "Surface Cleaners", unit: "500 ml", mrp: 115, price: 99, gst: 18, stock: 25, rating: 4.3, reviews: 94, tags: ["Cleaner"] },
  { name: "Good Knight Mosquito Repellent", brand: "Good Knight", category: "Household Essentials", subcategory: "Pest Control", unit: "1 pc", mrp: 105, price: 92, gst: 18, stock: 33, rating: 4.4, reviews: 176, tags: ["Pest Control"] },
  { name: "Eagle Mart Phenyl 1L", brand: "Eagle Mart Home", category: "Household Essentials", subcategory: "Surface Cleaners", unit: "1 L", mrp: 90, price: 78, gst: 18, stock: 30, rating: 4.1, reviews: 71, tags: ["Cleaner"] },
  { name: "Eagle Mart Bucket 15L", brand: "Eagle Mart Home", category: "Household Essentials", subcategory: "Utility Items", unit: "1 pc", mrp: 220, price: 190, gst: 18, stock: 16, rating: 4.2, reviews: 60, tags: ["Utility"] },
  { name: "Eagle Mart Floor Mop", brand: "Eagle Mart Home", category: "Household Essentials", subcategory: "Utility Items", unit: "1 pc", mrp: 350, price: 315, gst: 18, stock: 14, rating: 4.2, reviews: 84, tags: ["Utility"] },
  { name: "Eagle Mart Broom", brand: "Eagle Mart Home", category: "Household Essentials", subcategory: "Utility Items", unit: "1 pc", mrp: 140, price: 125, gst: 18, stock: 24, rating: 4.1, reviews: 52, tags: ["Utility"] },
  { name: "Eagle Mart Dustbin 10L", brand: "Eagle Mart Home", category: "Household Essentials", subcategory: "Utility Items", unit: "1 pc", mrp: 390, price: 345, gst: 18, stock: 12, rating: 4.2, reviews: 44, tags: ["Utility"] },
  { name: "Dove Shampoo 340ml", brand: "Dove", category: "Personal Care", subcategory: "Hair Care", unit: "340 ml", mrp: 360, price: 325, gst: 18, stock: 32, rating: 4.5, reviews: 230, tags: ["Hair Care"] },
  { name: "Sunsilk Conditioner 180ml", brand: "Sunsilk", category: "Personal Care", subcategory: "Hair Care", unit: "180 ml", mrp: 210, price: 188, gst: 18, stock: 28, rating: 4.3, reviews: 124, tags: ["Hair Care"] },
  { name: "Parachute Hair Oil 250ml", brand: "Parachute", category: "Personal Care", subcategory: "Hair Care", unit: "250 ml", mrp: 130, price: 115, gst: 18, stock: 44, rating: 4.5, reviews: 210, tags: ["Hair Care"] },
  { name: "Dove Body Wash 250ml", brand: "Dove", category: "Personal Care", subcategory: "Bath & Shower", unit: "250 ml", mrp: 280, price: 248, gst: 18, stock: 27, rating: 4.4, reviews: 158, tags: ["Bath"] },
  { name: "Nivea Soap Bar 100g", brand: "Nivea", category: "Personal Care", subcategory: "Bath & Shower", unit: "100 g", mrp: 65, price: 58, gst: 18, stock: 60, rating: 4.3, reviews: 138, tags: ["Bath"] },
  { name: "Himalaya Face Wash 100ml", brand: "Himalaya", category: "Personal Care", subcategory: "Face Care", unit: "100 ml", mrp: 170, price: 152, gst: 18, stock: 36, rating: 4.4, reviews: 192, tags: ["Face Care"] },
  { name: "Nivea Face Cream 100ml", brand: "Nivea", category: "Personal Care", subcategory: "Face Care", unit: "100 ml", mrp: 250, price: 225, gst: 18, stock: 24, rating: 4.4, reviews: 166, tags: ["Face Care"] },
  { name: "Oral-B Toothbrush 1 pc", brand: "Oral-B", category: "Personal Care", subcategory: "Oral Care", unit: "1 pc", mrp: 80, price: 70, gst: 18, stock: 52, rating: 4.3, reviews: 112, tags: ["Oral Care"] },
  { name: "Eagle Mart Talcum Powder 100g", brand: "Eagle Mart Care", category: "Personal Care", subcategory: "Bath & Shower", unit: "100 g", mrp: 95, price: 82, gst: 18, stock: 30, rating: 4.1, reviews: 54, tags: ["Care"] },
  { name: "Nivea Deodorant 150ml", brand: "Nivea", category: "Personal Care", subcategory: "Bath & Shower", unit: "150 ml", mrp: 230, price: 205, gst: 18, stock: 26, rating: 4.3, reviews: 115, tags: ["Care"] },
  { name: "Pampers Diaper Pants 32 pcs", brand: "Pampers", category: "Baby Care", subcategory: "Diapering", unit: "32 pcs", mrp: 699, price: 625, gst: 12, stock: 18, rating: 4.7, reviews: 244, tags: ["Baby Care"], featured: true },
  { name: "Huggies Diaper Pants 64 pcs", brand: "Huggies", category: "Baby Care", subcategory: "Diapering", unit: "64 pcs", mrp: 1199, price: 1069, gst: 12, stock: 11, lowStock: 8, rating: 4.6, reviews: 210, tags: ["Baby Care"] },
  { name: "Johnson's Baby Lotion 200ml", brand: "Johnson's Baby", category: "Baby Care", subcategory: "Baby Skin & Bath", unit: "200 ml", mrp: 230, price: 205, gst: 18, stock: 22, rating: 4.5, reviews: 154, tags: ["Baby Care"] },
  { name: "Johnson's Baby Oil 200ml", brand: "Johnson's Baby", category: "Baby Care", subcategory: "Baby Skin & Bath", unit: "200 ml", mrp: 210, price: 188, gst: 18, stock: 20, rating: 4.5, reviews: 132, tags: ["Baby Care"] },
  { name: "Himalaya Baby Powder 200g", brand: "Himalaya", category: "Baby Care", subcategory: "Baby Skin & Bath", unit: "200 g", mrp: 190, price: 169, gst: 18, stock: 18, rating: 4.4, reviews: 96, tags: ["Baby Care"] },
  { name: "Himalaya Baby Soap 75g", brand: "Himalaya", category: "Baby Care", subcategory: "Baby Skin & Bath", unit: "75 g", mrp: 70, price: 62, gst: 18, stock: 35, rating: 4.3, reviews: 82, tags: ["Baby Care"] },
  { name: "Mee Mee Feeding Bottle 250ml", brand: "Mee Mee", category: "Baby Care", subcategory: "Feeding", unit: "250 ml", mrp: 260, price: 232, gst: 18, stock: 16, rating: 4.2, reviews: 62, tags: ["Feeding"] },
  { name: "Mee Mee Sipper 300ml", brand: "Mee Mee", category: "Baby Care", subcategory: "Feeding", unit: "300 ml", mrp: 240, price: 215, gst: 18, stock: 15, rating: 4.2, reviews: 58, tags: ["Feeding"] },
  { name: "24 Mantra Organic Tur Dal 1kg", brand: "24 Mantra", category: "Organic Store", subcategory: "Dal & Lentils", unit: "1 kg", mrp: 260, price: 232, gst: 5, stock: 21, rating: 4.6, reviews: 143, tags: ["Organic"], organic: true, featured: true },
  { name: "24 Mantra Organic Besan 500g", brand: "24 Mantra", category: "Organic Store", subcategory: "Atta & Flour", unit: "500 g", mrp: 125, price: 112, gst: 5, stock: 24, rating: 4.5, reviews: 91, tags: ["Organic"], organic: true },
  { name: "Organic India Honey 500g", brand: "Organic India", category: "Organic Store", subcategory: "Sauces & Spreads", unit: "500 g", mrp: 340, price: 305, gst: 12, stock: 18, rating: 4.6, reviews: 166, tags: ["Organic"], organic: true },
  { name: "Organic India Tea 100g", brand: "Organic India", category: "Organic Store", subcategory: "Beverages", unit: "100 g", mrp: 220, price: 198, gst: 18, stock: 22, rating: 4.5, reviews: 112, tags: ["Organic"], organic: true },
  { name: "Eagle Mart Organic Spices Kit", brand: "Eagle Mart Organic", category: "Organic Store", subcategory: "Spices", unit: "5 pcs", mrp: 450, price: 399, gst: 5, stock: 13, rating: 4.4, reviews: 75, tags: ["Organic", "Premium"], organic: true },
  { name: "Fresh Capsicum 500g", brand: "Eagle Mart Fresh", category: "Fruits & Vegetables", subcategory: "Fresh Vegetables", unit: "500 g", mrp: 70, price: 58, gst: 0, stock: 55, rating: 4.3, reviews: 132, tags: ["Fresh", "Local"], local: true },
  { name: "Fresh Carrot 500g", brand: "Eagle Mart Fresh", category: "Fruits & Vegetables", subcategory: "Fresh Vegetables", unit: "500 g", mrp: 55, price: 44, gst: 0, stock: 60, rating: 4.4, reviews: 140, tags: ["Fresh", "Local"], local: true },
  { name: "Fresh Cucumber 500g", brand: "Eagle Mart Fresh", category: "Fruits & Vegetables", subcategory: "Fresh Vegetables", unit: "500 g", mrp: 50, price: 39, gst: 0, stock: 58, rating: 4.3, reviews: 121, tags: ["Fresh", "Local"], local: true },
  { name: "Lemon 250g", brand: "Eagle Mart Fresh", category: "Fruits & Vegetables", subcategory: "Fresh Vegetables", unit: "250 g", mrp: 45, price: 35, gst: 0, stock: 44, rating: 4.2, reviews: 94, tags: ["Fresh", "Local"], local: true },
  { name: "Green Chilli 250g", brand: "Eagle Mart Fresh", category: "Fruits & Vegetables", subcategory: "Herbs", unit: "250 g", mrp: 38, price: 29, gst: 0, stock: 30, rating: 4.2, reviews: 75, tags: ["Fresh", "Local"], local: true },
  { name: "Spinach 1 bunch", brand: "Eagle Mart Fresh", category: "Fruits & Vegetables", subcategory: "Leafy Greens", unit: "1 bunch", mrp: 35, price: 25, gst: 0, stock: 26, rating: 4.3, reviews: 88, tags: ["Fresh", "Local"], local: true },
  { name: "Cauliflower 1 pc", brand: "Eagle Mart Fresh", category: "Fruits & Vegetables", subcategory: "Fresh Vegetables", unit: "1 pc", mrp: 70, price: 58, gst: 0, stock: 22, rating: 4.3, reviews: 96, tags: ["Fresh", "Local"], local: true },
  { name: "Cabbage 1 pc", brand: "Eagle Mart Fresh", category: "Fruits & Vegetables", subcategory: "Fresh Vegetables", unit: "1 pc", mrp: 55, price: 44, gst: 0, stock: 24, rating: 4.2, reviews: 84, tags: ["Fresh", "Local"], local: true },
];

export const products: Product[] = rows.map((row, index) => {
  const slug = slugify(row.name);
  const tags = [...new Set([row.subcategory, ...(row.tags || [])])];
  const lowStock = row.lowStock ?? Math.max(8, Math.round(row.stock * 0.16));
  return {
    id: `prd-${index + 1}`,
    slug,
    name: row.name,
    sku: `EC-${String(index + 101).padStart(4, "0")}`,
    brand: row.brand,
    category: row.category,
    unit: row.unit,
    mrp: row.mrp,
    price: row.price,
    gst: row.gst,
    rating: row.rating,
    reviews: row.reviews,
    stock: row.stock,
    lowStock,
    image: imageFor(slug, row.name),
    tags,
    featured: row.featured ?? index % 9 === 0,
    organic: row.organic ?? (tags.includes("Organic") || tags.includes("Premium") || tags.includes("Fresh")),
    local: row.local ?? tags.includes("Local"),
    active: true,
    description: `${row.name} from ${row.brand} is selected for Eagle Mart Grocery & Essentials with reliable freshness, transparent pricing, and careful doorstep handling. ${row.subcategory} range item with safe storage and easy returns as per policy.`,
  };
});
