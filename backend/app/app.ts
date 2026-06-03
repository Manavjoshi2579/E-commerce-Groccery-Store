import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { catalogRouter } from "./api/catalog.js";
import { cartRouter } from "./api/cart.js";
import { couponRouter } from "./api/coupons.js";
import { customerAuthRouter } from "./api/auth.js";
import { wishlistRouter } from "./api/wishlist.js";
import { adminAuthRouter } from "./api/admin/auth.js";
import { adminCatalogRouter } from "./api/admin/catalog.js";
import { adminCouponRouter } from "./api/admin/coupons.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => res.json({ ok: true, service: "eagleclub-backend" }));
  app.use("/api/auth", customerAuthRouter);
  app.use("/api/admin/auth", adminAuthRouter);
  app.use("/api/admin", adminCatalogRouter);
  app.use("/api/admin", adminCouponRouter);
  app.use("/api/cart", cartRouter);
  app.use("/api/wishlist", wishlistRouter);
  app.use("/api/coupons", couponRouter);
  app.use("/api", catalogRouter);

  return app;
}
