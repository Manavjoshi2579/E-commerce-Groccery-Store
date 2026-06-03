"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BadgePercent, ChevronRight, CreditCard, Heart, Home, LayoutGrid, MapPin, Menu, Minus, PackageCheck,
  Plus, Search, ShieldCheck, ShoppingBag, Star, Truck, User, X, FileText, RotateCcw, MessageCircle,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/common/Button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StoreProvider, useStore } from "@/store/AppStore";
import { categories } from "@/data/categories";
import { deliverySlots } from "@/data/delivery";
import { fetchCategories, fetchProduct } from "@/services/catalog";
import { money } from "@/lib/money";
import type { Address, CartItem, Category, Order, Product } from "@/types";

const imageFallback = "/assets/placeholders/product-placeholder.svg";

type StoreCoupons = ReturnType<typeof useStore>["coupons"];

function totals(items: CartItem[], products: Product[], coupons: StoreCoupons, couponCode = "") {
  const subtotal = items.reduce((sum, item) => sum + (products.find((p) => p.id === item.productId)?.price || 0) * item.qty, 0);
  const mrp = items.reduce((sum, item) => sum + (products.find((p) => p.id === item.productId)?.mrp || 0) * item.qty, 0);
  const coupon = coupons.find((item) => item.code === couponCode);
  const couponDiscount = coupon && subtotal >= coupon.minOrder ? coupon.discountType === "percent" ? Math.round(subtotal * (coupon.value / 100)) : coupon.value : 0;
  const gst = Math.round(subtotal * 0.05);
  const delivery = subtotal > 799 || coupon?.discountType === "shipping" ? 0 : 49;
  const handling = subtotal ? 12 : 0;
  return { subtotal, mrp, discount: Math.max(0, mrp - subtotal), couponDiscount, gst, delivery, handling, total: Math.max(0, subtotal - couponDiscount + gst + delivery + handling) };
}

function CustomerShell({ children }: { children: React.ReactNode }) {
  const { cart, products, wishlist, coupons } = useStore();
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [navCategories, setNavCategories] = useState<Category[]>(categories);
  const amount = totals(cart, products, coupons).total;
  useEffect(() => {
    fetchCategories().then(setNavCategories);
  }, []);
  const submitSearch = () => {
    const q = term.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  };
  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black text-white shadow-xl no-print">
        <div className="container-premium flex min-h-16 items-center justify-between gap-4">
          <Link href="/"><Logo invert /></Link>
          <nav className="hidden items-center gap-4 text-[12px] font-extrabold uppercase tracking-[0.08em] lg:flex">
            {navCategories.slice(0, 6).map((cat) => <Link key={cat.id} href={`/category/${cat.slug}`} className="whitespace-nowrap text-white/70 transition hover:text-[#e7c766]">{cat.name}</Link>)}
          </nav>
          <form onSubmit={(event) => { event.preventDefault(); submitSearch(); }} className="hidden min-w-[300px] flex-1 items-center rounded-md bg-white px-3 py-2 text-black md:flex lg:max-w-md">
            <Search size={18} className="text-black/50" />
            <input value={term} onChange={(event) => setTerm(event.target.value)} className="w-full border-0 bg-transparent px-3 text-sm outline-none" placeholder="Search atta, milk, fruits, vegetables..." />
          </form>
          <div className="flex items-center gap-1">
            <Link href="/wishlist" className="relative rounded-md p-2 hover:bg-white/10" aria-label="Wishlist"><Heart size={21} /><span className="absolute -right-1 -top-1 rounded-full bg-[#d4af37] px-1.5 text-[10px] font-bold text-black">{wishlist.length}</span></Link>
            <Link href="/cart" className="relative rounded-md p-2 hover:bg-white/10" aria-label="Cart"><ShoppingBag size={21} /><span className="absolute -right-1 -top-1 rounded-full bg-[#d4af37] px-1.5 text-[10px] font-bold text-black">{cart.reduce((a, b) => a + b.qty, 0)}</span></Link>
            <Link href="/account" className="rounded-md p-2 hover:bg-white/10" aria-label="Account"><User size={21} /></Link>
          </div>
        </div>
        <div className="border-t border-white/10 md:hidden">
          <form onSubmit={(event) => { event.preventDefault(); submitSearch(); }} className="container-premium flex items-center gap-2 py-2">
            <Search size={18} className="text-[#d4af37]" />
            <input value={term} onChange={(event) => setTerm(event.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-white/55" placeholder="Search Eagleclub" />
          </form>
        </div>
      </header>
      {children}
      <Footer />
      <a href="https://wa.me/919876543210" className="fixed bottom-28 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl no-print" aria-label="WhatsApp support"><MessageCircle /></a>
      {cart.length > 0 && <Link href="/cart" className="fixed bottom-20 left-4 right-4 z-40 flex items-center justify-between rounded-md bg-black px-4 py-3 text-white shadow-2xl md:hidden no-print"><span className="text-sm font-bold">{cart.length} items - {money(amount)}</span><span className="gold-gradient rounded px-3 py-2 text-xs font-bold text-black">Checkout</span></Link>}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white/85 px-3 py-2 backdrop-blur-xl md:hidden no-print">
        <div className="grid grid-cols-5 text-[11px] font-semibold">
          {[["/", Home, "Home"], ["/products", LayoutGrid, "Shop"], ["/search", Search, "Search"], ["/orders", PackageCheck, "Orders"], ["/account", User, "Account"]].map(([href, Icon, label]) => (
            <Link key={String(href)} href={String(href)} className="flex flex-col items-center gap-1 rounded-md py-1 text-black/70"><Icon size={19} />{String(label)}</Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Footer() {
  return (
    <footer className="bg-black py-12 text-white">
      <div className="container-premium grid gap-8 md:grid-cols-4">
        <div><Logo invert /><p className="mt-4 text-sm text-white/65">Premium groceries and daily essentials delivered to your doorstep.</p></div>
        {["Company", "Customer Care", "Policies"].map((title) => (
          <div key={title}>
            <h3 className="display-font mb-3 font-bold text-[#e7c766]">{title}</h3>
            <div className="grid gap-2 text-sm text-white/70">
              {["About", "Contact", "FAQ", "Return Policy", "Delivery Policy"].map((x) => <Link key={x} href={`/${x.toLowerCase().replaceAll(" ", "-")}`} className="hover:text-white">{x}</Link>)}
            </div>
          </div>
        ))}
      </div>
    </footer>
  );
}

function ProductCard({ product }: { product: Product }) {
  const { addToCart, toggleWishlist, wishlist } = useStore();
  return (
    <article className="premium-card group overflow-hidden">
      <Link href={`/product/${product.slug}`} className="block bg-[#f4f1e9] p-4">
        <img src={product.image} alt={product.name} onError={(event) => { event.currentTarget.src = imageFallback; }} className="aspect-square w-full rounded-md object-cover transition duration-300 group-hover:scale-[1.03]" />
      </Link>
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <Link href={`/product/${product.slug}`} className="line-clamp-2 min-h-10 text-sm font-bold">{product.name}</Link>
          <button onClick={() => toggleWishlist(product.id)} className="rounded-md p-1 hover:bg-black/5" aria-label="Wishlist"><Heart size={18} fill={wishlist.includes(product.id) ? "#d4af37" : "none"} /></button>
        </div>
        <p className="text-xs text-black/55">{product.unit} | {product.brand}</p>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div><p className="display-font text-lg font-extrabold">{money(product.price)}</p><p className="text-xs text-black/45 line-through">{money(product.mrp)}</p></div>
          <button onClick={() => addToCart(product.id)} className="gold-gradient flex h-10 w-10 items-center justify-center rounded-md text-black" aria-label={`Add ${product.name}`}><Plus size={18} /></button>
        </div>
      </div>
    </article>
  );
}

function HomePage() {
  const { products, addToCart } = useStore();
  const [homeCategories, setHomeCategories] = useState<Category[]>(categories);
  useEffect(() => {
    fetchCategories().then(setHomeCategories);
  }, []);
  return (
    <CustomerShell>
      <section className="relative min-h-[620px] overflow-hidden bg-black text-white">
        <img src="/assets/hero/eagleclub-premium-store.png" alt="Eagleclub premium grocery store interior" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-black/10" />
        <div className="container-premium relative flex min-h-[620px] items-center">
          <div className="max-w-2xl py-20">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#d4af37]/40 bg-black/45 px-4 py-2 text-xs font-bold uppercase text-[#e7c766]"><ShieldCheck size={16} />Premium Quality</div>
            <h1 className="display-font text-4xl font-black leading-tight md:text-6xl">India&apos;s Finest Grocery Experience</h1>
            <p className="mt-5 max-w-xl text-lg text-white/80">Premium quality products, delivered fresh to your doorstep.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link href="/products"><Button variant="gold">Shop Now <ChevronRight size={18} /></Button></Link><Link href="/products?deal=true"><Button variant="outline" className="border-white text-white hover:bg-white hover:text-black">View Offers</Button></Link></div>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold">{["Premium Quality", "Fresh Everyday", "Fast Delivery"].map((chip) => <span key={chip} className="rounded-full border border-white/20 bg-white/10 px-3 py-2">{chip}</span>)}</div>
          </div>
        </div>
      </section>
      <section className="container-premium py-10">
        <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">{homeCategories.slice(0, 6).map((cat) => <Link href={`/category/${cat.slug}`} key={cat.id} className="min-w-[150px] rounded-md bg-black p-3 text-white"><img src={cat.image} alt={cat.name} className="mb-3 h-24 w-full rounded object-cover" /><span className="text-sm font-bold">{cat.name}</span></Link>)}</div>
      </section>
      <ProductSection title="Today's Deals" products={products.filter((p) => p.mrp > p.price).slice(0, 8)} />
      <section className="bg-black py-14 text-white">
        <div className="container-premium grid gap-6 md:grid-cols-4">
          {[[ShieldCheck, "Curated Selection"], [Truck, "Fast Delivery"], [BadgePercent, "Better Savings"], [MessageCircle, "Elite Support"]].map(([Icon, label]) => <div key={String(label)} className="rounded-md border border-white/10 p-5"><Icon className="mb-4 text-[#e7c766]" /><h3 className="display-font font-bold">{String(label)}</h3><p className="mt-2 text-sm text-white/65">A premium grocery experience tuned for everyday Indian households.</p></div>)}
        </div>
      </section>
      <ProductSection title="Best Sellers" products={products.filter((p) => p.featured).slice(0, 8)} />
      <section className="container-premium grid gap-4 py-10 md:grid-cols-2">
        <div className="rounded-md bg-[#d4af37] p-8 text-black"><h2 className="display-font text-2xl font-black">Festival Offers</h2><p className="mt-2">Use FESTIVE10 for premium savings on curated essentials.</p><Button className="mt-5">Shop Festival Picks</Button></div>
        <div className="rounded-md bg-white p-8"><h2 className="display-font text-2xl font-black">Fresh Arrivals</h2><p className="mt-2 text-black/65">New farm produce, dairy staples, and pantry refills updated daily.</p><Button variant="outline" className="mt-5" onClick={() => addToCart(products[0].id)}>Add Milk Starter</Button></div>
      </section>
    </CustomerShell>
  );
}

function ProductSection({ title, products }: { title: string; products: Product[] }) {
  return <section className="container-premium py-10"><div className="mb-6 flex items-end justify-between"><h2 className="display-font text-2xl font-black md:text-3xl">{title}</h2><Link href="/products" className="text-sm font-bold text-[#8a6500]">View all</Link></div><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{products.map((p) => <ProductCard key={p.id} product={p} />)}</div></section>;
}

function ProductsPage({ mode, value }: { mode?: string; value?: string }) {
  const { products } = useStore();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [sort, setSort] = useState("Popular");
  const [category, setCategory] = useState(value || "");
  const [apiCategories, setApiCategories] = useState<Category[]>(categories);
  useEffect(() => {
    fetchCategories().then(setApiCategories);
  }, []);
  const list = useMemo(() => {
    let next = products.filter((p) => p.active !== false);
    if (mode === "category" && value) next = next.filter((p) => p.categorySlug === value || apiCategories.find((c) => c.slug === value)?.name === p.category);
    if (category && mode !== "category") next = next.filter((p) => p.category === category);
    if (query) next = next.filter((p) => `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(query.toLowerCase()));
    if (sort === "Price low to high") next = [...next].sort((a, b) => a.price - b.price);
    if (sort === "Price high to low") next = [...next].sort((a, b) => b.price - a.price);
    if (sort === "Discount") next = [...next].sort((a, b) => (b.mrp - b.price) - (a.mrp - a.price));
    if (sort === "Newest") next = [...next].reverse();
    return next;
  }, [products, query, sort, category, mode, value, apiCategories]);
  return (
    <CustomerShell>
      <main className="container-premium py-8">
        <p className="text-sm text-black/55">Home / {mode === "category" ? "Category" : "Products"}</p>
        <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><h1 className="display-font text-3xl font-black">Explore Premium Groceries</h1><p className="text-black/60">{list.length} products found</p></div><div className="flex gap-2"><select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-md border bg-white px-3 py-2 text-sm">{["Popular", "Newest", "Price low to high", "Price high to low", "Discount"].map((x) => <option key={x}>{x}</option>)}</select><Button variant="outline" onClick={() => alert("Mobile filter drawer ready for backend phase") }><Menu size={17} /> Filters</Button></div></div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="hidden premium-card p-4 lg:block"><h3 className="display-font mb-4 font-bold">Filters</h3><input aria-label="Search products" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-4 w-full rounded-md border px-3 py-2" placeholder="Search products" />{["Category", "Brand", "Availability", "Rating", "Organic/local"].map((f) => <div key={f} className="border-t py-3"><p className="mb-2 text-sm font-bold">{f}</p>{f === "Category" ? <select aria-label="Category filter" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-md border px-2 py-2 text-sm"><option value="">All</option>{apiCategories.map((c) => <option key={c.id}>{c.name}</option>)}</select> : <label className="flex items-center gap-2 text-sm"><input type="checkbox" /> {f}</label>}</div>)}</aside>
          <section>{query && <div className="mb-4 flex gap-2"><span className="rounded-full bg-black px-3 py-1 text-xs font-bold text-white">Search: {query}</span></div>}{list.length ? <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{list.map((p) => <ProductCard key={p.id} product={p} />)}</div> : <Empty title="No products found" cta="Clear filters" />}</section>
        </div>
      </main>
    </CustomerShell>
  );
}

function ProductDetail({ slug }: { slug?: string }) {
  const { products, addToCart, toggleWishlist } = useStore();
  const [apiProduct, setApiProduct] = useState<Product | null>(null);
  useEffect(() => {
    if (slug) fetchProduct(slug).then(setApiProduct);
  }, [slug]);
  const product = apiProduct || products.find((p) => p.slug === slug) || products[0];
  const related = products.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4);
  return (
    <CustomerShell>
      <main className="container-premium py-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="premium-card p-4"><img src={product.image} alt={product.name} className="aspect-square w-full rounded-md object-cover" /><div className="mt-3 grid grid-cols-4 gap-2">{[1,2,3,4].map((x) => <img key={x} src={product.image} alt="" className="aspect-square rounded-md object-cover opacity-80" />)}</div></div>
          <section>
            <p className="text-sm font-bold text-[#8a6500]">{product.brand} / {product.category}</p>
            <h1 className="display-font mt-2 text-3xl font-black md:text-5xl">{product.name}</h1>
            <p className="mt-3 flex items-center gap-2 text-sm"><Star size={17} fill="#d4af37" className="text-[#d4af37]" /> {product.rating} ({product.reviews} reviews)</p>
            <div className="mt-5 flex items-end gap-3"><span className="display-font text-3xl font-black">{money(product.price)}</span><span className="text-black/45 line-through">{money(product.mrp)}</span><span className="rounded bg-red-50 px-2 py-1 text-xs font-bold text-red-700">{Math.round(((product.mrp - product.price) / product.mrp) * 100)}% OFF</span></div>
            <p className="mt-1 text-sm text-black/55">Inclusive of taxes. Unit: {product.unit}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2"><Button variant="gold" onClick={() => addToCart(product.id)}><ShoppingBag size={18} /> Add to Cart</Button><Link href="/checkout"><Button className="w-full" onClick={() => addToCart(product.id)}>Buy Now</Button></Link><Button variant="outline" onClick={() => toggleWishlist(product.id)}><Heart size={18} /> Wishlist</Button><Button variant="outline" onClick={() => alert("Delivery available for 380015. Estimated tomorrow.")}><MapPin size={18} /> Check Pincode</Button></div>
            <div className="mt-6 grid gap-3 rounded-md border bg-white p-4 text-sm"><p><b>Stock:</b> {product.stock > 0 ? `${product.stock} units available` : "Out of stock"}</p><p><b>Highlights:</b> Premium sourced, freshness checked, safely packed.</p><p><b>Storage:</b> Store in a cool, dry place. Refrigerate fresh products.</p><p><b>Return policy:</b> Same-day replacement for damaged or expired items.</p></div>
          </section>
        </div>
        <ProductSection title="Frequently Bought Together" products={related.length ? related : products.slice(0, 4)} />
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white p-3 shadow-2xl md:hidden"><Button variant="gold" className="w-full" onClick={() => addToCart(product.id)}>Add to Cart - {money(product.price)}</Button></div>
    </CustomerShell>
  );
}

function CartPage() {
  const { cart, products, coupons, setQty, removeFromCart, couponCode, applyCoupon } = useStore();
  const [code, setCode] = useState(couponCode);
  const t = totals(cart, products, coupons, couponCode);
  return (
    <CustomerShell>
      <main className="container-premium py-8"><h1 className="display-font text-3xl font-black">Your Cart</h1>{cart.length ? <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]"><section className="space-y-4">{cart.map((item) => { const p = products.find((x) => x.id === item.productId)!; return <div key={item.productId} className="premium-card flex flex-col gap-4 p-4 sm:flex-row"><img src={p.image} alt={p.name} className="h-24 w-24 rounded-md object-cover" /><div className="flex-1"><h3 className="font-bold">{p.name}</h3><p className="text-sm text-black/55">{p.unit}</p><p className="display-font mt-2 font-bold">{money(p.price)}</p><div className="mt-3 flex flex-wrap items-center gap-2"><Qty value={item.qty} onChange={(qty) => setQty(p.id, qty)} /><Button variant="ghost" onClick={() => removeFromCart(p.id)}>Remove</Button><Button variant="ghost" onClick={() => alert("Coming in backend phase: save for later")}>Save for later</Button></div></div></div>; })}<ProductSection title="Recommended Products" products={products.slice(0, 4)} /></section><Summary t={t} code={code} coupons={coupons} setCode={setCode} applyCoupon={() => applyCoupon(code)} /></div> : <Empty title="Your cart is empty" cta="Continue shopping" href="/products" />}</main>
    </CustomerShell>
  );
}

function Qty({ value, onChange }: { value: number; onChange: (qty: number) => void }) {
  return <div className="inline-flex items-center rounded-md border bg-white"><button aria-label="Decrease quantity" className="p-2" onClick={() => onChange(value - 1)}><Minus size={15} /></button><span className="min-w-8 text-center text-sm font-bold">{value}</span><button aria-label="Increase quantity" className="p-2" onClick={() => onChange(value + 1)}><Plus size={15} /></button></div>;
}

function Summary({ t, code, coupons, setCode, applyCoupon }: { t: ReturnType<typeof totals>; code: string; coupons: StoreCoupons; setCode: (x: string) => void; applyCoupon: () => void }) {
  return <aside className="premium-card h-fit p-5"><h2 className="display-font text-xl font-bold">Price Summary</h2><div className="mt-4 h-2 rounded-full bg-black/10"><div className="h-2 rounded-full bg-[#d4af37]" style={{ width: `${Math.min(100, (t.subtotal / 799) * 100)}%` }} /></div><p className="mt-2 text-xs text-black/55">Free delivery above Rs 799</p><div className="mt-4 flex gap-2"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="w-full rounded-md border px-3 py-2" placeholder="Coupon" /><Button variant="gold" onClick={applyCoupon}>Apply</Button></div><div className="mt-4 space-y-2 text-sm">{[["Subtotal", t.subtotal], ["Discount", -t.discount], ["Coupon discount", -t.couponDiscount], ["GST/tax", t.gst], ["Delivery charge", t.delivery], ["Handling charge", t.handling]].map(([k, v]) => <div key={String(k)} className="flex justify-between"><span>{String(k)}</span><span>{money(Number(v))}</span></div>)}</div><div className="mt-4 flex justify-between border-t pt-4 display-font text-xl font-black"><span>Total</span><span>{money(t.total)}</span></div><Link href="/checkout"><Button variant="gold" className="mt-4 w-full">Checkout</Button></Link><div className="mt-4 grid gap-2">{coupons.map((c) => <button key={c.code} onClick={() => { setCode(c.code); }} className="rounded-md border p-2 text-left text-xs"><b>{c.code}</b> - {c.title}</button>)}</div></aside>;
}

function WishlistPage() {
  const { wishlist, products, moveWishlistToCart, toggleWishlist } = useStore();
  const list = products.filter((p) => wishlist.includes(p.id));
  return <CustomerShell><main className="container-premium py-8"><h1 className="display-font text-3xl font-black">Wishlist</h1>{list.length ? <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">{list.map((p) => <div key={p.id}><ProductCard product={p} /><div className="mt-2 grid grid-cols-2 gap-2"><Button variant="gold" onClick={() => moveWishlistToCart(p.id)}>Move</Button><Button variant="outline" onClick={() => toggleWishlist(p.id)}>Remove</Button></div></div>)}</div> : <Empty title="Your wishlist is empty" cta="Browse products" href="/products" />}</main></CustomerShell>;
}

function CheckoutPage() {
  const { cart, products, coupons, addresses, addAddress, updateAddress, deleteAddress, placeOrder } = useStore();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [address, setAddress] = useState<Address>(addresses[0]);
  const [payment, setPayment] = useState<"COD" | "Razorpay">("COD");
  const [deliveryDate, setDeliveryDate] = useState("2026-06-04");
  const [slot, setSlot] = useState(deliverySlots[0]);
  const [terms, setTerms] = useState(false);
  const t = totals(cart, products, coupons);
  const finish = (success = true) => {
    if (!success) return router.push("/payment-failed");
    if (!terms) return alert("Please accept terms to place the order.");
    const order = placeOrder({ address, deliveryDate, deliverySlot: slot, paymentMethod: payment, paymentStatus: payment === "COD" ? "COD Pending" : "Paid" });
    router.push(`/order-success/${order.orderNumber}`);
  };
  return <CustomerShell><main className="container-premium py-8"><h1 className="display-font text-3xl font-black">Secure Checkout</h1><div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">{["Address", "Delivery Slot", "Payment", "Review"].map((x, i) => <button key={x} onClick={() => setStep(i + 1)} className={`min-w-fit rounded-full px-3 py-2 text-xs font-bold ${step === i + 1 ? "bg-black text-white" : "bg-white"}`}>{i + 1}. {x}</button>)}</div><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]"><section className="premium-card p-5">{step === 1 && <div><h2 className="display-font text-xl font-bold">Delivery Address</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{addresses.map((a) => <div key={a.id} className={`rounded-md border p-4 text-left ${address?.id === a.id ? "border-[#d4af37] bg-[#fff8df]" : "bg-white"}`}><button onClick={() => setAddress(a)} className="w-full text-left"><b>{a.label}</b><p className="text-sm">{a.line}, {a.city} - {a.pincode}</p><p className="mt-1 text-xs text-green-700">Serviceable pincode</p></button><div className="mt-3 flex gap-2"><Button variant="outline" onClick={() => updateAddress({ ...a, line: `${a.line} Apt` })}>Edit</Button><Button variant="ghost" onClick={() => deleteAddress(a.id)}>Delete</Button></div></div>)}</div><Button className="mt-4" variant="outline" onClick={() => addAddress({ label: "New", name: "Manav Shah", phone: "9876543210", line: "New Eagleclub address", city: "Surat", pincode: "395007" })}>Add new address</Button></div>}{step === 2 && <div><h2 className="display-font text-xl font-bold">Delivery Slot</h2><label className="mt-4 block text-sm font-bold">Delivery date<input aria-label="Delivery date" type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} className="mt-1 block rounded-md border px-3 py-2" /></label><div className="mt-4 grid gap-3 md:grid-cols-2">{deliverySlots.map((s) => <button key={s} onClick={() => setSlot(s)} className={`rounded-md border p-4 text-left ${slot === s ? "border-[#d4af37] bg-[#fff8df]" : "bg-white"}`}><Truck className="mb-2" />{s}</button>)}</div></div>}{step === 3 && <div><h2 className="display-font text-xl font-bold">Payment Method</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{(["COD", "Razorpay"] as const).map((p) => <button key={p} onClick={() => setPayment(p)} className={`rounded-md border p-4 text-left ${payment === p ? "border-[#d4af37] bg-[#fff8df]" : "bg-white"}`}><CreditCard className="mb-2" />{p === "COD" ? "Cash on Delivery" : "Razorpay UPI/Card/Net Banking"}</button>)}</div>{payment === "Razorpay" && <div className="mt-4 flex flex-wrap gap-2"><Button variant="gold" onClick={() => finish(true)}>Simulate Razorpay success</Button><Button variant="outline" onClick={() => finish(false)}>Simulate payment failure</Button></div>}</div>}{step === 4 && <div><h2 className="display-font text-xl font-bold">Review Order</h2><p className="mt-2 text-sm text-black/60">{cart.length} items, delivery {deliveryDate} at {slot}, payment {payment}</p><label className="mt-5 flex gap-2 text-sm"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> I agree to terms, easy cancellation, and freshness policy.</label><Button variant="gold" className="mt-5" onClick={() => finish(true)}>Place Order</Button></div>}<div className="mt-6 flex justify-between"><Button variant="ghost" onClick={() => setStep(Math.max(1, step - 1))}>Back</Button><Button onClick={() => setStep(Math.min(4, step + 1))}>Next</Button></div></section><Summary t={t} code="" coupons={coupons} setCode={() => {}} applyCoupon={() => {}} /></div></main></CustomerShell>;
}

function OrderSuccess({ number }: { number?: string }) {
  const { orders, products } = useStore();
  const order = orders.find((o) => o.orderNumber === number) || orders[0];
  return <CustomerShell><main className="container-premium py-10"><section className="premium-card mx-auto max-w-3xl p-8 text-center"><PackageCheck className="mx-auto text-green-700" size={60} /><h1 className="display-font mt-4 text-3xl font-black">Order Confirmed</h1><p className="mt-2">Order number <b>{order.orderNumber}</b></p><p className="text-sm text-black/60">{order.paymentStatus} | {order.deliverySlot} | {order.address.line}</p><OrderMini order={order} products={products} /><div className="mt-6 flex flex-wrap justify-center gap-3"><Link href={`/track-order/${order.orderNumber}`}><Button>Track order</Button></Link><Link href={`/invoice/${order.orderNumber}`}><Button variant="gold">Download invoice</Button></Link><Link href="/products"><Button variant="outline">Continue shopping</Button></Link></div></section></main></CustomerShell>;
}

function PaymentFailed() {
  return <CustomerShell><main className="container-premium py-10"><section className="premium-card mx-auto max-w-2xl p-8 text-center"><X className="mx-auto text-red-600" size={56} /><h1 className="display-font mt-4 text-3xl font-black">Payment Failed</h1><p className="mt-2 text-black/65">Your cart is safe. Retry payment or choose COD.</p><div className="mt-6 flex justify-center gap-3"><Link href="/checkout"><Button>Retry payment</Button></Link><Link href="/checkout"><Button variant="gold">Choose COD</Button></Link><Link href="/cart"><Button variant="outline">Back to cart</Button></Link></div></section></main></CustomerShell>;
}

function TrackOrder({ number }: { number?: string }) {
  const { orders, products } = useStore();
  const order = orders.find((o) => o.orderNumber === number) || orders[0];
  const steps = ["Placed", "Confirmed", "Packed", "Out for Delivery", "Delivered"];
  const current = steps.indexOf(order.status);
  return <CustomerShell><main className="container-premium py-8"><h1 className="display-font text-3xl font-black">Track Order {order.orderNumber}</h1><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]"><section className="premium-card p-6">{steps.map((s, i) => <div key={s} className="flex gap-4 pb-6"><div className={`h-8 w-8 rounded-full ${i <= current ? "bg-[#d4af37]" : "bg-black/10"}`} /><div><h3 className="font-bold">{s}</h3><p className="text-sm text-black/55">{i <= current ? "Completed" : "Pending"}</p></div></div>)}<p className="rounded-md bg-green-50 p-3 text-sm text-green-800">Delivery staff: {order.deliveryStaff}. Estimated delivery: {order.deliveryDate}, {order.deliverySlot}</p></section><OrderMini order={order} products={products} /></div></main></CustomerShell>;
}

function OrdersPage() {
  const { orders, products, coupons, reorder } = useStore();
  return <CustomerShell><main className="container-premium py-8"><h1 className="display-font text-3xl font-black">My Orders</h1><div className="mt-6 grid gap-4">{orders.map((o) => <div key={o.orderNumber} className="premium-card p-5"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="display-font font-bold">{o.orderNumber}</h3><p className="text-sm text-black/55">{o.items.length} items | {money(totals(o.items, products, coupons, o.couponCode).total)}</p></div><div className="flex gap-2"><StatusBadge value={o.status} /><StatusBadge value={o.paymentStatus} /></div></div><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => reorder(o)}><RotateCcw size={16} /> Reorder</Button><Link href={`/track-order/${o.orderNumber}`}><Button>Track</Button></Link><Link href={`/invoice/${o.orderNumber}`}><Button variant="gold"><FileText size={16} /> Invoice</Button></Link><Button variant="ghost" onClick={() => alert("Cancel/return eligibility will connect in backend phase")}>Cancel/return</Button></div></div>)}</div></main></CustomerShell>;
}

function InvoicePage({ number }: { number?: string }) {
  const { orders, products, coupons } = useStore();
  const order = orders.find((o) => o.orderNumber === number) || orders[0];
  const t = totals(order.items, products, coupons, order.couponCode);
  return <CustomerShell><main className="container-premium py-8"><section className="premium-card bg-white p-6"><div className="flex justify-between gap-4"><Logo /><div className="text-right"><h1 className="display-font text-2xl font-black">Invoice</h1><p>INV-{order.orderNumber}</p><p>{new Date(order.createdAt).toLocaleDateString("en-IN")}</p></div></div><div className="mt-6 grid gap-4 text-sm md:grid-cols-2"><div><b>Store</b><p>Eagleclub Grocery & Essentials</p><p>GSTIN: 24ABCDE1234F1Z5</p></div><div><b>Customer</b><p>{order.customerName}</p><p>{order.address.line}, {order.address.city} - {order.address.pincode}</p></div></div><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-black text-white"><tr>{["Product", "SKU", "Qty", "MRP", "Selling price", "Discount", "GST", "Line total"].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{order.items.map((item) => { const p = products.find((x) => x.id === item.productId)!; return <tr key={p.id} className="border-b"><td className="p-3">{p.name}</td><td>{p.sku}</td><td>{item.qty}</td><td>{money(p.mrp)}</td><td>{money(p.price)}</td><td>{money((p.mrp - p.price) * item.qty)}</td><td>{p.gst}%</td><td>{money(p.price * item.qty)}</td></tr>; })}</tbody></table></div><div className="ml-auto mt-6 max-w-sm space-y-2 text-sm"><div className="flex justify-between"><span>Subtotal</span><b>{money(t.subtotal)}</b></div><div className="flex justify-between"><span>Coupon discount</span><b>{money(t.couponDiscount)}</b></div><div className="flex justify-between"><span>Delivery charge</span><b>{money(t.delivery)}</b></div><div className="flex justify-between"><span>Handling charge</span><b>{money(t.handling)}</b></div><div className="flex justify-between border-t pt-3 display-font text-xl font-black"><span>Grand total</span><span>{money(t.total)}</span></div><p>Payment: {order.paymentMethod} | {order.paymentStatus}</p></div><div className="mt-6 flex gap-2 no-print"><Button onClick={() => window.print()}>Print invoice</Button><Button variant="outline" onClick={() => alert("PDF download placeholder for backend phase")}>Download PDF</Button></div></section></main></CustomerShell>;
}

function AccountPage({ section = "dashboard" }: { section?: string }) {
  const { orders, addresses, wishlist, products, coupons } = useStore();
  const totalSpent = orders.reduce((s, o) => s + totals(o.items, products, coupons, o.couponCode).total, 0);
  return <CustomerShell><main className="container-premium py-8"><h1 className="display-font text-3xl font-black">My Account</h1><div className="mt-6 grid gap-6 lg:grid-cols-[240px_1fr]"><aside className="premium-card h-fit p-3">{["profile", "addresses", "orders", "wishlist", "invoices", "support"].map((x) => <Link key={x} href={`/account/${x}`} className={`block rounded-md px-3 py-2 text-sm font-bold ${section === x ? "bg-black text-white" : ""}`}>{x[0].toUpperCase() + x.slice(1)}</Link>)}</aside><section className="grid gap-4 md:grid-cols-3">{[["Total orders", orders.length], ["Total spent", money(totalSpent)], ["Saved addresses", addresses.length], ["Wishlist items", wishlist.length], ["Last order", orders[0]?.status || "None"], ["Most purchased", "Dairy"]].map(([k, v]) => <div key={String(k)} className="premium-card p-5"><p className="text-sm text-black/55">{String(k)}</p><h3 className="display-font mt-2 text-2xl font-black">{String(v)}</h3></div>)}</section></div></main></CustomerShell>;
}

function StaticPage({ title }: { title: string }) {
  return <CustomerShell><main className="container-premium py-10"><section className="premium-card p-8"><h1 className="display-font text-3xl font-black">{title}</h1><p className="mt-4 max-w-3xl text-black/65">Eagleclub Grocery & Essentials is built around premium sourcing, transparent service, careful delivery, and helpful customer support. Detailed operational content will be connected during the backend phase.</p><Button className="mt-6" onClick={() => alert("Coming in backend phase")}>Contact support</Button></section></main></CustomerShell>;
}

function AuthPage({ title }: { title: string }) {
  const { toast } = useStore();
  return <CustomerShell><main className="container-premium flex min-h-[70vh] items-center justify-center py-10"><section className="premium-card w-full max-w-md p-8"><Logo /><h1 className="display-font mt-6 text-2xl font-black">{title}</h1><div className="mt-5 grid gap-3"><input className="rounded-md border px-3 py-3" placeholder="Email" /><input className="rounded-md border px-3 py-3" placeholder="Password" type="password" /><Button variant="gold" onClick={() => toast(`${title} successful in mock mode`, "success")}>{title}</Button></div><div className="mt-4 flex justify-between text-sm"><Link href="/forgot-password">Forgot password</Link><Link href="/signup">Create account</Link></div></section></main></CustomerShell>;
}

function Empty({ title, cta, href = "/products" }: { title: string; cta: string; href?: string }) {
  return <section className="premium-card my-8 p-10 text-center"><h2 className="display-font text-2xl font-black">{title}</h2><Link href={href}><Button variant="gold" className="mt-5">{cta}</Button></Link></section>;
}

function OrderMini({ order, products }: { order: Order; products: Product[] }) {
  const { coupons } = useStore();
  const t = totals(order.items, products, coupons, order.couponCode);
  return <aside className="premium-card mt-6 p-4 text-left"><h3 className="display-font font-bold">Order Summary</h3>{order.items.map((item) => { const p = products.find((x) => x.id === item.productId)!; return <div key={item.productId} className="mt-3 flex justify-between text-sm"><span>{p.name} x {item.qty}</span><b>{money(p.price * item.qty)}</b></div>; })}<div className="mt-4 flex justify-between border-t pt-3 display-font font-black"><span>Total</span><span>{money(t.total)}</span></div></aside>;
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
  if (first === "order-success") return <OrderSuccess number={second} />;
  if (first === "payment-failed") return <PaymentFailed />;
  if (first === "track-order") return <TrackOrder number={second} />;
  if (first === "orders") return <OrdersPage />;
  if (first === "invoice") return <InvoicePage number={second} />;
  if (["login", "signup", "forgot-password", "reset-password"].includes(first)) return <AuthPage title={first.split("-").map((x) => x[0].toUpperCase() + x.slice(1)).join(" ")} />;
  if (first === "account") return <AccountPage section={second || "dashboard"} />;
  return <StaticPage title={first.split("-").map((x) => x[0].toUpperCase() + x.slice(1)).join(" ")} />;
}

export function CustomerApp({ slug }: { slug: string[] }) {
  return <StoreProvider><Router slug={slug} /></StoreProvider>;
}
