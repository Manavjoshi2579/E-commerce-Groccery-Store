import "../lib/load-env.js";
import { bulkSyncProductImages } from "../services/catalog.service.js";
import { db } from "../lib/db.js";

const dryRun = process.argv.includes("--dry-run");
const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || process.env.IMAGE_SYNC_LIMIT || "50");

async function main() {
  const report = await bulkSyncProductImages({ dryRun, limit });
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
