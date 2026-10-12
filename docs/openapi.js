/**
 * Document OpenAPI 3.0 complet et écrit à la main (pas de génération depuis
 * des commentaires JSDoc éparpillés dans les routes — plus simple à relire
 * et à tenir exact). Servi en JSON brut sur /api-docs.json et via Swagger UI
 * sur /api-docs. Toute nouvelle route doit être ajoutée ici.
 */

const PRODUCT_ENUM = ['ESSENCE', 'GASOIL', 'GAZ', 'LUBRIFIANT'];

const servers = [
  { url: 'http://localhost:5000/api/v1', description: 'Local' },
];

const securitySchemes = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: "Jeton d'accès obtenu via un endpoint de connexion (`accessToken`).",
  },
};

// --- Schémas de données ------------------------------------------------------

const schemas = {
  Account: {
    type: 'object',
    properties: {
      id: { type: 'string', example: 'cmtslfwnu0007c8w0xzxuxskz' },
      role: { type: 'string', enum: ['DRIVER', 'STATION', 'ADMIN'] },
      status: {
        type: 'string',
        enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED'],
        description: 'PENDING : compte STATION auto-inscrit, en attente de validation par un admin.',
      },
      phoneNumber: { type: 'string', nullable: true, example: '+224622334455' },
      fullName: { type: 'string', nullable: true },
      locale: { type: 'string', example: 'fr' },
      defaultAreaId: { type: 'string', nullable: true },
      loginCode: { type: 'string', nullable: true, description: 'Comptes STATION uniquement.' },
      lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  Area: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      slug: { type: 'string', example: 'kaloum' },
      label: { type: 'string', example: 'Kaloum' },
      latitude: { type: 'number', format: 'double' },
      longitude: { type: 'number', format: 'double' },
      isActive: { type: 'boolean' },
      sortOrder: { type: 'integer' },
    },
  },
  Brand: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      slug: { type: 'string', example: 'total-energies' },
      name: { type: 'string', example: 'TotalEnergies' },
      logoUrl: { type: 'string', nullable: true },
    },
  },
  StationProduct: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      stationId: { type: 'string' },
      product: { type: 'string', enum: PRODUCT_ENUM },
      availability: { type: 'string', enum: ['AVAILABLE', 'EMPTY'] },
      priceGnf: { type: 'integer', nullable: true, example: 15000 },
      updatedAt: { type: 'string', format: 'date-time' },
      updatedById: { type: 'string', nullable: true },
    },
  },
  StationActivity: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      stationId: { type: 'string' },
      accountId: { type: 'string', nullable: true },
      kind: { type: 'string', enum: ['AVAILABILITY', 'OPEN_STATE', 'PRICE', 'VERIFICATION'] },
      tone: { type: 'string', enum: ['AVAILABLE', 'EMPTY', 'OPEN', 'CLOSED'] },
      label: { type: 'string', example: 'Essence' },
      detail: { type: 'string', example: 'Marqué disponible' },
      product: { type: 'string', enum: PRODUCT_ENUM, nullable: true },
      availability: { type: 'string', enum: ['AVAILABLE', 'EMPTY'], nullable: true },
      isOpen: { type: 'boolean', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  StationReport: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      stationId: { type: 'string' },
      accountId: { type: 'string', nullable: true },
      kind: {
        type: 'string',
        enum: ['WRONG_AVAILABILITY', 'WRONG_OPEN_STATE', 'WRONG_LOCATION', 'CLOSED_PERMANENTLY', 'OTHER'],
      },
      product: { type: 'string', enum: PRODUCT_ENUM, nullable: true },
      comment: { type: 'string', nullable: true },
      status: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'REJECTED'] },
      resolvedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  Station: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      slug: { type: 'string' },
      name: { type: 'string', example: 'Station Kaloum' },
      brandId: { type: 'string', nullable: true },
      areaId: { type: 'string', nullable: true },
      neighborhood: { type: 'string', nullable: true, example: 'Almamy' },
      city: { type: 'string', example: 'Conakry' },
      address: { type: 'string', nullable: true },
      phoneNumber: { type: 'string', nullable: true },
      latitude: { type: 'number', format: 'double' },
      longitude: { type: 'number', format: 'double' },
      isOpen: { type: 'boolean' },
      isPublished: { type: 'boolean' },
      verifiedAt: { type: 'string', format: 'date-time', nullable: true },
      openingHours: { type: 'object', nullable: true },
      statusUpdatedAt: { type: 'string', format: 'date-time' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      distance: { type: 'integer', description: 'Mètres — présent uniquement sur /app/stations/nearby.' },
      brand: { $ref: '#/components/schemas/Brand', nullable: true },
      area: { $ref: '#/components/schemas/Area', nullable: true },
      products: { type: 'array', items: { $ref: '#/components/schemas/StationProduct' } },
      activities: { type: 'array', items: { $ref: '#/components/schemas/StationActivity' } },
    },
  },
  ChatThread: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      accountId: { type: 'string' },
      status: { type: 'string', enum: ['OPEN', 'ESCALATED', 'CLOSED'] },
      escalatedAt: { type: 'string', format: 'date-time', nullable: true },
      closedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  ChatMessage: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      threadId: { type: 'string' },
      role: { type: 'string', enum: ['USER', 'BOT', 'AGENT'] },
      text: { type: 'string' },
      intentId: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  StationMembership: {
    type: 'object',
    properties: {
      role: { type: 'string', enum: ['OWNER', 'STAFF'] },
      station: { $ref: '#/components/schemas/Station' },
    },
  },
  AuthTokens: {
    type: 'object',
    properties: {
      accessToken: { type: 'string' },
      refreshToken: { type: 'string' },
    },
  },
  Error: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string' },
    },
  },
  Plan: {
    type: 'object',
    properties: {
      code: { type: 'string', enum: ['DAY', 'MONTH'], example: 'DAY' },
      label: { type: 'string', example: '24 heures' },
      priceGnf: { type: 'integer', example: 2000 },
      durationHours: { type: 'integer', example: 24, description: '24 (DAY) ou 720 (MONTH, 30 jours).' },
    },
  },
  SubscriptionStatus: {
    type: 'object',
    properties: {
      required: { type: 'boolean', description: "false si le serveur tourne avec SUBSCRIPTION_REQUIRED=false (stations accessibles sans abonnement)." },
      active: { type: 'boolean', description: 'true si une période payée couvre maintenant.' },
      accessUntil: {
        type: 'string', format: 'date-time', nullable: true,
        description: "Fin de l'accès, périodes achetées d'avance incluses (elles s'enchaînent). null si inactif.",
      },
      current: {
        type: 'object',
        nullable: true,
        properties: {
          id: { type: 'string' },
          planCode: { type: 'string', enum: ['DAY', 'MONTH'] },
          planLabel: { type: 'string' },
          startsAt: { type: 'string', format: 'date-time' },
          endsAt: { type: 'string', format: 'date-time' },
        },
      },
      upcomingCount: { type: 'integer', description: 'Nombre de périodes déjà payées qui démarreront après la période en cours.' },
    },
  },
  Payment: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      status: {
        type: 'string',
        enum: ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED'],
        description: 'PENDING : lien généré, en attente du paiement. SUCCEEDED : payé et abonnement activé.',
      },
      amountGnf: { type: 'integer', example: 10000 },
      merchantReference: { type: 'string', example: 'SUB-M2X7K9QF-3A1C', description: 'Référence à communiquer au support.' },
      paymentUrl: { type: 'string', nullable: true, example: 'https://sandbox.djomy.africa/p/32f4AS77', description: 'Page de paiement Djomy à ouvrir (navigateur / WebView).' },
      linkExpiresAt: { type: 'string', format: 'date-time', nullable: true, description: 'Le lien expire 15 min après sa création.' },
      paymentMethod: { type: 'string', nullable: true, example: 'OM', description: 'OM, MOMO, KULU, CARD… une fois payé.' },
      paidAt: { type: 'string', format: 'date-time', nullable: true },
      failureReason: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      plan: { type: 'object', nullable: true, properties: { code: { type: 'string' }, label: { type: 'string' } } },
      subscription: {
        type: 'object',
        nullable: true,
        description: 'Période accordée par ce paiement (SUCCEEDED uniquement).',
        properties: { startsAt: { type: 'string', format: 'date-time' }, endsAt: { type: 'string', format: 'date-time' } },
      },
    },
  },
  AdminMessageRecipient: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      messageId: { type: 'string' },
      accountId: { type: 'string' },
      phoneNumber: { type: 'string', nullable: true, description: "Copie du numéro à l'envoi." },
      status: { type: 'string', enum: ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] },
      error: { type: 'string', nullable: true },
      sentAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      account: {
        type: 'object',
        nullable: true,
        properties: {
          id: { type: 'string' },
          fullName: { type: 'string', nullable: true },
          phoneNumber: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['DRIVER', 'STATION', 'ADMIN'] },
        },
      },
    },
  },
  AdminMessage: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      senderId: { type: 'string' },
      body: { type: 'string' },
      status: {
        type: 'string',
        enum: ['SCHEDULED', 'SENT', 'CANCELED'],
        description: 'SCHEDULED tant que scheduledAt n\'est pas arrivé (ou que /cancel n\'a pas été appelé) ; SENT une fois le lot traité.',
      },
      scheduledAt: { type: 'string', format: 'date-time', description: "Date d'envoi voulue. = createdAt pour un envoi immédiat." },
      dispatchedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Date effective du traitement du lot.' },
      createdAt: { type: 'string', format: 'date-time' },
      sender: {
        type: 'object',
        nullable: true,
        properties: { id: { type: 'string' }, fullName: { type: 'string', nullable: true } },
      },
      recipientCount: { type: 'integer', description: 'Présent sur GET /admin/messages (liste).' },
      recipients: {
        type: 'array',
        items: { $ref: '#/components/schemas/AdminMessageRecipient' },
        description: 'Présent sur POST /admin/messages et GET /admin/messages/{id}.',
      },
      counts: {
        type: 'object',
        properties: {
          PENDING: { type: 'integer' },
          SENT: { type: 'integer' },
          FAILED: { type: 'integer' },
          SKIPPED: { type: 'integer' },
        },
      },
    },
  },
};

// --- Réponses réutilisables --------------------------------------------------

const responses = {
  BadRequest: {
    description: 'Requête invalide.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  },
  Unauthorized: {
    description: 'Authentification manquante, invalide ou expirée.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  },
  Forbidden: {
    description: "Rôle ou droits insuffisants pour cette ressource.",
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  },
  NotFound: {
    description: 'Ressource introuvable.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  },
  Conflict: {
    description: 'Conflit avec une ressource existante.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  },
  SubscriptionRequired: {
    description: "Chauffeur sans abonnement actif. `code` vaut toujours 'SUBSCRIPTION_REQUIRED' : ouvrir l'écran d'abonnement.",
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            code: { type: 'string', example: 'SUBSCRIPTION_REQUIRED' },
            message: { type: 'string' },
          },
        },
      },
    },
  },
  TooManyRequests: {
    description: 'Trop de tentatives — réessayer plus tard.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  },
};

// --- Aides pour raccourcir les définitions de routes -------------------------

const ok = (schema, description = 'OK') => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: { success: { type: 'boolean', example: true }, data: schema },
      },
    },
  },
});

const okList = (itemSchema, description = 'OK') => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          count: { type: 'integer' },
          data: { type: 'array', items: itemSchema },
        },
      },
    },
  },
});

const bearer = [{ bearerAuth: [] }];

// --- Endpoints ---------------------------------------------------------------

const paths = {
  // ===== App — Auth chauffeur =====================================
  '/app/auth/otp/request': {
    post: {
      tags: ['App · Auth'],
      summary: 'Demander un code OTP par SMS',
      description: "Crée un défi OTP et envoie un code à 6 chiffres par SMS. Valide 10 minutes.",
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['phoneNumber'],
              properties: {
                phoneNumber: { type: 'string', example: '+224622334455', description: 'Format E.164 Guinée.' },
                purpose: { type: 'string', enum: ['SIGN_IN', 'PHONE_CHANGE'], default: 'SIGN_IN' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Code envoyé.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        400: responses.BadRequest,
      },
    },
  },
  '/app/auth/otp/verify': {
    post: {
      tags: ['App · Auth'],
      summary: 'Vérifier le code OTP et se connecter',
      description: 'Crée le compte DRIVER au premier appel (upsert par numéro), puis ouvre une session.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['phoneNumber', 'code'],
              properties: {
                phoneNumber: { type: 'string', example: '+224622334455' },
                code: { type: 'string', example: '482913' },
                fullName: { type: 'string', description: 'Optionnel, utilisé seulement à la création du compte.' },
                deviceId: { type: 'string' },
                deviceName: { type: 'string' },
                platform: { type: 'string', enum: ['IOS', 'ANDROID', 'WEB'] },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Connexion réussie.',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/AuthTokens' },
                  { type: 'object', properties: { success: { type: 'boolean' }, account: { $ref: '#/components/schemas/Account' } } },
                ],
              },
            },
          },
        },
        400: responses.BadRequest,
        429: { description: 'Trop de tentatives, redemander un code.' },
      },
    },
  },
  '/app/auth/refresh': {
    post: {
      tags: ['App · Auth'],
      summary: "Renouveler les jetons (rotation)",
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } },
      },
      responses: { 200: { description: 'Nouveaux jetons.', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthTokens' } } } }, 401: responses.Unauthorized },
    },
  },
  '/app/auth/logout': {
    post: {
      tags: ['App · Auth'],
      summary: 'Se déconnecter (révoque la session)',
      security: bearer,
      requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { refreshToken: { type: 'string' } } } } } },
      responses: { 200: { description: 'Déconnecté.' }, 401: responses.Unauthorized },
    },
  },
  '/app/auth/me': {
    get: {
      tags: ['App · Auth'],
      summary: 'Mon profil chauffeur',
      description: "Inclut `subscription` (même contenu que GET /app/subscriptions/me).",
      security: bearer,
      responses: {
        200: ok({
          allOf: [
            { $ref: '#/components/schemas/Account' },
            { type: 'object', properties: { subscription: { $ref: '#/components/schemas/SubscriptionStatus' } } },
          ],
        }),
        401: responses.Unauthorized,
      },
    },
    put: {
      tags: ['App · Auth'],
      summary: 'Mettre à jour mon profil',
      security: bearer,
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { fullName: { type: 'string' }, locale: { type: 'string' }, defaultAreaId: { type: 'string' } },
            },
          },
        },
      },
      responses: { 200: ok({ $ref: '#/components/schemas/Account' }), 401: responses.Unauthorized },
    },
  },
  '/app/auth/push-token': {
    post: {
      tags: ['App · Auth'],
      summary: 'Enregistrer un token de notification push',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token', 'platform'],
              properties: { token: { type: 'string' }, platform: { type: 'string', enum: ['IOS', 'ANDROID', 'WEB'] } },
            },
          },
        },
      },
      responses: { 200: { description: 'Token enregistré.' }, 400: responses.BadRequest, 401: responses.Unauthorized },
    },
  },

  // ===== App — Auth : code PIN =====================================
  // Évite de reconsommer un SMS à chaque ouverture de l'app : une fois un
  // PIN défini, /pin/login réauthentifie avec le refreshToken déjà en main
  // tant que la session correspondante est valide (ni révoquée, ni expirée).
  '/app/auth/pin/set': {
    post: {
      tags: ['App · Auth'],
      summary: 'Définir (ou changer) mon code PIN',
      description: "Protégé par l'accessToken déjà obtenu via OTP ou /pin/login — pas besoin de ressaisir l'ancien PIN.",
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['pin'], properties: { pin: { type: 'string', example: '1234', description: '4 à 6 chiffres.' } } },
          },
        },
      },
      responses: { 200: { description: 'Code PIN enregistré.' }, 400: responses.BadRequest, 401: responses.Unauthorized },
    },
  },
  '/app/auth/pin/login': {
    post: {
      tags: ['App · Auth'],
      summary: 'Se reconnecter avec le code PIN (sans SMS)',
      description:
        "Alternative à /otp/verify quand la session est encore valide : vérifie le refreshToken (comme /app/auth/refresh) " +
        "puis le PIN. Verrouillé 15 minutes après 5 codes erronés (utiliser /pin/forgot pour en sortir). " +
        'Fait tourner la session comme /app/auth/refresh — mémoriser les nouveaux tokens retournés.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['refreshToken', 'pin'],
              properties: { refreshToken: { type: 'string' }, pin: { type: 'string', example: '1234' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Connexion réussie.',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/AuthTokens' },
                  { type: 'object', properties: { success: { type: 'boolean' }, account: { $ref: '#/components/schemas/Account' } } },
                ],
              },
            },
          },
        },
        400: { description: "Aucun code PIN configuré pour ce compte — se reconnecter par SMS puis en définir un." },
        401: responses.Unauthorized,
        429: responses.TooManyRequests,
      },
    },
  },
  '/app/auth/pin/forgot': {
    post: {
      tags: ['App · Auth'],
      summary: 'Demander un code de réinitialisation du PIN par SMS',
      description: "Seul endpoint du flux PIN qui envoie un SMS — volontairement rare (oubli du code seulement).",
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['phoneNumber'], properties: { phoneNumber: { type: 'string', example: '+224622334455' } } },
          },
        },
      },
      responses: { 200: { description: 'Code envoyé.' }, 400: responses.BadRequest, 404: responses.NotFound },
    },
  },
  '/app/auth/pin/reset': {
    post: {
      tags: ['App · Auth'],
      summary: 'Poser un nouveau PIN avec le code SMS reçu',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['phoneNumber', 'code', 'pin'],
              properties: {
                phoneNumber: { type: 'string', example: '+224622334455' },
                code: { type: 'string', example: '482913' },
                pin: { type: 'string', example: '1234', description: '4 à 6 chiffres.' },
              },
            },
          },
        },
      },
      responses: { 200: { description: 'Code PIN mis à jour.' }, 400: responses.BadRequest, 404: responses.NotFound, 429: responses.TooManyRequests },
    },
  },

  // ===== App — Stations ============================================
  '/app/stations': {
    get: {
      tags: ['App · Stations'],
      summary: 'Lister les stations publiées',
      description: "Réservé aux chauffeurs abonnés (Bearer requis, 402 SUBSCRIPTION_REQUIRED sinon). Les comptes STATION/ADMIN ne sont pas concernés. Public si le serveur tourne avec SUBSCRIPTION_REQUIRED=false.",
      security: bearer,
      responses: { 200: okList({ $ref: '#/components/schemas/Station' }), 401: responses.Unauthorized, 402: responses.SubscriptionRequired },
    },
  },
  '/app/stations/nearby': {
    get: {
      tags: ['App · Stations'],
      summary: 'Rechercher les stations à proximité',
      description: "Réservé aux chauffeurs abonnés (Bearer requis, 402 SUBSCRIPTION_REQUIRED sinon). Les comptes STATION/ADMIN ne sont pas concernés. Public si le serveur tourne avec SUBSCRIPTION_REQUIRED=false. Journalise un SearchEvent pour l'appelant authentifié. `product` filtre les stations qui vendent ce produit.",
      security: bearer,
      parameters: [
        { name: 'latitude', in: 'query', required: true, schema: { type: 'number' } },
        { name: 'longitude', in: 'query', required: true, schema: { type: 'number' } },
        { name: 'radius', in: 'query', schema: { type: 'number', default: 5 }, description: 'Rayon en km.' },
        { name: 'product', in: 'query', schema: { type: 'string', enum: PRODUCT_ENUM } },
      ],
      responses: {
        200: okList({ $ref: '#/components/schemas/Station' }),
        400: responses.BadRequest,
        401: responses.Unauthorized,
        402: responses.SubscriptionRequired,
      },
    },
  },
  '/app/stations/{id}': {
    get: {
      tags: ['App · Stations'],
      summary: "Détail d'une station",
      description: "Réservé aux chauffeurs abonnés (Bearer requis, 402 SUBSCRIPTION_REQUIRED sinon). Les comptes STATION/ADMIN ne sont pas concernés. Public si le serveur tourne avec SUBSCRIPTION_REQUIRED=false.",
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: ok({ $ref: '#/components/schemas/Station' }),
        401: responses.Unauthorized,
        402: responses.SubscriptionRequired,
        404: responses.NotFound,
      },
    },
  },
  '/app/stations/{id}/reports': {
    post: {
      tags: ['App · Stations'],
      summary: 'Signaler une information incorrecte',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['kind'],
              properties: {
                kind: {
                  type: 'string',
                  enum: ['WRONG_AVAILABILITY', 'WRONG_OPEN_STATE', 'WRONG_LOCATION', 'CLOSED_PERMANENTLY', 'OTHER'],
                },
                product: { type: 'string', enum: PRODUCT_ENUM },
                comment: { type: 'string' },
              },
            },
          },
        },
      },
      responses: { 201: ok({ $ref: '#/components/schemas/StationReport' }), 400: responses.BadRequest, 404: responses.NotFound },
    },
  },

  // ===== App — Abonnements ==========================================
  '/app/subscriptions/plans': {
    get: {
      tags: ['App · Abonnements'],
      summary: 'Formules disponibles (24 heures, 1 mois)',
      description: 'Public. Toujours afficher les prix renvoyés ici : ils sont modifiables par un admin.',
      security: [],
      responses: { 200: okList({ $ref: '#/components/schemas/Plan' }) },
    },
  },
  '/app/subscriptions/me': {
    get: {
      tags: ['App · Abonnements'],
      summary: "Mon état d'abonnement",
      security: bearer,
      responses: { 200: ok({ $ref: '#/components/schemas/SubscriptionStatus' }), 401: responses.Unauthorized, 403: responses.Forbidden },
    },
  },
  '/app/subscriptions/checkout': {
    post: {
      tags: ['App · Abonnements'],
      summary: 'Démarrer un paiement (génère le lien de paiement Djomy)',
      description:
        "Crée un paiement PENDING et un lien Djomy à usage unique valable 15 minutes. Ouvrir `data.paymentUrl` " +
        "(navigateur / WebView) : le chauffeur paie par Orange Money, MTN MoMo, carte… Ensuite interroger " +
        "GET /app/subscriptions/payments/{id} jusqu'à un statut final. Si un lien encore valide existe déjà pour la " +
        "même formule, il est renvoyé (`reused: true`, HTTP 200) au lieu d'en créer un nouveau. Acheter pendant une " +
        "période active la prolonge (la nouvelle période commence à la fin de la précédente).",
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['planCode'],
              properties: { planCode: { type: 'string', enum: ['DAY', 'MONTH'] } },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Lien de paiement créé.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  reused: { type: 'boolean' },
                  data: { $ref: '#/components/schemas/Payment' },
                },
              },
            },
          },
        },
        200: { description: 'Lien encore valide réutilisé (reused: true), même format que 201.' },
        400: responses.BadRequest,
        401: responses.Unauthorized,
        404: responses.NotFound,
        502: { description: 'Djomy a refusé ou n\'a pas répondu (le paiement est marqué FAILED).' },
        503: { description: 'Paiement non configuré côté serveur (clés Djomy absentes).' },
      },
    },
  },
  '/app/subscriptions/payments': {
    get: {
      tags: ['App · Abonnements'],
      summary: 'Historique de mes paiements (50 derniers)',
      security: bearer,
      responses: { 200: okList({ $ref: '#/components/schemas/Payment' }), 401: responses.Unauthorized },
    },
  },
  '/app/subscriptions/payments/{id}': {
    get: {
      tags: ['App · Abonnements'],
      summary: "Statut d'un paiement (à interroger après la page Djomy)",
      description:
        "Si le paiement est encore PENDING, le serveur revérifie en direct auprès de Djomy avant de répondre. " +
        "Interroger toutes les 3 à 5 s au retour de la page de paiement, jusqu'à SUCCEEDED, FAILED, CANCELED ou EXPIRED.",
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: ok({ $ref: '#/components/schemas/Payment' }), 401: responses.Unauthorized, 404: responses.NotFound },
    },
  },

  // ===== Webhooks ===================================================
  '/webhooks/djomy': {
    post: {
      tags: ['Webhooks'],
      summary: 'Callback Djomy (changement de statut de paiement)',
      description:
        "Appelé par Djomy uniquement, pas par le frontend. URL à déclarer dans l'espace développeur Djomy. " +
        "Accepte les formats V1 (`data`) et V2 (`data.payment`). Signature `X-Webhook-Signature: v1:<hmac>` vérifiée ; " +
        "le statut est toujours reconfirmé via l'API Djomy avant d'activer un abonnement. Non soumis au rate limit.",
      security: [],
      parameters: [{ name: 'X-Webhook-Signature', in: 'header', schema: { type: 'string', example: 'v1:3f1a…' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: { type: 'object' },
            example: {
              eventType: 'payment.success',
              data: {
                transactionId: '1d0de2c2-39e5-43fd-a464-f31feef97bef',
                status: 'SUCCESS',
                paidAmount: 10000,
                receivedAmount: 9875,
                fees: 125,
                paymentMethod: 'OM',
                payerIdentifier: '00224621999616',
                merchantPaymentReference: 'SUB-M2X7K9QF-3A1C',
                currency: 'GNF',
              },
              paymentLinkReference: 'VUG6FKh9',
              metadata: { type: 'subscription', paymentId: 'cm…', planCode: 'MONTH' },
            },
          },
        },
      },
      responses: {
        200: { description: 'Traité (ou ignoré : paiement inconnu, événement payout).' },
        401: { description: 'Signature invalide (uniquement si DJOMY_WEBHOOK_REQUIRE_SIGNATURE=true).' },
        500: { description: 'Djomy injoignable pour la vérification — Djomy rejouera.' },
      },
    },
  },

  // ===== App — Chat =================================================
  '/app/chat/threads': {
    get: {
      tags: ['App · Chat'],
      summary: 'Lister mes conversations',
      security: bearer,
      responses: { 200: okList({ $ref: '#/components/schemas/ChatThread' }) },
    },
    post: {
      tags: ['App · Chat'],
      summary: 'Ouvrir (ou reprendre) une conversation',
      description: "Retourne la conversation OPEN/ESCALATED existante s'il y en a une, sinon en crée une.",
      security: bearer,
      responses: { 200: ok({ $ref: '#/components/schemas/ChatThread' }) },
    },
  },
  '/app/chat/threads/{id}/messages': {
    get: {
      tags: ['App · Chat'],
      summary: "Lister les messages d'une conversation",
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: okList({ $ref: '#/components/schemas/ChatMessage' }), 404: responses.NotFound },
    },
    post: {
      tags: ['App · Chat'],
      summary: 'Envoyer un message',
      description: 'Déclenche une réponse automatique du bot (FAQ) ou escalade la conversation si aucune règle ne correspond.',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } } },
      },
      responses: { 201: okList({ $ref: '#/components/schemas/ChatMessage' }, 'Le message envoyé, suivi de la réponse du bot le cas échéant.'), 400: responses.BadRequest, 404: responses.NotFound },
    },
  },
  '/app/chat/threads/{id}/close': {
    post: {
      tags: ['App · Chat'],
      summary: 'Clôturer une conversation',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Conversation clôturée.' }, 404: responses.NotFound },
    },
  },

  // ===== Station — Auth ==============================================
  '/station/auth/register': {
    post: {
      tags: ['Station · Auth'],
      summary: 'Inscription station (auto-service, en attente de validation admin)',
      description:
        "Crée un compte STATION avec le statut PENDING pour la station choisie. Le compte peut se connecter et lire son tableau de bord, mais toute écriture (ouverture/fermeture, statut produit) reste bloquée (403) tant qu'un admin ne le passe pas ACTIVE via PUT /admin/accounts/{id}/status.",
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['stationId', 'fullName', 'phoneNumber', 'password'],
              properties: {
                stationId: { type: 'string' },
                fullName: { type: 'string', minLength: 3 },
                phoneNumber: { type: 'string', example: '+224622334455', description: 'Numéro guinéen, 9 chiffres débutant par 6 ou 7 ; formats acceptés et normalisés en +224XXXXXXXXX.' },
                password: { type: 'string', minLength: 6 },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Demande enregistrée, en attente de validation.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'object',
                    properties: {
                      accountId: { type: 'string' },
                      loginCode: { type: 'string' },
                      status: { type: 'string', enum: ['PENDING'] },
                    },
                  },
                },
              },
            },
          },
        },
        400: responses.BadRequest,
        404: responses.NotFound,
        409: responses.Conflict,
      },
    },
  },
  '/station/auth/me': {
    get: {
      tags: ['Station · Auth'],
      summary: 'Mon compte station (statut PENDING/ACTIVE à jour)',
      description: "À rappeler à chaque lancement pour détecter le passage PENDING → ACTIVE décidé par un admin.",
      security: bearer,
      responses: {
        200: {
          description: 'Compte courant.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean' }, account: { $ref: '#/components/schemas/Account' } },
              },
            },
          },
        },
        401: responses.Unauthorized,
      },
    },
  },
  '/station/auth/login': {
    post: {
      tags: ['Station · Auth'],
      summary: 'Connexion station (code + mot de passe)',
      description:
        "Le compte STATION est créé par un admin via POST /admin/stations/{id}/accounts, ou auto-inscrit via POST /station/auth/register (statut PENDING). Un compte PENDING reçoit ses tokens normalement ; seul SUSPENDED/DELETED est refusé (403).",
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['loginCode', 'password'],
              properties: { loginCode: { type: 'string' }, password: { type: 'string' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Connexion réussie.',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/AuthTokens' },
                  { type: 'object', properties: { success: { type: 'boolean' }, account: { $ref: '#/components/schemas/Account' } } },
                ],
              },
            },
          },
        },
        401: responses.Unauthorized,
        403: responses.Forbidden,
      },
    },
  },
  '/station/auth/password': {
    put: {
      tags: ['Station · Auth'],
      summary: 'Changer mon mot de passe',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['currentPassword', 'newPassword'],
              properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string' } },
            },
          },
        },
      },
      responses: { 200: { description: 'Mot de passe mis à jour.' }, 401: responses.Unauthorized },
    },
  },

  // ===== Station — Dashboard ==========================================
  '/station/dashboard/stations': {
    get: {
      tags: ['Station · Dashboard'],
      summary: 'Lister les stations que je gère',
      security: bearer,
      responses: { 200: okList({ $ref: '#/components/schemas/StationMembership' }) },
    },
  },
  '/station/dashboard/{stationId}': {
    get: {
      tags: ['Station · Dashboard'],
      summary: "Tableau de bord d'une station",
      description: 'Inclut les produits, les 20 dernières activités et les signalements en attente.',
      security: bearer,
      parameters: [{ name: 'stationId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: ok({ $ref: '#/components/schemas/Station' }), 403: responses.Forbidden },
    },
  },
  '/station/dashboard/{stationId}/open': {
    put: {
      tags: ['Station · Dashboard'],
      summary: 'Ouvrir / fermer la station',
      security: bearer,
      parameters: [{ name: 'stationId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['isOpen'], properties: { isOpen: { type: 'boolean' } } } } },
      },
      responses: { 200: ok({ $ref: '#/components/schemas/Station' }), 400: responses.BadRequest, 403: responses.Forbidden },
    },
  },
  '/station/dashboard/{stationId}/products/{product}': {
    put: {
      tags: ['Station · Dashboard'],
      summary: "Mettre à jour la disponibilité / le prix d'un produit",
      description: 'Ajoute automatiquement une (ou deux) entrées StationActivity.',
      security: bearer,
      parameters: [
        { name: 'stationId', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'product', in: 'path', required: true, schema: { type: 'string', enum: PRODUCT_ENUM } },
      ],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { availability: { type: 'string', enum: ['AVAILABLE', 'EMPTY'] }, priceGnf: { type: 'integer' } },
            },
          },
        },
      },
      responses: { 200: ok({ $ref: '#/components/schemas/StationProduct' }), 400: responses.BadRequest, 403: responses.Forbidden },
    },
  },
  '/station/dashboard/{stationId}/activities': {
    get: {
      tags: ['Station · Dashboard'],
      summary: "Historique d'activité de la station (50 dernières)",
      security: bearer,
      parameters: [{ name: 'stationId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: okList({ $ref: '#/components/schemas/StationActivity' }), 403: responses.Forbidden },
    },
  },
  '/station/dashboard/{stationId}/reports': {
    get: {
      tags: ['Station · Dashboard'],
      summary: 'Signalements reçus par la station',
      security: bearer,
      parameters: [{ name: 'stationId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: okList({ $ref: '#/components/schemas/StationReport' }), 403: responses.Forbidden },
    },
  },

  // ===== Admin — Auth ==================================================
  '/admin/auth/login': {
    post: {
      tags: ['Admin · Auth'],
      summary: 'Connexion admin',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['phoneNumber', 'password'],
              properties: { phoneNumber: { type: 'string' }, password: { type: 'string' } },
            },
          },
        },
      },
      responses: { 200: { description: 'Connexion réussie.' }, 401: responses.Unauthorized, 403: responses.Forbidden },
    },
  },
  '/admin/auth/me': {
    get: {
      tags: ['Admin · Auth'],
      summary: 'Mon profil admin',
      security: bearer,
      responses: { 200: ok({ $ref: '#/components/schemas/Account' }), 401: responses.Unauthorized },
    },
  },

  // ===== Admin — Comptes ================================================
  '/admin/accounts': {
    get: {
      tags: ['Admin · Comptes'],
      summary: 'Lister les comptes',
      security: bearer,
      parameters: [
        { name: 'role', in: 'query', schema: { type: 'string', enum: ['DRIVER', 'STATION', 'ADMIN'] } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED'] } },
      ],
      responses: { 200: okList({ $ref: '#/components/schemas/Account' }), 403: responses.Forbidden },
    },
  },
  '/admin/accounts/{id}': {
    get: {
      tags: ['Admin · Comptes'],
      summary: "Détail d'un compte",
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: ok({ $ref: '#/components/schemas/Account' }), 404: responses.NotFound },
    },
  },
  '/admin/accounts/{id}/status': {
    put: {
      tags: ['Admin · Comptes'],
      summary: 'Suspendre / réactiver / supprimer un compte',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'DELETED'] } } },
          },
        },
      },
      responses: { 200: ok({ $ref: '#/components/schemas/Account' }), 400: responses.BadRequest },
    },
  },

  // ===== Admin — Stations ================================================
  '/admin/stations': {
    get: {
      tags: ['Admin · Stations'],
      summary: 'Lister toutes les stations',
      security: bearer,
      responses: { 200: okList({ $ref: '#/components/schemas/Station' }) },
    },
    post: {
      tags: ['Admin · Stations'],
      summary: 'Créer une station',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'latitude', 'longitude'],
              properties: {
                name: { type: 'string' },
                brandId: { type: 'string' },
                areaId: { type: 'string' },
                neighborhood: { type: 'string' },
                city: { type: 'string', default: 'Conakry' },
                address: { type: 'string' },
                phoneNumber: { type: 'string' },
                latitude: { type: 'number' },
                longitude: { type: 'number' },
              },
            },
          },
        },
      },
      responses: { 201: ok({ $ref: '#/components/schemas/Station' }), 400: responses.BadRequest },
    },
  },
  '/admin/stations/import-osm': {
    post: {
      tags: ['Admin · Stations'],
      summary: 'Importer/synchroniser les stations depuis OpenStreetMap (Guinée)',
      security: bearer,
      responses: { 200: { description: 'Import terminé (créées / mises à jour / ignorées / erreurs).' } },
    },
  },
  '/admin/stations/{id}': {
    get: {
      tags: ['Admin · Stations'],
      summary: "Détail d'une station",
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: ok({ $ref: '#/components/schemas/Station' }), 404: responses.NotFound },
    },
    put: {
      tags: ['Admin · Stations'],
      summary: 'Modifier une station',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                brandId: { type: 'string' },
                areaId: { type: 'string' },
                neighborhood: { type: 'string' },
                city: { type: 'string' },
                address: { type: 'string' },
                phoneNumber: { type: 'string' },
                latitude: { type: 'number' },
                longitude: { type: 'number' },
                isPublished: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: { 200: ok({ $ref: '#/components/schemas/Station' }), 404: responses.NotFound },
    },
    delete: {
      tags: ['Admin · Stations'],
      summary: 'Supprimer une station',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Station supprimée.' }, 404: responses.NotFound },
    },
  },
  '/admin/stations/{id}/verify': {
    put: {
      tags: ['Admin · Stations'],
      summary: 'Marquer une station comme vérifiée',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: ok({ $ref: '#/components/schemas/Station' }) },
    },
  },
  '/admin/stations/{id}/accounts': {
    post: {
      tags: ['Admin · Stations'],
      summary: "Créer l'accès (code + mot de passe) d'une station",
      description: 'Le mot de passe en clair est retourné une seule fois — à transmettre à la station puis à ne plus jamais réafficher.',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        201: {
          description: 'Accès créé.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'object',
                    properties: { accountId: { type: 'string' }, loginCode: { type: 'string' }, password: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
        404: responses.NotFound,
      },
    },
  },

  // ===== Admin — Catalogue ================================================
  '/admin/catalog/brands': {
    get: {
      tags: ['Admin · Catalogue'],
      summary: 'Lister les marques',
      security: bearer,
      responses: { 200: ok({ type: 'array', items: { $ref: '#/components/schemas/Brand' } }) },
    },
    post: {
      tags: ['Admin · Catalogue'],
      summary: 'Créer une marque',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, logoUrl: { type: 'string' } } },
          },
        },
      },
      responses: { 201: ok({ $ref: '#/components/schemas/Brand' }), 400: responses.BadRequest },
    },
  },
  '/admin/catalog/brands/{id}': {
    put: {
      tags: ['Admin · Catalogue'],
      summary: 'Modifier une marque',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, logoUrl: { type: 'string' } } } },
        },
      },
      responses: { 200: ok({ $ref: '#/components/schemas/Brand' }) },
    },
    delete: {
      tags: ['Admin · Catalogue'],
      summary: 'Supprimer une marque',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Marque supprimée.' } },
    },
  },
  '/admin/catalog/areas': {
    get: {
      tags: ['Admin · Catalogue'],
      summary: 'Lister les zones de recherche',
      security: bearer,
      responses: { 200: ok({ type: 'array', items: { $ref: '#/components/schemas/Area' } }) },
    },
    post: {
      tags: ['Admin · Catalogue'],
      summary: 'Créer une zone',
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['label', 'latitude', 'longitude'],
              properties: {
                label: { type: 'string' },
                latitude: { type: 'number' },
                longitude: { type: 'number' },
                sortOrder: { type: 'integer' },
              },
            },
          },
        },
      },
      responses: { 201: ok({ $ref: '#/components/schemas/Area' }), 400: responses.BadRequest },
    },
  },
  '/admin/catalog/areas/{id}': {
    put: {
      tags: ['Admin · Catalogue'],
      summary: 'Modifier une zone',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                latitude: { type: 'number' },
                longitude: { type: 'number' },
                sortOrder: { type: 'integer' },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: { 200: ok({ $ref: '#/components/schemas/Area' }) },
    },
    delete: {
      tags: ['Admin · Catalogue'],
      summary: 'Supprimer une zone',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'Zone supprimée.' } },
    },
  },

  // ===== Admin — Signalements ==============================================
  '/admin/reports': {
    get: {
      tags: ['Admin · Signalements'],
      summary: 'Lister les signalements',
      security: bearer,
      parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'REJECTED'] } }],
      responses: { 200: okList({ $ref: '#/components/schemas/StationReport' }) },
    },
  },
  '/admin/reports/{id}': {
    put: {
      tags: ['Admin · Signalements'],
      summary: 'Accepter ou rejeter un signalement',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ACCEPTED', 'REJECTED'] } } },
          },
        },
      },
      responses: { 200: ok({ $ref: '#/components/schemas/StationReport' }), 400: responses.BadRequest },
    },
  },

  // ===== Admin — Chat (supervision) ========================================
  '/admin/chat/threads': {
    get: {
      tags: ['Admin · Chat'],
      summary: 'Lister les conversations (ex: escaladées)',
      security: bearer,
      parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['OPEN', 'ESCALATED', 'CLOSED'] } }],
      responses: { 200: okList({ $ref: '#/components/schemas/ChatThread' }) },
    },
  },
  '/admin/chat/threads/{id}/messages': {
    get: {
      tags: ['Admin · Chat'],
      summary: "Lire les messages d'une conversation",
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: okList({ $ref: '#/components/schemas/ChatMessage' }) },
    },
    post: {
      tags: ['Admin · Chat'],
      summary: "Répondre en tant qu'agent",
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } } },
      },
      responses: { 201: ok({ $ref: '#/components/schemas/ChatMessage' }), 400: responses.BadRequest, 404: responses.NotFound },
    },
  },
  '/admin/chat/threads/{id}/close': {
    put: {
      tags: ['Admin · Chat'],
      summary: 'Clôturer une conversation',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: ok({ $ref: '#/components/schemas/ChatThread' }) },
    },
  },

  // ===== Admin — Abonnements ===============================================
  '/admin/subscriptions': {
    get: {
      tags: ['Admin · Abonnements'],
      summary: "Périodes d'abonnement (200 plus récentes)",
      security: bearer,
      parameters: [
        { name: 'accountId', in: 'query', schema: { type: 'string' } },
        { name: 'active', in: 'query', schema: { type: 'string', enum: ['true'] }, description: 'true = seulement les périodes en cours.' },
      ],
      responses: { 200: { description: 'Liste des Subscription avec plan et compte.' } },
    },
  },
  '/admin/subscriptions/plans': {
    get: {
      tags: ['Admin · Abonnements'],
      summary: 'Formules (actives et inactives)',
      security: bearer,
      responses: { 200: okList({ $ref: '#/components/schemas/Plan' }) },
    },
  },
  '/admin/subscriptions/plans/{code}': {
    put: {
      tags: ['Admin · Abonnements'],
      summary: "Modifier le libellé, le prix ou l'activation d'une formule",
      description: "N'affecte que les paiements futurs.",
      security: bearer,
      parameters: [{ name: 'code', in: 'path', required: true, schema: { type: 'string', enum: ['DAY', 'MONTH'] } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { label: { type: 'string' }, priceGnf: { type: 'integer' }, isActive: { type: 'boolean' } },
            },
          },
        },
      },
      responses: { 200: ok({ $ref: '#/components/schemas/Plan' }), 400: responses.BadRequest, 404: responses.NotFound },
    },
  },
  '/admin/subscriptions/payments': {
    get: {
      tags: ['Admin · Abonnements'],
      summary: 'Paiements (200 plus récents)',
      security: bearer,
      parameters: [
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED'] } },
        { name: 'accountId', in: 'query', schema: { type: 'string' } },
      ],
      responses: { 200: { description: 'Liste des Payment (tous les champs, dont transactionId, fees, receivedAmount) avec plan, période et compte.' } },
    },
  },
  '/admin/subscriptions/payments/{id}/reconcile': {
    post: {
      tags: ['Admin · Abonnements'],
      summary: 'Revérifier un paiement auprès de Djomy',
      description: "Pour un client qui affirme avoir payé : relit le statut chez Djomy et active l'abonnement si le paiement a réussi.",
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: { description: 'outcome (granted, already_processed, pending, expired…) + paiement à jour.' }, 404: responses.NotFound },
    },
  },

  // ===== Admin — Messagerie (SMS personnalisés) ============================
  '/admin/messages': {
    get: {
      tags: ['Admin · Messagerie'],
      summary: 'Historique des envois (100 plus récents)',
      security: bearer,
      parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['SCHEDULED', 'SENT', 'CANCELED'] } }],
      responses: { 200: okList({ $ref: '#/components/schemas/AdminMessage' }) },
    },
    post: {
      tags: ['Admin · Messagerie'],
      summary: 'Envoyer (ou programmer) un SMS personnalisé à une liste de comptes',
      description:
        "Destinataires DRIVER ou STATION uniquement (un ADMIN dans `accountIds` est ignoré et remonté dans `wrongRoleIds`). " +
        'Chaque destinataire est traité indépendamment (voir `recipients[].status`) : SKIPPED si le compte ' +
        "n'a pas de numéro enregistré, FAILED si l'envoi SMS a échoué — un échec isolé ne bloque jamais les autres. " +
        "Sans `scheduledAt`, l'envoi est immédiat (le message répond une fois le lot traité). Avec `scheduledAt` " +
        "(au moins 1 minute dans le futur), le message reste `SCHEDULED` et le planificateur (poll toutes les " +
        "60s) le dispatche à l'heure dite — annulable via PUT /admin/messages/{id}/cancel tant qu'il n'est pas parti.",
      security: bearer,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['accountIds', 'body'],
              properties: {
                accountIds: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 1,
                  maxItems: 1000,
                  description: 'Identifiants de comptes DRIVER ou STATION.',
                },
                body: { type: 'string', maxLength: 500, example: 'Maintenance prévue ce soir de 22h à minuit.' },
                scheduledAt: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Optionnel — date ISO au moins 1 minute dans le futur. Omis = envoi immédiat.',
                },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "Envoi traité immédiatement, ou programmé (voir `data.status`).",
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    allOf: [
                      { $ref: '#/components/schemas/AdminMessage' },
                      {
                        type: 'object',
                        properties: {
                          notFoundIds: { type: 'array', items: { type: 'string' }, description: 'Ids sans compte correspondant.' },
                          wrongRoleIds: { type: 'array', items: { type: 'string' }, description: 'Comptes trouvés mais ni DRIVER ni STATION (ex: ADMIN).' },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
        400: responses.BadRequest,
      },
    },
  },
  '/admin/messages/{id}': {
    get: {
      tags: ['Admin · Messagerie'],
      summary: "Détail d'un envoi et statut par destinataire",
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { 200: ok({ $ref: '#/components/schemas/AdminMessage' }), 404: responses.NotFound },
    },
  },
  '/admin/messages/{id}/cancel': {
    put: {
      tags: ['Admin · Messagerie'],
      summary: 'Annuler un envoi programmé pas encore dispatché',
      security: bearer,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: ok({ $ref: '#/components/schemas/AdminMessage' }),
        400: { description: "Le message n'est plus SCHEDULED (déjà envoyé ou déjà annulé)." },
        404: responses.NotFound,
      },
    },
  },
};

const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Carbugui API',
    version: '1.0.0',
    description:
      "API backend de Carbugui — recherche de stations-service en temps réel en Guinée. " +
      "Trois espaces : `/app` (chauffeurs), `/station` (tableau de bord station), `/admin` (back-office). " +
      "Produits suivis : ESSENCE, GASOIL, GAZ, LUBRIFIANT. La consultation des stations est réservée aux chauffeurs " +
      "abonnés (24 h ou 1 mois, paiement Djomy) — réponse 402 `SUBSCRIPTION_REQUIRED` sinon. " +
      "Un canal WebSocket (même port que le serveur HTTP) diffuse les messages de chat en temps réel : " +
      "envoyer `{ threadId, accountId }` pour s'initialiser puis `{ text }` pour envoyer un message.",
    contact: { name: 'Carbugui' },
  },
  servers,
  tags: [
    { name: 'App · Auth' },
    { name: 'App · Stations' },
    { name: 'App · Abonnements', description: 'Abonnement chauffeur 24 h / 1 mois payé via Djomy.' },
    { name: 'App · Chat' },
    { name: 'Station · Auth' },
    { name: 'Station · Dashboard' },
    { name: 'Admin · Auth' },
    { name: 'Admin · Comptes' },
    { name: 'Admin · Stations' },
    { name: 'Admin · Catalogue' },
    { name: 'Admin · Signalements' },
    { name: 'Admin · Chat' },
    { name: 'Admin · Messagerie' },
    { name: 'Admin · Abonnements' },
    { name: 'Webhooks' },
  ],
  components: { securitySchemes, schemas, responses },
  paths,
};

module.exports = openapiSpec;
