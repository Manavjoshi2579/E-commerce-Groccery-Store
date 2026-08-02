import "../lib/load-env.js";
import { createApp } from "./app.js";
import { validateEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { ensureDeliveryAdminAccount } from "../services/delivery-admin-maintenance.service.js";

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "0.0.0.0";

validateEnv();

if (process.env.AUTO_ENSURE_DELIVERY_ADMIN !== "false") {
  const account = await ensureDeliveryAdminAccount();
  logger.info("delivery_admin_verified", { email: account.email });
}

createApp().listen(port, host, () => {
  logger.info("backend_listening", { host, port });
});
