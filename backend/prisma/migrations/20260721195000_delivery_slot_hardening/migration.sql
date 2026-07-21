ALTER TABLE `DeliverySlot`
  ADD COLUMN `maxOrdersPerDate` INTEGER NULL,
  ADD COLUMN `minOrderAmount` DECIMAL(10, 2) NULL,
  ADD COLUMN `deliveryTypeEligibility` VARCHAR(191) NOT NULL DEFAULT 'DELIVERY',
  ADD COLUMN `advanceBookingDays` INTEGER NULL,
  ADD COLUMN `sameDayCutoffTime` VARCHAR(191) NULL,
  ADD COLUMN `displayOrder` INTEGER NOT NULL DEFAULT 0;

CREATE TABLE `DeliveryHoliday` (
  `id` VARCHAR(191) NOT NULL,
  `date` DATETIME(3) NOT NULL,
  `scope` ENUM('DELIVERY', 'PICKUP', 'ALL') NOT NULL DEFAULT 'DELIVERY',
  `reason` VARCHAR(191) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `DeliveryHoliday_date_scope_key`(`date`, `scope`),
  INDEX `DeliveryHoliday_date_idx`(`date`),
  INDEX `DeliveryHoliday_active_idx`(`active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `DeliverySlot_active_displayOrder_idx` ON `DeliverySlot`(`active`, `displayOrder`);
