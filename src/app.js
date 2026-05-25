const express = require('express');
const helmet = require('helmet');
const env = require('./config/env');
const logger = require('./utils/logger');
const healthRoute = require('./routes/health.route');
const providerWebhook = require('./routes/provider.webhook');

function rawBodySaver(req, res, buf) {
  if (buf?.length) req.rawBody = buf.toString('utf8');
}

function createApp(bot = null) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ verify: rawBodySaver }));

  app.use('/health', healthRoute);
  app.use('/webhooks/provider', providerWebhook);

  if (bot && env.BOT_MODE === 'webhook') {
    app.use(bot.webhookCallback(`/telegram/${env.TELEGRAM_WEBHOOK_SECRET}`));
  }

  app.use((error, req, res, next) => {
    logger.error({ error }, 'request error');
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
