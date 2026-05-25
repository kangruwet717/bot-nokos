const prisma = require('../config/prisma');
const env = require('../config/env');
const { toBigIntAmount } = require('../utils/money');

async function lockUser(tx, userId) {
  if (env.DATABASE_URL.startsWith('file:')) return;
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
}

async function changeBalance({
  userId,
  amount,
  type,
  referenceType,
  referenceId,
  note = null,
  adminTelegramId = null,
  tx: externalTx = null
}) {
  const delta = toBigIntAmount(amount);
  const run = async (tx) => {
    await lockUser(tx, userId);
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const nextBalance = user.balance + delta;
    if (nextBalance < 0n) {
      const error = new Error('Insufficient balance');
      error.code = 'INSUFFICIENT_BALANCE';
      throw error;
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { balance: nextBalance }
    });

    await tx.balanceLog.create({
      data: {
        userId,
        type,
        amount: delta,
        balanceBefore: user.balance,
        balanceAfter: nextBalance,
        referenceType,
        referenceId,
        note,
        adminTelegramId: adminTelegramId ? BigInt(adminTelegramId) : null
      }
    });

    return updated;
  };

  if (externalTx) return run(externalTx);
  return prisma.$transaction(run);
}

function absAmount(amount) {
  const value = toBigIntAmount(amount);
  return value < 0n ? -value : value;
}

function credit(args) {
  return changeBalance({ ...args, amount: absAmount(args.amount) });
}

function debit(args) {
  return changeBalance({ ...args, amount: -absAmount(args.amount) });
}

module.exports = { changeBalance, credit, debit };
