import { Router } from "express";
import { sendError, sendOk } from "../../lib/http.js";
import { requireCustomer } from "../../middleware/auth.js";
import { addWishlistItem, getWishlistSummary, moveWishlistItemToCart, removeWishlistItem } from "../../services/wishlist.service.js";
import { addCartItemSchema } from "../../validators/cart.js";

export const wishlistRouter = Router();

function param(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

wishlistRouter.use(requireCustomer);

wishlistRouter.get("/", async (req, res) => {
  return sendOk(res, { wishlist: await getWishlistSummary(req.customer!.id) });
});

wishlistRouter.post("/items", async (req, res) => {
  const parsed = addCartItemSchema.pick({ productId: true }).safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, parsed.error.issues[0]?.message || "Invalid wishlist item.");
  try {
    return sendOk(res, { wishlist: await addWishlistItem(req.customer!.id, parsed.data.productId) }, 201);
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not add wishlist item.");
  }
});

wishlistRouter.delete("/items/:id", async (req, res) => {
  return sendOk(res, { wishlist: await removeWishlistItem(req.customer!.id, param(req.params.id)) });
});

wishlistRouter.post("/items/:id/move-to-cart", async (req, res) => {
  try {
    return sendOk(res, await moveWishlistItemToCart(req.customer!.id, param(req.params.id)));
  } catch (error) {
    return sendError(res, 400, error instanceof Error ? error.message : "Could not move wishlist item.");
  }
});
