-- Auth security baseline: additive, preserves existing users/admins/passwords.
ALTER TABLE `User`
  ADD COLUMN `normalizedEmail` VARCHAR(191) NULL,
  ADD COLUMN `mobileNumber` VARCHAR(191) NULL,
  ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL,
  ADD COLUMN `mobileVerifiedAt` DATETIME(3) NULL,
  ADD COLUMN `failedLoginAttempts` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lockedUntil` DATETIME(3) NULL,
  ADD COLUMN `passwordChangedAt` DATETIME(3) NULL,
  ADD COLUMN `lastLoginAt` DATETIME(3) NULL;

UPDATE `User` SET `normalizedEmail` = LOWER(`email`) WHERE `email` IS NOT NULL AND `normalizedEmail` IS NULL;
UPDATE `User` SET `mobileNumber` = `phone` WHERE `phone` IS NOT NULL AND `mobileNumber` IS NULL;

CREATE UNIQUE INDEX `User_normalizedEmail_key` ON `User`(`normalizedEmail`);
CREATE UNIQUE INDEX `User_mobileNumber_key` ON `User`(`mobileNumber`);
CREATE INDEX `User_normalizedEmail_idx` ON `User`(`normalizedEmail`);
CREATE INDEX `User_mobileNumber_idx` ON `User`(`mobileNumber`);

ALTER TABLE `AdminUser`
  ADD COLUMN `normalizedEmail` VARCHAR(191) NULL,
  ADD COLUMN `failedLoginAttempts` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lockedUntil` DATETIME(3) NULL,
  ADD COLUMN `totpEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `encryptedTotpSecret` TEXT NULL,
  ADD COLUMN `totpVerifiedAt` DATETIME(3) NULL,
  ADD COLUMN `passwordChangedAt` DATETIME(3) NULL,
  ADD COLUMN `lastLoginAt` DATETIME(3) NULL;

UPDATE `AdminUser` SET `normalizedEmail` = LOWER(`email`) WHERE `normalizedEmail` IS NULL;

CREATE UNIQUE INDEX `AdminUser_normalizedEmail_key` ON `AdminUser`(`normalizedEmail`);
CREATE INDEX `AdminUser_normalizedEmail_idx` ON `AdminUser`(`normalizedEmail`);

CREATE TABLE `AuthSession` (
  `id` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `actorKind` ENUM('CUSTOMER','ADMIN') NOT NULL,
  `userId` VARCHAR(191) NULL,
  `adminUserId` VARCHAR(191) NULL,
  `status` ENUM('ACTIVE','REVOKED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `ipHash` VARCHAR(191) NULL,
  `userAgent` VARCHAR(255) NULL,
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE UNIQUE INDEX `AuthSession_tokenHash_key` ON `AuthSession`(`tokenHash`);
CREATE INDEX `AuthSession_actorKind_userId_idx` ON `AuthSession`(`actorKind`,`userId`);
CREATE INDEX `AuthSession_actorKind_adminUserId_idx` ON `AuthSession`(`actorKind`,`adminUserId`);
CREATE INDEX `AuthSession_status_expiresAt_idx` ON `AuthSession`(`status`,`expiresAt`);
ALTER TABLE `AuthSession` ADD CONSTRAINT `AuthSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AuthSession` ADD CONSTRAINT `AuthSession_adminUserId_fkey` FOREIGN KEY (`adminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `PasswordResetToken` (
  `id` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `actorKind` ENUM('CUSTOMER','ADMIN') NOT NULL,
  `userId` VARCHAR(191) NULL,
  `adminUserId` VARCHAR(191) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE UNIQUE INDEX `PasswordResetToken_tokenHash_key` ON `PasswordResetToken`(`tokenHash`);
CREATE INDEX `PasswordResetToken_actorKind_userId_consumedAt_idx` ON `PasswordResetToken`(`actorKind`,`userId`,`consumedAt`);
CREATE INDEX `PasswordResetToken_actorKind_adminUserId_consumedAt_idx` ON `PasswordResetToken`(`actorKind`,`adminUserId`,`consumedAt`);
CREATE INDEX `PasswordResetToken_expiresAt_idx` ON `PasswordResetToken`(`expiresAt`);
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `PasswordResetToken` ADD CONSTRAINT `PasswordResetToken_adminUserId_fkey` FOREIGN KEY (`adminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `EmailVerificationToken` (
  `id` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE UNIQUE INDEX `EmailVerificationToken_tokenHash_key` ON `EmailVerificationToken`(`tokenHash`);
CREATE INDEX `EmailVerificationToken_userId_consumedAt_idx` ON `EmailVerificationToken`(`userId`,`consumedAt`);
CREATE INDEX `EmailVerificationToken_expiresAt_idx` ON `EmailVerificationToken`(`expiresAt`);
ALTER TABLE `EmailVerificationToken` ADD CONSTRAINT `EmailVerificationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `MobileOtpChallenge` (
  `id` VARCHAR(191) NOT NULL,
  `otpHash` VARCHAR(191) NOT NULL,
  `purpose` ENUM('MOBILE_VERIFICATION','PASSWORD_RESET') NOT NULL,
  `userId` VARCHAR(191) NULL,
  `mobileNumber` VARCHAR(191) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `maxAttempts` INTEGER NOT NULL DEFAULT 5,
  `resetGrantHash` VARCHAR(191) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `resendAfter` DATETIME(3) NOT NULL,
  `verifiedAt` DATETIME(3) NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE UNIQUE INDEX `MobileOtpChallenge_resetGrantHash_key` ON `MobileOtpChallenge`(`resetGrantHash`);
CREATE INDEX `MobileOtpChallenge_mobileNumber_purpose_consumedAt_idx` ON `MobileOtpChallenge`(`mobileNumber`,`purpose`,`consumedAt`);
CREATE INDEX `MobileOtpChallenge_userId_purpose_consumedAt_idx` ON `MobileOtpChallenge`(`userId`,`purpose`,`consumedAt`);
CREATE INDEX `MobileOtpChallenge_expiresAt_idx` ON `MobileOtpChallenge`(`expiresAt`);
ALTER TABLE `MobileOtpChallenge` ADD CONSTRAINT `MobileOtpChallenge_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `OAuthAccount` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `provider` ENUM('GOOGLE','APPLE') NOT NULL,
  `providerAccountId` VARCHAR(191) NOT NULL,
  `providerEmail` VARCHAR(191) NULL,
  `emailVerified` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE UNIQUE INDEX `OAuthAccount_provider_providerAccountId_key` ON `OAuthAccount`(`provider`,`providerAccountId`);
CREATE INDEX `OAuthAccount_userId_idx` ON `OAuthAccount`(`userId`);
ALTER TABLE `OAuthAccount` ADD CONSTRAINT `OAuthAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `AdminMfaRecoveryCode` (
  `id` VARCHAR(191) NOT NULL,
  `adminUserId` VARCHAR(191) NOT NULL,
  `codeHash` VARCHAR(191) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE UNIQUE INDEX `AdminMfaRecoveryCode_codeHash_key` ON `AdminMfaRecoveryCode`(`codeHash`);
CREATE INDEX `AdminMfaRecoveryCode_adminUserId_usedAt_idx` ON `AdminMfaRecoveryCode`(`adminUserId`,`usedAt`);
ALTER TABLE `AdminMfaRecoveryCode` ADD CONSTRAINT `AdminMfaRecoveryCode_adminUserId_fkey` FOREIGN KEY (`adminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `AuthAuditLog` (
  `id` VARCHAR(191) NOT NULL,
  `actorKind` ENUM('CUSTOMER','ADMIN') NULL,
  `actorId` VARCHAR(191) NULL,
  `eventType` VARCHAR(191) NOT NULL,
  `success` BOOLEAN NOT NULL,
  `ipHash` VARCHAR(191) NULL,
  `userAgent` VARCHAR(255) NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE INDEX `AuthAuditLog_actorKind_actorId_idx` ON `AuthAuditLog`(`actorKind`,`actorId`);
CREATE INDEX `AuthAuditLog_eventType_idx` ON `AuthAuditLog`(`eventType`);
CREATE INDEX `AuthAuditLog_createdAt_idx` ON `AuthAuditLog`(`createdAt`);
