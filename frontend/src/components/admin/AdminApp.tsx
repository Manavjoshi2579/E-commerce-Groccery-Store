"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, Bell, Boxes, ClipboardList, CreditCard, Eye, EyeOff, LayoutDashboard, LogOut, Package, Plus, Search,
  Hash, Layers3, Menu, MessageCircle, Pencil, Save, Settings, ShieldCheck, Tags, Trash2, Truck, Users, WalletCards, X,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/common/Button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { StoreProvider, useStore } from "@/store/AppStore";
import { categories } from "@/data/categories";
import { deliveryStaff } from "@/data/delivery";
import { products as seedProducts } from "@/data/products";
import {
  createAdminBrand,
  createAdminCategory,
  createAdminProduct,
  deleteAdminBrand,
  deleteAdminCategory,
  deleteAdminProduct,
  fetchAdminBrands,
  fetchAdminCategories,
  fetchAdminProduct,
  fetchAdminProducts,
  fetchBrands,
  bulkImportAdminProducts,
  bulkImportAdminProductFile,
  downloadProductBulkTemplateXlsx,
  downloadProductBulkTemplate,
  type BulkImportMode,
  updateAdminBrand,
  updateAdminCategory,
  updateAdminProduct,
} from "@/services/catalog";
import { createAdminCoupon, deleteAdminCoupon, fetchAdminCoupons, updateAdminCoupon } from "@/services/commerce";
import { adjustAdminInventory, assignAdminDelivery, createAdminDeliveryStaff, createAdminDeliverySlot, deleteAdminDeliveryStaff, deleteAdminDeliverySlot, fetchAdminDeliveryStaff, fetchAdminDeliverySlots, fetchAdminInventory, fetchAdminOrders, updateAdminDeliverySlot, updateAdminOrderStatus, updateDeliveryOrderStatus } from "@/services/checkout";
import { bulkUpdateAdminFaqStatus, createAdminFaq, deleteAdminFaq, faqCategories, fetchAdminFaqs, updateAdminFaq } from "@/services/faqs";
import { deleteAdminCustomer, fetchAdminCustomers, updateAdminCustomerStatus } from "@/services/admin";
import { fetchAdminReports, fetchAdminReturns, fetchAdminReviews, fetchAdminRoles, fetchAdminSettings, fetchAdminUsers, resetAdminSettings, updateAdminReturnRefund, updateAdminReturnStatus, updateAdminReviewStatus, updateAdminSettings, updateAdminUser, type AdminReport, type AdminReturn, type AdminReview, type AdminRoleRow, type AdminUserRow } from "@/services/adminOps";
import { fetchAdminSupportTickets, updateAdminSupportTicket } from "@/services/support";
import { money, uid } from "@/lib/money";
import type { AdminCustomer, Category, Coupon, FAQ, Order, OrderStatus, Product, ProductVariant, SupportTicket } from "@/types";

const nav = [
  ["", LayoutDashboard, "Dashboard"],
  ["products", Package, "Products"],
  ["categories", Boxes, "Categories"],
  ["brands", ShieldCheck, "Brands"],
  ["inventory", ClipboardList, "Inventory"],
  ["orders", WalletCards, "Orders"],
  ["customers", Users, "Customers"],
  ["support", MessageCircle, "Support"],
  ["faqs", MessageCircle, "FAQs"],
  ["coupons", CreditCard, "Coupons"],
  ["payments", CreditCard, "Payments"],
  ["invoices", ClipboardList, "Invoices"],
  ["delivery", Truck, "Delivery"],
  ["returns", LogOut, "Returns"],
  ["reviews", MessageCircle, "Reviews"],
  ["reports", BarChart3, "Reports"],
  ["users", Users, "Admin Users"],
  ["settings", Settings, "Settings"],
] as const;

const roleSections: Record<string, string[]> = {
  SUPER_ADMIN: nav.map(([href]) => href),
  STORE_MANAGER: ["products", "categories", "brands", "inventory", "orders", "customers", "support", "faqs", "coupons", "reports"],
  INVENTORY_MANAGER: ["products", "inventory", "reports"],
  ORDER_MANAGER: ["orders", "customers", "support", "delivery", "reports"],
  DELIVERY_STAFF: ["delivery", "orders"],
  SUPPORT_STAFF: ["customers", "support", "faqs", "orders", "returns"],
  BILLING_STAFF: ["payments", "invoices", "reports"],
};

function canAdminAccess(role: string | undefined, section: string) {
  if (!role) return section === "";
  return (roleSections[role] || []).includes(section);
}

function canManageCatalog(role: string | undefined) {
  return role === "SUPER_ADMIN" || role === "STORE_MANAGER";
}

function canManageCoupons(role: string | undefined) {
  return role === "SUPER_ADMIN" || role === "STORE_MANAGER";
}

function roleLandingPath(role: string | undefined) {
  if (role === "SUPER_ADMIN") return "/admin";
  if (role === "STORE_MANAGER") return "/admin/products";
  if (role === "INVENTORY_MANAGER") return "/admin/inventory";
  if (role === "DELIVERY_STAFF") return "/admin/delivery";
  if (role === "BILLING_STAFF") return "/admin/payments";
  if (role === "SUPPORT_STAFF") return "/admin/support";
  if (role === "ORDER_MANAGER") return "/admin/orders";
  const firstSection = role ? roleSections[role]?.[0] : "";
  return firstSection ? `/admin/${firstSection}` : "/admin";
}

function calc(items: { productId: string; qty: number; price?: number }[], products: Product[]) {
  return items.reduce((sum, item) => sum + ("price" in item && typeof item.price === "number" ? item.price : products.find((p) => p.id === item.productId)?.price || 0) * item.qty, 0);
}

function AdminShell({ section, children }: { section: string; children: React.ReactNode }) {
  const { admin, adminReady, logoutAdmin } = useStore();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [latestOrderNumber, setLatestOrderNumber] = useState("");
  const knownOrderNumbers = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (adminReady && !admin) router.replace("/admin/login");
  }, [adminReady, admin, router]);
  const logout = async () => {
    await logoutAdmin();
    router.push("/admin/login");
  };
  const role = admin?.role?.name;
  const visibleNav = nav.filter(([href]) => canAdminAccess(role, href));
  const canViewSection = canAdminAccess(role, section);
  useEffect(() => {
    if (!admin || !canAdminAccess(role, "orders")) return;
    let stopped = false;
    const poll = async () => {
      try {
        const rows = await fetchAdminOrders();
        const numbers = new Set(rows.map((order) => order.orderNumber));
        if (!knownOrderNumbers.current) {
          knownOrderNumbers.current = numbers;
          setLatestOrderNumber(rows[0]?.orderNumber || "");
          return;
        }
        const fresh = rows.filter((order) => !knownOrderNumbers.current!.has(order.orderNumber));
        if (fresh.length) {
          knownOrderNumbers.current = numbers;
          setLatestOrderNumber(fresh[0].orderNumber);
          setNewOrderCount((count) => count + fresh.length);
          try {
            const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
            await audio.play();
          } catch {
            // Browser may block sound until the admin interacts with the page.
          }
        }
      } catch {
        // Header polling should never interrupt admin work.
      }
    };
    poll();
    const timer = window.setInterval(() => { if (!stopped) void poll(); }, 15000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [admin, role]);
  useEffect(() => {
    if (adminReady && admin && !canViewSection) router.replace("/admin");
  }, [adminReady, admin, canViewSection, router]);
  if (adminReady && !admin) return <div className="flex min-h-screen items-center justify-center bg-black text-white">Redirecting to admin login...</div>;
  if (adminReady && admin && !canViewSection) return <div className="flex min-h-screen items-center justify-center bg-[#f7f4ec] p-6 text-center font-bold text-black/70">Redirecting to your dashboard...</div>;
  return (
    <div className="min-h-screen bg-[#f7f4ec] text-black lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-40 flex h-auto flex-col bg-black p-3 text-white shadow-xl lg:h-screen lg:p-4">
        <div className="flex items-center justify-between gap-3 lg:mb-6">
          <Link href="/admin" className="shrink-0" onClick={() => setMobileNavOpen(false)}><Logo invert /></Link>
          <button type="button" onClick={() => setMobileNavOpen((open) => !open)} className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/15 text-white hover:bg-white/10 lg:hidden" aria-expanded={mobileNavOpen} aria-label="Open admin navigation"><Menu size={22} /></button>
        </div>
        <nav className={`${mobileNavOpen ? "grid" : "hidden"} mt-3 gap-2 rounded-md border border-white/10 bg-white/5 p-2 lg:mt-0 lg:grid lg:gap-1 lg:border-0 lg:bg-transparent lg:p-0`}>
          {visibleNav.map(([href, Icon, label]) => {
            const active = section === href || (!section && !href);
            return <Link key={href} href={`/admin${href ? `/${href}` : ""}`} onClick={() => setMobileNavOpen(false)} className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm font-bold lg:py-2 ${active ? "gold-gradient text-black" : "text-white/70 hover:bg-white/10 hover:text-white"}`}><Icon size={18} /><span>{label}</span></Link>;
          })}
        </nav>
      </aside>
      <main className="min-w-0">
        <header className="sticky top-0 z-30 border-b bg-[#f7f4ec]/90 px-4 py-4 backdrop-blur no-print">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0"><h1 className="display-font truncate text-2xl font-black">{section ? title(section) : "Dashboard Overview"}</h1><p className="truncate text-sm text-black/55">Eagle Mart Grocery & Essentials control room</p></div>
            <div className="flex min-w-0 flex-wrap items-center gap-2 md:gap-3"><div className="flex min-w-[180px] flex-1 items-center rounded-md border bg-white px-3 py-2 md:flex-none"><Search size={17} className="shrink-0 text-black/45" /><input className="min-w-0 flex-1 border-0 bg-transparent px-2 text-sm outline-none md:w-56" placeholder="Search admin..." /></div>{canAdminAccess(role, "orders") && <button type="button" onClick={() => { setNewOrderCount(0); router.push(latestOrderNumber ? `/admin/orders/${latestOrderNumber}` : "/admin/orders"); }} className="relative grid h-10 w-10 place-items-center rounded-md border bg-white text-black" aria-label="Order notifications"><Bell size={18} />{newOrderCount > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">{newOrderCount}</span>}</button>}{admin && <span className="rounded-md bg-white px-2 py-2 text-xs font-bold text-black/55">{admin.role?.name || "Admin"}</span>}<button onClick={logout} className="rounded-md bg-black px-3 py-2 text-sm font-bold text-white">Logout</button></div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl p-3 sm:p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}

function title(slug: string) {
  return slug.split("/").pop()!.split("-").map((x) => x[0].toUpperCase() + x.slice(1)).join(" ");
}

function productSlug(name: string, id: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "eagle-mart-product";
  return `${base}-${id.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-6)}`;
}

function catalogSlug(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function dateInput(value?: string) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function Dashboard() {
  const { admin, products, orders, coupons, toast } = useStore();
  const [remoteOrders, setRemoteOrders] = useState<Order[]>([]);
  const [remoteProducts, setRemoteProducts] = useState<Product[]>([]);
  const [remoteCoupons, setRemoteCoupons] = useState<Coupon[]>([]);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [report, setReport] = useState<AdminReport | null>(null);
  const role = admin?.role?.name;
  useEffect(() => {
    if (canAdminAccess(role, "orders")) {
      fetchAdminOrders().then(setRemoteOrders).catch((error) => toast(error instanceof Error ? error.message : "Unable to load dashboard orders. Database connection is unavailable.", "error"));
    }
    if (canAdminAccess(role, "products")) {
      fetchAdminProducts({ limit: 500 }).then((result) => setRemoteProducts(result.products)).catch((error) => toast(error instanceof Error ? error.message : "Unable to load dashboard products. Database connection is unavailable.", "error"));
    }
    if (canAdminAccess(role, "coupons")) {
      fetchAdminCoupons().then(setRemoteCoupons).catch((error) => toast(error instanceof Error ? error.message : "Unable to load dashboard coupons. Database connection is unavailable.", "error"));
    }
    if (canAdminAccess(role, "customers")) {
      fetchAdminCustomers().then(setCustomers).catch((error) => toast(error instanceof Error ? error.message : "Unable to load customers. Database connection is unavailable.", "error"));
    }
    if (canAdminAccess(role, "reports")) {
      fetchAdminReports().then(setReport).catch((error) => toast(error instanceof Error ? error.message : "Unable to load dashboard reports. Database connection is unavailable.", "error"));
    }
  }, [role, toast]);
  const dashboardOrders = remoteOrders.length ? remoteOrders : orders;
  const dashboardProducts = remoteProducts.length ? remoteProducts : products;
  const dashboardCoupons = remoteCoupons.length ? remoteCoupons : coupons;
  const revenue = dashboardOrders.reduce((sum, o) => sum + (o.grandTotal || calc(o.items, products)), 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayRevenue = dashboardOrders.filter((order) => new Date(order.createdAt) >= today).reduce((sum, order) => sum + (order.grandTotal || calc(order.items, dashboardProducts)), 0);
  const low = dashboardProducts.filter((p) => p.stock <= p.lowStock && p.stock > 0);
  const out = dashboardProducts.filter((p) => p.stock <= 0);
  const codPending = dashboardOrders.filter((o) => o.paymentStatus === "COD Pending").reduce((sum, o) => sum + (o.grandTotal || calc(o.items, products)), 0);
  const onlinePaid = dashboardOrders.filter((o) => o.paymentStatus === "Paid").reduce((sum, o) => sum + (o.grandTotal || calc(o.items, products)), 0);
  const repeatCustomers = customers.filter((customer) => customer.orderCount > 1).length;
  const returningRate = customers.length ? Math.round((repeatCustomers / customers.length) * 100) : 0;
  const activeOrders = dashboardOrders.filter((order) => !["Delivered", "Cancelled"].includes(order.status));
  const deliveredOrders = dashboardOrders.filter((order) => order.status === "Delivered");
  const cancelledOrders = dashboardOrders.filter((order) => order.status === "Cancelled");
  const paidOrders = dashboardOrders.filter((order) => order.paymentStatus === "Paid");
  const failedOrders = dashboardOrders.filter((order) => order.paymentStatus === "Failed");
  const activeCoupons = dashboardCoupons.filter((coupon) => coupon.active);
  const salesByDay = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (6 - index));
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const amount = dashboardOrders.filter((order) => {
      const date = new Date(order.createdAt);
      return date >= day && date < next;
    }).reduce((sum, order) => sum + (order.grandTotal || calc(order.items, dashboardProducts)), 0);
    return { label: day.toLocaleDateString("en-IN", { weekday: "short" }), value: amount, display: money(amount) };
  });
  const statusRows = (["Placed", "Confirmed", "Packed", "Out for Delivery", "Delivered", "Cancelled"] as OrderStatus[]).map((status) => ({ label: status, value: dashboardOrders.filter((order) => order.status === status).length }));
  const paymentRows = [
    { label: "Paid", value: paidOrders.length },
    { label: "COD Pending", value: dashboardOrders.filter((order) => order.paymentStatus === "COD Pending").length },
    { label: "Failed", value: failedOrders.length },
    { label: "Refunded", value: dashboardOrders.filter((order) => order.paymentStatus === "Refunded").length },
  ];
  const inventoryRows = [
    { label: "In stock", value: dashboardProducts.filter((product) => product.stock > product.lowStock).length },
    { label: "Low stock", value: low.length },
    { label: "Out of stock", value: out.length },
  ];
  const bestProducts = report?.productSales?.length ? report.productSales.slice(0, 5) : dashboardProducts.slice(0, 5).map((product) => ({ name: product.name, units: product.stock, amount: product.price }));
  const categoryRows = report?.categorySales?.length ? report.categorySales.map((item) => ({ label: item.name, value: item.amount, units: item.units })) : [];
  const recentOrders = dashboardOrders.slice(0, 8);
  const cards = [
    ["Today's revenue", money(todayRevenue), "Orders created today"],
    ["Total revenue", money(revenue), `${paidOrders.length} paid orders`],
    ["Total orders", dashboardOrders.length, "Live"],
    ["Active orders", activeOrders.length, "Needs action"],
    ["Delivered orders", deliveredOrders.length, `${dashboardOrders.length ? Math.round((deliveredOrders.length / dashboardOrders.length) * 100) : 0}% completion`],
    ["Cancelled orders", cancelledOrders.length, `${failedOrders.length} failed payments`],
    ["Total customers", customers.length, "CRM"],
    ["Total products", dashboardProducts.length, "Database catalog"],
    ["Low-stock products", low.length, "Alert"],
    ["Out-of-stock products", out.length, "Critical"],
    ["COD pending amount", money(codPending), "Collectable"],
    ["Online paid amount", money(onlinePaid), "Settled"],
    ["Average order value", money(dashboardOrders.length ? revenue / dashboardOrders.length : 0), "AOV"],
    ["Coupons used", dashboardOrders.filter((o) => o.couponCode).length, `${activeCoupons.length} active`],
  ];
  const kpiGroups = [
    { title: "Revenue", items: [cards[0], cards[1], cards[12]] },
    { title: "Orders", items: [cards[2], cards[3], cards[4], cards[5]] },
    { title: "Customers", items: [cards[6]] },
    { title: "Catalog & Inventory", items: [cards[7], cards[8], cards[9]] },
    { title: "Payments", items: [cards[10], cards[11]] },
    { title: "Promotions", items: [cards[13]] },
  ];
  const actions = [
    ["/admin/products/new", "Add Product", canManageCatalog(role), "gold"],
    ["/admin/coupons", "Create Coupon", canManageCoupons(role), "gold"],
    ["/admin/orders", "View Pending Orders", canAdminAccess(role, "orders"), "gold"],
    ["/admin/inventory", "Adjust Inventory", canAdminAccess(role, "inventory"), "gold"],
    ["/admin/delivery", "Assign Delivery", canAdminAccess(role, "delivery"), "gold"],
    ["/admin/reports", "Open Reports", canAdminAccess(role, "reports"), "outline"],
  ].filter(([, , allowed]) => allowed);
  if (role === "DELIVERY_STAFF") {
    const deliveryRows = dashboardOrders.filter((order) => !["Cancelled", "Refunded"].includes(order.status));
    const deliveryCards: [string, string, string][] = [
      ["Delivery orders", String(deliveryRows.length), "Database orders"],
      ["Assigned", String(deliveryRows.filter((order) => order.deliveryStaff).length), "With delivery staff"],
      ["Unassigned", String(deliveryRows.filter((order) => !order.deliveryStaff && !["Delivered", "Cancelled"].includes(order.status)).length), "Needs assignment"],
      ["Out for delivery", String(deliveryRows.filter((order) => order.status === "Out for Delivery").length), "On route"],
      ["Delivered", String(deliveryRows.filter((order) => order.status === "Delivered").length), "Completed"],
      ["COD pending", money(deliveryRows.filter((order) => order.paymentStatus === "COD Pending").reduce((sum, order) => sum + (order.grandTotal || 0), 0)), "Collectable"],
      ["Today", String(deliveryRows.filter((order) => new Date(order.deliveryDate || order.createdAt) >= today).length), "Scheduled today"],
      ["Cancelled", String(dashboardOrders.filter((order) => order.status === "Cancelled").length), "Stopped"],
    ];
    return <AdminShell section=""><div className="mb-5 flex flex-wrap gap-2">{actions.map(([href, label, _allowed, variant]) => <Link key={String(href)} href={String(href)}><Button variant={variant === "outline" ? "outline" : "gold"}>{String(label)}</Button></Link>)}</div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{deliveryCards.map(([label, value, sub]) => <Stat key={label} label={label} value={value} sub={sub} />)}</div><div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]"><Panel title="Delivery Queue"><DataTable headers={["Order", "Customer", "Area", "Slot", "Status", "Staff"]} minWidth="min-w-[860px]">{deliveryRows.slice(0, 10).map((order) => <tr key={order.orderNumber} className="border-b odd:bg-white even:bg-[#faf7ef]"><td className="p-3 font-bold"><Link className="underline decoration-[#d4af37] underline-offset-4" href={`/admin/orders/${order.orderNumber}`}>{order.orderNumber}</Link><div className="text-xs font-normal text-black/50">{new Date(order.deliveryDate || order.createdAt).toLocaleDateString("en-IN")}</div></td><td className="p-3">{order.customerName}<div className="text-xs text-black/50">{order.address.phone}</div></td><td className="p-3">{order.address.city}<div className="text-xs text-black/50">{order.address.pincode}</div></td><td className="p-3">{order.deliverySlot || "-"}</td><td className="p-3"><StatusBadge value={order.status} /></td><td className="p-3 font-bold">{order.deliveryStaff || "Unassigned"}</td></tr>)}</DataTable>{!deliveryRows.length && <p className="rounded-md bg-white p-4 text-sm text-black/60">No delivery orders found in database.</p>}</Panel><Panel title="Delivery Summary"><DashboardSplit stats={[["Assigned", deliveryRows.filter((order) => order.deliveryStaff).length], ["Unassigned", deliveryRows.filter((order) => !order.deliveryStaff && !["Delivered", "Cancelled"].includes(order.status)).length], ["Out", deliveryRows.filter((order) => order.status === "Out for Delivery").length], ["Delivered", deliveryRows.filter((order) => order.status === "Delivered").length]]} /><Link href="/admin/delivery" className="mt-5 inline-block"><Button variant="gold">Open Delivery</Button></Link></Panel></div></AdminShell>;
  }
  return <AdminShell section=""><div className="mb-5 flex flex-wrap gap-2">{actions.map(([href, label, _allowed, variant]) => <Link key={String(href)} href={String(href)}><Button variant={variant === "outline" ? "outline" : "gold"}>{String(label)}</Button></Link>)}</div><div className="grid gap-4 xl:grid-cols-3">{kpiGroups.map((group) => <KpiGroup key={group.title} title={group.title} items={group.items} />)}</div><div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.85fr]"><Panel title="Revenue trend"><MetricBars data={salesByDay} unit="currency" /></Panel><Panel title="Order status analytics"><ProgressRows rows={statusRows} total={Math.max(1, dashboardOrders.length)} /></Panel></div><div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_0.9fr_1.2fr]"><Panel title="Payment monitoring"><ProgressRows rows={paymentRows} total={Math.max(1, dashboardOrders.length)} /></Panel><Panel title="Inventory health"><DonutMetric rows={inventoryRows} /></Panel><Panel title="Category sales"><CategorySalesPanel rows={categoryRows} /></Panel></div><div className="mt-6 grid gap-6 xl:grid-cols-3"><Panel title="Recent Orders"><div className="responsive-scroll overflow-x-auto"><table className="w-full min-w-[360px] text-left text-sm"><thead className="bg-black text-white"><tr><th className="p-3">Order</th><th>Customer</th><th>Amount</th></tr></thead><tbody>{recentOrders.map((order) => <tr key={order.orderNumber} className="border-b"><td className="p-3 font-bold"><Link className="underline decoration-[#d4af37] underline-offset-4" href={`/admin/orders/${order.orderNumber}`}>{order.orderNumber}</Link></td><td>{order.customerName}</td><td>{money(order.grandTotal || calc(order.items, dashboardProducts))}</td></tr>)}</tbody></table></div></Panel><Panel title="Best-selling products">{bestProducts.map((p) => <div key={p.name} className="flex items-center justify-between gap-3 border-b py-3"><div><b>{p.name}</b><p className="text-xs text-black/55">{p.units} units sold</p></div><span className="font-bold">{money(p.amount)}</span></div>)}</Panel><Panel title="Delivery summary"><DashboardSplit stats={[["Assigned", dashboardOrders.filter((o) => o.deliveryStaff).length], ["Unassigned", dashboardOrders.filter((o) => !o.deliveryStaff && !["Delivered", "Cancelled"].includes(o.status)).length], ["Out", dashboardOrders.filter((o) => o.status === "Out for Delivery").length], ["Delivered", deliveredOrders.length]]} /></Panel><Panel title="Customer insights"><DashboardSplit stats={[["Customers", customers.length], ["Repeat", repeatCustomers], ["Returning %", returningRate], ["Support", customers.reduce((sum, customer) => sum + customer.supportTicketCount, 0)]]} /></Panel><Panel title="Coupon performance"><DashboardSplit stats={[["Active", activeCoupons.length], ["Used", dashboardOrders.filter((o) => o.couponCode).length], ["Total", dashboardCoupons.length], ["Discounted", dashboardOrders.filter((o) => (o.couponDiscount || 0) > 0).length]]} /></Panel></div></AdminShell>;
}

function KpiGroup({ title, items }: { title: string; items: (string | number)[][] }) {
  return <section className="premium-card overflow-hidden"><div className="border-b bg-white px-4 py-3"><h2 className="display-font text-sm font-black uppercase text-black/70">{title}</h2></div><div className="grid gap-3 p-3 sm:grid-cols-2">{items.map(([label, value, sub]) => <Stat key={String(label)} label={String(label)} value={String(value)} sub={String(sub)} />)}</div></section>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="premium-card p-5"><p className="text-xs font-bold uppercase text-black/50">{label}</p><h3 className="display-font mt-2 text-2xl font-black">{value}</h3><p className="mt-1 text-xs text-[#8a6500]">{sub}</p></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="premium-card overflow-hidden"><div className="border-b bg-white px-5 py-4"><h2 className="display-font font-bold">{title}</h2></div><div className="p-5">{children}</div></section>;
}

function MetricBars({ data, unit = "number" }: { data: { label: string; value: number; display?: string }[]; unit?: "number" | "currency" }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return <div><div className="mb-5 grid gap-3 sm:grid-cols-3"><Stat label="7 day revenue" value={unit === "currency" ? money(total) : String(total)} sub="Database orders" /><Stat label="Peak day" value={unit === "currency" ? money(max) : String(max)} sub="Highest in range" /><Stat label="Daily average" value={unit === "currency" ? money(total / Math.max(1, data.length)) : String(Math.round(total / Math.max(1, data.length)))} sub="7 day mean" /></div><div className="flex h-64 items-end gap-3 border-b border-black/20 pt-4">{data.map((item) => { const height = Math.max(8, Math.round((item.value / max) * 100)); return <div key={item.label} className="flex h-full flex-1 flex-col justify-end gap-2"><div className="text-center text-xs font-bold text-black/65">{item.display || item.value}</div><div className="rounded-t bg-black transition-all" style={{ height: `${height}%` }} /><div className="text-center text-xs font-bold text-black/50">{item.label}</div></div>; })}</div></div>;
}

function ProgressRows({ rows, total, mode = "share" }: { rows: { label: string; value: number; sub?: string }[]; total: number; mode?: "share" | "relative" }) {
  const max = mode === "relative" ? Math.max(1, ...rows.map((row) => row.value)) : Math.max(1, total);
  return <div className="grid gap-4">{rows.map((row) => { const pct = Math.round((row.value / max) * 100); return <div key={row.label}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span>{row.label}</span><b>{typeof row.value === "number" && row.value > 999 ? money(row.value) : row.value}</b></div><div className="h-3 rounded-full bg-black/10"><div className="h-3 rounded-full bg-[#d4af37]" style={{ width: `${Math.min(100, pct)}%` }} /></div><div className="mt-1 flex justify-between text-xs text-black/45"><span>{row.sub || (mode === "share" ? `${pct}% of total` : `${pct}% of highest`)}</span><span>Range {mode === "share" ? total : max}</span></div></div>; })}</div>;
}

function niceRange(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const ceiling = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return ceiling * magnitude;
}

function CategorySalesPanel({ rows }: { rows: { label: string; value: number; units: number }[] }) {
  if (!rows.length) return <p className="text-sm text-black/60">No category sales found in database.</p>;
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const totalSales = sorted.reduce((sum, row) => sum + row.value, 0);
  const totalUnits = sorted.reduce((sum, row) => sum + row.units, 0);
  const range = niceRange(Math.max(...sorted.map((row) => row.value)));
  const visible = sorted.slice(0, 12);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-[#eadfca] bg-white p-3"><p className="text-[11px] font-bold uppercase text-black/45">Sales</p><b className="display-font text-lg">{money(totalSales)}</b></div>
        <div className="rounded-md border border-[#eadfca] bg-white p-3"><p className="text-[11px] font-bold uppercase text-black/45">Units</p><b className="display-font text-lg">{totalUnits}</b></div>
        <div className="rounded-md border border-[#eadfca] bg-white p-3"><p className="text-[11px] font-bold uppercase text-black/45">Range</p><b className="display-font text-lg">{money(range)}</b></div>
      </div>
      <div className="grid gap-4">
        {visible.map((row, index) => {
          const pct = Math.round((row.value / range) * 100);
          const share = Math.round((row.value / Math.max(1, totalSales)) * 100);
          return (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-semibold">{index + 1}. {row.label}</span>
                <b>{money(row.value)}</b>
              </div>
              <div className="h-3 rounded-full bg-black/10">
                <div className="h-3 rounded-full bg-[#d4af37]" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <div className="mt-1 flex justify-between gap-3 text-xs text-black/45">
                <span>{row.units} units · {share}% share</span>
                <span>{money(row.value)} / {money(range)}</span>
              </div>
            </div>
          );
        })}
      </div>
      {sorted.length > visible.length && <p className="text-xs font-semibold text-black/45">Showing top {visible.length} of {sorted.length} database categories.</p>}
    </div>
  );
}

function DonutMetric({ rows }: { rows: { label: string; value: number }[] }) {
  const total = Math.max(1, rows.reduce((sum, row) => sum + row.value, 0));
  let current = 0;
  const colors = ["#111111", "#d4af37", "#ef4444", "#777777"];
  const stops = rows.map((row, index) => {
    const start = current;
    current += (row.value / total) * 100;
    return `${colors[index % colors.length]} ${start}% ${current}%`;
  }).join(", ");
  return <div className="grid gap-5 md:grid-cols-[160px_1fr] md:items-center"><div className="grid aspect-square place-items-center rounded-full" style={{ background: `conic-gradient(${stops || "#e5e5e5 0% 100%"})` }}><div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center"><b className="display-font text-2xl">{total}</b><span className="text-xs text-black/50">SKUs</span></div></div><div className="grid gap-3">{rows.map((row, index) => <div key={row.label} className="flex items-center justify-between gap-3 border-b pb-2"><span className="flex items-center gap-2 text-sm"><i className="h-3 w-3 rounded-full" style={{ background: colors[index % colors.length] }} />{row.label}</span><b>{row.value}</b></div>)}</div></div>;
}

function DashboardSplit({ stats }: { stats: [string, number][] }) {
  return <div className="grid grid-cols-2 gap-3">{stats.map(([label, value]) => <div key={label} className="rounded-md border border-[#eadfca] bg-white p-4"><p className="text-xs font-bold uppercase text-black/45">{label}</p><h3 className="display-font mt-2 text-2xl font-black">{value}</h3></div>)}</div>;
}

const adminPageSize = 10;

function usePagedItems<T>(items: T[], pageSize = adminPageSize) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  return {
    page: safePage,
    totalPages,
    total: items.length,
    items: items.slice(start, start + pageSize),
    hasPreviousPage: safePage > 1,
    hasNextPage: safePage < totalPages,
    setPage,
    resetPage: () => setPage(1),
  };
}

function PaginationControls({ page, totalPages, total, onPageChange }: { page: number; totalPages: number; total: number; onPageChange: (page: number) => void }) {
  return <div className="mt-4 flex flex-col gap-3 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="font-bold text-black/60">Showing page {page} of {totalPages} ({total} records)</span><div className="grid grid-cols-2 gap-2 sm:flex"><Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Previous</Button><Button variant="gold" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button></div></div>;
}

function CustomerActions({ customer, onStatus, onDelete }: { customer: AdminCustomer; onStatus: (customer: AdminCustomer, status: AdminCustomer["status"]) => void; onDelete: (customer: AdminCustomer) => void }) {
  const actionClass = "min-h-9 rounded-md border border-black/20 px-2 py-1 text-xs font-bold transition hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:border-black/10 disabled:text-black/35 disabled:hover:bg-transparent disabled:hover:text-black/35";
  return <div className="grid min-w-[176px] grid-cols-2 gap-2"><button className={actionClass} disabled={customer.status === "ACTIVE"} onClick={() => onStatus(customer, "ACTIVE")}>Activate</button><button className={actionClass} disabled={customer.status === "INACTIVE"} onClick={() => onStatus(customer, "INACTIVE")}>Deactivate</button><button className={actionClass} disabled={customer.status === "BLOCKED"} onClick={() => onStatus(customer, "BLOCKED")}>Block</button><button className="min-h-9 rounded-md border border-red-200 px-2 py-1 text-xs font-bold text-red-700 transition hover:bg-red-600 hover:text-white" onClick={() => onDelete(customer)}>Delete</button></div>;
}

type BrandRow = { id: string; name: string; slug: string; logo?: string };

type ProductForm = {
  name: string;
  sku: string;
  brandId: string;
  categoryId: string;
  unit: string;
  mrp: string;
  price: string;
  gst: string;
  stock: string;
  lowStock: string;
  featured: boolean;
  active: boolean;
};

type VariantDraft = {
  id?: string;
  sku: string;
  unit: string;
  mrp: string;
  price: string;
  stock: string;
  lowStock: string;
  active: boolean;
  isDefault: boolean;
};

const defaultUnitOptions = ["100 g", "250 g", "500 g", "1 kg", "5 kg", "250 ml", "500 ml", "1 L", "1 pc", "1 pack"];

function unitOptionsForCategory(category?: Pick<Category, "name" | "slug"> | null) {
  const key = `${category?.slug || ""} ${category?.name || ""}`.toLowerCase();
  if (key.includes("fruit") || key.includes("vegetable") || key.includes("atta") || key.includes("rice") || key.includes("dal") || key.includes("masala")) {
    return ["100 g", "250 g", "500 g", "1 kg", "2 kg", "5 kg", "10 kg"];
  }
  if (key.includes("dairy") || key.includes("bread") || key.includes("egg")) {
    return ["200 ml", "250 ml", "500 ml", "1 L", "100 g", "200 g", "500 g", "1 kg", "1 pc", "6 pcs", "12 pcs"];
  }
  if (key.includes("oil")) return ["100 ml", "250 ml", "500 ml", "1 L", "2 L", "5 L"];
  if (key.includes("snack") || key.includes("beverage")) return ["50 g", "100 g", "200 g", "500 g", "250 ml", "500 ml", "1 L", "1 pack"];
  if (key.includes("personal")) return ["50 ml", "100 ml", "250 ml", "500 ml", "75 g", "125 g", "1 pc"];
  if (key.includes("packaged")) return ["1 pack", "2 pack", "100 g", "250 g", "500 g", "1 kg"];
  return defaultUnitOptions;
}

function mergeUnitOptions(options: string[], current?: string) {
  const unit = current?.trim();
  return unit && !options.includes(unit) ? [unit, ...options] : options;
}

function variantsFromProduct(product: Product): VariantDraft[] {
  const source = product.variants?.length ? product.variants : [{ id: undefined, sku: product.sku, unit: product.unit, mrp: product.mrp, price: product.price, stock: product.stock, lowStockThreshold: product.lowStock, active: product.active, isDefault: true }];
  return source.map((variant, index) => ({
    id: variant.id,
    sku: variant.sku || `${product.sku}-${index + 1}`,
    unit: variant.unit,
    mrp: String(variant.mrp),
    price: String(variant.price),
    stock: String(variant.stock ?? product.stock),
    lowStock: String(variant.lowStockThreshold ?? variant.lowStock ?? product.lowStock),
    active: variant.active !== false,
    isDefault: Boolean(variant.isDefault) || index === 0,
  }));
}

function blankVariant(productSku: string, index: number, unitOptions = defaultUnitOptions): VariantDraft {
  return { sku: `${productSku || "SKU"}-${index + 1}`, unit: unitOptions[index % unitOptions.length] || "1 pc", mrp: "0", price: "0", stock: "0", lowStock: "10", active: true, isDefault: false };
}

function formFromProduct(product: Product, mode?: "new" | "edit", sku?: string): ProductForm {
  return {
    name: mode === "new" ? "New Eagle Mart Product" : product.name,
    sku: sku || product.sku,
    brandId: product.brandId || "",
    categoryId: product.categoryId || "",
    unit: product.unit,
    mrp: String(product.mrp),
    price: String(product.price),
    gst: String(product.gst),
    stock: String(product.stock),
    lowStock: String(product.lowStock),
    featured: Boolean(product.featured),
    active: product.active !== false,
  };
}

function ProductManager({ mode, id }: { mode?: "new" | "edit"; id?: string }) {
  const { admin, products, addProduct, updateProduct, deleteProduct, replaceProducts, toast } = useStore();
  const router = useRouter();
  const canEditCatalog = canManageCatalog(admin?.role?.name);
  const [saving, setSaving] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const hydratedEditProductId = useRef("");
  const [adminCategories, setAdminCategories] = useState<Category[]>([]);
  const [adminBrands, setAdminBrands] = useState<BrandRow[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [productPagination, setProductPagination] = useState({ page: 1, totalPages: 1, total: 0, hasNextPage: false, hasPreviousPage: false });
  const [bulkSummary, setBulkSummary] = useState<Awaited<ReturnType<typeof bulkImportAdminProducts>> | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkMode, setBulkMode] = useState<BulkImportMode>("create_update");
  const [bulkPreviewSearch, setBulkPreviewSearch] = useState("");
  const pageSize = 25;
  useEffect(() => {
    if (mode) return;
    const timer = window.setTimeout(() => {
      fetchAdminProducts({ page: productPage, limit: pageSize, search: productSearch })
        .then((result) => {
          replaceProducts(result.products);
          if (result.pagination) setProductPagination(result.pagination);
        })
        .catch((error) => toast(error instanceof Error ? error.message : "Unable to load products. Database connection is unavailable.", "error"));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [mode, productPage, productSearch, replaceProducts, toast]);
  useEffect(() => {
    fetchAdminCategories().then(setAdminCategories).catch((error) => toast(error instanceof Error ? error.message : "Unable to load categories. Database connection is unavailable.", "error"));
    fetchAdminBrands().then(setAdminBrands).catch((error) => toast(error instanceof Error ? error.message : "Unable to load brands. Database connection is unavailable.", "error"));
  }, [toast]);
  useEffect(() => {
    if (mode !== "edit" || !id) {
      hydratedEditProductId.current = "";
      return;
    }
    hydratedEditProductId.current = "";
    let cancelled = false;
    setLoadingProduct(true);
    fetchAdminProduct(id)
      .then((product) => {
        if (cancelled) return;
        setEditProduct(product);
      })
      .catch((error) => {
        if (!cancelled) toast(error instanceof Error ? error.message : "Unable to load this product.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoadingProduct(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, mode, toast]);
  const fetchedEditProduct = editProduct?.id === id ? editProduct : null;
  const storedEditProduct = products.find((p) => p.id === id);
  const existing = mode === "edit" ? fetchedEditProduct || storedEditProduct || seedProducts[0] : seedProducts[0];
  const resolveCategoryId = (product?: Product) => product?.categoryId || adminCategories.find((category) => category.name === product?.category || category.slug === product?.categorySlug)?.id || adminCategories[0]?.id || "";
  const resolveBrandId = (product?: Product) => product?.brandId || adminBrands.find((brand) => brand.name === product?.brand || brand.slug === product?.brandSlug)?.id || adminBrands[0]?.id || "";
  const initialSku = useMemo(() => mode === "new" ? `EC-NEW-${uid("sku").split("-").pop()}` : existing.sku, [existing.sku, mode]);
  const [draft, setDraft] = useState<ProductForm>(() => formFromProduct(existing, mode, initialSku));
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>(() => mode === "new" ? [blankVariant(initialSku, 0)] : variantsFromProduct(existing));
  const selectedCategory = adminCategories.find((category) => category.id === draft.categoryId);
  const categoryUnitOptions = unitOptionsForCategory(selectedCategory);
  useEffect(() => {
    if (!mode) return;
    const nextCategoryId = resolveCategoryId(existing);
    const nextBrandId = resolveBrandId(existing);
    setDraft((current) => {
      const brandId = current.brandId || nextBrandId;
      const categoryId = current.categoryId || nextCategoryId;
      return brandId === current.brandId && categoryId === current.categoryId ? current : { ...current, brandId, categoryId };
    });
    if (mode === "new" && nextCategoryId) {
      const units = unitOptionsForCategory(adminCategories.find((category) => category.id === nextCategoryId));
      setVariantDrafts((items) => items.map((item, index) => ({ ...item, unit: units[index % units.length] || item.unit })));
    }
  }, [adminBrands, adminCategories, existing, mode]);
  useEffect(() => {
    if (mode !== "edit" || !fetchedEditProduct || hydratedEditProductId.current === fetchedEditProduct.id) return;
    hydratedEditProductId.current = fetchedEditProduct.id;
    setDraft({
      ...formFromProduct(fetchedEditProduct, mode, fetchedEditProduct.sku),
      brandId: fetchedEditProduct.brandId || resolveBrandId(fetchedEditProduct),
      categoryId: fetchedEditProduct.categoryId || resolveCategoryId(fetchedEditProduct),
    });
    setVariantDrafts(variantsFromProduct(fetchedEditProduct));
  }, [adminBrands, adminCategories, fetchedEditProduct, mode]);
  const numberValue = (value: string) => Number(value.trim());
  const refreshProducts = () => fetchAdminProducts({ page: productPage, limit: pageSize, search: productSearch }).then((result) => {
    replaceProducts(result.products);
    if (result.pagination) setProductPagination(result.pagination);
  });
  const downloadTemplate = async () => {
    try {
      const csv = await downloadProductBulkTemplate();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "eagle-mart-product-template.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not download template.", "error");
    }
  };
  const downloadXlsxTemplate = async () => {
    try {
      const blob = await downloadProductBulkTemplateXlsx();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "eagle-mart-product-template.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not download XLSX template.", "error");
    }
  };
  const previewBulkFile = async (file?: File | null) => {
    if (!file) return;
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      toast("Upload a CSV or XLSX product file.", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("Bulk file must be 5 MB or smaller.", "error");
      return;
    }
    setBulkFile(file);
    setBulkLoading(true);
    setBulkSummary(null);
    try {
      const summary = /\.csv$/i.test(file.name) ? await bulkImportAdminProducts(await file.text(), bulkMode, true) : await bulkImportAdminProductFile(file, bulkMode, true);
      setBulkSummary(summary);
      toast(`Preview ready: ${summary.validRows} usable rows, ${summary.invalidRows} invalid rows.`, summary.invalidRows ? "error" : "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Bulk preview failed.", "error");
    } finally {
      setBulkLoading(false);
    }
  };
  const confirmBulkImport = async () => {
    if (!bulkFile || bulkLoading) return;
    setBulkLoading(true);
    try {
      const summary = /\.csv$/i.test(bulkFile.name) ? await bulkImportAdminProducts(await bulkFile.text(), bulkMode, false) : await bulkImportAdminProductFile(bulkFile, bulkMode, false);
      setBulkSummary(summary);
      await refreshProducts();
      toast(`Imported ${summary.created} new and updated ${summary.updated} products.`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Bulk import failed.", "error");
    } finally {
      setBulkLoading(false);
    }
  };
  const resetBulkImport = () => {
    setBulkFile(null);
    setBulkSummary(null);
    setBulkPreviewSearch("");
  };
  const downloadFailedRows = () => {
    if (!bulkSummary?.failedRowsCsv) return;
    const blob = new Blob([bulkSummary.failedRowsCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "eagle-mart-failed-product-rows.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  const save = async () => {
    if (saving) return;
    const brand = adminBrands.find((item) => item.id === draft.brandId);
    const category = adminCategories.find((item) => item.id === draft.categoryId);
    const gst = numberValue(draft.gst);
    const parsedVariants = variantDrafts.map((variant, index) => ({
      ...variant,
      mrpValue: numberValue(variant.mrp),
      priceValue: numberValue(variant.price),
      stockValue: Math.trunc(numberValue(variant.stock)),
      lowStockValue: Math.trunc(numberValue(variant.lowStock)),
      isDefault: variant.isDefault || index === 0,
    }));
    if (!draft.name.trim()) return toast("Product name is required.", "error");
    if (!draft.sku.trim()) return toast("Product SKU is required.", "error");
    if (!brand) return toast("Choose an existing brand.", "error");
    if (!category) return toast("Choose an existing category.", "error");
    if (!parsedVariants.length) return toast("Add at least one product variant.", "error");
    if (parsedVariants.some((variant) => !variant.unit.trim())) return toast("Every variant needs a unit label.", "error");
    if (!Number.isFinite(gst) || parsedVariants.some((variant) => ![variant.mrpValue, variant.priceValue, variant.stockValue, variant.lowStockValue].every(Number.isFinite))) return toast("Enter valid numeric values.", "error");
    if (parsedVariants.some((variant) => variant.mrpValue <= 0 || variant.priceValue <= 0 || variant.stockValue < 0 || variant.lowStockValue < 0)) return toast("Price and stock values must be valid.", "error");
    if (parsedVariants.some((variant) => variant.priceValue > variant.mrpValue)) return toast("Selling price cannot exceed MRP.", "error");
    const variantSkus = parsedVariants.map((variant, index) => (variant.sku.trim() || `${draft.sku.trim()}-${index + 1}`).toLowerCase());
    if (new Set(variantSkus).size !== variantSkus.length) return toast("Every variant SKU must be unique.", "error");
    setSaving(true);
    const productId = mode === "new" ? uid("prd") : existing.id;
    const defaultVariant = parsedVariants.find((variant) => variant.isDefault) || parsedVariants[0];
    const variants: ProductVariant[] = parsedVariants.map((variant, index) => ({
      id: variant.id,
      sku: variant.sku.trim() || `${draft.sku.trim()}-${index + 1}`,
      label: variant.unit.trim(),
      unit: variant.unit.trim(),
      mrp: variant.mrpValue,
      price: variant.priceValue,
      stock: variant.stockValue,
      lowStock: variant.lowStockValue,
      lowStockThreshold: variant.lowStockValue,
      active: variant.active,
      isDefault: variant === defaultVariant,
    })).sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)));
    const selectedDefault = variants.find((variant) => variant.isDefault) || variants[0];
    const payload: Product = {
      ...(mode === "new" ? existing : existing),
      id: productId,
      name: draft.name.trim(),
      slug: mode === "new" ? productSlug(draft.name, productId) : existing.slug,
      sku: draft.sku.trim(),
      brandId: brand.id,
      brand: brand.name,
      brandSlug: brand.slug,
      categoryId: category.id,
      category: category.name,
      categorySlug: category.slug,
      unit: selectedDefault.unit,
      mrp: selectedDefault.mrp,
      price: selectedDefault.price,
      gst,
      stock: variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0),
      lowStock: selectedDefault.lowStockThreshold ?? selectedDefault.lowStock ?? 10,
      variants,
      featured: draft.featured,
      active: draft.active,
      description: existing.description || draft.name.trim(),
      image: existing.image,
      tags: existing.tags?.length ? existing.tags : ["Admin"],
    };
    try {
      const saved = mode === "new" ? await createAdminProduct(payload) : await updateAdminProduct(payload);
      mode === "new" ? addProduct(saved) : updateProduct(saved);
      toast("Product saved successfully", "success");
      router.push("/admin/products");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save product.", "error");
    } finally {
      setSaving(false);
    }
  };
  const remove = async (product: Product) => {
    try {
      await deleteAdminProduct(product.id);
      deleteProduct(product.id);
      toast("Product deleted in backend", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not delete product.", "error");
    }
  };
  const toggleActive = async (product: Product) => {
    const next = { ...product, active: product.active === false };
    try {
      updateProduct(await updateAdminProduct(next));
      toast("Product status saved to backend", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update product status.", "error");
    }
  };
  const updateVariantDraft = (index: number, patch: Partial<VariantDraft>) => {
    setVariantDrafts((items) => items.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, ...patch };
      return patch.isDefault ? next : next;
    }).map((item, itemIndex) => patch.isDefault && itemIndex !== index ? { ...item, isDefault: false } : item));
  };
  const changeCategory = (categoryId: string) => {
    const units = unitOptionsForCategory(adminCategories.find((category) => category.id === categoryId));
    setDraft((current) => ({ ...current, categoryId }));
    setVariantDrafts((items) => items.map((item, index) => ({ ...item, unit: units.includes(item.unit) ? item.unit : units[index % units.length] || item.unit })));
  };
  const addVariantDraft = () => setVariantDrafts((items) => [...items, blankVariant(draft.sku.trim(), items.length, categoryUnitOptions)]);
  const removeVariantDraft = (index: number) => {
    setVariantDrafts((items) => {
      if (items.length <= 1) {
        toast("At least one variant is required.", "error");
        return items;
      }
      const next = items.filter((_, itemIndex) => itemIndex !== index);
      return next.some((item) => item.isDefault) ? next : next.map((item, itemIndex) => ({ ...item, isDefault: itemIndex === 0 }));
    });
  };
  const filteredBulkRows = (bulkSummary?.rows || []).filter((row) => {
    const needle = bulkPreviewSearch.trim().toLowerCase();
    if (!needle) return true;
    return [row.row, row.status, row.action, row.data?.name, row.data?.sku, row.data?.category, row.data?.brand].some((value) => String(value || "").toLowerCase().includes(needle));
  }).slice(0, 25);
  if (mode === "edit" && !fetchedEditProduct && !storedEditProduct) return <AdminShell section="products"><Panel title="Edit Product"><p className="rounded-md border border-[#eadfca] bg-[#faf7ef] p-3 text-sm font-bold text-black/60">Loading selected product...</p></Panel></AdminShell>;
  if (mode) return <AdminShell section="products"><Panel title={mode === "new" ? "Add Product" : "Edit Product"}><div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-bold">Name<input aria-label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label><label className="text-sm font-bold">Sku<input aria-label="Sku" value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label><label className="text-sm font-bold">Brand<select aria-label="Brand" value={draft.brandId} onChange={(e) => setDraft({ ...draft, brandId: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2"><option value="">Choose brand</option>{adminBrands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><label className="text-sm font-bold">Category<select aria-label="Category" value={draft.categoryId} onChange={(e) => changeCategory(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2"><option value="">Choose category</option>{adminCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="text-sm font-bold">GST %<input aria-label="GST" inputMode="decimal" value={draft.gst} onChange={(e) => setDraft({ ...draft, gst: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.featured} onChange={(e) => setDraft({ ...draft, featured: e.target.checked })} /> Featured</label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active</label></div><div className="mt-6 rounded-md border border-[#eadfca] bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eadfca] p-4"><div><h3 className="display-font font-bold">Variants</h3><p className="mt-1 text-xs font-bold text-black/50">Unit labels follow the selected category.</p></div><Button variant="outline" onClick={addVariantDraft}><Plus size={16} /> Add variant</Button></div><div className="grid gap-3 p-4">{variantDrafts.map((variant, index) => <div key={variant.id || index} className="grid gap-3 rounded-md border border-[#eadfca] bg-[#faf7ef] p-3 md:grid-cols-8"><label className="text-xs font-bold md:col-span-2">Unit label<select aria-label={`Variant ${index + 1} unit`} value={variant.unit} onChange={(e) => updateVariantDraft(index, { unit: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-2">{mergeUnitOptions(categoryUnitOptions, variant.unit).map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label><label className="text-xs font-bold md:col-span-2">SKU<input aria-label={`Variant ${index + 1} SKU`} value={variant.sku} onChange={(e) => updateVariantDraft(index, { sku: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-2" /></label><label className="text-xs font-bold">MRP<input aria-label={`Variant ${index + 1} MRP`} inputMode="decimal" value={variant.mrp} onChange={(e) => updateVariantDraft(index, { mrp: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-2" /></label><label className="text-xs font-bold">Price<input aria-label={`Variant ${index + 1} price`} inputMode="decimal" value={variant.price} onChange={(e) => updateVariantDraft(index, { price: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-2" /></label><label className="text-xs font-bold">Stock<input aria-label={`Variant ${index + 1} stock`} inputMode="numeric" value={variant.stock} onChange={(e) => updateVariantDraft(index, { stock: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-2" /></label><label className="text-xs font-bold">Low<input aria-label={`Variant ${index + 1} low stock`} inputMode="numeric" value={variant.lowStock} onChange={(e) => updateVariantDraft(index, { lowStock: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-2" /></label><div className="flex flex-wrap items-center gap-3 md:col-span-8"><label className="flex items-center gap-2 text-sm font-bold"><input type="radio" checked={variant.isDefault} onChange={() => updateVariantDraft(index, { isDefault: true })} /> Default</label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={variant.active} onChange={(e) => updateVariantDraft(index, { active: e.target.checked })} /> Active</label><Button variant="ghost" onClick={() => removeVariantDraft(index)}>Remove</Button></div></div>)}</div></div><div className="mt-5 flex gap-2"><Button variant="gold" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Product"}</Button><Link href="/admin/products"><Button variant="outline">Back</Button></Link></div></Panel></AdminShell>;
  return <AdminShell section="products"><Panel title="Product Management"><div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]"><input className="min-w-[220px] rounded-md border px-3 py-2" placeholder="Search/filter products" value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }} /><div className="flex flex-wrap gap-2">{canEditCatalog && <Button variant="outline" onClick={downloadTemplate}>CSV template</Button>}{canEditCatalog && <Button variant="outline" onClick={downloadXlsxTemplate}>XLSX template</Button>}{canEditCatalog && <Link href="/admin/products/new"><Button variant="gold"><Plus size={16} /> Add Product</Button></Link>}</div></div>{canEditCatalog && <section className="mb-4 rounded-md border border-[#eadfca] bg-[#faf7ef] p-4"><div className="grid gap-3 lg:grid-cols-[1fr_220px_auto_auto] lg:items-end"><label className="grid cursor-pointer gap-2 rounded-md border-2 border-dashed border-[#d4af37] bg-white p-4 text-sm font-bold"><span>{bulkFile ? bulkFile.name : "Drop or choose CSV/XLSX product file"}</span><span className="text-xs font-normal text-black/55">Accepted: CSV, XLSX, XLS up to 5 MB and 1000 rows.</span><input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="sr-only" disabled={bulkLoading} onChange={(event) => previewBulkFile(event.target.files?.[0])} /></label><label className="text-sm font-bold">Import mode<select value={bulkMode} onChange={(event) => setBulkMode(event.target.value as BulkImportMode)} className="mt-1 w-full rounded-md border px-3 py-3"><option value="create_update">Create and update existing</option><option value="create_only">Create new products only</option><option value="update_only">Update existing products only</option></select></label><Button variant="gold" disabled={!bulkFile || bulkLoading || Boolean(bulkSummary?.invalidRows)} onClick={confirmBulkImport}>{bulkLoading ? "Working..." : "Confirm import"}</Button><Button variant="outline" onClick={resetBulkImport}>Cancel/reset</Button></div>{bulkSummary && <div className="mt-4 grid gap-3"><div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-7">{[["Total rows", bulkSummary.totalRows], ["Valid rows", bulkSummary.validRows], ["Invalid rows", bulkSummary.invalidRows], ["New products", bulkSummary.newProducts ?? 0], ["To update", bulkSummary.productsToUpdate ?? 0], ["Created", bulkSummary.created], ["Updated", bulkSummary.updated]].map(([label, value]) => <div key={String(label)} className="rounded-md border border-[#eadfca] bg-white p-3"><p className="text-xs font-black uppercase text-black/50">{String(label)}</p><b className="text-lg">{String(value)}</b></div>)}</div><div className="flex flex-wrap items-center gap-2"><input className="rounded-md border px-3 py-2 text-sm" placeholder="Search preview rows" value={bulkPreviewSearch} onChange={(event) => setBulkPreviewSearch(event.target.value)} />{bulkSummary.failedRowsCsv && <Button variant="outline" onClick={downloadFailedRows}>Download failed rows</Button>}</div>{filteredBulkRows.length > 0 && <DataTable headers={["Row", "Status", "Action", "SKU", "Product", "Messages"]} minWidth="min-w-[760px]">{filteredBulkRows.map((row) => <tr key={row.row} className="border-b bg-white"><td className="p-3 font-bold">{row.row}</td><td><StatusBadge value={row.status} /></td><td className="capitalize">{row.action}</td><td>{row.data?.sku || "Auto"}</td><td>{row.data?.name}</td><td className="max-w-md text-sm text-black/65">{[...(row.errors || []).map((item) => item.message), ...(row.warnings || []).map((item) => item.message)].join("; ") || "Ready"}</td></tr>)}</DataTable>}{bulkSummary.errors.length > 0 && <div className="grid gap-1 text-sm text-red-700">{bulkSummary.errors.slice(0, 12).map((item) => <p key={item.row}>Row {item.row}: {item.errors.join(", ")}</p>)}</div>}</div>}</section>}<DataTable headers={["Image", "Product Name", "SKU", "Category", "Brand", "MRP", "Selling Price", "Stock", "Status", "Featured", "Actions"]} minWidth="min-w-[1180px]">{products.map((p) => <tr key={p.id} className="border-b odd:bg-white even:bg-[#faf7ef]"><td className="p-3 align-middle"><img src={p.image} alt={p.name} className="h-12 w-12 rounded-md border border-[#eadfca] object-cover" /></td><td className="p-3 align-middle font-bold">{p.name}</td><td className="p-3 align-middle">{p.sku}</td><td className="p-3 align-middle">{p.category}</td><td className="p-3 align-middle">{p.brand}</td><td className="p-3 align-middle">{money(p.mrp)}</td><td className="p-3 align-middle">{money(p.price)}</td><td className="p-3 align-middle">{p.stock}</td><td className="p-3 align-middle"><StatusBadge value={p.active === false ? "Inactive" : p.stock <= 0 ? "Out of stock" : "Active"} /></td><td className="p-3 align-middle">{p.featured ? "Yes" : "No"}</td><td className="p-3 align-middle"><div data-testid="product-actions" className="flex items-center gap-2 whitespace-nowrap"><Link className="rounded border px-2 py-1 text-xs font-bold" href={`/product/${p.slug}`}>View</Link>{canEditCatalog && <Link className="rounded border px-2 py-1 text-xs font-bold" href={`/admin/products/${p.id}/edit`}>Edit</Link>}{canEditCatalog && <button className="rounded border px-2 py-1 text-xs font-bold" onClick={() => toggleActive(p)}>{p.active === false ? "Activate" : "Disable"}</button>}<Link className="rounded border px-2 py-1 text-xs font-bold" href={`/admin/inventory/${p.id}`}>Stock</Link>{canEditCatalog && <button className="rounded px-2 py-1 text-xs font-bold text-red-700" onClick={() => remove(p)}>Delete</button>}</div></td></tr>)}</DataTable><PaginationControls page={productPagination.page} totalPages={productPagination.totalPages} total={productPagination.total} onPageChange={setProductPage} /></Panel></AdminShell>;
}

function Inventory({ productId }: { productId?: string }) {
  const { products, adjustStock } = useStore();
  const [remoteInventory, setRemoteInventory] = useState<{ id: string; productId: string; variantId?: string; stock: number; lowStockThreshold?: number; product: Product; status?: string }[]>([]);
  const { toast } = useStore();
  useEffect(() => { fetchAdminInventory().then(setRemoteInventory).catch((error) => toast(error instanceof Error ? error.message : "Unable to load inventory. Database connection is unavailable.", "error")); }, [toast]);
  const rows = remoteInventory.filter((item) => !productId || item.productId === productId).map((item) => ({ ...item.product, inventoryId: item.id, inventoryProductId: item.productId, variantId: item.variantId, stock: item.stock, lowStock: item.lowStockThreshold ?? item.product.lowStock, statusText: item.status }));
  const pagedRows = usePagedItems(rows);
  const adjust = (row: Product & { inventoryId: string }, quantity: number) => {
    adjustAdminInventory(row.inventoryId, quantity).then((updated) => {
      adjustStock(row.id, updated.stock);
      setRemoteInventory((items) => items.map((item) => item.id === updated.id ? { ...item, stock: updated.stock, product: updated.product } : item));
      toast("Inventory updated", "success");
    }).catch((error) => toast(error instanceof Error ? error.message : "Could not adjust inventory.", "error"));
  };
  const selectedProduct = rows[0];
  return <AdminShell section="inventory"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label={productId ? "Product SKUs" : "Total SKUs"} value={String(rows.length)} sub={productId ? selectedProduct?.name || "Selected product" : "Tracked"} /><Stat label="Low Stock" value={String(rows.filter((p) => p.stock > 0 && p.stock <= p.lowStock).length)} sub="Needs restock" /><Stat label="Out of Stock" value={String(rows.filter((p) => p.stock <= 0).length)} sub="Critical" /><Stat label="Recently Restocked" value={String(rows.filter((p) => p.stock > p.lowStock * 2).length)} sub="Healthy" /></div><div className="mt-6"><Panel title={productId ? `Inventory - ${selectedProduct?.name || "Selected Product"}` : "Inventory"}>{productId && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#eadfca] bg-white p-3"><p className="text-sm text-black/60">{selectedProduct ? `${selectedProduct.sku} | ${selectedProduct.category} | ${selectedProduct.brand}` : "Loading product inventory from database..."}</p><Link href="/admin/inventory"><Button variant="outline">View all inventory</Button></Link></div>}<DataTable headers={["Product", "Current stock", "Low threshold", "Status", "Adjust"]}>{pagedRows.items.map((p) => <tr key={p.inventoryId} className="border-b odd:bg-white even:bg-[#faf7ef]"><td className="p-3 font-bold">{p.name}{p.variantId && <div className="text-xs font-normal text-black/50">Variant {p.variantId.slice(-8).toUpperCase()}</div>}</td><td>{p.stock}</td><td>{p.lowStock}</td><td><StatusBadge value={p.statusText || (p.stock <= 0 ? "Out of stock" : p.stock <= p.lowStock ? "Low stock" : "In stock")} /></td><td><div className="flex gap-2"><Button variant="outline" onClick={() => adjust(p, -5)}>-5</Button><Button variant="gold" onClick={() => adjust(p, 10)}>+10</Button></div></td></tr>)}</DataTable>{!rows.length && <p className="rounded-md bg-white p-4 text-sm text-black/60">No inventory row found for this product in the database.</p>}<PaginationControls page={pagedRows.page} totalPages={pagedRows.totalPages} total={pagedRows.total} onPageChange={pagedRows.setPage} /></Panel></div></AdminShell>;
}

function OrderTable({ compact = false, ordersOverride }: { compact?: boolean; ordersOverride?: Order[] }) {
  const { admin, orders, products, updateOrderStatus } = useStore();
  const { toast } = useStore();
  const [remoteOrders, setRemoteOrders] = useState<Order[]>([]);
  useEffect(() => { fetchAdminOrders().then(setRemoteOrders).catch((error) => toast(error instanceof Error ? error.message : "Unable to load orders. Database connection is unavailable.", "error")); }, [toast]);
  const role = admin?.role?.name;
  const statuses: OrderStatus[] = role === "DELIVERY_STAFF" ? ["Confirmed", "Packed", "Out for Delivery", "Delivered"] : ["Confirmed", "Packed", "Out for Delivery", "Delivered", "Cancelled"];
  const finalStatuses: OrderStatus[] = ["Delivered", "Cancelled", "Return Requested", "Refunded"];
  const list = ordersOverride ?? (remoteOrders.length ? remoteOrders : orders);
  const toApiStatus = (status: string) => status.toUpperCase().replaceAll(" ", "_");
  const changeStatus = (order: Order, status: OrderStatus) => {
    if (status === order.status) return;
    if (role === "DELIVERY_STAFF" && finalStatuses.includes(order.status)) {
      toast("This order is closed and cannot be updated by delivery staff.", "error");
      return;
    }
    const updateStatus = role === "DELIVERY_STAFF" ? updateDeliveryOrderStatus : updateAdminOrderStatus;
    updateStatus(order.orderNumber, toApiStatus(status)).then((updated) => {
      setRemoteOrders((items) => items.map((item) => item.orderNumber === updated.orderNumber ? updated : item));
      updateOrderStatus(updated.orderNumber, updated.status);
      toast("Order status saved", "success");
    }).catch((error) => toast(error instanceof Error ? error.message : "Could not update order status.", "error"));
  };
  const pagedList = usePagedItems(list);
  if (compact) return <DataTable headers={["Order", "Customer", "Amount", "Status"]}>{list.map((o) => <tr key={o.orderNumber} className="border-b odd:bg-white even:bg-[#faf7ef]"><td className="p-3 font-bold"><Link className="underline decoration-[#d4af37] underline-offset-4" href={`/admin/orders/${o.orderNumber}`}>{o.orderNumber}</Link></td><td className="p-3">{o.customerName}</td><td className="p-3">{money(o.grandTotal || calc(o.items, products))}</td><td className="p-3"><StatusBadge value={o.status} /></td></tr>)}</DataTable>;
  return <><DataTable headers={["Order ID", "Customer", "Amount", "Payment Status", "Order Status", "Assigned Staff", "Action"]} minWidth="min-w-[960px]">{pagedList.items.map((o) => { const closedForDelivery = role === "DELIVERY_STAFF" && finalStatuses.includes(o.status); const statusChoices = statuses.includes(o.status) ? statuses : [o.status, ...statuses]; return <tr key={o.orderNumber} className="border-b odd:bg-white even:bg-[#faf7ef]"><td className="p-3 align-middle font-bold"><Link className="underline decoration-[#d4af37] underline-offset-4" href={`/admin/orders/${o.orderNumber}`}>{o.orderNumber}</Link></td><td className="p-3 align-middle">{o.customerName}</td><td className="p-3 align-middle">{money(o.grandTotal || calc(o.items, products))}</td><td className="p-3 align-middle"><StatusBadge value={o.paymentStatus} /></td><td className="p-3 align-middle"><StatusBadge value={o.status} /></td><td className="p-3 align-middle">{o.deliveryStaff || "Unassigned"}</td><td className="p-3 align-middle"><select aria-label={`Status for ${o.orderNumber}`} value={o.status} disabled={closedForDelivery} onChange={(e) => changeStatus(o, e.target.value as OrderStatus)} className="w-44 rounded-md border px-2 py-2 text-sm">{statusChoices.map((s) => <option key={s}>{s}</option>)}</select></td></tr>; })}</DataTable><PaginationControls page={pagedList.page} totalPages={pagedList.totalPages} total={pagedList.total} onPageChange={pagedList.setPage} /></>;
}

function Orders({ detail }: { detail?: string }) {
  const { admin, orders, products, updateOrderStatus, assignDeliveryStaff, toast } = useStore();
  const [remoteOrders, setRemoteOrders] = useState<Order[]>([]);
  const [remoteStaff, setRemoteStaff] = useState<{ id: string; name: string }[]>([]);
  const [orderQuery, setOrderQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [datePreset, setDatePreset] = useState("");
  const [exactDate, setExactDate] = useState("");
  useEffect(() => { fetchAdminOrders().then(setRemoteOrders).catch((error) => toast(error instanceof Error ? error.message : "Unable to load orders. Database connection is unavailable.", "error")); }, [toast]);
  useEffect(() => { fetchAdminDeliveryStaff().then(setRemoteStaff).catch((error) => toast(error instanceof Error ? error.message : "Unable to load delivery staff. Database connection is unavailable.", "error")); }, [toast]);
  const order = remoteOrders.find((o) => o.orderNumber === detail) || orders.find((o) => o.orderNumber === detail);
  const role = admin?.role?.name;
  const deliveryStaffStatusOptions: OrderStatus[] = ["Confirmed", "Packed", "Out for Delivery", "Delivered"];
  const managerStatusOptions: OrderStatus[] = ["Confirmed", "Packed", "Out for Delivery", "Delivered", "Cancelled"];
  const detailStatusOptions = role === "DELIVERY_STAFF" ? deliveryStaffStatusOptions : managerStatusOptions;
  const closedForDelivery = role === "DELIVERY_STAFF" && order ? (["Delivered", "Cancelled", "Return Requested", "Refunded"] as OrderStatus[]).includes(order.status) : false;
  const toApiStatus = (status: string) => status.toUpperCase().replaceAll(" ", "_");
  const staffRows = remoteStaff.length ? remoteStaff : deliveryStaff.map((name) => ({ id: name, name }));
  const replaceRemoteOrder = (updated: Order) => setRemoteOrders((items) => items.map((item) => item.orderNumber === updated.orderNumber ? updated : item));
  const changeDetailStatus = async (status: OrderStatus) => {
    if (!order) return;
    try {
      const updateStatus = role === "DELIVERY_STAFF" ? updateDeliveryOrderStatus : updateAdminOrderStatus;
      const updated = await updateStatus(order.orderNumber, toApiStatus(status));
      replaceRemoteOrder(updated);
      updateOrderStatus(updated.orderNumber, updated.status);
      toast("Order status saved to backend", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update order status", "error");
    }
  };
  const assignDetailStaff = async (staff: { id: string; name: string }) => {
    if (!order) return;
    assignDeliveryStaff(order.orderNumber, staff.name);
    try {
      const updated = await assignAdminDelivery(order.orderNumber, staff.id);
      replaceRemoteOrder(updated);
      toast(`${staff.name} assigned to backend`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not assign delivery staff", "error");
    }
  };
  if (order) return <AdminShell section="orders"><div className="grid gap-6 lg:grid-cols-[1fr_340px]"><Panel title={`Order ${order.orderNumber}`}><div className="grid gap-4 md:grid-cols-3"><Stat label="Amount" value={money(order.grandTotal || calc(order.items, products))} sub={order.paymentStatus} /><Stat label="Status" value={order.status} sub={order.deliverySlot} /><Stat label="Delivery staff" value={order.deliveryStaff || "Unassigned"} sub="Assigned" /></div><div className="mt-6 grid gap-4 md:grid-cols-2"><div className="rounded-md border border-[#eadfca] bg-white p-4"><h3 className="font-bold">Customer details</h3><p className="mt-2 text-sm">{order.customerName}</p><p className="text-sm text-black/55">{order.address.phone}</p></div><div className="rounded-md border border-[#eadfca] bg-white p-4"><h3 className="font-bold">Delivery address</h3><p className="mt-2 text-sm">{order.address.line}, {order.address.city} - {order.address.pincode}</p></div></div><div className="responsive-scroll mt-6 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-black text-white"><tr><th className="p-3">Product</th><th>Qty</th><th>Price</th></tr></thead><tbody>{order.items.map((item) => { const product = products.find((p) => p.id === item.productId); return <tr key={item.productId} className="border-b"><td className="p-3 font-bold">{product?.name || item.productId}</td><td>{item.qty}</td><td>{money((product?.price || 0) * item.qty)}</td></tr>; })}</tbody></table></div><div className="mt-5 flex flex-wrap gap-2">{detailStatusOptions.map((status) => <Button key={status} variant={order.status === status ? "gold" : "outline"} disabled={closedForDelivery || order.status === status} onClick={() => changeDetailStatus(status)}>{status}</Button>)}{role !== "DELIVERY_STAFF" && <Button variant="outline" onClick={() => toast("Refund action will be enabled in the next backend phase.", "info")}>Refund</Button>}<Link href={`/invoice/${order.orderNumber}`}><Button variant="gold">Print Invoice</Button></Link></div></Panel><Panel title="Delivery assignment"><div className="grid gap-2">{staffRows.map((s) => <Button key={s.id} variant={order.deliveryStaff === s.name ? "gold" : "outline"} disabled={role === "DELIVERY_STAFF" || closedForDelivery} onClick={() => assignDetailStaff(s)}>{s.name}</Button>)}</div><div className="mt-5 rounded-md bg-[#faf7ef] p-4"><h3 className="font-bold">Admin notes</h3><p className="mt-2 text-sm text-black/60">Notes API will be enabled in the next backend phase.</p></div></Panel></div></AdminShell>;
  const list = remoteOrders.length ? remoteOrders : orders;
  const startForPreset = (preset: string) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (preset === "today") return start;
    if (preset === "7d") {
      start.setDate(start.getDate() - 6);
      return start;
    }
    if (preset === "30d") {
      start.setDate(start.getDate() - 29);
      return start;
    }
    return null;
  };
  const filteredOrders = list.filter((orderRow) => {
    const query = orderQuery.trim().toLowerCase();
    const createdAt = new Date(orderRow.createdAt);
    const presetStart = startForPreset(datePreset);
    const exact = exactDate ? new Date(exactDate) : null;
    exact?.setHours(0, 0, 0, 0);
    const exactEnd = exact ? new Date(exact) : null;
    exactEnd?.setHours(23, 59, 59, 999);
    return (!query || orderRow.orderNumber.toLowerCase().includes(query) || orderRow.customerName.toLowerCase().includes(query) || orderRow.address.phone?.includes(query))
      && (!statusFilter || orderRow.status === statusFilter)
      && (!paymentMethodFilter || orderRow.paymentMethod === paymentMethodFilter)
      && (!paymentStatusFilter || orderRow.paymentStatus === paymentStatusFilter)
      && (!presetStart || createdAt >= presetStart)
      && (!exact || (createdAt >= exact && exactEnd != null && createdAt <= exactEnd));
  });
  const resetFilters = () => {
    setOrderQuery("");
    setStatusFilter("");
    setPaymentMethodFilter("");
    setPaymentStatusFilter("");
    setDatePreset("");
    setExactDate("");
  };
  const summary: [string, string | number, string][] = [["Total Orders", filteredOrders.length, "Filtered"], ["Pending", filteredOrders.filter((o) => o.status === "Placed").length, "New"], ["Confirmed", filteredOrders.filter((o) => o.status === "Confirmed").length, "Accepted"], ["Packed", filteredOrders.filter((o) => o.status === "Packed").length, "Ready"], ["Out for Delivery", filteredOrders.filter((o) => o.status === "Out for Delivery").length, "Live"], ["Delivered", filteredOrders.filter((o) => o.status === "Delivered").length, "Done"], ["Cancelled", filteredOrders.filter((o) => o.status === "Cancelled").length, "Stopped"], ["Refunded", filteredOrders.filter((o) => o.paymentStatus === "Refunded").length, "Finance"]];
  return <AdminShell section="orders"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{summary.map(([label, value, sub]) => <Stat key={label} label={label} value={String(value)} sub={sub} />)}</div><Panel title="Order Management"><div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-7"><input aria-label="Search orders" value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} className="min-w-0 rounded-md border px-3 py-2 sm:col-span-2 xl:col-span-2" placeholder="Search order/customer/phone" /><select aria-label="Order status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-w-0 rounded-md border px-3 py-2"><option value="">All statuses</option>{(["Placed", "Confirmed", "Packed", "Out for Delivery", "Delivered", "Cancelled"] as OrderStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select><select aria-label="Payment method filter" value={paymentMethodFilter} onChange={(event) => setPaymentMethodFilter(event.target.value)} className="min-w-0 rounded-md border px-3 py-2"><option value="">All methods</option><option value="COD">COD</option><option value="Razorpay">Razorpay</option></select><select aria-label="Payment status filter" value={paymentStatusFilter} onChange={(event) => setPaymentStatusFilter(event.target.value)} className="min-w-0 rounded-md border px-3 py-2"><option value="">All payments</option>{(["Paid", "COD Pending", "Failed", "Refunded"] as const).map((status) => <option key={status} value={status}>{status}</option>)}</select><select aria-label="Date range filter" value={datePreset} onChange={(event) => { setDatePreset(event.target.value); if (event.target.value) setExactDate(""); }} className="min-w-0 rounded-md border px-3 py-2"><option value="">All dates</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select><input aria-label="Exact order date" type="date" value={exactDate} onChange={(event) => { setExactDate(event.target.value); if (event.target.value) setDatePreset(""); }} className="min-w-0 rounded-md border px-3 py-2" /><Button variant="outline" onClick={resetFilters}>Reset</Button></div><OrderTable ordersOverride={filteredOrders} /></Panel></AdminShell>;
}

function Coupons() {
  const { coupons, addCoupon, updateCoupon, deleteCoupon, replaceCoupons, toast } = useStore();
  const blankCoupon = (): Coupon => {
    const now = new Date();
    return {
      code: "",
      title: "",
      discountType: "flat",
      type: "FIXED",
      value: 0,
      minOrder: 0,
      minOrderAmount: 0,
      maxDiscount: undefined,
      startAt: new Date(now.getTime() - 60_000).toISOString(),
      endAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
      usageLimit: undefined,
      perUserLimit: undefined,
      active: true,
    };
  };
  const [draft, setDraft] = useState<Coupon>(blankCoupon);
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyCouponId, setBusyCouponId] = useState("");
  useEffect(() => {
    fetchAdminCoupons().then(replaceCoupons).catch((error) => toast(error instanceof Error ? error.message : "Unable to load coupons. Database connection is unavailable.", "error"));
  }, [replaceCoupons, toast]);
  const setDiscountType = (discountType: Coupon["discountType"]) => setDraft({ ...draft, discountType, type: discountType === "flat" ? "FIXED" : discountType === "percent" ? "PERCENTAGE" : "FREE_DELIVERY", value: discountType === "shipping" && !draft.value ? 49 : draft.value });
  const editCoupon = (coupon: Coupon) => {
    setEditingId(coupon.id || "");
    setDraft({ ...coupon, minOrder: coupon.minOrderAmount ?? coupon.minOrder, minOrderAmount: coupon.minOrderAmount ?? coupon.minOrder });
  };
  const resetDraft = () => {
    setEditingId("");
    setDraft(blankCoupon());
  };
  const saveCoupon = async () => {
    if (saving) return;
    const code = draft.code.trim().toUpperCase();
    if (!code) return toast("Coupon code is required.", "error");
    if (!draft.title.trim()) return toast("Coupon title is required.", "error");
    if (!Number.isFinite(draft.value) || draft.value <= 0) return toast("Coupon value must be greater than zero.", "error");
    if (draft.discountType === "percent" && draft.value > 95) return toast("Percentage coupon value must be 95 or less.", "error");
    if (!Number.isFinite(draft.minOrder) || draft.minOrder < 0) return toast("Coupon minimum order is invalid.", "error");
    if (draft.endAt && draft.startAt && new Date(draft.endAt) <= new Date(draft.startAt)) return toast("End date must be after start date.", "error");
    setSaving(true);
    try {
      const payload = { ...draft, code, title: draft.title.trim(), minOrderAmount: draft.minOrder, maxDiscount: draft.maxDiscount || undefined, usageLimit: draft.usageLimit || undefined, perUserLimit: draft.perUserLimit || undefined };
      const saved = editingId ? await updateAdminCoupon({ ...payload, id: editingId }) : await createAdminCoupon(payload);
      editingId ? updateCoupon(saved) : addCoupon(saved);
      toast("Coupon saved successfully", "success");
      resetDraft();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save coupon.", "error");
    } finally {
      setSaving(false);
    }
  };
  const toggleCoupon = async (coupon: Coupon) => {
    const next = { ...coupon, active: !coupon.active };
    if (!coupon.id) return;
    setBusyCouponId(coupon.id);
    try {
      const saved = await updateAdminCoupon(next);
      updateCoupon(saved);
      toast(`Coupon ${saved.active ? "enabled" : "disabled"} successfully`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update coupon.", "error");
    } finally {
      setBusyCouponId("");
    }
  };
  const removeCoupon = async (coupon: Coupon) => {
    if (!coupon.id) return;
    setBusyCouponId(coupon.id);
    try {
      await deleteAdminCoupon(coupon.id);
      deleteCoupon(coupon.id);
      toast("Deleted successfully", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not delete coupon.", "error");
    } finally {
      setBusyCouponId("");
    }
  };
  const pagedCoupons = usePagedItems(coupons);
  return <AdminShell section="coupons"><Panel title="Coupons"><div className="mb-5 grid gap-3 rounded-md bg-white p-4 md:grid-cols-6"><input aria-label="Coupon code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className="rounded-md border px-3 py-2" placeholder="Code" /><input aria-label="Coupon title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="rounded-md border px-3 py-2 md:col-span-2" placeholder="Title" /><select aria-label="Coupon type" value={draft.discountType} onChange={(e) => setDiscountType(e.target.value as Coupon["discountType"])} className="rounded-md border px-3 py-2"><option value="flat">Flat</option><option value="percent">Percent</option><option value="shipping">Free delivery</option></select><input aria-label="Coupon value" inputMode="decimal" value={draft.value || ""} onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })} className="rounded-md border px-3 py-2" placeholder="Value" /><input aria-label="Coupon min order" inputMode="decimal" value={draft.minOrder || ""} onChange={(e) => setDraft({ ...draft, minOrder: Number(e.target.value), minOrderAmount: Number(e.target.value) })} className="rounded-md border px-3 py-2" placeholder="Min order" /><input aria-label="Coupon max discount" inputMode="decimal" value={draft.maxDiscount || ""} onChange={(e) => setDraft({ ...draft, maxDiscount: e.target.value ? Number(e.target.value) : undefined })} className="rounded-md border px-3 py-2" placeholder="Max discount" /><input aria-label="Coupon start date" type="date" value={dateInput(draft.startAt)} onChange={(e) => setDraft({ ...draft, startAt: new Date(e.target.value).toISOString() })} className="rounded-md border px-3 py-2" /><input aria-label="Coupon end date" type="date" value={dateInput(draft.endAt)} onChange={(e) => setDraft({ ...draft, endAt: new Date(e.target.value).toISOString() })} className="rounded-md border px-3 py-2" /><input aria-label="Coupon usage limit" inputMode="numeric" value={draft.usageLimit || ""} onChange={(e) => setDraft({ ...draft, usageLimit: e.target.value ? Number(e.target.value) : undefined })} className="rounded-md border px-3 py-2" placeholder="Usage limit" /><input aria-label="Coupon per user limit" inputMode="numeric" value={draft.perUserLimit || ""} onChange={(e) => setDraft({ ...draft, perUserLimit: e.target.value ? Number(e.target.value) : undefined })} className="rounded-md border px-3 py-2" placeholder="Per user" /><label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-bold"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active</label><div className="flex gap-2"><Button variant="gold" onClick={saveCoupon} disabled={saving}>{saving ? "Saving..." : editingId ? "Save coupon" : "Add coupon"}</Button>{editingId && <Button variant="outline" onClick={resetDraft}>Cancel</Button>}</div></div><DataTable headers={["Code", "Title", "Type", "Value", "Min order", "Max", "Usage", "Dates", "Status", "Actions"]} minWidth="min-w-[1180px]">{pagedCoupons.items.map((c) => <tr key={c.id || c.code} className="border-b"><td className="p-3 font-bold">{c.code}</td><td className="p-3">{c.title}</td><td className="p-3">{c.discountType}</td><td className="p-3">{c.value}</td><td className="p-3">{money(c.minOrder)}</td><td className="p-3">{c.maxDiscount ? money(c.maxDiscount) : "-"}</td><td className="p-3">{c.usedCount || 0}/{c.usageLimit || "∞"}<div className="text-xs text-black/45">User {c.perUserLimit || "∞"}</div></td><td className="p-3 text-xs">{dateInput(c.startAt) || "-"}<br />{dateInput(c.endAt) || "-"}</td><td className="p-3"><StatusBadge value={c.active ? "Active" : "Inactive"} /></td><td className="p-3"><div className="flex gap-2 whitespace-nowrap"><Button variant="outline" onClick={() => editCoupon(c)}>Edit</Button><Button variant="outline" onClick={() => toggleCoupon(c)}>{c.active ? "Disable" : "Enable"}</Button><Button variant="ghost" onClick={() => removeCoupon(c)}>Delete</Button></div></td></tr>)}</DataTable><PaginationControls page={pagedCoupons.page} totalPages={pagedCoupons.totalPages} total={pagedCoupons.total} onPageChange={pagedCoupons.setPage} /></Panel></AdminShell>;
}

function CouponsManaged() {
  const { coupons, addCoupon, updateCoupon, deleteCoupon, replaceCoupons, toast } = useStore();
  const blankCoupon = (): Coupon => {
    const now = new Date();
    return { code: "", title: "", discountType: "flat", type: "FIXED", value: 0, minOrder: 0, minOrderAmount: 0, maxDiscount: undefined, startAt: new Date(now.getTime() - 60_000).toISOString(), endAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(), usageLimit: undefined, perUserLimit: undefined, active: true };
  };
  const [draft, setDraft] = useState<Coupon>(blankCoupon);
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyCouponId, setBusyCouponId] = useState("");
  useEffect(() => { fetchAdminCoupons().then(replaceCoupons).catch((error) => toast(error instanceof Error ? error.message : "Unable to load coupons. Database connection is unavailable.", "error")); }, [replaceCoupons, toast]);
  const setDiscountType = (discountType: Coupon["discountType"]) => setDraft({ ...draft, discountType, type: discountType === "flat" ? "FIXED" : discountType === "percent" ? "PERCENTAGE" : "FREE_DELIVERY", value: discountType === "shipping" && !draft.value ? 49 : draft.value });
  const editCoupon = (coupon: Coupon) => {
    setEditingId(coupon.id || "");
    setDraft({ ...coupon, minOrder: coupon.minOrderAmount ?? coupon.minOrder, minOrderAmount: coupon.minOrderAmount ?? coupon.minOrder });
  };
  const resetDraft = () => { setEditingId(""); setDraft(blankCoupon()); };
  const saveCoupon = async () => {
    if (saving) return;
    const code = draft.code.trim().toUpperCase();
    if (!code) return toast("Coupon code is required.", "error");
    if (!draft.title.trim()) return toast("Coupon title is required.", "error");
    if (!Number.isFinite(draft.value) || draft.value <= 0) return toast("Coupon value must be greater than zero.", "error");
    if (draft.discountType === "percent" && draft.value > 95) return toast("Percentage coupon value must be 95 or less.", "error");
    if (!Number.isFinite(draft.minOrder) || draft.minOrder < 0) return toast("Coupon minimum order is invalid.", "error");
    if (draft.endAt && draft.startAt && new Date(draft.endAt) <= new Date(draft.startAt)) return toast("End date must be after start date.", "error");
    setSaving(true);
    try {
      const payload = { ...draft, code, title: draft.title.trim(), minOrderAmount: draft.minOrder, maxDiscount: draft.maxDiscount || undefined, usageLimit: draft.usageLimit || undefined, perUserLimit: draft.perUserLimit || undefined };
      const saved = editingId ? await updateAdminCoupon({ ...payload, id: editingId }) : await createAdminCoupon(payload);
      editingId ? updateCoupon(saved) : addCoupon(saved);
      toast("Coupon saved successfully", "success");
      resetDraft();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save coupon.", "error");
    } finally {
      setSaving(false);
    }
  };
  const toggleCoupon = async (coupon: Coupon) => {
    if (!coupon.id) return;
    setBusyCouponId(coupon.id);
    try {
      const saved = await updateAdminCoupon({ ...coupon, active: !coupon.active });
      updateCoupon(saved);
      toast(`Coupon ${saved.active ? "enabled" : "disabled"} successfully`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update coupon.", "error");
    } finally {
      setBusyCouponId("");
    }
  };
  const removeCoupon = async (coupon: Coupon) => {
    if (!coupon.id) return;
    setBusyCouponId(coupon.id);
    try {
      await deleteAdminCoupon(coupon.id);
      deleteCoupon(coupon.id);
      toast("Deleted successfully", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not delete coupon.", "error");
    } finally {
      setBusyCouponId("");
    }
  };
  const pagedCoupons = usePagedItems(coupons);
  const submitLabel = saving ? "Saving..." : editingId ? "Save coupon" : "Add coupon";
  return <AdminShell section="coupons"><Panel title="Coupons"><div className="mb-5 grid gap-3 rounded-md bg-white p-4 md:grid-cols-12"><input aria-label="Coupon code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className="rounded-md border px-3 py-2 md:col-span-2" placeholder="Code" /><input aria-label="Coupon title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="rounded-md border px-3 py-2 md:col-span-4" placeholder="Title" /><select aria-label="Coupon type" value={draft.discountType} onChange={(e) => setDiscountType(e.target.value as Coupon["discountType"])} className="rounded-md border px-3 py-2 md:col-span-2"><option value="flat">Flat</option><option value="percent">Percent</option><option value="shipping">Free delivery</option></select><input aria-label="Coupon value" inputMode="decimal" value={draft.value || ""} onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })} className="rounded-md border px-3 py-2 md:col-span-2" placeholder="Value" /><input aria-label="Coupon min order" inputMode="decimal" value={draft.minOrder || ""} onChange={(e) => setDraft({ ...draft, minOrder: Number(e.target.value), minOrderAmount: Number(e.target.value) })} className="rounded-md border px-3 py-2 md:col-span-2" placeholder="Min order" /><input aria-label="Coupon max discount" inputMode="decimal" value={draft.maxDiscount || ""} onChange={(e) => setDraft({ ...draft, maxDiscount: e.target.value ? Number(e.target.value) : undefined })} className="rounded-md border px-3 py-2 md:col-span-2" placeholder="Max discount" /><input aria-label="Coupon start date" type="date" value={dateInput(draft.startAt)} onChange={(e) => setDraft({ ...draft, startAt: new Date(e.target.value).toISOString() })} className="rounded-md border px-3 py-2 md:col-span-2" /><input aria-label="Coupon end date" type="date" value={dateInput(draft.endAt)} onChange={(e) => setDraft({ ...draft, endAt: new Date(e.target.value).toISOString() })} className="rounded-md border px-3 py-2 md:col-span-2" /><input aria-label="Coupon usage limit" inputMode="numeric" value={draft.usageLimit || ""} onChange={(e) => setDraft({ ...draft, usageLimit: e.target.value ? Number(e.target.value) : undefined })} className="rounded-md border px-3 py-2 md:col-span-2" placeholder="Usage limit" /><input aria-label="Coupon per user limit" inputMode="numeric" value={draft.perUserLimit || ""} onChange={(e) => setDraft({ ...draft, perUserLimit: e.target.value ? Number(e.target.value) : undefined })} className="rounded-md border px-3 py-2 md:col-span-2" placeholder="Per user" /><label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-bold md:col-span-2"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active</label><div className="flex flex-wrap gap-2 md:col-span-4"><Button variant="gold" className="min-w-[132px] whitespace-nowrap" onClick={saveCoupon} disabled={saving}>{submitLabel}</Button>{editingId && <Button variant="outline" className="whitespace-nowrap" onClick={resetDraft}>Cancel</Button>}</div></div><DataTable headers={["Code", "Title", "Type", "Value", "Min order", "Max", "Usage", "Dates", "Status", "Actions"]} minWidth="min-w-[1180px]">{pagedCoupons.items.map((c) => <tr key={c.id || c.code} className="border-b"><td className="p-3 font-bold">{c.code}</td><td className="p-3">{c.title}</td><td className="p-3">{c.discountType}</td><td className="p-3">{c.value}</td><td className="p-3">{money(c.minOrder)}</td><td className="p-3">{c.maxDiscount ? money(c.maxDiscount) : "-"}</td><td className="p-3">{c.usedCount || 0}/{c.usageLimit || "Unlimited"}<div className="text-xs text-black/45">User {c.perUserLimit || "Unlimited"}</div></td><td className="p-3 text-xs">{dateInput(c.startAt) || "-"}<br />{dateInput(c.endAt) || "-"}</td><td className="p-3"><StatusBadge value={c.active ? "Active" : "Inactive"} /></td><td className="p-3"><div className="flex gap-2 whitespace-nowrap"><Button variant="outline" disabled={busyCouponId === c.id} onClick={() => editCoupon(c)}>Edit</Button><Button variant="outline" disabled={busyCouponId === c.id} onClick={() => toggleCoupon(c)}>{busyCouponId === c.id ? "Saving..." : c.active ? "Disable" : "Enable"}</Button><Button variant="ghost" disabled={busyCouponId === c.id} onClick={() => removeCoupon(c)}>Delete</Button></div></td></tr>)}</DataTable><PaginationControls page={pagedCoupons.page} totalPages={pagedCoupons.totalPages} total={pagedCoupons.total} onPageChange={pagedCoupons.setPage} /></Panel></AdminShell>;
}

function BillingInvoices() {
  const { toast } = useStore();
  const [remoteOrders, setRemoteOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [datePreset, setDatePreset] = useState("");
  const [exactDate, setExactDate] = useState("");
  useEffect(() => { fetchAdminOrders().then(setRemoteOrders).catch((error) => toast(error instanceof Error ? error.message : "Unable to load invoices. Database connection is unavailable.", "error")); }, [toast]);
  const invoiceRows = remoteOrders.filter((order) => order.invoiceNumber);
  const startForPreset = (preset: string) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (preset === "today") return start;
    if (preset === "7d") {
      start.setDate(start.getDate() - 6);
      return start;
    }
    if (preset === "30d") {
      start.setDate(start.getDate() - 29);
      return start;
    }
    return null;
  };
  const filteredRows = invoiceRows.filter((order) => {
    const normalized = query.trim().toLowerCase();
    const invoiceDate = new Date(order.invoiceDate || order.createdAt);
    const presetStart = startForPreset(datePreset);
    const exactStart = exactDate ? new Date(exactDate) : null;
    exactStart?.setHours(0, 0, 0, 0);
    const exactEnd = exactStart ? new Date(exactStart) : null;
    exactEnd?.setHours(23, 59, 59, 999);
    return (!normalized || order.invoiceNumber?.toLowerCase().includes(normalized) || order.orderNumber.toLowerCase().includes(normalized) || order.customerName.toLowerCase().includes(normalized) || order.address.phone?.includes(normalized))
      && (!paymentStatus || order.paymentStatus === paymentStatus)
      && (!paymentMethod || order.paymentMethod === paymentMethod)
      && (!orderStatus || order.status === orderStatus)
      && (!presetStart || invoiceDate >= presetStart)
      && (!exactStart || (invoiceDate >= exactStart && exactEnd != null && invoiceDate <= exactEnd));
  });
  const totalBilled = filteredRows.reduce((sum, order) => sum + (order.grandTotal || 0), 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayBilling = invoiceRows.filter((order) => new Date(order.invoiceDate || order.createdAt) >= today).reduce((sum, order) => sum + (order.grandTotal || 0), 0);
  const paid = filteredRows.filter((order) => order.paymentStatus === "Paid");
  const codPending = filteredRows.filter((order) => order.paymentStatus === "COD Pending");
  const stats: [string, string, string][] = [
    ["Total Billed", money(totalBilled), "All invoices"],
    ["Today's Billing", money(todayBilling), "Generated today"],
    ["Paid Amount", money(paid.reduce((sum, order) => sum + (order.grandTotal || 0), 0)), "Settled"],
    ["COD Pending Amount", money(codPending.reduce((sum, order) => sum + (order.grandTotal || 0), 0)), "Collectable"],
    ["Refund Amount", money(filteredRows.filter((order) => order.paymentStatus === "Refunded").reduce((sum, order) => sum + (order.grandTotal || 0), 0)), "Refunded"],
    ["Tax Collected", money(filteredRows.reduce((sum, order) => sum + (order.gstTotal || 0), 0)), "GST"],
    ["Delivery Charges Collected", money(filteredRows.reduce((sum, order) => sum + (order.deliveryCharge || 0), 0)), "Delivery"],
    ["Total Invoices", String(filteredRows.length), "Filtered"],
  ];
  const resetFilters = () => {
    setQuery("");
    setPaymentStatus("");
    setPaymentMethod("");
    setOrderStatus("");
    setDatePreset("");
    setExactDate("");
  };
  const pagedOrders = usePagedItems(filteredRows);
  return <AdminShell section="invoices"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([label, value, sub]) => <Stat key={label} label={label} value={value} sub={sub} />)}</div><Panel title="Billing & Invoices"><div className="mb-4 grid gap-3 md:grid-cols-7"><input aria-label="Search invoices" value={query} onChange={(event) => setQuery(event.target.value)} className="rounded-md border px-3 py-2 md:col-span-2" placeholder="Search invoice/order/customer/phone" /><select aria-label="Invoice date range" value={datePreset} onChange={(event) => { setDatePreset(event.target.value); if (event.target.value) setExactDate(""); }} className="rounded-md border px-3 py-2"><option value="">All dates</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select><input aria-label="Exact invoice date" type="date" value={exactDate} onChange={(event) => { setExactDate(event.target.value); if (event.target.value) setDatePreset(""); }} className="rounded-md border px-3 py-2" /><select aria-label="Payment status" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)} className="rounded-md border px-3 py-2"><option value="">All payments</option><option value="Paid">Paid</option><option value="COD Pending">COD Pending</option><option value="Failed">Failed</option><option value="Refunded">Refunded</option></select><select aria-label="Payment method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="rounded-md border px-3 py-2"><option value="">All methods</option><option value="COD">COD</option><option value="Razorpay">Razorpay</option></select><select aria-label="Order status" value={orderStatus} onChange={(event) => setOrderStatus(event.target.value)} className="rounded-md border px-3 py-2"><option value="">All order statuses</option>{(["Placed", "Confirmed", "Packed", "Out for Delivery", "Delivered", "Cancelled"] as OrderStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select><Button variant="outline" onClick={resetFilters}>Reset</Button></div><DataTable headers={["Invoice Number", "Order Number", "Customer", "Date", "Amount", "Payment Method", "Payment Status", "Order Status", "Actions"]} minWidth="min-w-[1120px]">{pagedOrders.items.map((order) => <tr key={order.invoiceNumber || order.orderNumber} className="border-b odd:bg-white even:bg-[#faf7ef]"><td className="p-3 font-bold">{order.invoiceNumber}</td><td className="p-3">{order.orderNumber}</td><td className="p-3">{order.customerName}</td><td className="p-3">{new Date(order.invoiceDate || order.createdAt).toLocaleDateString("en-IN")}</td><td className="p-3 font-bold">{money(order.grandTotal || 0)}</td><td className="p-3">{order.paymentMethod}</td><td className="p-3"><StatusBadge value={order.paymentStatus} /></td><td className="p-3"><StatusBadge value={order.status} /></td><td className="p-3"><div className="flex gap-2 whitespace-nowrap"><Link href={`/invoice/${order.orderNumber}`}><Button variant="outline">View</Button></Link><Link href={`/invoice/${order.orderNumber}?print=1`} target="_blank"><Button variant="gold">Print</Button></Link></div></td></tr>)}</DataTable>{!filteredRows.length && <p className="rounded-md bg-white p-4 text-sm text-black/60">No database invoices match the current filters.</p>}<PaginationControls page={pagedOrders.page} totalPages={pagedOrders.totalPages} total={pagedOrders.total} onPageChange={pagedOrders.setPage} /></Panel></AdminShell>;
}

function AdminPayments() {
  const { orders, products, toast } = useStore();
  const [remoteOrders, setRemoteOrders] = useState<Order[]>([]);
  useEffect(() => { fetchAdminOrders().then(setRemoteOrders).catch((error) => toast(error instanceof Error ? error.message : "Unable to load payments. Database connection is unavailable.", "error")); }, [toast]);
  const rows = remoteOrders.length ? remoteOrders : orders;
  const amount = (order: Order) => order.grandTotal || calc(order.items, products);
  const paid = rows.filter((order) => order.paymentStatus === "Paid");
  const razorpayPaid = paid.filter((order) => order.paymentMethod === "Razorpay");
  const codPending = rows.filter((order) => order.paymentStatus === "COD Pending");
  const failed = rows.filter((order) => order.paymentStatus === "Failed");
  const pagedRows = usePagedItems(rows);
  return <AdminShell section="payments"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Stat label="Total Paid" value={money(paid.reduce((sum, order) => sum + amount(order), 0))} sub="Settled" /><Stat label="Razorpay Paid" value={money(razorpayPaid.reduce((sum, order) => sum + amount(order), 0))} sub="Online" /><Stat label="COD Pending" value={money(codPending.reduce((sum, order) => sum + amount(order), 0))} sub="Collectable" /><Stat label="Failed Payments" value={String(failed.length)} sub="Needs retry" /><Stat label="Refund Pending" value="0" sub="Placeholder" /></div><Panel title="Payments"><DataTable headers={["Payment ID", "Order Number", "Customer", "Method", "Razorpay Order ID", "Razorpay Payment ID", "Amount", "Status", "Date", "Actions"]} minWidth="min-w-[1180px]">{pagedRows.items.map((order) => <tr key={order.orderNumber} className="border-b odd:bg-white even:bg-[#faf7ef]"><td className="p-3 font-bold">{order.paymentId || "-"}</td><td className="p-3"><Link className="underline decoration-[#d4af37] underline-offset-4" href={`/admin/orders/${order.orderNumber}`}>{order.orderNumber}</Link></td><td className="p-3">{order.customerName}</td><td className="p-3">{order.paymentMethod}</td><td className="p-3 break-all">{order.razorpayOrderId || "-"}</td><td className="p-3 break-all">{order.razorpayPaymentId || "-"}</td><td className="p-3">{money(amount(order))}</td><td className="p-3"><StatusBadge value={order.paymentStatus} /></td><td className="p-3">{new Date(order.createdAt).toLocaleDateString("en-IN")}</td><td className="p-3"><div className="flex gap-2 whitespace-nowrap"><Link className="rounded border px-2 py-1 text-xs font-bold" href={`/admin/orders/${order.orderNumber}`}>View</Link></div></td></tr>)}</DataTable><PaginationControls page={pagedRows.page} totalPages={pagedRows.totalPages} total={pagedRows.total} onPageChange={pagedRows.setPage} /></Panel></AdminShell>;
}

function DeliveryAdmin() {
  const { admin, assignDeliveryStaff, updateOrderStatus, toast } = useStore();
  const [remoteOrders, setRemoteOrders] = useState<Order[]>([]);
  const [staffRows, setStaffRows] = useState<{ id: string; name: string; phone?: string; _count?: { assignments?: number } }[]>([]);
  const [staffForm, setStaffForm] = useState({ name: "", phone: "" });
  const [query, setQuery] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [savingOrder, setSavingOrder] = useState("");
  const [savingStaff, setSavingStaff] = useState(false);
  const [deletingStaff, setDeletingStaff] = useState("");
  const [slots, setSlots] = useState<any[]>([]);
  const [slotDraft, setSlotDraft] = useState({ label: "", startTime: "", endTime: "", capacity: "40" });
  const [savingSlot, setSavingSlot] = useState(false);
  const returnWorkflowStatuses: OrderStatus[] = ["Return Requested", "Refunded"];
  const deliveryStatusOptions: OrderStatus[] = ["Confirmed", "Packed", "Out for Delivery", "Delivered"];
  const returnStatusOptions: OrderStatus[] = ["Return Requested", "Refunded", "Cancelled"];
  const canManageDeliveryStaff = admin?.role?.name === "SUPER_ADMIN" || admin?.role?.name === "DELIVERY_STAFF";
  const isReturnWorkflowOrder = (order: Order) => returnWorkflowStatuses.includes(order.status);
  const statusOptionsForOrder = (order: Order) => isReturnWorkflowOrder(order) ? returnStatusOptions : deliveryStatusOptions;
  useEffect(() => {
    fetchAdminOrders().then(setRemoteOrders).catch((error) => toast(error instanceof Error ? error.message : "Unable to load delivery orders.", "error"));
    fetchAdminDeliveryStaff().then(setStaffRows).catch((error) => toast(error instanceof Error ? error.message : "Unable to load delivery staff.", "error"));
    fetchAdminDeliverySlots().then(setSlots).catch((error) => toast(error instanceof Error ? error.message : "Unable to load delivery slots.", "error"));
  }, [toast]);
  const saveSlot = async () => {
    if (!slotDraft.label.trim() || !slotDraft.startTime.trim() || !slotDraft.endTime.trim()) return toast("Slot label and timing are required.", "error");
    setSavingSlot(true);
    try {
      const slot = await createAdminDeliverySlot({ label: slotDraft.label.trim(), startTime: slotDraft.startTime.trim(), endTime: slotDraft.endTime.trim(), capacity: Number(slotDraft.capacity || 0) });
      setSlots((items) => [slot, ...items]);
      setSlotDraft({ label: "", startTime: "", endTime: "", capacity: "40" });
      toast("Delivery slot added", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save delivery slot.", "error");
    } finally {
      setSavingSlot(false);
    }
  };
  const toggleSlot = async (slot: any) => {
    const saved = await updateAdminDeliverySlot(slot.id, { active: !slot.active });
    setSlots((items) => items.map((item) => item.id === slot.id ? { ...item, ...saved } : item));
  };
  const removeSlot = async (slot: any) => {
    await deleteAdminDeliverySlot(slot.id);
    setSlots((items) => items.filter((item) => item.id !== slot.id));
  };
  const deliveryOrders = remoteOrders.filter((order) => !["Cancelled", "Delivered"].includes(order.status) || order.deliveryStaff);
  const filteredOrders = deliveryOrders.filter((order) => {
    const term = query.trim().toLowerCase();
    const date = dateFilter ? new Date(dateFilter) : null;
    date?.setHours(0, 0, 0, 0);
    const dateEnd = date ? new Date(date) : null;
    dateEnd?.setHours(23, 59, 59, 999);
    const createdAt = new Date(order.deliveryDate || order.createdAt);
    return (!term || order.orderNumber.toLowerCase().includes(term) || order.customerName.toLowerCase().includes(term) || order.address.pincode.includes(term) || order.address.city.toLowerCase().includes(term))
      && (!staffFilter || order.deliveryStaff === staffFilter || (staffFilter === "unassigned" && !order.deliveryStaff))
      && (!statusFilter || order.status === statusFilter)
      && (!date || (createdAt >= date && dateEnd != null && createdAt <= dateEnd));
  });
  const assign = async (order: Order, staffId: string) => {
    if (!staffId) return;
    const staff = staffRows.find((item) => item.id === staffId);
    setSavingOrder(order.orderNumber);
    try {
      const updated = await assignAdminDelivery(order.orderNumber, staffId);
      setRemoteOrders((items) => items.map((item) => item.orderNumber === updated.orderNumber ? updated : item));
      if (staff) assignDeliveryStaff(order.orderNumber, staff.name);
      toast("Delivery staff assigned", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not assign delivery.", "error");
    } finally {
      setSavingOrder("");
    }
  };
  const changeStatus = async (order: Order, status: OrderStatus) => {
    setSavingOrder(order.orderNumber);
    try {
      const updateStatus = admin?.role?.name === "DELIVERY_STAFF" ? updateDeliveryOrderStatus : updateAdminOrderStatus;
      const updated = await updateStatus(order.orderNumber, status.toUpperCase().replaceAll(" ", "_"));
      setRemoteOrders((items) => items.map((item) => item.orderNumber === updated.orderNumber ? updated : item));
      updateOrderStatus(updated.orderNumber, updated.status);
      toast("Delivery status updated", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update delivery status.", "error");
    } finally {
      setSavingOrder("");
    }
  };
  const addStaff = async (event: FormEvent) => {
    event.preventDefault();
    if (savingStaff) return;
    const name = staffForm.name.trim();
    const phone = staffForm.phone.trim();
    if (!name) return toast("Delivery staff name is required.", "error");
    if (!/^[6-9]\d{9}$/.test(phone)) return toast("Enter a valid 10 digit staff phone number.", "error");
    setSavingStaff(true);
    try {
      const created = await createAdminDeliveryStaff({ name, phone });
      setStaffRows((items) => [created, ...items.filter((item) => item.id !== created.id)]);
      setStaffForm({ name: "", phone: "" });
      toast("Delivery staff added", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not add delivery staff.", "error");
    } finally {
      setSavingStaff(false);
    }
  };
  const removeStaff = async (staff: { id: string; name: string }) => {
    if (deletingStaff) return;
    setDeletingStaff(staff.id);
    try {
      const result = await deleteAdminDeliveryStaff(staff.id);
      setStaffRows((items) => items.filter((item) => item.id !== staff.id));
      if (staffFilter === staff.name) setStaffFilter("");
      toast(result.deactivated ? "Delivery staff deactivated because assigned orders exist." : "Delivery staff deleted", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not delete delivery staff.", "error");
    } finally {
      setDeletingStaff("");
    }
  };
  const pagedOrders = usePagedItems(filteredOrders);
  const assigned = deliveryOrders.filter((order) => order.deliveryStaff);
  const unassigned = deliveryOrders.filter((order) => !order.deliveryStaff && !["Delivered", "Cancelled"].includes(order.status));
  const outForDelivery = deliveryOrders.filter((order) => order.status === "Out for Delivery");
  const delivered = remoteOrders.filter((order) => order.status === "Delivered");
  return (
    <AdminShell section="delivery">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Delivery orders" value={String(deliveryOrders.length)} sub="Active and assigned" />
        <Stat label="Assigned" value={String(assigned.length)} sub="With staff" />
        <Stat label="Unassigned" value={String(unassigned.length)} sub="Needs action" />
        <Stat label="Out for delivery" value={String(outForDelivery.length)} sub={`${delivered.length} delivered`} />
      </div>
      <Panel title="Delivery Slot Management">
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_120px_auto]">
          <input aria-label="Slot label" value={slotDraft.label} onChange={(event) => setSlotDraft((current) => ({ ...current, label: event.target.value }))} className="rounded-md border px-3 py-2" placeholder="Slot label" />
          <input aria-label="Slot start time" value={slotDraft.startTime} onChange={(event) => setSlotDraft((current) => ({ ...current, startTime: event.target.value }))} className="rounded-md border px-3 py-2" placeholder="Start time" />
          <input aria-label="Slot end time" value={slotDraft.endTime} onChange={(event) => setSlotDraft((current) => ({ ...current, endTime: event.target.value }))} className="rounded-md border px-3 py-2" placeholder="End time" />
          <input aria-label="Slot capacity" value={slotDraft.capacity} onChange={(event) => setSlotDraft((current) => ({ ...current, capacity: event.target.value }))} className="rounded-md border px-3 py-2" inputMode="numeric" placeholder="Capacity" />
          <Button variant="gold" disabled={savingSlot} onClick={saveSlot}>{savingSlot ? "Saving..." : "Add Slot"}</Button>
        </div>
        <DataTable headers={["Label", "Timing", "Capacity", "Status", "Actions"]} minWidth="min-w-[760px]">
          {slots.map((slot) => <tr key={slot.id} className="border-b odd:bg-white even:bg-[#faf7ef]"><td className="p-3 font-bold">{slot.label}</td><td className="p-3">{slot.startTime} - {slot.endTime}</td><td className="p-3">{slot.capacity}</td><td className="p-3"><StatusBadge value={slot.active ? "Active" : "Inactive"} /></td><td className="p-3"><div className="flex gap-2 whitespace-nowrap"><Button variant="outline" onClick={() => toggleSlot(slot)}>{slot.active ? "Disable" : "Enable"}</Button><Button variant="ghost" onClick={() => removeSlot(slot)}>Delete</Button></div></td></tr>)}
        </DataTable>
        {!slots.length && <p className="rounded-md bg-white p-4 text-sm text-black/60">No delivery slots found in database.</p>}
      </Panel>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel title="Delivery Management">
          <div className="mb-4 grid gap-3 md:grid-cols-5">
            <input aria-label="Search delivery orders" value={query} onChange={(event) => setQuery(event.target.value)} className="rounded-md border px-3 py-2 md:col-span-2" placeholder="Search order, customer, city, pincode" />
            <select aria-label="Delivery staff filter" value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)} className="rounded-md border px-3 py-2">
              <option value="">All staff</option>
              <option value="unassigned">Unassigned</option>
              {staffRows.map((staff) => <option key={staff.id} value={staff.name}>{staff.name}</option>)}
            </select>
            <select aria-label="Delivery status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-md border px-3 py-2">
              <option value="">All statuses</option>
              {(["Placed", "Confirmed", "Packed", "Out for Delivery", "Delivered", "Return Requested", "Refunded"] as OrderStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <input aria-label="Delivery date filter" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="rounded-md border px-3 py-2" />
          </div>
          <DataTable headers={["Order", "Customer", "Address", "Slot", "Status", "Staff", "Assign", "Update"]} minWidth="min-w-[1180px]">
            {pagedOrders.items.map((order) => <tr key={order.orderNumber} className="border-b odd:bg-white even:bg-[#faf7ef]"><td className="p-3 font-bold"><Link className="underline decoration-[#d4af37] underline-offset-4" href={`/admin/orders/${order.orderNumber}`}>{order.orderNumber}</Link><div className="text-xs font-normal text-black/50">{new Date(order.deliveryDate || order.createdAt).toLocaleDateString("en-IN")}</div></td><td className="p-3">{order.customerName}<div className="text-xs text-black/50">{order.address.phone}</div></td><td className="p-3 text-sm">{order.address.line}<div className="text-xs text-black/50">{order.address.city} - {order.address.pincode}</div></td><td className="p-3">{order.deliverySlot || "-"}</td><td className="p-3"><StatusBadge value={order.status} /></td><td className="p-3 font-bold">{order.deliveryStaff || "Unassigned"}{order.deliveryAssignedAt && <div className="text-xs font-normal text-black/45">Assigned {new Date(order.deliveryAssignedAt).toLocaleDateString("en-IN")}</div>}</td><td className="p-3"><select aria-label={`Assign staff for ${order.orderNumber}`} value={order.deliveryStaffId || ""} disabled={savingOrder === order.orderNumber || order.status === "Delivered" || order.status === "Cancelled" || isReturnWorkflowOrder(order)} onChange={(event) => assign(order, event.target.value)} className="w-44 rounded-md border px-2 py-2 text-sm"><option value="">Choose staff</option>{staffRows.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}</select></td><td className="p-3"><select aria-label={`${isReturnWorkflowOrder(order) ? "Return" : "Delivery"} status for ${order.orderNumber}`} value={order.status} disabled={savingOrder === order.orderNumber || order.status === "Cancelled" || order.status === "Refunded"} onChange={(event) => changeStatus(order, event.target.value as OrderStatus)} className="w-44 rounded-md border px-2 py-2 text-sm">{statusOptionsForOrder(order).map((status) => <option key={status} value={status}>{status}</option>)}</select>{isReturnWorkflowOrder(order) && <Link href="/admin/returns" className="mt-2 block text-xs font-bold text-[#8a6500] underline underline-offset-4">Manage return/refund</Link>}</td></tr>)}
          </DataTable>
          {!filteredOrders.length && <p className="rounded-md bg-white p-4 text-sm text-black/60">No delivery orders match the current filters.</p>}
          <PaginationControls page={pagedOrders.page} totalPages={pagedOrders.totalPages} total={pagedOrders.total} onPageChange={pagedOrders.setPage} />
        </Panel>
        <Panel title="Delivery Staff">
          {canManageDeliveryStaff && (
            <form onSubmit={addStaff} className="mb-4 grid gap-3 rounded-md border border-[#eadfca] bg-white p-3">
              <input aria-label="Delivery staff name" value={staffForm.name} onChange={(event) => setStaffForm((current) => ({ ...current, name: event.target.value }))} className="rounded-md border px-3 py-2" placeholder="Staff name" />
              <input aria-label="Delivery staff phone" value={staffForm.phone} onChange={(event) => setStaffForm((current) => ({ ...current, phone: event.target.value }))} className="rounded-md border px-3 py-2" inputMode="numeric" maxLength={10} placeholder="10 digit phone" />
              <Button variant="gold" disabled={savingStaff}>{savingStaff ? "Adding..." : "Add Staff"}</Button>
            </form>
          )}
          <div className="grid gap-3">
            {staffRows.map((staff) => {
              const liveCount = assigned.filter((order) => order.deliveryStaff === staff.name).length;
              const totalCount = staff._count?.assignments ?? liveCount;
              return <div key={staff.id} className="rounded-md border border-[#eadfca] bg-white p-3"><div className="flex items-start justify-between gap-3"><div><b>{staff.name}</b>{staff.phone && <p className="mt-1 text-xs text-black/55">{staff.phone}</p>}</div><span className="rounded-full bg-[#fff8df] px-2 py-1 text-xs font-bold text-[#8a6500]">{liveCount} active</span></div><div className="mt-3 flex items-center justify-between gap-3 border-t pt-3"><span className="text-xs font-bold text-black/45">{totalCount} total assignments</span>{canManageDeliveryStaff && <Button variant="ghost" disabled={deletingStaff === staff.id} onClick={() => removeStaff(staff)}>{deletingStaff === staff.id ? "Deleting..." : "Delete"}</Button>}</div></div>;
            })}
          </div>
          {!staffRows.length && <p className="rounded-md bg-white p-4 text-sm text-black/55">No active delivery staff found in database. Add your first staff member above.</p>}
        </Panel>
      </div>
    </AdminShell>
  );
}

function CatalogManager({ section }: { section: "brands" | "categories" }) {
  const { toast } = useStore();
  const [rows, setRows] = useState<(Category | BrandRow)[]>([]);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const isBrand = section === "brands";
  useEffect(() => {
    if (isBrand) fetchAdminBrands().then(setRows).catch((error) => toast(error instanceof Error ? error.message : "Unable to load brands. Database connection is unavailable.", "error"));
    else fetchAdminCategories().then(setRows).catch((error) => toast(error instanceof Error ? error.message : "Unable to load categories. Database connection is unavailable.", "error"));
  }, [isBrand]);
  const editRow = (row: Category | BrandRow) => {
    setEditingId(row.id);
    setName(row.name);
  };
  const saveRow = async () => {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) return toast(`${isBrand ? "Brand" : "Category"} name is required.`, "error");
    const duplicate = rows.some((row) => row.id !== editingId && catalogSlug(row.name) === catalogSlug(trimmed));
    if (duplicate) return toast(`${isBrand ? "Brand" : "Category"} already exists.`, "error");
    setSaving(true);
    try {
      const saved = editingId
        ? isBrand ? await updateAdminBrand(editingId, trimmed) : await updateAdminCategory(editingId, trimmed)
        : isBrand ? await createAdminBrand(trimmed) : await createAdminCategory(trimmed);
      setRows((items) => editingId ? items.map((item) => item.id === editingId ? saved : item) : [saved, ...items]);
      setName("");
      setEditingId("");
      toast(`${isBrand ? "Brand" : "Category"} saved successfully`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : `Could not save ${isBrand ? "brand" : "category"}.`, "error");
    } finally {
      setSaving(false);
    }
  };
  const removeRow = async (row: Category | BrandRow) => {
    try {
      isBrand ? await deleteAdminBrand(row.id) : await deleteAdminCategory(row.id);
      setRows((items) => items.filter((item) => item.id !== row.id));
      toast("Deleted successfully", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : `${isBrand ? "Brand" : "Category"} is linked to products and cannot be deleted.`, "error");
    }
  };
  const pagedRows = usePagedItems(rows);
  const activeRow = rows.find((row) => row.id === editingId);
  const catalogLabel = isBrand ? "brand" : "category";
  const catalogTitle = isBrand ? "Brand" : "Category";
  const CatalogIcon = isBrand ? ShieldCheck : Boxes;
  return (
    <AdminShell section={section}>
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="grid content-start gap-4">
          <section className="overflow-hidden rounded-md border border-[#d8d1c2] bg-white shadow-sm">
            <div className="bg-black p-5 text-white">
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#d4af37] text-black">
                <CatalogIcon size={24} />
              </div>
              <h2 className="display-font mt-4 text-2xl font-black">{editingId ? `Edit ${catalogTitle}` : `Add ${catalogTitle}`}</h2>
              <p className="mt-1 text-sm text-white/60">{editingId ? activeRow?.name || "Update selected record" : `Create a new ${catalogLabel} for the storefront catalog.`}</p>
            </div>
            <div className="grid gap-4 p-5">
              <label className="text-xs font-black uppercase text-black/55">
                {catalogTitle} name
                <input aria-label={`${isBrand ? "Brand" : "Category"} name`} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-md border border-[#cfc4a6] bg-[#fffdf8] px-4 py-3 text-base font-semibold outline-none transition focus:border-[#d4af37] focus:bg-white focus:ring-2 focus:ring-[#d4af37]/20" placeholder={`${editingId ? "Edit" : "Add"} ${catalogLabel}`} />
              </label>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <Button variant="gold" onClick={saveRow} disabled={saving} className="w-full">
                  {saving ? <Save size={16} /> : editingId ? <Save size={16} /> : <Plus size={16} />}
                  {saving ? "Saving..." : editingId ? "Save changes" : `Add ${catalogTitle}`}
                </Button>
                {editingId && <Button variant="outline" onClick={() => { setEditingId(""); setName(""); }} className="w-full"><X size={16} /> Cancel edit</Button>}
              </div>
            </div>
          </section>
        </aside>
        <section className="premium-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8d1c2] bg-white px-5 py-4">
            <div>
              <h2 className="display-font text-xl font-black">{title(section)} Directory</h2>
              <p className="mt-1 text-sm text-black/55">Manage names shown across products, inventory, and store filters.</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-md bg-[#faf7ef] px-3 py-2 text-xs font-black uppercase text-black/55"><Layers3 size={15} /> {rows.length} total</span>
          </div>
          <div className="grid gap-3 p-4 sm:p-5">
            {pagedRows.items.map((row, index) => {
              const selected = editingId === row.id;
              const recordNumber = (pagedRows.page - 1) * adminPageSize + index + 1;
              return (
                <div key={row.id} className={`grid gap-4 rounded-md border p-4 transition md:grid-cols-[1fr_auto] md:items-center ${selected ? "border-[#d4af37] bg-[#fff8df] shadow-sm" : "border-[#eadfca] bg-white hover:border-[#d4af37]/70 hover:shadow-sm"}`}>
                  <div className="flex min-w-0 items-center gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md ${selected ? "bg-black text-[#d4af37]" : "bg-[#f2ead8] text-black"}`}><Tags size={21} /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-black">{row.name}</h3>
                        {selected && <span className="rounded-md bg-black px-2 py-1 text-[11px] font-black uppercase text-[#d4af37]">Editing</span>}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-black/45"><span className="inline-flex items-center gap-1"><Hash size={13} /> {recordNumber.toString().padStart(2, "0")}</span><span>{row.slug || catalogSlug(row.name)}</span></p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:flex md:whitespace-nowrap">
                    <Button variant={selected ? "gold" : "outline"} onClick={() => editRow(row)}><Pencil size={16} /> Edit</Button>
                    <Button variant="ghost" onClick={() => removeRow(row)}><Trash2 size={16} /> Delete</Button>
                  </div>
                </div>
              );
            })}
            {!pagedRows.items.length && <p className="rounded-md border border-dashed border-[#d8d1c2] bg-white p-6 text-center text-sm font-bold text-black/50">No {catalogLabel}s found. Add the first one from the panel.</p>}
          </div>
          <PaginationControls page={pagedRows.page} totalPages={pagedRows.totalPages} total={pagedRows.total} onPageChange={pagedRows.setPage} />
        </section>
      </div>
    </AdminShell>
  );
}

function AdminFaqsPage() {
  const { toast } = useStore();
  type FAQCategory = typeof faqCategories[number];
  const [rows, setRows] = useState<FAQ[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<{ question: string; answer: string; category: FAQCategory; displayOrder: string; isActive: boolean }>({ question: "", answer: "", category: faqCategories[0], displayOrder: "1", isActive: true });
  useEffect(() => {
    fetchAdminFaqs().then(setRows).catch((error) => toast(error instanceof Error ? error.message : "Unable to load FAQs.", "error"));
  }, [toast]);
  const filteredRows = rows.filter((row) => `${row.question} ${row.answer} ${row.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  const paged = usePagedItems(filteredRows);
  const resetDraft = () => {
    setEditingId("");
    setDraft({ question: "", answer: "", category: faqCategories[0], displayOrder: String(rows.length + 1), isActive: true });
  };
  const edit = (row: FAQ) => {
    setEditingId(row.id);
    setDraft({ question: row.question, answer: row.answer, category: row.category as FAQCategory, displayOrder: String(row.displayOrder), isActive: row.isActive });
  };
  const save = async () => {
    if (saving) return;
    if (draft.question.trim().length < 5) return toast("FAQ question must be at least 5 characters.", "error");
    if (draft.answer.trim().length < 10) return toast("FAQ answer must be at least 10 characters.", "error");
    const payload = { question: draft.question.trim(), answer: draft.answer.trim(), category: draft.category, displayOrder: Number(draft.displayOrder) || 0, isActive: draft.isActive };
    setSaving(true);
    try {
      const saved = editingId ? await updateAdminFaq(editingId, payload) : await createAdminFaq(payload);
      setRows((items) => editingId ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]);
      resetDraft();
      toast("FAQ saved successfully", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save FAQ.", "error");
    } finally {
      setSaving(false);
    }
  };
  const remove = async (row: FAQ) => {
    try {
      await deleteAdminFaq(row.id);
      setRows((items) => items.filter((item) => item.id !== row.id));
      setSelectedIds((items) => items.filter((id) => id !== row.id));
      toast("FAQ deleted successfully", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not delete FAQ.", "error");
    }
  };
  const bulkStatus = async (isActive: boolean) => {
    if (!selectedIds.length) return toast("Select FAQs first.", "error");
    try {
      const saved = await bulkUpdateAdminFaqStatus(selectedIds, isActive);
      setRows(saved);
      setSelectedIds([]);
      toast(isActive ? "Selected FAQs enabled" : "Selected FAQs disabled", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update selected FAQs.", "error");
    }
  };
  const toggleSelected = (id: string) => setSelectedIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  return (
    <AdminShell section="faqs">
      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="premium-card h-fit overflow-hidden">
          <div className="bg-black p-5 text-white">
            <p className="text-xs font-black uppercase text-[#e7c766]">Help Center Content</p>
            <h2 className="display-font mt-2 text-2xl font-black">{editingId ? "Edit FAQ" : "Create FAQ"}</h2>
          </div>
          <div className="grid gap-4 p-5">
            <label className="text-sm font-bold">Question<input aria-label="FAQ question" value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 font-normal" /></label>
            <label className="text-sm font-bold">Answer<textarea aria-label="FAQ answer" value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: event.target.value })} className="mt-1 min-h-32 w-full rounded-md border px-3 py-2 font-normal" /></label>
            <label className="text-sm font-bold">Category<select aria-label="FAQ category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as FAQCategory })} className="mt-1 w-full rounded-md border px-3 py-2 font-normal">{faqCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
            <label className="text-sm font-bold">Sort order<input aria-label="FAQ sort order" inputMode="numeric" value={draft.displayOrder} onChange={(event) => setDraft({ ...draft, displayOrder: event.target.value.replace(/\D/g, "") })} className="mt-1 w-full rounded-md border px-3 py-2 font-normal" /></label>
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} /> Active</label>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <Button variant="gold" onClick={save} disabled={saving}>{saving ? "Saving..." : editingId ? "Save FAQ" : "Create FAQ"}</Button>
              {editingId && <Button variant="outline" onClick={resetDraft}>Cancel edit</Button>}
            </div>
          </div>
        </section>
        <Panel title="FAQ Management">
          <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <input aria-label="Search admin FAQs" value={query} onChange={(event) => setQuery(event.target.value)} className="rounded-md border px-3 py-2" placeholder="Search FAQs" />
            <Button variant="outline" onClick={() => bulkStatus(true)}>Bulk enable</Button>
            <Button variant="outline" onClick={() => bulkStatus(false)}>Bulk disable</Button>
          </div>
          <DataTable headers={["Select", "Question", "Category", "Order", "Status", "Actions"]} minWidth="min-w-[960px]">
            {paged.items.map((row) => (
              <tr key={row.id} className="border-b odd:bg-white even:bg-[#faf7ef]">
                <td className="p-3"><input aria-label={`Select ${row.question}`} type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleSelected(row.id)} /></td>
                <td className="p-3"><b>{row.question}</b><p className="mt-1 line-clamp-2 text-xs text-black/55">{row.answer}</p></td>
                <td className="p-3 font-bold">{row.category}</td>
                <td className="p-3">{row.displayOrder}</td>
                <td className="p-3"><StatusBadge value={row.isActive ? "Active" : "Inactive"} /></td>
                <td className="p-3"><div className="flex gap-2 whitespace-nowrap"><Button variant={editingId === row.id ? "gold" : "outline"} onClick={() => edit(row)}>Edit</Button><Button variant="ghost" onClick={() => updateAdminFaq(row.id, { isActive: !row.isActive }).then((saved) => setRows((items) => items.map((item) => item.id === saved.id ? saved : item))).catch((error) => toast(error instanceof Error ? error.message : "Could not update FAQ.", "error"))}>{row.isActive ? "Disable" : "Enable"}</Button><Button variant="ghost" onClick={() => remove(row)}>Delete</Button></div></td>
              </tr>
            ))}
          </DataTable>
          {!paged.items.length && <p className="rounded-md bg-white p-4 text-sm text-black/60">No FAQs found.</p>}
          <PaginationControls page={paged.page} totalPages={paged.totalPages} total={paged.total} onPageChange={paged.setPage} />
        </Panel>
      </div>
    </AdminShell>
  );
}

function GenericAdmin({ section }: { section: string }) {
  const { admin, products, orders, toast } = useStore();
  const [settings, setSettings] = useState({ storeName: "Eagle Mart Grocery & Essentials", support: "support@eaglemart.in", city: "Ahmedabad" });
  const [catalogRows, setCatalogRows] = useState<(Category | { id: string; name: string; slug: string; logo?: string })[]>([]);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  useEffect(() => {
    if (section === "categories") {
      fetchAdminCategories().then(setCatalogRows).catch((error) => toast(error instanceof Error ? error.message : "Unable to load categories. Database connection is unavailable.", "error"));
    }
    if (section === "brands") {
      fetchAdminBrands().then(setCatalogRows).catch((error) => toast(error instanceof Error ? error.message : "Unable to load brands. Database connection is unavailable.", "error"));
    }
    if (section === "customers") {
      fetchAdminCustomers().then(setCustomers).catch((error) => toast(error instanceof Error ? error.message : "Unable to load customers. Database connection is unavailable.", "error"));
    }
  }, [section]);
  const searchCustomers = () => fetchAdminCustomers(customerQuery).then(setCustomers).catch((error) => toast(error instanceof Error ? error.message : "Unable to load customers. Database connection is unavailable.", "error"));
  const changeCustomerStatus = async (customer: AdminCustomer, status: AdminCustomer["status"]) => {
    try {
      const updated = await updateAdminCustomerStatus(customer.id, status);
      setCustomers((items) => items.map((item) => item.id === customer.id ? updated : item));
      toast("Customer status updated", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update customer.", "error");
    }
  };
  const removeCustomer = async (customer: AdminCustomer) => {
    try {
      await deleteAdminCustomer(customer.id);
      setCustomers((items) => items.filter((item) => item.id !== customer.id));
      toast("Customer deleted", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not delete customer.", "error");
    }
  };
  const addCatalogRow = async () => {
    const name = section === "brands" ? `New Brand ${Date.now()}` : `New Category ${Date.now()}`;
    try {
      const row = section === "brands" ? await createAdminBrand(name) : await createAdminCategory(name);
      setCatalogRows((items) => [row, ...items]);
      toast(`${title(section)} saved to backend`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : `Could not save ${title(section)}.`, "error");
    }
  };
  const removeCatalogRow = async (id: string) => {
    try {
      section === "brands" ? await deleteAdminBrand(id) : await deleteAdminCategory(id);
      toast(`${title(section)} deleted in backend`, "success");
      setCatalogRows((items) => items.filter((item) => item.id !== id));
    } catch (error) {
      toast(error instanceof Error ? error.message : `Could not delete ${title(section)}.`, "error");
    }
  };
  const pagedCatalogRows = usePagedItems(catalogRows);
  const pagedCustomers = usePagedItems(customers);
  const rows = section === "customers" ? ["Manav Shah", "Priya Sharma", "Arjun Mehta", "Riya Patel"] : section === "delivery" ? deliveryStaff : section === "payments" ? orders.map((o) => `${o.orderNumber} - ${o.paymentStatus}`) : products.slice(0, 6).map((p) => p.name);
  const pagedRows = usePagedItems(rows);
  if (section === "settings") return <AdminShell section={section}><Panel title="Settings"><div className="grid gap-4 md:grid-cols-3">{Object.entries(settings).map(([key, value]) => <label key={key} className="text-sm font-bold">{title(key)}<input value={value} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2" /></label>)}</div><Button variant="gold" className="mt-5" onClick={() => toast("Settings API will be enabled in the next backend phase", "info")}>Save settings</Button></Panel></AdminShell>;
  if (section === "categories" || section === "brands") return <AdminShell section={section}><Panel title={title(section)}><div className="mb-4 flex justify-end"><Button variant="gold" onClick={addCatalogRow}><Plus size={16} /> Add</Button></div>{pagedCatalogRows.items.map((c) => <div key={c.id} className="mb-3 flex items-center justify-between rounded-md bg-white p-3"><span className="font-bold">{c.name}</span><div className="flex gap-2"><Button variant="outline">Edit</Button><Button variant="ghost" onClick={() => removeCatalogRow(c.id)}>Delete</Button></div></div>)}<PaginationControls page={pagedCatalogRows.page} totalPages={pagedCatalogRows.totalPages} total={pagedCatalogRows.total} onPageChange={pagedCatalogRows.setPage} /></Panel></AdminShell>;
  if (section === "customers") {
    const totalSpent = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);
    const repeatCustomers = customers.filter((customer) => customer.orderCount > 1).length;
    const canManageCustomers = admin?.role?.name === "SUPER_ADMIN";
    const headers = canManageCustomers ? ["Customer", "Contact", "Status", "Orders", "Lifetime Spend", "Addresses", "Support", "Last Order", "Joined", "Actions"] : ["Customer", "Contact", "Status", "Orders", "Lifetime Spend", "Addresses", "Support", "Last Order", "Joined"];
    return <AdminShell section="customers"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Total customers" value={String(customers.length)} sub="Live database" /><Stat label="Active customers" value={String(customers.filter((customer) => customer.status === "ACTIVE").length)} sub="Can login" /><Stat label="Repeat customers" value={String(repeatCustomers)} sub="2+ orders" /><Stat label="Customer revenue" value={money(totalSpent)} sub="Lifetime" /></div><Panel title="Customers"><div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]"><input aria-label="Search customers" value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") searchCustomers(); }} className="rounded-md border px-3 py-2" placeholder="Search by name, email, or phone" /><Button variant="gold" onClick={searchCustomers}>Search</Button></div><DataTable headers={headers} minWidth={canManageCustomers ? "min-w-[1380px]" : "min-w-[1180px]"}>{pagedCustomers.items.map((customer) => <tr key={customer.id} className="border-b odd:bg-white even:bg-[#faf7ef]"><td className="p-3 align-middle font-bold">{customer.name}</td><td className="p-3 align-middle"><div>{customer.email || "-"}</div><div className="text-xs text-black/55">{customer.phone || "-"}</div></td><td className="p-3 align-middle"><StatusBadge value={customer.status === "ACTIVE" ? "Active" : customer.status === "INACTIVE" ? "Inactive" : "Blocked"} /></td><td className="p-3 align-middle">{customer.orderCount}</td><td className="p-3 align-middle">{money(customer.totalSpent)}</td><td className="p-3 align-middle">{customer.addressCount}</td><td className="p-3 align-middle">{customer.supportTicketCount}</td><td className="p-3 align-middle">{customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString("en-IN") : "-"}</td><td className="p-3 align-middle">{new Date(customer.createdAt).toLocaleDateString("en-IN")}</td>{canManageCustomers && <td className="w-[200px] p-3 align-middle"><CustomerActions customer={customer} onStatus={changeCustomerStatus} onDelete={removeCustomer} /></td>}</tr>)}</DataTable>{!customers.length && <p className="rounded-md bg-white p-4 text-sm text-black/60">No customers found in the database.</p>}<PaginationControls page={pagedCustomers.page} totalPages={pagedCustomers.totalPages} total={pagedCustomers.total} onPageChange={pagedCustomers.setPage} /></Panel></AdminShell>;
  }
  return <AdminShell section={section}><div className="grid gap-6 lg:grid-cols-3"><Panel title={title(section)}><div className="grid gap-3">{pagedRows.items.map((r) => <div key={r} className="rounded-md bg-white p-3 font-semibold">{r}</div>)}</div><PaginationControls page={pagedRows.page} totalPages={pagedRows.totalPages} total={pagedRows.total} onPageChange={pagedRows.setPage} /><Button className="mt-4" variant="gold" onClick={() => toast(`${title(section)} action will be enabled in the next backend phase`, "info")}>Primary action</Button></Panel><Panel title="Filters"><input className="w-full rounded-md border px-3 py-2" placeholder="Date range / search" /><Button className="mt-3" variant="outline" onClick={() => toast("Export will be enabled in the next backend phase", "info")}>Export placeholder</Button></Panel><Panel title="Insights"><Stat label="Records" value={String(rows.length)} sub="Mock state" /></Panel></div></AdminShell>;
}

function SupportAdmin() {
  const { toast, admin } = useStore();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { status: string; priority: string; adminNote: string; resolution: string }>>({});
  const load = () => fetchAdminSupportTickets({ status, priority, q: query }).then((items) => {
    setTickets(items);
    setDrafts(Object.fromEntries(items.map((ticket) => [ticket.id, { status: ticket.rawStatus || "OPEN", priority: ticket.priority, adminNote: ticket.adminNote || "", resolution: ticket.resolution || "" }])));
  }).catch((error) => toast(error instanceof Error ? error.message : "Unable to load support tickets.", "error"));
  useEffect(() => { load(); }, []);
  const stats = [
    ["Open", tickets.filter((ticket) => ticket.rawStatus === "OPEN").length],
    ["In progress", tickets.filter((ticket) => ticket.rawStatus === "IN_PROGRESS").length],
    ["Resolved", tickets.filter((ticket) => ticket.rawStatus === "RESOLVED").length],
    ["Urgent", tickets.filter((ticket) => ticket.priority === "URGENT").length],
  ];
  const updateDraft = (id: string, patch: Partial<{ status: string; priority: string; adminNote: string; resolution: string }>) => setDrafts((items) => ({ ...items, [id]: { ...items[id], ...patch } }));
  const save = async (ticket: SupportTicket, quickStatus?: string) => {
    const draft = drafts[ticket.id];
    setSavingId(ticket.id);
    try {
      const saved = await updateAdminSupportTicket(ticket.id, {
        status: quickStatus || draft.status,
        priority: draft.priority,
        adminNote: draft.adminNote,
        resolution: draft.resolution,
        assignedAdminId: quickStatus === "IN_PROGRESS" ? admin?.id : undefined,
      });
      setTickets((items) => items.map((item) => item.id === saved.id ? saved : item));
      updateDraft(saved.id, { status: saved.rawStatus || "OPEN", priority: saved.priority, adminNote: saved.adminNote || "", resolution: saved.resolution || "" });
      toast(`Ticket ${saved.ticketNumber} updated`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update support ticket.", "error");
    } finally {
      setSavingId("");
    }
  };
  const pagedTickets = usePagedItems(tickets);
  return <AdminShell section="support"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([label, value]) => <Stat key={String(label)} label={String(label)} value={String(value)} sub="Support" />)}</div><Panel title="Support Tickets"><div className="mb-5 grid gap-3 rounded-md bg-white p-4 md:grid-cols-[1fr_auto_auto_auto]"><input aria-label="Search support tickets" value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-md border px-3 py-2" placeholder="Search ticket, customer, order" /><select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border px-3 py-2"><option value="">All status</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In Progress</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select><select aria-label="Priority filter" value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-md border px-3 py-2"><option value="">All priority</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select><Button variant="gold" onClick={load}>Apply</Button></div><div className="grid gap-4">{pagedTickets.items.map((ticket) => { const draft = drafts[ticket.id] || { status: ticket.rawStatus || "OPEN", priority: ticket.priority, adminNote: ticket.adminNote || "", resolution: ticket.resolution || "" }; return <article key={ticket.id} className="rounded-md border border-[#eadfca] bg-white p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-bold uppercase text-[#8a6500]">{ticket.ticketNumber} {ticket.orderNumber ? `| ${ticket.orderNumber}` : ""}</p><h3 className="display-font mt-1 text-xl font-black">{ticket.subject}</h3><p className="mt-1 text-sm text-black/60">{ticket.customerName || ticket.name} {ticket.phone ? `| ${ticket.phone}` : ""} {ticket.email ? `| ${ticket.email}` : ""}</p></div><div className="flex gap-2"><StatusBadge value={ticket.status} /><StatusBadge value={ticket.priority} /></div></div><p className="mt-3 rounded-md bg-[#faf7ef] p-3 text-sm">{ticket.message}</p><div className="mt-4 grid gap-3 md:grid-cols-4"><label className="text-xs font-bold">Status<select value={draft.status} onChange={(e) => updateDraft(ticket.id, { status: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-2"><option value="OPEN">Open</option><option value="IN_PROGRESS">In Progress</option><option value="RESOLVED">Resolved</option><option value="CLOSED">Closed</option></select></label><label className="text-xs font-bold">Priority<select value={draft.priority} onChange={(e) => updateDraft(ticket.id, { priority: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-2"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label><label className="text-xs font-bold md:col-span-2">Admin note<input value={draft.adminNote} onChange={(e) => updateDraft(ticket.id, { adminNote: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-2" placeholder="Internal/customer-visible note" /></label><label className="text-xs font-bold md:col-span-4">Resolution<textarea value={draft.resolution} onChange={(e) => updateDraft(ticket.id, { resolution: e.target.value })} className="mt-1 min-h-20 w-full rounded-md border px-2 py-2" placeholder="Resolution details for customer" /></label></div><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => save(ticket, "IN_PROGRESS")} disabled={savingId === ticket.id}>Start</Button><Button variant="gold" onClick={() => save(ticket, "RESOLVED")} disabled={savingId === ticket.id}>Resolve</Button><Button variant="ghost" onClick={() => save(ticket)} disabled={savingId === ticket.id}>{savingId === ticket.id ? "Saving..." : "Save changes"}</Button></div></article>; })}{!tickets.length && <p className="rounded-md bg-white p-4 text-sm text-black/60">No support tickets match the current filters.</p>}</div><PaginationControls page={pagedTickets.page} totalPages={pagedTickets.totalPages} total={pagedTickets.total} onPageChange={pagedTickets.setPage} /></Panel></AdminShell>;
}

function ReturnsAdmin() {
  const { toast } = useStore();
  const [rows, setRows] = useState<AdminReturn[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [savingId, setSavingId] = useState("");
  const [refundDrafts, setRefundDrafts] = useState<Record<string, { amount: string; status: "REQUESTED" | "PROCESSING" | "COMPLETED" | "REJECTED" }>>({});
  const load = () => fetchAdminReturns({ q: query, status }).then(setRows).catch((error) => toast(error instanceof Error ? error.message : "Unable to load returns.", "error"));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    setRefundDrafts((current) => {
      const next = { ...current };
      rows.forEach((row) => {
        const refund = row.refunds?.[0];
        if (!next[row.id]) next[row.id] = { amount: String(Number(refund?.amount || row.order?.grandTotal || 0)), status: refund?.status || "REQUESTED" };
      });
      return next;
    });
  }, [rows]);
  const change = async (row: AdminReturn, nextStatus: AdminReturn["status"]) => {
    setSavingId(row.id);
    try {
      const saved = await updateAdminReturnStatus(row.id, nextStatus);
      setRows((items) => items.map((item) => item.id === row.id ? saved : item));
      toast("Return status updated", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update return.", "error");
    } finally {
      setSavingId("");
    }
  };
  const saveRefund = async (row: AdminReturn) => {
    const draft = refundDrafts[row.id];
    if (!draft) return;
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) return toast("Enter a valid refund amount.", "error");
    setSavingId(row.id);
    try {
      const saved = await updateAdminReturnRefund(row.id, { amount, status: draft.status });
      setRows((items) => items.map((item) => item.id === row.id ? saved : item));
      toast(draft.status === "COMPLETED" ? "Refund completed and inventory updated" : "Refund updated", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update refund.", "error");
    } finally {
      setSavingId("");
    }
  };
  const paged = usePagedItems(rows);
  const refundAmount = rows.reduce((sum, item) => sum + (item.refunds || []).reduce((inner, refund) => inner + Number(refund.amount || 0), 0), 0);
  return <AdminShell section="returns"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Return requests" value={String(rows.length)} sub="Database" /><Stat label="Requested" value={String(rows.filter((r) => r.status === "REQUESTED").length)} sub="Needs review" /><Stat label="Refunds completed" value={String(rows.filter((r) => r.refunds?.some((refund) => refund.status === "COMPLETED")).length)} sub="Settled" /><Stat label="Refund amount" value={money(refundAmount)} sub="Linked refunds" /></div><Panel title="Returns & Refunds"><div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto]"><input value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-md border px-3 py-2" placeholder="Search order, customer, phone, reason" /><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border px-3 py-2"><option value="">All statuses</option><option value="REQUESTED">Requested</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="COMPLETED">Completed</option></select><Button variant="gold" onClick={load}>Apply</Button></div><DataTable headers={["Order", "Customer", "Product", "Reason", "Bank Details", "Return", "Refund", "Action"]} minWidth="min-w-[1500px]">{paged.items.map((row) => { const draft = refundDrafts[row.id] || { amount: String(Number(row.refunds?.[0]?.amount || row.order?.grandTotal || 0)), status: row.refunds?.[0]?.status || "REQUESTED" }; return <tr key={row.id} className="border-b odd:bg-white even:bg-[#faf7ef]"><td className="p-3 font-bold">{row.order?.orderNumber || "-"}<div className="text-xs font-normal text-black/50">{new Date(row.createdAt).toLocaleDateString("en-IN")}</div></td><td className="p-3">{row.user?.name || "-"}<div className="text-xs text-black/50">{row.user?.phone || row.user?.email || ""}</div></td><td className="p-3">{row.orderItem?.product?.name || row.orderItem?.nameSnapshot || "Full order"}<div className="text-xs text-black/50">{row.orderItem?.quantity ? `${row.orderItem.quantity} units` : "All items"}</div></td><td className="p-3 max-w-sm">{row.reason}</td><td className="p-3 min-w-72"><div className="rounded-md border border-[#eadfca] bg-white p-3 text-sm"><b>{row.bankAccountHolder || "-"}</b><p>{row.bankName || "-"}</p><p>A/C: {row.bankAccountNumber || "-"}</p><p>IFSC: {row.bankIfsc || "-"}</p></div></td><td className="p-3"><StatusBadge value={row.status} /><select value={row.status} disabled={savingId === row.id} onChange={(e) => change(row, e.target.value as AdminReturn["status"])} className="mt-2 w-40 rounded-md border px-2 py-2"><option value="REQUESTED">Requested</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="COMPLETED">Received</option></select></td><td className="p-3"><div className="grid min-w-72 gap-2 md:grid-cols-[120px_150px]"><input value={draft.amount} onChange={(e) => setRefundDrafts((items) => ({ ...items, [row.id]: { ...draft, amount: e.target.value } }))} className="rounded-md border px-2 py-2" placeholder="Amount" /><select value={draft.status} onChange={(e) => setRefundDrafts((items) => ({ ...items, [row.id]: { ...draft, status: e.target.value as typeof draft.status } }))} className="rounded-md border px-2 py-2"><option value="REQUESTED">Requested</option><option value="PROCESSING">Processing</option><option value="COMPLETED">Completed</option><option value="REJECTED">Rejected</option></select></div>{row.refunds?.[0] && <p className="mt-2 text-xs text-black/55">Current: {money(Number(row.refunds[0].amount || 0))} · {row.refunds[0].status}</p>}</td><td className="p-3"><Button variant="gold" disabled={savingId === row.id} onClick={() => saveRefund(row)}>{savingId === row.id ? "Saving..." : "Save refund"}</Button></td></tr>; })}</DataTable>{!rows.length && <p className="rounded-md bg-white p-4 text-sm text-black/60">No return requests found in database.</p>}<PaginationControls page={paged.page} totalPages={paged.totalPages} total={paged.total} onPageChange={paged.setPage} /></Panel></AdminShell>;
}

function ReviewsAdmin() {
  const { toast } = useStore();
  const [rows, setRows] = useState<AdminReview[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [savingId, setSavingId] = useState("");
  const load = () => fetchAdminReviews({ q: query, status }).then(setRows).catch((error) => toast(error instanceof Error ? error.message : "Unable to load reviews.", "error"));
  useEffect(() => { load(); }, []);
  const change = async (row: AdminReview, nextStatus: AdminReview["status"]) => {
    setSavingId(row.id);
    try {
      await updateAdminReviewStatus(row.id, nextStatus);
      setRows((items) => items.map((item) => item.id === row.id ? { ...item, status: nextStatus } : item));
      toast("Review status updated", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update review.", "error");
    } finally {
      setSavingId("");
    }
  };
  const paged = usePagedItems(rows);
  const average = rows.length ? (rows.reduce((sum, row) => sum + row.rating, 0) / rows.length).toFixed(1) : "0";
  return <AdminShell section="reviews"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Reviews" value={String(rows.length)} sub="Database" /><Stat label="Pending" value={String(rows.filter((r) => r.status === "PENDING").length)} sub="Moderation" /><Stat label="Approved" value={String(rows.filter((r) => r.status === "APPROVED").length)} sub="Visible" /><Stat label="Average rating" value={average} sub="Filtered" /></div><Panel title="Reviews"><div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto]"><input value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-md border px-3 py-2" placeholder="Search product, customer, comment" /><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border px-3 py-2"><option value="">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select><Button variant="gold" onClick={load}>Apply</Button></div><DataTable headers={["Product", "Customer", "Rating", "Comment", "Status", "Created", "Action"]} minWidth="min-w-[1040px]">{paged.items.map((row) => <tr key={row.id} className="border-b odd:bg-white even:bg-[#faf7ef]"><td className="p-3 font-bold">{row.product?.name || "-"}</td><td className="p-3">{row.user?.name || "-"}<div className="text-xs text-black/50">{row.user?.email || row.user?.phone || ""}</div></td><td className="p-3 font-bold">{row.rating}/5</td><td className="p-3 max-w-md">{row.comment || "-"}</td><td className="p-3"><StatusBadge value={row.status} /></td><td className="p-3">{new Date(row.createdAt).toLocaleDateString("en-IN")}</td><td className="p-3"><select value={row.status} disabled={savingId === row.id} onChange={(e) => change(row, e.target.value as AdminReview["status"])} className="w-36 rounded-md border px-2 py-2"><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></td></tr>)}</DataTable>{!rows.length && <p className="rounded-md bg-white p-4 text-sm text-black/60">No product reviews found in database.</p>}<PaginationControls page={paged.page} totalPages={paged.totalPages} total={paged.total} onPageChange={paged.setPage} /></Panel></AdminShell>;
}

function AdminUsersPage() {
  const { toast } = useStore();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { status: AdminUserRow["status"]; roleId: string }>>({});
  const [savingId, setSavingId] = useState("");
  useEffect(() => {
    Promise.all([fetchAdminUsers(), fetchAdminRoles()])
      .then(([users, roleRows]) => {
        setRows(users);
        setRoles(roleRows);
        setDrafts(Object.fromEntries(users.map((user) => [user.id, { status: user.status, roleId: user.role.id }])));
      })
      .catch((error) => toast(error instanceof Error ? error.message : "Unable to load admin users.", "error"));
  }, [toast]);
  const updateDraft = (id: string, patch: Partial<{ status: AdminUserRow["status"]; roleId: string }>) => setDrafts((items) => ({ ...items, [id]: { ...items[id], ...patch } }));
  const save = async (row: AdminUserRow) => {
    const draft = drafts[row.id] || { status: row.status, roleId: row.role.id };
    setSavingId(row.id);
    try {
      const saved = await updateAdminUser(row.id, { status: draft.status, roleId: draft.roleId });
      setRows((items) => items.map((item) => item.id === saved.id ? saved : item));
      setDrafts((items) => ({ ...items, [saved.id]: { status: saved.status, roleId: saved.role.id } }));
      toast(`${saved.name} updated`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update admin user.", "error");
    } finally {
      setSavingId("");
    }
  };
  const paged = usePagedItems(rows);
  return <AdminShell section="users"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Admin users" value={String(rows.length)} sub="Database" /><Stat label="Active" value={String(rows.filter((row) => row.status === "ACTIVE").length)} sub="Can login" /><Stat label="Super admins" value={String(rows.filter((row) => row.role.name === "SUPER_ADMIN").length)} sub="Full access" /><Stat label="Roles" value={String(roles.length || new Set(rows.map((row) => row.role.name)).size)} sub="Database" /></div><Panel title="Admin Users"><DataTable headers={["Name", "Email", "Role", "Status", "Created", "Updated", "Action"]} minWidth="min-w-[1120px]">{paged.items.map((row) => { const draft = drafts[row.id] || { status: row.status, roleId: row.role.id }; const changed = draft.status !== row.status || draft.roleId !== row.role.id; return <tr key={row.id} className="border-b odd:bg-white even:bg-[#faf7ef]"><td className="p-3 font-bold">{row.name}</td><td className="p-3">{row.email}</td><td className="p-3"><select value={draft.roleId} onChange={(e) => updateDraft(row.id, { roleId: e.target.value })} className="w-56 rounded-md border px-2 py-2"><option value={row.role.id}>{row.role.name}</option>{roles.filter((role) => role.id !== row.role.id).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></td><td className="p-3"><div className="flex flex-wrap items-center gap-2"><StatusBadge value={row.status} /><select value={draft.status} onChange={(e) => updateDraft(row.id, { status: e.target.value as AdminUserRow["status"] })} className="w-32 rounded-md border px-2 py-2"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div></td><td className="p-3">{new Date(row.createdAt).toLocaleDateString("en-IN")}</td><td className="p-3">{new Date(row.updatedAt).toLocaleDateString("en-IN")}</td><td className="p-3"><Button variant={changed ? "gold" : "outline"} disabled={!changed || savingId === row.id} onClick={() => save(row)}>{savingId === row.id ? "Saving..." : "Save"}</Button></td></tr>; })}</DataTable>{!rows.length && <p className="rounded-md bg-white p-4 text-sm text-black/60">No admin users found.</p>}<PaginationControls page={paged.page} totalPages={paged.totalPages} total={paged.total} onPageChange={paged.setPage} /></Panel></AdminShell>;
}

function SettingsAdmin() {
  const { admin, refreshAdminProfile, updateAdminProfile, toast } = useStore();
  const [settings, setSettings] = useState<Record<string, string>>({ storeName: "Eagle Mart Grocery & Essentials", support: "support@eaglemart.in", supportEmail: "support@eaglemart.in", city: "Ahmedabad", defaultCity: "Ahmedabad", gstNumber: "24ABCDE1234F1Z5" });
  const savedProfile = useMemo(() => ({ name: admin?.name || "" }), [admin]);
  const [profile, setProfile] = useState(savedProfile);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [resettingProfile, setResettingProfile] = useState(false);
  useEffect(() => { fetchAdminSettings().then((items) => setSettings((current) => ({ ...current, ...Object.fromEntries(items.map((item) => [item.key, item.value])) }))).catch((error) => toast(error instanceof Error ? error.message : "Unable to load settings.", "error")); }, [toast]);
  useEffect(() => setProfile(savedProfile), [savedProfile]);
  const save = async () => {
    setSaving(true);
    try {
      const saved = await updateAdminSettings(settings);
      setSettings((current) => ({ ...current, ...Object.fromEntries(saved.map((item) => [item.key, item.value])) }));
      toast("Settings saved", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save settings.", "error");
    } finally {
      setSaving(false);
    }
  };
  const saveProfile = async () => {
    if (profile.name.trim().length < 2) return toast("Name must be at least 2 characters.", "error");
    setSavingProfile(true);
    try {
      await updateAdminProfile({ name: profile.name.trim() });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not update admin profile.", "error");
    } finally {
      setSavingProfile(false);
    }
  };
  const resetProfile = async () => {
    setResettingProfile(true);
    try {
      const nextAdmin = await refreshAdminProfile();
      setProfile({ name: nextAdmin.name || "" });
    } catch (error) {
      setProfile(savedProfile);
      toast(error instanceof Error ? error.message : "Could not reset admin profile from database.", "error");
    } finally {
      setResettingProfile(false);
    }
  };
  const resetSettings = async () => {
    setSaving(true);
    try {
      const saved = await resetAdminSettings();
      setSettings((current) => ({ ...current, ...Object.fromEntries(saved.map((item) => [item.key, item.value])) }));
      toast("Settings reset in database", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not reset settings.", "error");
    } finally {
      setSaving(false);
    }
  };
  const initials = (admin?.name || "AD").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const joined = admin?.createdAt ? new Date(admin.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "Recently";
  return <AdminShell section="settings"><div className="grid gap-5 xl:grid-cols-[330px_1fr]"><aside className="rounded-md border border-[#d8d1c2] bg-white p-6 text-center shadow-sm"><div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full border-4 border-[#ece7ff] bg-black text-5xl font-black text-[#d4af37] shadow-xl">{initials}</div><h2 className="display-font mt-5 text-2xl font-black">{resettingProfile ? profile.name || admin?.name || "Admin" : admin?.name || "Admin"}</h2><p className="text-sm text-black/55">{admin?.email}</p><div className="mt-6 rounded-md border border-[#d8d1c2] bg-[#faf7ef] p-4 text-left"><p className="text-xs font-black uppercase tracking-wide text-black/55">Admin ID</p><b>{admin?.id || "-"}</b><p className="mt-3 text-xs font-black uppercase tracking-wide text-black/55">Role</p><b>{admin?.role?.name || "-"}</b><p className="mt-3 text-xs font-black uppercase tracking-wide text-black/55">Status</p><b>{admin?.status || "ACTIVE"}</b></div></aside><section className="overflow-hidden rounded-md border border-[#d8d1c2] bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d8d1c2] p-5"><div><h2 className="display-font text-2xl font-black">Admin Profile</h2><p className="text-sm text-black/55">{resettingProfile ? "Resetting admin profile in database..." : "Update the logged-in admin profile from database."}</p></div><span className="rounded-full bg-[#efeaff] px-4 py-2 text-xs font-black text-[#4638d5]">ADMIN ID: {admin?.id?.slice(-8).toUpperCase()}</span></div><div className="grid gap-5 p-5 md:grid-cols-2"><label className="text-xs font-black uppercase tracking-wide text-black/65">Full name<input value={profile.name} onChange={(e) => setProfile({ name: e.target.value })} className="mt-2 w-full rounded-md border border-[#cfc4a6] bg-white px-4 py-3 text-base font-normal outline-none focus:border-[#d4af37]" /></label><label className="text-xs font-black uppercase tracking-wide text-black/65">Role<input value={admin?.role?.name || ""} readOnly className="mt-2 w-full rounded-md border border-[#eadfca] bg-[#f7f3ea] px-4 py-3 text-base font-normal text-black/60 outline-none" /></label><label className="text-xs font-black uppercase tracking-wide text-black/65">Email address<input value={admin?.email || ""} readOnly className="mt-2 w-full rounded-md border border-[#eadfca] bg-[#f7f3ea] px-4 py-3 text-base font-normal text-black/60 outline-none" /></label><div className="rounded-md border border-[#eadfca] bg-white p-4"><p className="text-xs font-black uppercase tracking-wide text-black/55">Security clearance</p><b>{admin?.status || "ACTIVE"}</b><p className="mt-1 text-sm text-black/50">Created {joined}</p></div></div><div className="flex flex-wrap justify-end gap-3 border-t border-[#d8d1c2] bg-[#f5f3ff] p-5"><Button variant="outline" disabled={savingProfile || resettingProfile} onClick={resetProfile}>{resettingProfile ? "Resetting..." : "Reset profile"}</Button><Button variant="gold" disabled={savingProfile || resettingProfile || profile.name === savedProfile.name} onClick={saveProfile}>{savingProfile ? "Saving..." : "Save changes"}</Button></div></section><div className="rounded-md border-l-4 border-l-[#4638d5] bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-black/55">Active since</p><h3 className="display-font mt-2 text-2xl font-black">{joined}</h3><p className="mt-2 text-sm text-[#4638d5]">{admin?.updatedAt ? `Updated ${new Date(admin.updatedAt).toLocaleDateString("en-IN")}` : "Database profile"}</p></div><div className="rounded-md border-l-4 border-l-[#4638d5] bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-black/55">Access scope</p><h3 className="display-font mt-2 text-2xl font-black">{admin?.role?.name || "ADMIN"}</h3><p className="mt-2 text-sm text-black/55">Role ID {admin?.role?.id || "-"}</p></div></div><Panel title="Store Settings"><div className="grid gap-4 md:grid-cols-3">{Object.entries(settings).map(([key, value]) => <label key={key} className="text-sm font-bold">{title(key)}<input value={value} onChange={(e) => setSettings((current) => ({ ...current, [key]: e.target.value }))} className="mt-1 w-full rounded-md border px-3 py-2" /></label>)}</div><div className="mt-5 flex flex-wrap gap-3"><Button variant="gold" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save settings"}</Button><Button variant="outline" onClick={resetSettings} disabled={saving}>{saving ? "Resetting..." : "Reset settings"}</Button></div></Panel></AdminShell>;
}

function Reports() {
  const { toast } = useStore();
  const [report, setReport] = useState<AdminReport | null>(null);
  useEffect(() => { fetchAdminReports().then(setReport).catch((error) => toast(error instanceof Error ? error.message : "Unable to load reports.", "error")); }, [toast]);
  const summary = report?.summary || {};
  return <AdminShell section="reports"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Sales" value={money(summary.sales || 0)} sub="All database orders" /><Stat label="Orders" value={String(summary.orders || 0)} sub={`${summary.delivered || 0} delivered`} /><Stat label="Paid orders" value={String(summary.paid || 0)} sub={`${summary.codPending || 0} COD pending`} /><Stat label="Catalog" value={`${summary.products || 0}`} sub={`${summary.categories || 0} categories`} /></div><div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.25fr]"><Panel title="Product-wise Sales">{(report?.productSales || []).map((p) => <div key={p.name} className="flex justify-between gap-3 border-b py-2"><span>{p.name}</span><b>{p.units} units | {money(p.amount)}</b></div>)}{!report?.productSales.length && <p className="text-sm text-black/60">No product sales found.</p>}</Panel><Panel title="Category-wise Sales"><CategorySalesPanel rows={(report?.categorySales || []).map((category) => ({ label: category.name, value: category.amount, units: category.units }))} /></Panel><Panel title="Payment Split">{(report?.paymentSplit || []).map((item) => <div key={item.name} className="flex justify-between border-b py-2"><span>{item.name}</span><b>{item.count} orders</b></div>)}</Panel><Panel title="Delivery Performance">{(report?.deliveryStaff || []).map((staff) => <div key={staff.id} className="grid gap-2 border-b py-3"><div className="flex justify-between gap-3"><span className="font-bold">{staff.name}</span><b>{staff.assignments} assignments</b></div><div className="grid gap-2 text-sm sm:grid-cols-3"><span className="rounded-md bg-green-50 px-3 py-2 font-bold text-green-800">Delivered: {staff.delivered || 0}</span><span className="rounded-md bg-[#fff8df] px-3 py-2 font-bold text-[#8a6500]">Pending: {staff.pending || 0}</span><span className="rounded-md bg-red-50 px-3 py-2 font-bold text-red-700">Not successful: {staff.failed || 0}</span></div></div>)}{!report?.deliveryStaff.length && <p className="text-sm text-black/60">No active delivery staff found.</p>}</Panel></div></AdminShell>;
}

function AdminLoginForm() {
  const { loginAdmin, verifyAdminMfa } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (challengeId) {
      if (!mfaCode.trim()) return setError("Verification code is required.");
      setLoading(true);
      try {
        const nextAdmin = await verifyAdminMfa({ challengeId, code: mfaCode.trim() });
        router.push(roleLandingPath(nextAdmin.role?.name));
      } catch (loginError) {
        setError(loginError instanceof Error ? loginError.message : "MFA verification failed.");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid admin email.");
    if (!password) return setError("Password is required.");
    setLoading(true);
    try {
      const nextAdmin = await loginAdmin({ email, password });
      if ("mfaRequired" in nextAdmin) {
        setChallengeId(nextAdmin.challengeId);
        setPassword("");
        return;
      }
      router.push(roleLandingPath(nextAdmin.role?.name));
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Admin login failed.");
    } finally {
      setLoading(false);
    }
  };
  return <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] p-4 text-white"><section className="w-full max-w-md rounded-md border border-[#d4af37]/20 bg-[#20201f]/95 p-8 shadow-2xl"><Logo invert /><div className="mt-8 text-center"><ShieldCheck className="mx-auto text-[#e7c766]" size={44} /><h1 className="display-font mt-4 text-2xl font-black text-[#e7c766]">Eagle Mart Admin Portal</h1><p className="mt-2 text-sm text-white/60">{challengeId ? "Enter your verification code" : "Secure access for store operations"}</p></div><form onSubmit={submit} className="mt-8 grid gap-4">{!challengeId ? <><input aria-label="Admin email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-md border border-white/10 bg-black px-3 py-3 outline-none focus:border-[#d4af37]" placeholder="Admin email" type="email" /><div className="relative"><input aria-label="Admin password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-white/10 bg-black px-3 py-3 pr-12 outline-none focus:border-[#d4af37]" placeholder="Admin password" type={show ? "text" : "password"} /><button type="button" aria-label="Toggle admin password visibility" onClick={() => setShow(!show)} className="absolute right-3 top-3 text-white/60">{show ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></> : <><input aria-label="Admin verification code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\s/g, "").slice(0, 16))} className="rounded-md border border-white/10 bg-black px-3 py-3 text-center text-xl tracking-[0.35em] outline-none focus:border-[#d4af37]" placeholder="000000" inputMode="numeric" /><Button type="button" variant="outline" onClick={() => { setChallengeId(""); setMfaCode(""); }}>Back</Button></>}{error && <p className="rounded-md bg-red-500/15 p-3 text-sm text-red-200">{error}</p>}<Button variant="gold" disabled={loading}>{loading ? "Loading..." : challengeId ? "Verify" : "Login"}</Button></form><p className="mt-6 text-center text-xs uppercase text-white/40">Authorized personnel only</p></section></div>;
}

function Login() {
  return <StoreProvider><AdminLoginForm /></StoreProvider>;
}

function DataTable({ headers, children, minWidth = "min-w-[760px]" }: { headers: string[]; children: React.ReactNode; minWidth?: string }) {
  return <div className="responsive-scroll -mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0"><table className={`w-full ${minWidth} border-collapse text-left text-sm`}><thead className="bg-black text-white"><tr>{headers.map((h) => <th key={h} className="whitespace-nowrap p-3 align-middle">{h}</th>)}</tr></thead><tbody>{children}</tbody></table><p className="scroll-hint mt-2 sm:hidden">Swipe or drag sideways to view all columns.</p></div>;
}

function AdminPageSwitch({ slug }: { slug: string[] }) {
  const [first, second, third] = slug;
  if (!first) return <Dashboard />;
  if (first === "products" && second === "new") return <ProductManager mode="new" />;
  if (first === "products" && third === "edit") return <ProductManager mode="edit" id={second} />;
  if (first === "products") return <ProductManager />;
  if (first === "inventory") return <Inventory productId={second} />;
  if (first === "orders") return <Orders detail={second} />;
  if (first === "coupons") return <CouponsManaged />;
  if (first === "brands" || first === "categories") return <CatalogManager section={first} />;
  if (first === "faqs") return <AdminFaqsPage />;
  if (first === "payments") return <AdminPayments />;
  if (first === "invoices") return <BillingInvoices />;
  if (first === "delivery") return <DeliveryAdmin />;
  if (first === "support") return <SupportAdmin />;
  if (first === "returns") return <ReturnsAdmin />;
  if (first === "reviews") return <ReviewsAdmin />;
  if (first === "reports") return <Reports />;
  if (first === "users") return <AdminUsersPage />;
  if (first === "settings") return <SettingsAdmin />;
  return <GenericAdmin section={first} />;
}

function AuthenticatedAdminRouter({ slug }: { slug: string[] }) {
  const { admin, adminReady } = useStore();
  const router = useRouter();
  const [first, second, third] = slug;
  const section = first || "";
  const role = admin?.role?.name;
  const landingPath = roleLandingPath(role);
  const allowed = canAdminAccess(role, section)
    && (!(first === "products" && (second === "new" || third === "edit")) || canManageCatalog(role));
  useEffect(() => {
    if (!adminReady) return;
    if (!admin) {
      router.replace("/admin/login");
      return;
    }
    if (section === "" && landingPath !== "/admin") {
      router.replace(landingPath);
      return;
    }
    if (!allowed) router.replace(landingPath);
  }, [adminReady, admin, allowed, landingPath, section, router]);
  if (!adminReady) return <div className="flex min-h-screen items-center justify-center bg-black text-white">Loading admin session...</div>;
  if (!admin) return <div className="flex min-h-screen items-center justify-center bg-black text-white">Redirecting to admin login...</div>;
  if (section === "" && landingPath !== "/admin") return <div className="flex min-h-screen items-center justify-center bg-[#f7f4ec] p-6 text-center font-bold text-black/70">Opening your workspace...</div>;
  if (!allowed) return <div className="flex min-h-screen items-center justify-center bg-[#f7f4ec] p-6 text-center font-bold text-black/70">Redirecting to your dashboard...</div>;
  return <AdminPageSwitch slug={slug} />;
}

function Router({ slug }: { slug: string[] }) {
  const [first] = slug;
  if (first === "login") return <Login />;
  return <StoreProvider><AuthenticatedAdminRouter slug={slug} /></StoreProvider>;
}

export function AdminApp({ slug }: { slug: string[] }) {
  return <Router slug={slug} />;
}



