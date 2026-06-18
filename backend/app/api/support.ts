import { Router } from "express";
import { sendError, sendOk } from "../../lib/http.js";
import { requireCustomer } from "../../middleware/auth.js";
import { createSupportTicket, listCustomerSupportTickets } from "../../services/support.service.js";
import { supportTicketSchema } from "../../validators/support.js";

export const supportRouter = Router();

supportRouter.use(requireCustomer);

supportRouter.get("/tickets", async (req, res) => {
  return sendOk(res, { tickets: await listCustomerSupportTickets(req.customer!.id) });
});

supportRouter.post("/tickets", async (req, res) => {
  const parsed = supportTicketSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid support request.");
  try {
    return sendOk(res, { ticket: await createSupportTicket(req.customer!.id, parsed.data) }, 201);
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not create support ticket.");
  }
});
