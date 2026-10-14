const bcrypt = require('bcryptjs');
const slugify = require('slugify');
const prisma = require('../../../utils/prisma');
const { generateRandomString, generatePassword, normalizeGuineaPhone } = require('../../../utils/functions');
const { claimPhoneNumber, nextLoginCode, nextMembershipRole } = require('../../../utils/stationAccess');
const { importStationsFromOSM } = require('../../../utils/stationImportService');

// GET /admin/stations
exports.getStations = async (req, res) => {
  const stations = await prisma.station.findMany({
    include: { brand: true, area: true, products: true, memberships: true },
    orderBy: { createdAt: 'desc' },
  });

  return res.status(200).json({ success: true, count: stations.length, data: stations });
};

// GET /admin/stations/:id
exports.getStationById = async (req, res) => {
  const station = await prisma.station.findUnique({
    where: { id: req.params.id },
    include: { brand: true, area: true, products: true, memberships: { include: { account: true } } },
  });

  if (!station) {
    return res.status(404).json({ success: false, message: 'Station introuvable.' });
  }

  return res.status(200).json({ success: true, data: station });
};

// POST /admin/stations
exports.createStation = async (req, res) => {
  const { name, brandId, areaId, neighborhood, city, address, phoneNumber, latitude, longitude } = req.body;

  if (!name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ success: false, message: 'name, latitude et longitude sont requis.' });
  }

  const slug = `sonap-${generateRandomString(6).toLowerCase()}`;

  const station = await prisma.station.create({
    data: {
      slug,
      name,
      brandId: brandId || null,
      areaId: areaId || null,
      neighborhood: neighborhood || null,
      city: city || 'Conakry',
      address: address || null,
      phoneNumber: phoneNumber || null,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
    },
  });

  return res.status(201).json({ success: true, data: station });
};

// PUT /admin/stations/:id
exports.updateStation = async (req, res) => {
  const station = await prisma.station.findUnique({ where: { id: req.params.id } });
  if (!station) {
    return res.status(404).json({ success: false, message: 'Station introuvable.' });
  }

  const { name, brandId, areaId, neighborhood, city, address, phoneNumber, latitude, longitude, isPublished } = req.body;

  const updated = await prisma.station.update({
    where: { id: station.id },
    data: {
      ...(name !== undefined && { name }),
      ...(brandId !== undefined && { brandId }),
      ...(areaId !== undefined && { areaId }),
      ...(neighborhood !== undefined && { neighborhood }),
      ...(city !== undefined && { city }),
      ...(address !== undefined && { address }),
      ...(phoneNumber !== undefined && { phoneNumber }),
      ...(latitude !== undefined && { latitude: parseFloat(latitude) }),
      ...(longitude !== undefined && { longitude: parseFloat(longitude) }),
      ...(isPublished !== undefined && { isPublished }),
    },
  });

  return res.status(200).json({ success: true, data: updated });
};

// PUT /admin/stations/:id/verify
exports.verifyStation = async (req, res) => {
  const station = await prisma.station.update({
    where: { id: req.params.id },
    data: { verifiedAt: new Date() },
  });

  await prisma.stationActivity.create({
    data: {
      stationId: station.id,
      accountId: req.auth.accountId,
      kind: 'VERIFICATION',
      tone: station.isOpen ? 'OPEN' : 'CLOSED',
      label: 'Vérification',
      detail: 'Station vérifiée par un administrateur',
    },
  });

  return res.status(200).json({ success: true, data: station });
};

// DELETE /admin/stations/:id
exports.deleteStation = async (req, res) => {
  const station = await prisma.station.findUnique({ where: { id: req.params.id } });
  if (!station) {
    return res.status(404).json({ success: false, message: 'Station introuvable.' });
  }

  await prisma.station.delete({ where: { id: station.id } });

  return res.status(200).json({ success: true, message: 'Station supprimée avec succès.' });
};

// POST /admin/stations/:id/accounts { fullName, phoneNumber? } — crée un accès
// nommé pour un agent. Une station peut en avoir plusieurs : loginCode = slug
// pour le premier, puis slug-2, slug-3… Le mot de passe n'est renvoyé qu'ici.
exports.createStationAccount = async (req, res) => {
  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
  const { phoneNumber } = req.body;

  if (fullName.length < 3) {
    return res.status(400).json({ success: false, message: 'fullName est requis (3 caractères minimum).' });
  }

  let normalizedPhone = null;
  if (phoneNumber !== undefined && phoneNumber !== null && phoneNumber !== '') {
    normalizedPhone = normalizeGuineaPhone(phoneNumber);
    if (!normalizedPhone) {
      return res.status(400).json({ success: false, message: 'Numéro invalide : 9 chiffres guinéens, débutant par 6 ou 7.' });
    }
  }

  const station = await prisma.station.findUnique({ where: { id: req.params.id } });
  if (!station) {
    return res.status(404).json({ success: false, message: 'Station introuvable.' });
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);

  // Deux créations simultanées peuvent viser le même loginCode : la seconde
  // échoue sur l'index unique (P2002) et recalcule le suivant.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await prisma.$transaction(async (tx) => {
        if (normalizedPhone && !(await claimPhoneNumber(normalizedPhone, tx))) {
          return { conflict: true };
        }

        const loginCode = await nextLoginCode(station.slug, tx);
        const membershipRole = await nextMembershipRole(station.id, tx);

        const account = await tx.account.create({
          data: {
            role: 'STATION',
            status: 'ACTIVE',
            loginCode,
            phoneNumber: normalizedPhone,
            fullName,
            passwordHash,
            memberships: { create: { stationId: station.id, role: membershipRole } },
          },
        });

        return { account, membershipRole };
      });

      if (result.conflict) {
        return res.status(409).json({ success: false, message: 'Ce numéro est déjà utilisé par un autre compte.' });
      }

      return res.status(201).json({
        success: true,
        message: 'Accès station créé. Communiquez ces identifiants une seule fois, ils ne seront plus affichés.',
        data: {
          accountId: result.account.id,
          loginCode: result.account.loginCode,
          password,
          fullName: result.account.fullName,
          phoneNumber: result.account.phoneNumber,
          membershipRole: result.membershipRole,
        },
      });
    } catch (error) {
      const target = String(error.meta?.target || '');
      if (error.code !== 'P2002') throw error;
      if (target.includes('phoneNumber')) {
        return res.status(409).json({ success: false, message: 'Ce numéro est déjà utilisé par un autre compte.' });
      }
    }
  }

  return res.status(409).json({ success: false, message: 'Création simultanée en cours pour cette station, réessayez.' });
};

// GET /admin/stations/:id/accounts?includeDeleted=true — agents de la station
exports.getStationAccounts = async (req, res) => {
  const station = await prisma.station.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!station) {
    return res.status(404).json({ success: false, message: 'Station introuvable.' });
  }

  const includeDeleted = req.query.includeDeleted === 'true';

  const memberships = await prisma.stationMembership.findMany({
    where: {
      stationId: station.id,
      ...(!includeDeleted && { account: { status: { not: 'DELETED' } } }),
    },
    include: { account: true },
    orderBy: { createdAt: 'asc' },
  });

  const data = memberships.map(({ role, account }) => ({
    id: account.id,
    fullName: account.fullName,
    phoneNumber: account.phoneNumber,
    loginCode: account.loginCode,
    status: account.status,
    membershipRole: role,
    lastSeenAt: account.lastSeenAt,
    createdAt: account.createdAt,
  }));

  return res.status(200).json({ success: true, count: data.length, data });
};

// POST /admin/stations/import-osm
exports.importOSM = async (req, res) => {
  console.log('🚀 Import OSM demandé...');

  const result = await importStationsFromOSM();

  return res.status(200).json({ success: true, message: 'Import OpenStreetMap terminé.', ...result });
};
