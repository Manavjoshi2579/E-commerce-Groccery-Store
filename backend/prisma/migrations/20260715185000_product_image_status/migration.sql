ALTER TABLE `Product`
  ADD COLUMN `imageStatus` ENUM('VERIFIED', 'PLACEHOLDER', 'NEEDS_REVIEW') NOT NULL DEFAULT 'PLACEHOLDER',
  ADD COLUMN `imageSource` VARCHAR(191) NULL,
  ADD COLUMN `imageCheckedAt` DATETIME(3) NULL;

CREATE INDEX `Product_imageStatus_idx` ON `Product`(`imageStatus`);
