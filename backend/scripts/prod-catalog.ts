import "../lib/load-env.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { replaceClientCatalogFromWorkbook } from "../services/catalog.service.js";
import { db } from "../lib/db.js";

async function main() {
  const workbookArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const workbookPath = resolve(workbookArg || "../products.xlsx");
  const dryRun = process.argv.includes("--dry-run");
  const contentBase64 = readFileSync(workbookPath).toString("base64");
  console.log("Backup before production import:");
  console.log("mysqldump --single-transaction --routines --triggers \"$DATABASE_URL\" > eagle-mart-catalog-backup.sql");
  const summary = await replaceClientCatalogFromWorkbook({ filename: "products.xlsx", contentBase64 }, dryRun);
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
