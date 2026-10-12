const prisma = require('../../../utils/prisma');
const { distanceMeters, boundingBox } = require('../../../utils/geo');
const { PRODUCTS, isValidProduct } = require('../../../utils/products');

// GET /app/stations/nearby?latitude&longitude&radius&product
exports.getNearbyStations = async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  const radiusKm = Number(req.query.radius) || 5;
  const { product } = req.query;

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return res.status(400).json({ success: false, message: 'latitude et longitude sont requis.' });
  }

  if (product && !isValidProduct(product)) {
    return res.status(400).json({ success: false, message: `Produit invalide. Valeurs acceptées : ${PRODUCTS.join(', ')}.` });
  }

  const box = boundingBox(latitude, longitude, radiusKm);

  const stations = await prisma.station.findMany({
    where: {
      isPublished: true,
      latitude: { gte: box.minLat, lte: box.maxLat },
      longitude: { gte: box.minLon, lte: box.maxLon },
      ...(product && { products: { some: { product } } }),
    },
    include: { brand: true, area: true, products: true },
  });

  const results = stations
    .map((station) => ({
      ...station,
      distance: Math.round(distanceMeters(latitude, longitude, station.latitude, station.longitude)),
    }))
    .filter((station) => station.distance <= radiusKm * 1000)
    .sort((a, b) => a.distance - b.distance);

  if (req.auth) {
    await prisma.searchEvent.create({
      data: {
        accountId: req.auth.accountId,
        product: product || 'ESSENCE',
        latitude,
        longitude,
        radiusKm,
        resultCount: results.length,
        availableCount: results.filter((s) => s.products.some((p) => p.availability === 'AVAILABLE' && (!product || p.product === product))).length,
      },
    }).catch((error) => console.error('SearchEvent tracking failed:', error.message));
  }

  return res.status(200).json({ success: true, count: results.length, data: results });
};

// GET /app/stations/:id
exports.getStationById = async (req, res) => {
  const station = await prisma.station.findUnique({
    where: { id: req.params.id },
    include: {
      brand: true,
      area: true,
      products: true,
      activities: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  if (!station) {
    return res.status(404).json({ success: false, message: 'Station introuvable.' });
  }

  return res.status(200).json({ success: true, data: station });
};

// GET /app/stations
exports.getStations = async (req, res) => {
  const stations = await prisma.station.findMany({
    where: { isPublished: true },
    include: { brand: true, area: true, products: true },
    orderBy: { name: 'asc' },
  });

  return res.status(200).json({ success: true, count: stations.length, data: stations });
};

// POST /app/stations/:id/reports
exports.createReport = async (req, res) => {
  const { kind, product, comment } = req.body;

  if (!kind) {
    return res.status(400).json({ success: false, message: 'kind est requis.' });
  }

  if (product && !isValidProduct(product)) {
    return res.status(400).json({ success: false, message: `Produit invalide. Valeurs acceptées : ${PRODUCTS.join(', ')}.` });
  }

  const station = await prisma.station.findUnique({ where: { id: req.params.id } });
  if (!station) {
    return res.status(404).json({ success: false, message: 'Station introuvable.' });
  }

  const report = await prisma.stationReport.create({
    data: {
      stationId: station.id,
      accountId: req.auth.accountId,
      kind,
      product: product || null,
      comment: comment || null,
    },
  });

  return res.status(201).json({ success: true, data: report });
};
