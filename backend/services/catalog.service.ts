import { Prisma, ProductStatus } from "@prisma/client";
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

const productImageFallback = "/assets/placeholders/product-placeholder.svg";
const categoryImageFallback = "/assets/placeholders/category-placeholder.svg";

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

function mainVariant(product: ProductWithCatalog) {
  return product.variants.find((variant) => variant.status === ProductStatus.ACTIVE) ?? product.variants[0];
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
    lowStock: stock.lowStock,
    stockStatus: stock.stockStatus,
    image,
    images: product.images.map((item) => ({ id: item.id, url: item.url || productImageFallback, alt: item.alt ?? product.name, isPrimary: item.isPrimary })),
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
    variants: product.variants.map((item) => ({
      id: item.id,
      sku: item.sku,
      label: item.label,
      unit: item.unit,
      mrp: decimal(item.mrp),
      price: decimal(item.price),
      sellingPrice: decimal(item.price),
      status: item.status,
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function buildProductWhere(query: ProductQuery, admin = false): Prisma.ProductWhereInput {
  const search = query.q || query.search;
  const where: Prisma.ProductWhereInput = admin ? { deletedAt: null } : { deletedAt: null, status: ProductStatus.ACTIVE };

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { sku: { contains: search } },
      { description: { contains: search } },
      { brand: { name: { contains: search } } },
      { category: { name: { contains: search } } },
    ];
  }
  if (query.category) where.category = { OR: [{ slug: query.category }, { name: query.category }] };
  if (query.brand) where.brand = { OR: [{ slug: query.brand }, { name: query.brand }] };
  if (query.minPrice != null || query.maxPrice != null) {
    where.variants = { some: { price: { gte: query.minPrice, lte: query.maxPrice } } };
  }
  if (query.rating != null) where.ratingAvg = { gte: query.rating };
  if (query.organic != null) where.organic = query.organic;
  if (query.local != null) where.local = query.local;
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
  const rows = await db.product.findMany({
    where,
    include: productInclude,
    orderBy: productOrderBy(query.sort),
  });
  const filtered = applyComputedFilters(rows, query);
  const total = filtered.length;
  const start = (query.page - 1) * query.limit;
  const products = filtered.slice(start, start + query.limit).map(mapProduct);
  const [categories, brands] = await Promise.all([listCategories(admin), listBrands(admin)]);

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

export async function createProduct(input: any) {
  const categoryId = await resolveCategory(input);
  const brandId = await resolveBrand(input);
  const slug = input.slug || slugify(input.name);

  const product = await db.product.create({
    data: {
      name: input.name,
      slug,
      sku: input.sku,
      categoryId,
      brandId,
      description: input.description,
      gst: input.gst,
      tags: input.tags,
      featured: input.featured,
      organic: input.organic,
      local: input.local,
      status: input.status,
      images: input.image ? { create: { url: input.image, alt: input.name, isPrimary: true } } : undefined,
      variants: {
        create: {
          sku: input.variant.sku || `${input.sku}-DEFAULT`,
          label: input.variant.label,
          unit: input.variant.unit,
          mrp: input.variant.mrp,
          price: input.variant.price,
          status: input.variant.status,
        },
      },
    },
    include: productInclude,
  });

  const variant = product.variants[0];
  await db.inventory.create({
    data: {
      productId: product.id,
      variantId: variant.id,
      stock: input.inventory.stock,
      lowStockThreshold: input.inventory.lowStockThreshold,
    },
  });

  const fresh = await db.product.findUniqueOrThrow({ where: { id: product.id }, include: productInclude });
  return mapProduct(fresh);
}

export async function updateProduct(id: string, input: any) {
  const data: Prisma.ProductUpdateInput = {};
  if (input.name != null) data.name = input.name;
  if (input.slug != null) data.slug = input.slug;
  if (input.sku != null) data.sku = input.sku;
  if (input.description != null) data.description = input.description;
  if (input.gst != null) data.gst = input.gst;
  if (input.tags != null) data.tags = input.tags;
  if (input.featured != null) data.featured = input.featured;
  if (input.organic != null) data.organic = input.organic;
  if (input.local != null) data.local = input.local;
  if (input.status != null) data.status = input.status;
  if (input.categoryId || input.categorySlug || input.category) data.category = { connect: { id: await resolveCategory(input) } };
  if (input.brandId || input.brandSlug || input.brand) data.brand = { connect: { id: await resolveBrand(input) } };

  await db.product.update({ where: { id }, data });

  if (input.image) {
    await db.productImage.deleteMany({ where: { productId: id } });
    await db.productImage.create({ data: { productId: id, url: input.image, alt: input.name, isPrimary: true } });
  }
  if (input.variant) {
    const variant = await db.productVariant.findFirst({ where: { productId: id }, orderBy: { createdAt: "asc" } });
    if (variant) {
      await db.productVariant.update({
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
  if (input.inventory) {
    const inventory = await db.inventory.findFirst({ where: { productId: id } });
    if (inventory) {
      await db.inventory.update({
        where: { id: inventory.id },
        data: { stock: input.inventory.stock, lowStockThreshold: input.inventory.lowStockThreshold },
      });
    }
  }

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

export async function createCategory(input: any) {
  const category = await db.category.create({ data: { ...input, slug: input.slug || slugify(input.name) } });
  return mapCategory(category);
}

export async function updateCategory(id: string, input: any) {
  const category = await db.category.update({ where: { id }, data: { ...input, slug: input.slug ?? undefined } });
  return mapCategory(category);
}

export async function softDeleteCategory(id: string) {
  await db.category.update({ where: { id }, data: { deletedAt: new Date(), status: ProductStatus.INACTIVE } });
}

export async function createBrand(input: any) {
  const brand = await db.brand.create({ data: { ...input, slug: input.slug || slugify(input.name) } });
  return mapBrand(brand);
}

export async function updateBrand(id: string, input: any) {
  const brand = await db.brand.update({ where: { id }, data: { ...input, slug: input.slug ?? undefined } });
  return mapBrand(brand);
}

export async function softDeleteBrand(id: string) {
  await db.brand.update({ where: { id }, data: { deletedAt: new Date(), status: ProductStatus.INACTIVE } });
}
