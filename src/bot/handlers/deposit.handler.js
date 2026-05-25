const depositService = require('../../services/deposit.service');
const DepositStatus = require('../../constants/depositStatus');
const { formatRupiah } = require('../../utils/money');
const { formatDateTime } = require('../../utils/date');
const { depositKeyboard, depositDetailKeyboard } = require('../keyboards/deposit.keyboard');
const { backMainKeyboard } = require('../keyboards/main.keyboard');
const messages = require('../../constants/messages');
const { safeEditMessageContent } = require('../../utils/telegram');
const { redis } = require('../../config/redis');

const CUSTOM_DEPOSIT_PREFIX = 'deposit:custom:';

function depositText(deposit) {
  return `Invoice deposit dibuat\n\nReference: ${deposit.reference}\nNominal: ${formatRupiah(deposit.amount)}\nKode Unik: ${formatRupiah(deposit.fee)}\nTotal Bayar: ${formatRupiah(deposit.totalAmount)}\nStatus: ${deposit.status}\nExpired: ${deposit.expiredAt ? formatDateTime(deposit.expiredAt) : '-'}\n\nSilakan scan QRIS di atas untuk membayar.`;
}

async function sendDepositInvoice(ctx, deposit) {
  const caption = depositText(deposit);
  const keyboard = depositDetailKeyboard(deposit);
  if (deposit.qrImageUrl) {
    return ctx.replyWithPhoto(deposit.qrImageUrl, { caption, ...keyboard });
  }
  if (deposit.qrString) {
    return ctx.reply(`${caption}\n\nQRIS string:\n${deposit.qrString}`, keyboard);
  }
  return ctx.reply(caption, keyboard);
}

function parseNominal(text) {
  const numeric = String(text || '').replace(/[^\d]/g, '');
  return Number(numeric);
}

function registerDepositHandlers(bot) {
  bot.action('DEP:MENU', (ctx) =>
    ctx.state.user?.isBanned
      ? ctx.reply(messages.banned(ctx.state.user.banReason))
      : safeEditMessageContent(ctx, 'Deposit Saldo\n\nPilih nominal deposit:', depositKeyboard())
  );

  bot.action(/^DEP:AMT:(\d+)$/, async (ctx) => {
    try {
      if (ctx.state.user?.isBanned) return ctx.reply(messages.banned(ctx.state.user.banReason));
      const amount = Number(ctx.match[1]);
      const deposit = await depositService.createDepositInvoice(ctx.state.user, amount);
      await ctx.deleteMessage().catch(() => null);
      return sendDepositInvoice(ctx, deposit);
    } catch (error) {
      return ctx.reply(`Gagal membuat invoice: ${error.message}`, backMainKeyboard());
    }
  });

  bot.action('DEP:CUSTOM', async (ctx) => {
    if (ctx.state.user?.isBanned) return ctx.reply(messages.banned(ctx.state.user.banReason));
    await redis.set(`${CUSTOM_DEPOSIT_PREFIX}${ctx.from.id}`, '1', 'EX', 300);
    return safeEditMessageContent(ctx, 'Kirim nominal deposit custom dalam angka.\n\nContoh: 75000', backMainKeyboard());
  });

  bot.action(/^DEP:CHECK:(.+)$/, async (ctx) => {
    try {
      const deposit = await depositService.syncDepositStatus(ctx.match[1], ctx.state.user.id);
      return safeEditMessageContent(
        ctx,
        `Status Deposit\n\nReference: ${deposit.reference}\nNominal: ${formatRupiah(deposit.amount)}\nStatus: ${deposit.status}\nDibayar: ${deposit.paidAt ? formatDateTime(deposit.paidAt) : '-'}`,
        deposit.status === DepositStatus.PENDING ? depositDetailKeyboard(deposit) : backMainKeyboard()
      );
    } catch (error) {
      return ctx.reply(`Gagal cek status: ${error.message}`, backMainKeyboard());
    }
  });

  bot.action(/^DEP:CANCEL:(.+)$/, async (ctx) => {
    try {
      const deposit = await depositService.cancelDeposit(ctx.match[1], ctx.state.user.id);
      return safeEditMessageContent(
        ctx,
        `Invoice dibatalkan\n\nReference: ${deposit.reference}\nNominal: ${formatRupiah(deposit.amount)}\nStatus: ${deposit.status}`,
        backMainKeyboard()
      );
    } catch (error) {
      return ctx.reply(`Gagal membatalkan invoice: ${error.message}`, backMainKeyboard());
    }
  });

  bot.on('text', async (ctx, next) => {
    const key = `${CUSTOM_DEPOSIT_PREFIX}${ctx.from.id}`;
    const isWaiting = await redis.get(key);
    if (!isWaiting) return next();
    if (String(ctx.message.text || '').startsWith('/')) return next();

    try {
      await redis.del(key);
      if (ctx.state.user?.isBanned) return ctx.reply(messages.banned(ctx.state.user.banReason));
      const amount = parseNominal(ctx.message.text);
      const deposit = await depositService.createDepositInvoice(ctx.state.user, amount);
      return sendDepositInvoice(ctx, deposit);
    } catch (error) {
      return ctx.reply(`Gagal membuat invoice: ${error.message}`, backMainKeyboard());
    }
  });
}

module.exports = { registerDepositHandlers };
