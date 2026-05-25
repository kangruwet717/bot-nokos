const { Markup } = require('telegraf');
const prisma = require('../../config/prisma');
const wallet = require('../../services/wallet.service');
const userService = require('../../services/user.service');
const { isAdmin } = require('../middlewares/requireAdmin');
const { adminKeyboard, adminBackKeyboard } = require('../keyboards/admin.keyboard');
const { formatRupiah } = require('../../utils/money');
const { notifyDepositPaidUser, notifyTelegram } = require('../../services/notification.service');
const { buildReport } = require('../../services/report.service');
const { safeEditMessageContent } = require('../../utils/telegram');
const recovery = require('../../services/adminRecovery.service');
const orderService = require('../../services/order.service');
const depositService = require('../../services/deposit.service');
const settings = require('../../services/settings.service');
const OrderStatus = require('../../constants/orderStatus');
const { redis } = require('../../config/redis');

const ACTIVE_ORDER_STATUSES = [OrderStatus.PENDING_PROVIDER, OrderStatus.WAITING_SMS];
const ADMIN_STATE_PREFIX = 'admin:state:';

function adminAction(handler) {
  return async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Akses admin ditolak').catch(() => null);
    return handler(ctx);
  };
}

function parseCommand(ctx) {
  return (ctx.message?.text || '').split(' ').filter(Boolean);
}

function adminOnly(handler) {
  return async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('Akses admin ditolak.');
    return handler(ctx);
  };
}

async function buildAdminPanelText() {
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
  const [totalUsers, depositsToday, ordersToday, activeOrders, pendingDeposits, totalBalance, maintenanceMode, orderEnabled, depositEnabled] =
    await Promise.all([
      prisma.user.count(),
      prisma.deposit.aggregate({ _sum: { amount: true }, where: { status: 'PAID', paidAt: { gte: startOfDay } } }),
      prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.order.count({ where: { status: { in: ACTIVE_ORDER_STATUSES } } }),
      prisma.deposit.count({ where: { status: 'PENDING' } }),
      prisma.user.aggregate({ _sum: { balance: true } }),
      settings.getBooleanSetting('maintenance_mode', false),
      settings.getBooleanSetting('order_enabled', true),
      settings.getBooleanSetting('deposit_enabled', true)
    ]);

  return `Admin Panel\n\nTotal user: ${totalUsers}\nTotal saldo beredar: ${formatRupiah(totalBalance._sum.balance || 0)}\nDeposit hari ini: ${formatRupiah(depositsToday._sum.amount || 0)}\nDeposit pending: ${pendingDeposits}\nOrder hari ini: ${ordersToday}\nOrder aktif: ${activeOrders}\n\nOrder: ${orderEnabled && !maintenanceMode ? 'ON' : 'OFF'}\nDeposit: ${depositEnabled ? 'ON' : 'OFF'}\nMaintenance: ${maintenanceMode ? 'ON' : 'OFF'}`;
}

function shortId(id) {
  return String(id).slice(0, 8);
}

function adminStateKey(telegramId) {
  return `${ADMIN_STATE_PREFIX}${telegramId}`;
}

async function setAdminState(telegramId, state) {
  await redis.set(adminStateKey(telegramId), JSON.stringify(state), 'EX', 300);
}

async function consumeAdminState(telegramId) {
  const key = adminStateKey(telegramId);
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  return JSON.parse(raw);
}

function userDisplayName(user) {
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return fullName || user.username || String(user.telegramId);
}

async function buildUserDetail(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User tidak ditemukan');
  const [orders, activeOrders, deposits, paidDeposits, lastOrder, lastDeposit] = await Promise.all([
    prisma.order.count({ where: { userId } }),
    prisma.order.count({ where: { userId, status: { in: ACTIVE_ORDER_STATUSES } } }),
    prisma.deposit.count({ where: { userId } }),
    prisma.deposit.aggregate({ _sum: { amount: true }, where: { userId, status: 'PAID' } }),
    prisma.order.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    prisma.deposit.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })
  ]);
  return {
    user,
    text:
      `User Detail\n\nNama: ${userDisplayName(user)}\nTelegram ID: ${user.telegramId}\nUsername: @${user.username || '-'}\nSaldo: ${formatRupiah(user.balance)}\nBanned: ${user.isBanned ? 'YA' : 'TIDAK'}\nTOS: ${user.tosAcceptedAt ? 'YA' : 'TIDAK'}\n\nOrders: ${orders}\nOrder aktif: ${activeOrders}\nDeposits: ${deposits}\nTotal paid deposit: ${formatRupiah(paidDeposits._sum.amount || 0)}\n\nLast order: ${lastOrder ? `${lastOrder.serviceName}/${lastOrder.countryName} ${lastOrder.status}` : '-'}\nLast deposit: ${lastDeposit ? `${formatRupiah(lastDeposit.amount)} ${lastDeposit.status}` : '-'}`
  };
}

function userDetailKeyboard(user) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(user.isBanned ? 'Unban User' : 'Ban User', `ADMIN:USER:TOGGLE_BAN:${user.id}`),
      Markup.button.callback('Histori', `ADMIN:USER:HIST:${user.id}`)
    ],
    [
      Markup.button.callback('Add Saldo Help', `ADMIN:USER:ADD_HELP:${user.id}`),
      Markup.button.callback('Min Saldo Help', `ADMIN:USER:MIN_HELP:${user.id}`)
    ],
    [Markup.button.callback('Users', 'ADMIN:USERS'), Markup.button.callback('Admin Panel', 'ADMIN:HOME')]
  ]);
}

function registerAdminHandlers(bot) {
  bot.command('admin', adminOnly(async (ctx) => {
    return ctx.reply(await buildAdminPanelText(), adminKeyboard());
  }));

  bot.command('addsaldo', adminOnly(async (ctx) => {
    const [, telegramId, nominal, ...noteParts] = parseCommand(ctx);
    if (!telegramId || !Number(nominal)) return ctx.reply('Format: /addsaldo telegram_id nominal catatan');
    const user = await userService.getByTelegramId(telegramId);
    if (!user) return ctx.reply('User tidak ditemukan.');
    await wallet.credit({
      userId: user.id,
      amount: Number(nominal),
      type: 'admin_add',
      referenceType: 'admin',
      referenceId: `admin-${Date.now()}`,
      note: noteParts.join(' ') || null,
      adminTelegramId: ctx.from.id
    });
    await notifyTelegram(user.telegramId, `Saldo kamu ditambah admin sebesar ${formatRupiah(nominal)}.`);
    return ctx.reply('Saldo berhasil ditambah.');
  }));

  bot.command('minsaldo', adminOnly(async (ctx) => {
    const [, telegramId, nominal, ...noteParts] = parseCommand(ctx);
    if (!telegramId || !Number(nominal)) return ctx.reply('Format: /minsaldo telegram_id nominal catatan');
    const user = await userService.getByTelegramId(telegramId);
    if (!user) return ctx.reply('User tidak ditemukan.');
    await wallet.debit({
      userId: user.id,
      amount: Number(nominal),
      type: 'admin_deduct',
      referenceType: 'admin',
      referenceId: `admin-${Date.now()}`,
      note: noteParts.join(' ') || null,
      adminTelegramId: ctx.from.id
    });
    await notifyTelegram(user.telegramId, `Saldo kamu dikurangi admin sebesar ${formatRupiah(nominal)}.`);
    return ctx.reply('Saldo berhasil dikurangi.');
  }));

  bot.command('ban', adminOnly(async (ctx) => {
    const [, telegramId, ...reasonParts] = parseCommand(ctx);
    if (!telegramId) return ctx.reply('Format: /ban telegram_id reason');
    await userService.setBan(telegramId, true, reasonParts.join(' ') || 'Dibatasi admin');
    return ctx.reply('User berhasil diban.');
  }));

  bot.command('unban', adminOnly(async (ctx) => {
    const [, telegramId] = parseCommand(ctx);
    if (!telegramId) return ctx.reply('Format: /unban telegram_id');
    await userService.setBan(telegramId, false);
    return ctx.reply('User berhasil diunban.');
  }));

  bot.command('broadcast', adminOnly(async (ctx) => {
    const message = ctx.message.text.replace(/^\/broadcast\s*/i, '').trim();
    if (!message) return ctx.reply('Format: /broadcast pesan');
    const users = await prisma.user.findMany({ where: { isBanned: false }, select: { telegramId: true } });
    let sent = 0;
    for (const user of users) {
      if (await notifyTelegram(user.telegramId, message)) sent += 1;
    }
    return ctx.reply(`Broadcast selesai. Sukses: ${sent}/${users.length}`);
  }));

  bot.command('setmarkup', adminOnly(async (ctx) => {
    const [, serviceCode, type, value] = parseCommand(ctx);
    if (!serviceCode || !['flat', 'percent'].includes(type) || !Number(value)) {
      return ctx.reply('Format: /setmarkup service_code flat|percent value');
    }
    await prisma.service.update({
      where: { provider_serviceCode: { provider: 'smsbower', serviceCode } },
      data: { markupType: type, markupValue: BigInt(Number(value)) }
    });
    return ctx.reply('Markup berhasil diupdate.');
  }));

  bot.command('setprofit', adminOnly(async (ctx) => {
    const [, serviceCode, value] = parseCommand(ctx);
    if (!serviceCode || !Number(value)) return ctx.reply('Format: /setprofit service_code nominal_min_profit');
    await prisma.service.update({
      where: { provider_serviceCode: { provider: 'smsbower', serviceCode } },
      data: { minProfit: BigInt(Number(value)) }
    });
    return ctx.reply('Minimum profit service berhasil diupdate.');
  }));

  bot.command('setpricing_all', adminOnly(async (ctx) => {
    const [, type, markupValue, minProfit] = parseCommand(ctx);
    if (!['flat', 'percent'].includes(type) || !Number(markupValue) || !Number(minProfit)) {
      return ctx.reply('Format: /setpricing_all flat|percent markup_value min_profit');
    }
    const result = await prisma.service.updateMany({
      where: { provider: 'smsbower' },
      data: {
        markupType: type,
        markupValue: BigInt(Number(markupValue)),
        minProfit: BigInt(Number(minProfit))
      }
    });
    return ctx.reply(`Pricing semua service berhasil diupdate.\nAffected: ${result.count}`);
  }));

  bot.command('service_off', adminOnly(async (ctx) => {
    const [, serviceCode] = parseCommand(ctx);
    if (!serviceCode) return ctx.reply('Format: /service_off service_code');
    await prisma.service.update({ where: { provider_serviceCode: { provider: 'smsbower', serviceCode } }, data: { isActive: false } });
    return ctx.reply('Service dinonaktifkan.');
  }));

  bot.command('service_on', adminOnly(async (ctx) => {
    const [, serviceCode] = parseCommand(ctx);
    if (!serviceCode) return ctx.reply('Format: /service_on service_code');
    await prisma.service.update({ where: { provider_serviceCode: { provider: 'smsbower', serviceCode } }, data: { isActive: true } });
    return ctx.reply('Service diaktifkan.');
  }));

  bot.command('country_off', adminOnly(async (ctx) => {
    const [, countryCode] = parseCommand(ctx);
    if (!countryCode) return ctx.reply('Format: /country_off country_code');
    await prisma.country.update({ where: { provider_countryCode: { provider: 'smsbower', countryCode } }, data: { isActive: false } });
    return ctx.reply('Negara dinonaktifkan.');
  }));

  bot.command('country_on', adminOnly(async (ctx) => {
    const [, countryCode] = parseCommand(ctx);
    if (!countryCode) return ctx.reply('Format: /country_on country_code');
    await prisma.country.update({ where: { provider_countryCode: { provider: 'smsbower', countryCode } }, data: { isActive: true } });
    return ctx.reply('Negara diaktifkan.');
  }));

  bot.command('report', adminOnly(async (ctx) => {
    const [, period = 'today'] = parseCommand(ctx);
    const report = await buildReport(period === 'month' ? 'month' : 'today');
    return ctx.reply(
      `Report ${report.period}\n\nTotal deposit paid: ${formatRupiah(report.totalDeposit)}\nOrder sukses: ${report.successfulOrders}\nTotal refund: ${formatRupiah(report.refundAmount)}\nRevenue: ${formatRupiah(report.revenue)}\nProvider cost: ${formatRupiah(report.providerCost)}\nGross profit: ${formatRupiah(report.grossProfit)}\nTop service: ${report.topService}\nTop country: ${report.topCountry}`
    );
  }));

  bot.command('deposit_paid', adminOnly(async (ctx) => {
    const [, reference, ...noteParts] = parseCommand(ctx);
    if (!reference) return ctx.reply('Format: /deposit_paid reference catatan');
    const result = await recovery.markDepositPaid(reference, ctx.from.id, noteParts.join(' ') || null);
    if (result.credited) await notifyDepositPaidUser(result.deposit);
    return ctx.reply(
      `Deposit ditandai PAID.\nReference: ${result.deposit.reference}\nCredit saldo: ${result.credited ? 'YA' : 'TIDAK, sudah pernah PAID'}`
    );
  }));

  bot.command('deposit_cancel', adminOnly(async (ctx) => {
    const [, reference, ...noteParts] = parseCommand(ctx);
    if (!reference) return ctx.reply('Format: /deposit_cancel reference catatan');
    const deposit = await recovery.markDepositCancelled(reference, noteParts.join(' ') || null);
    return ctx.reply(`Deposit dibatalkan.\nReference: ${deposit.reference}\nStatus: ${deposit.status}`);
  }));

  bot.command('deposit_sync', adminOnly(async (ctx) => {
    const [, reference] = parseCommand(ctx);
    if (!reference) return ctx.reply('Format: /deposit_sync reference');
    const deposit = await depositService.syncDepositStatusByReference(reference);
    return ctx.reply(
      `Deposit synced.\nReference: ${deposit.reference}\nNominal: ${formatRupiah(deposit.amount)}\nStatus: ${deposit.status}\nPaid at: ${deposit.paidAt || '-'}`
    );
  }));

  bot.command('order_refund', adminOnly(async (ctx) => {
    const [, orderId, ...reasonParts] = parseCommand(ctx);
    if (!orderId) return ctx.reply('Format: /order_refund order_id alasan');
    const result = await recovery.refundOrder(orderId, ctx.from.id, reasonParts.join(' ') || 'Manual refund');
    await notifyTelegram(
      result.order.user.telegramId,
      `Order kamu direfund admin.\n\nOrder ID: ${result.order.id}\nRefund: ${formatRupiah(result.order.sellPrice)}`
    );
    return ctx.reply(
      `Order ditandai REFUNDED.\nOrder ID: ${result.order.id}\nRefund saldo: ${result.refunded ? 'YA' : 'TIDAK, sudah pernah REFUNDED'}`
    );
  }));

  bot.command('order_fail', adminOnly(async (ctx) => {
    const [, orderId, ...reasonParts] = parseCommand(ctx);
    if (!orderId) return ctx.reply('Format: /order_fail order_id alasan');
    const order = await recovery.markOrderFailed(orderId, reasonParts.join(' ') || 'Manual fail');
    return ctx.reply(`Order ditandai FAILED.\nOrder ID: ${order.id}`);
  }));

  bot.command('order_complete', adminOnly(async (ctx) => {
    const [, orderId] = parseCommand(ctx);
    if (!orderId) return ctx.reply('Format: /order_complete order_id');
    const order = await recovery.markOrderCompleted(orderId);
    return ctx.reply(`Order ditandai COMPLETED.\nOrder ID: ${order.id}`);
  }));

  bot.command('order_check', adminOnly(async (ctx) => {
    const [, orderId] = parseCommand(ctx);
    if (!orderId) return ctx.reply('Format: /order_check order_id');
    const order = await orderService.checkOrderOtp(orderId);
    return ctx.reply(
      `Order Check\n\nOrder ID: ${order.id}\nLayanan: ${order.serviceName}\nNegara: ${order.countryName}\nNomor: ${order.phoneNumber || '-'}\nOTP: ${order.otpCode || '-'}\nStatus: ${order.status}`
    );
  }));

  bot.command('active_orders', adminOnly(async (ctx) => {
    const orders = await prisma.order.findMany({
      where: { status: { in: ['PENDING_PROVIDER', 'WAITING_SMS'] } },
      orderBy: { createdAt: 'asc' },
      take: 20,
      include: { user: true }
    });
    const lines = orders.map(
      (order) =>
        `- ${order.id} ${order.serviceName}/${order.countryName} ${order.status} user:${order.user.telegramId}`
    );
    return ctx.reply(`Order aktif\n\n${lines.join('\n') || '-'}`);
  }));

  bot.command('webhook_errors', adminOnly(async (ctx) => {
    const logs = await prisma.webhookLog.findMany({
      where: { OR: [{ isValid: false }, { errorMessage: { not: null } }] },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    const lines = logs.map(
      (log) =>
        `- ${log.createdAt.toISOString()} ${log.source} valid:${log.isValid} processed:${log.processed} error:${log.errorMessage || '-'}`
    );
    return ctx.reply(`Webhook errors terbaru\n\n${lines.join('\n') || '-'}`);
  }));

  bot.command('provider_errors', adminOnly(async (ctx) => {
    const logs = await prisma.providerLog.findMany({
      where: { isError: true },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    const lines = logs.map(
      (log) =>
        `- ${log.createdAt.toISOString()} ${log.provider}.${log.action} status:${log.statusCode || '-'} error:${log.errorMessage || '-'}`
    );
    return ctx.reply(`Provider errors terbaru\n\n${lines.join('\n') || '-'}`);
  }));

  bot.command('finduser', adminOnly(async (ctx) => {
    const [, telegramId] = parseCommand(ctx);
    if (!telegramId) return ctx.reply('Format: /finduser telegram_id');
    const user = await userService.getByTelegramId(telegramId);
    if (!user) return ctx.reply('User tidak ditemukan.');
    const detail = await buildUserDetail(user.id);
    return ctx.reply(detail.text, userDetailKeyboard(detail.user));
  }));

  bot.command('sync_provider', adminOnly(async (ctx) => {
    const result = await orderService.syncProviderCatalog();
    return ctx.reply(`Sync provider selesai.\nCountries: ${result.countries}\nServices: ${result.services}`);
  }));

  bot.command('provider_balance', adminOnly(async (ctx) => {
    const balance = await orderService.getProviderBalance();
    return ctx.reply(`Provider balance: ${balance}`);
  }));

  bot.action('ADMIN:HOME', adminAction(async (ctx) =>
    safeEditMessageContent(ctx, await buildAdminPanelText(), adminKeyboard())
  ));

  bot.action('ADMIN:USERS', adminAction(async (ctx) => {
    const [total, banned, tosAccepted, newest, richest] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.user.count({ where: { tosAcceptedAt: { not: null } } }),
      prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.user.findMany({ orderBy: { balance: 'desc' }, take: 3 })
    ]);
    const lines = newest.map((user, index) => `${index + 1}. ${userDisplayName(user)} (${user.telegramId})`);
    const balanceLines = richest.map((user) => `- ${userDisplayName(user)}: ${formatRupiah(user.balance)}`);
    const rows = newest.map((user) => [Markup.button.callback(`Detail ${shortId(user.id)} - ${userDisplayName(user).slice(0, 18)}`, `ADMIN:USER:DETAIL:${user.id}`)]);
    rows.push([Markup.button.callback('Cari User', 'ADMIN:USER:SEARCH')]);
    rows.push([Markup.button.callback('Admin Panel', 'ADMIN:HOME')]);
    return safeEditMessageContent(
      ctx,
      `Users\n\nTotal: ${total}\nBanned: ${banned}\nTOS accepted: ${tosAccepted}\n\nUser terbaru:\n${lines.join('\n') || '-'}\n\nSaldo terbesar:\n${balanceLines.join('\n') || '-'}`,
      Markup.inlineKeyboard(rows)
    );
  }));

  bot.action('ADMIN:USER:SEARCH', adminAction(async (ctx) => {
    await setAdminState(ctx.from.id, { type: 'find_user' });
    return safeEditMessageContent(
      ctx,
      'Kirim Telegram ID user yang ingin dicari.\n\nContoh: 1933621023',
      Markup.inlineKeyboard([[Markup.button.callback('Users', 'ADMIN:USERS')]])
    );
  }));

  bot.action(/^ADMIN:USER:DETAIL:(.+)$/, adminAction(async (ctx) => {
    const detail = await buildUserDetail(ctx.match[1]);
    return safeEditMessageContent(ctx, detail.text, userDetailKeyboard(detail.user));
  }));

  bot.action(/^ADMIN:USER:TOGGLE_BAN:(.+)$/, adminAction(async (ctx) => {
    const user = await prisma.user.findUnique({ where: { id: ctx.match[1] } });
    if (!user) return ctx.answerCbQuery('User tidak ditemukan').catch(() => null);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        isBanned: !user.isBanned,
        banReason: user.isBanned ? null : 'Dibatasi admin'
      }
    });
    const detail = await buildUserDetail(updated.id);
    await notifyTelegram(updated.telegramId, updated.isBanned ? 'Akun kamu sedang dibatasi admin.' : 'Pembatasan akun kamu sudah dicabut admin.');
    return safeEditMessageContent(ctx, detail.text, userDetailKeyboard(detail.user));
  }));

  bot.action(/^ADMIN:USER:HIST:(.+)$/, adminAction(async (ctx) => {
    const user = await prisma.user.findUnique({ where: { id: ctx.match[1] } });
    if (!user) return ctx.answerCbQuery('User tidak ditemukan').catch(() => null);
    const [orders, deposits, balanceLogs] = await Promise.all([
      prisma.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.deposit.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.balanceLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 })
    ]);
    const orderLines = orders.map((order) => `- ${order.serviceName}/${order.countryName} ${formatRupiah(order.sellPrice)} ${order.status}`);
    const depositLines = deposits.map((deposit) => `- ${deposit.reference} ${formatRupiah(deposit.amount)} ${deposit.status}`);
    const balanceLines = balanceLogs.map((log) => `- ${log.type} ${formatRupiah(log.amount)} -> ${formatRupiah(log.balanceAfter)}`);
    return safeEditMessageContent(
      ctx,
      `Histori User\n\n${userDisplayName(user)} (${user.telegramId})\n\nOrder terakhir:\n${orderLines.join('\n') || '-'}\n\nDeposit terakhir:\n${depositLines.join('\n') || '-'}\n\nBalance log:\n${balanceLines.join('\n') || '-'}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('User Detail', `ADMIN:USER:DETAIL:${user.id}`)],
        [Markup.button.callback('Users', 'ADMIN:USERS'), Markup.button.callback('Admin Panel', 'ADMIN:HOME')]
      ])
    );
  }));

  bot.action(/^ADMIN:USER:ADD_HELP:(.+)$/, adminAction(async (ctx) => {
    const user = await prisma.user.findUnique({ where: { id: ctx.match[1] } });
    if (!user) return ctx.answerCbQuery('User tidak ditemukan').catch(() => null);
    return safeEditMessageContent(
      ctx,
      `Tambah saldo user\n\nGunakan command:\n/addsaldo ${user.telegramId} nominal catatan\n\nContoh:\n/addsaldo ${user.telegramId} 10000 bonus`,
      userDetailKeyboard(user)
    );
  }));

  bot.action(/^ADMIN:USER:MIN_HELP:(.+)$/, adminAction(async (ctx) => {
    const user = await prisma.user.findUnique({ where: { id: ctx.match[1] } });
    if (!user) return ctx.answerCbQuery('User tidak ditemukan').catch(() => null);
    return safeEditMessageContent(
      ctx,
      `Kurangi saldo user\n\nGunakan command:\n/minsaldo ${user.telegramId} nominal catatan\n\nContoh:\n/minsaldo ${user.telegramId} 10000 koreksi`,
      userDetailKeyboard(user)
    );
  }));

  bot.action('ADMIN:DEPOSITS', adminAction(async (ctx) => {
    const deposits = await prisma.deposit.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { user: true } });
    const lines = deposits.map((deposit) => `- ${deposit.reference} ${formatRupiah(deposit.amount)} ${deposit.status} (${deposit.user.telegramId})`);
    return safeEditMessageContent(ctx, `Deposits terbaru\n\n${lines.join('\n') || '-'}`, adminKeyboard());
  }));

  bot.action('ADMIN:DEPOSITS:PENDING', adminAction(async (ctx) => {
    const deposits = await prisma.deposit.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 10,
      include: { user: true }
    });
    const lines = deposits.map(
      (deposit, index) =>
        `${index + 1}. ${deposit.reference}\nUser: ${deposit.user.telegramId}\nNominal: ${formatRupiah(deposit.amount)} | Bayar: ${formatRupiah(deposit.totalAmount)}\nID: ${shortId(deposit.id)}`
    );
    const rows = deposits.flatMap((deposit) => [
      [Markup.button.callback(`Sync ${shortId(deposit.id)}`, `ADMIN:DP:SYNC:${deposit.id}`)],
      [
        Markup.button.callback(`Paid ${shortId(deposit.id)}`, `ADMIN:DP:PAID:${deposit.id}`),
        Markup.button.callback(`Cancel ${shortId(deposit.id)}`, `ADMIN:DP:CANCEL:${deposit.id}`)
      ]
    ]);
    rows.push([Markup.button.callback('Refresh', 'ADMIN:DEPOSITS:PENDING')]);
    rows.push([Markup.button.callback('Admin Panel', 'ADMIN:HOME')]);
    return safeEditMessageContent(
      ctx,
      `Pending Deposit\n\n${lines.join('\n\n') || 'Tidak ada deposit pending.'}`,
      Markup.inlineKeyboard(rows)
    );
  }));

  bot.action(/^ADMIN:DP:SYNC:(.+)$/, adminAction(async (ctx) => {
    const deposit = await prisma.deposit.findUnique({ where: { id: ctx.match[1] } });
    if (!deposit) return ctx.answerCbQuery('Deposit tidak ditemukan').catch(() => null);
    const synced = await depositService.syncDepositStatusByReference(deposit.reference);
    return safeEditMessageContent(
      ctx,
      `Deposit Sync\n\nReference: ${synced.reference}\nNominal: ${formatRupiah(synced.amount)}\nTotal Bayar: ${formatRupiah(synced.totalAmount)}\nStatus: ${synced.status}\nPaid at: ${synced.paidAt || '-'}`,
      adminBackKeyboard()
    );
  }));

  bot.action(/^ADMIN:DP:PAID:(.+)$/, adminAction(async (ctx) => {
    const deposit = await prisma.deposit.findUnique({ where: { id: ctx.match[1] }, include: { user: true } });
    if (!deposit) return ctx.answerCbQuery('Deposit tidak ditemukan').catch(() => null);
    const result = await recovery.markDepositPaid(deposit.reference, ctx.from.id, 'Admin panel');
    if (result.credited) await notifyDepositPaidUser(result.deposit);
    return safeEditMessageContent(
      ctx,
      `Deposit ditandai PAID\n\nReference: ${result.deposit.reference}\nCredit saldo: ${result.credited ? 'YA' : 'TIDAK'}`,
      adminBackKeyboard()
    );
  }));

  bot.action(/^ADMIN:DP:CANCEL:(.+)$/, adminAction(async (ctx) => {
    const deposit = await prisma.deposit.findUnique({ where: { id: ctx.match[1] } });
    if (!deposit) return ctx.answerCbQuery('Deposit tidak ditemukan').catch(() => null);
    const updated = await recovery.markDepositCancelled(deposit.reference, 'Admin panel');
    return safeEditMessageContent(
      ctx,
      `Deposit dibatalkan\n\nReference: ${updated.reference}\nStatus: ${updated.status}`,
      adminBackKeyboard()
    );
  }));

  bot.action('ADMIN:ORDERS', adminAction(async (ctx) => {
    const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { user: true } });
    const lines = orders.map((order) => `- ${order.serviceName}/${order.countryName} ${formatRupiah(order.sellPrice)} ${order.status} (${order.user.telegramId})`);
    return safeEditMessageContent(ctx, `Orders terbaru\n\n${lines.join('\n') || '-'}`, adminKeyboard());
  }));

  bot.action('ADMIN:ORDERS:ACTIVE', adminAction(async (ctx) => {
    const orders = await prisma.order.findMany({
      where: { status: { in: ACTIVE_ORDER_STATUSES } },
      orderBy: { createdAt: 'asc' },
      take: 10,
      include: { user: true }
    });
    const lines = orders.map(
      (order, index) =>
        `${index + 1}. ${order.serviceName}/${order.countryName}\nUser: ${order.user.telegramId}\nNomor: ${order.phoneNumber || '-'}\nHarga: ${formatRupiah(order.sellPrice)} | Status: ${order.status}\nID: ${shortId(order.id)}`
    );
    const rows = orders.flatMap((order) => [
      [Markup.button.callback(`Cek ${shortId(order.id)}`, `ADMIN:OD:CHECK:${order.id}`)],
      [
        Markup.button.callback(`Refund ${shortId(order.id)}`, `ADMIN:OD:REFUND:${order.id}`),
        Markup.button.callback(`Fail ${shortId(order.id)}`, `ADMIN:OD:FAIL:${order.id}`)
      ],
      [Markup.button.callback(`Complete ${shortId(order.id)}`, `ADMIN:OD:COMPLETE:${order.id}`)]
    ]);
    rows.push([Markup.button.callback('Refresh', 'ADMIN:ORDERS:ACTIVE')]);
    rows.push([Markup.button.callback('Admin Panel', 'ADMIN:HOME')]);
    return safeEditMessageContent(
      ctx,
      `Order Aktif\n\n${lines.join('\n\n') || 'Tidak ada order aktif.'}`,
      Markup.inlineKeyboard(rows)
    );
  }));

  bot.action(/^ADMIN:OD:CHECK:(.+)$/, adminAction(async (ctx) => {
    const order = await orderService.checkOrderOtp(ctx.match[1]);
    return safeEditMessageContent(
      ctx,
      `Order Check\n\nID: ${order.id}\nLayanan: ${order.serviceName}\nNegara: ${order.countryName}\nNomor: ${order.phoneNumber || '-'}\nOTP: ${order.otpCode || '-'}\nStatus: ${order.status}`,
      adminBackKeyboard()
    );
  }));

  bot.action(/^ADMIN:OD:REFUND:(.+)$/, adminAction(async (ctx) => {
    const result = await recovery.refundOrder(ctx.match[1], ctx.from.id, 'Admin panel refund');
    await notifyTelegram(
      result.order.user.telegramId,
      `Order kamu direfund admin.\n\nOrder ID: ${result.order.id}\nRefund: ${formatRupiah(result.order.sellPrice)}`
    );
    return safeEditMessageContent(
      ctx,
      `Order direfund\n\nID: ${result.order.id}\nRefund saldo: ${result.refunded ? 'YA' : 'TIDAK'}`,
      adminBackKeyboard()
    );
  }));

  bot.action(/^ADMIN:OD:FAIL:(.+)$/, adminAction(async (ctx) => {
    const order = await recovery.markOrderFailed(ctx.match[1], 'Admin panel fail');
    return safeEditMessageContent(ctx, `Order ditandai FAILED\n\nID: ${order.id}`, adminBackKeyboard());
  }));

  bot.action(/^ADMIN:OD:COMPLETE:(.+)$/, adminAction(async (ctx) => {
    const order = await recovery.markOrderCompleted(ctx.match[1]);
    return safeEditMessageContent(ctx, `Order ditandai COMPLETED\n\nID: ${order.id}`, adminBackKeyboard());
  }));

  bot.action('ADMIN:SETTINGS', adminAction(async (ctx) => {
    const [maintenanceMode, orderEnabled, depositEnabled, maintenanceMessage] = await Promise.all([
      settings.getBooleanSetting('maintenance_mode', false),
      settings.getBooleanSetting('order_enabled', true),
      settings.getBooleanSetting('deposit_enabled', true),
      settings.getSetting('maintenance_message', 'Layanan sedang ditutup sementara. Silakan coba lagi nanti.')
    ]);
    return safeEditMessageContent(
      ctx,
      `Settings utama\n\nOrder: ${orderEnabled && !maintenanceMode ? 'ON' : 'OFF'}\nDeposit: ${depositEnabled ? 'ON' : 'OFF'}\nMaintenance mode: ${maintenanceMode ? 'ON' : 'OFF'}\nPesan tutup:\n${maintenanceMessage}\n\nMIN_DEPOSIT=${process.env.MIN_DEPOSIT}\nMAX_DEPOSIT=${process.env.MAX_DEPOSIT}\nDEFAULT_MARKUP_TYPE=${process.env.DEFAULT_MARKUP_TYPE}\nDEFAULT_MARKUP_VALUE=${process.env.DEFAULT_MARKUP_VALUE}\nMAX_ACTIVE_ORDERS_PER_USER=${process.env.MAX_ACTIVE_ORDERS_PER_USER}\nMAX_ORDERS_PER_HOUR=${process.env.MAX_ORDERS_PER_HOUR}`,
      Markup.inlineKeyboard([
        [Markup.button.callback(maintenanceMode ? 'Matikan Maintenance' : 'Nyalakan Maintenance', 'ADMIN:TOGGLE_MAINTENANCE')],
        [
          Markup.button.callback(orderEnabled ? 'Tutup Order' : 'Buka Order', 'ADMIN:TOGGLE_ORDER'),
          Markup.button.callback(depositEnabled ? 'Tutup Deposit' : 'Buka Deposit', 'ADMIN:TOGGLE_DEPOSIT')
        ],
        [Markup.button.callback('Ubah Pesan Tutup', 'ADMIN:SET_MAINT_MSG')],
        [Markup.button.callback('Apply Pricing .env', 'ADMIN:APPLY_ENV_PRICING')],
        [Markup.button.callback('Sync Provider', 'ADMIN:SYNC_PROVIDER'), Markup.button.callback('Provider Balance', 'ADMIN:PROVIDER')],
        [Markup.button.callback('Admin Panel', 'ADMIN:HOME')]
      ])
    );
  }));

  bot.action('ADMIN:TOGGLE_MAINTENANCE', adminAction(async (ctx) => {
    const current = await settings.getBooleanSetting('maintenance_mode', false);
    await settings.setBooleanSetting('maintenance_mode', !current);
    return safeEditMessageContent(
      ctx,
      `Maintenance mode sekarang: ${!current ? 'ON' : 'OFF'}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Settings', 'ADMIN:SETTINGS')],
        [Markup.button.callback('Admin Panel', 'ADMIN:HOME')]
      ])
    );
  }));

  bot.action('ADMIN:TOGGLE_ORDER', adminAction(async (ctx) => {
    const current = await settings.getBooleanSetting('order_enabled', true);
    await settings.setBooleanSetting('order_enabled', !current);
    return safeEditMessageContent(
      ctx,
      `Order sekarang: ${!current ? 'ON' : 'OFF'}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Settings', 'ADMIN:SETTINGS')],
        [Markup.button.callback('Admin Panel', 'ADMIN:HOME')]
      ])
    );
  }));

  bot.action('ADMIN:TOGGLE_DEPOSIT', adminAction(async (ctx) => {
    const current = await settings.getBooleanSetting('deposit_enabled', true);
    await settings.setBooleanSetting('deposit_enabled', !current);
    return safeEditMessageContent(
      ctx,
      `Deposit sekarang: ${!current ? 'ON' : 'OFF'}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Settings', 'ADMIN:SETTINGS')],
        [Markup.button.callback('Admin Panel', 'ADMIN:HOME')]
      ])
    );
  }));

  bot.action('ADMIN:SET_MAINT_MSG', adminAction(async (ctx) => {
    await setAdminState(ctx.from.id, { type: 'set_maintenance_message' });
    return safeEditMessageContent(
      ctx,
      'Kirim pesan yang akan ditampilkan saat order/deposit ditutup.\n\nContoh: Layanan sedang maintenance sampai pukul 22.00 WIB.',
      Markup.inlineKeyboard([[Markup.button.callback('Settings', 'ADMIN:SETTINGS')]])
    );
  }));

  bot.action('ADMIN:APPLY_ENV_PRICING', adminAction(async (ctx) => {
    const result = await prisma.service.updateMany({
      where: { provider: 'smsbower' },
      data: {
        markupType: process.env.DEFAULT_MARKUP_TYPE || 'flat',
        markupValue: BigInt(Number(process.env.DEFAULT_MARKUP_VALUE || 0)),
        minProfit: BigInt(Number(process.env.DEFAULT_MIN_PROFIT || 0))
      }
    });
    return safeEditMessageContent(
      ctx,
      `Pricing dari .env diterapkan ke semua service.\n\nType: ${process.env.DEFAULT_MARKUP_TYPE}\nMarkup: ${process.env.DEFAULT_MARKUP_VALUE}\nMin profit: ${formatRupiah(process.env.DEFAULT_MIN_PROFIT || 0)}\nAffected: ${result.count}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Settings', 'ADMIN:SETTINGS')],
        [Markup.button.callback('Admin Panel', 'ADMIN:HOME')]
      ])
    );
  }));

  bot.action('ADMIN:SYNC_PROVIDER', adminAction(async (ctx) => {
    const result = await orderService.syncProviderCatalog();
    return safeEditMessageContent(
      ctx,
      `Sync provider selesai.\n\nCountries: ${result.countries}\nServices: ${result.services}`,
      adminBackKeyboard()
    );
  }));

  bot.action('ADMIN:PROVIDER', adminAction(async (ctx) => {
    let providerBalance = '-';
    try {
      providerBalance = await orderService.getProviderBalance();
    } catch (error) {
      providerBalance = `ERROR: ${error.message}`;
    }
    const [services, countries, providerErrors] = await Promise.all([
      prisma.service.count({ where: { provider: 'smsbower', isActive: true, isBlacklisted: false } }),
      prisma.country.count({ where: { provider: 'smsbower', isActive: true } }),
      prisma.providerLog.count({ where: { isError: true } })
    ]);
    return safeEditMessageContent(
      ctx,
      `Provider SMSBower\n\nBalance: ${providerBalance}\nService aktif: ${services}\nNegara aktif: ${countries}\nError logs: ${providerErrors}\nBase URL: ${process.env.SMSBOWER_BASE_URL}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Sync Provider', 'ADMIN:SYNC_PROVIDER')],
        [Markup.button.callback('Provider Errors', 'ADMIN:ERRORS')],
        [Markup.button.callback('Admin Panel', 'ADMIN:HOME')]
      ])
    );
  }));

  bot.action('ADMIN:ERRORS', adminAction(async (ctx) => {
    const [providerLogs, webhookLogs] = await Promise.all([
      prisma.providerLog.findMany({ where: { isError: true }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.webhookLog.findMany({
        where: { OR: [{ isValid: false }, { errorMessage: { not: null } }] },
        orderBy: { createdAt: 'desc' },
        take: 5
      })
    ]);
    const providerLines = providerLogs.map(
      (log) => `- ${log.createdAt.toISOString()} ${log.provider}.${log.action}: ${log.errorMessage || '-'}`
    );
    const webhookLines = webhookLogs.map(
      (log) => `- ${log.createdAt.toISOString()} ${log.source}: ${log.errorMessage || '-'}`
    );
    return safeEditMessageContent(
      ctx,
      `Errors\n\nProvider:\n${providerLines.join('\n') || '-'}\n\nWebhook:\n${webhookLines.join('\n') || '-'}`,
      adminBackKeyboard()
    );
  }));

  bot.action('ADMIN:BROADCAST', adminAction((ctx) =>
    safeEditMessageContent(ctx, 'Broadcast\n\nGunakan command:\n/broadcast pesan', adminKeyboard())
  ));

  bot.action('ADMIN:REPORT', adminAction(async (ctx) => {
    const report = await buildReport('today');
    return safeEditMessageContent(
      ctx,
      `Report today\n\nTotal deposit paid: ${formatRupiah(report.totalDeposit)}\nOrder sukses: ${report.successfulOrders}\nTotal refund: ${formatRupiah(report.refundAmount)}\nRevenue: ${formatRupiah(report.revenue)}\nProvider cost: ${formatRupiah(report.providerCost)}\nGross profit: ${formatRupiah(report.grossProfit)}\nTop service: ${report.topService}\nTop country: ${report.topCountry}`,
      adminKeyboard()
    );
  }));

  bot.on('text', async (ctx, next) => {
    if (!isAdmin(ctx.from?.id)) return next();
    const state = await consumeAdminState(ctx.from.id);
    if (!state) return next();
    if (String(ctx.message.text || '').startsWith('/')) return next();

    if (state.type === 'find_user') {
      const telegramId = String(ctx.message.text || '').replace(/[^\d]/g, '');
      if (!telegramId) return ctx.reply('Telegram ID tidak valid.', adminBackKeyboard());
      const user = await userService.getByTelegramId(telegramId);
      if (!user) return ctx.reply('User tidak ditemukan.', Markup.inlineKeyboard([[Markup.button.callback('Cari Lagi', 'ADMIN:USER:SEARCH')]]));
      const detail = await buildUserDetail(user.id);
      return ctx.reply(detail.text, userDetailKeyboard(detail.user));
    }

    if (state.type === 'set_maintenance_message') {
      const message = String(ctx.message.text || '').trim();
      if (!message || message.length > 500) {
        return ctx.reply('Pesan tidak valid. Maksimal 500 karakter.', Markup.inlineKeyboard([[Markup.button.callback('Settings', 'ADMIN:SETTINGS')]]));
      }
      await settings.setSetting('maintenance_message', message);
      return ctx.reply(
        `Pesan tutup berhasil diupdate.\n\n${message}`,
        Markup.inlineKeyboard([[Markup.button.callback('Settings', 'ADMIN:SETTINGS')]])
      );
    }

    return next();
  });
}

module.exports = { registerAdminHandlers };
