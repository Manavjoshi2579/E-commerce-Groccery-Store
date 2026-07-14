"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { products as seedProducts } from "@/data/products";
import { fetchProducts } from "@/services/catalog";
import {
  addBackendCartItem,
  addBackendWishlistItem,
  applyBackendCoupon,
  clearBackendCart,
  fetchAvailableCoupons,
  getBackendCart,
  getBackendWishlist,
  moveBackendWishlistToCart,
  removeBackendCartItem,
  removeBackendWishlistItem,
  updateBackendCartItem,
} from "@/services/commerce";
import {
  createAddress as createBackendAddress,
  deleteAddress as deleteBackendAddress,
  fetchAddresses,
  fetchOrders,
  placeCodOrder,
  reorderBackend,
  updateAddress as updateBackendAddress,
} from "@/services/checkout";
import {
  getAdminMe,
  verifyAdminMfa as verifyBackendAdminMfa,
  getCustomerMe,
  loginAdmin as loginBackendAdmin,
  loginCustomer as loginBackendCustomer,
  logoutAdmin as logoutBackendAdmin,
  logoutCustomer as logoutBackendCustomer,
  resetAdminProfile as resetBackendAdminProfile,
  resetCustomerProfile as resetBackendCustomerProfile,
  registerCustomer as registerBackendCustomer,
  updateAdminProfile as updateBackendAdminProfile,
  updateCustomerProfile as updateBackendCustomerProfile,
  type AdminSession,
  type CustomerSession,
} from "@/services/auth";
import type { Address, CartItem, Coupon, Order, OrderStatus, Product } from "@/types";
import { uid } from "@/lib/money";

type Toast = { id: string; message: string; tone?: "success" | "error" | "info" };

function rememberPlacedOrder(order: Order) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem("eagle-last-order", JSON.stringify(order));
}

type Store = {
  products: Product[];
  cart: CartItem[];
  wishlist: string[];
  orders: Order[];
  addresses: Address[];
  coupons: Coupon[];
  couponCode: string;
  customer: CustomerSession | null;
  admin: AdminSession | null;
  authReady: boolean;
  adminReady: boolean;
  toast: (message: string, tone?: Toast["tone"]) => void;
  refreshCustomerData: () => Promise<void>;
  refreshCustomerProfile: () => Promise<CustomerSession>;
  loginCustomer: (input: { email: string; password: string }) => Promise<CustomerSession>;
  registerCustomer: (input: { name: string; email: string; phone: string; password: string; terms?: boolean }) => Promise<CustomerSession>;
  updateCustomerProfile: (input: { name?: string; phone?: string }) => Promise<CustomerSession>;
  logoutCustomer: () => Promise<void>;
  loginAdmin: (input: { email: string; password: string }) => Promise<AdminSession | { mfaRequired: true; challengeId: string }>;
  verifyAdminMfa: (input: { challengeId: string; code: string }) => Promise<AdminSession>;
  refreshAdminProfile: () => Promise<AdminSession>;
  updateAdminProfile: (input: { name?: string }) => Promise<AdminSession>;
  logoutAdmin: () => Promise<void>;
  addToCart: (id: string, qty?: number, variantId?: string, custom?: { unit?: string; price?: number; mrp?: number }) => void;
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
  placeBackendCodOrder: (input: { addressId: string; deliverySlotId?: string | null; deliveryDate: string; fulfillmentType?: "DELIVERY" | "PICKUP" }) => Promise<Order>;
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
  deleteCoupon: (idOrCode: string) => void;
  replaceCoupons: (coupons: Coupon[]) => void;
};

const AppContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [customer, setCustomer] = useState<CustomerSession | null>(null);
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [backendCommerce, setBackendCommerce] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [adminReady, setAdminReady] = useState(false);

  useEffect(() => {
    fetchProducts({ limit: 60 }).then((result) => {
      const ids = new Set(result.products.map((product) => product.id));
      setProducts(result.products);
      setCart((items) => items.filter((item) => ids.has(item.productId)));
      setWishlist((items) => items.filter((id) => ids.has(id)));
    }).catch((error) => toast(error instanceof Error ? error.message : "Unable to load products. Database connection is unavailable.", "error"));
  }, []);

  useEffect(() => {
    fetchAvailableCoupons().then(setCoupons).catch(() => undefined);
  }, []);

  const applyBackendCart = useCallback((summary: Awaited<ReturnType<typeof getBackendCart>>) => {
    setBackendCommerce(true);
    setProducts((items) => {
      const existing = new Map(items.map((item) => [item.id, item]));
      summary.products.forEach((product) => existing.set(product.id, product));
      return Array.from(existing.values());
    });
    setCart(summary.items);
    setCouponCode(summary.appliedCoupon?.code || "");
  }, []);

  const applyBackendWishlist = useCallback((summary: Awaited<ReturnType<typeof getBackendWishlist>>) => {
    setBackendCommerce(true);
    setProducts((items) => {
      const existing = new Map(items.map((item) => [item.id, item]));
      summary.items.forEach((item: { productId: string; product: Product }) => existing.set(item.productId, item.product));
      return Array.from(existing.values());
    });
    setWishlist(summary.items.map((item: { productId: string }) => item.productId));
  }, []);

  const clearCustomerState = useCallback(() => {
    setCustomer(null);
    setCart([]);
    setWishlist([]);
    setOrders([]);
    setAddresses([]);
    setCouponCode("");
    setBackendCommerce(false);
  }, []);

  const loadCustomerData = useCallback(async () => {
    const [cartSummary, wishlistSummary, remoteAddresses, remoteOrders] = await Promise.all([
      getBackendCart(),
      getBackendWishlist(),
      fetchAddresses(),
      fetchOrders(),
    ]);
    applyBackendCart(cartSummary);
    applyBackendWishlist(wishlistSummary);
    setAddresses(remoteAddresses);
    setOrders(remoteOrders);
  }, [applyBackendCart, applyBackendWishlist]);

  useEffect(() => {
    getCustomerMe()
      .then(async (user) => {
        setCustomer(user);
        await loadCustomerData();
      })
      .catch(() => clearCustomerState())
      .finally(() => setAuthReady(true));
    getAdminMe()
      .then(setAdmin)
      .catch(() => setAdmin(null))
      .finally(() => setAdminReady(true));
  }, [clearCustomerState, loadCustomerData]);

  useEffect(() => {
    if (!customer) return;
    Promise.all([fetchAddresses(), fetchOrders()])
      .then(([remoteAddresses, remoteOrders]) => {
        if (remoteAddresses.length) setAddresses(remoteAddresses);
        if (remoteOrders.length) setOrders(remoteOrders);
      })
      .catch(() => undefined);
  }, [customer]);

  const toast = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = uid("toast");
    setToasts((items) => [...items.filter((item) => item.message !== message || item.tone !== tone).slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 2600);
  }, []);

  const requireCustomerLogin = () => {
    if (customer) return true;
    if (!authReady) {
      toast("Checking your session. Please try again in a moment.", "info");
      return false;
    }
    toast("Please login first to continue shopping.", "error");
    if (typeof window !== "undefined") {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.setTimeout(() => { window.location.href = `/login?next=${next}`; }, 350);
    }
    return false;
  };

  const value = useMemo<Store>(() => ({
    products,
    cart,
    wishlist,
    orders,
    addresses,
    coupons,
    couponCode,
    customer,
    admin,
    authReady,
    adminReady,
    toast,
    refreshCustomerData: loadCustomerData,
    refreshCustomerProfile: async () => {
      const user = await resetBackendCustomerProfile();
      setCustomer(user);
      toast("Profile reset in database", "info");
      return user;
    },
    loginCustomer: async (input) => {
      const user = await loginBackendCustomer(input);
      setCustomer(user);
      await loadCustomerData();
      toast("Login successful", "success");
      return user;
    },
    registerCustomer: async (input) => {
      const user = await registerBackendCustomer(input);
      setCustomer(user);
      await loadCustomerData();
      toast("Account created", "success");
      return user;
    },
    updateCustomerProfile: async (input) => {
      if (!requireCustomerLogin()) throw new Error("Please login first to update your profile.");
      const user = await updateBackendCustomerProfile(input);
      setCustomer(user);
      toast("Profile updated", "success");
      return user;
    },
    logoutCustomer: async () => {
      await logoutBackendCustomer().catch(() => undefined);
      clearCustomerState();
      toast("Logged out");
    },
    loginAdmin: async (input) => {
      const result = await loginBackendAdmin(input);
      if (result.mfaRequired && result.challengeId) {
        toast("Enter your verification code", "info");
        return { mfaRequired: true, challengeId: result.challengeId };
      }
      const nextAdmin = result.admin;
      if (!nextAdmin) throw new Error("Admin login failed.");
      setAdmin(nextAdmin);
      setAdminReady(true);
      toast("Admin login successful", "success");
      return nextAdmin;
    },
    verifyAdminMfa: async (input) => {
      const nextAdmin = await verifyBackendAdminMfa(input);
      setAdmin(nextAdmin);
      setAdminReady(true);
      toast("Admin login successful", "success");
      return nextAdmin;
    },
    refreshAdminProfile: async () => {
      const nextAdmin = await resetBackendAdminProfile();
      setAdmin(nextAdmin);
      toast("Admin profile reset in database", "info");
      return nextAdmin;
    },
    updateAdminProfile: async (input) => {
      const nextAdmin = await updateBackendAdminProfile(input);
      setAdmin(nextAdmin);
      toast("Admin profile updated", "success");
      return nextAdmin;
    },
    logoutAdmin: async () => {
      await logoutBackendAdmin().catch(() => undefined);
      setAdmin(null);
      setAdminReady(true);
      toast("Admin logged out");
    },
    addToCart: (id, qty = 1, variantId, custom) => {
      if (!requireCustomerLogin()) return;
      const product = products.find((item) => item.id === id);
      const selectedVariant = variantId ? product?.variants?.find((variant) => variant.id === variantId) : product?.variants?.find((variant) => variant.active !== false) || product?.variants?.[0];
      const selectedVariantId = selectedVariant?.id || variantId;
      const existingQty = cart.find((item) => item.productId === id && (selectedVariantId ? item.variantId === selectedVariantId : true))?.qty || 0;
      const availableStock = selectedVariant?.stock ?? product?.stock ?? 0;
      if (!product || product.active === false) {
        toast("Product is not available.", "error");
        return;
      }
      if (availableStock <= 0) {
        toast("Product is out of stock.", "error");
        return;
      }
      if (existingQty + qty > availableStock) {
        toast(`Only ${availableStock} units available for ${selectedVariant?.unit || product.unit}.`, "error");
        return;
      }
      const previousCart = cart;
      setCart((items) => {
        const hit = items.find((item) => item.productId === id && (selectedVariantId ? item.variantId === selectedVariantId : true));
        if (hit) return items.map((item) => (item === hit ? { ...item, qty: item.qty + qty } : item));
        return [...items, { productId: id, variantId: selectedVariantId, qty, name: product.name, sku: selectedVariant?.sku || product.sku, unit: custom?.unit || selectedVariant?.unit || product.unit, mrp: custom?.mrp ?? selectedVariant?.mrp ?? product.mrp, price: custom?.price ?? selectedVariant?.price ?? product.price, lineTotal: (custom?.price ?? selectedVariant?.price ?? product.price) * qty }];
      });
      addBackendCartItem(id, qty, selectedVariantId, custom).then((summary) => {
        applyBackendCart(summary);
        toast("Added to cart", "success");
      }).catch((error) => {
        setCart(previousCart);
        toast(error instanceof Error ? error.message : "Could not update backend cart", "error");
      });
    },
    setQty: (id, qty) => {
      if (!requireCustomerLogin()) return;
      const current = cart.find((item) => item.productId === id || item.id === id);
      if (current?.id) {
        updateBackendCartItem(current.id, qty).then(applyBackendCart).catch((error) => {
          toast(error instanceof Error ? error.message : "Could not update cart quantity", "error");
        });
      }
    },
    removeFromCart: (id) => {
      if (!requireCustomerLogin()) return;
      const current = cart.find((item) => item.productId === id || item.id === id);
      if (current?.id) {
        const previousCart = cart;
        setCart((items) => items.filter((item) => item.id !== current.id && item.productId !== id));
        removeBackendCartItem(current.id).then((summary) => {
          applyBackendCart(summary);
          toast("Removed from cart");
        }).catch((error) => {
          setCart(previousCart);
          toast(error instanceof Error ? error.message : "Could not remove cart item", "error");
        });
      }
    },
    toggleWishlist: (id) => {
      if (!requireCustomerLogin()) return;
      const exists = wishlist.includes(id);
      const action = exists ? removeBackendWishlistItem(id) : addBackendWishlistItem(id);
      const previousWishlist = wishlist;
      setWishlist((items) => (exists ? items.filter((item) => item !== id) : [...items, id]));
      action.then((summary) => {
        applyBackendWishlist(summary);
        toast("Wishlist updated", "success");
      }).catch((error) => {
        setWishlist(previousWishlist);
        toast(error instanceof Error ? error.message : "Could not update wishlist", "error");
      });
    },
    moveWishlistToCart: (id) => {
      if (!requireCustomerLogin()) return;
      moveBackendWishlistToCart(id).then((result) => {
        applyBackendWishlist(result.wishlist);
        applyBackendCart(result.cart);
        toast("Moved to cart", "success");
      }).catch((error) => {
        toast(error instanceof Error ? error.message : "Could not move wishlist item", "error");
      });
    },
    applyCoupon: (code) => {
      if (!requireCustomerLogin()) return false;
      const normalized = code.trim().toUpperCase();
      const coupon = coupons.find((item) => item.code === normalized && item.active);
      if (!coupon) {
        applyBackendCoupon(normalized).then((result) => {
          if (!result.valid) {
            toast(result.message || "Invalid coupon code", "error");
            return;
          }
          setCouponCode(normalized);
          if (result.coupon) {
            const nextCoupon = result.coupon;
            setCoupons((items) => [nextCoupon, ...items.filter((item) => item.code !== nextCoupon.code)]);
          }
          applyBackendCart(result.cart);
          toast(`${normalized} applied`, "success");
        }).catch((error) => toast(error instanceof Error ? error.message : "Invalid coupon code", "error"));
        return true;
      }
      applyBackendCoupon(normalized).then((result) => {
        if (!result.valid) {
          toast(result.message, "error");
          return;
        }
        setCouponCode(normalized);
        applyBackendCart(result.cart);
        toast(`${normalized} applied`, "success");
      }).catch((error) => toast(error instanceof Error ? error.message : "Could not apply coupon", "error"));
      return true;
    },
    clearCoupon: () => setCouponCode(""),
    clearCart: () => {
      clearBackendCart().then((summary) => {
        applyBackendCart(summary);
        setCouponCode("");
      }).catch((error) => toast(error instanceof Error ? error.message : "Could not clear cart", "error"));
    },
    addAddress: (address) => {
      createBackendAddress(address).then((saved) => {
        setAddresses((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
        toast("Address saved", "success");
      }).catch((error) => toast(error instanceof Error ? error.message : "Could not save address.", "error"));
    },
    updateAddress: (address) => {
      updateBackendAddress(address).then((saved) => {
        setAddresses((items) => items.map((item) => (item.id === saved.id ? saved : item)));
        toast("Address updated", "success");
      }).catch((error) => toast(error instanceof Error ? error.message : "Could not update address.", "error"));
    },
    deleteAddress: (id) => {
      deleteBackendAddress(id).then(() => setAddresses((items) => items.filter((item) => item.id !== id))).catch((error) => toast(error instanceof Error ? error.message : "Could not delete address.", "error"));
    },
    placeOrder: (input) => {
      throw new Error("Checkout requires a live database connection. Please try again when the backend is available.");
    },
    placeBackendCodOrder: async (input) => {
      const order = await placeCodOrder(input);
      setOrders((items) => [order, ...items.filter((item) => item.orderNumber !== order.orderNumber)]);
      setCart([]);
      setCouponCode("");
      rememberPlacedOrder(order);
      toast("Order placed successfully", "success");
      return order;
    },
    reorder: (order) => {
      reorderBackend(order.orderNumber).then(() => loadCustomerData()).then(() => toast("Order items added to cart", "success")).catch((error) => toast(error instanceof Error ? error.message : "Could not reorder.", "error"));
    },
    addProduct: (product) => {
      setProducts((items) => [product, ...items]);
    },
    updateProduct: (product) => setProducts((items) => items.map((item) => (item.id === product.id ? product : item))),
    deleteProduct: (id) => setProducts((items) => items.filter((item) => item.id !== id)),
    replaceProducts: (nextProducts) => setProducts(nextProducts),
    adjustStock: (id, stock) => setProducts((items) => items.map((item) => (item.id === id ? { ...item, stock } : item))),
    updateOrderStatus: (orderNumber, status) => {
      setOrders((items) => items.map((item) => (item.orderNumber === orderNumber ? { ...item, status } : item)));
    },
    assignDeliveryStaff: (orderNumber, staff) => {
      setOrders((items) => items.map((item) => (item.orderNumber === orderNumber ? { ...item, deliveryStaff: staff } : item)));
    },
    addCoupon: (coupon) => {
      setCoupons((items) => [coupon, ...items.filter((item) => item.code !== coupon.code)]);
    },
    updateCoupon: (coupon) => {
      setCoupons((items) => items.map((item) => (item.code === coupon.code ? coupon : item)));
    },
    deleteCoupon: (idOrCode) => {
      setCoupons((items) => {
        const removed = items.find((item) => item.id === idOrCode || item.code === idOrCode);
        if (removed) setCouponCode((current) => (current === removed.code ? "" : current));
        return items.filter((item) => item.id !== idOrCode && item.code !== idOrCode);
      });
    },
    replaceCoupons: (nextCoupons) => setCoupons(nextCoupons),
  }), [products, cart, wishlist, orders, addresses, coupons, couponCode, customer, admin, authReady, adminReady, loadCustomerData, clearCustomerState, backendCommerce, applyBackendCart, applyBackendWishlist]);

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="fixed bottom-6 right-4 z-[100] max-w-sm space-y-2 no-print">
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
