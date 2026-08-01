import "../lib/load-env.js";
import { db } from "../lib/db.js";
import { ensureDeliveryAdminAccount } from "../services/delivery-admin-maintenance.service.js";

async function main() {
  const { email, phone } = await ensureDeliveryAdminAccount();
  console.log("Delivery admin is ready.");
  console.log(`Email: ${email}`);
  console.log(`Staff phone: ${phone}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
