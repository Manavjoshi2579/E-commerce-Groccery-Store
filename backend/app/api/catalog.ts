import { Router } from "express";
import { sendError, sendOk } from "../../lib/http.js";
import { getCategoryBySlug, getHomepageCatalogSections, getProductBySlug, listBrands, listCategories, listProducts } from "../../services/catalog.service.js";
import { productListQuerySchema } from "../../validators/catalog.js";

export const catalogRouter = Router();

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

catalogRouter.get("/categories", async (_req, res) => {
  return sendOk(res, { categories: await listCategories() });
});

catalogRouter.get("/categories/:slug", async (req, res) => {
  const category = await getCategoryBySlug(param(req.params.slug));
  if (!category) return sendError(res, 404, "Category not found.", "CATEGORY_NOT_FOUND");
  return sendOk(res, { category });
});

catalogRouter.get("/brands", async (_req, res) => {
  return sendOk(res, { brands: await listBrands() });
});

catalogRouter.get("/catalog/home", async (_req, res) => {
  return sendOk(res, await getHomepageCatalogSections());
});

catalogRouter.get("/products", async (req, res) => {
  const parsed = productListQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid product filters.");
  return sendOk(res, await listProducts(parsed.data));
});

catalogRouter.get("/products/:slug", async (req, res) => {
  const product = await getProductBySlug(param(req.params.slug));
  if (!product) return sendError(res, 404, "Product not found.", "PRODUCT_NOT_FOUND");
  return sendOk(res, { product });
});

catalogRouter.get("/search", async (req, res) => {
  const parsed = productListQuerySchema.safeParse({ ...req.query, q: req.query.q || req.query.search });
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid search filters.");
  return sendOk(res, await listProducts(parsed.data));
});
