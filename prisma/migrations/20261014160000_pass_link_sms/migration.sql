-- Journal des SMS « lien du pass » demandés depuis l'app iPhone
-- (POST /app/subscriptions/pass-link). Sert uniquement à la limite
-- d'envoi : 1 SMS par compte toutes les 2 minutes, 5 par jour.
CREATE TABLE `pass_link_sms` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pass_link_sms_accountId_createdAt_idx`(`accountId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `pass_link_sms` ADD CONSTRAINT `pass_link_sms_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
