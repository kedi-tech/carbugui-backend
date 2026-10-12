/**
 * Petit moteur de FAQ à base de mots-clés. Renvoie une réponse du bot, ou
 * `null` quand aucune règle ne correspond — dans ce cas l'appelant doit
 * escalader la conversation vers un agent humain (WhatsApp).
 */
const INTENTS = [
  {
    id: 'greeting',
    keywords: ['bonjour', 'salut', 'bjr', 'hello'],
    reply: 'Bonjour ! Je suis l\'assistant Carbugui. Posez-moi votre question sur les stations, les prix ou votre abonnement.',
  },
  {
    id: 'subscription',
    keywords: ['abonnement', 'abonner', 'paiement', 'payer', 'tarif'],
    reply: 'Deux abonnements sont proposés : 24 heures ou 1 mois. Les tarifs et le paiement (Orange Money, MTN MoMo, carte) sont dans l\'onglet Abonnement de l\'application.',
  },
  {
    id: 'availability',
    keywords: ['disponib', 'essence', 'gasoil', 'gaz', 'lubrifiant', 'huile', 'carburant', 'station'],
    reply: 'Vous pouvez voir la disponibilité en temps réel de chaque produit (essence, gasoil, gaz, lubrifiant) directement sur la carte de l\'application.',
  },
  {
    id: 'thanks',
    keywords: ['merci', 'ok', 'super'],
    reply: 'Avec plaisir ! N\'hésitez pas si vous avez une autre question.',
  },
  {
    id: 'human',
    keywords: ['agent', 'humain', 'aide', 'probleme', 'problème'],
    reply: null,
  },
];

const matchIntent = (text) => {
  const normalized = (text || '').toLowerCase();

  for (const intent of INTENTS) {
    if (intent.keywords.some((keyword) => normalized.includes(keyword))) {
      return intent;
    }
  }

  return null;
};

module.exports = { matchIntent };
