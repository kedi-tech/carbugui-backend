const http = require('http');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const WebSocket = require('ws');
const swaggerUi = require('swagger-ui-express');

dotenv.config();

const prisma = require('./utils/prisma');
const { matchIntent } = require('./utils/chatBot');
const { dispatchDueScheduledMessages } = require('./utils/adminMessaging');
const { reconcilePendingPayments } = require('./utils/subscriptions');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const openapiSpec = require('./docs/openapi');

// App routes (chauffeurs)
const appAuthRoutes = require('./routes/app/auth/auth');
const appStationRoutes = require('./routes/app/stations/station');
const appChatRoutes = require('./routes/app/chat/chat');
const appSubscriptionRoutes = require('./routes/app/subscriptions/subscriptions');

// Webhooks entrants (prestataires de paiement)
const djomyWebhookRoutes = require('./routes/webhooks/djomy');

// Station routes (dashboard station-service)
const stationAuthRoutes = require('./routes/station/auth/auth');
const stationDashboardRoutes = require('./routes/station/dashboard/dashboard');

// Admin routes
const adminAuthRoutes = require('./routes/admin/auth/auth');
const adminAccountRoutes = require('./routes/admin/accounts/accounts');
const adminStationRoutes = require('./routes/admin/stations/station');
const adminCatalogRoutes = require('./routes/admin/catalog/catalog');
const adminReportRoutes = require('./routes/admin/reports/reports');
const adminChatRoutes = require('./routes/admin/chat/chat');
const adminMessageRoutes = require('./routes/admin/messages/messages');
const adminSubscriptionRoutes = require('./routes/admin/subscriptions/subscriptions');

const app = express();
const PORT = process.env.PORT || 5000;
const apiVersion = process.env.API_VERSION || 'v1';
const apiPrefix = `/api/${apiVersion}`;

app.use(cors());

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 10 * 60 * 1000, 
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 500,
  message: {
    error: 'Trop de requêtes depuis cette adresse IP, réessayez plus tard.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Le corps brut est conservé pour vérifier la signature HMAC des webhooks
// Djomy (X-Webhook-Signature), calculée sur les octets exacts reçus.
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));

// Monté avant le rate limiter : un rappel Djomy rejeté en 429 laisserait un
// paiement réussi sans abonnement.
app.use(`${apiPrefix}/webhooks`, djomyWebhookRoutes);

app.use('/api/', limiter);

app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'CARBUGUI API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  });
});

app.get('/api-docs.json', (req, res) => res.json(openapiSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, { customSiteTitle: 'Carbugui API Docs' }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Map<WebSocket, { accountId: string, threadId: string }>
const chatClients = new Map();

wss.on('connection', (ws) => {
  console.log('🟢 Nouveau client connecté via WebSocket');

  let isInitialized = false;

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw);

      if (!isInitialized && data.threadId && data.accountId) {
        chatClients.set(ws, { accountId: data.accountId, threadId: data.threadId });

        const thread = await prisma.chatThread.findFirst({
          where: { id: data.threadId, accountId: data.accountId },
        });

        if (!thread) {
          ws.send(JSON.stringify({ type: 'error', message: 'Conversation introuvable.' }));
          return;
        }

        const messages = await prisma.chatMessage.findMany({
          where: { threadId: thread.id },
          orderBy: { createdAt: 'asc' },
        });

        ws.send(JSON.stringify({ type: 'messages', threadId: thread.id, messages }));
        isInitialized = true;
        return;
      }

      if (isInitialized && data.text) {
        const { threadId, accountId } = chatClients.get(ws);

        const thread = await prisma.chatThread.findUnique({ where: { id: threadId } });
        if (!thread) return;

        const userMessage = await prisma.chatMessage.create({
          data: { threadId, role: 'USER', text: data.text },
        });

        const broadcast = (message) => {
          chatClients.forEach((clientData, clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN && clientData.threadId === threadId) {
              clientWs.send(JSON.stringify({ type: 'new_message', threadId, message }));
            }
          });
        };

        broadcast(userMessage);

        if (thread.status === 'OPEN') {
          const intent = matchIntent(data.text);

          if (intent && intent.reply) {
            const botMessage = await prisma.chatMessage.create({
              data: { threadId, role: 'BOT', text: intent.reply, intentId: intent.id },
            });
            broadcast(botMessage);
          } else {
            await prisma.chatThread.update({ where: { id: threadId }, data: { status: 'ESCALATED', escalatedAt: new Date() } });
            const botMessage = await prisma.chatMessage.create({
              data: {
                threadId,
                role: 'BOT',
                text: 'Je transmets votre demande à un agent, il vous répondra très vite.',
                intentId: 'escalate',
              },
            });
            broadcast(botMessage);
          }
        }

        await prisma.chatThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
      }
    } catch (error) {
      console.error('❌ Erreur WebSocket:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Une erreur est survenue' }));
    }
  });

  ws.on('close', () => {
    chatClients.delete(ws);
    console.log('🔴 Client déconnecté via WebSocket');
  });
});

app.use(`${apiPrefix}/app/auth`, appAuthRoutes);
app.use(`${apiPrefix}/app/stations`, appStationRoutes);
app.use(`${apiPrefix}/app/chat`, appChatRoutes);
app.use(`${apiPrefix}/app/subscriptions`, appSubscriptionRoutes);

app.use(`${apiPrefix}/station/auth`, stationAuthRoutes);
app.use(`${apiPrefix}/station/dashboard`, stationDashboardRoutes);

app.use(`${apiPrefix}/admin/auth`, adminAuthRoutes);
app.use(`${apiPrefix}/admin/accounts`, adminAccountRoutes);
app.use(`${apiPrefix}/admin/stations`, adminStationRoutes);
app.use(`${apiPrefix}/admin/catalog`, adminCatalogRoutes);
app.use(`${apiPrefix}/admin/reports`, adminReportRoutes);
app.use(`${apiPrefix}/admin/chat`, adminChatRoutes);
app.use(`${apiPrefix}/admin/messages`, adminMessageRoutes);
app.use(`${apiPrefix}/admin/subscriptions`, adminSubscriptionRoutes);

app.use(notFound);
app.use(errorHandler);

server.listen(PORT, () => {
  console.log(`⛽ CARBUGUI API Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`📡 API Version: ${apiVersion}`);
});

// Dispatches due AdminMessage rows (immediate sends interrupted mid-request,
// and messages scheduled for the future) — see utils/adminMessaging.js.
setInterval(() => {
  dispatchDueScheduledMessages().catch((error) => console.error('dispatchDueScheduledMessages error:', error));
}, 60 * 1000);

// Rattrape les paiements Djomy restés PENDING (webhook perdu ou en retard)
// et expire les liens jamais payés — voir utils/subscriptions.js.
setInterval(() => {
  reconcilePendingPayments().catch((error) => console.error('reconcilePendingPayments error:', error));
}, 60 * 1000);

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => process.exit(0));
});

module.exports = app;
