"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BarChart3, Bell, Boxes, ClipboardList, CreditCard, LayoutDashboard, LogOut, Package, Plus, Search,
  Settings, ShieldCheck, Truck, UserRound, Users, WalletCards,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/common/Button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StoreProvider, useStore } from "@/store/AppStore";
import { categories } from "@/data/categories";
import { deliveryStaff } from "@/data/delivery";
import {
  createAdminBrand,
  createAdminCategory,
  createAdminProduct,
  deleteAdminBrand,
  deleteAdminCategory,
  deleteAdminProduct,
  fetchAdminBrands,
  fetchAdminCategories,
  fetchAdminProducts,
  fetchBrands,
  updateAdminProduct,
} from "@/services/catalog";
import { createAdminCoupon, deleteAdminCoupon, fetchAdminCoupons, updateAdminCoupon } from "@/services/commerce";
import { money, uid } from "@/lib/money";
import type { Category, Coupon, OrderStatus, Product } from "@/types";

const nav = [
  ["", LayoutDashboard, "Dashboard"],
  ["products", Package, "Products"],
  ["categories", Boxes, "Categories"],
  ["brands", ShieldCheck, "Brands"],
  ["inventory", ClipboardList, "Inventory"],
  ["orders", WalletCards, "Orders"],
  ["customers", Users, "Customers"],
  ["coupons", CreditCard, "Coupons"],
  ["payments", CreditCard, "Payments"],
  ["invoices", ClipboardList, "Invoices"],
  ["delivery", Truck, "Delivery"],
  ["returns", LogOut, "Returns"],
  ["reviews", UserRound, "Reviews"],
  ["reports", BarChart3, "Reports"],
  ["users", Users, "Users"],
  ["settings", Settings, "Settings"],
] as const;

function calc(items: { productId: string; qty: number }[], products: Product[]) {
  return items.reduce((sum, item) => sum + (products.find((p) => p.id === item.productId)?.price || 0) * item.qty, 0);
}

function AdminShell({ section, children }: { section: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f4ec] text-black lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 z-40 flex h-auto flex-col bg-black p-4 text-white lg:h-screen">
        <Link href="/admin" className="mb-6"><Logo invert /></Link>
        <nav className="no-scrollbar flex gap-2 overflow-x-auto lg:block lg:space-y-1 lg:overflow-y-auto">
          {nav.map(([href, Icon, label]) => {
            const active = section === href || (!section && !href);
            return <Link key={href} href={`/admin${href ? `/${href}` : ""}`} className={`flex min-w-fit items-center gap-3 rounded-md px-3 py-2 text-sm font-bold ${active ? "gold-gradient text-black" : "text-white/70 hover:bg-white/10 hover:text-white"}`}><Icon size={18} />{label}</Link>;
          })}
        </nav>
        <Link href="/admin/products/new" className="mt-4 hidden lg:block"><Button variant="gold" className="w-full"><Plus size={16} /> Add Product</Button></Link>
      </aside>
      <main className="min-w-0">
        <header className="sticky top-0 z-30 border-b bg-[#f7f4ec]/90 px-4 py-4 backdrop-blur no-print">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div><h1 className="display-font text-2xl font-black">{section ? title(section) : "Dashboard Overview"}</h1><p className="text-sm text-black/55">Eagleclub Grocery & Essentials control room</p></div>
            <div className="hidden items-center gap-3 md:flex"><div className="flex items-center rounded-md border bg-white px-3 py-2"><Search size={17} className="text-black/45" /><input className="w-56 border-0 bg-transparent px-2 text-sm outline-none" placeholder="Search admin..." /></div><button className="rounded-md bg-white p-2"><Bell size={19} /></button></div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}

function title(slug: string) {
  return slug.split("/").pop()!.split("-").map((x) => x[0].toUpperCase() + x.slice(1)).join(" ");
}

function Dashboard() {
  const { products, orders } = useStore();
  const revenue = orders.reduce((sum, o) => sum + calc(o.items, products), 0);
  const low = products.filter((p) => p.stock <= p.lowStock && p.stock > 0);
  const out = products.filter((p) => p.stock <= 0);
  const cards = [
    ["Total revenue", money(revenue), "+12.5%"],
    ["Today's revenue", money(Math.round(revenue * 0.18)), "Live"],
    ["Total orders", orders.length, "Mock"],
    ["Pending orders", orders.filter((o) => !["Delivered", "Cancelled"].includes(o.status)).length, "Needs action"],
    ["Delivered orders", orders.filter((o) => o.status === "Delivered").length, "98%"],
    ["Cancelled orders", orders.filter((o) => o.status === "Cancelled").length, "Low"],
    ["Total customers", 128, "CRM"],
    ["Total products", products.length, "Active"],
    ["Low-stock products", low.length, "Alert"],
    ["Out-of-stock products", out.length, "Critical"],
    ["Average order value", money(orders.length ? revenue / orders.length : 0), "AOV"],
    ["Conversion", "4.8%", "Placeholder"],
  ];
  return <AdminShell section=""><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([k, v, sub]) => <Stat key={String(k)} label={String(k)} value={String(v)} sub={String(sub)} />)}</div><div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]"><Panel title="Recent Orders"><OrderTable compact /></Panel><Panel title="Best-selling Products">{products.slice(0, 5).map((p) => <div key={p.id} className="flex items-center justify-between border-b py-3"><div><b>{p.name}</b><p className="text-xs text-black/55">{p.category}</p></div><span className="font-bold">{money(p.price)}</span></div>)}</Panel></div><div className="mt-6 grid gap-6 lg:grid-cols-2"><Panel title="Revenue Chart Placeholder"><div className="flex h-56 items-end gap-3">{[42,80,58,90,68,110,76].map((h, i) => <div key={i} className="flex-1 rounded-t bg-black" style={{ height: h }} />)}</div></Panel><Panel title="Order Status Chart Placeholder"><div className="grid gap-3">{["Placed", "Packed", "Delivered", "Cancelled"].map((s) => <div key={s}><div className="mb-1 flex justify-between text-sm"><span>{s}</span><b>{orders.filter((o) => o.status === s).length}</b></div><div className="h-2 rounded-full bg-black/10"><div className="h-2 rounded-full bg-[#d4af37]" style={{ width: `${25 + orders.filter((o) => o.status === s).length * 20}%` }} /></div></div>)}</div></Panel></div></AdminShell>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="premium-card p-5"><p className="text-xs font-bold uppercase text-black/50">{label}</p><h3 className="display-font mt-2 text-2xl font-black">{value}</h3><p className="mt-1 text-xs text-[#8a6500]">{sub}</p></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="premium-card overflow-hidden"><div className="border-b bg-white px-5 py-4"><h2 className="display-font font-bold">{title}</h2></div><div className="p-5">{children}</div></section>;
}

function ProductManager({ mode, id }: { mode?: "new" | "edit"; id?: string }) {
  const { products, addProduct, updateProduct, deleteProduct, replaceProducts, toast } = useStore();
  useEffect(() => {
    fetchAdminProducts().then(replaceProducts).catch(() => undefined);
  }, []);
  const existing = products.find((p) => p.id === id) || products[0];
  const [draft, setDraft] = useState<Product>(mode ? { ...existing, id: mode === "new" ? uid("prd") : existing.id, slug: mode === "new" ? "new-eagleclub-product" : existing.slug, name: mode === "new" ? "New Eagleclub Product" : existing.name } : existing);
  const save = async () => {
    mode === "new" ? addProduct(draft) : updateProduct(draft);
    try {
      const saved = mode === "new" ? await createAdminProduct(draft) : await updateAdminProduct(draft);
      if (mode === "new") {
        deleteProduct(draft.id);
        addProduct(saved);
      } else {
        updateProduct(saved);
      }
      toast("Product saved to backend", "success");
    } catch {
      toast("Product saved locally; backend admin session required", "info");
    }
  };
  const remove = async (product: Product) => {
    try {
      await deleteAdminProduct(product.id);
      toast("Product deleted in backend", "success");
    } catch {
      toast("Product deleted locally; backend admin session required", "info");
    }
    deleteProduct(product.id);
  };
  if (mode) return <AdminShell section="products"><Panel title={mode === "new" ? "Add Product" : "Edit Product"}><div className="grid gap-4 md:grid-cols-2">{["name", "sku", "brand", "category", "unit"].map((field) => <label key={field} className="text-sm font-bold">{title(field)}<input value={String(draft[field as keyof Product])} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label>)}{(["mrp", "price", "gst", "stock", "lowStock"] as const).map((field) => <label key={field} className="text-sm font-bold">{title(field)}<input type="number" value={draft[field]} onChange={(e) => setDraft({ ...draft, [field]: Number(e.target.value) })} className="mt-1 w-full rounded-md border px-3 py-2" /></label>)}<label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.featured} onChange={(e) => setDraft({ ...draft, featured: e.target.checked })} /> Featured</label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active</label></div><div className="mt-5 flex gap-2"><Button variant="gold" onClick={save}>Save Product</Button><Link href="/admin/products"><Button variant="outline">Back</Button></Link></div></Panel></AdminShell>;
  return <AdminShell section="products"><Panel title="Product Management"><div className="mb-4 flex justify-between gap-3"><input className="w-full rounded-md border px-3 py-2" placeholder="Search/filter products" /><Link href="/admin/products/new"><Button variant="gold"><Plus size={16} /> Add</Button></Link></div><DataTable headers={["Product", "SKU", "Category", "MRP", "Selling", "Stock", "Flags", "Actions"]}>{products.map((p) => <tr key={p.id} className="border-b"><td className="p-3 font-bold">{p.name}</td><td>{p.sku}</td><td>{p.category}</td><td>{money(p.mrp)}</td><td>{money(p.price)}</td><td>{p.stock}</td><td>{p.featured ? "Featured" : "Standard"} {p.organic ? "Organic" : ""}</td><td><div className="flex gap-2"><Link href={`/admin/products/${p.id}/edit`}><Button variant="outline">Edit</Button></Link><Button variant="ghost" onClick={() => remove(p)}>Delete</Button></div></td></tr>)}</DataTable></Panel></AdminShell>;
}

function Inventory() {
  const { products, adjustStock } = useStore();
  return <AdminShell section="inventory"><Panel title="Inventory"><DataTable headers={["Product", "Current stock", "Low threshold", "Status", "Adjust"]}>{products.map((p) => <tr key={p.id} className="border-b"><td className="p-3 font-bold">{p.name}</td><td>{p.stock}</td><td>{p.lowStock}</td><td><StatusBadge value={p.stock <= 0 ? "Out of stock" : p.stock <= p.lowStock ? "Low stock" : "In stock"} /></td><td><div className="flex gap-2"><Button variant="outline" onClick={() => adjustStock(p.id, Math.max(0, p.stock - 5))}>-5</Button><Button variant="gold" onClick={() => adjustStock(p.id, p.stock + 10)}>+10</Button></div></td></tr>)}</DataTable><p className="mt-4 rounded-md bg-white p-3 text-sm text-black/60">Stock movement history will sync with backend audit logs later.</p></Panel></AdminShell>;
}

function OrderTable({ compact = false }: { compact?: boolean }) {
  const { orders, products, updateOrderStatus } = useStore();
  const statuses: OrderStatus[] = ["Confirmed", "Packed", "Out for Delivery", "Delivered", "Cancelled"];
  return <DataTable headers={compact ? ["Order", "Customer", "Amount", "Status"] : ["Order", "Customer", "Amount", "Payment", "Delivery", "Status", "Actions"]}>{orders.map((o) => <tr key={o.orderNumber} className="border-b"><td className="p-3 font-bold"><Link className="underline decoration-[#d4af37] underline-offset-4" href={`/admin/orders/${o.orderNumber}`}>{o.orderNumber}</Link></td><td>{o.customerName}</td><td>{money(calc(o.items, products))}</td><td className={compact ? "hidden" : ""}><StatusBadge value={o.paymentStatus} /></td><td className={compact ? "hidden" : ""}>{o.deliveryStaff}</td><td><StatusBadge value={o.status} /></td>{!compact && <td><select aria-label={`Status for ${o.orderNumber}`} value={o.status} onChange={(e) => updateOrderStatus(o.orderNumber, e.target.value as OrderStatus)} className="rounded-md border px-2 py-2 text-sm">{statuses.map((s) => <option key={s}>{s}</option>)}</select></td>}</tr>)}</DataTable>;
}

function Orders({ detail }: { detail?: string }) {
  const { orders, products, updateOrderStatus, assignDeliveryStaff } = useStore();
  const order = orders.find((o) => o.orderNumber === detail);
  if (order) return <AdminShell section="orders"><Panel title={`Order ${order.orderNumber}`}><div className="grid gap-4 md:grid-cols-3"><Stat label="Amount" value={money(calc(order.items, products))} sub={order.paymentStatus} /><Stat label="Status" value={order.status} sub={order.deliverySlot} /><Stat label="Delivery staff" value={order.deliveryStaff || "Unassigned"} sub="Assigned" /></div><div className="mt-5 flex flex-wrap gap-2">{(["Confirmed", "Packed", "Out for Delivery", "Delivered", "Cancelled"] as OrderStatus[]).map((status) => <Button key={status} variant={order.status === status ? "gold" : "outline"} onClick={() => updateOrderStatus(order.orderNumber, status)}>{status}</Button>)}</div><h3 className="mt-6 font-bold">Assign delivery staff</h3><div className="mt-3 flex flex-wrap gap-2">{deliveryStaff.map((s) => <Button key={s} variant={order.deliveryStaff === s ? "gold" : "outline"} onClick={() => assignDeliveryStaff(order.orderNumber, s)}>{s}</Button>)}</div></Panel></AdminShell>;
  return <AdminShell section="orders"><Panel title="Orders"><OrderTable /></Panel></AdminShell>;
}

function Coupons() {
  const { coupons, addCoupon, updateCoupon, toast } = useStore();
  const [draft, setDraft] = useState<Coupon>({ code: "QA50", title: "QA test coupon", discountType: "flat", value: 50, minOrder: 100, active: true });
  useEffect(() => {
    fetchAdminCoupons().then((items) => items.forEach(addCoupon)).catch(() => undefined);
  }, []);
  const saveCoupon = async () => {
    addCoupon(draft);
    try {
      const saved = await createAdminCoupon(draft);
      addCoupon(saved);
      toast("Coupon saved to backend", "success");
    } catch {
      toast("Coupon saved locally; backend admin session required", "info");
    }
  };
  const toggleCoupon = async (coupon: Coupon) => {
    const next = { ...coupon, active: !coupon.active };
    updateCoupon(next);
    if (!coupon.id) return;
    try {
      updateCoupon(await updateAdminCoupon(next));
      toast("Coupon updated in backend", "success");
    } catch {
      toast("Coupon updated locally; backend admin session required", "info");
    }
  };
  const removeCoupon = async (coupon: Coupon) => {
    updateCoupon({ ...coupon, active: false });
    if (!coupon.id) return;
    try {
      await deleteAdminCoupon(coupon.id);
      toast("Coupon deactivated in backend", "success");
    } catch {
      toast("Coupon deactivated locally; backend admin session required", "info");
    }
  };
  return <AdminShell section="coupons"><Panel title="Coupons"><div className="mb-5 grid gap-3 rounded-md bg-white p-4 md:grid-cols-6"><input aria-label="Coupon code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className="rounded-md border px-3 py-2" /><input aria-label="Coupon title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="rounded-md border px-3 py-2 md:col-span-2" /><select aria-label="Coupon type" value={draft.discountType} onChange={(e) => setDraft({ ...draft, discountType: e.target.value as "flat" | "percent" | "shipping" })} className="rounded-md border px-3 py-2"><option value="flat">flat</option><option value="percent">percent</option><option value="shipping">shipping</option></select><input aria-label="Coupon value" type="number" value={draft.value} onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })} className="rounded-md border px-3 py-2" /><Button variant="gold" onClick={saveCoupon}>Add coupon</Button></div><DataTable headers={["Code", "Title", "Type", "Value", "Min order", "Status", "Actions"]}>{coupons.map((c) => <tr key={c.code} className="border-b"><td className="p-3 font-bold">{c.code}</td><td>{c.title}</td><td>{c.discountType}</td><td>{c.value}</td><td>{money(c.minOrder)}</td><td><StatusBadge value={c.active ? "Active" : "Inactive"} /></td><td><div className="flex gap-2"><Button variant="outline" onClick={() => toggleCoupon(c)}>{c.active ? "Disable" : "Enable"}</Button><Button variant="ghost" onClick={() => removeCoupon(c)}>Delete</Button></div></td></tr>)}</DataTable></Panel></AdminShell>;
}

function GenericAdmin({ section }: { section: string }) {
  const { products, orders, toast } = useStore();
  const [settings, setSettings] = useState({ storeName: "Eagleclub Grocery & Essentials", support: "support@eagleclub.in", city: "Ahmedabad" });
  const [catalogRows, setCatalogRows] = useState<(Category | { id: string; name: string; slug: string; logo?: string })[]>(section === "categories" ? categories : []);
  useEffect(() => {
    if (section === "categories") {
      fetchAdminCategories().then(setCatalogRows).catch(() => setCatalogRows(categories));
    }
    if (section === "brands") {
      fetchAdminBrands().then(setCatalogRows).catch(() => fetchBrands().then(setCatalogRows));
    }
  }, [section]);
  const addCatalogRow = async () => {
    const name = section === "brands" ? `New Brand ${Date.now()}` : `New Category ${Date.now()}`;
    try {
      const row = section === "brands" ? await createAdminBrand(name) : await createAdminCategory(name);
      setCatalogRows((items) => [row, ...items]);
      toast(`${title(section)} saved to backend`, "success");
    } catch {
      setCatalogRows((items) => [{ id: uid(section), name, slug: name.toLowerCase().replaceAll(" ", "-") }, ...items]);
      toast(`${title(section)} saved locally; backend admin session required`, "info");
    }
  };
  const removeCatalogRow = async (id: string) => {
    try {
      section === "brands" ? await deleteAdminBrand(id) : await deleteAdminCategory(id);
      toast(`${title(section)} deleted in backend`, "success");
    } catch {
      toast(`${title(section)} deleted locally; backend admin session required`, "info");
    }
    setCatalogRows((items) => items.filter((item) => item.id !== id));
  };
  if (section === "settings") return <AdminShell section={section}><Panel title="Settings"><div className="grid gap-4 md:grid-cols-3">{Object.entries(settings).map(([key, value]) => <label key={key} className="text-sm font-bold">{title(key)}<input value={value} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label>)}</div><Button variant="gold" className="mt-5" onClick={() => alert("Settings saved in mock UI")}>Save settings</Button></Panel></AdminShell>;
  if (section === "categories" || section === "brands") return <AdminShell section={section}><Panel title={title(section)}><div className="mb-4 flex justify-end"><Button variant="gold" onClick={addCatalogRow}><Plus size={16} /> Add</Button></div>{catalogRows.map((c) => <div key={c.id} className="mb-3 flex items-center justify-between rounded-md bg-white p-3"><span className="font-bold">{c.name}</span><div className="flex gap-2"><Button variant="outline">Edit</Button><Button variant="ghost" onClick={() => removeCatalogRow(c.id)}>Delete</Button></div></div>)}</Panel></AdminShell>;
  const rows = section === "customers" ? ["Manav Shah", "Priya Sharma", "Arjun Mehta", "Riya Patel"] : section === "delivery" ? deliveryStaff : section === "payments" ? orders.map((o) => `${o.orderNumber} - ${o.paymentStatus}`) : products.slice(0, 6).map((p) => p.name);
  return <AdminShell section={section}><div className="grid gap-6 lg:grid-cols-3"><Panel title={title(section)}><div className="grid gap-3">{rows.map((r) => <div key={r} className="rounded-md bg-white p-3 font-semibold">{r}</div>)}</div><Button className="mt-4" variant="gold" onClick={() => alert("Coming in backend phase")}>Primary action</Button></Panel><Panel title="Filters"><input className="w-full rounded-md border px-3 py-2" placeholder="Date range / search" /><Button className="mt-3" variant="outline">Export placeholder</Button></Panel><Panel title="Insights"><Stat label="Records" value={String(rows.length)} sub="Mock state" /></Panel></div></AdminShell>;
}

function Reports() {
  const { products, orders } = useStore();
  return <AdminShell section="reports"><div className="grid gap-6 md:grid-cols-2"><Panel title="Sales Report"><Stat label="Sales" value={money(orders.reduce((s, o) => s + calc(o.items, products), 0))} sub="Date range: this week" /></Panel><Panel title="Product-wise Sales">{products.slice(0, 5).map((p, index) => <div key={p.id} className="flex justify-between border-b py-2"><span>{p.name}</span><b>{24 + index * 17} units</b></div>)}</Panel><Panel title="Category-wise Sales">{categories.slice(0, 6).map((c) => <div key={c.id} className="flex justify-between border-b py-2"><span>{c.name}</span><b>{money(12000 + c.id.length * 1000)}</b></div>)}</Panel><Panel title="Payment / Delivery Report"><p className="text-sm text-black/60">Payment split, delivery performance, and inventory export placeholders are ready for backend integration.</p><Button variant="outline" className="mt-4">Export CSV</Button></Panel></div></AdminShell>;
}

function Login() {
  return <StoreProvider><div className="flex min-h-screen items-center justify-center bg-black p-4"><section className="premium-card w-full max-w-md p-8"><Logo /><h1 className="display-font mt-6 text-2xl font-black">Admin Login</h1><input className="mt-5 w-full rounded-md border px-3 py-3" defaultValue="admin@eagleclub.in" /><input className="mt-3 w-full rounded-md border px-3 py-3" defaultValue="admin123" type="password" /><Link href="/admin"><Button variant="gold" className="mt-5 w-full">Login</Button></Link></section></div></StoreProvider>;
}

function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-black text-white"><tr>{headers.map((h) => <th key={h} className={`p-3 ${h === "Payment" || h === "Delivery" ? "hidden" : ""}`}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function Router({ slug }: { slug: string[] }) {
  const [first, second, third] = slug;
  if (first === "login") return <Login />;
  if (!first) return <StoreProvider><Dashboard /></StoreProvider>;
  if (first === "products" && second === "new") return <StoreProvider><ProductManager mode="new" /></StoreProvider>;
  if (first === "products" && third === "edit") return <StoreProvider><ProductManager mode="edit" id={second} /></StoreProvider>;
  if (first === "products") return <StoreProvider><ProductManager /></StoreProvider>;
  if (first === "inventory") return <StoreProvider><Inventory /></StoreProvider>;
  if (first === "orders") return <StoreProvider><Orders detail={second} /></StoreProvider>;
  if (first === "coupons") return <StoreProvider><Coupons /></StoreProvider>;
  if (first === "reports") return <StoreProvider><Reports /></StoreProvider>;
  return <StoreProvider><GenericAdmin section={first} /></StoreProvider>;
}

export function AdminApp({ slug }: { slug: string[] }) {
  return <Router slug={slug} />;
}
