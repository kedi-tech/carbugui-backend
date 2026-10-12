-- Abonnements chauffeurs (24 h / 1 mois) payés via un lien de paiement Djomy.
-- Les anciennes tables plans/subscriptions/payments/webhook_events ont été
-- supprimées par 20260908115213_remove_subscription_payment ; celles-ci les
-- remplacent avec un modèle différent (une ligne Subscription par période
-- achetée, liée 1-1 au Payment qui l'a payée).

CREATE TABLE `plans` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `priceGnf` INTEGER NOT NULL,
    `durationHours` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `plans_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payments` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `amountGnf` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `merchantReference` VARCHAR(191) NOT NULL,
    `paymentLinkReference` VARCHAR(191) NULL,
    `paymentUrl` TEXT NULL,
    `linkExpiresAt` DATETIME(3) NULL,
    `transactionId` VARCHAR(191) NULL,
    `paymentMethod` VARCHAR(191) NULL,
    `payerIdentifier` VARCHAR(191) NULL,
    `paidAmount` INTEGER NULL,
    `receivedAmount` INTEGER NULL,
    `fees` INTEGER NULL,
    `providerReference` VARCHAR(191) NULL,
    `failureReason` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payments_merchantReference_key`(`merchantReference`),
    UNIQUE INDEX `payments_paymentLinkReference_key`(`paymentLinkReference`),
    UNIQUE INDEX `payments_transactionId_key`(`transactionId`),
    INDEX `payments_accountId_createdAt_idx`(`accountId`, `createdAt`),
    INDEX `payments_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `subscriptions_paymentId_key`(`paymentId`),
    INDEX `subscriptions_accountId_endsAt_idx`(`accountId`, `endsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `webhook_events` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `eventId` VARCHAR(191) NULL,
    `eventType` VARCHAR(191) NULL,
    `signatureValid` BOOLEAN NOT NULL DEFAULT false,
    `payload` JSON NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,
    `error` TEXT NULL,

    INDEX `webhook_events_provider_eventId_idx`(`provider`, `eventId`),
    INDEX `webhook_events_receivedAt_idx`(`receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `payments` ADD CONSTRAINT `payments_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `payments` ADD CONSTRAINT `payments_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Les deux offres, pour que le paiement fonctionne dès `migrate deploy`
-- (prisma/seed.js les resynchronise aussi). Prix modifiables ensuite par un
-- admin via PUT /admin/subscriptions/plans/{code}.
INSERT INTO `plans` (`id`, `code`, `label`, `priceGnf`, `durationHours`, `isActive`, `sortOrder`) VALUES
    ('plan_day', 'DAY', '24 heures', 2000, 24, true, 0),
    ('plan_month', 'MONTH', '1 mois', 10000, 720, true, 1);
