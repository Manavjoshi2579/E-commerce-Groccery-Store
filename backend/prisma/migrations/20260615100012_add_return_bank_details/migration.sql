-- AlterTable
ALTER TABLE `ReturnRequest` ADD COLUMN `bankAccountHolder` VARCHAR(191) NULL,
    ADD COLUMN `bankAccountNumber` VARCHAR(191) NULL,
    ADD COLUMN `bankIfsc` VARCHAR(191) NULL,
    ADD COLUMN `bankName` VARCHAR(191) NULL;
