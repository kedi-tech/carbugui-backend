-- Pass offerts par un admin (compte de test App Review, geste commercial) :
-- aucune ligne payments derrière, d'où paymentId nullable (l'index unique
-- MySQL accepte plusieurs NULL). grantedById/note tracent qui l'a offert.
-- expiryNotifiedAt : date d'envoi du SMS « pass expiré » (utils/subscriptions.js).
ALTER TABLE `subscriptions` ADD COLUMN `expiryNotifiedAt` DATETIME(3) NULL,
    ADD COLUMN `grantedById` VARCHAR(191) NULL,
    ADD COLUMN `note` VARCHAR(191) NULL,
    MODIFY `paymentId` VARCHAR(191) NULL;

CREATE INDEX `subscriptions_endsAt_expiryNotifiedAt_idx` ON `subscriptions`(`endsAt`, `expiryNotifiedAt`);

-- Les périodes déjà terminées au déploiement ne reçoivent pas de SMS a posteriori.
UPDATE `subscriptions` SET `expiryNotifiedAt` = CURRENT_TIMESTAMP(3) WHERE `endsAt` <= CURRENT_TIMESTAMP(3);
