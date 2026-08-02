-- Add audited offline POS sync conflict storage. Existing sales and stock are preserved.
CREATE TABLE `OfflineSyncConflict` (
  `id` VARCHAR(191) NOT NULL,
  `localReference` VARCHAR(191) NOT NULL,
  `serverReference` VARCHAR(191) NULL,
  `idempotencyKey` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL,
  `reason` VARCHAR(191) NOT NULL,
  `retryable` BOOLEAN NOT NULL DEFAULT false,
  `locationId` VARCHAR(191) NULL,
  `cashierId` VARCHAR(191) NULL,
  `deviceId` VARCHAR(191) NULL,
  `payload` JSON NOT NULL,
  `result` JSON NULL,
  `resolutionNote` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `reviewedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `OfflineSyncConflict_localReference_key` ON `OfflineSyncConflict`(`localReference`);
CREATE UNIQUE INDEX `OfflineSyncConflict_idempotencyKey_key` ON `OfflineSyncConflict`(`idempotencyKey`);
CREATE INDEX `OfflineSyncConflict_status_idx` ON `OfflineSyncConflict`(`status`);
CREATE INDEX `OfflineSyncConflict_locationId_idx` ON `OfflineSyncConflict`(`locationId`);
CREATE INDEX `OfflineSyncConflict_cashierId_idx` ON `OfflineSyncConflict`(`cashierId`);
CREATE INDEX `OfflineSyncConflict_deviceId_idx` ON `OfflineSyncConflict`(`deviceId`);
CREATE INDEX `OfflineSyncConflict_createdAt_idx` ON `OfflineSyncConflict`(`createdAt`);

ALTER TABLE `OfflineSyncConflict` ADD CONSTRAINT `OfflineSyncConflict_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `StoreLocation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `OfflineSyncConflict` ADD CONSTRAINT `OfflineSyncConflict_cashierId_fkey` FOREIGN KEY (`cashierId`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `OfflineSyncConflict` ADD CONSTRAINT `OfflineSyncConflict_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
