const userService = require('../../services/user.service');
const messages = require('../../constants/messages');
const env = require('../../config/env');
const { hitLimit } = require('../../services/rateLimit.service');

async function attachUser(ctx, next) {
  if (!ctx.from) return next();
  ctx.state.user = await userService.findOrCreateTelegramUser(ctx.from);
  return next();
}

async function guardNotBanned(ctx, next) {
  if (ctx.state.user?.isBanned) {
    return ctx.reply(messages.banned(ctx.state.user.banReason));
  }
  return next();
}

async function rateLimitCallbacks(ctx, next) {
  if (!ctx.callbackQuery || !ctx.state.user) return next();
  const limited = await hitLimit(`rate:callback:${ctx.state.user.id}`, env.MAX_CALLBACKS_PER_MINUTE, 60);
  if (limited) return ctx.answerCbQuery('Terlalu banyak klik. Tunggu sebentar.').catch(() => null);
  return next();
}

module.exports = { attachUser, guardNotBanned, rateLimitCallbacks };
