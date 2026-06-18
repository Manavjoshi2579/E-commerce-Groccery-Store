import { RoleName } from "@prisma/client";
import { Router } from "express";
import { sendError, sendOk } from "../../../lib/http.js";
import { requireAdminRole } from "../../../middleware/auth.js";
import { bulkUpdateFaqStatus, createFaq, deleteFaq, listFaqs, updateFaq } from "../../../services/faq.service.js";
import { faqBulkStatusSchema, faqQuerySchema, faqSchema } from "../../../validators/faq.js";

export const adminFaqRouter = Router();

const faqViewRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.SUPPORT_STAFF];
const faqManageRoles = [RoleName.SUPER_ADMIN, RoleName.STORE_MANAGER, RoleName.SUPPORT_STAFF];

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

adminFaqRouter.get("/faqs", requireAdminRole(faqViewRoles), async (req, res) => {
  const parsed = faqQuerySchema.safeParse({ ...req.query, includeInactive: true });
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid FAQ filters.");
  return sendOk(res, { faqs: await listFaqs(parsed.data, true) });
});

adminFaqRouter.post("/faqs", requireAdminRole(faqManageRoles), async (req, res) => {
  const parsed = faqSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid FAQ payload.");
  return sendOk(res, { faq: await createFaq(parsed.data) }, 201);
});

adminFaqRouter.patch("/faqs/bulk-status", requireAdminRole(faqManageRoles), async (req, res) => {
  const parsed = faqBulkStatusSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid bulk FAQ payload.");
  return sendOk(res, { faqs: await bulkUpdateFaqStatus(parsed.data.ids, parsed.data.isActive) });
});

adminFaqRouter.patch("/faqs/:id", requireAdminRole(faqManageRoles), async (req, res) => {
  const parsed = faqSchema.partial().safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid FAQ payload.");
  return sendOk(res, { faq: await updateFaq(param(req.params.id), parsed.data) });
});

adminFaqRouter.delete("/faqs/:id", requireAdminRole(faqManageRoles), async (req, res) => {
  await deleteFaq(param(req.params.id));
  return sendOk(res, { deleted: true });
});
