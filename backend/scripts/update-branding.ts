import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const oldBrand = "Eagle" + "club";
const oldBusinessName = `${oldBrand} Grocery & Essentials`;

async function main() {
  await prisma.setting.upsert({
    where: { key: "storeName" },
    update: { value: "Eagle Mart Grocery & Essentials" },
    create: { key: "storeName", value: "Eagle Mart Grocery & Essentials", type: "STRING" },
  });

  await prisma.setting.upsert({
    where: { key: "supportEmail" },
    update: { value: "support@eaglemart.in" },
    create: { key: "supportEmail", value: "support@eaglemart.in", type: "STRING" },
  });

  await prisma.adminUser.updateMany({
    where: { name: { contains: oldBrand } },
    data: { name: "Eagle Mart Super Admin" },
  });

  await prisma.brand.updateMany({
    where: { name: `${oldBrand} Select` },
    data: { name: "Eagle Mart Select", slug: "eagle-mart-select" },
  });

  await prisma.brand.updateMany({
    where: { name: `${oldBrand} Farms` },
    data: { name: "Eagle Mart Farms", slug: "eagle-mart-farms" },
  });

  const products = await prisma.product.findMany({
    where: { description: { contains: oldBusinessName } },
    select: { id: true, description: true },
  });

  for (const product of products) {
    await prisma.product.update({
      where: { id: product.id },
      data: { description: product.description.replaceAll(oldBusinessName, "Eagle Mart Grocery & Essentials") },
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
