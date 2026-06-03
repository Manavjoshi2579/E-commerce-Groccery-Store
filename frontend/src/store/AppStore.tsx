"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { coupons as seedCoupons } from "@/data/coupons";
import { initialOrders } from "@/data/orders";
import { products as seedProducts } from "@/data/products";
import { fetchProducts } from "@/services/catalog";
import {
  addBackendCartItem,
  addBackendWishlistItem,
  applyBackendCoupon,
  clearBackendCart,
  getBackendCart,
  getBackendWishlist,
  moveBackendWishlistToCart,
  removeBackendCartItem,
  removeBackendWishlistItem,
  updateBackendCartItem,
} from "@/services/commerce";
import { defaultAddresses } from "@/data/users";
import type { Address, CartItem, Coupon, Order, OrderStatus, Product } from "@/types";
import { uid } from "@/lib/money";

type Toast = { id: string; message: string; tone?: "success" | "error" | "info" };

type Store = {
  products: Product[];
  cart: CartItem[];
  wishlist: string[];
  orders: Order[];
  addresses: Address[];
  coupons: Coupon[];
  couponCode: string;
  toast: (message: string, tone?: Toast["tone"]) => void;
  addToCart: (id: string, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  removeFromCart: (id: string) => void;
  toggleWishlist: (id: string) => void;
  moveWishlistToCart: (id: string) => void;
  applyCoupon: (code: string) => boolean;
  clearCoupon: () => void;
  clearCart: () => void;
  addAddress: (address: Omit<Address, "id">) => void;
  updateAddress: (address: Address) => void;
  deleteAddress: (id: string) => void;
  placeOrder: (input: Pick<Order, "address" | "deliveryDate" | "deliverySlot" | "paymentMethod" | "paymentStatus">) => Order;
  reorder: (order: Order) => void;
  addProduct: (product: Product) => void;
  updateProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  replaceProducts: (products: Product[]) => void;
  adjustStock: (id: string, stock: number) => void;
  updateOrderStatus: (orderNumber: string, status: OrderStatus) => void;
  assignDeliveryStaff: (orderNumber: string, staff: string) => void;
  addCoupon: (coupon: Coupon) => void;
  updateCoupon: (coupon: Coupon) => void;
};

const AppContext = createContext<Store | null>(null);

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [cart, setCart] = useState<CartItem[]>([{ productId: "prd-1", qty: 2 }, { productId: "prd-13", qty: 1 }]);
  const [wishlist, setWishlist] = useState<string[]>(["prd-5", "prd-17"]);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [addresses, setAddresses] = useState<Address[]>(defaultAddresses);
  const [coupons, setCoupons] = useState<Coupon[]>(seedCoupons);
  const [couponCode, setCouponCode] = useState("");
  const [backendCommerce, setBackendCommerce] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setProducts(read("ec-products", seedProducts));
      setCart(read("ec-cart", [{ productId: "prd-1", qty: 2 }, { productId: "prd-13", qty: 1 }]));
      setWishlist(read("ec-wishlist", ["prd-5", "prd-17"]));
      setOrders(read("ec-orders", initialOrders));
      setAddresses(read("ec-addresses", defaultAddresses));
      setCoupons(read("ec-coupons", seedCoupons));
      setCouponCode(read("ec-coupon", ""));
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    fetchProducts({ limit: 60 }).then((result) => {
      if (result.source !== "api") return;
      const ids = new Set(result.products.map((product) => product.id));
      setProducts(result.products);
      setCart((items) => items.filter((item) => ids.has(item.productId)));
      setWishlist((items) => items.filter((id) => ids.has(id)));
    });
  }, []);

  const applyBackendCart = (summary: Awaited<ReturnType<typeof getBackendCart>>) => {
    setBackendCommerce(true);
    setProducts((items) => {
      const existing = new Map(items.map((item) => [item.id, item]));
      summary.products.forEach((product) => existing.set(product.id, product));
      return Array.from(existing.values());
    });
    setCart(summary.items);
    setCouponCode(summary.appliedCoupon?.code || "");
  };

  const applyBackendWishlist = (summary: Awaited<ReturnType<typeof getBackendWishlist>>) => {
    setBackendCommerce(true);
    setProducts((items) => {
      const existing = new Map(items.map((item) => [item.id, item]));
      summary.items.forEach((item: { productId: string; product: Product }) => existing.set(item.productId, item.product));
      return Array.from(existing.values());
    });
    setWishlist(summary.items.map((item: { productId: string }) => item.productId));
  };

  useEffect(() => {
    Promise.all([getBackendCart(), getBackendWishlist()])
      .then(([cartSummary, wishlistSummary]) => {
        applyBackendCart(cartSummary);
        applyBackendWishlist(wishlistSummary);
      })
      .catch(() => setBackendCommerce(false));
  }, []);

  useEffect(() => { if (hydrated) localStorage.setItem("ec-products", JSON.stringify(products)); }, [hydrated, products]);
  useEffect(() => { if (hydrated) localStorage.setItem("ec-cart", JSON.stringify(cart)); }, [hydrated, cart]);
  useEffect(() => { if (hydrated) localStorage.setItem("ec-wishlist", JSON.stringify(wishlist)); }, [hydrated, wishlist]);
  useEffect(() => { if (hydrated) localStorage.setItem("ec-orders", JSON.stringify(orders)); }, [hydrated, orders]);
  useEffect(() => { if (hydrated) localStorage.setItem("ec-addresses", JSON.stringify(addresses)); }, [hydrated, addresses]);
  useEffect(() => { if (hydrated) localStorage.setItem("ec-coupons", JSON.stringify(coupons)); }, [hydrated, coupons]);
  useEffect(() => { if (hydrated) localStorage.setItem("ec-coupon", JSON.stringify(couponCode)); }, [hydrated, couponCode]);

  const toast = (message: string, tone: Toast["tone"] = "info") => {
    const id = uid("toast");
    setToasts((items) => [...items, { id, message, tone }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 2600);
  };

  const value = useMemo<Store>(() => ({
    products,
    cart,
    wishlist,
    orders,
    addresses,
    coupons,
    couponCode,
    toast,
    addToCart: (id, qty = 1) => {
      setCart((items) => {
        const hit = items.find((item) => item.productId === id);
        return hit ? items.map((item) => (item.productId === id ? { ...item, qty: item.qty + qty } : item)) : [...items, { productId: id, qty }];
      });
      toast("Added to cart", "success");
      addBackendCartItem(id, qty).then(applyBackendCart).catch((error) => {
        if (backendCommerce) toast(error instanceof Error ? error.message : "Could not update backend cart", "error");
      });
    },
    setQty: (id, qty) => {
      const current = cart.find((item) => item.productId === id || item.id === id);
      setCart((items) => (qty <= 0 ? items.filter((item) => item.productId !== id && item.id !== id) : items.map((item) => (item.productId === id || item.id === id ? { ...item, qty } : item))));
      if (current?.id) {
        updateBackendCartItem(current.id, qty).then(applyBackendCart).catch((error) => {
          if (backendCommerce) toast(error instanceof Error ? error.message : "Could not update cart quantity", "error");
        });
      }
    },
    removeFromCart: (id) => {
      const current = cart.find((item) => item.productId === id || item.id === id);
      setCart((items) => items.filter((item) => item.productId !== id && item.id !== id));
      toast("Removed from cart");
      if (current?.id) {
        removeBackendCartItem(current.id).then(applyBackendCart).catch((error) => {
          if (backendCommerce) toast(error instanceof Error ? error.message : "Could not remove cart item", "error");
        });
      }
    },
    toggleWishlist: (id) => {
      const exists = wishlist.includes(id);
      setWishlist((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]));
      toast("Wishlist updated", "success");
      const action = exists ? removeBackendWishlistItem(id) : addBackendWishlistItem(id);
      action.then(applyBackendWishlist).catch((error) => {
        if (backendCommerce) toast(error instanceof Error ? error.message : "Could not update wishlist", "error");
      });
    },
    moveWishlistToCart: (id) => {
      setWishlist((items) => items.filter((item) => item !== id));
      setCart((items) => [...items, { productId: id, qty: 1 }]);
      toast("Moved to cart", "success");
      moveBackendWishlistToCart(id).then((result) => {
        applyBackendWishlist(result.wishlist);
        applyBackendCart(result.cart);
      }).catch((error) => {
        if (backendCommerce) toast(error instanceof Error ? error.message : "Could not move wishlist item", "error");
      });
    },
    applyCoupon: (code) => {
      const normalized = code.trim().toUpperCase();
      const coupon = coupons.find((item) => item.code === normalized && item.active);
      if (!coupon) {
        toast("Invalid coupon code", "error");
        return false;
      }
      setCouponCode(normalized);
      toast(`${normalized} applied`, "success");
      applyBackendCoupon(normalized).then((result) => {
        if (!result.valid) {
          toast(result.message, "error");
          return;
        }
        applyBackendCart(result.cart);
        toast(result.message, "success");
      }).catch((error) => {
        if (backendCommerce) toast(error instanceof Error ? error.message : "Could not apply coupon", "error");
      });
      return true;
    },
    clearCoupon: () => setCouponCode(""),
    clearCart: () => {
      setCart([]);
      setCouponCode("");
      clearBackendCart().then(applyBackendCart).catch(() => undefined);
    },
    addAddress: (address) => {
      setAddresses((items) => [...items, { ...address, id: uid("addr") }]);
      toast("Address saved", "success");
    },
    updateAddress: (address) => {
      setAddresses((items) => items.map((item) => (item.id === address.id ? address : item)));
      toast("Address updated", "success");
    },
    deleteAddress: (id) => setAddresses((items) => items.filter((item) => item.id !== id)),
    placeOrder: (input) => {
      const order: Order = {
        orderNumber: uid("EC"),
        customerName: input.address.name,
        items: cart,
        address: input.address,
        deliveryDate: input.deliveryDate,
        deliverySlot: input.deliverySlot,
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentStatus,
        status: "Placed",
        createdAt: new Date().toISOString(),
        couponCode,
        deliveryStaff: "Rohan Patel",
      };
      setOrders((items) => [order, ...items]);
      setCart([]);
      setCouponCode("");
      toast("Order placed successfully", "success");
      return order;
    },
    reorder: (order) => {
      setCart(order.items);
      toast("Order items added to cart", "success");
    },
    addProduct: (product) => {
      setProducts((items) => [product, ...items]);
      toast("Product added", "success");
    },
    updateProduct: (product) => setProducts((items) => items.map((item) => (item.id === product.id ? product : item))),
    deleteProduct: (id) => setProducts((items) => items.filter((item) => item.id !== id)),
    replaceProducts: (nextProducts) => setProducts(nextProducts),
    adjustStock: (id, stock) => setProducts((items) => items.map((item) => (item.id === id ? { ...item, stock } : item))),
    updateOrderStatus: (orderNumber, status) => {
      setOrders((items) => items.map((item) => (item.orderNumber === orderNumber ? { ...item, status } : item)));
      toast("Order status updated", "success");
    },
    assignDeliveryStaff: (orderNumber, staff) => {
      setOrders((items) => items.map((item) => (item.orderNumber === orderNumber ? { ...item, deliveryStaff: staff } : item)));
      toast(`${staff} assigned`, "success");
    },
    addCoupon: (coupon) => {
      setCoupons((items) => [coupon, ...items.filter((item) => item.code !== coupon.code)]);
      toast("Coupon added", "success");
    },
    updateCoupon: (coupon) => {
      setCoupons((items) => items.map((item) => (item.code === coupon.code ? coupon : item)));
      toast("Coupon updated", "success");
    },
  }), [products, cart, wishlist, orders, addresses, coupons, couponCode]);

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[100] space-y-2 no-print">
        {toasts.map((item) => (
          <div key={item.id} className={`rounded-md px-4 py-3 text-sm font-semibold shadow-xl ${item.tone === "error" ? "bg-red-600 text-white" : item.tone === "success" ? "bg-green-700 text-white" : "bg-black text-white"}`}>
            {item.message}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useStore() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
