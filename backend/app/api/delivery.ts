import { Router } from "express";
import { sendError, sendOk } from "../../lib/http.js";
import { checkPincode, listDeliveryZones, listSlotsForPincode, reverseGeocodeLocation } from "../../services/delivery.service.js";
import { pincodeQuerySchema, reverseGeocodeQuerySchema, slotQuerySchema } from "../../validators/checkout.js";

export const deliveryRouter = Router();

deliveryRouter.get("/zones", async (_req, res) => sendOk(res, { zones: await listDeliveryZones() }));

deliveryRouter.get("/check-pincode", async (req, res) => {
  const parsed = pincodeQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid pincode.");
  return sendOk(res, await checkPincode(parsed.data.pincode));
});

deliveryRouter.get("/reverse-geocode", async (req, res) => {
  const parsed = reverseGeocodeQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid location coordinates.");
  try {
    return sendOk(res, await reverseGeocodeLocation(parsed.data.lat, parsed.data.lng));
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not detect this location.");
  }
});

deliveryRouter.get("/slots", async (req, res) => {
  const parsed = slotQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid delivery slot query.");
  return sendOk(res, await listSlotsForPincode(parsed.data.pincode, parsed.data.date));
});
