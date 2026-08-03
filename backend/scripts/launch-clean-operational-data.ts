import "../lib/load-env.js";
import { db } from "../lib/db.js";

async function main() {
  const before = {
    customers: await db.user.count(),
    orders: await db.order.count(),
    payments: await db.payment.count(),
    invoices: await db.invoice.count(),
    offlineSales: await db.offlineSale.count(),
    supportTickets: await db.supportTicket.count(),
  };

  await db.$transaction(async (tx) => {
    await tx.refund.deleteMany();
    await tx.returnRequest.deleteMany();
    await tx.review.deleteMany();
    await tx.customerDeliveryConfirmation.deleteMany();
    await tx.deliveryAssignment.deleteMany();
    await tx.offlineSaleItem.deleteMany();
    await tx.offlineSyncConflict.deleteMany();
    await tx.invoice.deleteMany();
    await tx.payment.deleteMany();
    await tx.couponUsage.deleteMany();
    await tx.stockMovement.deleteMany();
    await tx.orderStatusHistory.deleteMany();
    await tx.orderItem.deleteMany();
    await tx.supportTicket.deleteMany();
    await tx.order.deleteMany();
    await tx.wishlistItem.deleteMany();
    await tx.wishlist.deleteMany();
    await tx.cartItem.deleteMany();
    await tx.cart.deleteMany();
    await tx.oAuthAccount.deleteMany();
    await tx.mobileOtpChallenge.deleteMany();
    await tx.emailVerificationToken.deleteMany();
    await tx.passwordResetToken.deleteMany();
    await tx.authSession.deleteMany();
    await tx.authAuditLog.deleteMany();
    await tx.address.deleteMany();
    await tx.user.deleteMany();
    await tx.offlineSale.deleteMany();
    await tx.coupon.updateMany({ data: { usedCount: 0 } });
    await tx.inventory.updateMany({
      data: {
        reserved: 0,
        sold: 0,
        outgoing: 0,
        returned: 0,
      },
    });
    await tx.setting.deleteMany({
      where: {
        key: {
          startsWith: "order:",
        },
      },
    });
    await tx.setting.deleteMany({
      where: {
        key: {
          startsWith: "invoice:",
        },
      },
    });
    await tx.setting.deleteMany({
      where: {
        key: {
          startsWith: "offline-sale:",
        },
      },
    });
  });

  const after = {
    customers: await db.user.count(),
    orders: await db.order.count(),
    payments: await db.payment.count(),
    invoices: await db.invoice.count(),
    offlineSales: await db.offlineSale.count(),
    supportTickets: await db.supportTicket.count(),
  };

  console.log(JSON.stringify({ before, after }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
