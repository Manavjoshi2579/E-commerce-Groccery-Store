import { Router } from "express";
import { sendError, sendOk } from "../../lib/http.js";
import { checkPincode, listDeliveryZones, listSlotsForPincode } from "../../services/delivery.service.js";
import { slotQuerySchema } from "../../validators/checkout.js";
import { pincodeSchema } from "../../validators/common.js";

export const deliveryRouter = Router();

deliveryRouter.get("/zones", async (_req, res) => sendOk(res, { zones: await listDeliveryZones() }));

deliveryRouter.get("/check-pincode", async (req, res) => {
  const parsed = pincodeSchema.safeParse(req.query.pincode);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid pincode.");
  return sendOk(res, await checkPincode(parsed.data));
});

deliveryRouter.get("/slots", async (req, res) => {
  const parsed = slotQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid delivery slot query.");
  return sendOk(res, await listSlotsForPincode(parsed.data.pincode, parsed.data.date));
});
