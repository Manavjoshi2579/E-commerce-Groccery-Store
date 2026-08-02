import "../lib/load-env.js";
import { ensureProductIdentifiers } from "../services/product-identifiers.service.js";
import { db } from "../lib/db.js";

ensureProductIdentifiers()
  .then((result) => {
    console.log(`Product identifiers ready. Scanned ${result.scanned}, updated ${result.updated}.`);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
