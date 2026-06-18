import { Router } from "express";
import { sendError, sendOk } from "../../lib/http.js";
import { listFaqs } from "../../services/faq.service.js";
import { faqQuerySchema } from "../../validators/faq.js";

export const faqRouter = Router();

faqRouter.get("/faqs", async (req, res) => {
  const parsed = faqQuerySchema.omit({ includeInactive: true }).safeParse(req.query);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid FAQ filters.");
  return sendOk(res, { faqs: await listFaqs(parsed.data) });
});
