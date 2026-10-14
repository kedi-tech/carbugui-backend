const prisma = require('../utils/prisma');
const { verifyAccessToken } = require('../utils/jwt');

// Un JWT d'accès émis avant Account.sessionsRevokedAt (mot de passe
// réinitialisé, compte suspendu…) est refusé, même s'il n'a pas expiré.
// iat est en secondes : un token émis dans la même seconde que la
// révocation reste accepté (c'est celui de la reconnexion qui la suit).
const isTokenRevoked = (account, decoded) =>
  Boolean(account.sessionsRevokedAt && decoded.iat
    && decoded.iat < Math.floor(account.sessionsRevokedAt.getTime() / 1000));

/**
 * Vérifie le JWT d'accès et charge le compte (Account) associé. Le rôle
 * (DRIVER / STATION / ADMIN) est déjà dans le token mais on relit le compte
 * pour bloquer un compte suspendu/supprimé dont le token est encore valide.
 */
const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Accès refusé. Token manquant ou invalide.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const account = await prisma.account.findUnique({ where: { id: decoded.accountId } });

    if (!account) {
      return res.status(401).json({ success: false, message: 'Compte introuvable.' });
    }

    if (isTokenRevoked(account, decoded)) {
      return res.status(401).json({ success: false, message: 'Session révoquée. Veuillez vous reconnecter.' });
    }

    // PENDING is a valid, authenticated state for a self-registered station
    // account: it may read its dashboard while it waits for an admin to
    // approve it. Only a suspended/deleted account is refused here — writes
    // for a PENDING account are blocked downstream (requireApprovedAccount).
    if (account.status === 'SUSPENDED' || account.status === 'DELETED') {
      return res.status(403).json({ success: false, message: 'Compte suspendu ou supprimé.' });
    }

    req.auth = { accountId: account.id, role: account.role };
    req.account = account;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Token invalide. Veuillez vous reconnecter.' });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expiré. Veuillez vous reconnecter.' });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({ success: false, message: 'Erreur interne lors de l\'authentification.' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const account = await prisma.account.findUnique({ where: { id: decoded.accountId } });

    if (account && account.status !== 'SUSPENDED' && account.status !== 'DELETED' && !isTokenRevoked(account, decoded)) {
      req.auth = { accountId: account.id, role: account.role };
      req.account = account;
    }

    next();
  } catch (error) {
    next();
  }
};

// À utiliser après `auth`. Ex: requireRole('ADMIN'), requireRole('STATION', 'ADMIN').
const requireRole = (...roles) => (req, res, next) => {
  if (!req.auth) {
    return res.status(401).json({ success: false, message: 'Authentification requise.' });
  }

  if (!roles.includes(req.auth.role)) {
    return res.status(403).json({ success: false, message: 'Accès refusé. Permissions insuffisantes.' });
  }

  next();
};

module.exports = { auth, optionalAuth, requireRole };
