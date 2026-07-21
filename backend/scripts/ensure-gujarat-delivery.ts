import "../lib/load-env.js";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { gujaratPincodePrefixes } from "../lib/gujarat-pincodes.js";

const prisma = new PrismaClient();
const money = (value: number) => new Decimal(value);

async function main() {
  const zone = await prisma.deliveryZone.upsert({
    where: { city: "Gujarat" },
    update: {
      pincodes: gujaratPincodePrefixes,
      deliveryCharge: money(49),
      freeDeliveryThreshold: money(799),
      active: true,
    },
    create: {
      city: "Gujarat",
      pincodes: gujaratPincodePrefixes,
      deliveryCharge: money(49),
      freeDeliveryThreshold: money(799),
      active: true,
    },
  });

  for (const [label, startTime, endTime, capacity] of [
    ["Morning", "07:00", "09:00", 150],
    ["Midday", "10:00", "12:00", 150],
    ["Afternoon", "14:00", "16:00", 150],
    ["Evening", "18:00", "21:00", 180],
  ] as const) {
    const existing = await prisma.deliverySlot.findFirst({ where: { zoneId: zone.id, label } });
    if (existing) {
      await prisma.deliverySlot.update({ where: { id: existing.id }, data: { startTime, endTime, capacity, active: true } });
    } else {
      await prisma.deliverySlot.create({ data: { zoneId: zone.id, label, startTime, endTime, capacity, active: true } });
    }
  }

  await prisma.deliveryStaff.upsert({
    where: { phone: "9999999999" },
    update: { name: "Eagle Mart Delivery", zoneId: zone.id, active: true },
    create: { name: "Eagle Mart Delivery", phone: "9999999999", zoneId: zone.id, active: true },
  });

  console.log("Gujarat delivery coverage, slots, and default delivery staff are enabled.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
