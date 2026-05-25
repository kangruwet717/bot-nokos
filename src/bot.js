const { Telegraf } = require('telegraf');
const env = require('./config/env');
const logger = require('./utils/logger');
const { attachUser, rateLimitCallbacks } = require('./bot/middlewares/requireUser');
const { registerStartHandlers } = require('./bot/handlers/start.handler');
const { registerDepositHandlers } = require('./bot/handlers/deposit.handler');
const { registerOrderHandlers } = require('./bot/handlers/order.handler');
const { registerHistoryHandlers } = require('./bot/handlers/history.handler');
const { registerAdminHandlers } = require('./bot/handlers/admin.handler');
const { setBot } = require('./services/notification.service');

function createBot() {
  if (!env.BOT_TOKEN) {
    logger.warn('BOT_TOKEN is empty; bot is not initialized');
    return null;
  }

  const bot = new Telegraf(env.BOT_TOKEN);
  bot.use(attachUser);
  bot.use(rateLimitCallbacks);

  registerStartHandlers(bot);
  registerDepositHandlers(bot);
  registerOrderHandlers(bot);
  registerHistoryHandlers(bot);
  registerAdminHandlers(bot);

  bot.catch((error, ctx) => {
    logger.error({ error, update: ctx.update }, 'bot error');
    const detail = env.NODE_ENV === 'production' ? '' : `\n\nDetail: ${error.message}`;
    if (ctx.callbackQuery) {
      ctx.answerCbQuery('Terjadi error. Silakan coba beberapa saat lagi.').catch(() => null);
    }
    return ctx.reply(`Terjadi error. Silakan coba beberapa saat lagi.${detail}`).catch(() => null);
  });

  setBot(bot);
  return bot;
}

module.exports = { createBot };
