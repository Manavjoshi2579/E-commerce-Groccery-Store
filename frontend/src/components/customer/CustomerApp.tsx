"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, BadgePercent, ChevronRight, CreditCard, Eye, EyeOff, Heart, Home, LogOut, MapPin, Menu, Minus, PackageCheck,
  Plus, Search, ShieldCheck, ShoppingBag, Star, Truck, User, X, FileText, RotateCcw, MessageCircle,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/common/Button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StoreProvider, useStore } from "@/store/AppStore";
import { categories } from "@/data/categories";
import { deliverySlots } from "@/data/delivery";
import { fetchCategories, fetchProduct, fetchProducts } from "@/services/catalog";
import { checkPincode, checkoutSummary, fetchAdminOrder, fetchOrder, fetchOrders, fetchTracking, fetchDeliverySlots, requestReturnBackend, reverseGeocodeLocation } from "@/services/checkout";
import { faqCategories, fetchFaqs } from "@/services/faqs";
import { createRazorpayOrder, loadRazorpayScript, markRazorpayFailed, verifyRazorpayPayment, type RazorpayCreateOrderResponse } from "@/services/payments";
import { createSupportTicket, fetchSupportTickets } from "@/services/support";
import { money } from "@/lib/money";
import type { Address, CartItem, Category, FAQ, Order, Product, SupportTicket } from "@/types";

const imageFallback = "/assets/placeholders/product-placeholder-generated.png";

type StoreCoupons = ReturnType<typeof useStore>["coupons"];

function totals(items: CartItem[], products: Product[], coupons: StoreCoupons, couponCode = "") {
  const subtotal = items.reduce((sum, item) => sum + itemPrice(item, products) * item.qty, 0);
  const mrp = items.reduce((sum, item) => sum + itemMrp(item, products) * item.qty, 0);
  const coupon = coupons.find((item) => item.code === couponCode);
  const couponDiscount = coupon && subtotal >= coupon.minOrder ? coupon.discountType === "percent" ? Math.round(subtotal * (coupon.value / 100)) : coupon.value : 0;
  const gst = Math.round(subtotal * 0.05);
  const delivery = subtotal > 799 || coupon?.discountType === "shipping" ? 0 : 49;
  const handling = subtotal ? 12 : 0;
  return { subtotal, mrp, discount: Math.max(0, mrp - subtotal), couponDiscount, gst, delivery, handling, total: Math.max(0, subtotal - couponDiscount + gst + delivery + handling) };
}

function activeVariants(product: Product) {
  return (product.variants?.length ? product.variants : [{ unit: product.unit, mrp: product.mrp, price: product.price, stock: product.stock, active: product.active }]).filter((variant) => variant.active !== false);
}

function defaultVariant(product: Product) {
  const variants = activeVariants(product);
  return variants.find((variant) => variant.isDefault) || variants[0];
}

function itemVariant(item: CartItem, product?: Product) {
  return item.variantId ? product?.variants?.find((variant) => variant.id === item.variantId) : undefined;
}

function itemPrice(item: CartItem, products: Product[]) {
  const product = products.find((p) => p.id === item.productId);
  return item.price ?? itemVariant(item, product)?.price ?? product?.price ?? 0;
}

function itemMrp(item: CartItem, products: Product[]) {
  const product = products.find((p) => p.id === item.productId);
  return item.mrp ?? itemVariant(item, product)?.mrp ?? product?.mrp ?? itemPrice(item, products);
}

function itemUnit(item: CartItem, product?: Product) {
  return item.unit || itemVariant(item, product)?.unit || product?.unit || "";
}

function itemLineTotal(item: CartItem, products: Product[]) {
  return item.lineTotal ?? itemPrice(item, products) * item.qty;
}

function normalizeUnit(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace("kilogram", "kg").replace("grams", "g").replace("gram", "g").replace("litre", "l").replace("liter", "l").replace("millilitre", "ml").replace("milliliter", "ml").replace("pieces", "pcs").replace("piece", "pc");
}

function parseUnitAmount(value: string) {
  const match = normalizeUnit(value).match(/^(\d+(?:\.\d+)?)(kg|g|l|ml|pcs|pc)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2] === "pcs" ? "pc" : match[2];
  const base = unit === "kg" ? amount * 1000 : unit === "g" ? amount : unit === "l" ? amount * 1000 : unit === "ml" ? amount : amount;
  const family = unit === "kg" || unit === "g" ? "weight" : unit === "l" || unit === "ml" ? "volume" : "piece";
  return { amount, unit, base, family };
}

function priceForUnit(baseUnit: string, requestedUnit: string, price: number, mrp: number) {
  const base = parseUnitAmount(baseUnit);
  const requested = parseUnitAmount(requestedUnit);
  if (!base || !requested || base.family !== requested.family) return null;
  const ratio = requested.base / base.base;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return { price: Math.max(1, Math.round(price * ratio)), mrp: Math.max(1, Math.round(mrp * ratio)), ratio };
}

function canShowInvoice(order: Order) {
  return order.paymentStatus !== "Failed";
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

const categoryDescriptions: Record<string, string> = {
  "Fruits & Vegetables": "Daily farm produce, greens, roots, and premium fruit picks.",
  "Dairy, Bread & Eggs": "Fresh milk, butter, paneer, bread, and breakfast staples.",
  "Atta, Rice & Dal": "Trusted grains, flours, pulses, and pantry foundations.",
  "Masala & Oil": "Cooking oils, spices, salts, and essentials for Indian kitchens.",
  "Snacks & Beverages": "Tea, biscuits, juices, namkeen, and quick refreshment picks.",
  "Packaged Food": "Family packs, noodles, ready pantry refills, and packaged staples.",
  "Household Essentials": "Cleaning, laundry, hygiene, and home-care supplies.",
  "Personal Care": "Everyday care, oral care, handwash, and grooming essentials.",
  "Organic Store": "Premium, local, and better-for-you grocery choices.",
  "Baby Care": "Gentle essentials for babies and young families.",
};

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function searchDistance(a: string, b: string) {
  if (!a || !b) return Math.max(a.length, b.length);
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

function productMatchesSearch(product: Product, query: string) {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;
  const queryParts = normalized.split(" ").filter(Boolean);
  const expanded = new Set(queryParts);
  queryParts.forEach((part) => {
    Object.entries(relatedSearchTerms).forEach(([term, aliases]) => {
      if (term === part || aliases.includes(part) || searchDistance(term, part) <= 2) {
        expanded.add(term);
        aliases.forEach((alias) => expanded.add(alias));
      }
    });
  });
  const haystack = normalizeSearch(`${product.name} ${product.slug} ${product.sku} ${product.brand} ${product.category} ${product.unit} ${product.tags.join(" ")} ${product.description}`);
  const words = haystack.split(" ").filter(Boolean);
  return Array.from(expanded).some((term) =>
    haystack.includes(term) ||
    words.some((word) => word.includes(term) || term.includes(word) || (Math.max(word.length, term.length) >= 5 && searchDistance(word, term) <= 2)),
  );
}

function todayLocalDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function defaultDeliveryDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function isPastDeliveryDate(value: string) {
  return Boolean(value) && value < todayLocalDate();
}

function BackNav({ fallback = "/products", label = "Back" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallback);
  };
  return <button type="button" onClick={goBack} className="mb-4 inline-flex items-center gap-2 rounded-md border border-[#eadfca] bg-white px-3 py-2 text-sm font-bold text-black hover:border-[#d4af37] hover:bg-[#fff8df]"><ArrowLeft size={16} />{label}</button>;
}

function CustomerShell({ children }: { children: React.ReactNode }) {
  const { cart, products, wishlist, coupons, customer } = useStore();
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [menuCategories, setMenuCategories] = useState<Category[]>(categories);
  const amount = totals(cart, products, coupons).total;
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const wishlistCount = wishlist.length;
  useEffect(() => {
    fetchCategories()
      .then((items) => setMenuCategories([...categories, ...items.filter((item) => !categories.some((cat) => cat.slug === item.slug))].slice(0, 10)))
      .catch(() => setMenuCategories(categories.slice(0, 10)));
  }, []);
  const submitSearch = () => {
    const q = term.trim();
    setMobileNavOpen(false);
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };
  const closeMobileNav = () => setMobileNavOpen(false);
  const shopLinks = [
    ["/", Home, "Home"],
    ["/products", PackageCheck, "Products"],
    ["/wishlist", Heart, `Wishlist (${wishlistCount})`],
    ["/cart", ShoppingBag, `Cart (${cartCount})`],
    ["/orders", PackageCheck, "Orders"],
    ["/track-order", MapPin, "Track Order"],
    ["/contact", MessageCircle, "Support"],
    ["/account", User, customer ? "My Account" : "Login"],
  ] as const;
  return (
    <div className="flex min-h-screen flex-col bg-black">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black text-white shadow-xl no-print">
        <div className="container-premium flex min-h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMobileNavOpen((open) => !open)} className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/15 text-white hover:bg-white/10 md:hidden" aria-expanded={mobileNavOpen} aria-label="Open navigation"><Menu size={22} /></button>
            <Link href="/" onClick={closeMobileNav}><Logo invert /></Link>
          </div>
          <div className="hidden md:block"><PincodeChecker /></div>
          <form onSubmit={(event) => { event.preventDefault(); submitSearch(); }} className="hidden min-w-[260px] flex-1 items-center rounded-md bg-white px-3 py-2 text-black md:flex">
            <Search size={18} className="text-black/50" />
            <input value={term} onChange={(event) => setTerm(event.target.value)} className="w-full border-0 bg-transparent px-3 text-sm outline-none" placeholder="Search atta, milk, fruits, vegetables..." />
          </form>
          <div className="flex items-center gap-1">
            <Link href="/wishlist" className="relative hidden rounded-md p-2 hover:bg-white/10 sm:block" aria-label="Wishlist"><Heart size={21} /><span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#d4af37] px-1.5 text-center text-[10px] font-bold text-black">{wishlistCount}</span></Link>
            <Link href="/cart" className="relative rounded-md p-2 hover:bg-white/10" aria-label="Cart"><ShoppingBag size={21} /><span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#d4af37] px-1.5 text-center text-[10px] font-bold text-black">{cartCount}</span></Link>
            <AccountMenu />
          </div>
        </div>
        <div className="border-t border-white/10 md:hidden">
          <div className="container-premium grid gap-2 py-2">
            <form onSubmit={(event) => { event.preventDefault(); submitSearch(); }} className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-2">
              <Search size={18} className="text-[#d4af37]" />
              <input value={term} onChange={(event) => setTerm(event.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-white/55" placeholder="Search Eagle Mart" />
            </form>
            <PincodeChecker />
          </div>
        </div>
        {mobileNavOpen && (
          <div className="border-t border-white/10 bg-black md:hidden">
            <div className="container-premium grid gap-3 py-3">
              <div className="grid grid-cols-2 gap-2">
                {shopLinks.map(([href, Icon, label]) => (
                  <Link key={String(href)} href={String(href)} onClick={closeMobileNav} className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-3 text-sm font-bold text-white hover:bg-white/15"><Icon size={18} className="text-[#d4af37]" /><span>{String(label)}</span></Link>
                ))}
              </div>
              <div className="rounded-md border border-white/10 bg-white/5 p-2">
                <p className="px-2 pb-2 text-xs font-bold uppercase text-[#d4af37]">Shop by category</p>
                <div className="grid grid-cols-2 gap-2">
                  {menuCategories.map((category) => (
                    <Link key={category.slug} href={`/category/${category.slug}`} onClick={closeMobileNav} className="rounded-md px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white">{category.name}</Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </header>
      <div className="flex-1 bg-[#f7f4ec]">{children}</div>
      <Footer />
      <a href="https://wa.me/919876543210" className="fixed bottom-32 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl md:bottom-6 no-print" aria-label="WhatsApp support"><MessageCircle /></a>
      {cartCount > 0 && <Link href="/cart" className="fixed bottom-20 left-4 right-4 z-40 flex items-center justify-between rounded-md bg-black px-4 py-3 text-white shadow-2xl md:hidden no-print"><span className="text-sm font-bold">{cartCount} items - {money(amount)}</span><span className="rounded-md bg-[#d4af37] px-3 py-2 text-xs font-bold text-black">Checkout</span></Link>}
    </div>
  );
}

function AccountMenu() {
  const { customer, logoutCustomer } = useStore();
  const router = useRouter();
  const logout = async () => {
    if (customer) await logoutCustomer();
    router.push("/");
  };
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 text-sm font-bold hover:bg-white/10" aria-label="Account menu">
        <User size={21} />
        <span className="hidden lg:inline">{customer ? customer.name.split(" ")[0] : "Login / Signup"}</span>
      </summary>
      <div className="absolute right-0 mt-2 max-w-[calc(100vw-24px)] w-64 rounded-md border border-[#d4af37]/30 bg-white p-2 text-sm text-black shadow-2xl">
        {!customer && <>
          <Link href="/login" className="block rounded px-3 py-2 font-bold hover:bg-black/5">Customer Login</Link>
          <Link href="/signup" className="block rounded px-3 py-2 font-bold hover:bg-black/5">Create Account</Link>
        </>}
        {customer && <>
          <div className="border-b px-3 py-2"><b>{customer.name}</b><p className="text-xs text-black/55">{customer.email}</p></div>
          <Link href="/account" className="block rounded px-3 py-2 hover:bg-black/5">My Account</Link>
          <Link href="/orders" className="block rounded px-3 py-2 hover:bg-black/5">Orders</Link>
          <Link href="/wishlist" className="block rounded px-3 py-2 hover:bg-black/5">Wishlist</Link>
          <Link href="/account/addresses" className="block rounded px-3 py-2 hover:bg-black/5">Addresses</Link>
          <button onClick={logout} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-black/5"><LogOut size={16} />Logout</button>
        </>}
      </div>
    </details>
  );
}

const deliveryPincodeKey = "eagle-delivery-pincode";
const deliveryPincodeEvent = "eagle-delivery-pincode-updated";

function readSavedDeliveryPincode() {
  if (typeof window === "undefined") return "380015";
  return window.localStorage.getItem(deliveryPincodeKey) || "380015";
}

function saveDeliveryPincode(pincode: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(deliveryPincodeKey, pincode);
  window.dispatchEvent(new CustomEvent(deliveryPincodeEvent, { detail: pincode }));
}

function PincodeChecker() {
  const [pincode, setPincode] = useState(() => readSavedDeliveryPincode());
  const [status, setStatus] = useState<"idle" | "loading" | "locating" | "ok" | "no" | "error">("ok");
  const [message, setMessage] = useState("Delivery available. Pincode is serviceable.");
  const [place, setPlace] = useState("");
  useEffect(() => {
    const sync = (event: Event) => {
      const next = event instanceof CustomEvent && typeof event.detail === "string" ? event.detail : readSavedDeliveryPincode();
      setPincode(next);
      setStatus("ok");
      setPlace("");
      setMessage("Delivery available. Pincode is serviceable.");
    };
    window.addEventListener(deliveryPincodeEvent, sync);
    return () => window.removeEventListener(deliveryPincodeEvent, sync);
  }, []);
  const run = async (value = pincode) => {
    const clean = value.replace(/\D/g, "").slice(0, 6);
    setPincode(clean);
    if (!/^\d{6}$/.test(clean)) {
      setStatus("error");
      setMessage("Enter a valid 6-digit pincode.");
      return;
    }
    setStatus("loading");
    try {
      const result = await Promise.race([
        checkPincode(clean),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Pincode check timed out.")), 4000)),
      ]);
      setStatus(result.serviceable ? "ok" : "no");
      setPlace(result.zone?.city ? result.zone.city : "");
      setMessage(result.serviceable ? `Delivery available. ${result.message}` : result.message);
      if (result.serviceable) saveDeliveryPincode(clean);
    } catch (error) {
      setStatus("no");
      setMessage(error instanceof Error ? error.message : "Unable to check pincode. Database connection is unavailable.");
    }
  };
  const detectLocation = () => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setStatus("error");
      setMessage("Location needs HTTPS. Open the secure website, or enter your pincode manually.");
      return;
    }
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setMessage("Location detection is not supported by this browser.");
      return;
    }
    setStatus("locating");
    setMessage("Allow location access to detect your delivery pincode.");
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        setMessage("Finding pincode for your current location...");
        const result = await reverseGeocodeLocation(position.coords.latitude, position.coords.longitude);
        setPincode(result.pincode);
        setStatus(result.serviceable ? "ok" : "no");
        setPlace(result.place || result.zone?.city || "");
        setMessage(result.place ? `Detected ${result.place}. ${result.serviceable ? "Delivery available. " : ""}${result.message}` : result.serviceable ? `Delivery available. ${result.message}` : result.message);
        if (result.serviceable) saveDeliveryPincode(result.pincode);
      } catch (error) {
        if (/^\d{6}$/.test(pincode)) {
          setMessage("Location detected, but pincode was not available. Checking entered pincode instead.");
          await run(pincode);
          return;
        }
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Could not detect your pincode.");
      }
    }, (error) => {
      setStatus("error");
      setMessage(error.code === error.PERMISSION_DENIED ? "Allow location access in your browser, or enter pincode manually." : error.code === error.TIMEOUT ? "Location request timed out. Try again or enter pincode manually." : "Could not read your location. Please try again.");
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };
  return (
    <div className="flex h-11 min-w-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.07] px-3 text-xs text-white">
      <MapPin size={16} className="shrink-0 text-[#d4af37]" />
      <span className="hidden text-white/55 xl:inline">Deliver to</span>
      <input aria-label="Delivery pincode" inputMode="numeric" value={pincode} onChange={(e) => { setPincode(e.target.value.replace(/\D/g, "").slice(0, 6)); setStatus("idle"); setPlace(""); }} className="w-16 bg-transparent text-sm font-bold text-white outline-none" />
      <button type="button" onClick={() => run()} className="shrink-0 rounded-md border border-white/10 px-2 py-1 font-bold text-[#e7c766] hover:bg-white/10">{status === "loading" ? "Checking" : "Check"}</button>
      <button type="button" onClick={detectLocation} className="shrink-0 rounded-md border border-white/10 px-2 py-1 font-bold text-white/80 hover:bg-white/10">{status === "locating" ? "Locating" : "Locate"}</button>
      {place && <span className="hidden max-w-[160px] truncate text-white/60 2xl:inline" title={place}>{place}</span>}
      {message && <span className={`hidden lg:inline ${status === "ok" ? "text-green-600" : "text-white/60"}`}>{message}</span>}
    </div>
  );
}

function Footer() {
  const storeAddress = "GF-4, Siddharth Annexe, Sama-Savli Main Road, Vemali, New Sama, Vadodara, Gujarat - 390024";
  const footerGroups = [
    ["Shop", [["Products", "/products"], ["Categories", "/products"], ["Offers", "/products?sort=discount"], ["Organic", "/category/organic-store"]]],
    ["Customer Service", [["My Account", "/account"], ["Orders", "/orders"], ["Wishlist", "/wishlist"], ["Track Order", "/track-order"]]],
    ["Policies", [["Privacy", "/privacy"], ["Terms", "/terms"], ["Returns", "/return-policy"], ["Refunds", "/refunds"]]],
    ["Company", [["About Us", "/about"], ["Contact", "/contact"], ["FAQ", "/faq"]]],
  ] as const;
  const trustBadges = ["Secure Payments", "Fresh Products", "Fast Delivery", "Quality Assured"];
  const socials = ["Facebook", "Instagram", "X", "YouTube", "LinkedIn"] as const;
  return (
    <footer className="no-print bg-black text-white">
      <div className="container-premium py-12">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <Logo invert />
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">Premium groceries and daily essentials delivered to your doorstep.</p>
            <div className="mt-5 flex max-w-sm gap-3 text-sm leading-6 text-white/65">
              <MapPin size={18} className="mt-1 shrink-0 text-[#e7c766]" />
              <p><b className="block text-white">Eagle Mart</b>{storeAddress}</p>
            </div>
          </div>
          <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-4">
            {footerGroups.map(([title, links]) => (
              <div key={title}>
                <h3 className="display-font mb-3 font-bold text-[#e7c766]">{title}</h3>
                <div className="grid gap-2 text-sm text-white/70">
                  {links.map(([label, href]) => <Link key={label} href={href} className="hover:text-white">{label}</Link>)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10 border-y border-white/10 py-5">
          <div className="flex flex-wrap gap-2 text-sm font-bold text-white/75">
            {trustBadges.map((badge) => <span key={badge} className="rounded-md border border-white/10 bg-white/5 px-3 py-2">{badge}</span>)}
          </div>
        </div>
        <div className="flex flex-col gap-5 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-3">
            {socials.map((label) => <Link key={label} href="#" aria-label={label} className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 text-white/75 hover:border-[#d4af37] hover:text-[#e7c766]"><SocialLogo name={label} /></Link>)}
          </div>
          <p className="text-sm text-white/55">© 2026 Eagle Mart Grocery & Essentials</p>
        </div>
      </div>
    </footer>
  );
}

function SocialLogo({ name }: { name: "Facebook" | "Instagram" | "X" | "YouTube" | "LinkedIn" }) {
  if (name === "Facebook") return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="currentColor" d="M14.2 8.1h2.2V4.4c-.4-.1-1.7-.2-3.2-.2-3.2 0-5.4 2-5.4 5.7v3.2H4.4v4.1h3.4V24H12v-6.8h3.3l.5-4.1H12V10.3c0-1.2.3-2.2 2.2-2.2Z" /></svg>;
  if (name === "Instagram") return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="currentColor" d="M7.2 2h9.6A5.2 5.2 0 0 1 22 7.2v9.6a5.2 5.2 0 0 1-5.2 5.2H7.2A5.2 5.2 0 0 1 2 16.8V7.2A5.2 5.2 0 0 1 7.2 2Zm0 2A3.2 3.2 0 0 0 4 7.2v9.6A3.2 3.2 0 0 0 7.2 20h9.6a3.2 3.2 0 0 0 3.2-3.2V7.2A3.2 3.2 0 0 0 16.8 4H7.2Zm4.8 3.4a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2Zm0 2a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Zm5-2.8a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z" /></svg>;
  if (name === "X") return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="currentColor" d="M14.4 10.6 22.5 1h-1.9l-7 8.3L8 1H1.5l8.5 12.4L1.5 23h1.9l7.4-8.7 5.9 8.7h6.5l-8.8-12.4Zm-2.6 3.1-.9-1.2L4.1 2.4h3l5.5 8.1.9 1.2 7.1 10h-3l-5.8-8Z" /></svg>;
  if (name === "YouTube") return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8ZM9.6 15.6V8.4L15.8 12l-6.2 3.6Z" /></svg>;
  return <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="currentColor" d="M4.98 3.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM.5 8h4.9v16H.5V8Zm8 0h4.7v2.2h.1c.7-1.3 2.4-2.7 4.9-2.7 5.2 0 6.2 3.4 6.2 7.9V24h-4.9v-7.6c0-1.8 0-4.1-2.5-4.1s-2.9 2-2.9 4V24H8.5V8Z" transform="scale(.9) translate(1.3 0)" /></svg>;
}

function ProductCard({ product, footer }: { product: Product; footer?: ReactNode }) {
  const { addToCart, toggleWishlist, wishlist, authReady } = useStore();
  const variants = activeVariants(product);
  const fallbackVariant = defaultVariant(product);
  const [variantId, setVariantId] = useState(fallbackVariant?.id || "");
  const selectedVariant = variants.find((variant) => variant.id === variantId) || fallbackVariant;
  const available = (selectedVariant?.stock ?? product.stock) > 0;
  const unit = selectedVariant?.unit || product.unit;
  const price = selectedVariant?.price ?? product.price;
  const mrp = selectedVariant?.mrp ?? product.mrp;
  return (
    <article className="premium-card group flex h-full flex-col overflow-hidden">
      <Link href={`/product/${product.slug}`} className="block border-b border-[#eadfca] bg-white p-3">
        <img src={product.image} alt={product.name} onError={(event) => { event.currentTarget.src = imageFallback; }} className="aspect-square w-full rounded-md border border-[#f0e8d8] bg-white object-contain p-2 transition duration-300 group-hover:scale-[1.02]" />
      </Link>
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <Link href={`/product/${product.slug}`} className="line-clamp-2 min-h-10 text-sm font-bold">{product.name}</Link>
          <button onClick={() => toggleWishlist(product.id)} disabled={!authReady} className="rounded-md p-1 hover:bg-black/5 disabled:opacity-50" aria-label="Wishlist"><Heart size={18} fill={wishlist.includes(product.id) ? "#d4af37" : "none"} /></button>
        </div>
        <div className="grid gap-2">
          <p className="text-xs text-black/55">{unit} | {product.brand}</p>
          {variants.length > 1 && <select aria-label={`${product.name} unit`} value={variantId} onChange={(event) => setVariantId(event.target.value)} className="h-9 rounded-md border border-[#eadfca] bg-white px-2 text-xs font-bold outline-none focus:border-[#d4af37]">{variants.map((variant) => <option key={variant.id || variant.unit} value={variant.id || ""}>{variant.unit} - {money(variant.price)}</option>)}</select>}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div><p className="display-font text-lg font-extrabold">{money(price)}</p><p className="text-xs text-black/45 line-through">{money(mrp)}</p>{!available && <p className="mt-1 text-xs font-bold text-red-600">Out of stock</p>}</div>
          <Button variant="gold" className={available ? "h-10 w-10 px-0" : "h-10 min-w-[4.5rem] px-3 text-xs"} disabled={!authReady || !available} onClick={() => addToCart(product.id, 1, selectedVariant?.id)} aria-label={`Add ${product.name}`}>{available ? <Plus size={18} /> : "Out"}</Button>
        </div>
      </div>
      {footer && <div className="grid grid-cols-2 gap-2 border-t border-[#eadfca] bg-white p-3">{footer}</div>}
    </article>
  );
}

function HomePage() {
  const { products, addToCart } = useStore();
  const [homeCategories, setHomeCategories] = useState<Category[]>(categories);
  const starter = products.find((product) => product.stock > 0 && /milk|dairy|bread|eggs/i.test(`${product.name} ${product.category}`)) || products.find((product) => product.stock > 0);
  useEffect(() => {
    fetchCategories().then((items) => setHomeCategories([...categories, ...items.filter((item) => !categories.some((cat) => cat.slug === item.slug))]));
  }, []);
  return (
    <CustomerShell>
      <section className="relative min-h-[620px] overflow-hidden bg-black text-white">
        <img src="/assets/banners/fresh-produce-banner.png" alt="Eagle Mart fresh grocery produce banner" className="absolute inset-0 h-full w-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/35 to-black/5" />
        <div className="container-premium relative flex min-h-[620px] items-center">
          <div className="max-w-2xl py-20">
            <h1 className="display-font text-4xl font-black leading-tight md:text-6xl">India&apos;s Finest <span className="text-[#d4af37]">Grocery</span> Experience</h1>
            <p className="mt-5 max-w-xl text-lg text-white/80">Premium groceries and daily essentials delivered fresh to your doorstep.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link href="/products"><Button variant="gold">Shop Now <ChevronRight size={18} /></Button></Link></div>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold">{["Premium Quality", "Fresh Everyday", "Fast Delivery"].map((chip) => <span key={chip} className="rounded-full border border-white/20 bg-white/10 px-3 py-2">{chip}</span>)}</div>
          </div>
        </div>
      </section>
      <section className="container-premium py-10">
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase text-[#8a6500]">Curated for you</p>
            <h2 className="display-font text-3xl font-black">Shop by Department</h2>
          </div>
          <Link href="/products" className="text-sm font-bold text-[#8a6500]">View all products</Link>
        </div>
        <div className="responsive-scroll flex gap-4 overflow-x-auto pb-2">{homeCategories.slice(0, 10).map((cat) => <Link href={`/category/${cat.slug}`} key={cat.id} className="min-w-[170px] rounded-md border border-[#eadfca] bg-white p-3 text-black shadow-sm transition hover:-translate-y-0.5 hover:border-[#d4af37]"><img src={cat.image} alt={cat.name} className="mb-3 h-24 w-full rounded-md border border-[#f0e8d8] bg-white object-cover" /><span className="text-sm font-bold">{cat.name}</span></Link>)}</div>
      </section>
      <section className="bg-[#111] py-12 text-white">
        <div className="container-premium">
          <p className="text-center text-xs font-bold uppercase text-[#d4af37]">Premium aisles</p>
          <h2 className="display-font mt-2 text-center text-3xl font-black">Explore Every Category</h2>
          <div className="mt-8 grid gap-6">
            {homeCategories.slice(0, 10).map((cat) => <CategoryShowcase key={cat.id} category={cat} products={products.filter((p) => p.category === cat.name || p.categorySlug === cat.slug).slice(0, 8)} />)}
          </div>
        </div>
      </section>
      <ProductSection title="Today's Deals" products={products.filter((p) => p.mrp > p.price).slice(0, 8)} />
      <section className="bg-black py-14 text-white">
        <div className="container-premium grid gap-6 md:grid-cols-4">
          {[[ShieldCheck, "Curated Selection"], [Truck, "Fast Delivery"], [BadgePercent, "Better Savings"], [MessageCircle, "Elite Support"]].map(([Icon, label]) => <div key={String(label)} className="rounded-md border border-white/10 p-5"><Icon className="mb-4 text-[#e7c766]" /><h3 className="display-font font-bold">{String(label)}</h3><p className="mt-2 text-sm text-white/65">A premium grocery experience tuned for everyday Indian households.</p></div>)}
        </div>
      </section>
      <ProductSection title="Best Sellers" products={products.filter((p) => p.featured).slice(0, 8)} />
      <section className="bg-black py-12 text-white">
        <div className="container-premium">
          <div className="grid items-center gap-6 rounded-md bg-[#d4af37] p-6 text-black md:grid-cols-[1fr_auto] md:p-8">
            <div>
              <h2 className="display-font text-3xl font-black italic">Eagle Privilege</h2>
              <p className="mt-2 max-w-xl text-sm font-semibold text-black/70">Free delivery, priority support, and member-only grocery deals for everyday shopping.</p>
            </div>
            <Link href="/signup"><Button className="bg-black text-[#e7c766] hover:bg-[#151515]">Join Eagle Mart <ChevronRight size={18} /></Button></Link>
          </div>
          <img src="/assets/banners/fresh-produce-banner.png" alt="Fresh produce at Eagle Mart" className="mt-10 h-52 w-full rounded-md object-cover md:h-72" />
        </div>
      </section>
      <section className="container-premium grid gap-4 py-10 md:grid-cols-2">
        <div className="rounded-md bg-[#d4af37] p-8 text-black"><h2 className="display-font text-2xl font-black">Festival Offers</h2><p className="mt-2">Use FESTIVE10 for premium savings on curated essentials.</p><Button className="mt-5">Shop Festival Picks</Button></div>
        <div className="rounded-md bg-white p-8"><h2 className="display-font text-2xl font-black">Fresh Arrivals</h2><p className="mt-2 text-black/65">New farm produce, dairy staples, and pantry refills updated daily.</p><Button variant="outline" className="mt-5" disabled={!starter} onClick={() => starter && addToCart(starter.id)}>Add Milk Starter</Button></div>
      </section>
    </CustomerShell>
  );
}

function CategoryShowcase({ category, products }: { category: Category; products: Product[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-white/10 bg-white/5">
      <div className="grid gap-0 lg:grid-cols-[260px_1fr]">
        <Link href={`/category/${category.slug}`} className="relative min-h-48 overflow-hidden bg-black lg:min-h-full">
          <img src={category.image} alt={category.name} onError={(event) => { event.currentTarget.src = "/assets/placeholders/category-placeholder.svg"; }} className="absolute inset-0 h-full w-full object-cover opacity-75 transition duration-500 hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <h3 className="display-font text-2xl font-black">{category.name}</h3>
            <p className="mt-2 text-sm text-white/70">{categoryDescriptions[category.name] || "Premium Eagle Mart grocery essentials."}</p>
            <span className="mt-4 inline-flex rounded-md bg-[#d4af37] px-3 py-2 text-xs font-bold text-black">View All</span>
          </div>
        </Link>
        <div className="min-w-0 bg-[#f7f2e8] p-4">
          {products.length ? <div className="responsive-scroll flex w-full min-w-0 touch-pan-x snap-x gap-4 overflow-x-auto overscroll-x-contain pb-2 md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-4">{products.map((product) => <div key={product.id} className="w-[78vw] max-w-[240px] shrink-0 snap-start text-black min-[420px]:w-[220px] md:w-auto md:max-w-none md:shrink"><ProductCard product={product} /></div>)}</div> : <div className="flex min-h-36 items-center justify-center rounded-md border border-[#eadfca] bg-white p-6 text-sm text-black/55">Products for this category will be added soon.</div>}
        </div>
      </div>
    </section>
  );
}

function ProductSection({ title, products }: { title: string; products: Product[] }) {
  return <section className="container-premium py-10"><div className="mb-6 flex items-end justify-between gap-3"><h2 className="display-font text-2xl font-black md:text-3xl">{title}</h2><Link href="/products" className="shrink-0 text-sm font-bold text-[#8a6500]">View all</Link></div><div className="responsive-scroll flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">{products.map((p) => <div key={p.id} className="min-w-[210px] max-w-[230px] flex-1 lg:min-w-0 lg:max-w-none"><ProductCard product={p} /></div>)}</div></section>;
}

function ProductsPage({ mode, value }: { mode?: string; value?: string }) {
  const { products, toast } = useStore();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [sort, setSort] = useState("popular");
  const [category, setCategory] = useState(value || "");
  const [brand, setBrand] = useState("");
  const [availability, setAvailability] = useState("");
  const [rating, setRating] = useState("");
  const [organic, setOrganic] = useState(false);
  const [local, setLocal] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [remoteProducts, setRemoteProducts] = useState<Product[]>([]);
  const [remoteFilters, setRemoteFilters] = useState<{ categories?: Category[]; brands?: { id: string; slug: string; name: string }[] } | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [apiCategories, setApiCategories] = useState<Category[]>(categories);
  useEffect(() => {
    fetchCategories().then(setApiCategories).catch(() => setApiCategories(categories));
  }, []);
  const activeCategory = mode === "category" && value ? value : category;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoadingProducts(true);
      fetchProducts({
        q: query || undefined,
        category: activeCategory || undefined,
        brand: brand || undefined,
        availability: availability || undefined,
        rating: rating || undefined,
        organic: organic || undefined,
        local: local || undefined,
        minPrice: minPrice || undefined,
        maxPrice: maxPrice || undefined,
        sort,
        limit: 500,
      }).then((result) => {
        setRemoteProducts(result.products);
        setRemoteFilters(result.filters);
      }).catch((error) => toast(error instanceof Error ? error.message : "Unable to load filtered products.", "error")).finally(() => setLoadingProducts(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [activeCategory, availability, brand, local, maxPrice, minPrice, organic, query, rating, sort, toast]);
  const fallbackList = useMemo(() => {
    let next = products.filter((p) => p.active !== false);
    if (mode === "category" && value) next = next.filter((p) => p.categorySlug === value || apiCategories.find((c) => c.slug === value)?.name === p.category);
    if (category && mode !== "category") next = next.filter((p) => p.categorySlug === category || p.category === category);
    if (brand) next = next.filter((p) => p.brandSlug === brand || p.brand === brand);
    if (availability === "in_stock") next = next.filter((p) => p.stock > 0);
    if (availability === "out_of_stock") next = next.filter((p) => p.stock <= 0);
    if (availability === "low_stock") next = next.filter((p) => p.stock > 0 && p.stock <= p.lowStock);
    if (rating) next = next.filter((p) => p.rating >= Number(rating));
    if (organic) next = next.filter((p) => p.organic);
    if (local) next = next.filter((p) => p.local);
    if (minPrice) next = next.filter((p) => p.price >= Number(minPrice));
    if (maxPrice) next = next.filter((p) => p.price <= Number(maxPrice));
    if (query) next = next.filter((p) => productMatchesSearch(p, query));
    if (sort === "price_asc") next = [...next].sort((a, b) => a.price - b.price);
    if (sort === "price_desc") next = [...next].sort((a, b) => b.price - a.price);
    if (sort === "discount") next = [...next].sort((a, b) => (b.mrp - b.price) - (a.mrp - a.price));
    if (sort === "newest") next = [...next].reverse();
    return next;
  }, [products, query, sort, category, mode, value, apiCategories, brand, availability, rating, organic, local, minPrice, maxPrice]);
  const list = remoteProducts.length || loadingProducts ? remoteProducts : fallbackList;
  const filterCategories = remoteFilters?.categories?.length ? remoteFilters.categories : apiCategories;
  const filterBrands = remoteFilters?.brands?.length ? remoteFilters.brands : Array.from(new Map(products.map((p) => [p.brandSlug || p.brand, { id: p.brandSlug || p.brand, slug: p.brandSlug || p.brand, name: p.brand }])).values()).sort((a, b) => a.name.localeCompare(b.name));
  const activeFilters = [
    query && ["Search", query],
    activeCategory && ["Category", filterCategories.find((c) => c.slug === activeCategory || c.name === activeCategory)?.name || activeCategory],
    brand && ["Brand", filterBrands.find((item) => item.slug === brand || item.name === brand)?.name || brand],
    availability && ["Availability", availability.replaceAll("_", " ")],
    rating && ["Rating", `${rating}+ stars`],
    organic && ["Organic", "Yes"],
    local && ["Local", "Yes"],
    minPrice && ["Min", `₹${minPrice}`],
    maxPrice && ["Max", `₹${maxPrice}`],
  ].filter(Boolean) as string[][];
  const clearFilters = () => {
    setQuery("");
    if (mode !== "category") setCategory("");
    setBrand("");
    setAvailability("");
    setRating("");
    setOrganic(false);
    setLocal(false);
    setMinPrice("");
    setMaxPrice("");
    setSort("popular");
  };
  const renderFilterPanel = (mobile = false) => (
    <aside className={`${mobile ? "block" : "hidden lg:block"} premium-card h-fit overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 border-b border-[#eadfca] p-4">
        <h3 className="display-font text-xl font-black">Filters</h3>
        <button type="button" onClick={clearFilters} className="text-xs font-black uppercase text-[#8a6500]">Clear all</button>
      </div>
      <div className="grid gap-0 text-sm">
        <div className="border-b border-[#eadfca] p-4">
          <label className="text-xs font-black uppercase text-black/50">Search products<input aria-label="Search products" value={query} onChange={(e) => setQuery(e.target.value)} className="mt-2 w-full rounded-md border border-[#cfc4a6] px-3 py-3 text-base font-normal normal-case outline-none focus:border-[#d4af37]" placeholder="Search atta, milk, rice..." /></label>
        </div>
        <details open className="border-b border-[#eadfca] p-4">
          <summary className="cursor-pointer list-none font-black uppercase">Category</summary>
          <div className="mt-3 grid gap-2">
            {mode !== "category" && <label className="flex items-center gap-2"><input type="radio" name={`category-${mobile}`} checked={!category} onChange={() => setCategory("")} /> All categories</label>}
            {filterCategories.map((item) => <label key={item.slug} className="flex items-center gap-2"><input type="radio" name={`category-${mobile}`} checked={activeCategory === item.slug || activeCategory === item.name} disabled={mode === "category"} onChange={() => setCategory(item.slug)} /> {item.name}</label>)}
          </div>
        </details>
        <details open className="border-b border-[#eadfca] p-4">
          <summary className="cursor-pointer list-none font-black uppercase">Brand</summary>
          <div className="mt-3 grid max-h-52 gap-2 overflow-y-auto pr-1">
            <label className="flex items-center gap-2"><input type="radio" name={`brand-${mobile}`} checked={!brand} onChange={() => setBrand("")} /> All brands</label>
            {filterBrands.map((item) => <label key={item.slug || item.id} className="flex items-center gap-2"><input type="radio" name={`brand-${mobile}`} checked={brand === item.slug || brand === item.name} onChange={() => setBrand(item.slug || item.name)} /> {item.name}</label>)}
          </div>
        </details>
        <details open className="border-b border-[#eadfca] p-4">
          <summary className="cursor-pointer list-none font-black uppercase">Price</summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input aria-label="Minimum price" inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ""))} className="rounded-md border px-3 py-2" placeholder="Min" />
            <input aria-label="Maximum price" inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ""))} className="rounded-md border px-3 py-2" placeholder="Max" />
          </div>
        </details>
        <details open className="border-b border-[#eadfca] p-4">
          <summary className="cursor-pointer list-none font-black uppercase">Availability</summary>
          <div className="mt-3 grid gap-2">
            {[["", "All stock"], ["in_stock", "In stock"], ["low_stock", "Low stock"], ["out_of_stock", "Out of stock"]].map(([value, label]) => <label key={value || "all"} className="flex items-center gap-2"><input type="radio" name={`availability-${mobile}`} checked={availability === value} onChange={() => setAvailability(value)} /> {label}</label>)}
          </div>
        </details>
        <details className="border-b border-[#eadfca] p-4">
          <summary className="cursor-pointer list-none font-black uppercase">Customer Rating</summary>
          <div className="mt-3 grid gap-2">
            {[["", "All ratings"], ["4", "4★ & above"], ["3", "3★ & above"]].map(([value, label]) => <label key={value || "all"} className="flex items-center gap-2"><input type="radio" name={`rating-${mobile}`} checked={rating === value} onChange={() => setRating(value)} /> {label}</label>)}
          </div>
        </details>
        <details open className="p-4">
          <summary className="cursor-pointer list-none font-black uppercase">Product Tags</summary>
          <div className="mt-3 grid gap-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={organic} onChange={(e) => setOrganic(e.target.checked)} /> Organic</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={local} onChange={(e) => setLocal(e.target.checked)} /> Local</label>
          </div>
        </details>
      </div>
    </aside>
  );
  return (
    <CustomerShell>
      <main className="container-premium py-8">
        <p className="text-sm text-black/55">Home / {mode === "category" ? "Category" : "Products"}</p>
        <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="display-font text-3xl font-black">Explore Premium Groceries</h1><p className="text-black/60">{loadingProducts ? "Refreshing products..." : `${list.length} products found`}</p></div><div className="grid grid-cols-2 gap-2 sm:flex"><select aria-label="Sort products" value={sort} onChange={(e) => setSort(e.target.value)} className="min-w-0 rounded-md border bg-white px-3 py-2 text-sm"><option value="popular">Popular</option><option value="newest">Newest</option><option value="price_asc">Price low to high</option><option value="price_desc">Price high to low</option><option value="discount">Discount</option></select><Button variant="outline" onClick={() => setMobileFiltersOpen(true)}><Menu size={17} /> Filters</Button></div></div>
        {activeFilters.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{activeFilters.map(([label, value]) => <span key={`${label}-${value}`} className="rounded-full bg-black px-3 py-1 text-xs font-bold capitalize text-white">{label}: {value}</span>)}<button type="button" onClick={clearFilters} className="rounded-full border border-black/20 bg-white px-3 py-1 text-xs font-bold">Clear all</button></div>}
        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
          {renderFilterPanel()}
          <section>{list.length ? <div className={`responsive-scroll flex gap-4 overflow-x-auto pb-2 xl:grid xl:grid-cols-4 xl:overflow-visible ${loadingProducts ? "opacity-60" : ""}`}>{list.map((p) => <div key={p.id} className="min-w-[210px] max-w-[230px] flex-1 xl:min-w-0 xl:max-w-none"><ProductCard product={p} /></div>)}</div> : <section className="premium-card p-10 text-center"><h2 className="display-font text-2xl font-black">No products found</h2><p className="mt-2 text-sm text-black/55">Try removing a filter or changing your search.</p><Button variant="gold" className="mt-5" onClick={clearFilters}>Clear filters</Button></section>}</section>
        </div>
        {mobileFiltersOpen && <div className="fixed inset-0 z-[70] bg-black/60 p-3 lg:hidden"><div className="ml-auto flex h-full max-w-sm flex-col overflow-hidden rounded-md bg-[#f7f4ec]"><div className="flex items-center justify-between border-b bg-white p-4"><h2 className="display-font text-xl font-black">Filters</h2><button type="button" onClick={() => setMobileFiltersOpen(false)} className="rounded-md border px-3 py-2 text-sm font-bold">Close</button></div><div className="min-h-0 flex-1 overflow-y-auto p-3">{renderFilterPanel(true)}</div><div className="border-t bg-white p-3"><Button variant="gold" className="w-full" onClick={() => setMobileFiltersOpen(false)}>Show {list.length} products</Button></div></div></div>}
      </main>
    </CustomerShell>
  );
}

function ProductDetail({ slug }: { slug?: string }) {
  const { products, addToCart, toggleWishlist, authReady } = useStore();
  const router = useRouter();
  const [apiProduct, setApiProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [variantId, setVariantId] = useState("");
  const [qtyInput, setQtyInput] = useState("1");
  const [unitInput, setUnitInput] = useState("");
  useEffect(() => {
    if (slug) fetchProduct(slug).then(setApiProduct).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load products. Database connection is unavailable."));
  }, [slug]);
  const product = apiProduct || products.find((p) => p.slug === slug) || products[0];
  useEffect(() => {
    if (!product) return;
    const initialUnit = defaultVariant(product)?.unit || product.unit;
    setUnitInput(initialUnit);
    setVariantId(defaultVariant(product)?.id || "");
    setQtyInput("1");
  }, [product?.id]);
  if (!product) {
    return <CustomerShell><main className="container-premium py-12">{error ? <Empty title="Unable to load products. Database connection is unavailable." cta="Browse products" href="/products" /> : <div className="premium-card p-8 text-center font-bold">Loading product...</div>}</main></CustomerShell>;
  }
  const variants = activeVariants(product);
  const fallbackVariant = defaultVariant(product);
  const selectedVariant = variants.find((variant) => variant.id === variantId) || fallbackVariant;
  const selectedVariantId = selectedVariant?.id;
  const selectedStock = selectedVariant?.stock ?? product.stock;
  const selectedUnit = selectedVariant?.unit || product.unit;
  const selectedPrice = selectedVariant?.price ?? product.price;
  const selectedMrp = selectedVariant?.mrp ?? product.mrp;
  const typedUnitPrice = unitInput.trim() ? priceForUnit(selectedUnit, unitInput, selectedPrice, selectedMrp) : null;
  const unitInputError = unitInput.trim() && !typedUnitPrice ? `Enter an amount compatible with ${selectedUnit}, like 250 g, 500 g, 1 kg, 500 ml, or 1 L.` : "";
  const requestedQty = qtyInput === "" ? 0 : Number(qtyInput);
  const discount = selectedMrp > selectedPrice ? Math.round(((selectedMrp - selectedPrice) / selectedMrp) * 100) : 0;
  const related = products.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4);
  const available = selectedStock > 0;
  const validQty = Number.isInteger(requestedQty) && requestedQty >= 1 && requestedQty <= selectedStock;
  const canBuySelectedUnit = available && validQty && !unitInputError;
  const unitPrice = typedUnitPrice?.price ?? selectedPrice;
  const unitMrp = typedUnitPrice?.mrp ?? selectedMrp;
  const lineTotal = unitPrice * (validQty ? requestedQty : 1);
  const mrpLineTotal = unitMrp * (validQty ? requestedQty : 1);
  const qtyError = qtyInput === "" ? "Enter quantity to continue." : requestedQty < 1 ? "Minimum quantity is 1." : requestedQty > selectedStock ? `Only ${selectedStock} ${selectedUnit} packs available.` : "";
  const updateQty = (value: string) => setQtyInput(value.replace(/\D/g, "").slice(0, 4));
  const updatePurchaseUnit = (value: string) => {
    setUnitInput(value);
    const normalized = normalizeUnit(value);
    const match = variants.find((variant) => normalizeUnit(variant.unit) === normalized || normalizeUnit(variant.label || "") === normalized);
    if (match) {
      setVariantId(match.id || "");
      setQtyInput("1");
    }
  };
  const stepQty = (delta: number) => setQtyInput((value) => {
    const current = value === "" ? 1 : Number(value);
    return String(Math.min(selectedStock, Math.max(1, current + delta)));
  });
  const addSelectedToCart = () => {
    if (!canBuySelectedUnit) return;
    addToCart(product.id, requestedQty, selectedVariantId, { unit: unitInput.trim() || selectedUnit, price: unitPrice, mrp: unitMrp });
  };
  const buyNow = () => {
    if (!canBuySelectedUnit) return;
    addToCart(product.id, requestedQty, selectedVariantId, { unit: unitInput.trim() || selectedUnit, price: unitPrice, mrp: unitMrp });
    router.push("/checkout");
  };
  return (
    <CustomerShell>
      <main className="container-premium py-8">
        <BackNav fallback="/products" label="Back to products" />
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="premium-card p-4"><img src={product.image} alt={product.name} onError={(event) => { event.currentTarget.src = imageFallback; }} className="aspect-square w-full rounded-md border border-[#f0e8d8] bg-white object-contain p-4" /><div className="mt-3 grid grid-cols-4 gap-2">{[1,2,3,4].map((x) => <img key={x} src={product.image} alt="" onError={(event) => { event.currentTarget.src = imageFallback; }} className="aspect-square rounded-md border border-[#f0e8d8] bg-white object-contain p-2 opacity-80" />)}</div></div>
          <section>
            <p className="text-sm font-bold text-[#8a6500]">{product.brand} / {product.category}</p>
            <h1 className="display-font mt-2 text-3xl font-black md:text-5xl">{product.name}</h1>
            <p className="mt-3 flex items-center gap-2 text-sm"><Star size={17} fill="#d4af37" className="text-[#d4af37]" /> {product.rating} ({product.reviews} reviews)</p>
            <div className="mt-5 flex items-end gap-3"><span className="display-font text-3xl font-black">{money(unitPrice)}</span><span className="text-black/45 line-through">{money(unitMrp)}</span>{unitMrp > unitPrice && <span className="rounded bg-red-50 px-2 py-1 text-xs font-bold text-red-700">{Math.round(((unitMrp - unitPrice) / unitMrp) * 100)}% OFF</span>}</div>
            <p className="mt-1 text-sm text-black/55">Inclusive of taxes. Buying unit: {unitInput.trim() || selectedUnit}</p>
            {variants.length > 0 && <div className="mt-5 grid gap-3"><label className="text-sm font-bold">Amount to buy<input aria-label="Amount to buy" value={unitInput} onChange={(event) => updatePurchaseUnit(event.target.value)} list={`units-${product.id}`} className="mt-1 w-full rounded-md border border-[#eadfca] bg-white px-3 py-3 outline-none focus:border-[#d4af37]" placeholder="Type 250 g, 500 g, 1 kg, 500 ml..." /></label><datalist id={`units-${product.id}`}>{["250 g", "500 g", "1 kg", "2 kg", "500 ml", "1 L", "1 pc"].map((unit) => <option key={unit} value={unit} />)}{variants.map((variant) => <option key={variant.id || variant.unit} value={variant.unit} />)}</datalist>{unitInputError && <p className="text-sm font-bold text-red-600">{unitInputError}</p>}<div><p className="text-sm font-bold">Base units</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{variants.map((variant) => { const checked = (variant.id || variant.unit) === (selectedVariantId || selectedUnit); return <button type="button" key={variant.id || variant.unit} onClick={() => { setVariantId(variant.id || ""); setUnitInput(variant.unit); setQtyInput("1"); }} className={`rounded-md border p-3 text-left text-sm ${checked ? "border-[#d4af37] bg-[#fff8df]" : "border-[#eadfca] bg-white hover:border-[#d4af37]"}`}><b>{variant.unit}</b><span className="mt-1 block">{money(variant.price)} <span className="text-black/45 line-through">{money(variant.mrp)}</span></span><span className="mt-1 block text-xs text-black/55">SKU {variant.sku || product.sku} | {variant.stock ?? 0} in stock</span></button>; })}</div></div></div>}
            <div className="mt-5 grid gap-3 rounded-md border border-[#eadfca] bg-white p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <label className="text-sm font-bold">Quantity
                  <div className="mt-1 flex h-12 w-fit items-center overflow-hidden rounded-md border border-[#eadfca] bg-white">
                    <button type="button" disabled={!available || requestedQty <= 1} onClick={() => stepQty(-1)} className="grid h-12 w-12 place-items-center border-r disabled:opacity-40"><Minus size={16} /></button>
                    <input aria-label="Product quantity" value={qtyInput} onChange={(event) => updateQty(event.target.value)} onBlur={() => { if (qtyInput !== "") setQtyInput(String(Math.min(selectedStock, Math.max(1, Number(qtyInput))))); }} className="h-12 w-20 border-0 text-center text-lg font-black outline-none" inputMode="numeric" />
                    <button type="button" disabled={!available || requestedQty >= selectedStock} onClick={() => stepQty(1)} className="grid h-12 w-12 place-items-center border-l disabled:opacity-40"><Plus size={16} /></button>
                  </div>
                </label>
                <div className="text-right">
                  <p className="text-xs font-bold uppercase text-black/45">Payable amount</p>
                  <p className="display-font text-2xl font-black">{money(lineTotal)}</p>
                  {mrpLineTotal > lineTotal && <p className="text-xs text-black/45 line-through">{money(mrpLineTotal)}</p>}
                </div>
              </div>
              {(qtyError || unitInputError) && <p className="text-sm font-bold text-red-600">{unitInputError || qtyError}</p>}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2"><Button variant="gold" disabled={!authReady || !canBuySelectedUnit} onClick={addSelectedToCart}><ShoppingBag size={18} /> {available ? `Add ${requestedQty || ""} ${unitInput.trim() || selectedUnit}` : "Out of stock"}</Button>{available ? <Button className="w-full" disabled={!authReady || !canBuySelectedUnit} onClick={buyNow}>Buy Now - {money(lineTotal)}</Button> : <Button className="w-full" disabled>Buy Now</Button>}<Button variant="outline" disabled={!authReady} onClick={() => toggleWishlist(product.id)}><Heart size={18} /> Wishlist</Button></div>
            <div className="mt-4"><PincodeChecker /></div>
            <div className="mt-6 grid gap-3 rounded-md border bg-white p-4 text-sm"><p><b>Stock:</b> {selectedStock > 0 ? `${selectedStock} ${selectedUnit} packs available` : "Out of stock"}</p><p><b>Highlights:</b> Premium sourced, freshness checked, safely packed.</p><p><b>Storage:</b> Store in a cool, dry place. Refrigerate fresh products.</p><p><b>Return policy:</b> Same-day replacement for damaged or expired items.</p></div>
          </section>
        </div>
        <ProductSection title="Frequently Bought Together" products={related.length ? related : products.slice(0, 4)} />
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white p-3 shadow-2xl md:hidden"><Button variant="gold" className="w-full" disabled={!authReady || !canBuySelectedUnit} onClick={addSelectedToCart}>{available ? `Add ${requestedQty || ""} ${unitInput.trim() || selectedUnit} - ${money(lineTotal)}` : "Out of stock"}</Button></div>
    </CustomerShell>
  );
}

function CartPage() {
  const { cart, products, coupons, setQty, removeFromCart, couponCode, applyCoupon, toast } = useStore();
  const [code, setCode] = useState(couponCode);
  const t = totals(cart, products, coupons, couponCode);
  return (
    <CustomerShell>
      <main className="container-premium py-8"><BackNav fallback="/products" label="Back to products" /><h1 className="display-font text-3xl font-black">Your Cart</h1>{cart.length ? <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"><section className="space-y-4">{cart.map((item) => { const p = products.find((x) => x.id === item.productId); if (!p) return null; const variant = itemVariant(item, p); const max = Math.max(1, variant?.stock ?? p.stock); const unit = itemUnit(item, p); const price = itemPrice(item, products); return <div key={item.id || `${item.productId}-${item.variantId || "default"}`} className="premium-card flex flex-col gap-4 p-4 sm:flex-row"><img src={p.image} alt={p.name} className="h-24 w-24 shrink-0 rounded-md object-cover" /><div className="min-w-0 flex-1"><h3 className="font-bold">{item.name || p.name}</h3><p className="break-words text-sm text-black/55">{unit} {item.sku ? `| SKU ${item.sku}` : ""}</p><p className="display-font mt-2 font-bold">{money(price)} <span className="text-xs font-normal text-black/45">x {item.qty} = {money(itemLineTotal(item, products))}</span></p><div className="mt-3 flex flex-wrap items-center gap-2"><Qty value={item.qty} max={max} unit={unit} onChange={(qty) => setQty(item.id || p.id, qty)} onInvalid={(message) => toast(message, "error")} /><Button variant="ghost" onClick={() => removeFromCart(item.id || p.id)}>Remove</Button></div></div></div>; })}<ProductSection title="Recommended Products" products={products.slice(0, 4)} /></section><Summary t={t} code={code} coupons={coupons} setCode={setCode} applyCoupon={() => applyCoupon(code)} /></div> : <Empty title="Your cart is empty" cta="Continue shopping" href="/products" />}</main>
    </CustomerShell>
  );
}

function Qty({ value, max, unit, onChange, onInvalid }: { value: number; max: number; unit?: string; onChange: (qty: number) => void; onInvalid: (message: string) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = (next: string) => {
    if (!next.trim()) {
      setDraft(String(value));
      return;
    }
    const qty = Number(next);
    if (!Number.isInteger(qty) || qty < 1) {
      onInvalid("Quantity must be at least 1.");
      setDraft(String(value));
      return;
    }
    if (qty > max) {
      onInvalid(`Only ${max} ${unit || "units"} available.`);
      setDraft(String(value));
      return;
    }
    if (qty !== value) onChange(qty);
    setDraft(String(qty));
  };
  return <div className="inline-flex h-11 items-center overflow-hidden rounded-md border bg-white"><button type="button" aria-label="Decrease quantity" className="h-11 px-3" onClick={() => commit(String(Math.max(1, value - 1)))}><Minus size={15} /></button><input aria-label="Quantity" inputMode="numeric" value={draft} onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))} onBlur={() => commit(draft)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="h-11 w-14 border-x text-center text-sm font-bold outline-none" /><button type="button" aria-label="Increase quantity" className="h-11 px-3" onClick={() => commit(String(value + 1))}><Plus size={15} /></button></div>;
}

function Summary({ t, code, coupons, setCode, applyCoupon }: { t: ReturnType<typeof totals>; code: string; coupons: StoreCoupons; setCode: (x: string) => void; applyCoupon: () => void }) {
  return <aside className="premium-card h-fit p-5 lg:sticky lg:top-24"><h2 className="display-font text-xl font-bold">Price Summary</h2><div className="mt-4 h-2 rounded-full bg-black/10"><div className="h-2 rounded-full bg-[#d4af37]" style={{ width: `${Math.min(100, (t.subtotal / 799) * 100)}%` }} /></div><p className="mt-2 text-xs text-black/55">Free delivery above Rs 799</p><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] lg:grid-cols-[1fr_auto]"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="w-full min-w-0 rounded-md border px-3 py-2" placeholder="Coupon" /><Button variant="gold" onClick={applyCoupon}>Apply</Button></div><div className="mt-4 space-y-2 text-sm">{[["Subtotal", t.subtotal], ["Discount", -t.discount], ["Coupon discount", -t.couponDiscount], ["GST/tax", t.gst], ["Delivery charge", t.delivery], ["Handling charge", t.handling]].map(([k, v]) => <div key={String(k)} className="flex justify-between gap-3"><span>{String(k)}</span><span>{money(Number(v))}</span></div>)}</div><div className="mt-4 flex justify-between gap-3 border-t pt-4 display-font text-xl font-black"><span>Total</span><span>{money(t.total)}</span></div><Link href="/checkout"><Button variant="gold" className="mt-4 w-full">Checkout</Button></Link><div className="mt-4 grid gap-2">{coupons.map((c) => <button key={c.code} onClick={() => { setCode(c.code); }} className="rounded-md border p-2 text-left text-xs"><b>{c.code}</b> - {c.title}</button>)}</div></aside>;
}

function WishlistPage() {
  const { wishlist, products, moveWishlistToCart, toggleWishlist } = useStore();
  const list = products.filter((p) => wishlist.includes(p.id));
  return <CustomerShell><main className="container-premium py-8"><BackNav fallback="/products" label="Back to products" /><h1 className="display-font text-3xl font-black">Wishlist</h1>{list.length ? <div className="responsive-scroll mt-6 flex gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible">{list.map((p) => <div key={p.id} className="min-w-[210px] max-w-[230px] flex-1 lg:min-w-0 lg:max-w-none"><ProductCard product={p} footer={<><Button variant="gold" onClick={() => moveWishlistToCart(p.id)}>Move</Button><Button variant="outline" onClick={() => toggleWishlist(p.id)}>Remove</Button></>} /></div>)}</div> : <Empty title="Your wishlist is empty" cta="Browse products" href="/products" />}</main></CustomerShell>;
}

type AddressInput = Omit<Address, "id">;

const blankAddress: AddressInput = {
  label: "Home",
  name: "",
  phone: "",
  line: "",
  city: "",
  state: "Gujarat",
  pincode: "",
  landmark: "",
  isDefault: false,
};

function AddressForm({ initial, onCancel, onSave }: { initial?: Address; onCancel: () => void; onSave: (address: AddressInput | Address) => void }) {
  const [form, setForm] = useState<AddressInput | Address>(initial || blankAddress);
  useEffect(() => setForm(initial || blankAddress), [initial]);
  const update = (key: keyof AddressInput, value: string | boolean) => setForm((next) => ({ ...next, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(form);
  };
  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-md border border-[#eadfca] bg-white p-4 md:grid-cols-2">
      <input aria-label="Address label" required value={form.label} onChange={(e) => update("label", e.target.value)} className="rounded-md border px-3 py-2" placeholder="Home / Work" />
      <input aria-label="Receiver name" required value={form.name} onChange={(e) => update("name", e.target.value)} className="rounded-md border px-3 py-2" placeholder="Receiver name" />
      <input aria-label="Receiver phone" required value={form.phone} onChange={(e) => update("phone", e.target.value)} className="rounded-md border px-3 py-2" placeholder="10-digit phone" />
      <input aria-label="Pincode" required value={form.pincode} onChange={(e) => update("pincode", e.target.value)} className="rounded-md border px-3 py-2" placeholder="Pincode" />
      <input aria-label="Address line" required value={form.line} onChange={(e) => update("line", e.target.value)} className="rounded-md border px-3 py-2 md:col-span-2" placeholder="House / apartment / street" />
      <input aria-label="City" required value={form.city} onChange={(e) => update("city", e.target.value)} className="rounded-md border px-3 py-2" placeholder="City" />
      <input aria-label="State" value={form.state || ""} onChange={(e) => update("state", e.target.value)} className="rounded-md border px-3 py-2" placeholder="State" />
      <input aria-label="Landmark" value={form.landmark || ""} onChange={(e) => update("landmark", e.target.value)} className="rounded-md border px-3 py-2 md:col-span-2" placeholder="Landmark optional" />
      <label className="flex items-center gap-2 text-sm font-bold"><input checked={Boolean(form.isDefault)} onChange={(e) => update("isDefault", e.target.checked)} type="checkbox" /> Default address</label>
      <div className="flex justify-end gap-2 md:col-span-2"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button variant="gold">Save address</Button></div>
    </form>
  );
}

function AddressManager({ selectedId, onSelect }: { selectedId?: string; onSelect?: (address: Address) => void }) {
  const { addresses, addAddress, updateAddress, deleteAddress } = useStore();
  const [mode, setMode] = useState<"new" | null>(null);
  const [editing, setEditing] = useState<Address | null>(null);
  const save = (address: AddressInput | Address) => {
    if ("id" in address) updateAddress(address);
    else addAddress(address);
    setMode(null);
    setEditing(null);
  };
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="display-font text-xl font-bold">Delivery Address</h2><p className="text-sm text-black/55">Add, update, delete, and select a serviceable delivery address.</p></div>
        <Button variant="outline" onClick={() => { setEditing(null); setMode("new"); }}><Plus size={16} /> Add address</Button>
      </div>
      {mode === "new" && <AddressForm onCancel={() => setMode(null)} onSave={save} />}
      {editing && <AddressForm initial={editing} onCancel={() => setEditing(null)} onSave={save} />}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {addresses.map((a) => (
          <div key={a.id} className={`rounded-md border p-4 text-left ${selectedId === a.id ? "border-[#d4af37] bg-[#fff8df]" : "border-[#eadfca] bg-white"}`}>
            <button type="button" onClick={() => onSelect?.(a)} className="w-full text-left">
              <div className="flex items-center justify-between gap-2"><b>{a.label}</b>{a.isDefault && <span className="rounded-full bg-black px-2 py-1 text-[10px] font-bold uppercase text-white">Default</span>}</div>
              <p className="mt-1 text-sm font-semibold">{a.name} | {a.phone}</p>
              <p className="text-sm text-black/65">{a.line}, {a.city} - {a.pincode}</p>
              {a.landmark && <p className="text-xs text-black/50">Landmark: {a.landmark}</p>}
              <p className="mt-2 text-xs text-green-700">Serviceable pincode</p>
            </button>
            <div className="mt-3 flex gap-2"><Button variant="outline" onClick={() => { setMode(null); setEditing(a); }}>Edit</Button><Button variant="ghost" onClick={() => deleteAddress(a.id)}>Delete</Button></div>
          </div>
        ))}
      </div>
      {!addresses.length && mode !== "new" && <Empty title="No saved addresses" cta="Add address" href="/account/addresses" />}
    </div>
  );
}

function CheckoutPage() {
  const { customer, cart, products, coupons, addresses, placeOrder, placeBackendCodOrder, refreshCustomerData, toast } = useStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [address, setAddress] = useState<Address | null>(addresses[0] || null);
  const [payment, setPayment] = useState<"COD" | "Razorpay">(searchParams.get("payment") === "razorpay" ? "Razorpay" : "COD");
  const [deliveryDate, setDeliveryDate] = useState(defaultDeliveryDate);
  const [slot, setSlot] = useState(deliverySlots[0]);
  const [slotId, setSlotId] = useState("");
  const [remoteSlots, setRemoteSlots] = useState<{ id: string; label: string; startTime?: string; endTime?: string }[]>([]);
  const [placing, setPlacing] = useState(false);
  const [processing, setProcessing] = useState<{ label: string; amount?: number; orderNumber?: string } | null>(null);
  const [cancelled, setCancelled] = useState<RazorpayCreateOrderResponse | null>(null);
  const [terms, setTerms] = useState(false);
  const t = totals(cart, products, coupons);
  const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "";
  const minDeliveryDate = todayLocalDate();
  const deliveryDateIsPast = isPastDeliveryDate(deliveryDate);
  const selectDeliveryDate = (value: string) => {
    if (isPastDeliveryDate(value)) {
      setDeliveryDate(minDeliveryDate);
      setRemoteSlots([]);
      setSlotId("");
      toast("Past delivery dates are not available. Please choose today or a future date.", "error");
      return;
    }
    setDeliveryDate(value);
  };
  useEffect(() => {
    if (!addresses.length) {
      setAddress(null);
      return;
    }
    const fresh = addresses.find((item) => item.id === address?.id);
    setAddress(fresh || addresses[0]);
  }, [addresses, address?.id]);
  useEffect(() => {
    checkoutSummary().then((summary) => {
      if (summary.addresses[0]) setAddress(summary.addresses[0]);
      if (summary.deliverySlots[0]) {
        setRemoteSlots(summary.deliverySlots);
        setSlot(summary.deliverySlots[0].label);
        setSlotId(summary.deliverySlots[0].id);
      }
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!address?.pincode) return;
    if (deliveryDateIsPast) {
      setRemoteSlots([]);
      setSlotId("");
      return;
    }
    fetchDeliverySlots(address.pincode, deliveryDate).then((result) => {
      if (result.slots?.length) {
        setRemoteSlots(result.slots);
        setSlot(result.slots[0].label);
        setSlotId(result.slots[0].id);
      } else {
        setRemoteSlots([]);
        setSlotId("");
        toast("Delivery slots are not available for this pincode.", "error");
      }
    }).catch((error) => {
      setRemoteSlots([]);
      setSlotId("");
      toast(error instanceof Error ? error.message : "Delivery slots are not available.", "error");
    });
  }, [address?.pincode, deliveryDate, deliveryDateIsPast, toast]);
  const startRazorpay = async () => {
    if (placing) return;
    if (!terms) return toast("Please accept terms to place the order.", "error");
    if (!address) {
      setStep(1);
      return toast("Please add or select a delivery address.", "error");
    }
    if (deliveryDateIsPast) {
      setStep(2);
      return toast("Past delivery dates are not available. Please choose today or a future date.", "error");
    }
    if (!slotId) {
      setStep(2);
      return toast("Please select a delivery slot.", "error");
    }
    setPlacing(true);
    setCancelled(null);
    let created: RazorpayCreateOrderResponse | null = null;
    try {
      setProcessing({ label: "Creating secure payment...", amount: t.total });
      created = await createRazorpayOrder({ addressId: address.id, deliverySlotId: slotId, deliveryDate });
      setProcessing({ label: "Loading Razorpay...", amount: created.amount, orderNumber: created.orderNumber });
      await loadRazorpayScript();
      if (!window.Razorpay || !(created.keyId || razorpayKey)) throw new Error("Unable to load Razorpay. Please try again or choose Cash on Delivery.");
      setProcessing({ label: "Opening Razorpay checkout...", amount: created.amount, orderNumber: created.orderNumber });
      const checkout = new window.Razorpay({
        key: created.keyId || razorpayKey,
        amount: Math.round(created.amount * 100),
        currency: created.currency,
        name: "Eagle Mart",
        description: "Eagle Mart Grocery & Essentials secure checkout",
        order_id: created.razorpayOrderId,
        prefill: created.prefill,
        notes: { orderNumber: created.orderNumber },
        theme: { color: "#d4af37" },
        handler: async (response) => {
          try {
            setProcessing({ label: "Verifying your payment...", amount: created!.amount, orderNumber: created!.orderNumber });
            const verified = await verifyRazorpayPayment({ orderNumber: created!.orderNumber, ...response });
            if (verified.order) window.sessionStorage.setItem("eagle-last-order", JSON.stringify(verified.order));
            await refreshCustomerData();
            toast("Payment verified successfully", "success");
            router.push(`/order-success/${created!.orderNumber}`);
          } catch (error) {
            toast(error instanceof Error ? error.message : "Payment failed. Your cart is safe.", "error");
            router.push(`/payment-failed?orderNumber=${encodeURIComponent(created!.orderNumber)}&reason=${encodeURIComponent(error instanceof Error ? error.message : "Payment verification failed")}`);
          } finally {
            setProcessing(null);
            setPlacing(false);
          }
        },
        modal: {
          ondismiss: () => {
            if (created) setCancelled(created);
            setProcessing(null);
            setPlacing(false);
          },
        },
      });
      checkout.on("payment.failed", async (response: any) => {
        if (!created) return;
        await markRazorpayFailed({ orderNumber: created.orderNumber, razorpay_order_id: created.razorpayOrderId, errorCode: response?.error?.code, errorDescription: response?.error?.description, metadata: response });
        setProcessing(null);
        setPlacing(false);
        toast("Payment failed. Your cart is safe.", "error");
        router.push(`/payment-failed?orderNumber=${encodeURIComponent(created.orderNumber)}&reason=${encodeURIComponent(response?.error?.description || "Payment failed")}`);
      });
      checkout.open();
    } catch (error) {
      setProcessing(null);
      setPlacing(false);
      if (created) await markRazorpayFailed({ orderNumber: created.orderNumber, razorpay_order_id: created.razorpayOrderId, errorDescription: error instanceof Error ? error.message : "Payment failed" }).catch(() => undefined);
      toast(error instanceof Error ? error.message : "Unable to load Razorpay. Please try again or choose Cash on Delivery.", "error");
    }
  };
  const finish = async (success = true) => {
    if (!success) return router.push("/payment-failed");
    if (!terms) return toast("Please accept terms to place the order.", "error");
    if (!address) {
      setStep(1);
      return toast("Please add or select a delivery address.", "error");
    }
    if (deliveryDateIsPast) {
      setStep(2);
      return toast("Past delivery dates are not available. Please choose today or a future date.", "error");
    }
    if (payment === "Razorpay") return startRazorpay();
    setPlacing(true);
    let order: Order;
    try {
      if (!address?.id || !slotId) throw new Error("Checkout requires a saved address and delivery slot from the database.");
      order = await placeBackendCodOrder({ addressId: address.id, deliverySlotId: slotId, deliveryDate });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not place order.", "error");
      setPlacing(false);
      return;
    }
    router.push(`/order-success/${order.orderNumber}`);
  };
  if (!customer) {
    return <CustomerShell><main className="container-premium flex min-h-[60vh] items-center justify-center py-10"><section className="premium-card max-w-lg p-8 text-center"><User className="mx-auto text-[#8a6500]" size={46} /><h1 className="display-font mt-4 text-3xl font-black">Login Required</h1><p className="mt-2 text-black/60">Please login first to checkout, manage cart, and place orders.</p><div className="mt-6 flex justify-center gap-3"><Link href="/login"><Button variant="gold">Login</Button></Link><Link href="/signup"><Button variant="outline">Create Account</Button></Link></div></section></main></CustomerShell>;
  }
  return <CustomerShell><main className="container-premium py-8"><BackNav fallback="/cart" label="Back to cart" /><h1 className="display-font text-3xl font-black">Secure Checkout</h1><div className="mt-4 max-w-lg"><PincodeChecker /></div><div className="responsive-scroll mt-4 flex gap-2 overflow-x-auto pb-1">{["Address", "Delivery Slot", "Payment", "Review"].map((x, i) => <button key={x} onClick={() => setStep(i + 1)} className={`min-w-fit rounded-full px-3 py-2 text-xs font-bold ${step === i + 1 ? "bg-black text-white" : "bg-white"}`}>{i + 1}. {x}</button>)}</div><div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"><section className="premium-card min-w-0 p-4 sm:p-5">{step === 1 && <AddressManager selectedId={address?.id} onSelect={setAddress} />}{step === 2 && <div><h2 className="display-font text-xl font-bold">Delivery Slot</h2><label className="mt-4 block text-sm font-bold">Delivery date<input aria-label="Delivery date" type="date" min={minDeliveryDate} value={deliveryDate} onChange={(event) => selectDeliveryDate(event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 sm:w-auto" /></label>{deliveryDateIsPast && <p className="mt-2 text-sm font-bold text-red-600">Past delivery dates are not available.</p>}{remoteSlots.length && !deliveryDateIsPast ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{remoteSlots.map((remote) => <button key={remote.id} disabled={deliveryDateIsPast} onClick={() => { setSlot(remote.label); setSlotId(remote.id); }} className={`rounded-md border p-4 text-left disabled:cursor-not-allowed disabled:opacity-50 ${slotId === remote.id ? "border-[#d4af37] bg-[#fff8df]" : "bg-white"}`}><Truck className="mb-2" /><b>{remote.label}</b>{remote.startTime && remote.endTime && <span className="mt-1 block text-sm text-black/55">{remote.startTime} - {remote.endTime}</span>}</button>)}</div> : <div className="mt-4 rounded-md border border-[#eadfca] bg-white p-4 text-sm font-semibold text-black/60">Select a saved India address and a valid delivery date to load delivery slots.</div>}</div>}{step === 3 && <div><h2 className="display-font text-xl font-bold">Payment Method</h2><div className="mt-4 grid gap-3 md:grid-cols-2"><PaymentCard active={payment === "COD"} title="Cash on Delivery" text="Pay when your groceries arrive." onClick={() => setPayment("COD")}><div className="mt-3 rounded-md bg-black/5 p-3 text-xs font-bold text-black/60">No online payment needed. COD pending until delivery.</div></PaymentCard><PaymentCard active={payment === "Razorpay"} title="Razorpay Online Payment" text="Pay securely using UPI, cards, net banking or wallets." onClick={() => setPayment("Razorpay")}><div className="mt-3 flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-white px-2 py-1">UPI</span><span className="rounded-full bg-white px-2 py-1">Cards</span><span className="rounded-full bg-white px-2 py-1">Net Banking</span><span className="rounded-full bg-white px-2 py-1">Wallets</span></div><div className="mt-3 flex items-center gap-2 text-xs font-bold text-green-700"><ShieldCheck size={16} />100% secure payment powered by Razorpay</div><p className="mt-3 rounded-md bg-green-50 p-3 text-xs font-bold text-green-800">Secure checkout will open after you confirm the order.</p></PaymentCard></div>{payment === "Razorpay" && <Button className="mt-5 w-full sm:w-auto" variant="gold" disabled={placing || !address || !slotId || deliveryDateIsPast} onClick={startRazorpay}>{placing ? "Creating secure payment..." : `Pay Securely ${money(t.total)}`}</Button>}</div>}{step === 4 && <div><h2 className="display-font text-xl font-bold">Review Order</h2><p className="mt-2 text-sm text-black/60">{cart.length} items, delivery {deliveryDate} at {slot}, payment {payment}</p>{address && <p className="mt-2 text-sm text-black/60">Deliver to {address.name}, {address.line}, {address.city} - {address.pincode}</p>}<label className="mt-5 flex gap-2 text-sm"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> I agree to terms, easy cancellation, and freshness policy.</label><Button variant="gold" className="mt-5 w-full sm:w-auto" onClick={() => finish(true)} disabled={placing || deliveryDateIsPast}>{placing ? payment === "Razorpay" ? "Creating secure payment..." : "Placing..." : payment === "Razorpay" ? `Pay Securely ${money(t.total)}` : "Place COD Order"}</Button></div>}<div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:justify-between"><Button variant="ghost" onClick={() => setStep(Math.max(1, step - 1))}>Back</Button><Button onClick={() => setStep(Math.min(4, step + 1))}>Next</Button></div></section><Summary t={t} code="" coupons={coupons} setCode={() => {}} applyCoupon={() => {}} /></div></main>{processing && <RazorpayProcessing state={processing} />}{cancelled && <PaymentCancelledModal onRetry={() => { const next = cancelled; setCancelled(null); if (next) startRazorpay(); }} onCod={() => { setCancelled(null); setPayment("COD"); setStep(3); }} onShop={() => router.push("/products")} />}</CustomerShell>;
}

function storedOrder(number?: string) {
  if (typeof window === "undefined" || !number) return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem("eagle-last-order") || "null") as Order | null;
    return parsed?.orderNumber === number ? parsed : null;
  } catch {
    return null;
  }
}

function PaymentCard({ active, title, text, children, disabled, onClick }: { active: boolean; title: string; text: string; children?: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-md border p-4 text-left transition ${active ? "border-[#d4af37] bg-[#fff8df]" : "border-[#eadfca] bg-white hover:border-[#d4af37]"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}><div className="flex items-start justify-between gap-3"><div><h3 className="display-font text-lg font-black">{title}</h3><p className="mt-1 text-sm text-black/60">{text}</p></div><span className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-black ${active ? "border-[#d4af37] bg-[#d4af37] text-black" : "border-black/20"}`}>{active ? "✓" : ""}</span></div>{children}</button>;
}

function RazorpayProcessing({ state }: { state: { label: string; amount?: number; orderNumber?: string } }) {
  return <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"><section className="w-full max-w-md rounded-md border border-[#d4af37]/30 bg-[#111] p-6 text-center text-white shadow-2xl"><Logo invert /><div className="mx-auto mt-6 h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-[#d4af37]" /><h2 className="display-font mt-5 text-2xl font-black">{state.label}</h2>{state.amount != null && <p className="mt-2 text-[#e7c766]">{money(state.amount)}</p>}{state.orderNumber && <p className="mt-1 text-sm text-white/55">Order {state.orderNumber}</p>}<p className="mt-5 rounded-md bg-white/5 p-3 text-sm text-white/65">Please do not refresh. Your payment is being protected by secure verification.</p></section></div>;
}

function PaymentCancelledModal({ onRetry, onCod, onShop }: { onRetry: () => void; onCod: () => void; onShop: () => void }) {
  return <div className="fixed inset-0 z-[110] grid place-items-center bg-black/65 p-4 backdrop-blur-sm"><section className="w-full max-w-lg rounded-md bg-white p-6 text-black shadow-2xl"><p className="text-xs font-bold uppercase text-[#8a6500]">Payment Cancelled</p><h2 className="display-font mt-2 text-3xl font-black">Your cart is still saved</h2><p className="mt-2 text-black/60">You closed the payment window before completing payment. Retry online payment or choose Cash on Delivery.</p><div className="mt-5 grid gap-2 sm:grid-cols-3"><Button variant="gold" onClick={onRetry}>Retry Online Payment</Button><Button variant="outline" onClick={onCod}>Switch to COD</Button><Button variant="ghost" onClick={onShop}>Continue Shopping</Button></div></section></div>;
}

function OrderSuccess({ number }: { number?: string }) {
  const { orders, products } = useStore();
  const [remoteOrder, setRemoteOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(Boolean(number));
  useEffect(() => {
    const cached = storedOrder(number);
    if (cached) setRemoteOrder(cached);
    if (!number) {
      setLoading(false);
      return;
    }
    fetchOrder(number)
      .then(setRemoteOrder)
      .catch(() => fetchAdminOrder(number).then(setRemoteOrder).catch(() => undefined))
      .finally(() => setLoading(false));
  }, [number]);
  const order = remoteOrder || orders.find((o) => o.orderNumber === number) || (!number ? orders[0] : null);
  if (loading && !order) return <CustomerShell><main className="container-premium py-10"><section className="premium-card mx-auto max-w-xl p-8 text-center"><PackageCheck className="mx-auto text-[#8a6500]" size={52} /><h1 className="display-font mt-4 text-3xl font-black">Confirming your order</h1><p className="mt-2 text-black/60">Please wait while we load your order details.</p></section></main></CustomerShell>;
  if (!order) return <CustomerShell><main className="container-premium py-10"><Empty title="Order not available" cta="Go to orders" href="/orders" /></main></CustomerShell>;
  return <CustomerShell><main className="container-premium py-10"><BackNav fallback="/orders" label="Back to orders" /><section className="premium-card mx-auto max-w-3xl p-8 text-center"><PackageCheck className="mx-auto text-green-700" size={60} /><h1 className="display-font mt-4 text-3xl font-black">{order.paymentMethod === "Razorpay" ? "Payment Successful" : "Order Confirmed"}</h1><p className="mt-2">Order number <b>{order.orderNumber}</b></p><p className="text-sm text-black/60">{order.paymentMethod} | {order.paymentStatus} | {order.deliverySlot} | {order.address.line}</p>{order.paymentMethod === "Razorpay" && <div className="mt-5 grid gap-3 rounded-md bg-green-50 p-4 text-left text-sm md:grid-cols-3"><div><p className="text-black/50">Amount paid</p><b>{money(order.grandTotal || 0)}</b></div><div><p className="text-black/50">Payment ID</p><b className="break-all">{order.razorpayPaymentId || "Processing"}</b></div><div><p className="text-black/50">Status</p><b className="text-green-700">{order.paymentStatus}</b></div></div>}<OrderMini order={order} products={products} /><div className="mt-6 flex flex-wrap justify-center gap-3"><Link href={`/track-order/${order.orderNumber}`}><Button>Track Order</Button></Link>{canShowInvoice(order) && <Link href={`/invoice/${order.orderNumber}`}><Button variant="gold">View Invoice</Button></Link>}<Link href="/products"><Button variant="outline">Continue Shopping</Button></Link></div></section></main></CustomerShell>;
}

function PaymentFailed() {
  const params = useSearchParams();
  const router = useRouter();
  const orderNumber = params.get("orderNumber");
  const reason = params.get("reason");
  useEffect(() => {
    const id = window.setTimeout(() => router.replace("/products"), 1800);
    return () => window.clearTimeout(id);
  }, [router]);
  return <CustomerShell><main className="container-premium py-10"><section className="premium-card mx-auto max-w-2xl p-8 text-center"><X className="mx-auto text-red-600" size={56} /><h1 className="display-font mt-4 text-3xl font-black">Payment Failed</h1>{orderNumber && <p className="mt-2 font-bold text-[#8a6500]">Order {orderNumber}</p>}<p className="mt-2 text-black/65">{reason || "Your cart is safe. You can retry payment or choose Cash on Delivery."}</p><p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">No invoice is generated for failed payments. Redirecting you back to shopping.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link href="/products"><Button variant="gold">Continue Shopping</Button></Link><Link href="/cart"><Button variant="outline">Back to Cart</Button></Link><Link href="/contact"><Button variant="ghost">Contact Support</Button></Link></div></section></main></CustomerShell>;
}

function TrackOrder({ number }: { number?: string }) {
  const { orders, products } = useStore();
  const [remoteOrder, setRemoteOrder] = useState<Order | null>(null);
  useEffect(() => { if (number) fetchTracking(number).then((data) => setRemoteOrder(data.order)).catch(() => undefined); }, [number]);
  const order = remoteOrder || orders.find((o) => o.orderNumber === number) || orders[0];
  if (!order) return <CustomerShell><main className="container-premium py-10"><Empty title="Tracking not available" cta="Go to orders" href="/orders" /></main></CustomerShell>;
  const steps = ["Placed", "Confirmed", "Packed", "Out for Delivery", "Delivered"];
  const current = steps.indexOf(order.status);
  return <CustomerShell><main className="container-premium py-8"><BackNav fallback="/orders" label="Back to orders" /><h1 className="display-font text-3xl font-black">Track Order {order.orderNumber}</h1><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]"><section className="premium-card p-6">{steps.map((s, i) => <div key={s} className="flex gap-4 pb-6"><div className={`h-8 w-8 rounded-full ${i <= current || ["Return Requested", "Refunded"].includes(order.status) ? "bg-[#d4af37]" : "bg-black/10"}`} /><div><h3 className="font-bold">{s}</h3><p className="text-sm text-black/55">{i <= current || ["Return Requested", "Refunded"].includes(order.status) ? "Completed" : "Pending"}</p></div></div>)}<p className="rounded-md bg-green-50 p-3 text-sm text-green-800">Delivery staff: {order.deliveryStaff || "Assigned by store"}. Estimated delivery: {order.deliveryDate}, {order.deliverySlot}</p>{Boolean(order.returns?.length) && <div className="mt-5 rounded-md border border-[#eadfca] bg-[#fffaf0] p-4"><h3 className="display-font text-xl font-black">Return & refund tracking</h3>{order.returns?.map((item) => { const refund = item.refunds?.[0]; const returnSteps = ["REQUESTED", "APPROVED", "COMPLETED"]; const returnIndex = returnSteps.indexOf(item.status); return <div key={item.id} className="mt-4 border-t pt-4"><p className="font-bold">{item.orderItemId ? order.items.find((orderItem) => orderItem.id === item.orderItemId)?.name || "Selected item" : "Full order"}</p><p className="text-sm text-black/60">{item.reason}</p><div className="mt-3 grid gap-2 sm:grid-cols-3">{returnSteps.map((step, index) => <div key={step} className={`rounded-md border p-3 text-sm ${index <= returnIndex ? "border-[#d4af37] bg-white" : "border-black/10 bg-black/[0.03]"}`}><b>{step === "REQUESTED" ? "Requested" : step === "APPROVED" ? "Approved" : "Product received"}</b><p className="text-xs text-black/50">{index <= returnIndex ? "Done" : "Pending"}</p></div>)}</div>{item.bankDetails && <p className="mt-3 rounded-md bg-white p-3 text-sm">Refund bank: <b>{item.bankDetails.bankName}</b> · A/C {item.bankDetails.accountNumberMasked} · IFSC {item.bankDetails.ifsc}</p>}{refund ? <p className="mt-3 rounded-md bg-white p-3 text-sm">Refund: <b>{money(refund.amount)}</b> · <b>{refund.status.replace("_", " ")}</b></p> : <p className="mt-3 rounded-md bg-white p-3 text-sm text-black/60">Refund will be created after admin approves your return request.</p>}</div>; })}</div>}</section><OrderMini order={order} products={products} /></div></main></CustomerShell>;
}

const blankReturnBank = { bankAccountHolder: "", bankName: "", bankAccountNumber: "", bankIfsc: "" };

function validateReturnBank(input: typeof blankReturnBank) {
  if (input.bankAccountHolder.trim().length < 2) return "Enter the bank account holder name.";
  if (input.bankName.trim().length < 2) return "Enter the bank name.";
  if (!/^\d{9,18}$/.test(input.bankAccountNumber.trim())) return "Enter a valid bank account number.";
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(input.bankIfsc.trim().toUpperCase())) return "Enter a valid IFSC code.";
  return "";
}

function OrdersPage() {
  const { orders, products, coupons, reorder, toast } = useStore();
  const [remoteOrders, setRemoteOrders] = useState<Order[]>([]);
  const [returningOrder, setReturningOrder] = useState<string | null>(null);
  const [returnItemId, setReturnItemId] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returnBank, setReturnBank] = useState(blankReturnBank);
  const [savingReturn, setSavingReturn] = useState(false);
  useEffect(() => { fetchOrders().then(setRemoteOrders).catch(() => undefined); }, []);
  const list = remoteOrders.length ? remoteOrders : orders;
  const submitReturn = async (order: Order) => {
    if (returnReason.trim().length < 10) {
      toast("Please add a return reason with at least 10 characters.", "error");
      return;
    }
    const bankError = validateReturnBank(returnBank);
    if (bankError) return toast(bankError, "error");
    setSavingReturn(true);
    try {
      const updated = await requestReturnBackend(order.orderNumber, { orderItemId: returnItemId || null, reason: returnReason.trim(), bankAccountHolder: returnBank.bankAccountHolder.trim(), bankName: returnBank.bankName.trim(), bankAccountNumber: returnBank.bankAccountNumber.trim(), bankIfsc: returnBank.bankIfsc.trim().toUpperCase() });
      setRemoteOrders((current) => (current.length ? current : list).map((item) => item.orderNumber === updated.orderNumber ? updated : item));
      setReturningOrder(null);
      setReturnItemId("");
      setReturnReason("");
      setReturnBank(blankReturnBank);
      toast("Return request submitted. Our team will review it from the admin dashboard.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not request return.", "error");
    } finally {
      setSavingReturn(false);
    }
  };
  return <CustomerShell><main className="container-premium py-8"><BackNav fallback="/account" label="Back to account" /><h1 className="display-font text-3xl font-black">My Orders</h1><div className="mt-6 grid gap-4">{list.map((o) => {
    const activeReturns = (o.returns || []).filter((item) => item.status !== "REJECTED");
    const canReturn = o.status === "Delivered" && !activeReturns.some((item) => item.status !== "COMPLETED");
    const isReturning = returningOrder === o.orderNumber;
    return <div key={o.orderNumber} className="premium-card p-5"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="display-font font-bold">{o.orderNumber}</h3><p className="text-sm text-black/55">{o.items.length} items | {money(o.grandTotal || totals(o.items, products, coupons, o.couponCode).total)}</p><p className="mt-1 text-xs font-bold text-black/50">{o.paymentMethod} payment {o.razorpayPaymentId ? `| ${o.razorpayPaymentId}` : ""}</p></div><div className="flex gap-2"><StatusBadge value={o.status} /><StatusBadge value={o.paymentStatus} /></div></div>{activeReturns.length > 0 && <div className="mt-4 rounded-md border border-[#e6d7aa] bg-[#fffaf0] p-3 text-sm"><p className="font-bold">Return and refund status</p>{activeReturns.map((item) => { const refund = item.refunds?.[0]; return <p key={item.id} className="mt-1 text-black/65">{item.orderItemId ? o.items.find((orderItem) => orderItem.id === item.orderItemId)?.name || "Selected item" : "Full order"}: <span className="font-bold text-[#8a6500]"> {item.status.replace("_", " ")}</span>{refund ? <span> · Refund {money(refund.amount)} {refund.status.replace("_", " ")}</span> : <span> · Refund starts after approval</span>}</p>; })}</div>}<div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => reorder(o)}><RotateCcw size={16} /> Reorder</Button><Link href={`/track-order/${o.orderNumber}`}><Button>Track</Button></Link>{canShowInvoice(o) && <Link href={`/invoice/${o.orderNumber}`}><Button variant="gold"><FileText size={16} /> Invoice</Button></Link>}{o.paymentStatus === "Failed" && <><Link href="/checkout?payment=razorpay"><Button variant="gold">Retry Payment</Button></Link><Link href="/checkout?payment=cod"><Button variant="outline">Choose COD</Button></Link></>}{canReturn && <Button variant="ghost" onClick={() => { setReturningOrder(isReturning ? null : o.orderNumber); setReturnItemId(""); setReturnReason(""); setReturnBank(blankReturnBank); }}><PackageCheck size={16} /> Request return</Button>}</div>{isReturning && <div className="mt-4 grid gap-3 rounded-md border bg-white p-4"><label className="grid gap-1 text-sm font-bold">Return selection<select value={returnItemId} onChange={(event) => setReturnItemId(event.target.value)} className="rounded-md border px-3 py-2 font-normal"><option value="">Full order</option>{o.items.map((item) => <option key={item.id || item.sku} value={item.id}>{item.name || item.sku} {item.unit ? `- ${item.unit}` : ""}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Reason<textarea value={returnReason} onChange={(event) => setReturnReason(event.target.value)} rows={3} className="rounded-md border px-3 py-2 font-normal" placeholder="Tell us what went wrong with the delivered product" /></label><div className="grid gap-3 md:grid-cols-2"><input value={returnBank.bankAccountHolder} onChange={(e) => setReturnBank({ ...returnBank, bankAccountHolder: e.target.value })} className="rounded-md border px-3 py-2" placeholder="Account holder name" /><input value={returnBank.bankName} onChange={(e) => setReturnBank({ ...returnBank, bankName: e.target.value })} className="rounded-md border px-3 py-2" placeholder="Bank name" /><input value={returnBank.bankAccountNumber} onChange={(e) => setReturnBank({ ...returnBank, bankAccountNumber: e.target.value.replace(/\D/g, "").slice(0, 18) })} className="rounded-md border px-3 py-2" placeholder="Account number" /><input value={returnBank.bankIfsc} onChange={(e) => setReturnBank({ ...returnBank, bankIfsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })} className="rounded-md border px-3 py-2" placeholder="IFSC code" /></div><p className="text-sm text-black/55">Bank details are saved with this return request and shown only to authorized admin staff for refund processing.</p><div className="flex flex-wrap gap-2"><Button variant="gold" disabled={savingReturn} onClick={() => submitReturn(o)}>{savingReturn ? "Submitting..." : "Submit return"}</Button><Button variant="outline" disabled={savingReturn} onClick={() => setReturningOrder(null)}>Cancel</Button></div></div>}</div>;
  })}</div></main></CustomerShell>;
}

function InvoicePage({ number }: { number?: string }) {
  const { orders, products, coupons } = useStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldAutoPrint = searchParams.get("print") === "1";
  const [remoteOrder, setRemoteOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(Boolean(number));
  useEffect(() => {
    const cached = storedOrder(number);
    if (cached) setRemoteOrder(cached);
    if (!number) {
      setLoading(false);
      return;
    }
    fetchOrder(number)
      .then(setRemoteOrder)
      .catch(() => fetchAdminOrder(number).then(setRemoteOrder).catch(() => undefined))
      .finally(() => setLoading(false));
  }, [number]);
  const order = remoteOrder || orders.find((o) => o.orderNumber === number) || (!number ? orders[0] : null);
  useEffect(() => {
    if (order && !canShowInvoice(order)) router.replace("/products");
  }, [order, router]);
  const printInvoice = () => window.print();
  const downloadPdf = () => {
    if (!order) return;
    const previousTitle = document.title;
    document.title = `Invoice-${order.orderNumber}-Eagle-Mart`;
    window.print();
    window.setTimeout(() => { document.title = previousTitle; }, 600);
  };
  useEffect(() => {
    if (!order || !shouldAutoPrint || !canShowInvoice(order)) return;
    const timer = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(timer);
  }, [order, shouldAutoPrint]);
  if (loading && !order) return <CustomerShell><main className="container-premium py-10"><section className="premium-card mx-auto max-w-xl p-8 text-center"><FileText className="mx-auto text-[#8a6500]" size={52} /><h1 className="display-font mt-4 text-3xl font-black">Loading invoice</h1><p className="mt-2 text-black/60">Please wait while we load your invoice details.</p></section></main></CustomerShell>;
  if (!order) return <CustomerShell><main className="container-premium py-10"><Empty title="Invoice not available" cta="Go to orders" href="/orders" /></main></CustomerShell>;
  if (!canShowInvoice(order)) return <CustomerShell><main className="container-premium py-10"><Empty title="Invoice not available for failed payment" cta="Continue shopping" href="/products" /></main></CustomerShell>;
  const rows = order.items.map((item, index) => {
    const product = products.find((entry) => entry.id === item.productId);
    const price = itemPrice(item, products);
    const mrp = itemMrp(item, products);
    const gstRate = item.gst ?? product?.gst ?? 0;
    const tax = Math.round(price * item.qty * (gstRate / 100));
    return {
      index: index + 1,
      name: item.name || product?.name || "Order item",
      sku: item.sku || product?.sku || "-",
      unit: itemUnit(item, product) || "-",
      qty: item.qty,
      mrp,
      price,
      discount: Math.max(0, (mrp - price) * item.qty),
      gstRate,
      tax,
      lineTotal: item.lineTotal ?? price * item.qty,
    };
  });
  const snapshotSubtotal = rows.reduce((sum, item) => sum + item.price * item.qty, 0);
  const snapshotMrp = rows.reduce((sum, item) => sum + item.mrp * item.qty, 0);
  const t = order.grandTotal ? {
    subtotal: order.subtotal ?? snapshotSubtotal,
    discount: order.discount ?? Math.max(0, snapshotMrp - snapshotSubtotal),
    couponDiscount: order.couponDiscount ?? 0,
    gst: order.gstTotal ?? rows.reduce((sum, item) => sum + item.tax, 0),
    delivery: order.deliveryCharge ?? 0,
    handling: order.handlingCharge ?? 0,
    total: order.grandTotal,
  } : totals(order.items, products, coupons, order.couponCode);
  return (
    <CustomerShell>
      <main className="invoice-page container-premium py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 no-print">
          <BackNav fallback="/orders" label="Back to orders" />
          <div className="flex gap-2">
            <Button onClick={printInvoice}>Print Invoice</Button>
            <Button variant="outline" onClick={downloadPdf}>Download PDF</Button>
          </div>
        </div>
        <section className="invoice-print-root premium-card bg-white p-4 text-black md:p-8">
          <div className="flex flex-col justify-between gap-5 border-b border-[#eadfca] pb-6 md:flex-row">
            <div><Logo /><p className="mt-4 font-bold">Eagle Mart Grocery & Essentials</p><p className="text-sm text-black/60">123, Premium Supermarket Tower, S.G. Highway, Ahmedabad, Gujarat - 380001</p><p className="text-sm text-black/60">GSTIN: 24ABCDE1234F1Z5 | support@eaglemart.in</p></div>
            <div className="rounded-md bg-black p-5 text-white md:text-right"><p className="text-xs font-bold uppercase text-[#d4af37]">TAX INVOICE</p><h1 className="display-font mt-1 text-2xl font-black">{order.invoiceNumber || `INV-${order.orderNumber}`}</h1><p className="mt-2 text-sm text-white/70">Invoice date: {new Date(order.invoiceDate || order.createdAt).toLocaleDateString("en-IN")}</p><p className="text-sm text-white/70">Order: {order.orderNumber}</p></div>
          </div>
          <div className="mt-6 grid gap-4 text-sm md:grid-cols-3">
            <div className="rounded-md border border-[#eadfca] p-4"><b>Customer Details</b><p className="mt-2">{order.customerName}</p><p>{order.address.phone}</p></div>
            <div className="rounded-md border border-[#eadfca] p-4"><b>Billing Address</b><p className="mt-2">{order.address.name}</p><p>{order.address.line}, {order.address.city}, {order.address.state || "Gujarat"} - {order.address.pincode}</p></div>
            <div className="rounded-md border border-[#eadfca] p-4"><b>Shipping Address</b><p className="mt-2">{order.address.line}</p><p>{order.address.city} - {order.address.pincode}</p></div>
          </div>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">{[["Payment method", order.paymentMethod], ["Payment status", order.paymentStatus], ["Order status", order.status], ["Order date", new Date(order.createdAt).toLocaleDateString("en-IN")]].map(([label, value]) => <div key={label} className="rounded-md bg-[#faf7ef] p-3"><p className="text-xs text-black/50">{label}</p><b>{value}</b></div>)}</div>
          <div className="responsive-scroll mt-6 overflow-x-auto invoice-table-wrap"><table className="invoice-print-table w-full min-w-[1080px] border-collapse text-left text-xs"><thead className="bg-black text-white"><tr>{["Sr. No.", "Product", "SKU", "Unit", "Qty", "MRP", "Selling", "Discount", "GST %", "Tax", "Line Total"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map((item) => <tr key={`${item.sku}-${item.index}`} className="border-b odd:bg-white even:bg-[#faf7ef]"><td className="p-3">{item.index}</td><td className="font-bold">{item.name}</td><td>{item.sku}</td><td>{item.unit}</td><td>{item.qty}</td><td>{money(item.mrp)}</td><td>{money(item.price)}</td><td>{money(item.discount)}</td><td>{item.gstRate}%</td><td>{money(item.tax)}</td><td className="font-bold">{money(item.lineTotal + item.tax)}</td></tr>)}</tbody></table><p className="scroll-hint mt-2 sm:hidden">Swipe or drag sideways to view the full invoice.</p></div>
          <div className="ml-auto mt-6 max-w-md space-y-2 rounded-md border border-[#eadfca] bg-[#faf7ef] p-5 text-sm"><div className="flex justify-between"><span>Subtotal</span><b>{money(t.subtotal)}</b></div><div className="flex justify-between"><span>Product Discount</span><b>-{money(t.discount)}</b></div><div className="flex justify-between"><span>Coupon Discount</span><b>-{money(t.couponDiscount)}</b></div><div className="flex justify-between"><span>GST/Tax</span><b>{money(t.gst)}</b></div><div className="flex justify-between"><span>Delivery Charge</span><b>{money(t.delivery)}</b></div><div className="flex justify-between"><span>Handling Charge</span><b>{money(t.handling)}</b></div><div className="flex justify-between border-t border-black/20 pt-3 display-font text-xl font-black"><span>Grand Total</span><span>{money(t.total)}</span></div></div>
          <p className="mt-8 text-center font-bold text-[#8a6500]">Thank you for shopping with Eagle Mart.</p>
        </section>
      </main>
    </CustomerShell>
  );
}

function ProfilePanel() {
  const { customer, updateCustomerProfile, refreshCustomerProfile, toast } = useStore();
  const savedProfile = useMemo(() => ({ name: customer?.name || "", phone: customer?.phone || "" }), [customer]);
  const [form, setForm] = useState(savedProfile);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const hasChanges = form.name !== savedProfile.name || form.phone !== savedProfile.phone;

  useEffect(() => {
    setForm(savedProfile);
  }, [savedProfile]);

  const resetForm = async () => {
    setResetting(true);
    try {
      const user = await refreshCustomerProfile();
      setForm({ name: user.name || "", phone: user.phone || "" });
    } catch (error) {
      setForm(savedProfile);
      toast(error instanceof Error ? error.message : "Could not reset profile from database.", "error");
    } finally {
      setResetting(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (name.length < 2) {
      toast("Name must be at least 2 characters.", "error");
      return;
    }
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      toast("Enter a valid 10 digit Indian mobile number.", "error");
      return;
    }
    setSaving(true);
    try {
      await updateCustomerProfile({ name, phone: phone || undefined });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update profile.", "error");
    } finally {
      setSaving(false);
    }
  };

  const initials = (customer?.name || "EM").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const joined = customer?.createdAt ? new Date(customer.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "Recently";
  return <section className="grid gap-5 xl:grid-cols-[320px_1fr]"><aside className="premium-card p-6 text-center"><div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full border-4 border-[#efe6c8] bg-black text-5xl font-black text-[#d4af37] shadow-xl">{initials}</div><h2 className="display-font mt-5 text-2xl font-black">{resetting ? form.name || customer?.name || "Customer" : customer?.name || "Customer"}</h2><p className="text-sm text-black/55">{customer?.email}</p><div className="mt-6 rounded-md border border-[#eadfca] bg-[#faf7ef] p-4 text-left"><p className="text-xs font-black uppercase tracking-wide text-black/55">Customer ID</p><b>{customer?.id || "-"}</b><p className="mt-3 text-xs font-black uppercase tracking-wide text-black/55">Phone</p><b>{resetting ? form.phone || "Not added" : customer?.phone || "Not added"}</b></div></aside><form onSubmit={submit} className="premium-card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eadfca] p-5"><div><h2 className="display-font text-2xl font-black">Personal Information</h2><p className="text-sm text-black/55">{resetting ? "Refreshing your profile from database..." : "Update your customer account details from database."}</p></div><span className="rounded-full bg-[#fff4c9] px-4 py-2 text-xs font-black text-[#8a6500]">CUSTOMER ID: {customer?.id?.slice(-8).toUpperCase()}</span></div><div className="grid gap-5 p-5 md:grid-cols-2"><label className="text-xs font-black uppercase tracking-wide text-black/65">Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-2 w-full rounded-md border border-[#cfc4a6] bg-white px-4 py-3 text-base font-normal outline-none focus:border-[#d4af37]" placeholder="Full name" /></label><label className="text-xs font-black uppercase tracking-wide text-black/65">Mobile number<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} className="mt-2 w-full rounded-md border border-[#cfc4a6] bg-white px-4 py-3 text-base font-normal outline-none focus:border-[#d4af37]" placeholder="10 digit mobile number" /></label><label className="text-xs font-black uppercase tracking-wide text-black/65">Email address<input value={customer?.email || ""} readOnly className="mt-2 w-full rounded-md border border-[#eadfca] bg-[#f7f3ea] px-4 py-3 text-base font-normal text-black/60 outline-none" /></label><div className="rounded-md border border-[#eadfca] bg-white p-4"><p className="text-xs font-black uppercase tracking-wide text-black/55">Account status</p><b>{customer?.status || "ACTIVE"}</b><p className="mt-1 text-sm text-black/50">Joined {joined}</p></div><div className="md:col-span-2"><p className="text-xs font-black uppercase tracking-wide text-black/65">Profile completeness</p><div className="mt-3 grid grid-cols-4 gap-2">{[form.name, customer?.email, form.phone, customer?.status].map((item, index) => <span key={index} className={`h-2 rounded-full ${item ? "bg-[#d4af37]" : "bg-black/10"}`} />)}</div></div></div><div className="flex flex-wrap justify-end gap-3 border-t border-[#eadfca] bg-[#faf7ef] p-5"><Button type="button" variant="outline" disabled={saving || resetting} onClick={resetForm}>{resetting ? "Resetting..." : "Reset profile"}</Button><Button variant="gold" disabled={saving || resetting || !hasChanges}>{saving ? "Saving..." : "Save changes"}</Button></div></form><div className="premium-card border-l-4 border-l-[#d4af37] p-5"><p className="text-xs font-black uppercase tracking-wide text-black/55">Active since</p><h3 className="display-font mt-2 text-2xl font-black">{joined}</h3><p className="mt-2 text-sm text-[#8a6500]">{customer?.status || "ACTIVE"}</p></div><div className="premium-card border-l-4 border-l-[#d4af37] p-5"><p className="text-xs font-black uppercase tracking-wide text-black/55">Profile access</p><h3 className="display-font mt-2 text-2xl font-black">{customer?.email ? "Verified Account" : "Customer Account"}</h3><p className="mt-2 text-sm text-black/55">Linked to {customer?.email || customer?.phone || "your customer login"}.</p></div></section>;
}

function AccountOrderCard({ order, products, coupons, onReturnSubmitted }: { order: Order; products: Product[]; coupons: StoreCoupons; onReturnSubmitted: () => Promise<void> }) {
  const { toast } = useStore();
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [reason, setReason] = useState("");
  const [bank, setBank] = useState(blankReturnBank);
  const [saving, setSaving] = useState(false);
  const activeReturns = (order.returns || []).filter((item) => item.status !== "REJECTED");
  const hasPendingReturn = activeReturns.some((item) => item.status !== "COMPLETED");
  const canReturn = order.status === "Delivered" && !hasPendingReturn;
  const submit = async () => {
    if (reason.trim().length < 10) return toast("Please add a return reason with at least 10 characters.", "error");
    const bankError = validateReturnBank(bank);
    if (bankError) return toast(bankError, "error");
    setSaving(true);
    try {
      await requestReturnBackend(order.orderNumber, { orderItemId: itemId || null, reason: reason.trim(), bankAccountHolder: bank.bankAccountHolder.trim(), bankName: bank.bankName.trim(), bankAccountNumber: bank.bankAccountNumber.trim(), bankIfsc: bank.bankIfsc.trim().toUpperCase() });
      await onReturnSubmitted();
      setOpen(false);
      setItemId("");
      setReason("");
      setBank(blankReturnBank);
      toast("Return request submitted successfully.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not submit return request.", "error");
    } finally {
      setSaving(false);
    }
  };
  return <div className="premium-card p-5"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="display-font font-bold">{order.orderNumber}</h3><p className="text-sm text-black/55">{order.items.length} items | {money(order.grandTotal || totals(order.items, products, coupons, order.couponCode).total)}</p></div><div className="flex gap-2"><StatusBadge value={order.status} /><StatusBadge value={order.paymentStatus} /></div></div>{activeReturns.length > 0 && <div className="mt-4 rounded-md border border-[#eadfca] bg-[#fffaf0] p-3 text-sm"><p className="font-bold">Return and refund status</p>{activeReturns.map((item) => { const refund = item.refunds?.[0]; return <p key={item.id} className="mt-1 text-black/65">{item.orderItemId ? order.items.find((orderItem) => orderItem.id === item.orderItemId)?.name || "Selected item" : "Full order"}: <b className="text-[#8a6500]"> {item.status.replace("_", " ")}</b>{refund ? ` · Refund ${money(refund.amount)} ${refund.status.replace("_", " ")}` : " · Refund starts after approval"}</p>; })}</div>}<div className="mt-4 flex flex-wrap gap-2"><Link href={`/track-order/${order.orderNumber}`}><Button>Track</Button></Link>{canShowInvoice(order) && <Link href={`/invoice/${order.orderNumber}`}><Button variant="gold">View Invoice</Button></Link>}{canReturn && <Button variant="outline" onClick={() => { setOpen((value) => !value); setBank(blankReturnBank); }}><PackageCheck size={16} /> Return</Button>}</div>{open && <div className="mt-4 grid gap-3 rounded-md border border-[#eadfca] bg-white p-4"><label className="grid gap-1 text-sm font-bold">Return selection<select value={itemId} onChange={(event) => setItemId(event.target.value)} className="rounded-md border px-3 py-2 font-normal"><option value="">Full order</option>{order.items.map((item) => <option key={item.id || item.sku} value={item.id}>{item.name || item.sku} {item.unit ? `- ${item.unit}` : ""}</option>)}</select></label><label className="grid gap-1 text-sm font-bold">Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="rounded-md border px-3 py-2 font-normal" placeholder="Tell us why you want to return this delivered product" /></label><div className="grid gap-3 md:grid-cols-2"><input value={bank.bankAccountHolder} onChange={(e) => setBank({ ...bank, bankAccountHolder: e.target.value })} className="rounded-md border px-3 py-2" placeholder="Account holder name" /><input value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} className="rounded-md border px-3 py-2" placeholder="Bank name" /><input value={bank.bankAccountNumber} onChange={(e) => setBank({ ...bank, bankAccountNumber: e.target.value.replace(/\D/g, "").slice(0, 18) })} className="rounded-md border px-3 py-2" placeholder="Account number" /><input value={bank.bankIfsc} onChange={(e) => setBank({ ...bank, bankIfsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })} className="rounded-md border px-3 py-2" placeholder="IFSC code" /></div><p className="text-sm text-black/55">Bank details are saved securely with this return request and shown to authorized admin staff for refund processing.</p><div className="flex flex-wrap gap-2"><Button variant="gold" disabled={saving} onClick={submit}>{saving ? "Submitting..." : "Submit return"}</Button><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button></div></div>}</div>;
}

function AccountPage({ section = "dashboard" }: { section?: string }) {
  const { customer, authReady, orders, addresses, wishlist, products, coupons, moveWishlistToCart, toggleWishlist, logoutCustomer, refreshCustomerData, toast } = useStore();
  const router = useRouter();
  const active = section || "dashboard";
  const totalSpent = orders.reduce((s, o) => s + totals(o.items, products, coupons, o.couponCode).total, 0);
  const totalSavings = orders.reduce((s, o) => { const next = totals(o.items, products, coupons, o.couponCode); return s + next.discount + next.couponDiscount; }, 0);
  const wishlistProducts = products.filter((p) => wishlist.includes(p.id));
  const recentOrder = orders[0];
  const activeOrders = orders.filter((o) => !["Delivered", "Cancelled"].includes(o.status));
  const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0];
  const reorderSuggestions = products.filter((p) => p.stock > 0).slice(0, 4);
  const logout = async () => { await logoutCustomer(); router.push("/"); };
  const content = () => {
    if (active === "profile") return <ProfilePanel />;
    if (active === "addresses") return <section className="premium-card p-5"><AddressManager /></section>;
    if (active === "orders") return <section><div className="mb-4 flex items-center justify-between gap-3"><h2 className="display-font text-2xl font-black">My Orders</h2><Link href="/orders"><Button variant="outline">Open full orders page</Button></Link></div>{orders.length ? <div className="grid gap-4">{orders.map((o) => <AccountOrderCard key={o.orderNumber} order={o} products={products} coupons={coupons} onReturnSubmitted={refreshCustomerData} />)}</div> : <Empty title="No orders yet" cta="Start shopping" href="/products" />}</section>;
    if (active === "wishlist") return <section><div className="mb-4 flex items-center justify-between gap-3"><h2 className="display-font text-2xl font-black">Wishlist</h2><Link href="/wishlist"><Button variant="outline">Open wishlist page</Button></Link></div>{wishlistProducts.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{wishlistProducts.map((p) => <ProductCard key={p.id} product={p} footer={<><Button variant="gold" onClick={() => moveWishlistToCart(p.id)}>Move</Button><Button variant="outline" onClick={() => toggleWishlist(p.id)}>Remove</Button></>} />)}</div> : <Empty title="Your wishlist is empty" cta="Browse products" href="/products" />}</section>;
    if (active === "invoices") { const invoiceOrders = orders.filter(canShowInvoice); return <section><h2 className="display-font text-2xl font-black">Invoices</h2>{invoiceOrders.length ? <div className="mt-4 grid gap-3">{invoiceOrders.map((o) => <div key={o.orderNumber} className="premium-card flex flex-wrap items-center justify-between gap-3 p-5"><div><b>INV-{o.orderNumber}</b><p className="text-sm text-black/55">{new Date(o.createdAt).toLocaleDateString("en-IN")} | {money(o.grandTotal || totals(o.items, products, coupons, o.couponCode).total)}</p></div><Link href={`/invoice/${o.orderNumber}`}><Button variant="gold">View Invoice</Button></Link></div>)}</div> : <Empty title="No invoices yet" cta="View products" href="/products" />}</section>; }
    if (active === "coupons") return <section><h2 className="display-font text-2xl font-black">Coupons</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{coupons.filter((c) => c.active).map((coupon) => <div key={coupon.code} className="premium-card p-5"><p className="text-xs font-bold uppercase text-[#8a6500]">Available coupon</p><h3 className="display-font mt-1 text-xl font-black">{coupon.code}</h3><p className="text-sm text-black/60">{coupon.title}</p><p className="mt-2 text-sm font-bold">Minimum order {money(coupon.minOrder)}</p></div>)}</div></section>;
    if (active === "support") return <SupportCenter compact />;
    return <section className="grid gap-6"><div className="premium-card overflow-hidden"><div className="bg-black p-6 text-white"><p className="text-xs font-bold uppercase text-[#d4af37]">Customer dashboard</p><h2 className="display-font mt-2 text-3xl font-black">Welcome back, {customer?.name?.split(" ")[0] || "Customer"}</h2><p className="mt-2 text-white/65">{customer?.email} {customer?.phone ? `| ${customer.phone}` : ""}</p></div><div className="grid gap-4 p-5 md:grid-cols-4">{[["Total orders", orders.length], ["Total spent", money(totalSpent)], ["Active orders", activeOrders.length], ["Wishlist count", wishlist.length], ["Saved addresses", addresses.length], ["Available coupons", coupons.filter((c) => c.active).length], ["Total savings", money(totalSavings)], ["Last order status", recentOrder?.status || "None"]].map(([k, v]) => <div key={String(k)} className="rounded-md border border-[#eadfca] bg-white p-4"><p className="text-sm text-black/55">{String(k)}</p><h3 className="display-font mt-2 text-2xl font-black">{String(v)}</h3></div>)}</div></div><div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]"><div className="premium-card p-5"><h3 className="display-font text-xl font-bold">Active order timeline</h3>{recentOrder ? <div className="mt-4 grid gap-3">{["Placed", "Confirmed", "Packed", "Out for Delivery", "Delivered"].map((step, index) => { const current = ["Placed", "Confirmed", "Packed", "Out for Delivery", "Delivered"].indexOf(recentOrder.status); return <div key={step} className="flex items-center gap-3"><span className={`h-3 w-3 rounded-full ${index <= current ? "bg-[#d4af37]" : "bg-black/15"}`} /><span className={index <= current ? "font-bold" : "text-black/45"}>{step}</span></div>; })}<Link href={`/track-order/${recentOrder.orderNumber}`}><Button className="mt-2">Track order</Button></Link></div> : <p className="mt-3 text-sm text-black/55">No active order yet.</p>}</div><div className="premium-card p-5"><h3 className="display-font text-xl font-bold">Default address</h3>{defaultAddress ? <p className="mt-3 text-sm text-black/65">{defaultAddress.name}, {defaultAddress.line}, {defaultAddress.city} - {defaultAddress.pincode}</p> : <p className="mt-3 text-sm text-black/55">No saved address.</p>}<Link href="/account/addresses"><Button className="mt-4" variant="outline">Manage addresses</Button></Link></div></div><div className="grid gap-4 lg:grid-cols-3"><div className="premium-card p-5 lg:col-span-2"><h3 className="display-font text-xl font-bold">Recent orders</h3><div className="mt-3 grid gap-3">{orders.slice(0, 3).map((o) => <div key={o.orderNumber} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#eadfca] bg-white p-3"><div><b>{o.orderNumber}</b><p className="text-xs text-black/55">{o.items.length} items | {money(o.grandTotal || totals(o.items, products, coupons, o.couponCode).total)}</p></div>{canShowInvoice(o) && <Link href={`/invoice/${o.orderNumber}`}><Button variant="gold">View Invoice</Button></Link>}</div>)}</div></div><div className="premium-card p-5"><h3 className="display-font text-xl font-bold">Coupons</h3>{coupons.filter((c) => c.active).slice(0, 3).map((coupon) => <div key={coupon.code} className="mt-3 rounded-md bg-[#fff8df] p-3"><b>{coupon.code}</b><p className="text-xs text-black/55">{coupon.title}</p></div>)}</div></div><div className="grid gap-4 lg:grid-cols-2"><div className="premium-card p-5"><h3 className="display-font text-xl font-bold">Reorder suggestions</h3><div className="mt-4 grid grid-cols-2 gap-3">{reorderSuggestions.map((p) => <ProductCard key={p.id} product={p} />)}</div></div><div className="premium-card p-5"><h3 className="display-font text-xl font-bold">Wishlist preview</h3>{wishlistProducts.length ? <div className="mt-4 grid grid-cols-2 gap-3">{wishlistProducts.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}</div> : <Empty title="Wishlist is empty" cta="Browse products" href="/products" />}</div></div><div className="premium-card p-5"><h3 className="display-font text-xl font-bold">Support</h3><p className="mt-2 text-sm text-black/60">Need help with delivery, invoices, refunds, or address changes? Eagle Mart support is ready with your latest order context.</p><Link href="/account/support"><Button className="mt-4" variant="gold">Open support</Button></Link></div></section>;
  };
  if (authReady && !customer) return <CustomerShell><main className="container-premium flex min-h-[60vh] items-center justify-center py-10"><section className="premium-card max-w-lg p-8 text-center"><User className="mx-auto text-[#8a6500]" size={46} /><h1 className="display-font mt-4 text-3xl font-black">Login Required</h1><p className="mt-2 text-black/60">Please login first to view your account.</p><div className="mt-6 flex justify-center gap-3"><Link href="/login?next=/account"><Button variant="gold">Login</Button></Link><Link href="/signup"><Button variant="outline">Create Account</Button></Link></div></section></main></CustomerShell>;
  const navItems = [["dashboard", "Dashboard"], ["profile", "Profile"], ["orders", "My Orders"], ["addresses", "Addresses"], ["wishlist", "Wishlist"], ["invoices", "Invoices"], ["coupons", "Coupons"], ["support", "Support"]];
  return <CustomerShell><main className="container-premium py-8"><h1 className="display-font text-3xl font-black">My Account</h1><div className="mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]"><aside className="premium-card responsive-scroll flex h-fit gap-2 overflow-x-auto p-2 lg:block lg:space-y-1 lg:overflow-visible lg:p-3">{navItems.map(([key, label]) => <Link key={key} href={key === "dashboard" ? "/account" : `/account/${key}`} className={`block min-w-fit whitespace-nowrap rounded-md px-3 py-3 text-sm font-bold ${active === key ? "bg-black text-white" : "hover:bg-black/5"}`}>{label}</Link>)}<button onClick={logout} className="block min-w-fit whitespace-nowrap rounded-md px-3 py-3 text-left text-sm font-bold text-red-700 hover:bg-red-50 lg:mt-2 lg:w-full">Logout</button></aside><div className="min-w-0">{content()}</div></div></main></CustomerShell>;
}

function HighlightText({ text, term }: { text: string; term: string }) {
  const clean = term.trim();
  if (!clean) return <>{text}</>;
  const index = text.toLowerCase().indexOf(clean.toLowerCase());
  if (index < 0) return <>{text}</>;
  return <>{text.slice(0, index)}<mark className="rounded bg-[#fff1a8] px-1 text-black">{text.slice(index, index + clean.length)}</mark>{text.slice(index + clean.length)}</>;
}

function FAQPage() {
  const { toast } = useStore();
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  useEffect(() => {
    fetchFaqs()
      .then(setFaqs)
      .catch((error) => toast(error instanceof Error ? error.message : "Unable to load FAQs.", "error"))
      .finally(() => setLoading(false));
  }, [toast]);
  useEffect(() => setPage(1), [query, activeCategory]);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = faqs.filter((faq) => {
    const categoryMatch = activeCategory === "All" || faq.category === activeCategory;
    const searchMatch = !normalizedQuery || `${faq.question} ${faq.answer} ${faq.category}`.toLowerCase().includes(normalizedQuery);
    return categoryMatch && searchMatch;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleFaqs = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: filtered.slice(0, 30).map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
  return (
    <CustomerShell>
      <main className="bg-[#f7f4ec]">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        <section className="bg-black py-10 text-white md:py-14">
          <div className="container-premium">
            <BackNav fallback="/" label="Back to store" />
            <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
              <div>
                <p className="text-xs font-black uppercase text-[#e7c766]">Eagle Mart Help Center</p>
                <h1 className="display-font mt-3 max-w-3xl text-4xl font-black md:text-5xl">Frequently Asked Questions</h1>
                <p className="mt-4 max-w-2xl text-white/70">Find quick answers about orders, payments, delivery, returns, invoices, rewards, and your Eagle Mart account.</p>
              </div>
              <div className="rounded-md border border-[#d4af37]/25 bg-white/10 p-4">
                <p className="text-sm font-bold text-[#e7c766]">Still need help?</p>
                <p className="mt-1 text-sm text-white/65">Create a support ticket with your order context and our team will follow up.</p>
                <Link href="/contact"><Button variant="gold" className="mt-4 w-full">Contact support</Button></Link>
              </div>
            </div>
            <div className="mt-8 flex items-center gap-3 rounded-md bg-white px-4 py-3 text-black shadow-xl">
              <Search size={20} className="shrink-0 text-black/45" />
              <input aria-label="Search FAQs" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-10 w-full border-0 bg-transparent text-base outline-none" placeholder="Search orders, refunds, GST, coupons..." />
            </div>
          </div>
        </section>
        <section className="container-premium py-8">
          <div className="responsive-scroll -mx-3 flex gap-2 overflow-x-auto px-3 pb-3 sm:mx-0 sm:px-0">
            {["All", ...faqCategories].map((category) => <button key={category} type="button" onClick={() => setActiveCategory(category)} className={`min-h-11 shrink-0 rounded-md border px-4 text-sm font-black transition ${activeCategory === category ? "border-black bg-black text-white" : "border-[#d8d1c2] bg-white text-black hover:border-[#d4af37]"}`}>{category}</button>)}
          </div>
          <div className="mt-5 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="hidden h-fit rounded-md border border-[#eadfca] bg-white p-4 lg:block">
              <p className="text-xs font-black uppercase text-black/45">Result count</p>
              <h2 className="display-font mt-1 text-3xl font-black">{filtered.length}</h2>
              <p className="mt-1 text-sm text-black/55">{activeCategory === "All" ? "All categories" : activeCategory}</p>
              <p className="mt-2 text-xs font-bold text-[#8a6500]">Page {safePage} of {totalPages}</p>
              <div className="mt-5 grid gap-2 text-sm">
                {faqCategories.map((category) => <button key={category} type="button" onClick={() => setActiveCategory(category)} className="rounded-md px-3 py-2 text-left font-bold hover:bg-[#faf7ef]">{category}</button>)}
              </div>
            </aside>
            <section className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="display-font text-2xl font-black">{activeCategory === "All" ? "All FAQs" : activeCategory}</h2>
                  <p className="text-sm text-black/55">{loading ? "Loading FAQs..." : `${filtered.length} answer${filtered.length === 1 ? "" : "s"} found`}</p>
                </div>
                {query && <Button variant="outline" onClick={() => setQuery("")}>Clear search</Button>}
              </div>
              <div className="grid gap-3">
                {visibleFaqs.map((faq) => (
                  <details key={faq.id} className="group rounded-md border border-[#eadfca] bg-white shadow-sm open:border-[#d4af37] open:bg-[#fffdf6]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 font-black">
                      <span><HighlightText text={faq.question} term={query} /></span>
                      <ChevronRight size={20} className="shrink-0 text-[#8a6500] transition group-open:rotate-90" />
                    </summary>
                    <div className="border-t border-[#eadfca] px-4 pb-4 pt-3 text-sm leading-6 text-black/70"><HighlightText text={faq.answer} term={query} /><p className="mt-3 text-xs font-black uppercase text-[#8a6500]">{faq.category}</p></div>
                  </details>
                ))}
                {!loading && !filtered.length && <section className="rounded-md border border-dashed border-[#d8d1c2] bg-white p-8 text-center"><h3 className="display-font text-2xl font-black">No FAQ found</h3><p className="mt-2 text-sm text-black/55">Try another keyword or contact support for direct help.</p><Link href="/contact"><Button variant="gold" className="mt-5">Open support</Button></Link></section>}
              </div>
              {filtered.length > pageSize && (
                <div className="mt-5 flex flex-col gap-3 border-t border-[#eadfca] pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-bold text-black/60">Showing {(safePage - 1) * pageSize + 1}-{Math.min(filtered.length, safePage * pageSize)} of {filtered.length} FAQs</span>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Button variant="outline" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
                    <Button variant="gold" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </section>
      </main>
    </CustomerShell>
  );
}

const staticPageContent: Record<string, { title: string; intro: string; sections: [string, string][] }> = {
  about: {
    title: "About Eagle Mart",
    intro: "Eagle Mart Grocery & Essentials is built for dependable everyday grocery shopping with fresh products, transparent pricing, secure payments, and careful doorstep delivery.",
    sections: [["What we do", "We curate groceries, daily essentials, household supplies, personal care, baby care, organic products, and packaged foods for convenient online ordering."], ["Our promise", "We focus on product freshness, trusted sourcing, clear order updates, serviceable delivery slots, and responsive customer support."], ["Store experience", "Customers can search, filter, wishlist, reorder, track orders, download invoices, and contact support from one account dashboard."]],
  },
  privacy: {
    title: "Privacy Policy",
    intro: "This Privacy Policy explains how Eagle Mart handles customer information while providing shopping, delivery, payment, account, and support services.",
    sections: [["Information we collect", "We may collect your name, phone number, email, delivery addresses, order details, payment status, support messages, and account preferences."], ["How we use information", "We use information to create accounts, process orders, deliver products, verify payments, issue invoices, handle returns, prevent misuse, and improve the shopping experience."], ["Payments", "Online payments are processed through secure payment partners. Eagle Mart does not store full card, UPI, wallet, or net banking credentials."], ["Data protection", "We use reasonable technical and operational safeguards to protect customer data and restrict access to authorized use."], ["Your choices", "You can update profile details and addresses from your account. For support or data-related requests, contact Eagle Mart support."]],
  },
  terms: {
    title: "Terms of Service",
    intro: "These terms apply when you browse, create an account, place orders, use coupons, make payments, request returns, or contact Eagle Mart support.",
    sections: [["Account responsibility", "Customers are responsible for keeping login details secure and for providing accurate name, phone, email, and delivery information."], ["Orders and pricing", "Product prices, stock, delivery slots, fees, discounts, and availability may change based on location, inventory, and operational conditions."], ["Payments", "Orders may be paid online through supported secure methods or by Cash on Delivery where available."], ["Coupons and offers", "Coupons may have minimum order values, validity dates, usage limits, and other conditions shown at the time of use."], ["Service changes", "Eagle Mart may update features, policies, and service availability to improve reliability and customer experience."]],
  },
  "return-policy": {
    title: "Return Policy",
    intro: "Eagle Mart accepts eligible return requests for damaged, incorrect, expired, or quality-affected items according to product category and order status.",
    sections: [["Return eligibility", "Returns are generally available for eligible products after delivery when the issue is reported with accurate order and item details."], ["Non-returnable items", "Opened, consumed, tampered, hygiene-sensitive, temperature-sensitive, or perishable items may not be returnable unless damaged, expired, or incorrectly delivered."], ["How to request a return", "Go to My Orders, choose the delivered order, select the item or full order, add the reason, and submit the request."], ["Review process", "The Eagle Mart team reviews each request and may approve, reject, or ask for more information based on order and product details."]],
  },
  refunds: {
    title: "Refund Policy",
    intro: "Refunds are processed after an eligible return, cancellation, payment issue, or support-approved adjustment is reviewed and approved.",
    sections: [["Refund timelines", "Approved refunds are generally processed within a few business days. Bank, wallet, UPI, or payment gateway timelines may vary."], ["Refund method", "Refunds are usually issued to the original payment method. COD refunds may require valid bank details submitted with the return request."], ["Partial refunds", "Partial refunds may apply when only selected items are returned or adjusted."], ["Failed payments", "If payment is debited but the order is not confirmed, contact support with payment and order details for verification."]],
  },
  "delivery-policy": {
    title: "Delivery Policy",
    intro: "Eagle Mart delivery depends on pincode serviceability, delivery slot capacity, product stock, and local operational conditions.",
    sections: [["Serviceable areas", "Use the pincode checker to confirm whether delivery is available in your area."], ["Delivery slots", "Available slots are shown during checkout and may vary by city, date, demand, and capacity."], ["Delivery charges", "Delivery charges and free-delivery thresholds are shown during checkout before order placement."], ["Order tracking", "Customers can track order status from My Orders or Track Order."]],
  },
  contact: {
    title: "Contact Eagle Mart",
    intro: "Need help with an order, payment, delivery, refund, product, invoice, or account issue? Eagle Mart support is ready to help.",
    sections: [["Support tickets", "Use the Contact page or Account Support section to create a ticket with order context."], ["Store address", "Eagle Mart, GF-4, Siddharth Annexe, Sama-Savli Main Road, Vemali, New Sama, Vadodara, Gujarat - 390024."], ["Best way to get help", "For faster support, include your order number, phone number, issue category, and a clear message."]],
  },
};

function StaticPage({ slug, title }: { slug: string; title: string }) {
  const { toast } = useStore();
  const content = staticPageContent[slug] || {
    title,
    intro: "Eagle Mart Grocery & Essentials is built around premium sourcing, transparent service, careful delivery, and helpful customer support.",
    sections: [["Customer support", "For help with this topic, contact Eagle Mart support and include any relevant order or account details."]],
  };
  return <CustomerShell><main className="container-premium py-10"><BackNav fallback="/" label="Back to store" /><section className="overflow-hidden rounded-md border border-[#eadfca] bg-white shadow-sm"><div className="bg-black p-6 text-white"><p className="text-xs font-black uppercase text-[#e7c766]">Eagle Mart</p><h1 className="display-font mt-2 text-3xl font-black md:text-4xl">{content.title}</h1><p className="mt-3 max-w-3xl text-white/70">{content.intro}</p></div><div className="grid gap-4 p-5 md:p-6">{content.sections.map(([heading, body]) => <section key={heading} className="rounded-md border border-[#eadfca] bg-[#fffdf8] p-4"><h2 className="display-font text-xl font-black">{heading}</h2><p className="mt-2 leading-7 text-black/65">{body}</p></section>)}</div><div className="border-t border-[#eadfca] bg-[#faf7ef] p-5"><Button variant="gold" onClick={() => toast("Open Contact or Account Support to reach Eagle Mart support.", "info")}>Contact support</Button></div></section></main></CustomerShell>;
}

function SupportCenter({ compact = false }: { compact?: boolean }) {
  const { customer, authReady, orders, toast } = useStore();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const recentOrders = orders.slice(0, 8);
  const [form, setForm] = useState({ name: customer?.name || "", email: customer?.email || "", phone: customer?.phone || "", orderNumber: "", category: "Order", priority: "MEDIUM" as const, subject: "", message: "" });
  useEffect(() => {
    setForm((current) => ({ ...current, name: current.name || customer?.name || "", email: current.email || customer?.email || "", phone: current.phone || customer?.phone || "" }));
  }, [customer]);
  useEffect(() => {
    if (!authReady) return;
    if (!customer) {
      setLoading(false);
      return;
    }
    fetchSupportTickets().then(setTickets).catch((error) => toast(error instanceof Error ? error.message : "Could not load support tickets.", "error")).finally(() => setLoading(false));
  }, [authReady, customer, toast]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return toast("Name is required.", "error");
    if (!form.subject.trim()) return toast("Subject is required.", "error");
    if (form.message.trim().length < 10) return toast("Describe your issue in at least 10 characters.", "error");
    setSaving(true);
    try {
      const ticket = await createSupportTicket(form);
      setTickets((items) => [ticket, ...items.filter((item) => item.id !== ticket.id)]);
      setForm((current) => ({ ...current, orderNumber: "", subject: "", message: "", category: "Order", priority: "MEDIUM" }));
      toast(`Support ticket ${ticket.ticketNumber} created`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not create support ticket.", "error");
    } finally {
      setSaving(false);
    }
  };
  if (authReady && !customer) return <section className="premium-card p-8 text-center"><User className="mx-auto text-[#8a6500]" size={46} /><h2 className="display-font mt-4 text-3xl font-black">Login to contact support</h2><p className="mx-auto mt-2 max-w-xl text-black/60">Support tickets are connected to your Eagle Mart account so you can track status, admin notes, and resolutions.</p><div className="mt-6 flex justify-center gap-3"><Link href="/login?next=/contact"><Button variant="gold">Login</Button></Link><Link href="/signup"><Button variant="outline">Create Account</Button></Link></div></section>;
  return <section className={compact ? "grid gap-6" : "grid gap-6"}><div className="premium-card overflow-hidden"><div className="bg-black p-6 text-white"><p className="text-xs font-bold uppercase text-[#d4af37]">Customer Support</p><h1 className="display-font mt-2 text-3xl font-black">Contact Eagle Mart Support</h1><p className="mt-2 max-w-2xl text-white/65">Create a ticket for order, delivery, payment, refund, product, or account issues. You can track the status here after submitting.</p></div><form onSubmit={submit} className="grid gap-4 p-5 md:grid-cols-2"><label className="text-sm font-bold">Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label><label className="text-sm font-bold">Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label><label className="text-sm font-bold">Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label><label className="text-sm font-bold">Related order<select value={form.orderNumber} onChange={(e) => setForm({ ...form, orderNumber: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2"><option value="">No order selected</option>{recentOrders.map((order) => <option key={order.orderNumber} value={order.orderNumber}>{order.orderNumber} - {money(order.grandTotal || totals(order.items, [], [], order.couponCode).total)}</option>)}</select></label><label className="text-sm font-bold">Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2">{["Order", "Delivery", "Payment", "Refund", "Product", "Account", "Other"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-bold">Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as any })} className="mt-1 w-full rounded-md border px-3 py-2"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label><label className="text-sm font-bold md:col-span-2">Subject<input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" placeholder="Short issue summary" /></label><label className="text-sm font-bold md:col-span-2">Message<textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="mt-1 min-h-32 w-full rounded-md border px-3 py-2" placeholder="Tell us what happened and what help you need." /></label><div className="md:col-span-2"><Button variant="gold" disabled={saving}>{saving ? "Creating ticket..." : "Create support ticket"}</Button></div></form></div><div className="premium-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="display-font text-2xl font-black">Your Tickets</h2><Button variant="outline" onClick={() => { setLoading(true); fetchSupportTickets().then(setTickets).catch((error) => toast(error instanceof Error ? error.message : "Could not refresh tickets.", "error")).finally(() => setLoading(false)); }}>Refresh</Button></div>{loading ? <p className="mt-4 text-sm text-black/55">Loading tickets...</p> : tickets.length ? <div className="mt-4 grid gap-3">{tickets.map((ticket) => <div key={ticket.id} className="rounded-md border border-[#eadfca] bg-white p-4"><div className="flex flex-wrap justify-between gap-3"><div><b>{ticket.ticketNumber}</b><p className="text-sm text-black/60">{ticket.subject}</p><p className="mt-1 text-xs text-black/45">{ticket.category} {ticket.orderNumber ? `| Order ${ticket.orderNumber}` : ""}</p></div><div className="flex gap-2"><StatusBadge value={ticket.status} /><StatusBadge value={ticket.priority} /></div></div>{ticket.adminNote && <p className="mt-3 rounded-md bg-[#fff8df] p-3 text-sm"><b>Admin note:</b> {ticket.adminNote}</p>}{ticket.resolution && <p className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-800"><b>Resolution:</b> {ticket.resolution}</p>}</div>)}</div> : <Empty title="No support tickets yet" cta="Browse products" href="/products" />}</div></section>;
}

function ContactPage() {
  return <CustomerShell><main className="container-premium py-10"><BackNav fallback="/account/support" label="Back" /><SupportCenter /></main></CustomerShell>;
}

function AuthPage({ mode }: { mode: "login" | "signup" | "forgot-password" | "reset-password" }) {
  const { loginCustomer, registerCustomer, toast } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "", terms: false, remember: true });
  const update = (key: keyof typeof form, value: string | boolean) => setForm((next) => ({ ...next, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "forgot-password" || mode === "reset-password") {
      toast("Password reset will be enabled soon.", "info");
      return;
    }
    if (!form.email || !/^\S+@\S+\.\S+$/.test(form.email)) return setError("Enter a valid email address.");
    if (!form.password) return setError("Password is required.");
    if (mode === "signup") {
      if (!form.name.trim()) return setError("Full name is required.");
      if (form.password !== form.confirm) return setError("Passwords do not match.");
      if (!form.terms) return setError("Accept the terms to create an account.");
    }
    setLoading(true);
    try {
      if (mode === "login") await loginCustomer({ email: form.email, password: form.password });
      if (mode === "signup") await registerCustomer({ name: form.name, email: form.email, phone: form.phone, password: form.password });
      router.push(params.get("next") || "/account");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };
  const title = mode === "signup" ? "Create Account" : mode === "forgot-password" ? "Forgot Password" : mode === "reset-password" ? "Reset Password" : "Login";
  return <CustomerShell><main className="min-h-[78vh] bg-[#131313] text-white"><div className="container-premium grid min-h-[78vh] items-center gap-8 py-10 lg:grid-cols-2"><section className="hidden lg:block"><Logo invert /><h1 className="display-font mt-8 text-5xl font-black">Welcome to Eagle Mart</h1><p className="mt-4 max-w-md text-white/65">Premium grocery access, order history, saved addresses, and curated essentials in one secure account.</p></section><section className="rounded-md border border-[#d4af37]/20 bg-[#20201f] p-6 shadow-2xl md:p-8"><Logo invert /><h2 className="display-font mt-6 text-2xl font-black">{title}</h2><p className="mt-1 text-sm text-white/60">Eagle Mart Grocery & Essentials</p><form onSubmit={submit} className="mt-6 grid gap-4">{mode === "signup" && <input aria-label="Full name" value={form.name} onChange={(e) => update("name", e.target.value)} className="rounded-md border border-white/10 bg-black px-3 py-3 outline-none focus:border-[#d4af37]" placeholder="Full name" />}<input aria-label="Email or phone" value={form.email} onChange={(e) => update("email", e.target.value)} className="rounded-md border border-white/10 bg-black px-3 py-3 outline-none focus:border-[#d4af37]" placeholder="Email or phone" />{mode === "signup" && <input aria-label="Phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} className="rounded-md border border-white/10 bg-black px-3 py-3 outline-none focus:border-[#d4af37]" placeholder="Phone" />}{mode !== "forgot-password" && <div className="relative"><input aria-label="Password" value={form.password} onChange={(e) => update("password", e.target.value)} className="w-full rounded-md border border-white/10 bg-black px-3 py-3 pr-12 outline-none focus:border-[#d4af37]" placeholder="Password" type={show ? "text" : "password"} /><button type="button" aria-label="Toggle password visibility" onClick={() => setShow(!show)} className="absolute right-3 top-3 text-white/60">{show ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>}{mode === "signup" && <input aria-label="Confirm password" value={form.confirm} onChange={(e) => update("confirm", e.target.value)} className="rounded-md border border-white/10 bg-black px-3 py-3 outline-none focus:border-[#d4af37]" placeholder="Confirm password" type="password" />}{mode === "login" && <div className="flex items-center justify-between text-sm"><label className="flex items-center gap-2"><input checked={form.remember} onChange={(e) => update("remember", e.target.checked)} type="checkbox" /> Remember me</label><Link href="/forgot-password" className="text-[#e7c766]">Forgot password?</Link></div>}{mode === "signup" && <label className="flex items-center gap-2 text-sm text-white/75"><input checked={form.terms} onChange={(e) => update("terms", e.target.checked)} type="checkbox" /> I agree to Eagle Mart terms</label>}{error && <p className="rounded-md bg-red-500/15 p-3 text-sm text-red-200">{error}</p>}<Button variant="gold" disabled={loading}>{loading ? "Loading..." : title}</Button></form><div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">{mode !== "login" ? <Link href="/login" className="text-[#e7c766]">Back to login</Link> : <Link href="/signup" className="text-[#e7c766]">Create account</Link>}</div></section></div></main></CustomerShell>;
}

function Empty({ title, cta, href = "/products" }: { title: string; cta: string; href?: string }) {
  return <section className="premium-card my-8 p-10 text-center"><h2 className="display-font text-2xl font-black">{title}</h2><Link href={href}><Button variant="gold" className="mt-5">{cta}</Button></Link></section>;
}

function OrderMini({ order, products }: { order: Order; products: Product[] }) {
  const { coupons } = useStore();
  const t = totals(order.items, products, coupons, order.couponCode);
  return <aside className="premium-card mt-6 p-4 text-left"><h3 className="display-font font-bold">Order Summary</h3>{order.items.map((item) => { const p = products.find((x) => x.id === item.productId); return <div key={item.id || `${item.productId}-${item.variantId || "default"}`} className="mt-3 flex justify-between gap-3 text-sm"><span>{item.name || p?.name || "Order item"} <span className="text-black/50">({itemUnit(item, p)})</span> x {item.qty}</span><b>{money(itemLineTotal(item, products))}</b></div>; })}<div className="mt-4 flex justify-between border-t pt-3 display-font font-black"><span>Total</span><span>{money(t.total)}</span></div></aside>;
}

function Router({ slug }: { slug: string[] }) {
  const [first, second] = slug;
  if (!first) return <HomePage />;
  if (first === "products" || first === "search") return <ProductsPage mode={first} />;
  if (first === "category") return <ProductsPage mode="category" value={second} />;
  if (first === "product") return <ProductDetail slug={second} />;
  if (first === "cart") return <CartPage />;
  if (first === "wishlist") return <WishlistPage />;
  if (first === "checkout") return <CheckoutPage />;
  if (first === "contact") return <ContactPage />;
  if (first === "faq") return <FAQPage />;
  if (first === "order-success") return <OrderSuccess number={second} />;
  if (first === "payment-failed") return <PaymentFailed />;
  if (first === "track-order") return <TrackOrder number={second} />;
  if (first === "orders") return <OrdersPage />;
  if (first === "invoice") return <InvoicePage number={second} />;
  if (["login", "signup", "forgot-password", "reset-password"].includes(first)) return <AuthPage mode={first as "login" | "signup" | "forgot-password" | "reset-password"} />;
  if (first === "account") return <AccountPage section={second || "dashboard"} />;
  return <StaticPage slug={first} title={first.split("-").map((x) => x[0].toUpperCase() + x.slice(1)).join(" ")} />;
}

export function CustomerApp({ slug }: { slug: string[] }) {
  return <StoreProvider><Router slug={slug} /></StoreProvider>;
}
