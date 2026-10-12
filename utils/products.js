// Single source of truth for the products a station can sell. Keep in sync
// with the FuelProduct enum in prisma/schema.prisma.
const PRODUCTS = ['ESSENCE', 'GASOIL', 'GAZ', 'LUBRIFIANT'];

// Rendered as-is in StationActivity.label (dashboard activity feed).
const PRODUCT_LABELS = {
  ESSENCE: 'Essence',
  GASOIL: 'Gasoil',
  GAZ: 'Gaz',
  LUBRIFIANT: 'Lubrifiant',
};

const isValidProduct = (product) => PRODUCTS.includes(product);

module.exports = { PRODUCTS, PRODUCT_LABELS, isValidProduct };
