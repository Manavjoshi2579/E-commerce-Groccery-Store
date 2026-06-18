import { PrismaClient } from "@prisma/client";
import { databaseConnectionMessage } from "../lib/db-health.js";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(`${databaseConnectionMessage} DATABASE_URL is missing.`);
    process.exitCode = 1;
    return;
  }

  await prisma.$queryRaw`SELECT 1`;
  const [users, admins, categories, products, orders, payments] = await Promise.all([
    prisma.user.count(),
    prisma.adminUser.count(),
    prisma.category.count(),
    prisma.product.count(),
    prisma.order.count(),
    prisma.payment.count(),
  ]);

  console.log("Database connected.");
  console.table({ users, admins, categories, products, orders, payments });
}

main()
  .catch((error) => {
    console.error(databaseConnectionMessage);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
