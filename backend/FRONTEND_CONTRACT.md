# Eagleclub Frontend Contract

Phase 3 extracts the backend contract from the working mock frontend in `frontend/`. No backend code is implemented in this phase.

## 1. Frontend Type Map

Source of truth: `frontend/src/types/index.ts`, `frontend/src/data/*`, `frontend/src/store/AppStore.tsx`.

### Product
Current frontend shape:

```ts
type Product = {
  id: string;
  slug: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  unit: string;
  mrp: number;
  price: number;
  gst: number;
  rating: number;
  reviews: number;
  stock: number;
  lowStock: number;
  image: string;
  tags: string[];
  featured?: boolean;
  organic?: boolean;
  local?: boolean;
  active?: boolean;
  description: string;
};
```

Backend notes:
- `brand` and `category` should become relations.
- `unit` should become a `ProductVariant` field.
- `stock` and `lowStock` should move into `Inventory`.
- `image` should become `ProductImage[]` with one primary image.
- Required validations: unique `slug`, unique `sku`, `mrp >= price >= 0`, `gst >= 0`, `stock >= 0`.

### Category

```ts
type Category = {
  id: string;
  slug: string;
  name: string;
  image: string;
};
```

Backend notes:
- Unique `slug`.
- Add `active`, `sortOrder`, optional parent category for future nesting.

### Brand
Frontend currently stores brand as `Product.brand: string`.

Backend target:

```ts
type Brand = {
  id: string;
  slug: string;
  name: string;
  logo?: string;
  active: boolean;
};
```

### Product Variant
Frontend currently stores one unit per product.

Backend target:

```ts
type ProductVariant = {
  id: string;
  productId: string;
  label: string;
  unit: string;
  mrp: number;
  price: number;
  sku: string;
  active: boolean;
};
```

### Cart Item

```ts
type CartItem = {
  productId: string;
  qty: number;
};
```

Backend target:

```ts
type CartItem = {
  id: string;
  cartId: string;
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
};
```

Validation: `quantity >= 1`, product active, sufficient inventory.

### Wishlist Item
Frontend stores wishlist as `string[]` of product ids.

Backend target:

```ts
type WishlistItem = {
  id: string;
  wishlistId: string;
  productId: string;
};
```

Unique: one product per wishlist.

### Coupon

```ts
type Coupon = {
  code: string;
  title: string;
  discountType: "flat" | "percent" | "shipping";
  value: number;
  minOrder: number;
  active: boolean;
};
```

Backend additions: `id`, `startAt`, `endAt`, `usageLimit`, `perUserLimit`, `usedCount`, `createdByAdminId`.

### Address

```ts
type Address = {
  id: string;
  label: string;
  name: string;
  phone: string;
  line: string;
  city: string;
  pincode: string;
};
```

Backend additions: `userId`, `state`, `landmark`, `isDefault`.

Validation: 10 digit phone, serviceable pincode, city in enabled delivery zone.

### Delivery Zone
Frontend seed: `["Mumbai", "Ahmedabad", "Vadodara", "Surat", "Rajkot"]`.

Backend target:

```ts
type DeliveryZone = {
  id: string;
  city: string;
  pincodes: string[];
  active: boolean;
  minOrder?: number;
  deliveryCharge: number;
};
```

### Delivery Slot
Frontend seed: `"7:00 AM - 9:00 AM"`, `"10:00 AM - 12:00 PM"`, `"2:00 PM - 4:00 PM"`, `"6:00 PM - 9:00 PM"`.

Backend target:

```ts
type DeliverySlot = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  capacity: number;
  active: boolean;
};
```

### User / Customer
Frontend currently uses address name as customer name.

Backend target:

```ts
type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  status: "ACTIVE" | "BLOCKED";
};
```

### Admin User
Frontend seed: `admin@eagleclub.in`, `admin123`, `Eagleclub Admin`.

Backend target:

```ts
type AdminUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  roleId: string;
  active: boolean;
};
```

### Order

```ts
type OrderStatus = "Placed" | "Confirmed" | "Packed" | "Out for Delivery" | "Delivered" | "Cancelled";
type PaymentStatus = "Paid" | "COD Pending" | "Failed" | "Refunded";

type Order = {
  orderNumber: string;
  customerName: string;
  items: CartItem[];
  address: Address;
  deliveryDate: string;
  deliverySlot: string;
  paymentMethod: "COD" | "Razorpay";
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  createdAt: string;
  couponCode?: string;
  deliveryStaff?: string;
};
```

Backend additions: `id`, `userId`, totals snapshot, address snapshot, slot id, payment id, invoice id.

### Order Item
Frontend reuses `CartItem`.

Backend target:

```ts
type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  variantId?: string;
  nameSnapshot: string;
  skuSnapshot: string;
  quantity: number;
  mrp: number;
  sellingPrice: number;
  gst: number;
  discount: number;
  lineTotal: number;
};
```

### Payment
Frontend uses `paymentMethod` and `paymentStatus`.

Backend target:

```ts
type Payment = {
  id: string;
  orderId: string;
  provider: "COD" | "RAZORPAY";
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  amount: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
};
```

### Invoice
Frontend invoice computes totals client-side.

Backend target:

```ts
type Invoice = {
  id: string;
  invoiceNumber: string;
  orderId: string;
  invoiceDate: string;
  subtotal: number;
  couponDiscount: number;
  deliveryCharge: number;
  handlingCharge: number;
  gstTotal: number;
  grandTotal: number;
  pdfUrl?: string;
};
```

### Inventory Item
Frontend inventory is `Product.stock` and `Product.lowStock`.

Backend target:

```ts
type Inventory = {
  id: string;
  productId: string;
  variantId?: string;
  stock: number;
  lowStockThreshold: number;
};
```

### Stock Movement

```ts
type StockMovement = {
  id: string;
  inventoryId: string;
  type: "IN" | "OUT" | "ADJUSTMENT" | "ORDER_RESERVED" | "ORDER_CANCELLED";
  quantity: number;
  note?: string;
  orderId?: string;
  adminUserId?: string;
};
```

### Delivery Staff
Frontend seed: `Rohan Patel`, `Aman Shah`, `Neha Joshi`, `Kiran Mehta`.

Backend target:

```ts
type DeliveryStaff = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  zoneId?: string;
};
```

### Review

```ts
type Review = {
  id: string;
  userId: string;
  productId: string;
  orderItemId?: string;
  rating: number;
  comment?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
};
```

### Return / Refund

```ts
type ReturnRequest = {
  id: string;
  orderId: string;
  orderItemId?: string;
  reason: string;
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "COMPLETED";
};

type Refund = {
  id: string;
  returnRequestId: string;
  paymentId: string;
  amount: number;
  status: "PENDING" | "PROCESSED" | "FAILED";
};
```

### Settings
Frontend admin settings mock: `storeName`, `support`, `city`.

Backend target:

```ts
type Setting = {
  key: string;
  value: string;
  type: "STRING" | "NUMBER" | "BOOLEAN" | "JSON";
};
```

### Report / Dashboard Stats
Frontend calculates:
- Customer: total orders, total spent, saved addresses, wishlist items, last order status, most purchased category.
- Admin: total revenue, today revenue, total orders, pending/delivered/cancelled, total customers, total products, low-stock, out-of-stock, AOV, conversion placeholder, recent orders, best-selling products.

Backend target:

```ts
type AdminDashboardStats = {
  totalRevenue: number;
  todayRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  totalCustomers: number;
  totalProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  averageOrderValue: number;
  conversionRate?: number;
};
```

## 2. Mock Service Method Map

Current mock methods live in `StoreProvider`; no separate `frontend/services` implementation exists yet. Future service modules should keep these names where possible.

| Method | Current input | Current output | Used by | API | Auth | Validation / errors |
|---|---|---|---|---|---|---|
| `searchProducts(query, filters, sort)` | query string, category, sort | product list | `/products`, `/search`, `/category/[slug]` | `GET /api/products` | public | invalid filters ignored; empty result state |
| `getProductBySlug(slug)` | slug | product | `/product/[slug]` | `GET /api/products/:slug` | public | 404 product fallback now uses first product; backend should return 404 |
| `addToCart(productId, qty?)` | product id, quantity default 1 | cart item/count | Product cards, detail, reorder | `POST /api/cart/items` | customer or guest cart | product active, stock available; toast error |
| `setQty(productId, qty)` | product id, quantity | cart | Cart page | `PATCH /api/cart/items/:id` | customer or guest cart | qty <= 0 removes item; stock limit |
| `removeFromCart(productId)` | product id | cart | Cart page | `DELETE /api/cart/items/:id` | customer or guest cart | not found returns harmless success |
| `toggleWishlist(productId)` | product id | wishlist | Product cards/detail | `POST/DELETE /api/wishlist/items` | customer | login required later; duplicate-safe |
| `moveWishlistToCart(productId)` | product id | cart + wishlist | Wishlist page | `POST /api/wishlist/items/:id/move-to-cart` | customer | stock available |
| `applyCoupon(code)` | coupon code | boolean + cart pricing | Cart page | `POST /api/cart/coupon` | customer or guest cart | invalid coupon toast; min order check; active/date checks |
| `clearCoupon()` | none | cart pricing | future cart UI | `DELETE /api/cart/coupon` | customer or guest cart | no-op if absent |
| `addAddress(payload)` | address without id | address | Checkout/account | `POST /api/account/addresses` | customer | pincode serviceability, phone, required fields |
| `updateAddress(address)` | full address | address | Checkout/account | `PUT /api/account/addresses/:id` | customer | belongs to user |
| `deleteAddress(id)` | address id | success | Checkout/account | `DELETE /api/account/addresses/:id` | customer | cannot delete address attached to existing orders; can archive |
| `placeOrder(checkoutPayload)` | address, deliveryDate, deliverySlot, paymentMethod, paymentStatus | order | Checkout | `POST /api/checkout/orders` | customer or guest checkout | cart not empty, stock, coupon, serviceability, terms accepted |
| `reorder(order)` | order | cart | Orders page | `POST /api/orders/:orderNumber/reorder` | customer | unavailable products skipped or error list |
| `getOrderByNumber(orderNumber)` | order number | order | Success, tracking, invoice | `GET /api/orders/:orderNumber` | customer/admin | ownership check |
| `addProduct(product)` | product | product list | Admin product new | `POST /api/admin/products` | admin | sku/slug unique, valid prices |
| `updateProduct(product)` | product | product list | Admin product edit | `PUT /api/admin/products/:id` | admin | same as create |
| `deleteProduct(id)` | product id | product list | Admin products | `DELETE /api/admin/products/:id` | admin | soft delete if orders exist |
| `adjustStock(productId, stock)` | product id, stock number | inventory | Admin inventory | `PATCH /api/admin/inventory/:id` | admin | non-negative; creates stock movement |
| `updateOrderStatus(orderNumber, status)` | order number, status | order | Admin orders/detail | `PATCH /api/admin/orders/:id/status` | admin | valid status transitions |
| `assignDeliveryStaff(orderNumber, staff)` | order number, staff name | order | Admin order detail | `PATCH /api/admin/orders/:id/delivery-assignment` | admin | staff active; order not delivered/cancelled |
| `addCoupon(coupon)` | coupon | coupon list | Admin coupons | `POST /api/admin/coupons` | admin | code unique, value rules |
| `updateCoupon(coupon)` | coupon | coupon list | Admin coupons | `PUT/PATCH /api/admin/coupons/:code` | admin | active toggle, date/usage validations |

## 3. Backend API Route Map

### Public / Customer APIs

| Method | URL | Body / query | Response | Auth | Frontend |
|---|---|---|---|---|---|
| GET | `/api/categories` | none | `{ categories: Category[] }` | public | home, listing nav |
| GET | `/api/products` | `q`, `category`, `brand`, `minPrice`, `maxPrice`, `availability`, `rating`, `organic`, `local`, `sort`, `page` | `{ products, total, filters }` | public | `/products`, `/search`, `/category/[slug]` |
| GET | `/api/products/:slug` | slug | `{ product, related, frequentlyBought }` | public | `/product/[slug]` |
| GET | `/api/cart` | none/session cart id | `{ cart, totals }` | customer/guest | header, cart, checkout |
| POST | `/api/cart/items` | `{ productId, variantId?, quantity }` | `{ cart, totals }` | customer/guest | product cards/detail |
| PATCH | `/api/cart/items/:id` | `{ quantity }` | `{ cart, totals }` | customer/guest | cart |
| DELETE | `/api/cart/items/:id` | none | `{ cart, totals }` | customer/guest | cart |
| POST | `/api/cart/coupon` | `{ code }` | `{ cart, totals, coupon }` | customer/guest | cart |
| DELETE | `/api/cart/coupon` | none | `{ cart, totals }` | customer/guest | cart |
| GET | `/api/wishlist` | none | `{ items: WishlistItem[] }` | customer | wishlist |
| POST | `/api/wishlist/items` | `{ productId }` | `{ wishlist }` | customer | product cards/detail |
| DELETE | `/api/wishlist/items/:productId` | none | `{ wishlist }` | customer | wishlist |
| POST | `/api/wishlist/items/:productId/move-to-cart` | `{ quantity? }` | `{ wishlist, cart }` | customer | wishlist |
| GET | `/api/coupons/available` | cart subtotal/user | `{ coupons: Coupon[] }` | customer/guest | cart |
| GET | `/api/delivery/zones` | none | `{ zones: DeliveryZone[] }` | public | checkout/address |
| GET | `/api/delivery/slots` | `pincode`, `date` | `{ slots: DeliverySlot[] }` | public | checkout |
| POST | `/api/checkout/orders` | `{ addressId? address?, deliveryDate, deliverySlotId, paymentMethod, couponCode? }` | `{ order }` | customer/guest | checkout |
| POST | `/api/payments/razorpay/create-order` | `{ orderDraftId/cartId }` | `{ razorpayOrderId, amount }` | customer | checkout later |
| POST | `/api/payments/razorpay/verify` | Razorpay payload | `{ order, payment }` | customer | checkout later |
| GET | `/api/orders` | filters/page | `{ orders: Order[] }` | customer | `/orders`, account |
| GET | `/api/orders/:orderNumber` | order number | `{ order }` | customer/admin | success, tracking, invoice |
| POST | `/api/orders/:orderNumber/reorder` | none | `{ cart }` | customer | orders |
| GET | `/api/orders/:orderNumber/tracking` | order number | `{ timeline, deliveryStaff, eta, order }` | customer/admin | tracking |
| GET | `/api/invoices/:orderNumber` | order number | `{ invoice, order }` | customer/admin | invoice |
| GET | `/api/invoices/:orderNumber/pdf` | order number | PDF | customer/admin | invoice |
| POST | `/api/auth/signup` | `{ name,email,phone,password }` | `{ user }` + session | public | signup |
| POST | `/api/auth/login` | `{ emailOrPhone,password }` | `{ user }` + session | public | login |
| POST | `/api/auth/logout` | none | success | customer | account |
| POST | `/api/auth/forgot-password` | `{ email }` | success | public | forgot |
| POST | `/api/auth/reset-password` | `{ token,password }` | success | public | reset |
| GET | `/api/account/me` | none | `{ user, stats }` | customer | account |
| PUT | `/api/account/profile` | profile fields | `{ user }` | customer | account/profile |
| GET | `/api/account/addresses` | none | `{ addresses }` | customer | checkout/account |
| POST | `/api/account/addresses` | address | `{ address }` | customer | checkout/account |
| PUT | `/api/account/addresses/:id` | address | `{ address }` | customer | checkout/account |
| DELETE | `/api/account/addresses/:id` | none | success | customer | checkout/account |

### Admin APIs

| Method | URL | Body / query | Response | Auth | Frontend |
|---|---|---|---|---|---|
| POST | `/api/admin/auth/login` | `{ email,password }` | `{ adminUser }` + httpOnly session | public | `/admin/login` |
| POST | `/api/admin/auth/logout` | none | success | admin | admin shell |
| GET | `/api/admin/dashboard` | optional date range | `AdminDashboardStats` | admin | `/admin` |
| GET | `/api/admin/products` | filters/page | `{ products,total }` | admin | `/admin/products` |
| POST | `/api/admin/products` | product payload | `{ product }` | admin | new product |
| GET | `/api/admin/products/:id` | id | `{ product }` | admin | edit product |
| PUT | `/api/admin/products/:id` | product payload | `{ product }` | admin | edit product |
| DELETE | `/api/admin/products/:id` | none | success | admin | products |
| CRUD | `/api/admin/categories` | category payload | categories | admin | categories |
| CRUD | `/api/admin/brands` | brand payload | brands | admin | brands |
| GET | `/api/admin/inventory` | filters/page | `{ items, lowStock, outOfStock }` | admin | inventory |
| PATCH | `/api/admin/inventory/:id` | `{ stock, note }` | `{ inventory, movement }` | admin | inventory |
| GET | `/api/admin/orders` | filters/page | `{ orders,total }` | admin | orders/dashboard |
| GET | `/api/admin/orders/:id` | id/order number | `{ order }` | admin | order detail |
| PATCH | `/api/admin/orders/:id/status` | `{ status }` | `{ order }` | admin | orders/detail |
| PATCH | `/api/admin/orders/:id/delivery-assignment` | `{ deliveryStaffId }` | `{ order, assignment }` | admin | order detail |
| GET | `/api/admin/customers` | filters/page | `{ customers,total }` | admin | customers |
| GET | `/api/admin/customers/:id` | id | `{ customer, orders, addresses }` | admin | customer profile later |
| GET | `/api/admin/coupons` | filters/page | `{ coupons,total }` | admin | coupons |
| POST | `/api/admin/coupons` | coupon payload | `{ coupon }` | admin | coupons |
| PUT | `/api/admin/coupons/:code` | coupon payload | `{ coupon }` | admin | coupons |
| DELETE | `/api/admin/coupons/:code` | none | success | admin | coupons |
| GET | `/api/admin/payments` | filters/page | `{ payments,total }` | admin | payments |
| GET | `/api/admin/invoices` | filters/page | `{ invoices,total }` | admin | invoices |
| GET | `/api/admin/delivery/zones` | none | `{ zones }` | admin | delivery |
| CRUD | `/api/admin/delivery/staff` | staff payload | delivery staff | admin | delivery |
| CRUD | `/api/admin/delivery/slots` | slot payload | slots | admin | delivery |
| GET | `/api/admin/returns` | filters/page | `{ returns,total }` | admin | returns |
| PATCH | `/api/admin/returns/:id` | `{ status }` | `{ returnRequest }` | admin | returns |
| GET | `/api/admin/reviews` | filters/page | `{ reviews,total }` | admin | reviews |
| PATCH | `/api/admin/reviews/:id` | `{ status }` | `{ review }` | admin | reviews |
| GET | `/api/admin/reports/sales` | date range | sales report | admin | reports |
| GET | `/api/admin/reports/products` | date range | product report | admin | reports |
| GET | `/api/admin/reports/inventory` | date range | inventory report | admin | reports |
| CRUD | `/api/admin/users` | admin user payload | admin users | admin with role | users |
| GET | `/api/admin/settings` | none | `{ settings }` | admin | settings |
| PUT | `/api/admin/settings` | key/value map | `{ settings }` | admin | settings |

## 4. Prisma Model Plan

Database: MySQL/MariaDB with Prisma.

### Enums

```prisma
enum UserStatus { ACTIVE BLOCKED }
enum AdminStatus { ACTIVE DISABLED }
enum DiscountType { FLAT PERCENT SHIPPING }
enum OrderStatus { PLACED CONFIRMED PACKED OUT_FOR_DELIVERY DELIVERED CANCELLED }
enum PaymentProvider { COD RAZORPAY }
enum PaymentStatus { PENDING PAID FAILED REFUNDED COD_PENDING }
enum StockMovementType { IN OUT ADJUSTMENT ORDER_RESERVED ORDER_CANCELLED }
enum ReviewStatus { PENDING APPROVED REJECTED }
enum ReturnStatus { REQUESTED APPROVED REJECTED COMPLETED }
enum RefundStatus { PENDING PROCESSED FAILED }
enum SettingType { STRING NUMBER BOOLEAN JSON }
```

### Models

`User`
- Fields: `id`, `name`, `email?`, `phone`, `passwordHash`, `status`, timestamps.
- Relations: addresses, cart, wishlist, orders, reviews, coupon usages.
- Unique: `email`, `phone`.
- Indexes: `status`, `createdAt`.

`Address`
- Fields: `id`, `userId`, `label`, `name`, `phone`, `line`, `city`, `state?`, `pincode`, `landmark?`, `isDefault`, `archivedAt?`, timestamps.
- Relations: user, orders.
- Indexes: `userId`, `pincode`, `city`.

`AdminUser`
- Fields: `id`, `name`, `email`, `passwordHash`, `roleId`, `status`, timestamps.
- Unique: `email`.
- Relations: role, stock movements, created coupons.

`Role`
- Fields: `id`, `name`, `permissions Json`, timestamps.
- Unique: `name`.

`Category`
- Fields: `id`, `slug`, `name`, `image?`, `active`, `sortOrder`, `parentId?`, timestamps.
- Unique: `slug`.
- Relations: products, parent/children.

`Brand`
- Fields: `id`, `slug`, `name`, `logo?`, `active`, timestamps.
- Unique: `slug`, `name`.
- Relations: products.

`Product`
- Fields: `id`, `slug`, `name`, `sku`, `categoryId`, `brandId`, `description`, `gst`, `ratingAvg`, `reviewCount`, `featured`, `organic`, `local`, `active`, timestamps.
- Unique: `slug`, `sku`.
- Indexes: `categoryId`, `brandId`, `active`, `featured`.
- Relations: category, brand, images, variants, inventory, order items, cart items, wishlist items, reviews.

`ProductImage`
- Fields: `id`, `productId`, `url`, `alt?`, `isPrimary`, `sortOrder`.
- Indexes: `productId`, `isPrimary`.

`ProductVariant`
- Fields: `id`, `productId`, `sku`, `label`, `unit`, `mrp`, `price`, `active`, timestamps.
- Unique: `sku`.
- Indexes: `productId`, `active`.

`Inventory`
- Fields: `id`, `productId`, `variantId?`, `stock`, `lowStockThreshold`, timestamps.
- Unique: `productId + variantId`.
- Relations: stock movements.

`StockMovement`
- Fields: `id`, `inventoryId`, `type`, `quantity`, `note?`, `orderId?`, `adminUserId?`, timestamps.
- Indexes: `inventoryId`, `orderId`, `type`, `createdAt`.

`Cart`
- Fields: `id`, `userId?`, `guestToken?`, `couponId?`, timestamps.
- Unique: `userId`, `guestToken`.
- Relations: items, coupon.

`CartItem`
- Fields: `id`, `cartId`, `productId`, `variantId?`, `quantity`, `unitPriceSnapshot`, timestamps.
- Unique: `cartId + productId + variantId`.

`Wishlist`
- Fields: `id`, `userId`, timestamps.
- Unique: `userId`.

`WishlistItem`
- Fields: `id`, `wishlistId`, `productId`, timestamps.
- Unique: `wishlistId + productId`.

`Coupon`
- Fields: `id`, `code`, `title`, `discountType`, `value`, `minOrder`, `active`, `startAt?`, `endAt?`, `usageLimit?`, `perUserLimit?`, `usedCount`, `createdByAdminId?`, timestamps.
- Unique: `code`.
- Indexes: `active`, `startAt`, `endAt`.

`CouponUsage`
- Fields: `id`, `couponId`, `userId?`, `orderId`, `discountAmount`, timestamps.
- Unique: `couponId + orderId`.
- Indexes: `couponId`, `userId`.

`Order`
- Fields: `id`, `orderNumber`, `userId?`, `customerName`, `addressId?`, address snapshot fields, `deliveryDate`, `deliverySlotId?`, `status`, `paymentStatus`, `paymentMethod`, `couponId?`, `subtotal`, `discount`, `couponDiscount`, `gstTotal`, `deliveryCharge`, `handlingCharge`, `grandTotal`, timestamps.
- Unique: `orderNumber`.
- Indexes: `userId`, `status`, `paymentStatus`, `createdAt`.

`OrderItem`
- Fields: `id`, `orderId`, `productId`, `variantId?`, `nameSnapshot`, `skuSnapshot`, `quantity`, `mrp`, `sellingPrice`, `discount`, `gst`, `lineTotal`.
- Indexes: `orderId`, `productId`.

`Payment`
- Fields: `id`, `orderId`, `provider`, `status`, `amount`, `razorpayOrderId?`, `razorpayPaymentId?`, `rawPayload Json?`, timestamps.
- Unique: `orderId`, optional `razorpayPaymentId`.
- Indexes: `provider`, `status`.

`Invoice`
- Fields: `id`, `invoiceNumber`, `orderId`, `invoiceDate`, totals, `pdfUrl?`, timestamps.
- Unique: `invoiceNumber`, `orderId`.

`DeliveryZone`
- Fields: `id`, `city`, `active`, `minOrder?`, `deliveryCharge`, timestamps.
- Unique: `city`.

`DeliverySlot`
- Fields: `id`, `zoneId?`, `label`, `startTime`, `endTime`, `capacity`, `active`, timestamps.
- Indexes: `zoneId`, `active`.

`DeliveryStaff`
- Fields: `id`, `name`, `phone`, `zoneId?`, `active`, timestamps.
- Unique: `phone`.

`DeliveryAssignment`
- Fields: `id`, `orderId`, `deliveryStaffId`, `assignedAt`, `status`.
- Unique: `orderId`.
- Indexes: `deliveryStaffId`, `assignedAt`.

`Review`
- Fields: `id`, `userId`, `productId`, `orderItemId?`, `rating`, `comment?`, `status`, timestamps.
- Indexes: `productId`, `userId`, `status`.
- Validation: rating 1-5.

`ReturnRequest`
- Fields: `id`, `orderId`, `orderItemId?`, `userId`, `reason`, `status`, timestamps.
- Indexes: `orderId`, `status`.

`Refund`
- Fields: `id`, `returnRequestId`, `paymentId`, `amount`, `status`, `providerRefundId?`, timestamps.
- Indexes: `status`, `paymentId`.

`Setting`
- Fields: `key`, `value`, `type`, `updatedByAdminId?`, `updatedAt`.
- Unique: `key`.

## 5. Backend Architecture Plan

Recommended backend structure:

```txt
backend/
  app/api/
    auth/
    admin/
    products/
    categories/
    cart/
    wishlist/
    coupons/
    checkout/
    orders/
    invoices/
    delivery/
    payments/
  prisma/
    schema.prisma
    seed.ts
  lib/
    prisma.ts
    auth.ts
    money.ts
    errors.ts
  services/
    auth.service.ts
    catalog.service.ts
    cart.service.ts
    wishlist.service.ts
    coupon.service.ts
    checkout.service.ts
    order.service.ts
    payment.service.ts
    invoice.service.ts
    inventory.service.ts
    delivery.service.ts
    admin.service.ts
    reports.service.ts
    settings.service.ts
  validators/
    auth.schema.ts
    product.schema.ts
    cart.schema.ts
    checkout.schema.ts
    coupon.schema.ts
    admin.schema.ts
  types/
    api.ts
    domain.ts
  middleware/
    requireCustomer.ts
    requireAdmin.ts
    requireRole.ts
  tests/
```

Preferred stack:
- Next.js API route handlers if backend is colocated with app-style routing, or Express if the backend remains a separate service. Given the current repo has `/frontend` and `/backend`, Express + TypeScript is clean and independent.
- Prisma + MySQL/MariaDB.
- bcrypt for passwords.
- JWT in httpOnly cookies, or session table + httpOnly cookie. Prefer httpOnly cookies for browser flows.
- Razorpay and PDF invoice generation come later.

## 6. Frontend Integration Plan

Current frontend state is centralized in `StoreProvider`. Replace this in stages:

1. Create `frontend/src/services/*` with the same method names as the mock store actions.
2. Keep mock mode with a flag such as `NEXT_PUBLIC_USE_MOCKS=true` during transition.
3. Move calculations from client `totals()` to backend responses while preserving frontend display shape.
4. Replace localStorage persistence:
   - cart: API guest/customer cart; keep local guest token only.
   - wishlist/orders/addresses/products/coupons: API data.
   - coupon code: backend cart coupon state.
5. Add loading/error states around each fetch.
6. Preserve frontend behavior:
   - invalid coupon shows toast.
   - failed payment keeps cart.
   - successful order clears cart.
   - admin product/coupon/order changes reflect in customer pages after refetch.
7. Keep route paths unchanged.

Suggested frontend services:

```ts
productService.searchProducts(params)
productService.getProductBySlug(slug)
cartService.getCart()
cartService.addToCart(productId, variantId, quantity)
cartService.updateQuantity(cartItemId, quantity)
cartService.removeItem(cartItemId)
cartService.applyCoupon(code)
wishlistService.toggle(productId)
checkoutService.createOrder(payload)
orderService.getOrders()
orderService.getOrderByNumber(orderNumber)
invoiceService.getInvoice(orderNumber)
adminService.getDashboard()
adminService.createProduct(payload)
adminService.updateProduct(id, payload)
adminService.updateOrderStatus(orderId, status)
adminService.assignDeliveryStaff(orderId, staffId)
adminService.createCoupon(payload)
```

## 7. Backend Phase Plan

### Phase 4: Backend setup + Prisma schema + seed data
- Initialize TypeScript backend.
- Add Prisma MySQL/MariaDB schema.
- Seed Eagleclub categories, brands, products, variants, inventory, coupons, delivery zones, slots, admin user.

### Phase 5: Auth + roles + sessions
- Customer signup/login/logout.
- Admin login/logout.
- bcrypt password hashing.
- httpOnly cookies/JWT/session middleware.
- Role guards.

### Phase 6: Catalog APIs
- Product/category/brand public APIs.
- Product detail with related products.
- Admin product/category/brand CRUD.

### Phase 7: Cart + wishlist + coupon APIs
- Guest/customer carts.
- Cart item quantity and removal.
- Wishlist CRUD.
- Coupon validation and cart totals.

### Phase 8: Checkout + orders + inventory stock movement
- Checkout validation.
- COD order creation.
- Inventory reservation/decrement.
- StockMovement records.
- Reorder endpoint.

### Phase 9: Invoice + tracking
- Invoice records and invoice API.
- Print/PDF placeholder.
- Order tracking timeline.
- Delivery assignment read APIs.

### Phase 10: Admin dashboard and operations APIs
- Dashboard stats.
- Orders, customers, payments, invoices.
- Delivery staff/zones/slots.
- Returns/refunds/reviews.
- Reports.
- Settings.

### Phase 11: Razorpay integration + COD finalization
- Razorpay order creation.
- Payment verification.
- Webhook handling.
- Refund flow.
- COD delivered/payment reconciliation.

### Phase 12: Frontend API integration
- Replace `StoreProvider` localStorage methods with service calls.
- Keep mock fallback optional.
- Add loading/error states.
- Preserve routes and UI.

### Phase 13: Full QA
- Customer flow: browsing to billing.
- Admin flow: product/order/inventory/coupon/report management.
- Cross-role consistency.
- Responsive regression pass.
- Build, typecheck, Playwright, backend tests.

