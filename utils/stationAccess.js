const prisma = require('./prisma');

/**
 * Règles communes aux comptes STATION (création par un admin, inscription
 * depuis l'app, suppression). Une station peut avoir plusieurs agents, chacun
 * avec son propre compte et son propre loginCode.
 */

// loginCode du compte : le slug de la station pour le premier, puis
// "<slug>-2", "<slug>-3"… Un code libéré par une suppression est réutilisé.
const nextLoginCode = async (slug, db = prisma) => {
  const taken = await db.account.findMany({
    where: { loginCode: { startsWith: slug } },
    select: { loginCode: true },
  });
  const used = new Set(taken.map((a) => a.loginCode));

  if (!used.has(slug)) return slug;

  for (let n = 2; ; n += 1) {
    const candidate = `${slug}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
};

// OWNER pour le premier agent encore actif de la station, STAFF ensuite.
const nextMembershipRole = async (stationId, db = prisma) => {
  const members = await db.stationMembership.count({
    where: { stationId, account: { status: { not: 'DELETED' } } },
  });
  return members === 0 ? 'OWNER' : 'STAFF';
};

/**
 * Vérifie qu'un numéro peut être attribué à un nouveau compte. Un numéro
 * encore porté par un compte DELETED (suppression logique d'avant cette
 * version) est libéré au passage. Retourne false si un compte non supprimé
 * l'utilise.
 */
const claimPhoneNumber = async (phoneNumber, db = prisma) => {
  const holder = await db.account.findUnique({ where: { phoneNumber }, select: { id: true, status: true } });

  if (!holder) return true;
  if (holder.status !== 'DELETED') return false;

  await db.account.update({ where: { id: holder.id }, data: { phoneNumber: null } });
  return true;
};

// Déconnecte toutes les sessions d'un compte : refresh tokens révoqués, et
// tokens d'accès refusés par le middleware auth (Account.sessionsRevokedAt).
const revokeAllSessions = async (accountId, db = prisma) => {
  const now = new Date();
  await db.session.updateMany({ where: { accountId, revokedAt: null }, data: { revokedAt: now } });
  await db.account.update({ where: { id: accountId }, data: { sessionsRevokedAt: now } });
};

module.exports = {
  nextLoginCode,
  nextMembershipRole,
  claimPhoneNumber,
  revokeAllSessions,
};
