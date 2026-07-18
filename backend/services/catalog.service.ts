import { ImageStatus, Prisma, ProductStatus, SettingType } from "@prisma/client";
import * as XLSX from "xlsx";
import { db } from "../lib/db.js";
import type { productListQuerySchema } from "../validators/catalog.js";
import type { z } from "zod";

type ProductQuery = z.infer<typeof productListQuerySchema>;

const productInclude = {
  category: true,
  brand: true,
  images: { orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }] },
  variants: { orderBy: { createdAt: "asc" as const } },
  inventory: true,
  reviews: {
    where: { status: "APPROVED" as const },
    orderBy: { createdAt: "desc" as const },
    take: 8,
    include: { user: { select: { name: true } } },
  },
};

type ProductWithCatalog = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

const productImageFallback = "/assets/placeholders/product-placeholder-generated.png";
const categoryImageFallback = "/assets/placeholders/category-placeholder.svg";

const homepageCategoryGroups = [
  { key: "fruits-vegetables", title: "Fruits & Vegetables", imageUrl: "/assets/categories/fruits-vegetables.png", aliases: ["fruits", "vegetables", "fresh produce", "fruit", "vegetable"] },
  { key: "dairy-bread-eggs", title: "Dairy, Bread & Eggs", imageUrl: "/assets/categories/dairy-bread-eggs.png", aliases: ["dairy", "bread", "bakery", "eggs", "egg"] },
  { key: "atta-rice-dal", title: "Atta, Rice & Dal", imageUrl: "/assets/categories/atta-rice-dal.png", aliases: ["atta", "flour", "rice", "pulses", "dal", "grains", "food items"] },
  { key: "masala-oil", title: "Masala & Oil", imageUrl: "/assets/categories/masala-oil.png", aliases: ["spices", "masala", "cooking oil", "oil", "ghee", "food items"] },
  { key: "snacks-beverages", title: "Snacks & Beverages", imageUrl: "/assets/categories/snacks-beverages.png", aliases: ["snacks", "biscuits", "namkeen", "beverages", "juice", "cold drinks", "tea", "coffee", "chocolates", "confectionery", "food items"] },
  { key: "packaged-food", title: "Packaged Food", imageUrl: "/assets/categories/packaged-food.png", aliases: ["food items", "packaged food", "instant food", "noodles", "sauces", "breakfast", "confectionery"] },
  { key: "household-essentials", title: "Household Essentials", imageUrl: "/assets/categories/household-essentials.png", aliases: ["home care", "cleaning supplies", "detergents", "disposable items", "disposables", "household", "electrical appliances"] },
  { key: "personal-care", title: "Personal Care", imageUrl: "/assets/categories/personal-care.png", aliases: ["personal care", "skin care", "haircare", "hair care", "baby care", "oral care", "bath body", "body care"] },
] as const;

function categoryGroupFor(value?: string) {
  const normalized = normalizeSearch(value || "");
  if (!normalized) return null;
  return homepageCategoryGroups.find((group) => group.key === slugify(value || "") || normalizeSearch(group.title) === normalized || group.aliases.some((alias) => normalized === normalizeSearch(alias)));
}

function categoryGroupWhere(value: string): Prisma.CategoryWhereInput {
  const group = categoryGroupFor(value);
  if (!group) return { OR: [{ slug: value }, { name: value }] };
  return {
    OR: [
      { slug: group.key },
      { name: group.title },
      ...group.aliases.flatMap((alias) => [{ slug: slugify(alias) }, { name: { contains: alias } }]),
    ],
  };
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function decimal(value: Prisma.Decimal | number | null | undefined) {
  if (value == null) return 0;
  return Number(value);
}

function tags(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

const relatedSearchTerms: Record<string, string[]> = {
  atta: ["flour", "wheat", "aashirvaad"],
  banana: ["bananna", "bannana", "fruit", "fruits"],
  bread: ["bakery", "toast"],
  butter: ["dairy", "amul"],
  dal: ["lentil", "lentils", "tur"],
  detergent: ["laundry", "surf"],
  milk: ["dairy", "amul"],
  oil: ["sunflower", "fortune"],
  paneer: ["dairy"],
  rice: ["basmati", "grain"],
  salt: ["tata"],
  shampoo: ["baby", "himalaya"],
  tomato: ["vegetable", "vegetables"],
};

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function searchDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const next = row[j];
      row[j] = a[i - 1] === b[j - 1] ? previous : Math.min(previous, row[j - 1], row[j]) + 1;
      previous = next;
    }
  }
  return row[b.length];
}

function searchTerms(value: string) {
  const parts = normalizeSearch(value).split(" ").filter((part) => part.length > 1);
  const terms = new Set(parts);
  parts.forEach((part) => {
    Object.entries(relatedSearchTerms).forEach(([term, aliases]) => {
      if (term === part || aliases.includes(part) || searchDistance(term, part) <= 2) {
        terms.add(term);
        aliases.forEach((alias) => terms.add(alias));
      }
    });
  });
  return Array.from(terms);
}

function normalizePack(value: string) {
  const normalized = normalizeSearch(value)
    .replace(/\b(\d+)\s*(g|gm|gram|grams)\b/g, "$1 g")
    .replace(/\b(\d+)\s*(kg|kilogram|kilograms)\b/g, "$1 kg")
    .replace(/\b(\d+)\s*(ml|millilitre|milliliter)\b/g, "$1 ml")
    .replace(/\b(\d+)\s*(l|ltr|litre|liter)\b/g, "$1 l")
    .replace(/\b0\.5\s*kg\b/g, "500 g")
    .replace(/\b0\.5\s*l\b/g, "500 ml");
  return normalized.replace(/\s+/g, " ").trim();
}

function mainVariant(product: ProductWithCatalog) {
  return product.variants.find((variant) => variant.status === ProductStatus.ACTIVE) ?? product.variants[0];
}

function primaryImageStatus(product: ProductWithCatalog) {
  const primary = product.images.find((image) => image.isPrimary) || product.images[0];
  if (!primary?.url || primary.url === productImageFallback) return "Placeholder";
  if (product.imageStatus === ImageStatus.VERIFIED) {
    if (primary.url.startsWith("/assets/") || primary.url.startsWith("/uploads/")) return "Existing";
    return "URL Imported";
  }
  if (product.imageStatus === ImageStatus.NEEDS_REVIEW) return "Needs Review";
  return "Placeholder";
}

function variantInventory(product: ProductWithCatalog, variantId: string) {
  const inventory = product.inventory.find((item) => item.variantId === variantId);
  const fallbackRows = product.inventory.filter((item) => item.variantId == null);
  const fallbackStock = fallbackRows.length ? fallbackRows.reduce((sum, item) => sum + item.stock, 0) : product.inventory.reduce((sum, item) => sum + item.stock, 0);
  const fallbackLowStock = fallbackRows[0]?.lowStockThreshold ?? product.inventory[0]?.lowStockThreshold ?? 10;
  return {
    stock: inventory?.stock ?? fallbackStock,
    lowStockThreshold: inventory?.lowStockThreshold ?? fallbackLowStock,
  };
}

function stockSummary(product: ProductWithCatalog) {
  const stock = product.inventory.reduce((sum, item) => sum + item.stock, 0);
  const lowStock = product.inventory[0]?.lowStockThreshold ?? 10;
  const stockStatus = stock <= 0 ? "out_of_stock" : stock <= lowStock ? "low_stock" : "in_stock";
  return { stock, lowStock, stockStatus };
}

export function mapCategory(category: { id: string; slug: string; name: string; image: string | null; status: ProductStatus; sortOrder?: number }) {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    image: category.image || categoryImageFallback,
    status: category.status,
    active: category.status === ProductStatus.ACTIVE,
    sortOrder: category.sortOrder ?? 0,
  };
}

export function mapBrand(brand: { id: string; slug: string; name: string; logo: string | null; status: ProductStatus }) {
  return {
    id: brand.id,
    slug: brand.slug,
    name: brand.name,
    logo: brand.logo || categoryImageFallback,
    status: brand.status,
    active: brand.status === ProductStatus.ACTIVE,
  };
}

export function mapProduct(product: ProductWithCatalog) {
  const variant = mainVariant(product);
  const mrp = decimal(variant?.mrp);
  const price = decimal(variant?.price);
  const image = product.images[0]?.url || productImageFallback;
  const stock = stockSummary(product);
  const discountPercentage = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    sku: product.sku,
    productCode: product.clientProductCode,
    clientProductCode: product.clientProductCode,
    brand: product.brand.name,
    brandId: product.brandId,
    brandSlug: product.brand.slug,
    category: product.category.name,
    categoryId: product.categoryId,
    categorySlug: product.category.slug,
    unit: variant?.unit ?? "",
    mrp,
    price,
    sellingPrice: price,
    discountPercentage,
    gst: decimal(product.gst),
    taxPercentage: decimal(product.gst),
    rating: decimal(product.ratingAvg),
    ratingAvg: decimal(product.ratingAvg),
    reviews: product.reviewCount,
    reviewCount: product.reviewCount,
    stock: stock.stock,
    inStock: stock.stock > 0,
    lowStock: stock.lowStock,
    stockStatus: stock.stockStatus,
    imageStatus: primaryImageStatus(product),
    imageSource: product.imageSource,
    image,
    primaryImageUrl: image,
    images: product.images.map((item) => ({ id: item.id, url: item.url || productImageFallback, alt: item.alt ?? product.name, isPrimary: item.isPrimary })),
    categoryInfo: { id: product.categoryId, name: product.category.name, slug: product.category.slug },
    tags: tags(product.tags),
    featured: product.featured,
    isFeatured: product.featured,
    organic: product.organic,
    isOrganic: product.organic,
    local: product.local,
    isLocal: product.local,
    active: product.status === ProductStatus.ACTIVE,
    status: product.status,
    description: product.description,
    variants: product.variants.map((item, index) => {
      const inventory = variantInventory(product, item.id);
      return {
        id: item.id,
        sku: item.sku,
        label: item.label,
        unit: item.unit,
        mrp: decimal(item.mrp),
        price: decimal(item.price),
        sellingPrice: decimal(item.price),
        status: item.status,
        active: item.status === ProductStatus.ACTIVE,
        isDefault: item.id === variant?.id || index === 0,
        stock: inventory.stock,
        lowStock: inventory.lowStockThreshold,
        lowStockThreshold: inventory.lowStockThreshold,
      };
    }),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function mapAdminProduct(product: ProductWithCatalog) {
  const mapped = mapProduct(product);
  return {
    ...mapped,
    clientProductCode: product.clientProductCode,
    sourceCategory: product.sourceCategory,
    variants: mapped.variants.map((variant, index) => ({
      ...variant,
      costPrice: decimal(product.variants[index]?.costPrice),
      sourceUnit: product.variants[index]?.sourceUnit,
    })),
  };
}

function buildProductWhere(query: ProductQuery, admin = false): Prisma.ProductWhereInput {
  const search = query.q || query.search;
  const where: Prisma.ProductWhereInput = admin ? { deletedAt: null } : { deletedAt: null, status: ProductStatus.ACTIVE };

  if (search) {
    const terms = searchTerms(search);
    where.OR = [
      ...terms.map((term) => ({ name: { contains: term } })),
      ...terms.map((term) => ({ sku: { contains: term } })),
      ...(admin ? terms.map((term) => ({ clientProductCode: { contains: term } })) : []),
      ...terms.map((term) => ({ description: { contains: term } })),
      ...terms.map((term) => ({ brand: { name: { contains: term } } })),
      ...terms.map((term) => ({ category: { name: { contains: term } } })),
    ] satisfies Prisma.ProductWhereInput[];
  }
  if (query.category) where.category = categoryGroupWhere(query.category);
  if (query.brand) where.brand = { OR: [{ slug: query.brand }, { name: query.brand }] };
  if (query.minPrice != null || query.maxPrice != null) {
    where.variants = { some: { price: { gte: query.minPrice, lte: query.maxPrice } } };
  }
  if (query.rating != null) where.ratingAvg = { gte: query.rating };
  if (query.organic != null) where.organic = query.organic;
  if (query.local != null) where.local = query.local;
  if (admin && query.imageStatus) where.imageStatus = query.imageStatus;
  if (query.availability === "in_stock") where.inventory = { some: { stock: { gt: 0 } } };
  if (query.availability === "out_of_stock") where.inventory = { every: { stock: { lte: 0 } } };
  if (query.availability === "low_stock") {
    where.inventory = { some: { stock: { gt: 0, lte: 10 } } };
  }

  return where;
}

function productOrderBy(sort: ProductQuery["sort"]): Prisma.ProductOrderByWithRelationInput[] {
  if (sort === "newest") return [{ createdAt: "desc" }];
  if (sort === "price_asc") return [{ variants: { _count: "asc" } }, { name: "asc" }];
  if (sort === "price_desc") return [{ variants: { _count: "desc" } }, { name: "asc" }];
  if (sort === "discount") return [{ updatedAt: "desc" }];
  return [{ featured: "desc" }, { ratingAvg: "desc" }, { reviewCount: "desc" }];
}

function applyComputedFilters(products: ProductWithCatalog[], query: ProductQuery) {
  let next = products;
  if (query.discount != null) {
    next = next.filter((product) => {
      const variant = mainVariant(product);
      const mrp = decimal(variant?.mrp);
      const price = decimal(variant?.price);
      return mrp > price && ((mrp - price) / mrp) * 100 >= query.discount!;
    });
  }
  if (query.availability === "low_stock") {
    next = next.filter((product) => {
      const stock = stockSummary(product);
      return stock.stockStatus === "low_stock";
    });
  }
  if (query.sort === "price_asc") next = [...next].sort((a, b) => decimal(mainVariant(a)?.price) - decimal(mainVariant(b)?.price));
  if (query.sort === "price_desc") next = [...next].sort((a, b) => decimal(mainVariant(b)?.price) - decimal(mainVariant(a)?.price));
  if (query.sort === "discount") {
    next = [...next].sort((a, b) => {
      const av = mainVariant(a);
      const bv = mainVariant(b);
      return decimal(bv?.mrp) - decimal(bv?.price) - (decimal(av?.mrp) - decimal(av?.price));
    });
  }
  return next;
}

export async function listCategories(admin = false) {
  const rows = await db.category.findMany({
    where: admin ? { deletedAt: null } : { deletedAt: null, status: ProductStatus.ACTIVE },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(mapCategory);
}

export async function getCategoryBySlug(slug: string) {
  const row = await db.category.findFirst({ where: { slug, deletedAt: null, status: ProductStatus.ACTIVE } });
  return row ? mapCategory(row) : null;
}

export async function listBrands(admin = false) {
  const rows = await db.brand.findMany({
    where: admin ? { deletedAt: null } : { deletedAt: null, status: ProductStatus.ACTIVE },
    orderBy: { name: "asc" },
  });
  return rows.map(mapBrand);
}

export async function listProducts(query: ProductQuery, admin = false) {
  const where = buildProductWhere(query, admin);
  const start = (query.page - 1) * query.limit;
  const needsComputedPass = query.discount != null || query.availability === "low_stock" || ["price_asc", "price_desc", "discount"].includes(query.sort);
  const [categories, brands] = await Promise.all([listCategories(admin), listBrands(admin)]);

  if (!needsComputedPass) {
    const [rows, total] = await Promise.all([
      db.product.findMany({
        where,
        include: productInclude,
        orderBy: productOrderBy(query.sort),
        skip: start,
        take: query.limit,
      }),
      db.product.count({ where }),
    ]);

    return {
        products: rows.map((row) => admin ? mapAdminProduct(row) : mapProduct(row)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
        hasNextPage: start + query.limit < total,
        hasPreviousPage: query.page > 1,
      },
      appliedFilters: query,
      filters: {
        categories,
        brands,
        availability: ["in_stock", "low_stock", "out_of_stock"],
        sort: ["popular", "newest", "price_asc", "price_desc", "discount"],
      },
    };
  }

  const rows = await db.product.findMany({
    where,
    include: productInclude,
    orderBy: productOrderBy(query.sort),
  });
  const filtered = applyComputedFilters(rows, query);
  const total = filtered.length;
  const products = filtered.slice(start, start + query.limit).map((row) => admin ? mapAdminProduct(row) : mapProduct(row));

  return {
    products,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
      hasNextPage: start + query.limit < total,
      hasPreviousPage: query.page > 1,
    },
    appliedFilters: query,
    filters: {
      categories,
      brands,
      availability: ["in_stock", "low_stock", "out_of_stock"],
      sort: ["popular", "newest", "price_asc", "price_desc", "discount"],
    },
  };
}

export async function getHomepageCatalogSections() {
  const categories = await db.category.findMany({
    where: { deletedAt: null, status: ProductStatus.ACTIVE },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const sections = [];
  for (const category of categories) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      status: ProductStatus.ACTIVE,
      categoryId: category.id,
    };
    const rows = await db.product.findMany({
      where,
      include: productInclude,
      orderBy: [{ featured: "desc" }, { updatedAt: "desc" }, { name: "asc" }],
    });
    if (!rows.length) continue;
    const products = rows.sort(sortHomepageProducts).map(mapProduct);
    sections.push({
      id: category.id,
      key: category.slug,
      title: category.name,
      slug: category.slug,
      description: categoryDescriptionsForApi(category.name),
      imageUrl: category.image || categoryImageFallback,
      productCount: products.length,
      products,
      resolvedCategorySlugs: [category.slug],
    });
  }
  return { sections };
}

function sortHomepageProducts(a: ProductWithCatalog, b: ProductWithCatalog) {
  const aStock = stockSummary(a).stock > 0 ? 1 : 0;
  const bStock = stockSummary(b).stock > 0 ? 1 : 0;
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  if (aStock !== bStock) return bStock - aStock;
  const aImage = primaryImageStatus(a) !== "Placeholder" ? 1 : 0;
  const bImage = primaryImageStatus(b) !== "Placeholder" ? 1 : 0;
  if (aImage !== bImage) return bImage - aImage;
  return a.name.localeCompare(b.name);
}

function categoryDescriptionsForApi(title: string) {
  const descriptions: Record<string, string> = {
    "Fruits & Vegetables": "Daily farm produce, greens, roots, and premium fruit picks.",
    "Dairy, Bread & Eggs": "Fresh milk, butter, paneer, bread, and breakfast staples.",
    "Atta, Rice & Dal": "Trusted grains, flours, pulses, and pantry foundations.",
    "Masala & Oil": "Cooking oils, spices, salt, and essentials for Indian kitchens.",
    "Snacks & Beverages": "Tea, biscuits, juices, namkeen, and quick refreshment picks.",
    "Packaged Food": "Family packs, noodles, ready pantry refills, and packaged staples.",
    "Household Essentials": "Cleaning, laundry, hygiene, and home-care supplies.",
    "Personal Care": "Everyday care, oral care, handwash, and grooming essentials.",
  };
  return descriptions[title] || "Premium Eagle Mart grocery essentials.";
}

export async function getProductBySlug(slug: string) {
  const product = await db.product.findFirst({
    where: { slug, deletedAt: null, status: ProductStatus.ACTIVE },
    include: productInclude,
  });
  if (!product) return null;

  const relatedRows = await db.product.findMany({
    where: { categoryId: product.categoryId, id: { not: product.id }, deletedAt: null, status: ProductStatus.ACTIVE },
    include: productInclude,
    orderBy: [{ featured: "desc" }, { ratingAvg: "desc" }],
    take: 4,
  });
  const togetherRows = await db.product.findMany({
    where: { id: { not: product.id }, deletedAt: null, status: ProductStatus.ACTIVE, featured: true },
    include: productInclude,
    take: 4,
  });

  return {
    ...mapProduct(product),
    highlights: tags(product.tags),
    storageInstructions: product.organic ? "Keep refrigerated after opening and consume while fresh." : "Store in a cool, dry place away from direct sunlight.",
    returnPolicy: "Same-day replacement is available for damaged, expired, or incorrect grocery items.",
    relatedProducts: relatedRows.map(mapProduct),
    frequentlyBoughtTogether: togetherRows.map(mapProduct),
    reviewsList: product.reviews.map((review) => ({
      id: review.id,
      userName: review.user.name,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
    })),
  };
}

async function resolveCategory(input: { categoryId?: string; categorySlug?: string; category?: string }) {
  if (input.categoryId) return input.categoryId;
  const where = input.categorySlug ? { slug: input.categorySlug } : input.category ? { name: input.category } : null;
  if (!where) throw new Error("Category is required.");
  const category = await db.category.findFirst({ where: { ...where, deletedAt: null } });
  if (!category) throw new Error("Category not found.");
  return category.id;
}

async function resolveBrand(input: { brandId?: string; brandSlug?: string; brand?: string }) {
  if (input.brandId) return input.brandId;
  const where = input.brandSlug ? { slug: input.brandSlug } : input.brand ? { name: input.brand } : null;
  if (!where) throw new Error("Brand is required.");
  const brand = await db.brand.findFirst({ where: { ...where, deletedAt: null } });
  if (!brand) throw new Error("Brand not found.");
  return brand.id;
}

function normalizedVariants(input: any) {
  const source = Array.isArray(input.variants) && input.variants.length ? input.variants : input.variant ? [{ ...input.variant, stock: input.inventory?.stock, lowStockThreshold: input.inventory?.lowStockThreshold }] : [];
  return source.map((variant: any, index: number) => {
    const active = variant.active == null ? variant.status !== ProductStatus.INACTIVE : Boolean(variant.active);
    const lowStock = variant.lowStockThreshold ?? variant.lowStock;
    return {
      ...variant,
      label: variant.label || variant.unit || `Variant ${index + 1}`,
      status: active ? ProductStatus.ACTIVE : ProductStatus.INACTIVE,
      isDefault: Boolean(variant.isDefault) || index === 0,
      stock: Math.max(0, Number.isFinite(Number(variant.stock)) ? Math.trunc(Number(variant.stock)) : 0),
      lowStockThreshold: Math.max(0, Number.isFinite(Number(lowStock)) ? Math.trunc(Number(lowStock)) : 10),
    };
  }).sort((a: any, b: any) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)));
}

function variantSku(productSku: string, variant: any, index: number) {
  return (variant.sku || `${productSku}-${String(index + 1).padStart(2, "0")}`).trim();
}

async function nextSequence(tx: Prisma.TransactionClient, key: string) {
  const current = await tx.setting.findUnique({ where: { key } });
  const next = Number(current?.value || "0") + 1;
  await tx.setting.upsert({
    where: { key },
    update: { value: String(next) },
    create: { key, value: String(next), type: SettingType.NUMBER },
  });
  return next;
}

async function generateSku(tx: Prisma.TransactionClient, categoryId: string) {
  const category = await tx.category.findUniqueOrThrow({ where: { id: categoryId } });
  const clientPrefixes: Record<string, string> = {
    "food-items": "FOO",
    "skin-care": "SKN",
    "hair-care": "HAI",
    "home-care": "HOM",
    "personal-care": "PER",
    cleaning: "CLN",
    detergents: "DET",
    disposables: "DIS",
    "oral-care": "ORA",
    dishwashing: "DSH",
    "baby-care": "BAB",
    "pooja-essentials": "POO",
    stationery: "STA",
    "electrical-appliances": "ELE",
    "body-care": "BOD",
    "chocolates-confectionery": "CHO",
  };
  const prefix = clientPrefixes[category.slug] || (category.slug || category.name).replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const sequence = await nextSequence(tx, `sku:${prefix}`);
    const sku = `${prefix}-${String(sequence).padStart(6, "0")}`;
    const existing = await tx.product.findUnique({ where: { sku } });
    if (!existing) return sku;
  }
  throw new Error("Could not generate a unique SKU.");
}

export async function createProduct(input: any) {
  const categoryId = await resolveCategory(input);
  const brandId = await resolveBrand(input);
  const slug = input.slug || slugify(input.name);
  const variants = normalizedVariants(input);
  const image = validateImportedPrimaryImageUrl(String(input.image || ""));
  if (image.url && !image.valid) throw new Error("Enter a valid image URL.");

  const productId = await db.$transaction(async (tx) => {
    const sku = input.sku?.trim() || await generateSku(tx, categoryId);
    const product = await tx.product.create({
      data: {
        name: input.name,
        slug,
        sku,
        clientProductCode: input.clientProductCode || null,
        categoryId,
        brandId,
        description: input.description,
        gst: input.gst,
        tags: input.tags,
        featured: input.featured,
        organic: input.organic,
        local: input.local,
        imageStatus: image.url ? ImageStatus.VERIFIED : ImageStatus.PLACEHOLDER,
        imageSource: image.url || null,
        imageCheckedAt: image.url ? new Date() : null,
        status: input.status,
        images: image.url ? { create: { url: image.url, alt: input.name, isPrimary: true } } : undefined,
      },
    });

    for (const [index, variantInput] of variants.entries()) {
      const variant = await tx.productVariant.create({
        data: {
          productId: product.id,
          sku: variantSku(sku, variantInput, index),
          label: variantInput.label,
          unit: variantInput.unit,
          mrp: variantInput.mrp,
          price: variantInput.price,
          costPrice: variantInput.costPrice ?? null,
          status: variantInput.status,
        },
      });
      await tx.inventory.create({
        data: {
          productId: product.id,
          variantId: variant.id,
          stock: variantInput.stock,
          lowStockThreshold: variantInput.lowStockThreshold,
        },
      });
    }

    return product.id;
  });

  const fresh = await db.product.findUniqueOrThrow({ where: { id: productId }, include: productInclude });
  return mapProduct(fresh);
}

export async function updateProduct(id: string, input: any) {
  const data: Prisma.ProductUpdateInput = {};
  if (input.name != null) data.name = input.name;
  if (input.slug != null) data.slug = input.slug;
  if (input.sku != null) data.sku = input.sku;
  if (input.clientProductCode !== undefined) data.clientProductCode = input.clientProductCode || null;
  if (input.description != null) data.description = input.description;
  if (input.gst != null) data.gst = input.gst;
  if (input.tags != null) data.tags = input.tags;
  if (input.featured != null) data.featured = input.featured;
  if (input.organic != null) data.organic = input.organic;
  if (input.local != null) data.local = input.local;
  if (input.status != null) data.status = input.status;
  if (input.categoryId || input.categorySlug || input.category) data.category = { connect: { id: await resolveCategory(input) } };
  if (input.brandId || input.brandSlug || input.brand) data.brand = { connect: { id: await resolveBrand(input) } };

  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data });

    if (input.image) {
      const image = validateImportedPrimaryImageUrl(String(input.image));
      if (!image.valid) throw new Error("Enter a valid image URL.");
      await tx.product.update({ where: { id }, data: { imageStatus: ImageStatus.VERIFIED, imageSource: image.url, imageCheckedAt: new Date() } });
      await tx.productImage.deleteMany({ where: { productId: id } });
      await tx.productImage.create({ data: { productId: id, url: image.url, alt: input.name, isPrimary: true } });
    }

    if (input.variants?.length) {
      const variants = normalizedVariants(input);
      const existing = await tx.productVariant.findMany({ where: { productId: id }, orderBy: { createdAt: "asc" } });
      const existingIds = new Set(existing.map((variant) => variant.id));
      const seenIds = new Set<string>();

      for (const [index, variantInput] of variants.entries()) {
        const baseData = {
          sku: variantSku(input.sku ?? "", variantInput, index),
          label: variantInput.label,
          unit: variantInput.unit,
          mrp: variantInput.mrp,
          price: variantInput.price,
          costPrice: variantInput.costPrice ?? null,
          status: variantInput.status,
        };
        let variantId = variantInput.id;
        if (variantId && existingIds.has(variantId)) {
          await tx.productVariant.update({ where: { id: variantId }, data: baseData });
        } else {
          const created = await tx.productVariant.create({ data: { productId: id, ...baseData } });
          variantId = created.id;
        }
        seenIds.add(variantId);

        await tx.inventory.upsert({
          where: { productId_variantId: { productId: id, variantId } },
          update: { stock: variantInput.stock, lowStockThreshold: variantInput.lowStockThreshold },
          create: { productId: id, variantId, stock: variantInput.stock, lowStockThreshold: variantInput.lowStockThreshold },
        });
      }

      const omitted = existing.filter((variant) => !seenIds.has(variant.id));
      if (omitted.length) {
        await tx.productVariant.updateMany({ where: { id: { in: omitted.map((variant) => variant.id) } }, data: { status: ProductStatus.INACTIVE } });
      }
    } else if (input.variant) {
      const variant = await tx.productVariant.findFirst({ where: { productId: id }, orderBy: { createdAt: "asc" } });
      if (variant) {
        await tx.productVariant.update({
          where: { id: variant.id },
          data: {
            sku: input.variant.sku,
            label: input.variant.label,
            unit: input.variant.unit,
            mrp: input.variant.mrp,
            price: input.variant.price,
            status: input.variant.status,
          },
        });
      }
    }

    if (input.inventory && !input.variants?.length) {
      const inventory = await tx.inventory.findFirst({ where: { productId: id } });
      if (inventory) {
        await tx.inventory.update({
          where: { id: inventory.id },
          data: { stock: input.inventory.stock, lowStockThreshold: input.inventory.lowStockThreshold },
        });
      }
    }
  });

  const product = await db.product.findUniqueOrThrow({ where: { id }, include: productInclude });
  return mapProduct(product);
}

export async function getAdminProduct(id: string) {
  const product = await db.product.findFirst({ where: { id, deletedAt: null }, include: productInclude });
  return product ? mapProduct(product) : null;
}

export async function softDeleteProduct(id: string) {
  await db.product.update({ where: { id }, data: { deletedAt: new Date(), status: ProductStatus.INACTIVE } });
}

async function assertAvailableCategorySlug(slug: string, id?: string) {
  const existing = await db.category.findFirst({ where: { slug, deletedAt: null, ...(id ? { id: { not: id } } : {}) } });
  if (existing) throw new Error("A category with this name already exists.");
}

async function assertAvailableBrandSlug(slug: string, id?: string) {
  const existing = await db.brand.findFirst({ where: { slug, deletedAt: null, ...(id ? { id: { not: id } } : {}) } });
  if (existing) throw new Error("A brand with this name already exists.");
}

export async function createCategory(input: any) {
  const slug = input.slug || slugify(input.name);
  await assertAvailableCategorySlug(slug);
  const category = await db.category.create({ data: { ...input, slug } });
  return mapCategory(category);
}

export async function updateCategory(id: string, input: any) {
  const slug = input.slug ?? (input.name ? slugify(input.name) : undefined);
  if (slug) await assertAvailableCategorySlug(slug, id);
  const category = await db.category.update({ where: { id }, data: { ...input, slug } });
  return mapCategory(category);
}

export async function softDeleteCategory(id: string) {
  await db.category.update({ where: { id }, data: { deletedAt: new Date(), status: ProductStatus.INACTIVE } });
}

export async function createBrand(input: any) {
  const slug = input.slug || slugify(input.name);
  await assertAvailableBrandSlug(slug);
  const brand = await db.brand.create({ data: { ...input, slug } });
  return mapBrand(brand);
}

export async function updateBrand(id: string, input: any) {
  const slug = input.slug ?? (input.name ? slugify(input.name) : undefined);
  if (slug) await assertAvailableBrandSlug(slug, id);
  const brand = await db.brand.update({ where: { id }, data: { ...input, slug } });
  return mapBrand(brand);
}

export async function softDeleteBrand(id: string) {
  await db.brand.update({ where: { id }, data: { deletedAt: new Date(), status: ProductStatus.INACTIVE } });
}

export async function replaceProductImage(productId: string, imageUrl: string | null) {
  const product = await db.product.findFirst({ where: { id: productId, deletedAt: null }, include: productInclude });
  if (!product) throw new Error("Product not found.");
  const nextUrl = imageUrl?.trim() || "";
  if (nextUrl && !validateImportedPrimaryImageUrl(nextUrl).valid) throw new Error("Enter a valid HTTPS or Eagle Mart image URL.");
  const updated = await db.$transaction(async (tx) => {
    if (!nextUrl) {
      await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
      return tx.product.update({ where: { id: productId }, data: { imageStatus: ImageStatus.PLACEHOLDER, imageSource: null, imageCheckedAt: new Date() }, include: productInclude });
    }
    await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
    const existing = await tx.productImage.findFirst({ where: { productId, url: nextUrl } });
    if (existing) {
      await tx.productImage.update({ where: { id: existing.id }, data: { alt: product.name, isPrimary: true, sortOrder: 0 } });
    } else {
      await tx.productImage.create({ data: { productId, url: nextUrl, alt: product.name, isPrimary: true, sortOrder: 0 } });
    }
    return tx.product.update({ where: { id: productId }, data: { imageStatus: ImageStatus.VERIFIED, imageSource: nextUrl, imageCheckedAt: new Date() }, include: productInclude });
  });
  return mapAdminProduct(updated);
}

const bulkColumns = [
  "clientProductCode", "name", "category", "brand", "unit", "costPrice", "sellingPrice", "mrp", "stock", "primaryImageUrl", "description", "gst", "hsn", "barcode", "status", "featured", "tags", "Image Preview",
];
const bulkRequired = ["name", "category", "brand", "unit", "mrp", "sellingPrice", "stock", "gst", "status"];
const booleanColumns = ["featured"];
const allowedImportModes = ["create_update", "create_only", "update_only"] as const;
type BulkImportMode = typeof allowedImportModes[number];
type BulkIssue = { field: string; value: string; message: string };
type BulkPreviewRow = { row: number; status: "valid" | "warning" | "error"; action: "create" | "update" | "skip"; data: Record<string, string>; errors: BulkIssue[]; warnings: BulkIssue[]; normalized?: any; existingProductId?: string; image?: { url: string; status: "none" | "valid" | "invalid"; message: string } };

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    return {
      rowNumber: index + 2,
      data: Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] || ""])),
    };
  });
}

function normalizeHeader(header: string) {
  const trimmed = header.trim();
  const canonical = bulkColumns.find((column) => column.toLowerCase() === trimmed.toLowerCase());
  if (canonical) return canonical;
  const aliases: Record<string, string> = {
    "product name": "name",
    "category name": "category",
    "unit name": "unit",
    "product code": "clientProductCode",
    productcode: "clientProductCode",
    code: "clientProductCode",
    "buying price": "costPrice",
    "our price": "sellingPrice",
    "primary image url": "primaryImageUrl",
    "image url": "primaryImageUrl",
    "product image url": "primaryImageUrl",
    "product image": "primaryImageUrl",
    image: "primaryImageUrl",
    imageurl: "primaryImageUrl",
    primaryimageurl: "primaryImageUrl",
    "image preview": "Image Preview",
    price: "sellingPrice",
    lowstockthreshold: "lowStockThreshold",
  };
  if (aliases[trimmed.toLowerCase()]) return aliases[trimmed.toLowerCase()];
  return trimmed;
}

function parseXlsx(base64: string) {
  const workbook = XLSX.read(Buffer.from(base64, "base64"), { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
  return rows.map((row, index) => ({
    rowNumber: index + 2,
    data: Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), String(value ?? "").trim()])),
  }));
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, "\"\"")}"` : safe;
}

function buildCsv(headers: string[], rows: Record<string, unknown>[]) {
  return `\uFEFF${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")).join("\n")}\n`;
}

function templateSample() {
  return {
    clientProductCode: "FRU-APPLE-001",
    name: "Fresh Apple 1kg",
    category: "Fruits & Vegetables",
    brand: "Eagle Mart Farms",
    unit: "1 kg",
    costPrice: "110",
    sellingPrice: "149",
    mrp: "180",
    stock: "25",
    primaryImageUrl: "",
    description: "Fresh, crisp apples selected for everyday household use.",
    gst: "0",
    hsn: "",
    barcode: "",
    status: "ACTIVE",
    featured: "true",
    tags: "fresh,fruit,local",
    "Image Preview": "",
  };
}

function csvTemplate() {
  return buildCsv(bulkColumns, [templateSample()]);
}

export function productBulkTemplate() {
  return csvTemplate();
}

function productBulkTemplateRow(product: ProductWithCatalog) {
  const variant = mainVariant(product);
  const inventory = variant ? variantInventory(product, variant.id) : stockSummary(product);
  const primaryImage = product.images.find((image) => image.isPrimary) || product.images[0];
  return {
    clientProductCode: product.clientProductCode || "",
    name: product.name,
    category: product.category.name,
    brand: product.brand.name,
    unit: variant?.unit || "",
    costPrice: decimal(variant?.costPrice),
    sellingPrice: decimal(variant?.price),
    mrp: decimal(variant?.mrp),
    stock: inventory.stock,
    primaryImageUrl: primaryImage?.url || "",
    description: product.description,
    gst: decimal(product.gst),
    hsn: "",
    barcode: "",
    status: product.status,
    featured: String(product.featured),
    tags: tags(product.tags).join(","),
    "Image Preview": "",
  };
}

export async function productBulkTemplateXlsx() {
  const products = await db.product.findMany({
    where: { deletedAt: null },
    include: productInclude,
    orderBy: [{ name: "asc" }, { sku: "asc" }],
  });
  const rows = products.length ? products.map(productBulkTemplateRow) : [templateSample()];
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: bulkColumns });
  const previewColumnIndex = bulkColumns.indexOf("Image Preview");
  const imageColumnIndex = bulkColumns.indexOf("primaryImageUrl");
  if (previewColumnIndex >= 0) {
    for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
      const cell = XLSX.utils.encode_cell({ r: rowIndex, c: previewColumnIndex });
      const imageCell = XLSX.utils.encode_cell({ r: rowIndex, c: imageColumnIndex >= 0 ? imageColumnIndex : previewColumnIndex - 1 });
      worksheet[cell] = { t: "s", f: `=IF(${imageCell}="","",IMAGE(${imageCell},"Product image",0))`, v: "" };
    }
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

function normalizeSku(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function validSku(value: string) {
  return /^[A-Z0-9]{3,}-\d{6}$/.test(value);
}

function parseNumber(value: string, field: string, issues: BulkIssue[], options: { required?: boolean; min?: number; max?: number; integer?: boolean; positive?: boolean } = {}) {
  if (!value.trim()) {
    if (options.required) issues.push({ field, value, message: `${field} is required` });
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || (options.integer && !Number.isInteger(number)) || (options.positive && number <= 0) || (options.min != null && number < options.min) || (options.max != null && number > options.max)) {
    issues.push({ field, value, message: `${field} has an invalid value` });
    return undefined;
  }
  return options.integer ? Math.trunc(number) : number;
}

function parseBoolean(value: string, field: string, issues: BulkIssue[], defaultValue = false) {
  if (!value.trim()) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  issues.push({ field, value, message: `${field} must be true, false, yes, no, 1, or 0` });
  return defaultValue;
}

function parseStatus(value: string, issues: BulkIssue[]) {
  const normalized = value.trim().toUpperCase();
  if (normalized === "ACTIVE") return ProductStatus.ACTIVE;
  if (normalized === "INACTIVE") return ProductStatus.INACTIVE;
  if (normalized === "OUT_OF_STOCK") return ProductStatus.OUT_OF_STOCK;
  issues.push({ field: "status", value, message: "status must be ACTIVE, INACTIVE, or OUT_OF_STOCK" });
  return ProductStatus.INACTIVE;
}

function normalizeTags(value: string) {
  const seen = new Set<string>();
  return value.split(",").map((tag) => tag.trim()).filter((tag) => {
    const key = tag.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isValidImageUrl(value: string) {
  if (!value.trim()) return true;
  if (value.startsWith("/assets/") || value.startsWith("/uploads/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function eagleMartImageHosts() {
  const configured = (process.env.FRONTEND_ORIGIN || "").split(",").map((origin) => {
    try { return new URL(origin.trim()).hostname.toLowerCase(); } catch { return ""; }
  }).filter(Boolean);
  return new Set(["eaglesclub.in", "www.eaglesclub.in", "api.eaglesclub.in", ...configured]);
}

function isBlockedImageHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "169.254.169.254") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  return false;
}

function validateImportedPrimaryImageUrl(value: string): { url: string; valid: boolean; message: string } {
  const raw = value.trim();
  if (!raw) return { url: "", valid: true, message: "No image URL supplied." };
  if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith("file:") || raw.startsWith("\\\\")) return { url: raw, valid: false, message: "Product imported, but primary image URL was invalid." };
  if (raw.startsWith("/assets/") || raw.startsWith("/uploads/")) return { url: raw, valid: true, message: "Valid Eagle Mart asset path." };
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return { url: raw, valid: false, message: "Product imported, but primary image URL was invalid." };
    if (isBlockedImageHost(url.hostname)) return { url: raw, valid: false, message: "Product imported, but primary image URL was invalid." };
    return { url: raw, valid: true, message: "Valid image URL." };
  } catch {
    return { url: raw, valid: false, message: "Product imported, but primary image URL was invalid." };
  }
}

function matchByText<T extends { id: string; slug: string; name: string }>(items: T[], value: string) {
  const normalized = value.trim().toLowerCase();
  return items.find((item) => item.id === value || item.slug.toLowerCase() === normalized || item.name.toLowerCase() === normalized);
}

function failedRowsCsv(rows: BulkPreviewRow[]) {
  const headers = [...bulkColumns, "importStatus", "errorMessage", "warningMessage"];
  return buildCsv(headers, rows.map((row) => ({
    ...row.data,
    importStatus: row.status,
    errorMessage: row.errors.map((issue) => `Row ${row.row}: ${issue.message}`).join("; "),
    warningMessage: row.warnings.map((issue) => `Row ${row.row}: ${issue.message}`).join("; "),
  })));
}

async function parseBulkRows(input: string | { filename?: string; contentBase64?: string; csv?: string }) {
  const fileInput = typeof input === "string" ? null : input;
  const filename = fileInput?.filename || "products.csv";
  const csvText = typeof input === "string" ? input : input.csv;
  if (fileInput?.contentBase64 && Buffer.byteLength(fileInput.contentBase64, "base64") > 5 * 1024 * 1024) throw new Error("Import file must be 5 MB or smaller.");
  const rows = csvText != null
    ? parseCsv(csvText)
    : filename.toLowerCase().endsWith(".xlsx") || filename.toLowerCase().endsWith(".xls")
      ? parseXlsx(fileInput?.contentBase64 || "")
      : parseCsv(Buffer.from(fileInput?.contentBase64 || "", "base64").toString("utf8"));
  if (rows.length > 1000) throw new Error("Import supports up to 1000 rows at a time.");
  return rows;
}

export async function previewBulkImportProducts(input: string | { filename?: string; contentBase64?: string; csv?: string }, mode: BulkImportMode = "create_update") {
  const rows = await parseBulkRows(input);
  const [categories, brands, existingProducts] = await Promise.all([
    db.category.findMany({ where: { deletedAt: null } }),
    db.brand.findMany({ where: { deletedAt: null } }),
    db.product.findMany({ where: { deletedAt: null }, select: { id: true, sku: true, clientProductCode: true } }),
  ]);
  const existingBySku = new Map(existingProducts.map((product) => [product.sku.toUpperCase(), product]));
  const existingByProductCode = new Map(existingProducts.filter((product) => product.clientProductCode).map((product) => [product.clientProductCode!.toUpperCase(), product]));
  const previewRows: BulkPreviewRow[] = [];

  for (const row of rows) {
    const data = row.data;
    const errors: BulkIssue[] = [];
    const warnings: BulkIssue[] = [];
    bulkRequired.forEach((field) => {
      if (!String(data[field] || "").trim()) errors.push({ field, value: String(data[field] || ""), message: `${field} is required` });
    });
    const category = matchByText(categories, String(data.category || ""));
    const subcategory = data.subcategory ? matchByText(categories, String(data.subcategory)) : undefined;
    const brand = matchByText(brands, String(data.brand || ""));
    if (!category) errors.push({ field: "category", value: String(data.category || ""), message: "Unknown category" });
    if (data.subcategory && !subcategory) errors.push({ field: "subcategory", value: String(data.subcategory), message: "Unknown subcategory" });
    if (subcategory && category && subcategory.parentId !== category.id) errors.push({ field: "subcategory", value: String(data.subcategory), message: "Subcategory does not belong to selected category" });
    if (!brand) errors.push({ field: "brand", value: String(data.brand || ""), message: "Unknown brand" });
    const productCode = String(data.clientProductCode || "").trim();
    const sku = normalizeSku(String(data.sku || ""));
    if (sku && !validSku(sku)) errors.push({ field: "sku", value: String(data.sku), message: "SKU must look like FRU-000001" });
    const existing = productCode ? existingByProductCode.get(productCode.toUpperCase()) : sku ? existingBySku.get(sku) : undefined;
    let action: BulkPreviewRow["action"] = existing ? "update" : "create";
    if (existing && mode === "create_only") {
      action = "skip";
      errors.push({ field: "sku", value: sku, message: "SKU already exists in create-only mode" });
    }
    if (!existing && mode === "update_only") {
      action = "skip";
      errors.push({ field: "clientProductCode", value: productCode || sku || "(blank)", message: "No existing Product Code found in update-only mode" });
    }
    const mrp = parseNumber(String(data.mrp || ""), "mrp", errors, { required: true, positive: true });
    const price = parseNumber(String(data.sellingPrice || ""), "sellingPrice", errors, { required: true, min: 0 });
    const costPrice = parseNumber(String(data.costPrice || ""), "costPrice", errors, { min: 0 });
    const gst = parseNumber(String(data.gst || ""), "gst", errors, { required: true, min: 0, max: 100 });
    const stock = parseNumber(String(data.stock || ""), "stock", errors, { required: true, min: 0, integer: true });
    const lowStockThreshold = parseNumber(String(data.lowStockThreshold || ""), "lowStockThreshold", errors, { min: 0, integer: true }) ?? 5;
    const discountPercentage = parseNumber(String(data.discountPercentage || ""), "discountPercentage", errors, { min: 0, max: 100 });
    if (mrp != null && price != null && price > mrp) errors.push({ field: "sellingPrice", value: String(data.sellingPrice), message: "sellingPrice must not be greater than MRP" });
    if (discountPercentage != null && mrp != null && price != null) {
      const calculated = Math.round(((mrp - price) / mrp) * 100);
      if (Math.abs(calculated - discountPercentage) > 1) warnings.push({ field: "discountPercentage", value: String(data.discountPercentage), message: "Discount conflicts with MRP and sellingPrice; price values will be used" });
    }
    booleanColumns.forEach((field) => parseBoolean(String(data[field] || ""), field, errors));
    const status = parseStatus(String(data.status || ""), errors);
    const primaryImage = validateImportedPrimaryImageUrl(String(data.primaryImageUrl || ""));
    if (primaryImage.url && !primaryImage.valid) warnings.push({ field: "primaryImageUrl", value: primaryImage.url, message: primaryImage.message });
    previewRows.push({
      row: row.rowNumber,
      status: errors.length ? "error" : warnings.length ? "warning" : "valid",
      action,
      data,
      errors,
      warnings,
      existingProductId: existing?.id,
      image: { url: primaryImage.url, status: primaryImage.url ? primaryImage.valid ? "valid" : "invalid" : "none", message: primaryImage.message },
      normalized: errors.length ? undefined : {
        sku,
        clientProductCode: productCode || null,
        categoryId: category?.id,
        brandId: brand?.id,
        name: String(data.name).trim(),
        description: String(data.description || data.shortDescription || data.name).trim(),
        unit: String(data.unit).trim(),
        mrp,
        price,
        gst,
        stock,
        lowStockThreshold,
        tags: normalizeTags(String(data.tags || "")),
        featured: parseBoolean(String(data.featured || data.eagleMartSelect || data.bestseller || ""), "featured", warnings),
        organic: parseBoolean(String(data.organic || ""), "organic", warnings),
        local: parseBoolean(String(data.local || ""), "local", warnings),
        status,
        primaryImageUrl: primaryImage.valid ? primaryImage.url : "",
      },
    });
  }
  const summary = {
    total: previewRows.length,
    valid: previewRows.filter((row) => row.status === "valid").length,
    warnings: previewRows.filter((row) => row.status === "warning").length,
    invalid: previewRows.filter((row) => row.status === "error").length,
    newProducts: previewRows.filter((row) => row.action === "create" && row.status !== "error").length,
    productsToUpdate: previewRows.filter((row) => row.action === "update" && row.status !== "error").length,
    conflicts: previewRows.filter((row) => row.action === "skip" || row.errors.some((issue) => issue.field === "sku")).length,
  };
  return { rows: previewRows, summary, failedRowsCsv: failedRowsCsv(previewRows.filter((row) => row.status === "error")) };
}

export async function bulkImportProducts(input: string | { filename?: string; contentBase64?: string; csv?: string }, mode: BulkImportMode = "create_update", dryRun = false, options: { overwriteExistingPrimaryImage?: boolean } = {}) {
  if (!allowedImportModes.includes(mode)) throw new Error("Invalid import mode.");
  const preview = await previewBulkImportProducts(input, mode);
  if (dryRun) return { ...preview.summary, created: 0, updated: 0, skipped: preview.summary.conflicts, failed: preview.summary.invalid, errors: preview.rows.filter((row) => row.status === "error").map((row) => ({ row: row.row, errors: row.errors.map((issue) => issue.message) })), warnings: preview.rows.filter((row) => row.warnings.length).map((row) => ({ row: row.row, warnings: row.warnings.map((issue) => issue.message) })), rows: preview.rows, failedRowsCsv: preview.failedRowsCsv };

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const importableRows = preview.rows.filter((row) => row.status !== "error" && row.action !== "skip");

  await db.$transaction(async (tx) => {
    for (const row of importableRows) {
      const data = row.normalized;
      const existing = row.existingProductId ? await tx.product.findUnique({ where: { id: row.existingProductId }, include: { variants: { orderBy: { createdAt: "asc" } }, images: true } }) : null;
      const sku = existing?.sku || data.sku || await generateSku(tx, data.categoryId);
      if (existing && mode === "create_only") { skipped += 1; continue; }
      if (!existing && mode === "update_only") { skipped += 1; continue; }
      const existingPrimary = existing?.images?.find((image) => image.isPrimary);
      const shouldApplyPrimaryImage = Boolean(data.primaryImageUrl && (!existingPrimary || options.overwriteExistingPrimaryImage));
      const productData = {
        name: data.name,
        slug: existing?.slug || slugify(data.name),
        sku,
        clientProductCode: data.clientProductCode,
        categoryId: data.categoryId,
        brandId: data.brandId,
        description: data.description || data.name,
        gst: data.gst,
        tags: data.tags,
        featured: data.featured,
        organic: data.organic,
        local: data.local,
        imageStatus: shouldApplyPrimaryImage ? ImageStatus.VERIFIED : existing?.imageStatus || ImageStatus.PLACEHOLDER,
        imageSource: shouldApplyPrimaryImage ? data.primaryImageUrl : existing?.imageSource || null,
        imageCheckedAt: shouldApplyPrimaryImage ? new Date() : existing?.imageCheckedAt || null,
        status: data.status,
      };
      const product = existing
        ? await tx.product.update({ where: { id: existing.id }, data: productData })
        : await tx.product.create({ data: productData });
      const existingVariant = existing?.variants[0];
      const variantSkuValue = existingVariant?.sku || `${sku}-01`;
      const variant = existingVariant || await tx.productVariant.create({
        data: { productId: product.id, sku: `${sku}-01`, label: data.unit, unit: data.unit, mrp: data.mrp, price: data.price, status: ProductStatus.ACTIVE },
      });
      if (existingVariant) {
        await tx.productVariant.update({ where: { id: variant.id }, data: { label: data.unit, unit: data.unit, mrp: data.mrp, price: data.price, status: ProductStatus.ACTIVE } });
      } else if (variantSkuValue !== variant.sku) {
        await tx.productVariant.update({ where: { id: variant.id }, data: { sku: variantSkuValue } });
      }
      await tx.inventory.upsert({
        where: { productId_variantId: { productId: product.id, variantId: variant.id } },
        update: { stock: data.stock, lowStockThreshold: data.lowStockThreshold },
        create: { productId: product.id, variantId: variant.id, stock: data.stock, lowStockThreshold: data.lowStockThreshold },
      });
      if (shouldApplyPrimaryImage) {
        const currentImages = await tx.productImage.findMany({ where: { productId: product.id } });
        const matching = currentImages.find((image) => image.url === data.primaryImageUrl);
        await tx.productImage.updateMany({ where: { productId: product.id, isPrimary: true }, data: { isPrimary: false } });
        if (matching) {
          await tx.productImage.update({ where: { id: matching.id }, data: { alt: data.name, isPrimary: true, sortOrder: 0 } });
        } else {
          await tx.productImage.create({ data: { productId: product.id, url: data.primaryImageUrl, alt: data.name, isPrimary: true, sortOrder: 0 } });
        }
      }
      if (existing) updated += 1;
      else created += 1;
    }
  });

  const errorRows = preview.rows.filter((row) => row.status === "error");
  return {
    ok: true,
    totalRows: preview.summary.total,
    validRows: preview.summary.valid + preview.summary.warnings,
    invalidRows: errorRows.length,
    created,
    updated,
    skipped,
    failed: errorRows.length,
    errors: errorRows.map((row) => ({ row: row.row, errors: row.errors.map((issue) => issue.message) })),
    warnings: preview.rows.filter((row) => row.warnings.length).map((row) => ({ row: row.row, warnings: row.warnings.map((issue) => issue.message) })),
    rows: preview.rows,
    failedRowsCsv: preview.failedRowsCsv,
  };
}

const clientCategoryNames: Record<string, string> = {
  "food items": "Food Items",
  "skin care": "Skin Care",
  haircare: "Hair Care",
  "home care": "Home Care",
  "personal care": "Personal Care",
  cleaning: "Cleaning",
  detergent: "Detergents",
  disposal: "Disposables",
  toothpaste: "Oral Care",
  dishwash: "Dishwashing",
  "baby care": "Baby Care",
  pooja: "Pooja Essentials",
  study: "Stationery",
  "electric applience": "Electrical Appliances",
  "body-care": "Body Care",
  "bars-covered-with-chocolate": "Chocolates & Confectionery",
};

const clientBrandPrefixes: [RegExp, string][] = [
  [/^head\s*&?\s*shoulders\b|^h\s*&\s*s\b/i, "Head & Shoulders"],
  [/^fair\s*&?\s*lovely\b|^f\s*&\s*l\b/i, "Fair & Lovely"],
  [/^surf\s+excel\b/i, "Surf Excel"],
  [/^center\s+fresh\b/i, "Center Fresh"],
  [/^clinic\s+plus\b/i, "Clinic Plus"],
  [/^lacto\s+calamine\b/i, "Lacto Calamine"],
  [/^laxman\s+rekha\b/i, "Laxman Rekha"],
  [/^rooh\s+afza\b/i, "Rooh Afza"],
  [/^taj\s+mahal\b/i, "Taj Mahal"],
  [/^b\s*natural\b|^b\s+netural\b/i, "B Natural"],
  [/^act\s*ii\b/i, "Act II"],
  [/^all\s*out\b/i, "All Out"],
  [/^ambi\s*pur\b/i, "Ambi Pur"],
  [/^oral[-\s]*b\b/i, "Oral-B"],
  [/^m\s*caffeine\b/i, "M Caffeine"],
  [/^mc\s*vities\b|^mcvitie'?s\b/i, "McVitie's"],
  [/^good\s+day\b/i, "Good Day"],
  [/^johnson'?s\b/i, "Johnson's"],
  [/^lay'?s\b/i, "Lay's"],
  [/^aashirv(?:aa|a)d\b|^aashirbaad\b/i, "Aashirvaad"],
  [/^7m\b/i, "7M"], [/^americana\b/i, "Americana"], [/^acnofight\b/i, "Acnofight"], [/^ajs\b/i, "AJS"],
  [/^amul\b/i, "Amul"], [/^ananda\b/i, "Ananda"], [/^aplus\b/i, "Aplus"], [/^apsara\b/i, "Apsara"],
  [/^ariel\b/i, "Ariel"], [/^babyhug\b/i, "Babyhug"], [/^britannia\b/i, "Britannia"], [/^bujialalji\b/i, "Bujialalji"],
  [/^badshah\b/i, "Badshah"], [/^bakeri\b/i, "Bakeri"], [/^bambino\b/i, "Bambino"], [/^beardo\b/i, "Beardo"],
  [/^bella\s+vita\b/i, "Bella Vita"], [/^bikaji\b/i, "Bikaji"], [/^bisleri\b/i, "Bisleri"], [/^bonn\b/i, "Bonn"],
  [/^boroplus\b/i, "Boroplus"], [/^bournvita\b/i, "Bournvita"], [/^camay\b/i, "Camay"], [/^cadbury\b/i, "Cadbury"],
  [/^candid\b/i, "Candid"], [/^catch\b/i, "Catch"], [/^cello\b/i, "Cello"], [/^cinthol\b/i, "Cinthol"],
  [/^closeup\b/i, "Closeup"], [/^coca[-\s]*cola\b/i, "Coca-Cola"], [/^colgate\b/i, "Colgate"], [/^colin\b/i, "Colin"],
  [/^continental\b/i, "Continental"], [/^cremica\b/i, "Cremica"], [/^cuddles\b/i, "Cuddles"], [/^dabur\b/i, "Dabur"],
  [/^daawat\b|^dawat\b/i, "Daawat"], [/^dalda\b/i, "Dalda"], [/^dant\s+kanti\b/i, "Dant Kanti"], [/^del\s+monte\b/i, "Del Monte"],
  [/^denver\b/i, "Denver"], [/^dettol\b/i, "Dettol"], [/^dove\b/i, "Dove"], [/^dukes\b/i, "Dukes"],
  [/^elmore\b/i, "Elmore"], [/^everest\b/i, "Everest"], [/^eveready\b/i, "Eveready"], [/^exo\b/i, "Exo"],
  [/^ezee\b/i, "Ezee"], [/^fem\b/i, "Fem"], [/^fiama\b/i, "Fiama"], [/^fine\s+life\b/i, "Fine Life"],
  [/^fogg\b/i, "Fogg"], [/^fortune\b/i, "Fortune"], [/^gainda\b/i, "Gainda"], [/^gala\b/i, "Gala"],
  [/^garnier\b/i, "Garnier"], [/^goldiee\b/i, "Goldiee"], [/^godrej\b/i, "Godrej"], [/^gillette\b/i, "Gillette"],
  [/^hajmola\b/i, "Hajmola"], [/^haldiram'?s?\b/i, "Haldiram"], [/^hamam\b/i, "Hamam"], [/^hamdard\b/i, "Hamdard"],
  [/^harpic\b/i, "Harpic"], [/^hershey\b/i, "Hershey"], [/^himalaya\b/i, "Himalaya"], [/^hit\b/i, "Hit"],
  [/^homelite\b/i, "Homelite"], [/^horlicks\b/i, "Horlicks"], [/^huggies\b/i, "Huggies"], [/^indulekha\b/i, "Indulekha"],
  [/^invasol\b/i, "Invasol"], [/^jabsons\b/i, "Jabsons"], [/^jaguar\b/i, "Jaguar"], [/^jivo\b/i, "Jivo"],
  [/^joy\b/i, "Joy"], [/^jovees\b/i, "Jovees"], [/^just\s+herbs\b/i, "Just Herbs"], [/^kangaro\b/i, "Kangaro"],
  [/^keo\s+karpin\b/i, "Keo Karpin"], [/^kesh\s+king\b/i, "Kesh King"], [/^khadi\b/i, "Khadi"], [/^kissan\b/i, "Kissan"],
  [/^knorr\b/i, "Knorr"], [/^kurkure\b/i, "Kurkure"], [/^lakme\b/i, "Lakme"], [/^lifebuoy\b/i, "Lifebuoy"],
  [/^lijjat\b/i, "Lijjat"], [/^limca\b/i, "Limca"], [/^lipton\b/i, "Lipton"], [/^lizol\b/i, "Lizol"],
  [/^lotte\b/i, "Lotte"], [/^lotus\b/i, "Lotus"], [/^lux\b/i, "Lux"], [/^mdh\b/i, "MDH"],
  [/^maggi\b/i, "Maggi"], [/^maxo\b/i, "Maxo"], [/^mbd\b/i, "MBD"], [/^milkfood\b/i, "Milkfood"],
  [/^milton\b/i, "Milton"], [/^munch\b/i, "Munch"], [/^nescafe\b/i, "Nescafe"], [/^nestle\b/i, "Nestle"],
  [/^nihar\b/i, "Nihar"], [/^nivea\b/i, "Nivea"], [/^odonil\b/i, "Odonil"], [/^odomos\b/i, "Odomos"],
  [/^oleev\b/i, "Oleev"], [/^oreo\b/i, "Oreo"], [/^palmolive\b/i, "Palmolive"], [/^parachute\b/i, "Parachute"],
  [/^parle\b/i, "Parle"], [/^patanjali\b/i, "Patanjali"], [/^pears\b/i, "Pears"], [/^pepsodent\b/i, "Pepsodent"],
  [/^pond'?s\b/i, "Ponds"], [/^quaker\b/i, "Quaker"], [/^real\b/i, "Real"], [/^revlon\b/i, "Revlon"],
  [/^rin\b/i, "Rin"], [/^saffola\b/i, "Saffola"], [/^santoor\b/i, "Santoor"], [/^savlon\b/i, "Savlon"],
  [/^sensodyne\b/i, "Sensodyne"], [/^set\s+wet\b/i, "Set Wet"], [/^sofy\b/i, "Sofy"], [/^snickers\b/i, "Snickers"],
  [/^spinz\b/i, "Spinz"], [/^stayfree\b/i, "Stayfree"], [/^streax\b/i, "Streax"], [/^sunsilk\b/i, "Sunsilk"],
  [/^tata\b/i, "Tata"], [/^tide\b/i, "Tide"], [/^tops\b/i, "Tops"], [/^trese?mme\b/i, "Tresemme"],
  [/^ujala\b/i, "Ujala"], [/^unibic\b/i, "Unibic"], [/^v[ae]seline\b/i, "Vaseline"], [/^veeba\b/i, "Veeba"],
  [/^veet\b/i, "Veet"], [/^verka\b/i, "Verka"], [/^vim\b/i, "Vim"], [/^vivel\b/i, "Vivel"],
  [/^whisper\b/i, "Whisper"], [/^wipro\b/i, "Wipro"], [/^woosh\b/i, "Woosh"], [/^yardley\b/i, "Yardley"],
  [/^yippee\b/i, "YiPPee"], [/^yutika\b/i, "Yutika"], [/^zandu\b/i, "Zandu"],
];

function normalizedIdentity(name: string, category: string, unit: string, rowNumber?: number) {
  return [name, category, unit, rowNumber ? `row-${rowNumber}` : ""].map((value) => normalizeSearch(value)).join("|");
}

function isNonSaleableClientProduct(name: string) {
  return /\b(test product|demo|ad|donation|mrp sticker|damage)\b/i.test(name);
}

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeClientUnit(value: string) {
  const raw = cleanName(value);
  if (!raw) return "";
  if (/^\d+(?:\.\d+)?$/.test(raw)) return `${raw} pc`;
  return raw
    .replace(/(\d)\s*(kg|g|ml|l|pc|pcs|pack|dozen)\b/gi, (_, amount, unit) => `${amount} ${unit.toLowerCase()}`)
    .replace(/\bl\b/g, "L")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeClientCategory(value: string) {
  const raw = cleanName(value);
  return clientCategoryNames[raw.toLowerCase()] || raw.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

function extractClientBrand(name: string) {
  const match = clientBrandPrefixes.find(([pattern]) => pattern.test(name));
  return match?.[1] || "Unbranded";
}

async function uniqueSlug(tx: Prisma.TransactionClient, base: string, exceptProductId?: string) {
  const root = slugify(base) || "eagle-mart-product";
  let slug = root;
  for (let index = 0; index < 50; index += 1) {
    const existing = await tx.product.findUnique({ where: { slug }, select: { id: true } });
    if (!existing || existing.id === exceptProductId) return slug;
    slug = `${root}-${index + 2}`;
  }
  throw new Error(`Could not create a unique slug for ${base}`);
}

export async function replaceClientCatalogFromWorkbook(input: string | { filename?: string; contentBase64?: string; csv?: string }, dryRun = false, options: { deleteUnreferencedOldProducts?: boolean } = {}) {
  const rows = await parseBulkRows(input);
  const duplicateCounts = new Map<string, number>();
  const prepared = rows.map((row) => {
    const source = row.data;
    const name = cleanName(String(source.name || ""));
    const sourceCategory = cleanName(String(source.category || ""));
    const category = normalizeClientCategory(sourceCategory);
    const sourceUnit = cleanName(String(source.unit || ""));
    const unit = normalizeClientUnit(sourceUnit);
    const identity = normalizedIdentity(name, category, unit, row.rowNumber);
    duplicateCounts.set(identity, (duplicateCounts.get(identity) || 0) + 1);
    return { row, source, name, sourceCategory, category, sourceUnit, unit, identity };
  });

  const failedRows: BulkPreviewRow[] = [];
  const validRows: typeof prepared = [];
  for (const item of prepared) {
    const errors: BulkIssue[] = [];
    const inactiveByRule = isNonSaleableClientProduct(item.name);
    if (!item.name) errors.push({ field: "name", value: "", message: "Product Name is required" });
    if (!item.category) errors.push({ field: "category", value: item.sourceCategory, message: "Category Name is required" });
    if (!item.unit) errors.push({ field: "unit", value: item.sourceUnit, message: "Unit Name is required" });
    const mrp = parseNumber(String(item.source.mrp || ""), "mrp", errors, { required: !inactiveByRule, positive: !inactiveByRule, min: inactiveByRule ? 0 : undefined });
    const sellingPrice = parseNumber(String(item.source.sellingPrice || ""), "sellingPrice", errors, { required: !inactiveByRule, min: 0 });
    const costPrice = parseNumber(String(item.source.costPrice || ""), "costPrice", errors, { min: 0 });
    const stock = parseNumber(String(item.source.stock || ""), "stock", errors, { required: !inactiveByRule, min: inactiveByRule ? undefined : 0, integer: true });
    if (mrp != null && sellingPrice != null && sellingPrice > mrp) errors.push({ field: "sellingPrice", value: String(item.source.sellingPrice), message: "Our Price must not be greater than MRP" });
    if (errors.length) {
      failedRows.push({ row: item.row.rowNumber, status: "error", action: "skip", data: item.source, errors, warnings: [], normalized: { normalizedCategory: item.category, normalizedUnit: item.unit } });
      continue;
    }
    (item as any).numbers = { mrp: mrp ?? 0, sellingPrice: sellingPrice ?? 0, costPrice: costPrice ?? 0, stock: stock ?? 0 };
    validRows.push(item);
  }

  const summary = {
    workbookRows: rows.length,
    validRows: validRows.length,
    importedProducts: 0,
    updatedProducts: 0,
    draftInactiveProducts: 0,
    rejectedRows: failedRows.length,
    duplicateConflictRows: failedRows.filter((row) => row.errors.some((issue) => issue.field === "identity")).length,
    generatedSkus: 0,
    createdCategories: 0,
    createdBrands: 0,
    unbrandedProducts: 0,
    archivedOldProducts: 0,
    deletedSafeDemoProducts: 0,
    deactivatedCoupons: 0,
    deletedCoupons: 0,
    failedRowsCsv: failedRowsCsv(failedRows),
    backupCommand: "mysqldump --single-transaction --routines --triggers \"$DATABASE_URL\" > eagle-mart-catalog-backup.sql",
  };

  if (dryRun) return summary;

  const activeIdentities = new Set<string>();
  await db.$transaction(async (tx) => {
    const categoryIds = new Map<string, string>();
    const brandIds = new Map<string, string>();
    for (const name of [...new Set(validRows.map((item) => item.category))]) {
      const slug = slugify(name);
      const existing = await tx.category.findFirst({ where: { OR: [{ slug }, { name }], deletedAt: null }, select: { id: true } });
      const row = existing || await tx.category.create({ data: { name, slug, image: null, status: ProductStatus.ACTIVE }, select: { id: true } });
      if (!existing) summary.createdCategories += 1;
      else await tx.category.update({ where: { id: row.id }, data: { name, status: ProductStatus.ACTIVE } });
      categoryIds.set(name, row.id);
    }
    for (const name of [...new Set(validRows.map((item) => extractClientBrand(item.name)))]) {
      const slug = slugify(name);
      const existing = await tx.brand.findFirst({ where: { OR: [{ slug }, { name }], deletedAt: null }, select: { id: true } });
      const row = existing || await tx.brand.create({ data: { name, slug, logo: null, status: ProductStatus.ACTIVE }, select: { id: true } });
      if (!existing) summary.createdBrands += 1;
      else await tx.brand.update({ where: { id: row.id }, data: { name, status: ProductStatus.ACTIVE } });
      brandIds.set(name, row.id);
    }

    for (const item of validRows) {
      const numbers = (item as any).numbers as { mrp: number; sellingPrice: number; costPrice?: number; stock: number };
      const inactiveByRule = isNonSaleableClientProduct(item.name);
      const brandName = extractClientBrand(item.name);
      if (brandName === "Unbranded") summary.unbrandedProducts += 1;
      const existing = await tx.product.findUnique({ where: { importIdentity: item.identity }, include: { variants: { orderBy: { createdAt: "asc" } }, images: true } });
      const categoryId = categoryIds.get(item.category)!;
      const brandId = brandIds.get(brandName)!;
      const sku = existing?.sku || await generateSku(tx, categoryId);
      if (!existing) summary.generatedSkus += 1;
      const productData = {
        name: item.name,
        slug: existing?.slug || await uniqueSlug(tx, item.name),
        sku,
        clientProductCode: cleanName(String(item.source.clientProductCode || "")) || null,
        importIdentity: item.identity,
        sourceCategory: item.sourceCategory || null,
        categoryId,
        brandId,
        description: `${item.name} available in ${item.unit}.`,
        gst: 0,
        ratingAvg: 0,
        reviewCount: 0,
        tags: [],
        featured: false,
        organic: false,
        local: false,
        imageStatus: existing?.imageStatus === ImageStatus.VERIFIED ? ImageStatus.VERIFIED : ImageStatus.PLACEHOLDER,
        imageSource: existing?.imageSource || null,
        imageCheckedAt: existing?.imageCheckedAt || null,
        status: inactiveByRule ? ProductStatus.INACTIVE : ProductStatus.ACTIVE,
        deletedAt: null,
      };
      const product = existing
        ? await tx.product.update({ where: { id: existing.id }, data: { ...productData, description: existing.description || productData.description } })
        : await tx.product.create({ data: productData });
      const variant = existing?.variants[0] || await tx.productVariant.create({
        data: { productId: product.id, sku: `${sku}-01`, label: item.unit, unit: item.unit, sourceUnit: item.sourceUnit || null, mrp: numbers.mrp, price: numbers.sellingPrice, costPrice: numbers.costPrice, status: ProductStatus.ACTIVE },
      });
      if (existing?.variants[0]) {
        await tx.productVariant.update({ where: { id: variant.id }, data: { label: item.unit, unit: item.unit, sourceUnit: item.sourceUnit || null, mrp: numbers.mrp, price: numbers.sellingPrice, costPrice: numbers.costPrice, status: ProductStatus.ACTIVE } });
      }
      await tx.inventory.upsert({
        where: { productId_variantId: { productId: product.id, variantId: variant.id } },
        update: { stock: inactiveByRule ? 0 : numbers.stock, lowStockThreshold: 5 },
        create: { productId: product.id, variantId: variant.id, stock: inactiveByRule ? 0 : numbers.stock, lowStockThreshold: 5 },
      });
      if (!existing?.images.length) {
        await tx.productImage.create({ data: { productId: product.id, url: productImageFallback, alt: item.name, isPrimary: true, sortOrder: 1 } });
      }
      activeIdentities.add(item.identity);
      if (inactiveByRule) summary.draftInactiveProducts += 1;
      else if (existing) summary.updatedProducts += 1;
      else summary.importedProducts += 1;
    }

    const oldProducts = await tx.product.findMany({
      where: { deletedAt: null, OR: [{ importIdentity: null }, { importIdentity: { notIn: [...activeIdentities] } }] },
      select: { id: true },
    });
    for (const product of oldProducts) {
      const [orders, carts, wishlists, reviews, moves] = await Promise.all([
        tx.orderItem.count({ where: { productId: product.id } }),
        tx.cartItem.count({ where: { productId: product.id } }),
        tx.wishlistItem.count({ where: { productId: product.id } }),
        tx.review.count({ where: { productId: product.id } }),
        tx.stockMovement.count({ where: { productId: product.id } }),
      ]);
      if (orders || moves || !options.deleteUnreferencedOldProducts) {
        await tx.product.update({ where: { id: product.id }, data: { status: ProductStatus.INACTIVE, deletedAt: new Date() } });
        await tx.productVariant.updateMany({ where: { productId: product.id }, data: { status: ProductStatus.INACTIVE } });
        await tx.inventory.updateMany({ where: { productId: product.id }, data: { stock: 0 } });
        summary.archivedOldProducts += 1;
      } else {
        await tx.cartItem.deleteMany({ where: { productId: product.id } });
        await tx.wishlistItem.deleteMany({ where: { productId: product.id } });
        await tx.review.deleteMany({ where: { productId: product.id } });
        await tx.inventory.deleteMany({ where: { productId: product.id } });
        await tx.productImage.deleteMany({ where: { productId: product.id } });
        await tx.productVariant.deleteMany({ where: { productId: product.id } });
        await tx.product.delete({ where: { id: product.id } });
        summary.deletedSafeDemoProducts += 1;
      }
      void carts; void wishlists; void reviews;
    }

    const coupons = await tx.coupon.findMany({ where: { deletedAt: null }, select: { id: true, _count: { select: { orders: true, usages: true, carts: true } } } });
    for (const coupon of coupons) {
      if (coupon._count.orders || coupon._count.usages || coupon._count.carts) {
        await tx.coupon.update({ where: { id: coupon.id }, data: { active: false, deletedAt: new Date() } });
        summary.deactivatedCoupons += 1;
      } else {
        await tx.coupon.delete({ where: { id: coupon.id } });
        summary.deletedCoupons += 1;
      }
    }

    await tx.category.updateMany({ where: { products: { none: { deletedAt: null, status: ProductStatus.ACTIVE } } }, data: { status: ProductStatus.INACTIVE, deletedAt: new Date() } });
    await tx.brand.updateMany({ where: { products: { none: { deletedAt: null, status: ProductStatus.ACTIVE } } }, data: { status: ProductStatus.INACTIVE, deletedAt: new Date() } });
    await tx.setting.upsert({
      where: { key: "catalog:client-imported-at" },
      update: { value: new Date().toISOString(), type: SettingType.STRING },
      create: { key: "catalog:client-imported-at", value: new Date().toISOString(), type: SettingType.STRING },
    });
  }, { timeout: 120000 });

  return summary;
}
