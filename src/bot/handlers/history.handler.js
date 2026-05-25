const prisma = require('../../config/prisma');
const { formatRupiah } = require('../../utils/money');
const { formatDateTime } = require('../../utils/date');
const { backMainKeyboard } = require('../keyboards/main.keyboard');
const { safeReplaceMessage } = require('../../utils/telegram');
const { Markup } = require('telegraf');

const PAGE_SIZE = 10;

function registerHistoryHandlers(bot) {
  bot.action(/^HIST:ORDER:p(\d+)$/, async (ctx) => {
    const page = Number(ctx.match[1]);
    const where = { userId: ctx.state.user.id };
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE
      }),
      prisma.order.count({ where })
    ]);
    const lines = orders.map(
      (order, index) =>
        `${page * PAGE_SIZE + index + 1}. ${formatDateTime(order.createdAt)} - ${order.serviceName} - ${order.countryName} - ${formatRupiah(order.sellPrice)} - ${order.status}`
    );
    const rows = [];
    for (const order of orders) {
      rows.push([Markup.button.callback(`Detail ${order.serviceName} ${formatDateTime(order.createdAt)}`, `HIST:OD:${order.id}`)]);
    }
    const nav = [];
    if (page > 0) nav.push(Markup.button.callback('Prev', `HIST:ORDER:p${page - 1}`));
    if ((page + 1) * PAGE_SIZE < total) nav.push(Markup.button.callback('Next', `HIST:ORDER:p${page + 1}`));
    if (nav.length) rows.push(nav);
    rows.push([Markup.button.callback('Menu Utama', 'MAIN')]);
    return safeReplaceMessage(ctx, `Histori Order\n\n${lines.join('\n') || 'Belum ada order.'}`, Markup.inlineKeyboard(rows));
  });

  bot.action(/^HIST:OD:([0-9a-f-]+)$/i, async (ctx) => {
    const order = await prisma.order.findFirst({ where: { id: ctx.match[1], userId: ctx.state.user.id } });
    if (!order) return ctx.answerCbQuery('Order tidak ditemukan');
    return safeReplaceMessage(
      ctx,
      `Detail Order\n\nOrder ID: ${order.id}\nLayanan: ${order.serviceName}\nNegara: ${order.countryName}\nNomor: ${order.phoneNumber || '-'}\nOTP: ${order.otpCode || '-'}\nHarga: ${formatRupiah(order.sellPrice)}\nStatus: ${order.status}\nWaktu order: ${formatDateTime(order.createdAt)}\nWaktu OTP: ${order.smsReceivedAt ? formatDateTime(order.smsReceivedAt) : '-'}\nWaktu selesai: ${order.completedAt ? formatDateTime(order.completedAt) : '-'}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Histori Order', 'HIST:ORDER:p0')],
        [Markup.button.callback('Menu Utama', 'MAIN')]
      ])
    );
  });

  bot.action(/^HIST:DEPO:p(\d+)$/, async (ctx) => {
    const page = Number(ctx.match[1]);
    const where = { userId: ctx.state.user.id };
    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE
      }),
      prisma.deposit.count({ where })
    ]);
    const lines = deposits.map(
      (deposit, index) =>
        `${page * PAGE_SIZE + index + 1}. ${formatDateTime(deposit.createdAt)} - ${formatRupiah(deposit.amount)} - ${deposit.status}`
    );
    const rows = [];
    const nav = [];
    if (page > 0) nav.push(Markup.button.callback('Prev', `HIST:DEPO:p${page - 1}`));
    if ((page + 1) * PAGE_SIZE < total) nav.push(Markup.button.callback('Next', `HIST:DEPO:p${page + 1}`));
    if (nav.length) rows.push(nav);
    rows.push([Markup.button.callback('Menu Utama', 'MAIN')]);
    return safeReplaceMessage(ctx, `Histori Deposit\n\n${lines.join('\n') || 'Belum ada deposit.'}`, Markup.inlineKeyboard(rows));
  });
}

module.exports = { registerHistoryHandlers };
