import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
});

async function loginSeededCustomer(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email or phone").fill("customer@eagleclub.in");
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("Customer@12345");
  await page.getByRole("button", { name: "Toggle password visibility" }).click();
  await expect(page.getByRole("textbox", { name: "Password", exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Toggle password visibility" }).click();
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByLabel("Account menu")).toContainText("Manav");
  await clearBackendCart(page);
}

async function clearBackendCart(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    await fetch("http://localhost:4000/api/cart", { method: "DELETE", credentials: "include" });
  });
}

async function loginSuperAdmin(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Admin email").fill("superadmin@eagleclub.in");
  await page.getByRole("textbox", { name: "Admin password" }).fill("Eagleclub@12345");
  await page.getByRole("button", { name: "Toggle admin password visibility" }).click();
  await expect(page.getByRole("textbox", { name: "Admin password" })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Toggle admin password visibility" }).click();
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("customer search, filters, wishlist, cart quantity, and coupons work", async ({ page }) => {
  await loginSeededCustomer(page);
  await page.goto("/");
  await expect(page.getByLabel("Account menu")).toContainText("Manav");
  await page.getByPlaceholder("Search atta, milk, fruits, vegetables...").fill("milk");
  await page.getByPlaceholder("Search atta, milk, fruits, vegetables...").press("Enter");
  await expect(page).toHaveURL(/\/search\?q=milk/);
  await expect(page.getByText("Amul Taaza Milk 1L")).toBeVisible();

  await page.getByLabel("Search products").fill("milk");
  await expect(page.getByText("Amul Taaza Milk 1L")).toBeVisible();

  await page.locator('button[aria-label="Wishlist"]').first().click();
  await page.locator('button[aria-label^="Add "]:not([disabled])').first().click();
  await expect(page.getByText("Added to cart")).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your Cart", exact: true })).toBeVisible();
  for (let index = 0; index < 7; index += 1) {
    await page.getByLabel("Increase quantity").first().click();
  }
  await page.getByPlaceholder("Coupon").fill("FREESHIP");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("FREESHIP applied")).toBeVisible();
  await page.getByPlaceholder("Coupon").fill("NOTREAL");
  await page.getByRole("button", { name: "Apply" }).click({ force: true });
  await expect(page.getByText("Invalid coupon code")).toBeVisible();

  await page.goto("/search?q=Bannana");
  await expect(page.getByText("Banana 1 dozen")).toBeVisible();
});

test("anonymous users must login before adding to cart", async ({ page }) => {
  await page.goto("/");
  await page.locator('button[aria-label^="Add "]:not([disabled])').first().click();
  await expect(page.getByText("Please login first to continue shopping.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("phase 8.1 header auth navigation and pincode UX work", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header").first();
  await expect(header.getByText("Login / Signup")).toBeVisible();
  await expect(header).not.toContainText("Fruits & Vegetables");
  await expect(header).not.toContainText("Dairy");

  const hero = page.locator("main, section").filter({ hasText: "India's Finest Grocery Experience" }).first();
  await hero.getByLabel("Delivery pincode").fill("380015");
  await hero.getByRole("button", { name: "Check" }).click();
  await expect(hero.getByText(/Delivery available|Pincode is serviceable/)).toBeVisible();

  await page.getByLabel("Account menu").click();
  await page.getByText("Customer Login").click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Eagle Mart Admin Portal" })).toBeVisible();

  await page.goto("/");
  await page.locator("header").first().getByRole("link", { name: "Wishlist" }).click();
  await expect(page).toHaveURL(/\/wishlist/);
  await page.goto("/");
  await page.locator("header").first().getByRole("link", { name: "Cart" }).click();
  await expect(page).toHaveURL(/\/cart/);
});

test("homepage category showcase shows all departments and no legacy brand text", async ({ page }) => {
  await page.goto("/");
  for (const category of [
    "Fruits & Vegetables", "Dairy, Bread & Eggs", "Atta, Rice & Dal", "Masala & Oil", "Snacks & Beverages",
    "Packaged Food", "Household Essentials", "Personal Care", "Organic Store", "Baby Care",
  ]) {
    await expect(page.getByText(category).first()).toBeVisible();
  }
  await expect(page.locator("body")).not.toContainText(/Eagleclub|Eagle Club|FreshKart|Demo Store|Template Store/);
  const internalTargets = await page.locator('a[target="_blank"][href^="/"], a[target="_blank"][href^="http://localhost"], a[target="_blank"][href^="http://127.0.0.1"]').count();
  expect(internalTargets).toBe(0);
  const opensInternalTabs = await page.evaluate(() => Array.from(document.scripts).some((script) => /window\.open\((['"`])\//.test(script.textContent || "")));
  expect(opensInternalTabs).toBe(false);
});

test("account dropdown appears after real customer login", async ({ page }) => {
  await loginSeededCustomer(page);
  await expect(page.getByText("Customer dashboard")).toBeVisible();
  await expect(page.getByText("Active order timeline")).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Coupons" })).toBeVisible();
  await page.getByLabel("Account menu").click();
  await expect(page.getByText("Manav Shah", { exact: true })).toBeVisible();
  await expect(page.getByRole("group").getByRole("link", { name: "My Account" })).toBeVisible();
});

test("customer signup creates a usable session and wrong password shows an error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email or phone").fill("customer@eagleclub.in");
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("WrongPassword");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();

  const suffix = Date.now().toString();
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Browser Signup User");
  await page.getByLabel("Email or phone").fill(`browser-${suffix}@example.com`);
  await page.getByRole("textbox", { name: "Phone", exact: true }).fill(`98${suffix.slice(-8)}`);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("Customer@12345");
  await page.getByLabel("Confirm password").fill("Mismatch@12345");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
  await page.getByLabel("Confirm password").fill("Customer@12345");
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.getByLabel("Account menu").click();
  await expect(page.getByText("Browser Signup User")).toBeVisible();

  await page.goto("/account/addresses");
  await page.getByRole("button", { name: /Add address/ }).first().click();
  await page.getByLabel("Address label").fill("QA Home");
  await page.getByLabel("Receiver name").fill("Browser Signup User");
  await page.getByLabel("Receiver phone").fill("9876543211");
  await page.getByRole("textbox", { name: "Pincode", exact: true }).fill("380015");
  await page.getByLabel("Address line").fill("QA Tower, Satellite Road");
  await page.getByLabel("City").fill("Ahmedabad");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText("QA Tower, Satellite Road")).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Address line").fill("QA Tower Updated, Satellite Road");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page.getByText("QA Tower Updated, Satellite Road")).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("QA Tower Updated, Satellite Road")).not.toBeVisible();
});

test("admin wrong password is rejected and active seeded roles can login", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Admin email").fill("superadmin@eagleclub.in");
  await page.getByRole("textbox", { name: "Admin password" }).fill("WrongPassword");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();

  const admins = [
    ["superadmin@eagleclub.in", /\/admin$/],
    ["store.manager@eagleclub.in", /\/admin\/products/],
    ["inventory@eagleclub.in", /\/admin\/inventory/],
    ["orders@eagleclub.in", /\/admin\/orders/],
    ["delivery@eagleclub.in", /\/admin\/delivery/],
    ["billing@eagleclub.in", /\/admin\/payments/],
  ] as const;
  for (const [email, landing] of admins) {
    await page.goto("/admin/login");
    await page.getByLabel("Admin email").fill(email);
    await page.getByRole("textbox", { name: "Admin password" }).fill("Eagleclub@12345");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL(landing);
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
  }
});

test("customer and admin login show API database errors without fake success", async ({ page }) => {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { message: "Database connection failed. Please check backend database configuration." } }),
    });
  });
  await page.goto("/login");
  await page.getByLabel("Email or phone").fill("customer@eagleclub.in");
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("Customer@12345");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText("Database connection failed. Please check backend database configuration.")).toBeVisible();
  await expect(page).not.toHaveURL(/\/account/);

  await page.unroute("**/api/auth/login");
  await page.route("**/api/admin/auth/login", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: { message: "Database connection failed. Please check backend database configuration." } }),
    });
  });
  await page.goto("/admin/login");
  await page.getByLabel("Admin email").fill("superadmin@eagleclub.in");
  await page.getByRole("textbox", { name: "Admin password" }).fill("Eagleclub@12345");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText("Database connection failed. Please check backend database configuration.")).toBeVisible();
  await expect(page).not.toHaveURL(/\/admin$/);
});

test("checkout creates COD order and exposes success, invoice, tracking, and reorder", async ({ page }) => {
  await loginSeededCustomer(page);
  await page.goto("/");
  await expect(page.getByLabel("Account menu")).toContainText("Manav");
  await page.locator('button[aria-label^="Add "]:not([disabled])').first().click();
  await expect(page.getByText("Added to cart")).toBeVisible();
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Delivery date").fill("2026-06-05");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: /^Cash on Delivery/ }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Place COD Order" }).click();
  await expect(page.getByRole("heading", { name: "Order Confirmed" })).toBeVisible();

  const orderText = await page.getByText(/Order number EC-/).textContent();
  const orderNumber = orderText?.match(/EC-[A-Z0-9]+/)?.[0];
  expect(orderNumber).toBeTruthy();

  await page.goto(`/invoice/${orderNumber}`);
  await expect(page.getByText("TAX INVOICE")).toBeVisible();
  await expect(page.getByRole("button", { name: "Print Invoice" })).toBeVisible();
  await page.goto(`/track-order/${orderNumber}`);
  await expect(page.getByRole("heading", { name: `Track Order ${orderNumber}` })).toBeVisible();
  await page.goto("/orders");
  await expect(page.getByText(orderNumber!)).toBeVisible();
  await page.getByRole("button", { name: /Reorder/ }).first().click();
  await expect(page.getByText("Order items added to cart")).toBeVisible();
});

test("razorpay option is selectable and COD still creates order", async ({ page }) => {
  await loginSeededCustomer(page);
  await page.goto("/");
  await expect(page.getByLabel("Account menu")).toContainText("Manav");
  await page.locator('button[aria-label^="Add "]:not([disabled])').first().click();
  await expect(page.getByText("Added to cart")).toBeVisible();
  await page.goto("/checkout");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Razorpay Online Payment")).toBeVisible();
  await page.getByRole("button", { name: /^Razorpay Online Payment/ }).click();
  await expect(page.getByRole("button", { name: /Pay Securely/ })).toBeVisible();
  await page.getByRole("button", { name: /^Cash on Delivery/ }).click();
  await page.goto("/payment-failed?orderNumber=EC-TEST&reason=Payment%20failed");
  await expect(page.getByRole("heading", { name: "Payment Failed" })).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByText("Price Summary")).toBeVisible();

  await page.goto("/checkout");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Place COD Order" }).click();
  await expect(page.getByRole("heading", { name: "Order Confirmed" })).toBeVisible();
});

test("admin product, order status, delivery staff, and coupon flows work", async ({ page }) => {
  await loginSuperAdmin(page);
  for (const item of ["Dashboard", "Products", "Categories", "Brands", "Inventory", "Orders", "Customers", "Support", "FAQs", "Coupons", "Payments", "Invoices", "Delivery", "Returns", "Reviews", "Reports", "Admin Users", "Settings"]) {
    await expect(page.getByRole("link", { name: item, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Today's revenue", { exact: true })).toBeVisible();
  await expect(page.getByText("COD pending amount")).toBeVisible();
  const suffix = Date.now().toString().slice(-6);
  const productName = `QA Premium Almonds ${suffix}`;
  await page.goto("/admin/brands");
  await page.getByLabel("Brand name").fill(`QA Brand ${suffix}`);
  await page.getByRole("button", { name: "Add Brand", exact: true }).click();
  await expect(page.getByText("Brand saved successfully")).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Brand name").fill(`QA Brand ${suffix} Updated`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`QA Brand ${suffix} Updated`)).toBeVisible();
  await page.goto("/admin/products/new");
  await page.getByLabel("Name").fill(productName);
  await page.getByRole("textbox", { name: "Sku", exact: true }).fill(`EC-QA-${suffix}`);
  await page.getByLabel("Brand").selectOption({ label: "Eagle Mart Select" });
  await page.getByLabel("Category").selectOption({ label: "Organic Store" });
  await page.getByLabel("Variant 1 unit").selectOption("500 g");
  await page.getByLabel("Variant 1 MRP").fill("650");
  await page.getByLabel("Variant 1 price").fill("499");
  await page.getByLabel("Variant 1 stock").fill("25");
  await page.getByRole("button", { name: "Save Product" }).click();
  await expect(page.getByText("Product saved successfully")).toBeVisible();
  await page.goto("/admin/products");
  await expect(page.getByText(productName)).toBeVisible();
  await page.goto("/products");
  await expect(page.getByText(productName)).toBeVisible();

  await page.goto("/admin/orders/EC-DEMO-1002");
  let expectedOrderStatus = "";
  for (const status of ["Confirmed", "Packed", "Out for Delivery", "Delivered"] as const) {
    const button = page.getByRole("button", { name: status, exact: true });
    if (await button.isEnabled().catch(() => false)) {
      await button.click();
      await expect(page.getByText("Order status saved to backend")).toBeVisible();
      expectedOrderStatus = status;
      break;
    }
  }
  const rohanButton = page.getByRole("button", { name: "Rohan Patel", exact: true });
  if (await rohanButton.isEnabled().catch(() => false)) {
    await rohanButton.click();
    await expect(page.getByText("Rohan Patel assigned to backend")).toBeVisible();
  }
  await page.goto("/admin/inventory");
  await expect(page.getByRole("heading", { name: "Inventory", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "+10" }).first().click();
  await page.goto("/admin/invoices");
  await expect(page.getByText("Billing & Invoices")).toBeVisible();
  await expect(page.getByText("Total Billed")).toBeVisible();
  await loginSeededCustomer(page);
  await page.goto("/track-order/EC-DEMO-1002");
  if (expectedOrderStatus) await expect(page.getByText(expectedOrderStatus)).toBeVisible();

  await page.goto("/admin/coupons");
  const couponCode = `QA${suffix}`;
  await page.getByLabel("Coupon code").fill(couponCode);
  await page.getByLabel("Coupon title").fill("QA coupon");
  await page.getByLabel("Coupon value").fill("50");
  await page.getByRole("button", { name: "Add coupon" }).click();
  await expect(page.getByText("Coupon saved successfully")).toHaveCount(1);
  await page.getByRole("button", { name: "Logout" }).click();
  await loginSeededCustomer(page);
  await page.goto("/");
  await page.locator('button[aria-label^="Add "]:not([disabled])').first().click();
  await page.locator('button[aria-label^="Add "]:not([disabled])').first().click();
  await expect(page.getByText("Added to cart")).toBeVisible();
  await page.goto("/cart");
  await page.getByPlaceholder("Coupon").fill(couponCode);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(`${couponCode} applied`)).toBeVisible();
});

test("customer FAQ search, categories, accordion, and mobile layout work", async ({ page }) => {
  await page.goto("/faq");
  await expect(page.getByRole("heading", { name: "Frequently Asked Questions" })).toBeVisible();
  await expect(page.getByText("All FAQs")).toBeVisible();
  await page.getByLabel("Search FAQs").fill("refund");
  await expect(page.getByText(/answers found/)).toBeVisible();
  await expect(page.getByText("When will I receive my refund?")).toBeVisible();
  await page.locator("section").getByRole("button", { name: "Payments", exact: true }).first().click();
  await expect(page.getByText("No FAQ found")).toBeVisible();
  await page.locator("section").getByRole("button", { name: "Returns & Refunds", exact: true }).first().click();
  await expect(page.getByText("When will I receive my refund?")).toBeVisible();
  await page.getByText("When will I receive my refund?").click();
  await expect(page.getByText("Refunds are generally processed within a few business days after approval.")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Search FAQs")).toBeVisible();
  await expect(page.getByRole("button", { name: "Orders", exact: true })).toBeVisible();
});

test("admin FAQ create, edit, disable, bulk enable, and delete work", async ({ page }) => {
  await loginSuperAdmin(page);
  const suffix = Date.now().toString().slice(-6);
  const question = `QA FAQ question ${suffix}?`;
  const editedQuestion = `QA FAQ edited ${suffix}?`;
  await page.goto("/admin/faqs");
  await expect(page.getByRole("heading", { name: "Faqs", level: 1 })).toBeVisible();
  await page.getByLabel("FAQ question", { exact: true }).fill(question);
  await page.getByLabel("FAQ answer").fill("This is a QA FAQ answer for automated validation.");
  await page.getByLabel("FAQ category").selectOption("General");
  await page.getByLabel("FAQ sort order").fill("99");
  await page.getByRole("button", { name: "Create FAQ" }).click();
  await expect(page.getByText("FAQ saved successfully")).toBeVisible();
  await page.getByLabel("Search admin FAQs").fill(question);
  await expect(page.getByText(question)).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("FAQ question", { exact: true }).fill(editedQuestion);
  await page.getByRole("button", { name: "Save FAQ" }).click();
  await page.getByLabel("Search admin FAQs").fill(editedQuestion);
  await expect(page.getByText(editedQuestion)).toBeVisible();
  await page.getByRole("button", { name: "Disable" }).first().click();
  await page.goto("/faq");
  await page.getByLabel("Search FAQs").fill(editedQuestion);
  await expect(page.getByText(editedQuestion)).not.toBeVisible();
  await page.goto("/admin/faqs");
  await page.getByLabel("Search admin FAQs").fill(editedQuestion);
  await page.getByLabel(`Select ${editedQuestion}`).check();
  await page.getByRole("button", { name: "Bulk enable" }).click();
  await expect(page.getByText("Selected FAQs enabled")).toBeVisible();
  await page.goto("/faq");
  await page.getByLabel("Search FAQs").fill(editedQuestion);
  await expect(page.getByText(editedQuestion)).toBeVisible();
  await page.goto("/admin/faqs");
  await page.getByLabel("Search admin FAQs").fill(editedQuestion);
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByText("FAQ deleted successfully")).toBeVisible();
  await expect(page.getByText(editedQuestion)).not.toBeVisible();
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
    "/admin/delivery", "/admin/returns", "/admin/reviews", "/admin/reports", "/admin/faqs", "/admin/users", "/admin/settings",
  ];

  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("404");
  }
});
