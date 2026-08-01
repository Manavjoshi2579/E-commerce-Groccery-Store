import "dotenv/config";
import { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { db } from "../lib/db.js";

const deliveredCodPending = await db.order.findMany({
  where: {
    status: OrderStatus.DELIVERED,
    paymentStatus: PaymentStatus.COD_PENDING,
    payment: { method: PaymentMethod.COD, status: PaymentStatus.COD_PENDING },
  },
  select: { id: true, orderNumber: true },
});

for (const order of deliveredCodPending) {
  await db.$transaction([
    db.payment.update({
      where: { orderId: order.id },
      data: {
        status: PaymentStatus.PAID,
        rawPayload: {
          reconciledBy: "reconcile-delivered-cod-payments",
          reason: "Delivered COD order cannot remain COD pending.",
          updatedAt: new Date().toISOString(),
        },
      },
    }),
    db.order.update({
      where: { id: order.id },
      data: { paymentStatus: PaymentStatus.PAID },
    }),
  ]);
}

console.log(`Reconciled delivered COD payments: ${deliveredCodPending.length}`);
if (deliveredCodPending.length) {
  console.log(deliveredCodPending.map((order) => order.orderNumber).join(", "));
}

await db.$disconnect();
