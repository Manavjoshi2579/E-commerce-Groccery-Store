ALTER TABLE `DeliveryStaff`
  ADD COLUMN `adminUserId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `DeliveryStaff_adminUserId_key` ON `DeliveryStaff`(`adminUserId`);
CREATE INDEX `DeliveryStaff_adminUserId_idx` ON `DeliveryStaff`(`adminUserId`);

ALTER TABLE `DeliveryStaff`
  ADD CONSTRAINT `DeliveryStaff_adminUserId_fkey` FOREIGN KEY (`adminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
