import { Router, type Request, type Response } from "express";
import { sendError, sendOk } from "../../lib/http.js";
import { requireCustomer } from "../../middleware/auth.js";
import { createRazorpayOrder, handleRazorpayWebhook, markRazorpayFailed, verifyRazorpayPayment } from "../../services/payment.service.js";
import { razorpayCreateOrderSchema, razorpayFailedSchema, razorpayVerifySchema } from "../../validators/payments.js";

export const paymentRouter = Router();

paymentRouter.post("/razorpay/create-order", requireCustomer, async (req, res) => {
  const parsed = razorpayCreateOrderSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid payment payload.");
  try {
    return sendOk(res, await createRazorpayOrder(req.customer!.id, parsed.data), 201);
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not create Razorpay order.");
  }
});

paymentRouter.post("/razorpay/verify", requireCustomer, async (req, res) => {
  const parsed = razorpayVerifySchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid verification payload.");
  try {
    return sendOk(res, await verifyRazorpayPayment(req.customer!.id, parsed.data));
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Payment verification failed.");
  }
});

paymentRouter.post("/razorpay/failed", requireCustomer, async (req, res) => {
  const parsed = razorpayFailedSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid failure payload.");
  try {
    return sendOk(res, await markRazorpayFailed(req.customer!.id, parsed.data));
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not record payment failure.");
  }
});

export async function razorpayWebhookHandler(req: Request, res: Response) {
  try {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    return sendOk(res, await handleRazorpayWebhook(body, req.header("x-razorpay-signature") || undefined));
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Webhook rejected.");
  }
}
