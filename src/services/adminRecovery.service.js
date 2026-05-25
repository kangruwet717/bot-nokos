const prisma = require('../config/prisma');
const wallet = require('./wallet.service');
const DepositStatus = require('../constants/depositStatus');
const OrderStatus = require('../constants/orderStatus');
const env = require('../config/env');
const { stringifyJsonField, parseJsonField } = require('../utils/jsonField');
const { notifyDepositChannel } = require('./notification.service');

async function lockDeposit(tx, depositId) {
  if (env.DATABASE_URL.startsWith('file:')) return;
  await tx.$queryRaw`SELECT id FROM deposits WHERE id = ${depositId} FOR UPDATE`;
}

async function lockOrder(tx, orderId) {
  if (env.DATABASE_URL.startsWith('file:')) return;
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
}

async function markDepositPaid(reference, adminTelegramId, note = null) {
  const deposit = await prisma.deposit.findFirst({ where: { reference } });
  if (!deposit) throw new Error('Deposit tidak ditemukan');

  const result = await prisma.$transaction(async (tx) => {
    await lockDeposit(tx, deposit.id);
    const current = await tx.deposit.findUnique({ where: { id: deposit.id }, include: { user: true } });
    if (current.status === DepositStatus.PAID) return { deposit: current, credited: false };
    if (current.status !== DepositStatus.PENDING) {
      throw new Error(`Deposit status ${current.status}, tidak bisa ditandai PAID`);
    }

    const updated = await tx.deposit.update({
      where: { id: current.id },
      data: { status: DepositStatus.PAID, paidAt: new Date() },
      include: { user: true }
    });

    await wallet.credit({
      userId: current.userId,
      amount: current.amount,
      type: 'deposit',
      referenceType: 'deposit',
      referenceId: current.id,
      note: note || `Manual recovery deposit ${current.reference}`,
      adminTelegramId,
      tx
    });

    return { deposit: updated, credited: true };
  });

  if (result.credited) {
    const depositWithUser = await prisma.deposit.findUnique({
      where: { id: result.deposit.id },
      include: { user: true }
    });
    if (depositWithUser) {
      await notifyDepositChannel(depositWithUser);
      return { ...result, deposit: depositWithUser };
    }
  }

  return result;
}

async function markDepositCancelled(reference, note = null) {
  const deposit = await prisma.deposit.findFirst({ where: { reference } });
  if (!deposit) throw new Error('Deposit tidak ditemukan');
  if (deposit.status === DepositStatus.PAID) throw new Error('Deposit PAID tidak boleh dibatalkan');
  const currentRaw = parseJsonField(deposit.rawResponse, {});

  return prisma.deposit.update({
    where: { id: deposit.id },
    data: {
      status: DepositStatus.CANCELLED,
      rawResponse: stringifyJsonField({
        ...(currentRaw && typeof currentRaw === 'object' ? currentRaw : {}),
        manualCancelNote: note,
        manualCancelledAt: new Date().toISOString()
      })
    }
  });
}

async function refundOrder(orderId, adminTelegramId, reason = 'Manual refund') {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } });
  if (!order) throw new Error('Order tidak ditemukan');

  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, order.id);
    const current = await tx.order.findUnique({ where: { id: order.id }, include: { user: true } });
    if (current.status === OrderStatus.REFUNDED) return { order: current, refunded: false };
    if ([OrderStatus.COMPLETED, OrderStatus.SMS_RECEIVED].includes(current.status)) {
      throw new Error(`Order status ${current.status}, refund manual ditolak`);
    }

    const updated = await tx.order.update({
      where: { id: current.id },
      data: { status: OrderStatus.REFUNDED, cancelReason: reason },
      include: { user: true }
    });

    await wallet.credit({
      userId: current.userId,
      amount: current.sellPrice,
      type: 'refund',
      referenceType: 'order',
      referenceId: current.id,
      note: reason,
      adminTelegramId,
      tx
    });

    return { order: updated, refunded: true };
  });
}

async function markOrderFailed(orderId, reason = 'Manual fail') {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order tidak ditemukan');
  if ([OrderStatus.REFUNDED, OrderStatus.COMPLETED, OrderStatus.SMS_RECEIVED].includes(order.status)) {
    throw new Error(`Order status ${order.status}, tidak bisa ditandai FAILED`);
  }
  return prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.FAILED, cancelReason: reason }
  });
}

async function markOrderCompleted(orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new Error('Order tidak ditemukan');
  return prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.COMPLETED, completedAt: new Date() }
  });
}

module.exports = {
  markDepositPaid,
  markDepositCancelled,
  refundOrder,
  markOrderFailed,
  markOrderCompleted
};
