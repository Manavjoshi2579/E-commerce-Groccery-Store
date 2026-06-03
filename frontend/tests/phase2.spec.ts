import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
});

test("customer search, filters, wishlist, cart quantity, and coupons work", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder("Search atta, milk, fruits, vegetables...").fill("milk");
  await page.getByPlaceholder("Search atta, milk, fruits, vegetables...").press("Enter");
  await expect(page).toHaveURL(/\/search\?q=milk/);
  await expect(page.getByText("Amul Taaza Milk 1L")).toBeVisible();

  await page.getByLabel("Search products").fill("butter");
  await expect(page.getByText("Amul Butter 500g")).toBeVisible();

  await page.locator('button[aria-label="Wishlist"]').first().click();
  await page.getByLabel(/Add Amul Butter 500g/).click();
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your Cart" })).toBeVisible();
  await page.getByLabel("Increase quantity").first().click();
  await page.getByPlaceholder("Coupon").fill("WELCOME100");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("WELCOME100 applied")).toBeVisible();
  await page.getByPlaceholder("Coupon").fill("NOTREAL");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Invalid coupon code")).toBeVisible();
});

test("checkout creates COD order and exposes success, invoice, tracking, and reorder", async ({ page }) => {
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Delivery date").fill("2026-06-05");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Cash on Delivery").click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Place Order" }).click();
  await expect(page.getByRole("heading", { name: "Order Confirmed" })).toBeVisible();

  const orderText = await page.getByText(/Order number EC-/).textContent();
  const orderNumber = orderText?.match(/EC-[A-Z0-9]+/)?.[0];
  expect(orderNumber).toBeTruthy();

  await page.goto(`/invoice/${orderNumber}`);
  await expect(page.getByRole("heading", { name: "Invoice" })).toBeVisible();
  await page.goto(`/track-order/${orderNumber}`);
  await expect(page.getByRole("heading", { name: `Track Order ${orderNumber}` })).toBeVisible();
  await page.goto("/orders");
  await expect(page.getByText(orderNumber!)).toBeVisible();
  await page.getByRole("button", { name: /Reorder/ }).first().click();
  await expect(page.getByText("Order items added to cart")).toBeVisible();
});

test("razorpay failure keeps cart and success creates order", async ({ page }) => {
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Razorpay UPI/Card/Net Banking").click();
  await page.getByRole("button", { name: "Simulate payment failure" }).click();
  await expect(page.getByRole("heading", { name: "Payment Failed" })).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByText("Price Summary")).toBeVisible();

  await page.goto("/checkout");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Razorpay UPI/Card/Net Banking").click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Place Order" }).click();
  await expect(page.getByRole("heading", { name: "Order Confirmed" })).toBeVisible();
});

test("admin product, order status, delivery staff, and coupon flows work", async ({ page }) => {
  await page.goto("/admin/products/new");
  await page.getByLabel("Name").fill("QA Premium Almonds");
  await page.getByLabel("Sku").fill("EC-QA-ALMOND");
  await page.getByLabel("Brand").fill("Eagleclub Select");
  await page.getByLabel("Category").fill("Organic Store");
  await page.getByLabel("Unit").fill("500 g");
  await page.getByRole("button", { name: "Save Product" }).click();
  await page.goto("/admin/products");
  await expect(page.getByText("QA Premium Almonds")).toBeVisible();
  await page.goto("/products");
  await expect(page.getByText("QA Premium Almonds")).toBeVisible();

  await page.goto("/admin/orders/EC-9481");
  await page.getByRole("button", { name: "Confirmed" }).click();
  await page.getByRole("button", { name: "Rohan Patel" }).click();
  await expect(page.getByText("Rohan Patel assigned")).toBeVisible();
  await page.goto("/track-order/EC-9481");
  await expect(page.getByText("Confirmed")).toBeVisible();

  await page.goto("/admin/coupons");
  await page.getByLabel("Coupon code").fill("QA50");
  await page.getByLabel("Coupon title").fill("QA coupon");
  await page.getByLabel("Coupon value").fill("50");
  await page.getByRole("button", { name: "Add coupon" }).click();
  await page.goto("/cart");
  await page.getByPlaceholder("Coupon").fill("QA50");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("QA50 applied")).toBeVisible();
});

test("required customer and admin routes render", async ({ page }) => {
  const routes = [
    "/", "/products", "/search", "/category/fruits-vegetables", "/product/amul-taaza-milk-1l", "/cart", "/wishlist",
    "/checkout", "/order-success/EC-9480", "/payment-failed", "/track-order/EC-9480", "/orders", "/invoice/EC-9480",
    "/login", "/signup", "/forgot-password", "/reset-password", "/account", "/account/profile", "/account/addresses",
    "/account/orders", "/account/wishlist", "/account/invoices", "/account/support", "/about", "/contact", "/faq",
    "/privacy", "/terms", "/return-policy", "/delivery-policy", "/admin/login", "/admin", "/admin/products",
    "/admin/products/new", "/admin/products/prd-1/edit", "/admin/categories", "/admin/brands", "/admin/inventory",
    "/admin/orders", "/admin/orders/EC-9480", "/admin/customers", "/admin/coupons", "/admin/payments", "/admin/invoices",
    "/admin/delivery", "/admin/returns", "/admin/reviews", "/admin/reports", "/admin/users", "/admin/settings",
  ];

  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("404");
  }
});
