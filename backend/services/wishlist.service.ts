import { ProductStatus } from "@prisma/client";
import { db } from "../lib/db.js";
import { addCartItem, getCartSummary } from "./cart.service.js";
import { mapProduct } from "./catalog.service.js";

const wishlistInclude = {
  items: {
    orderBy: { createdAt: "desc" as const },
    include: {
      product: {
        include: {
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
        },
      },
    },
  },
};

export async function getOrCreateWishlist(userId: string) {
  const existing = await db.wishlist.findUnique({ where: { userId }, include: wishlistInclude });
  if (existing) return existing;
  return db.wishlist.create({ data: { userId }, include: wishlistInclude });
}

export function mapWishlist(wishlist: Awaited<ReturnType<typeof getOrCreateWishlist>>) {
  return {
    wishlistId: wishlist.id,
    items: wishlist.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      product: mapProduct(item.product),
      createdAt: item.createdAt,
    })),
    itemCount: wishlist.items.length,
  };
}

export async function getWishlistSummary(userId: string) {
  return mapWishlist(await getOrCreateWishlist(userId));
}

async function assertActiveProduct(productId: string) {
  const product = await db.product.findFirst({
    where: { id: productId, deletedAt: null, status: ProductStatus.ACTIVE },
    include: { inventory: true, variants: true },
  });
  if (!product) throw new Error("Product is not available.");
  if (product.inventory.reduce((sum, item) => sum + item.stock, 0) <= 0) throw new Error("Product is out of stock.");
  return product;
}

export async function addWishlistItem(userId: string, productId: string) {
  await assertActiveProduct(productId);
  const wishlist = await getOrCreateWishlist(userId);
  await db.wishlistItem.upsert({
    where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
    update: {},
    create: { wishlistId: wishlist.id, productId },
  });
  return mapWishlist(await getOrCreateWishlist(userId));
}

export async function removeWishlistItem(userId: string, itemOrProductId: string) {
  const wishlist = await getOrCreateWishlist(userId);
  await db.wishlistItem.deleteMany({
    where: {
      wishlistId: wishlist.id,
      OR: [{ id: itemOrProductId }, { productId: itemOrProductId }],
    },
  });
  return mapWishlist(await getOrCreateWishlist(userId));
}

export async function moveWishlistItemToCart(userId: string, itemOrProductId: string) {
  const wishlist = await getOrCreateWishlist(userId);
  const item = await db.wishlistItem.findFirst({
    where: { wishlistId: wishlist.id, OR: [{ id: itemOrProductId }, { productId: itemOrProductId }] },
    include: { product: { include: { variants: true } } },
  });
  if (!item) throw new Error("Wishlist item not found.");
  const variant = item.product.variants[0];
  const cart = await addCartItem(userId, { productId: item.productId, variantId: variant?.id, quantity: 1 });
  await db.wishlistItem.delete({ where: { id: item.id } });
  return {
    wishlist: mapWishlist(await getOrCreateWishlist(userId)),
    cart,
    cartSummary: await getCartSummary(userId),
  };
}
