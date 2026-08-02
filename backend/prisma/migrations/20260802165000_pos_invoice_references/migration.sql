ALTER TABLE `Invoice` MODIFY `orderId` VARCHAR(191) NULL;
ALTER TABLE `Invoice` ADD COLUMN `offlineSaleId` VARCHAR(191) NULL;

ALTER TABLE `OfflineSale` ADD COLUMN `invoiceNumber` VARCHAR(191) NULL;
ALTER TABLE `OfflineSale` ADD COLUMN `receiptNumber` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Invoice_offlineSaleId_key` ON `Invoice`(`offlineSaleId`);
CREATE INDEX `Invoice_offlineSaleId_idx` ON `Invoice`(`offlineSaleId`);
CREATE UNIQUE INDEX `OfflineSale_invoiceNumber_key` ON `OfflineSale`(`invoiceNumber`);
CREATE UNIQUE INDEX `OfflineSale_receiptNumber_key` ON `OfflineSale`(`receiptNumber`);
CREATE INDEX `OfflineSale_invoiceNumber_idx` ON `OfflineSale`(`invoiceNumber`);
CREATE INDEX `OfflineSale_receiptNumber_idx` ON `OfflineSale`(`receiptNumber`);

ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_offlineSaleId_fkey` FOREIGN KEY (`offlineSaleId`) REFERENCES `OfflineSale`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
