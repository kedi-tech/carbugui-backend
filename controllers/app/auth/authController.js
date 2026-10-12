const bcrypt = require('bcryptjs');
const prisma = require('../../../utils/prisma');
const { generateOtpCode } = require('../../../utils/functions');
const { sendOtpCode } = require('../../../utils/sms');
const { verifyRefreshToken, hashToken } = require('../../../utils/jwt');
const { createSession } = require('../../../utils/session');
const { sanitizeAccount } = require('../../../utils/sanitize');
const { getSubscriptionStatus } = require('../../../utils/subscriptions');
const { formatStatus } = require('../subscriptions/subscriptionController');

const PHONE_REGEX = /^\+224[0-9]{8,9}$/;
const OTP_TTL_MINUTES = 10;

// POST /app/auth/otp/request
exports.requestOtp = async (req, res) => {
  const { phoneNumber, purpose = 'SIGN_IN' } = req.body;

  if (!phoneNumber || !PHONE_REGEX.test(phoneNumber)) {
    return res.status(400).json({ success: false, message: 'Numéro invalide. Format attendu : +224XXXXXXXXX.' });
  }

  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);

  await prisma.otpChallenge.create({
    data: {
      phoneNumber,
      purpose,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      ipAddress: req.ip,
    },
  });

  await sendOtpCode(phoneNumber, code, purpose);

  return res.status(200).json({ success: true, message: `Code envoyé au ${phoneNumber}.` });
};

// POST /app/auth/otp/verify
exports.verifyOtp = async (req, res) => {
  const { phoneNumber, code } = req.body;

  if (!phoneNumber || !code) {
    return res.status(400).json({ success: false, message: 'phoneNumber et code sont requis.' });
  }

  const challenge = await prisma.otpChallenge.findFirst({
    where: { phoneNumber, purpose: 'SIGN_IN', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!challenge) {
    return res.status(400).json({ success: false, message: 'Aucun code en attente pour ce numéro.' });
  }

  if (challenge.expiresAt < new Date()) {
    return res.status(400).json({ success: false, message: 'Ce code a expiré.' });
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    return res.status(429).json({ success: false, message: 'Trop de tentatives. Redemandez un code.' });
  }

  const isValid = await bcrypt.compare(code, challenge.codeHash);

  if (!isValid) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return res.status(400).json({ success: false, message: 'Code incorrect.' });
  }

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  const account = await prisma.account.upsert({
    where: { phoneNumber },
    update: { lastSeenAt: new Date() },
    create: { phoneNumber, role: 'DRIVER', fullName: req.body.fullName || null },
  });

  if (account.status !== 'ACTIVE') {
    return res.status(403).json({ success: false, message: 'Ce compte est suspendu ou supprimé.' });
  }

  const tokens = await createSession(account, req);

  return res.status(200).json({ success: true, account: sanitizeAccount(account), ...tokens });
};

// POST /app/auth/refresh
exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ success: false, message: 'refreshToken est requis.' });
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Refresh token invalide ou expiré.' });
  }

  const session = await prisma.session.findUnique({ where: { refreshTokenHash: hashToken(refreshToken) } });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return res.status(401).json({ success: false, message: 'Session invalide. Reconnectez-vous.' });
  }

  const account = await prisma.account.findUnique({ where: { id: decoded.accountId } });

  if (!account || account.status !== 'ACTIVE') {
    return res.status(401).json({ success: false, message: 'Compte introuvable ou suspendu.' });
  }

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });

  const tokens = await createSession(account, req);

  return res.status(200).json({ success: true, ...tokens });
};

// POST /app/auth/logout
exports.logout = async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    await prisma.session.updateMany({
      where: { refreshTokenHash: hashToken(refreshToken), accountId: req.auth.accountId },
      data: { revokedAt: new Date() },
    });
  }

  return res.status(200).json({ success: true, message: 'Déconnecté avec succès.' });
};

// GET /app/auth/me
exports.getMe = async (req, res) => {
  const account = await prisma.account.findUnique({
    where: { id: req.auth.accountId },
    include: { defaultArea: true },
  });

  const subscription = formatStatus(await getSubscriptionStatus(account.id));

  return res.status(200).json({ success: true, data: { ...sanitizeAccount(account), subscription } });
};

// PUT /app/auth/me
exports.updateMe = async (req, res) => {
  const { fullName, locale, defaultAreaId } = req.body;

  const account = await prisma.account.update({
    where: { id: req.auth.accountId },
    data: {
      ...(fullName !== undefined && { fullName }),
      ...(locale !== undefined && { locale }),
      ...(defaultAreaId !== undefined && { defaultAreaId }),
    },
  });

  return res.status(200).json({ success: true, data: sanitizeAccount(account) });
};

// POST /app/auth/push-token
exports.registerPushToken = async (req, res) => {
  const { token, platform } = req.body;

  if (!token || !platform) {
    return res.status(400).json({ success: false, message: 'token et platform sont requis.' });
  }

  const pushToken = await prisma.pushToken.upsert({
    where: { token },
    update: { accountId: req.auth.accountId, platform, lastSeenAt: new Date() },
    create: { accountId: req.auth.accountId, token, platform },
  });

  return res.status(200).json({ success: true, data: pushToken });
};
