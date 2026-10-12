const prisma = require('../../../utils/prisma');
const { PRODUCTS, PRODUCT_LABELS, isValidProduct } = require('../../../utils/products');

// GET /station/dashboard/stations — stations gérées par le compte connecté
exports.getMyStations = async (req, res) => {
  const memberships = await prisma.stationMembership.findMany({
    where: { accountId: req.auth.accountId },
    include: { station: { include: { brand: true, area: true, products: true } } },
  });

  return res.status(200).json({ success: true, data: memberships.map((m) => ({ role: m.role, station: m.station })) });
};

// GET /station/dashboard/:stationId
exports.getDashboard = async (req, res) => {
  const station = await prisma.station.findUnique({
    where: { id: req.station.id },
    include: {
      brand: true,
      area: true,
      products: true,
      activities: { orderBy: { createdAt: 'desc' }, take: 20 },
      reports: { orderBy: { createdAt: 'desc' }, take: 20, where: { status: 'PENDING' } },
    },
  });

  return res.status(200).json({ success: true, data: station });
};

// PUT /station/dashboard/:stationId/products/:product
exports.updateProduct = async (req, res) => {
  const { product } = req.params;
  const { availability, priceGnf } = req.body;

  if (!isValidProduct(product)) {
    return res.status(400).json({ success: false, message: `Produit invalide. Valeurs acceptées : ${PRODUCTS.join(', ')}.` });
  }

  const stationProduct = await prisma.stationProduct.upsert({
    where: { stationId_product: { stationId: req.station.id, product } },
    update: {
      ...(availability !== undefined && { availability }),
      ...(priceGnf !== undefined && { priceGnf }),
      updatedById: req.auth.accountId,
    },
    create: {
      stationId: req.station.id,
      product,
      availability: availability || 'EMPTY',
      priceGnf: priceGnf ?? null,
      updatedById: req.auth.accountId,
    },
  });

  const activities = [];

  if (availability !== undefined) {
    activities.push({
      stationId: req.station.id,
      accountId: req.auth.accountId,
      kind: 'AVAILABILITY',
      tone: availability,
      label: PRODUCT_LABELS[product],
      detail: availability === 'AVAILABLE' ? 'Marqué disponible' : 'Marqué en rupture',
      product,
      availability,
    });
  }

  if (priceGnf !== undefined) {
    activities.push({
      stationId: req.station.id,
      accountId: req.auth.accountId,
      kind: 'PRICE',
      tone: stationProduct.availability,
      label: PRODUCT_LABELS[product],
      detail: `Prix mis à jour : ${priceGnf} GNF`,
      product,
    });
  }

  if (activities.length > 0) {
    await prisma.stationActivity.createMany({ data: activities });
  }

  await prisma.station.update({ where: { id: req.station.id }, data: { statusUpdatedAt: new Date() } });

  return res.status(200).json({ success: true, data: stationProduct });
};

// PUT /station/dashboard/:stationId/open
exports.toggleOpen = async (req, res) => {
  const { isOpen } = req.body;

  if (typeof isOpen !== 'boolean') {
    return res.status(400).json({ success: false, message: 'isOpen (boolean) est requis.' });
  }

  const station = await prisma.station.update({
    where: { id: req.station.id },
    data: { isOpen, statusUpdatedAt: new Date() },
  });

  await prisma.stationActivity.create({
    data: {
      stationId: station.id,
      accountId: req.auth.accountId,
      kind: 'OPEN_STATE',
      tone: isOpen ? 'OPEN' : 'CLOSED',
      label: 'Ouverture',
      detail: isOpen ? 'Station ouverte' : 'Station fermée',
      isOpen,
    },
  });

  return res.status(200).json({ success: true, data: station });
};

// GET /station/dashboard/:stationId/activities
exports.getActivities = async (req, res) => {
  const activities = await prisma.stationActivity.findMany({
    where: { stationId: req.station.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return res.status(200).json({ success: true, data: activities });
};

// GET /station/dashboard/:stationId/reports
exports.getReports = async (req, res) => {
  const reports = await prisma.stationReport.findMany({
    where: { stationId: req.station.id },
    orderBy: { createdAt: 'desc' },
  });

  return res.status(200).json({ success: true, data: reports });
};
