DROP INDEX `CartItem_cartId_productId_variantId_key` ON `CartItem`;

ALTER TABLE `CartItem`
  ADD COLUMN `customUnit` VARCHAR(191) NULL,
  ADD COLUMN `customMrp` DECIMAL(10, 2) NULL,
  ADD COLUMN `customPrice` DECIMAL(10, 2) NULL;

ALTER TABLE `CartItem`
  ADD UNIQUE INDEX `CartItem_cartId_productId_variantId_customUnit_key`(`cartId`, `productId`, `variantId`, `customUnit`);

ALTER TABLE `OrderItem`
  ADD COLUMN `unitSnapshot` VARCHAR(191) NULL;
