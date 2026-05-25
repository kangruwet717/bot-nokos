const { nanoid } = require('nanoid');
const prisma = require('../config/prisma');

async function findOrCreateTelegramUser(from) {
  const telegramId = BigInt(from.id);
  const data = {
    username: from.username || null,
    firstName: from.first_name || null,
    lastName: from.last_name || null
  };

  return prisma.user.upsert({
    where: { telegramId },
    update: data,
    create: {
      telegramId,
      ...data,
      referralCode: nanoid(8)
    }
  });
}

async function getByTelegramId(telegramId) {
  return prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
}

async function acceptTos(telegramId) {
  return prisma.user.update({
    where: { telegramId: BigInt(telegramId) },
    data: { tosAcceptedAt: new Date() }
  });
}

async function setBan(telegramId, isBanned, reason = null) {
  return prisma.user.update({
    where: { telegramId: BigInt(telegramId) },
    data: { isBanned, banReason: isBanned ? reason : null }
  });
}

module.exports = { findOrCreateTelegramUser, getByTelegramId, acceptTos, setBan };
