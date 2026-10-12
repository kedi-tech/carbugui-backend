const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');

const AREAS = [
  { slug: 'conakry-centre', label: 'Conakry Centre', latitude: 9.535, longitude: -13.6785, sortOrder: 0 },
  { slug: 'kaloum', label: 'Kaloum', latitude: 9.5092, longitude: -13.7122, sortOrder: 1 },
  { slug: 'dixinn', label: 'Dixinn', latitude: 9.5495, longitude: -13.6797, sortOrder: 2 },
  { slug: 'matam', label: 'Matam', latitude: 9.5432, longitude: -13.6669, sortOrder: 3 },
  { slug: 'ratoma', label: 'Ratoma', latitude: 9.6104, longitude: -13.6412, sortOrder: 4 },
  { slug: 'matoto', label: 'Matoto', latitude: 9.6284, longitude: -13.5794, sortOrder: 5 },
];

// Formules d'abonnement chauffeur. L'upsert ne touche qu'à durationHours et
// sortOrder : un prix modifié par un admin (PUT /admin/subscriptions/plans)
// n'est jamais écrasé par un nouveau seed.
const PLANS = [
  { code: 'DAY', label: '24 heures', priceGnf: 2000, durationHours: 24, sortOrder: 0 },
  { code: 'MONTH', label: '1 mois', priceGnf: 10000, durationHours: 720, sortOrder: 1 },
];

async function main() {
  for (const area of AREAS) {
    await prisma.area.upsert({ where: { slug: area.slug }, update: area, create: area });
  }
  console.log(`✅ ${AREAS.length} zones (areas) synchronisées.`);

  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: { durationHours: plan.durationHours, sortOrder: plan.sortOrder },
      create: plan,
    });
  }
  console.log(`✅ ${PLANS.length} formules d'abonnement synchronisées.`);

  const adminPhone = process.env.SEED_ADMIN_PHONE || '+224610000000';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@Carbugui2026';

  const existingAdmin = await prisma.account.findUnique({ where: { phoneNumber: adminPhone } });

  if (!existingAdmin) {
    await prisma.account.create({
      data: {
        role: 'ADMIN',
        phoneNumber: adminPhone,
        fullName: 'Administrateur Carbugui',
        passwordHash: await bcrypt.hash(adminPassword, 12),
      },
    });
    console.log(`✅ Compte admin créé — téléphone: ${adminPhone} / mot de passe: ${adminPassword}`);
    console.log('   ⚠️  Changez ce mot de passe après la première connexion.');
  } else {
    console.log('ℹ️  Un compte admin existe déjà pour ce numéro, rien à faire.');
  }
}

main()
  .catch((error) => {
    console.error('❌ Erreur de seed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
