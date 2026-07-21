-- Pending signup verification: stores no customer account until OTP is verified.
CREATE TABLE `PendingSignup` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `normalizedEmail` VARCHAR(191) NOT NULL,
  `mobileNumber` VARCHAR(191) NOT NULL,
  `passwordHash` VARCHAR(191) NOT NULL,
  `channel` ENUM('EMAIL','MOBILE') NOT NULL,
  `otpHash` VARCHAR(191) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `maxAttempts` INTEGER NOT NULL DEFAULT 5,
  `expiresAt` DATETIME(3) NOT NULL,
  `resendAfter` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `PendingSignup_normalizedEmail_consumedAt_idx` ON `PendingSignup`(`normalizedEmail`,`consumedAt`);
CREATE INDEX `PendingSignup_mobileNumber_consumedAt_idx` ON `PendingSignup`(`mobileNumber`,`consumedAt`);
CREATE INDEX `PendingSignup_expiresAt_idx` ON `PendingSignup`(`expiresAt`);
