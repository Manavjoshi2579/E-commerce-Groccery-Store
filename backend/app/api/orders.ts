import { Router } from "express";
import { sendError, sendOk } from "../../lib/http.js";
import { requireCustomer } from "../../middleware/auth.js";
import { cancelOrder, getOrder, listOrders, reorder, requestReturn, tracking } from "../../services/order.service.js";
import { returnRequestSchema } from "../../validators/checkout.js";

export const orderRouter = Router();

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

orderRouter.use(requireCustomer);

orderRouter.get("/", async (req, res) => sendOk(res, { orders: await listOrders(req.customer!.id) }));

orderRouter.get("/:orderNumber", async (req, res) => {
  try {
    return sendOk(res, { order: await getOrder(req.customer!.id, param(req.params.orderNumber)) });
  } catch (error) {
    return sendError(res, 404, error instanceof Error ? error.message : "Order not found.");
  }
});

orderRouter.get("/:orderNumber/tracking", async (req, res) => {
  try {
    return sendOk(res, await tracking(req.customer!.id, param(req.params.orderNumber)));
  } catch (error) {
    return sendError(res, 404, error instanceof Error ? error.message : "Order not found.");
  }
});

orderRouter.post("/:orderNumber/cancel", async (req, res) => {
  try {
    return sendOk(res, { order: await cancelOrder(req.customer!.id, param(req.params.orderNumber)) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not cancel order.");
  }
});

orderRouter.post("/:orderNumber/return", async (req, res) => {
  const parsed = returnRequestSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid return request.");
  try {
    return sendOk(res, { order: await requestReturn(req.customer!.id, param(req.params.orderNumber), parsed.data) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not request return.");
  }
});

orderRouter.post("/:orderNumber/reorder", async (req, res) => {
  try {
    return sendOk(res, { cart: await reorder(req.customer!.id, param(req.params.orderNumber)) });
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not reorder.");
  }
});
