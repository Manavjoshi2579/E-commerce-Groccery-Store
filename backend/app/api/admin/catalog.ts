import { RoleName } from "@prisma/client";
import { Router } from "express";
import { sendError, sendOk } from "../../../lib/http.js";
import { requireAdminRole } from "../../../middleware/auth.js";
import {
  createBrand,
  createCategory,
  createProduct,
  bulkImportProducts,
  getAdminProduct,
  listBrands,
  listCategories,
  listProducts,
  softDeleteBrand,
  softDeleteCategory,
  softDeleteProduct,
  updateBrand,
  updateCategory,
  updateProduct,
  productBulkTemplate,
  productBulkTemplateXlsx,
} from "../../../services/catalog.service.js";
import { brandSchema, categorySchema, productListQuerySchema, productSchema, productUpdateSchema } from "../../../validators/catalog.js";

export const adminCatalogRouter = Router();

const catalogViewRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.INVENTORY_MANAGER, RoleName.ORDER_MANAGER];
const catalogManageRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER];

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

adminCatalogRouter.get("/products", requireAdminRole(catalogViewRoles), async (req, res) => {
  const parsed = productListQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid product filters.");
  return sendOk(res, await listProducts(parsed.data, true));
});

adminCatalogRouter.get("/products/bulk-template", requireAdminRole(catalogViewRoles), async (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"eagle-mart-product-template.csv\"");
  return res.send(productBulkTemplate());
});

adminCatalogRouter.get("/products/bulk-template.xlsx", requireAdminRole(catalogViewRoles), async (_req, res) => {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=\"eagle-mart-product-template.xlsx\"");
  return res.send(productBulkTemplateXlsx());
});

adminCatalogRouter.post("/products/bulk-import", requireAdminRole(catalogManageRoles), async (req, res) => {
  const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
  const contentBase64 = typeof req.body?.contentBase64 === "string" ? req.body.contentBase64 : "";
  const filename = typeof req.body?.filename === "string" ? req.body.filename : "products.csv";
  const mode = typeof req.body?.mode === "string" ? req.body.mode : "create_update";
  const dryRun = Boolean(req.body?.dryRun);
  if (!csv.trim() && !contentBase64.trim()) return sendError(res, 400, "CSV or XLSX file content is required.");
  try {
    return sendOk(res, { summary: await bulkImportProducts(csv.trim() ? csv : { filename, contentBase64 }, mode as any, dryRun) }, dryRun ? 200 : 201);
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not import products.");
  }
});

adminCatalogRouter.post("/products", requireAdminRole(catalogManageRoles), async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid product payload.");
  try {
    return sendOk(res, { product: await createProduct(parsed.data) }, 201);
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not create product.");
  }
});

adminCatalogRouter.get("/products/:id", requireAdminRole(catalogViewRoles), async (req, res) => {
  const product = await getAdminProduct(param(req.params.id));
  if (!product) return sendError(res, 404, "Product not found.", "PRODUCT_NOT_FOUND");
  return sendOk(res, { product });
});

adminCatalogRouter.patch("/products/:id", requireAdminRole(catalogManageRoles), async (req, res) => {
  const parsed = productUpdateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid product payload.");
  try {
    return sendOk(res, { product: await updateProduct(param(req.params.id), parsed.data) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not update product.");
  }
});

adminCatalogRouter.delete("/products/:id", requireAdminRole(catalogManageRoles), async (req, res) => {
  await softDeleteProduct(param(req.params.id));
  return sendOk(res, { deleted: true });
});

adminCatalogRouter.get("/categories", requireAdminRole(catalogViewRoles), async (_req, res) => {
  return sendOk(res, { categories: await listCategories(true) });
});

adminCatalogRouter.post("/categories", requireAdminRole(catalogManageRoles), async (req, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid category payload.");
  return sendOk(res, { category: await createCategory(parsed.data) }, 201);
});

adminCatalogRouter.patch("/categories/:id", requireAdminRole(catalogManageRoles), async (req, res) => {
  const parsed = categorySchema.partial().safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid category payload.");
  return sendOk(res, { category: await updateCategory(param(req.params.id), parsed.data) });
});

adminCatalogRouter.delete("/categories/:id", requireAdminRole(catalogManageRoles), async (req, res) => {
  await softDeleteCategory(param(req.params.id));
  return sendOk(res, { deleted: true });
});

adminCatalogRouter.get("/brands", requireAdminRole(catalogViewRoles), async (_req, res) => {
  return sendOk(res, { brands: await listBrands(true) });
});

adminCatalogRouter.post("/brands", requireAdminRole(catalogManageRoles), async (req, res) => {
  const parsed = brandSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid brand payload.");
  return sendOk(res, { brand: await createBrand(parsed.data) }, 201);
});

adminCatalogRouter.patch("/brands/:id", requireAdminRole(catalogManageRoles), async (req, res) => {
  const parsed = brandSchema.partial().safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid brand payload.");
  return sendOk(res, { brand: await updateBrand(param(req.params.id), parsed.data) });
});

adminCatalogRouter.delete("/brands/:id", requireAdminRole(catalogManageRoles), async (req, res) => {
  await softDeleteBrand(param(req.params.id));
  return sendOk(res, { deleted: true });
});
