const env = require('./config/env');
const logger = require('./utils/logger');
const prisma = require('./config/prisma');
const { redis } = require('./config/redis');
const { createBot } = require('./bot');
const { createApp } = require('./app');
const depositService = require('./services/deposit.service');
const { createOtpPollingWorker } = require('./workers/otpPolling.worker');

async function main() {
  await prisma.$connect();
  logger.info('database connected');
  if (!env.APP_URL || env.APP_URL.includes('domainkamu.com')) {
    logger.warn(
      { appUrl: env.APP_URL },
      'APP_URL is not configured for production. Telegram webhook mode needs a real public HTTPS URL.'
    );
  }

  const bot = createBot();
  const app = createApp(bot);
  const embeddedWorker = env.START_EMBEDDED_WORKER ? createOtpPollingWorker() : null;
  if (embeddedWorker) logger.info('embedded otp polling worker started');

  const server = app.listen(env.PORT, async () => {
    logger.info({ port: env.PORT }, 'server started');
    if (!bot) return;
    if (env.BOT_MODE === 'polling') {
      await bot.launch();
      logger.info('bot polling started');
    } else if (env.APP_URL) {
      await bot.telegram.setWebhook(`${env.APP_URL}/telegram/${env.TELEGRAM_WEBHOOK_SECRET}`);
      logger.info('telegram webhook configured');
    }
  });

  const maintenanceTimer = setInterval(async () => {
    try {
      await depositService.expirePendingDeposits();
      await depositService.processPendingDeposits();
    } catch (error) {
      const payload = {
        message: error.message,
        code: error.code,
        status: error.status,
        action: error.action
      };
      if (error.isTransient) {
        logger.warn(payload, 'deposit maintenance skipped: payment provider temporarily unavailable');
      } else {
        logger.error({ error }, 'deposit maintenance failed');
      }
    }
  }, 60 * 1000);

  const shutdown = async () => {
    logger.info('shutting down');
    clearInterval(maintenanceTimer);
    if (embeddedWorker) await embeddedWorker.close();
    if (bot) bot.stop('SIGTERM');
    server.close();
    await prisma.$disconnect();
    await redis.quit();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error) => {
  logger.error({ error }, 'fatal startup error');
  process.exit(1);
});
