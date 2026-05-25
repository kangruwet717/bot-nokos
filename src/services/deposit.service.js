const { nanoid } = require('nanoid');
const prisma = require('../config/prisma');
const env = require('../config/env');
const DepositStatus = require('../constants/depositStatus');
const jagopay = require('./jagopay.service');
const wallet = require('./wallet.service');
const { notifyDepositChannel, notifyDepositPaidUser } = require('./notification.service');
const { hitLimit } = require('./rateLimit.service');
const logger = require('../utils/logger');
const settings = require('./settings.service');
const { stringifyJsonField, parseJsonField } = require('../utils/jsonField');

async function lockDeposit(tx, depositId) {
  if (env.DATABASE_URL.startsWith('file:')) return;
  await tx.$queryRaw`SELECT id FROM deposits WHERE id = ${depositId} FOR UPDATE`;
}

function expiryDate() {
  return new Date(Date.now() + env.JAGOPAY_INVOICE_TTL_MINUTES * 60 * 1000);
}

async function generateUniqueFee(amount) {
  const max = env.JAGOPAY_UNIQUE_CODE_MAX;
  if (max <= 0) return 0;

  const usedTotals = await prisma.deposit.findMany({
    where: {
      status: DepositStatus.PENDING,
      expiredAt: { gt: new Date() },
      totalAmount: { gte: BigInt(amount + 1), lte: BigInt(amount + max) }
    },
    select: { totalAmount: true }
  });
  const used = new Set(usedTotals.map((deposit) => Number(deposit.totalAmount)));

  for (let attempt = 0; attempt < max; attempt += 1) {
    const fee = 1 + Math.floor(Math.random() * max);
    if (!used.has(amount + fee)) return fee;
  }

  for (let fee = 1; fee <= max; fee += 1) {
    if (!used.has(amount + fee)) return fee;
  }

  throw new Error('Nominal unik invoice sedang penuh. Coba lagi beberapa saat.');
}

function extractPaymentData(response) {
  const data = jagopay.extractPaymentData(response);
  return {
    providerPaymentId: data.providerPaymentId,
    paymentUrl: null,
    qrImageUrl: data.qrImageUrl,
    qrString: data.qrString,
    fee: 0n,
    totalAmount: data.nominal ? BigInt(data.nominal) : null,
    expiredAt: null
  };
}

async function createDepositInvoice(user, amount, method = env.JAGOPAY_DEFAULT_METHOD) {
  if (!(await settings.getBooleanSetting('deposit_enabled', true))) {
    throw new Error((await settings.getSetting('maintenance_message', null)) || 'Deposit sedang ditutup sementara.');
  }

  const nominal = Number(amount);
  if (nominal < env.MIN_DEPOSIT || nominal > env.MAX_DEPOSIT) {
    throw new Error(`Nominal deposit harus antara ${env.MIN_DEPOSIT} dan ${env.MAX_DEPOSIT}`);
  }
  if (!env.JAGOPAY_API_KEY) {
    throw new Error('JAGOPAY_API_KEY belum diisi.');
  }

  const pendingCount = await prisma.deposit.count({
    where: { userId: user.id, status: DepositStatus.PENDING }
  });
  if (pendingCount >= env.MAX_PENDING_DEPOSITS_PER_USER) {
    throw new Error('Terlalu banyak invoice pending. Selesaikan atau batalkan invoice sebelumnya.');
  }
  const limited = await hitLimit(`rate:deposit:${user.id}`, env.MAX_DEPOSITS_PER_HOUR, 3600);
  if (limited) throw new Error('Limit pembuatan invoice per jam tercapai. Coba lagi nanti.');

  const reference = `DEP-${Date.now()}-${nanoid(6).toUpperCase()}`;
  const fee = await generateUniqueFee(nominal);
  const totalAmount = nominal + fee;
  const payment = await jagopay.createDynamicQris(totalAmount);

  return prisma.deposit.create({
    data: {
      userId: user.id,
      reference,
      providerPaymentId: payment.providerPaymentId || `JAGOPAY-${reference}`,
      method,
      amount: BigInt(nominal),
      fee: BigInt(fee),
      totalAmount: BigInt(totalAmount),
      status: DepositStatus.PENDING,
      paymentUrl: null,
      qrImageUrl: payment.qrImageUrl,
      qrString: payment.qrString,
      expiredAt: expiryDate(),
      idempotencyKey: `dep-${reference}`,
      rawResponse: stringifyJsonField(payment.rawResponse)
    }
  });
}

async function attachInvoiceMessage(depositId, chatId, messageId) {
  const deposit = await prisma.deposit.findUnique({ where: { id: depositId } });
  if (!deposit) return null;

  const currentRaw = parseJsonField(deposit.rawResponse, {});
  return prisma.deposit.update({
    where: { id: deposit.id },
    data: {
      rawResponse: stringifyJsonField({
        ...(currentRaw && typeof currentRaw === 'object' ? currentRaw : {}),
        telegramInvoiceMessage: {
          chatId: String(chatId),
          messageId: Number(messageId)
        }
      })
    }
  });
}

async function processPaidDeposit(deposit, payment, tx) {
  if (deposit.status === DepositStatus.PAID) return deposit;
  if (payment.amount && BigInt(payment.amount) !== deposit.totalAmount) {
    throw new Error('Jumlah mutasi tidak sesuai dengan invoice');
  }

  const currentRaw = parseJsonField(deposit.rawResponse, {});
  const rawResponse = {
    ...(currentRaw && typeof currentRaw === 'object' ? currentRaw : {}),
    paidMutation: payment.rawResponse || payment.raw
  };

  const updatedDeposit = await tx.deposit.update({
    where: { id: deposit.id },
    data: {
      status: DepositStatus.PAID,
      providerPaymentId: payment.providerPaymentId || deposit.providerPaymentId,
      paidAt: new Date(),
      rawResponse: stringifyJsonField(rawResponse)
    }
  });

  await wallet.credit({
    userId: deposit.userId,
    amount: deposit.amount,
    type: 'deposit',
    referenceType: 'deposit',
    referenceId: deposit.id,
    note: `Deposit ${deposit.reference}`,
    tx
  });

  return updatedDeposit;
}

async function markDepositPaid(deposit, mutation) {
  let shouldNotifyChannel = false;
  const updated = await prisma.$transaction(async (tx) => {
    await lockDeposit(tx, deposit.id);
    const current = await tx.deposit.findUnique({ where: { id: deposit.id } });
    if (!current) throw new Error('Deposit not found');
    if (current.status === DepositStatus.PAID) return current;
    if (current.status !== DepositStatus.PENDING) return current;

    shouldNotifyChannel = true;
    return processPaidDeposit(
      current,
      {
        amount: mutation.amount,
        providerPaymentId: mutation.id || current.providerPaymentId,
        rawResponse: mutation.raw || mutation
      },
      tx
    );
  });

  if (shouldNotifyChannel && updated.status === DepositStatus.PAID) {
    const depositWithUser = await prisma.deposit.findUnique({
      where: { id: updated.id },
      include: { user: true }
    });
    if (depositWithUser) {
      await notifyDepositChannel(depositWithUser);
      return depositWithUser;
    }
  }

  return updated;
}

async function findPaidMutationForDeposit(deposit) {
  for (let page = 1; page <= env.JAGOPAY_MUTATION_SCAN_PAGES; page += 1) {
    const { mutations } = await jagopay.getMutations(page);
    const mutation = mutations.find((item) => jagopay.isPaidMutationForDeposit(item, deposit));
    if (mutation) return mutation;
  }
  return null;
}

async function syncDepositStatus(depositId, userId) {
  const deposit = await prisma.deposit.findFirst({ where: { id: depositId, userId } });
  if (!deposit) throw new Error('Invoice tidak ditemukan');
  if (deposit.status !== DepositStatus.PENDING) return deposit;

  if (deposit.expiredAt && deposit.expiredAt <= new Date()) {
    return prisma.deposit.update({ where: { id: deposit.id }, data: { status: DepositStatus.EXPIRED } });
  }

  const mutation = await findPaidMutationForDeposit(deposit);
  if (!mutation) return deposit;
  return markDepositPaid(deposit, mutation);
}

async function syncDepositStatusByReference(reference) {
  const deposit = await prisma.deposit.findFirst({ where: { reference } });
  if (!deposit) throw new Error('Invoice tidak ditemukan');
  if (deposit.status !== DepositStatus.PENDING) return deposit;

  if (deposit.expiredAt && deposit.expiredAt <= new Date()) {
    return prisma.deposit.update({ where: { id: deposit.id }, data: { status: DepositStatus.EXPIRED } });
  }

  const mutation = await findPaidMutationForDeposit(deposit);
  if (!mutation) return deposit;
  return markDepositPaid(deposit, mutation);
}

async function cancelDeposit(depositId, userId) {
  const deposit = await prisma.deposit.findFirst({ where: { id: depositId, userId } });
  if (!deposit) throw new Error('Invoice tidak ditemukan');
  if (deposit.status !== DepositStatus.PENDING) throw new Error('Invoice tidak dapat dibatalkan');
  const currentRaw = parseJsonField(deposit.rawResponse, {});

  return prisma.deposit.update({
    where: { id: deposit.id },
    data: {
      status: DepositStatus.CANCELLED,
      rawResponse: stringifyJsonField({
        ...(currentRaw && typeof currentRaw === 'object' ? currentRaw : {}),
        localCancelledAt: new Date().toISOString()
      })
    }
  });
}

async function expirePendingDeposits() {
  const result = await prisma.deposit.updateMany({
    where: { status: DepositStatus.PENDING, expiredAt: { lte: new Date() } },
    data: { status: DepositStatus.EXPIRED }
  });
  return result.count;
}

async function processPendingDeposits(limit = 25) {
  if (!env.JAGOPAY_API_KEY) return 0;

  const deposits = await prisma.deposit.findMany({
    where: {
      status: DepositStatus.PENDING,
      expiredAt: { gt: new Date() }
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: { user: true }
  });
  if (!deposits.length) return 0;

  const mutations = [];
  for (let page = 1; page <= env.JAGOPAY_MUTATION_SCAN_PAGES; page += 1) {
    const result = await jagopay.getMutations(page);
    mutations.push(...result.mutations);
  }

  let paidCount = 0;
  for (const deposit of deposits) {
    const mutation = mutations.find((item) => jagopay.isPaidMutationForDeposit(item, deposit));
    if (!mutation) continue;

    try {
      const updated = await markDepositPaid(deposit, mutation);
      if (updated.status === DepositStatus.PAID) {
        paidCount += 1;
        const depositWithUser = await prisma.deposit.findUnique({
          where: { id: updated.id },
          include: { user: true }
        });
        if (depositWithUser) await notifyDepositPaidUser(depositWithUser);
      }
    } catch (error) {
      logger.error({ error, depositId: deposit.id, reference: deposit.reference }, 'failed to apply deposit mutation');
    }
  }

  return paidCount;
}

module.exports = {
  createDepositInvoice,
  attachInvoiceMessage,
  extractPaymentData,
  syncDepositStatus,
  syncDepositStatusByReference,
  cancelDeposit,
  expirePendingDeposits,
  processPendingDeposits,
  findPaidMutationForDeposit
};
