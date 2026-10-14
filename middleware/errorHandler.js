const { Prisma } = require('@prisma/client');

const errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Erreur interne du serveur';

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      statusCode = 409;
      message = `Cette valeur existe déjà (${err.meta?.target}).`;
    } else if (err.code === 'P2025') {
      statusCode = 404;
      message = 'Ressource introuvable.';
    } else if (err.code === 'P2003') {
      statusCode = 400;
      message = 'Référence invalide.';
    }
  }

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token invalide. Veuillez vous reconnecter.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expiré. Veuillez vous reconnecter.';
  }

  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(statusCode).json({
    success: false,
    // `message` comme dans toutes les réponses des contrôleurs ; `error`
    // conservé pour les clients existants.
    message,
    error: message,
    ...(isDevelopment && { stack: err.stack }),
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method,
  });
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const notFound = (req, res, next) => {
  const error = new Error(`Route introuvable - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { errorHandler, asyncHandler, notFound, AppError };
