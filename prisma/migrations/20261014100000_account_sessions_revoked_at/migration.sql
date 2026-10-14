-- Révocation immédiate des tokens d'accès d'un compte (mot de passe
-- réinitialisé par un admin, compte suspendu ou supprimé) : le middleware
-- auth refuse tout JWT émis avant cette date.
ALTER TABLE `accounts` ADD COLUMN `sessionsRevokedAt` DATETIME(3) NULL;
