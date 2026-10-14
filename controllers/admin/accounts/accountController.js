const bcrypt = require('bcryptjs');
const prisma = require('../../../utils/prisma');
const { sanitizeAccount } = require('../../../utils/sanitize');
const { generatePassword, normalizeGuineaPhone } = require('../../../utils/functions');
const { claimPhoneNumber, revokeAllSessions } = require('../../../utils/stationAccess');

const MIN_ADMIN_PASSWORD_LENGTH = 8;

// Rattachement station d'un compte STATION, sans deviner via le loginCode.
const withStations = (account) => {
  const { memberships, ...rest } = account;
  return {
    ...sanitizeAccount(rest),
    ...(account.role === 'STATION' && {
      stations: (memberships || []).map((m) => ({
        id: m.station.id,
        name: m.station.name,
        slug: m.station.slug,
        membershipRole: m.role,
      })),
    }),
  };
};

// GET /admin/accounts?role=DRIVER
exports.getAccounts = async (req, res) => {
  const { role, status } = req.query;

  const accounts = await prisma.account.findMany({
    where: {
      ...(role && { role }),
      ...(status && { status }),
    },
    include: { memberships: { include: { station: { select: { id: true, name: true, slug: true } } } } },
    orderBy: { createdAt: 'desc' },
  });

  return res.status(200).json({ success: true, count: accounts.length, data: accounts.map(withStations) });
};

// GET /admin/accounts/:id
exports.getAccountById = async (req, res) => {
  const account = await prisma.account.findUnique({
    where: { id: req.params.id },
    include: { memberships: { include: { station: true } } },
  });

  if (!account) {
    return res.status(404).json({ success: false, message: 'Compte introuvable.' });
  }

  return res.status(200).json({ success: true, data: sanitizeAccount(account) });
};

// PUT /admin/accounts/:id/status
exports.updateAccountStatus = async (req, res) => {
  const { status } = req.body;

  if (!['ACTIVE', 'SUSPENDED', 'DELETED'].includes(status)) {
    return res.status(400).json({ success: false, message: 'status invalide.' });
  }

  const existing = await prisma.account.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Compte introuvable.' });
  }

  const account = await prisma.$transaction(async (tx) => {
    if (status !== 'ACTIVE') {
      await revokeAllSessions(existing.id, tx);
    }

    return tx.account.update({
      where: { id: existing.id },
      data: {
        status,
        // Un accès station supprimé libère son code et son numéro, pour qu'un
        // nouvel accès puisse les reprendre (POST /admin/stations/:id/accounts).
        ...(status === 'DELETED' && existing.role === 'STATION' && { loginCode: null, phoneNumber: null }),
      },
    });
  });

  return res.status(200).json({ success: true, message: `Compte ${status.toLowerCase()}.`, data: sanitizeAccount(account) });
};

// DELETE /admin/accounts/:id — suppression définitive d'un accès STATION.
// Ses sessions et rattachements disparaissent (cascade) ; les activités et
// signalements qu'il a produits restent, avec accountId à null.
exports.deleteAccount = async (req, res) => {
  const account = await prisma.account.findUnique({ where: { id: req.params.id } });

  if (!account) {
    return res.status(404).json({ success: false, message: 'Compte introuvable.' });
  }

  if (account.role !== 'STATION') {
    return res.status(400).json({
      success: false,
      message: 'Seul un accès station peut être supprimé. Pour un chauffeur ou un admin, utilisez PUT /admin/accounts/{id}/status.',
    });
  }

  await prisma.account.delete({ where: { id: account.id } });

  return res.status(200).json({ success: true, message: 'Accès station supprimé.' });
};

// POST /admin/accounts/:id/password — nouveau mot de passe pour un agent
// station, renvoyé une seule fois ; ses sessions en cours sont fermées.
exports.resetStationPassword = async (req, res) => {
  const account = await prisma.account.findUnique({ where: { id: req.params.id } });

  if (!account) {
    return res.status(404).json({ success: false, message: 'Compte introuvable.' });
  }

  if (account.role !== 'STATION') {
    return res.status(400).json({ success: false, message: 'Réservé aux comptes station.' });
  }

  if (!account.loginCode) {
    return res.status(400).json({ success: false, message: 'Cet accès a été supprimé : créez-en un nouveau.' });
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id: account.id }, data: { passwordHash } });
    await revokeAllSessions(account.id, tx);
  });

  return res.status(200).json({
    success: true,
    message: 'Mot de passe réinitialisé. Communiquez-le une seule fois, il ne sera plus affiché.',
    data: { accountId: account.id, loginCode: account.loginCode, password },
  });
};

// POST /admin/accounts/admins { fullName, phoneNumber, password? } — nouvel
// administrateur. Sans password, le serveur en génère un, renvoyé une seule fois.
exports.createAdmin = async (req, res) => {
  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
  const { password } = req.body;

  if (fullName.length < 3) {
    return res.status(400).json({ success: false, message: 'fullName est requis (3 caractères minimum).' });
  }

  const phoneNumber = normalizeGuineaPhone(req.body.phoneNumber);
  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: 'Numéro invalide : 9 chiffres guinéens, débutant par 6 ou 7.' });
  }

  if (password !== undefined && (typeof password !== 'string' || password.length < MIN_ADMIN_PASSWORD_LENGTH)) {
    return res.status(400).json({
      success: false,
      message: `Le mot de passe doit contenir au moins ${MIN_ADMIN_PASSWORD_LENGTH} caractères.`,
    });
  }

  const finalPassword = password || generatePassword(10);
  const passwordHash = await bcrypt.hash(finalPassword, 12);

  const account = await prisma.$transaction(async (tx) => {
    if (!(await claimPhoneNumber(phoneNumber, tx))) return null;
    return tx.account.create({ data: { role: 'ADMIN', status: 'ACTIVE', fullName, phoneNumber, passwordHash } });
  });

  if (!account) {
    return res.status(409).json({ success: false, message: 'Ce numéro est déjà utilisé par un autre compte.' });
  }

  return res.status(201).json({
    success: true,
    message: password ? 'Administrateur créé.' : 'Administrateur créé. Communiquez ce mot de passe une seule fois.',
    data: { ...sanitizeAccount(account), ...(!password && { password: finalPassword }) },
  });
};
