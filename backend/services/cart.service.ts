import { CouponType, Prisma, ProductStatus } from "@prisma/client";
import { db } from "../lib/db.js";
import { mapProduct } from "./catalog.service.js";

const cartInclude = {
  coupon: true,
  items: {
    orderBy: { createdAt: "asc" as const },
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
      variant: true,
    },
  },
};

type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
type CouponLike = NonNullable<CartWithItems["coupon"]>;

function decimal(value: Prisma.Decimal | number | null | undefined) {
  if (value == null) return 0;
  return Number(value);
}

function deliveryCharge(subtotal: number, coupon?: CouponLike | null) {
  if (!subtotal) return 0;
  if (coupon?.type === CouponType.FREE_DELIVERY) return 0;
  return subtotal > 799 ? 0 : 49;
}

function couponDiscount(coupon: CouponLike | null | undefined, subtotal: number, delivery: number) {
  if (!coupon) return 0;
  let discount = 0;
  if (coupon.type === CouponType.FIXED) discount = decimal(coupon.value);
  if (coupon.type === CouponType.PERCENTAGE) discount = Math.round(subtotal * (decimal(coupon.value) / 100));
  if (coupon.type === CouponType.FREE_DELIVERY) discount = delivery;
  const maxDiscount = decimal(coupon.maxDiscount);
  return Math.min(discount, maxDiscount || discount, subtotal + delivery);
}

function productStock(product: CartWithItems["items"][number]["product"], variantId?: string | null) {
  const matching = product.inventory.filter((item) => (variantId ? item.variantId === variantId : true));
  const rows = matching.length ? matching : product.inventory;
  return rows.reduce((sum, item) => sum + item.stock, 0);
}

async function loadCart(id: string) {
  return db.cart.findUniqueOrThrow({ where: { id }, include: cartInclude });
}

export async function getOrCreateCart(userId: string) {
  const existing = await db.cart.findUnique({ where: { userId }, include: cartInclude });
  if (existing) return existing;
  return db.cart.create({ data: { userId }, include: cartInclude });
}

export function mapCart(cart: CartWithItems) {
  const subtotal = cart.items.reduce((sum, item) => sum + decimal(item.variant?.price ?? item.unitPriceSnapshot) * item.quantity, 0);
  const mrp = cart.items.reduce((sum, item) => sum + decimal(item.variant?.mrp ?? item.unitPriceSnapshot) * item.quantity, 0);
  const discount = Math.max(0, mrp - subtotal);
  const deliveryBeforeCoupon = subtotal && subtotal <= 799 ? 49 : 0;
  const couponDiscountAmount = couponDiscount(cart.coupon, subtotal, deliveryBeforeCoupon);
  const delivery = deliveryCharge(subtotal, cart.coupon);
  const tax = Math.round(subtotal * 0.05);
  const handlingCharge = subtotal ? 12 : 0;
  const total = Math.max(0, subtotal - couponDiscountAmount + tax + delivery + handlingCharge);

  return {
    cartId: cart.id,
    items: cart.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      qty: item.quantity,
      quantity: item.quantity,
      unitPrice: decimal(item.variant?.price ?? item.unitPriceSnapshot),
      product: mapProduct(item.product),
    })),
    subtotal,
    discount,
    couponDiscount: couponDiscountAmount,
    tax,
    gst: tax,
    deliveryCharge: delivery,
    delivery,
    handlingCharge,
    handling: handlingCharge,
    total,
    appliedCoupon: cart.coupon
      ? {
          id: cart.coupon.id,
          code: cart.coupon.code,
          title: cart.coupon.title,
          type: cart.coupon.type,
          value: decimal(cart.coupon.value),
        }
      : null,
    itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

export async function getCartSummary(userId: string) {
  return mapCart(await getOrCreateCart(userId));
}

async function getActiveProduct(productId: string, variantId?: string) {
  const product = await db.product.findFirst({
    where: { id: productId, deletedAt: null, status: ProductStatus.ACTIVE },
    include: { variants: true, inventory: true },
  });
  if (!product) throw new Error("Product is not available.");
  const variant = variantId
    ? product.variants.find((item) => item.id === variantId && item.status === ProductStatus.ACTIVE)
    : product.variants.find((item) => item.status === ProductStatus.ACTIVE) ?? product.variants[0];
  if (!variant) throw new Error("Product variant is not available.");
  const stock = product.inventory.filter((item) => item.variantId === variant.id).reduce((sum, item) => sum + item.stock, 0) || product.inventory.reduce((sum, item) => sum + item.stock, 0);
  if (stock <= 0) throw new Error("Product is out of stock.");
  return { product, variant, stock };
}

export async function addCartItem(userId: string, input: { productId: string; variantId?: string; quantity: number }) {
  const cart = await getOrCreateCart(userId);
  const { variant, stock } = await getActiveProduct(input.productId, input.variantId);
  const existing = await db.cartItem.findUnique({
    where: { cartId_productId_variantId: { cartId: cart.id, productId: input.productId, variantId: variant.id } },
  });
  const nextQuantity = (existing?.quantity ?? 0) + input.quantity;
  if (nextQuantity > stock) throw new Error("Requested quantity exceeds available stock.");

  if (existing) {
    await db.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQuantity, unitPriceSnapshot: variant.price } });
  } else {
    await db.cartItem.create({
      data: {
        cartId: cart.id,
        productId: input.productId,
        variantId: variant.id,
        quantity: input.quantity,
        unitPriceSnapshot: variant.price,
      },
    });
  }
  return mapCart(await loadCart(cart.id));
}

export async function updateCartItem(userId: string, itemId: string, quantity: number) {
  const cart = await getOrCreateCart(userId);
  const item = await db.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
    include: { product: { include: { inventory: true } } },
  });
  if (!item) throw new Error("Cart item not found.");
  if (quantity <= 0) {
    await db.cartItem.delete({ where: { id: item.id } });
    return mapCart(await loadCart(cart.id));
  }
  const stock = productStock(item.product as any, item.variantId);
  if (quantity > stock) throw new Error("Requested quantity exceeds available stock.");
  await db.cartItem.update({ where: { id: item.id }, data: { quantity } });
  return mapCart(await loadCart(cart.id));
}

export async function removeCartItem(userId: string, itemId: string) {
  const cart = await getOrCreateCart(userId);
  await db.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
  return mapCart(await loadCart(cart.id));
}

export async function clearCart(userId: string) {
  const cart = await getOrCreateCart(userId);
  await db.cartItem.deleteMany({ where: { cartId: cart.id } });
  await db.cart.update({ where: { id: cart.id }, data: { couponId: null } });
  return mapCart(await loadCart(cart.id));
}

export async function validateCouponForCart(userId: string, code: string, apply = true) {
  const cart = await getOrCreateCart(userId);
  const current = mapCart(cart);
  const coupon = await db.coupon.findFirst({ where: { code, deletedAt: null } });
  if (!coupon) throw new Error("Invalid coupon code.");
  if (!coupon.active) throw new Error("Coupon is not active.");
  const now = new Date();
  if (coupon.startAt > now || coupon.endAt < now) throw new Error("Coupon is expired or not yet active.");
  if (current.subtotal < decimal(coupon.minOrderAmount)) throw new Error(`Minimum order amount is Rs ${decimal(coupon.minOrderAmount)}.`);
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) throw new Error("Coupon usage limit has been reached.");
  if (coupon.perUserLimit != null) {
    const userUsage = await db.couponUsage.count({ where: { couponId: coupon.id, userId } });
    if (userUsage >= coupon.perUserLimit) throw new Error("Coupon usage limit for this customer has been reached.");
  }

  const deliveryBeforeCoupon = current.subtotal && current.subtotal <= 799 ? 49 : 0;
  const discountAmount = couponDiscount(coupon, current.subtotal, deliveryBeforeCoupon);
  const updated = apply ? await db.cart.update({ where: { id: cart.id }, data: { couponId: coupon.id }, include: cartInclude }) : cart;
  return {
    valid: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      title: coupon.title,
      type: coupon.type,
      value: decimal(coupon.value),
    },
    discountAmount,
    cart: mapCart(updated),
    message: `${coupon.code} applied`,
  };
}

export async function removeCartCoupon(userId: string) {
  const cart = await getOrCreateCart(userId);
  return mapCart(await db.cart.update({ where: { id: cart.id }, data: { couponId: null }, include: cartInclude }));
}
