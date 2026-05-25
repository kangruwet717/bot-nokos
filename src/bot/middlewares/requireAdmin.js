const env = require('../../config/env');

function isAdmin(telegramId) {
  return env.ADMIN_ID_SET.has(Number(telegramId));
}

function requireAdmin(ctx, next) {
  if (!isAdmin(ctx.from?.id)) return ctx.reply('Akses admin ditolak.');
  return next();
}

module.exports = { isAdmin, requireAdmin };
