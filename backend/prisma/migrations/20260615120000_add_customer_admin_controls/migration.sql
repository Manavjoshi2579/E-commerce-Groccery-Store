ALTER TABLE `User`
  MODIFY `status` ENUM('ACTIVE', 'INACTIVE', 'BLOCKED') NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN `deletedAt` DATETIME(3) NULL;

CREATE INDEX `User_deletedAt_idx` ON `User`(`deletedAt`);
