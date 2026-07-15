ALTER TABLE `Product`
  ADD COLUMN `clientProductCode` VARCHAR(191) NULL,
  ADD COLUMN `importIdentity` VARCHAR(191) NULL,
  ADD COLUMN `sourceCategory` VARCHAR(191) NULL;

ALTER TABLE `ProductVariant`
  ADD COLUMN `costPrice` DECIMAL(10, 2) NULL,
  ADD COLUMN `sourceUnit` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Product_importIdentity_key` ON `Product`(`importIdentity`);
CREATE INDEX `Product_clientProductCode_idx` ON `Product`(`clientProductCode`);
