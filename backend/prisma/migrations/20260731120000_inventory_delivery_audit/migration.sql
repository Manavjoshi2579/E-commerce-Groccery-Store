ALTER TABLE `Inventory`
  ADD COLUMN `reserved` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `sold` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `damaged` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `returned` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `adjustment` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `StockMovement`
  MODIFY `type` ENUM('OPENING_STOCK','ONLINE_RESERVATION','ONLINE_SALE','OFFLINE_SALE','RESERVATION_RELEASE','ORDER_CANCELLED','DELIVERY_FAILED','RETURN_RECEIVED','DAMAGED','EXPIRED','CORRECTION','SALE','RETURN','MANUAL_ADJUSTMENT','RESTOCK','CANCELLED_ORDER') NOT NULL,
  ADD COLUMN `quantityBefore` INTEGER NULL,
  ADD COLUMN `quantityAfter` INTEGER NULL,
  ADD COLUMN `channel` ENUM('ONLINE','OFFLINE','ADMIN','SYSTEM') NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN `referenceType` VARCHAR(191) NULL,
  ADD COLUMN `referenceId` VARCHAR(191) NULL,
  ADD COLUMN `actorType` VARCHAR(191) NULL,
  ADD COLUMN `actorId` VARCHAR(191) NULL,
  ADD COLUMN `idempotencyKey` VARCHAR(191) NULL,
  ADD COLUMN `metadata` JSON NULL;

CREATE UNIQUE INDEX `StockMovement_idempotencyKey_key` ON `StockMovement`(`idempotencyKey`);
CREATE INDEX `StockMovement_referenceType_referenceId_idx` ON `StockMovement`(`referenceType`, `referenceId`);

ALTER TABLE `DeliveryAssignment`
  MODIFY `status` ENUM('NOT_ASSIGNED','ASSIGNED','PICKED_UP','OUT_FOR_DELIVERY','DELIVERED','FAILED') NOT NULL DEFAULT 'ASSIGNED',
  ADD COLUMN `acceptedAt` DATETIME(3) NULL,
  ADD COLUMN `outForDeliveryAt` DATETIME(3) NULL,
  ADD COLUMN `handedOverAt` DATETIME(3) NULL,
  ADD COLUMN `failedAt` DATETIME(3) NULL,
  ADD COLUMN `failureReason` VARCHAR(191) NULL,
  ADD COLUMN `failureNote` VARCHAR(191) NULL,
  ADD COLUMN `metadata` JSON NULL;

CREATE INDEX `DeliveryAssignment_status_idx` ON `DeliveryAssignment`(`status`);

CREATE TABLE `CustomerDeliveryConfirmation` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `customerId` VARCHAR(191) NOT NULL,
  `confirmedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `note` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `CustomerDeliveryConfirmation_orderId_key` ON `CustomerDeliveryConfirmation`(`orderId`);
CREATE INDEX `CustomerDeliveryConfirmation_customerId_idx` ON `CustomerDeliveryConfirmation`(`customerId`);
CREATE INDEX `CustomerDeliveryConfirmation_confirmedAt_idx` ON `CustomerDeliveryConfirmation`(`confirmedAt`);

CREATE TABLE `OrderStatusHistory` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `previousStatus` ENUM('PENDING','CONFIRMED','PACKED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','RETURN_REQUESTED','REFUNDED') NULL,
  `newStatus` ENUM('PENDING','CONFIRMED','PACKED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','RETURN_REQUESTED','REFUNDED') NOT NULL,
  `actorType` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NULL,
  `reason` VARCHAR(191) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `OrderStatusHistory_orderId_idx` ON `OrderStatusHistory`(`orderId`);
CREATE INDEX `OrderStatusHistory_newStatus_idx` ON `OrderStatusHistory`(`newStatus`);
CREATE INDEX `OrderStatusHistory_createdAt_idx` ON `OrderStatusHistory`(`createdAt`);

CREATE TABLE `OfflineSale` (
  `id` VARCHAR(191) NOT NULL,
  `referenceNumber` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NOT NULL,
  `total` DECIMAL(10,2) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'RECORDED',
  `note` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `OfflineSale_referenceNumber_key` ON `OfflineSale`(`referenceNumber`);
CREATE INDEX `OfflineSale_actorId_idx` ON `OfflineSale`(`actorId`);
CREATE INDEX `OfflineSale_status_idx` ON `OfflineSale`(`status`);
CREATE INDEX `OfflineSale_createdAt_idx` ON `OfflineSale`(`createdAt`);

CREATE TABLE `OfflineSaleItem` (
  `id` VARCHAR(191) NOT NULL,
  `offlineSaleId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `variantId` VARCHAR(191) NULL,
  `quantity` INTEGER NOT NULL,
  `unitPrice` DECIMAL(10,2) NOT NULL,
  `total` DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `OfflineSaleItem_offlineSaleId_idx` ON `OfflineSaleItem`(`offlineSaleId`);
CREATE INDEX `OfflineSaleItem_productId_idx` ON `OfflineSaleItem`(`productId`);
CREATE INDEX `OfflineSaleItem_variantId_idx` ON `OfflineSaleItem`(`variantId`);

ALTER TABLE `CustomerDeliveryConfirmation` ADD CONSTRAINT `CustomerDeliveryConfirmation_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CustomerDeliveryConfirmation` ADD CONSTRAINT `CustomerDeliveryConfirmation_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OrderStatusHistory` ADD CONSTRAINT `OrderStatusHistory_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OfflineSale` ADD CONSTRAINT `OfflineSale_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OfflineSaleItem` ADD CONSTRAINT `OfflineSaleItem_offlineSaleId_fkey` FOREIGN KEY (`offlineSaleId`) REFERENCES `OfflineSale`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OfflineSaleItem` ADD CONSTRAINT `OfflineSaleItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OfflineSaleItem` ADD CONSTRAINT `OfflineSaleItem_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
