-- Omnichannel POS/location extension. Existing catalog, orders, images, and product codes are preserved.
ALTER TABLE `Role` MODIFY `name` ENUM('SUPER_ADMIN','STORE_MANAGER','INVENTORY_MANAGER','ORDER_MANAGER','CASHIER','DELIVERY_STAFF','SUPPORT_STAFF','BILLING_STAFF') NOT NULL;
ALTER TABLE `StockMovement` MODIFY `type` ENUM('OPENING_STOCK','ONLINE_RESERVATION','ONLINE_SALE','OFFLINE_SALE','RESERVATION_RELEASE','ORDER_CANCELLED','DELIVERY_FAILED','RETURN_RECEIVED','DAMAGED','EXPIRED','CORRECTION','SALE','RETURN','MANUAL_ADJUSTMENT','RESTOCK','CANCELLED_ORDER','PURCHASE','REFUND','PAYMENT_FAILURE','TRANSFER','AUDIT') NOT NULL;

ALTER TABLE `Product`
  ADD COLUMN `barcode` VARCHAR(191) NULL,
  ADD COLUMN `qrCode` VARCHAR(191) NULL,
  ADD COLUMN `pluCode` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Product_barcode_key` ON `Product`(`barcode`);
CREATE UNIQUE INDEX `Product_qrCode_key` ON `Product`(`qrCode`);
CREATE UNIQUE INDEX `Product_pluCode_key` ON `Product`(`pluCode`);
CREATE INDEX `Product_barcode_idx` ON `Product`(`barcode`);
CREATE INDEX `Product_qrCode_idx` ON `Product`(`qrCode`);
CREATE INDEX `Product_pluCode_idx` ON `Product`(`pluCode`);

CREATE TABLE `StoreLocation` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL DEFAULT 'STORE',
  `addressLine` VARCHAR(191) NULL,
  `city` VARCHAR(191) NULL,
  `state` VARCHAR(191) NULL,
  `pincode` VARCHAR(191) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `StoreLocation_code_key` ON `StoreLocation`(`code`);
CREATE INDEX `StoreLocation_code_idx` ON `StoreLocation`(`code`);
CREATE INDEX `StoreLocation_active_idx` ON `StoreLocation`(`active`);
CREATE INDEX `StoreLocation_isDefault_idx` ON `StoreLocation`(`isDefault`);

INSERT INTO `StoreLocation` (`id`, `code`, `name`, `type`, `addressLine`, `city`, `state`, `pincode`, `active`, `isDefault`, `createdAt`, `updatedAt`)
VALUES ('default-store', 'MAIN-STORE', 'Eagle Mart Main Store', 'STORE', 'GF-4, Siddharth Annexe, Sama-Savli Main Road, Vemali, New Sama', 'Vadodara', 'Gujarat', '390024', true, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `isDefault` = true, `active` = true, `updatedAt` = CURRENT_TIMESTAMP(3);

ALTER TABLE `Inventory`
  ADD COLUMN `locationId` VARCHAR(191) NULL;

UPDATE `Inventory` SET `locationId` = 'default-store' WHERE `locationId` IS NULL;

DROP INDEX `Inventory_productId_variantId_key` ON `Inventory`;
CREATE UNIQUE INDEX `Inventory_productId_variantId_locationId_key` ON `Inventory`(`productId`, `variantId`, `locationId`);
CREATE INDEX `Inventory_locationId_idx` ON `Inventory`(`locationId`);
ALTER TABLE `Inventory` ADD CONSTRAINT `Inventory_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `StoreLocation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `StockMovement`
  ADD COLUMN `locationId` VARCHAR(191) NULL,
  ADD COLUMN `targetLocationId` VARCHAR(191) NULL;

UPDATE `StockMovement` sm
JOIN `Inventory` inv ON inv.`id` = sm.`inventoryId`
SET sm.`locationId` = inv.`locationId`
WHERE sm.`locationId` IS NULL;

CREATE INDEX `StockMovement_locationId_idx` ON `StockMovement`(`locationId`);
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `StoreLocation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `OfflineSale`
  ADD COLUMN `locationId` VARCHAR(191) NULL;

UPDATE `OfflineSale` SET `locationId` = 'default-store' WHERE `locationId` IS NULL;

CREATE INDEX `OfflineSale_locationId_idx` ON `OfflineSale`(`locationId`);
ALTER TABLE `OfflineSale` ADD CONSTRAINT `OfflineSale_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `StoreLocation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
