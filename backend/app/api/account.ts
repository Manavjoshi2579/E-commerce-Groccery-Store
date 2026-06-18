import { Router } from "express";
import { sendError, sendOk } from "../../lib/http.js";
import { requireCustomer } from "../../middleware/auth.js";
import { createAddress, deleteAddress, listAddresses, setDefaultAddress, updateAddress } from "../../services/address.service.js";
import { addressSchema } from "../../validators/checkout.js";

export const accountRouter = Router();

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

accountRouter.use(requireCustomer);

accountRouter.get("/addresses", async (req, res) => sendOk(res, { addresses: await listAddresses(req.customer!.id) }));

accountRouter.post("/addresses", async (req, res) => {
  const parsed = addressSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid address.");
  return sendOk(res, { address: await createAddress(req.customer!.id, parsed.data) }, 201);
});

accountRouter.patch("/addresses/:id", async (req, res) => {
  const parsed = addressSchema.partial().safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid address.");
  try {
    return sendOk(res, { address: await updateAddress(req.customer!.id, param(req.params.id), parsed.data) });
  } catch (error) {
    return sendError(res, 404, error instanceof Error ? error.message : "Address not found.");
  }
});

accountRouter.delete("/addresses/:id", async (req, res) => {
  try {
    await deleteAddress(req.customer!.id, param(req.params.id));
    return sendOk(res, { deleted: true });
  } catch (error) {
    return sendError(res, 404, error instanceof Error ? error.message : "Address not found.");
  }
});

accountRouter.patch("/addresses/:id/default", async (req, res) => {
  try {
    return sendOk(res, { address: await setDefaultAddress(req.customer!.id, param(req.params.id)) });
  } catch (error) {
    return sendError(res, 404, error instanceof Error ? error.message : "Address not found.");
  }
});
