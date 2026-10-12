/**
 * Importe les sites de contexts/Book1.xlsx (figés dans
 * prisma/data/book1-sites.json) dans la table stations, à côté des stations
 * déjà présentes (import OSM, création admin…).
 *
 *   node scripts/import-book1-sites.js               → simulation, n'écrit rien
 *   node scripts/import-book1-sites.js --apply       → écrit en base
 *   node scripts/import-book1-sites.js --apply --brand=<slug-marque>
 *
 * Par défaut les sites sont rattachés à la marque du fichier de données
 * (TOTAL, slug "total"), créée au besoin : c'est ce qui permet de les
 * reconnaître (filtre par brand côté app / admin).
 *
 * Rejouable sans doublon : un site situé à moins de MATCH_RADIUS_METERS
 * d'une station existante est rattaché à celle-ci (seuls ses champs vides
 * sont complétés, rien n'est écrasé) au lieu d'en créer une nouvelle.
 */
require('dotenv').config();

const path = require('path');
const prisma = require('../utils/prisma');
const { distanceMeters, boundingBox } = require('../utils/geo');
const { generateRandomString } = require('../utils/functions');

const MATCH_RADIUS_METERS = 100;
// Un site n'est rattaché à une zone (Area) que s'il en est assez proche :
// les zones sont des communes de Conakry, pas Dubréka ou Siguiri.
const AREA_MAX_DISTANCE_KM = 6;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const brandSlug = (args.find((a) => a.startsWith('--brand=')) || '').split('=')[1];

const { sites, brand: defaultBrand } = require(path.join(__dirname, '..', 'prisma', 'data', 'book1-sites.json'));

const findNearestStation = async ({ latitude, longitude }) => {
  const box = boundingBox(latitude, longitude, MATCH_RADIUS_METERS / 1000);
  const candidates = await prisma.station.findMany({
    where: {
      latitude: { gte: box.minLat, lte: box.maxLat },
      longitude: { gte: box.minLon, lte: box.maxLon },
    },
  });

  return candidates
    .map((station) => ({ station, distance: distanceMeters(latitude, longitude, station.latitude, station.longitude) }))
    .filter((c) => c.distance <= MATCH_RADIUS_METERS)
    .sort((a, b) => a.distance - b.distance)[0] || null;
};

const findNearestArea = (areas, { latitude, longitude }) => {
  const nearest = areas
    .map((area) => ({ area, distance: distanceMeters(latitude, longitude, area.latitude, area.longitude) }))
    .sort((a, b) => a.distance - b.distance)[0];

  return nearest && nearest.distance <= AREA_MAX_DISTANCE_KM * 1000 ? nearest.area : null;
};

// Même convention que POST /admin/stations : "sonap-" + 6 chiffres.
const generateUniqueSlug = async () => {
  for (let i = 0; i < 20; i += 1) {
    const slug = `sonap-${generateRandomString(6)}`;
    // eslint-disable-next-line no-await-in-loop
    if (!(await prisma.station.findUnique({ where: { slug } }))) return slug;
  }
  throw new Error('Impossible de générer un slug unique.');
};

const main = async () => {
  console.log(apply ? '✍️  Mode ÉCRITURE (--apply)' : '🔎 Simulation (ajoutez --apply pour écrire)');

  // Marque des sites : --brand=<slug> (doit exister), sinon celle du fichier
  // de données (TOTAL), créée si absente.
  let brand = null;
  if (brandSlug) {
    brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
    if (!brand) throw new Error(`Marque introuvable : ${brandSlug}`);
  } else if (defaultBrand) {
    brand = await prisma.brand.findUnique({ where: { slug: defaultBrand.slug } });
    if (!brand && apply) {
      brand = await prisma.brand.create({ data: defaultBrand });
      console.log(`🆕 Marque créée : ${brand.name} (${brand.slug})`);
    } else if (!brand) {
      console.log(`🆕 Marque ${defaultBrand.name} (${defaultBrand.slug}) à créer`);
      brand = { id: null, ...defaultBrand };
    }
  }
  if (brand) console.log(`🏷️  Marque appliquée : ${brand.name}`);

  const areas = await prisma.area.findMany({ where: { isActive: true } });
  const summary = { created: 0, matched: 0 };

  for (const site of sites) {
    const area = findNearestArea(areas, site);
    // eslint-disable-next-line no-await-in-loop
    const match = await findNearestStation(site);

    if (match) {
      summary.matched += 1;
      const { station } = match;
      const fill = {
        ...(!station.neighborhood && { neighborhood: site.name }),
        ...(!station.areaId && area && { areaId: area.id }),
        ...(!station.brandId && brand && { brandId: brand.id }),
      };

      console.log(`🔗 ${site.name} → station existante "${station.name}" (${station.slug}, à ${Math.round(match.distance)} m)`
        + (Object.keys(fill).length ? ` — complète : ${Object.keys(fill).join(', ')}` : ''));

      if (apply && Object.keys(fill).length) {
        // eslint-disable-next-line no-await-in-loop
        await prisma.station.update({ where: { id: station.id }, data: fill });
      }
      continue;
    }

    summary.created += 1;
    console.log(`🆕 ${site.name} (${site.latitude}, ${site.longitude}) — ${site.city}${area ? `, zone ${area.label}` : ''}`);

    if (apply) {
      // eslint-disable-next-line no-await-in-loop
      const slug = await generateUniqueSlug();
      // eslint-disable-next-line no-await-in-loop
      await prisma.station.create({
        data: {
          slug,
          name: site.name,
          neighborhood: site.name,
          city: site.city,
          latitude: site.latitude,
          longitude: site.longitude,
          areaId: area ? area.id : null,
          brandId: brand ? brand.id : null,
        },
      });
    }
  }

  console.log('');
  console.log(`📊 ${sites.length} sites — ${summary.created} ${apply ? 'créés' : 'à créer'}, ${summary.matched} rattachés à une station existante.`);
};

main()
  .catch((error) => {
    console.error('❌ Import Book1 :', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
