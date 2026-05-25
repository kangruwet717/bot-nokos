const env = require('../config/env');
const { formatRupiah } = require('../utils/money');
const { formatDateTime } = require('../utils/date');
const logger = require('../utils/logger');
const { parseJsonField } = require('../utils/jsonField');
const { mainKeyboard } = require('../bot/keyboards/main.keyboard');

let botInstance = null;

function setBot(bot) {
  botInstance = bot;
}

async function notifyTelegram(telegramId, text, extra = {}) {
  if (!botInstance) return false;
  try {
    await botInstance.telegram.sendMessage(Number(telegramId), text, extra);
    return true;
  } catch (_) {
    return false;
  }
}

async function deleteTelegramMessage(chatId, messageId) {
  if (!botInstance || !chatId || !messageId) return false;
  try {
    await botInstance.telegram.deleteMessage(Number(chatId), Number(messageId));
    return true;
  } catch (error) {
    logger.warn({ error, chatId, messageId }, 'failed to delete telegram message');
    return false;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function maskMiddle(value, head = 4, tail = 2) {
  const text = String(value || '');
  if (text.length <= head + tail) return text;
  return `${text.slice(0, head)}${'x'.repeat(Math.min(5, text.length - head - tail))}${text.slice(-tail)}`;
}

function getUserLabel(user = {}) {
  if (user.username) return `@${user.username}`;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (name) return name;
  return `ID ${user.telegramId || '-'}`;
}

function getChannelId() {
  return String(env.TELEGRAM_CHANNEL_ID || '').trim();
}

async function notifyChannel(text, extra = {}) {
  const channelId = getChannelId();
  if (!botInstance || !channelId) return false;
  try {
    await botInstance.telegram.sendMessage(channelId, text, {
      disable_web_page_preview: true,
      ...extra
    });
    return true;
  } catch (error) {
    logger.warn({ error, channelId }, 'failed to send telegram channel notification');
    return false;
  }
}

function buildOrderChannelMessage(order) {
  const user = order.user || {};
  const lines = [
    '<b>📢 TRANSAKSI NOKOS SELESAI</b>',
    '',
    `📱 Layanan: <b>${escapeHtml(order.serviceName || '-')}</b>`,
    `🌎 Negara: <b>${escapeHtml(order.countryName || '-')}</b>`,
    '',
    `🆔 Order ID: <code>${escapeHtml(maskMiddle(order.id, 6, 4))}</code>`,
    `📞 Nomor: <code>${escapeHtml(maskMiddle(order.phoneNumber, 7, 2) || '-')}</code>`,
    `🔐 Kode OTP: <code>${escapeHtml(order.otpCode || '-')}</code>`,
    `💰 Harga: <b>${escapeHtml(formatRupiah(order.sellPrice))}</b>`,
    '',
    `🗓 ${escapeHtml(formatDateTime(order.smsReceivedAt || order.updatedAt || new Date()))} WIB`,
    '',
    '👤 Pembeli:',
    `• Nama: ${escapeHtml(getUserLabel(user))}`,
    `• ID Telegram: <code>${escapeHtml(maskMiddle(user.telegramId, 3, 2) || '-')}</code>`
  ];

  return lines.join('\n');
}

function buildDepositChannelMessage(deposit) {
  const user = deposit.user || {};
  const lines = [
    '<b>💰 DEPOSIT BERHASIL!</b>',
    '',
    `ID: <code>${escapeHtml(deposit.reference || deposit.id || '-')}</code>`,
    `User: ${escapeHtml(getUserLabel(user))} (${escapeHtml(maskMiddle(user.telegramId, 3, 2) || '-')})`,
    `Nominal: <b>${escapeHtml(formatRupiah(deposit.totalAmount))}</b>`,
    `Diterima: <b>${escapeHtml(formatRupiah(deposit.amount))}</b>`,
    `Metode: ${escapeHtml(deposit.method || '-')}`,
    `Tanggal: ${escapeHtml(formatDateTime(deposit.paidAt || deposit.updatedAt || new Date()))} WIB`,
    '',
    `Saldo Saat Ini: <b>${escapeHtml(formatRupiah(user.balance))}</b>`
  ];

  return lines.join('\n');
}

async function notifyDepositChannel(deposit) {
  return notifyChannel(buildDepositChannelMessage(deposit), { parse_mode: 'HTML' });
}

async function notifyDepositPaidUser(deposit, fallbackInvoiceMessage = null) {
  const rawResponse = parseJsonField(deposit.rawResponse, {});
  const invoiceMessage = rawResponse?.telegramInvoiceMessage;
  let deletedInvoice = false;
  if (invoiceMessage?.chatId && invoiceMessage?.messageId) {
    deletedInvoice = await deleteTelegramMessage(invoiceMessage.chatId, invoiceMessage.messageId);
  }
  if (!deletedInvoice && fallbackInvoiceMessage?.chatId && fallbackInvoiceMessage?.messageId) {
    await deleteTelegramMessage(fallbackInvoiceMessage.chatId, fallbackInvoiceMessage.messageId);
  }

  const balanceLine =
    deposit.user?.balance !== undefined ? `\nSaldo sekarang: ${formatRupiah(deposit.user.balance)}` : '';

  return notifyTelegram(
    deposit.user?.telegramId,
    `Deposit berhasil.\n\nNominal masuk: ${formatRupiah(deposit.amount)}\nReference: ${deposit.reference}${balanceLine}`,
    mainKeyboard()
  );
}

async function notifyOrderChannel(order) {
  return notifyChannel(buildOrderChannelMessage(order), { parse_mode: 'HTML' });
}

module.exports = {
  setBot,
  notifyTelegram,
  notifyChannel,
  deleteTelegramMessage,
  notifyDepositPaidUser,
  notifyDepositChannel,
  notifyOrderChannel,
  buildDepositChannelMessage,
  buildOrderChannelMessage
};
