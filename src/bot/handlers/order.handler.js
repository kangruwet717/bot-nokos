const { Markup } = require('telegraf');
const orderService = require('../../services/order.service');
const env = require('../../config/env');
const messages = require('../../constants/messages');
const { formatRupiah } = require('../../utils/money');
const { createCallbackToken, consumeCallbackToken, readCallbackToken } = require('../../utils/callbackData');
const { safeReplaceMessage } = require('../../utils/telegram');
const {
  gridKeyboard,
  confirmOrderKeyboard,
  activeOrderKeyboard,
  activeOrdersKeyboard,
  otpReceivedKeyboard
} = require('../keyboards/order.keyboard');
const { backMainKeyboard } = require('../keyboards/main.keyboard');
const { redis } = require('../../config/redis');

const PAGE_SIZE = 8;
const PRICE_PAGE_SIZE = 8;
const SEARCH_STATE_PREFIX = 'order:search:';
const CANCEL_MENU_PREFIX = 'order:cancel-menu:';

function searchStateKey(telegramId) {
  return `${SEARCH_STATE_PREFIX}${telegramId}`;
}

async function setSearchState(telegramId, state) {
  await redis.set(searchStateKey(telegramId), JSON.stringify(state), 'EX', 300);
}

async function consumeSearchState(telegramId) {
  const key = searchStateKey(telegramId);
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  return JSON.parse(raw);
}

async function buildCountryKeyboard(page = 0) {
  const [favorites, countries] = await Promise.all([
    page === 0 ? orderService.getFavoriteCountries() : Promise.resolve([]),
    orderService.listCountriesExcludingFavorites(page, PAGE_SIZE)
  ]);
  const visibleCountries = [...favorites, ...countries];
  const nextPage = countries.length === PAGE_SIZE ? `ORDER:COUNTRY:p${page + 1}` : null;

  return gridKeyboard(
    visibleCountries,
    (country) => Markup.button.callback(country.localName || country.countryName, `ORDER:SVC:${country.countryCode}:p0`),
    {
      columns: 2,
      getLabel: (country) => country.localName || country.countryName,
      maxCompactLabelLength: 13,
      prevCb: page > 0 ? `ORDER:COUNTRY:p${page - 1}` : null,
      nextCb: nextPage,
      searchCb: 'ORDER:SEARCH_COUNTRY',
      searchLabel: 'Cari Negara',
      backCb: 'MAIN'
    }
  );
}

async function renderCancelOrderMenuOnce(ctx) {
  const key = `${CANCEL_MENU_PREFIX}${ctx.from.id}`;
  const shouldRender = await redis.set(key, '1', 'EX', 10, 'NX');
  if (!shouldRender) return null;
  const keyboard = await buildCountryKeyboard(0);
  return ctx.reply('Pilih negara:', keyboard);
}

async function ensureTos(ctx) {
  if (ctx.state.user?.tosAcceptedAt) return true;
  await ctx.reply(messages.tos, Markup.inlineKeyboard([[Markup.button.callback('Saya Setuju', 'TOS:ACCEPT')]]));
  return false;
}

function serviceLabel(service) {
  return `${service.localName || service.serviceName} [${service.serviceCode}]`;
}

function isProviderTimeout(error) {
  return ['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code) || String(error?.message || '').includes('ETIMEDOUT');
}

function maxOrderQuantity(stock = 1) {
  return Math.max(1, Math.min(env.MAX_BULK_ORDER_QUANTITY, Number(stock) || 1));
}

function bulkOrderSummary(orders, error = null) {
  const lines = [
    `${orders.length} order berhasil dibuat.`,
    '',
    ...orders.map(
      (order, index) =>
        `${index + 1}. ${order.serviceName} - ${order.phoneNumber || '-'} - ${formatRupiah(order.sellPrice)}`
    )
  ];

  if (error) {
    lines.push('', `Sebagian order berhenti: ${error.message}`);
  }

  lines.push('', 'Status: Menunggu OTP');
  return lines.join('\n');
}

function orderCreatedText(order, index = null, total = null) {
  const title = index && total ? `Nomor [${index}/${total}] didapat` : 'Order berhasil dibuat';
  return `${title}\n\nLayanan: ${order.serviceName}\nNegara: ${order.countryName}\nNomor: ${order.phoneNumber}\nHarga: ${formatRupiah(order.sellPrice)}\nStatus: Menunggu OTP`;
}

function bulkOtpSummary(orders) {
  const lines = ['Status OTP bulk:', ''];
  for (const [index, order] of orders.entries()) {
    const otp = order.otpCode ? `OTP: ${order.otpCode}` : `Status: ${order.status}`;
    lines.push(`${index + 1}. ${order.phoneNumber || '-'} - ${otp}`);
  }
  return lines.join('\n');
}

async function createBulkOrderToken(orders) {
  return createCallbackToken({ orderIds: orders.map((order) => order.id) }, 3600);
}

function renderExpiredOrderSession(ctx) {
  return safeReplaceMessage(
    ctx,
    'Sesi order sudah kedaluwarsa.\n\nSilakan pilih negara untuk order lagi:',
    Markup.inlineKeyboard([
      [Markup.button.callback('Order OTP', 'ORDER:COUNTRY:p0')],
      [Markup.button.callback('Kembali', 'MAIN')]
    ])
  ).catch(() =>
    ctx.reply(
      'Sesi order sudah kedaluwarsa.\n\nSilakan pilih negara untuk order lagi:',
      Markup.inlineKeyboard([
        [Markup.button.callback('Order OTP', 'ORDER:COUNTRY:p0')],
        [Markup.button.callback('Kembali', 'MAIN')]
      ])
    )
  );
}

async function renderPriceOptions(ctx, countryCode, serviceCode, page = 0) {
  let allOptions;
  try {
    allOptions = await orderService.getOrderPriceOptions(serviceCode, countryCode, 100);
  } catch (error) {
    if (!isProviderTimeout(error)) throw error;
    return safeReplaceMessage(
      ctx,
      'Supplier sedang lambat.\n\nGagal mengambil harga saat ini. Silakan coba refresh beberapa saat lagi.',
      Markup.inlineKeyboard([
        [Markup.button.callback('Refresh Harga', `ORDER:QUOTE:${countryCode}:${serviceCode}:p${page}`)],
        [Markup.button.callback('Kembali', `ORDER:SVC:${countryCode}:p0`)]
      ])
    );
  }
  const total = allOptions.length;
  const options = allOptions.slice(page * PRICE_PAGE_SIZE, page * PRICE_PAGE_SIZE + PRICE_PAGE_SIZE);
  if (!options.length) return ctx.reply('Opsi harga tidak tersedia. Silakan pilih ulang.', backMainKeyboard());

  const rows = [];
  for (const option of options) {
    rows.push([
      Markup.button.callback(
        `Provider ${option.providerId} - ${option.stock} - ${formatRupiah(option.sellPrice)}`,
        `ORDER:OPT:${countryCode}:${serviceCode}:${option.providerId}`
      )
    ]);
  }

  const nav = [];
  if (page > 0) nav.push(Markup.button.callback('Sebelumnya', `ORDER:QUOTE:${countryCode}:${serviceCode}:p${page - 1}`));
  if ((page + 1) * PRICE_PAGE_SIZE < total) {
    nav.push(Markup.button.callback('Selanjutnya', `ORDER:QUOTE:${countryCode}:${serviceCode}:p${page + 1}`));
  }
  if (nav.length) rows.push(nav);

  rows.push([Markup.button.callback('Kembali', `ORDER:SVC:${countryCode}:p0`)]);

  return safeReplaceMessage(
    ctx,
    `Layanan: ${options[0].service.localName || options[0].service.serviceName}\nNegara: ${options[0].country.localName || options[0].country.countryName}\nOpsi harga: ${page * PRICE_PAGE_SIZE + 1}-${page * PRICE_PAGE_SIZE + options.length} dari ${total}\n\nPilih opsi harga:`,
    Markup.inlineKeyboard(rows)
  );
}

function registerOrderHandlers(bot) {
  bot.action(/^ORDER:COUNTRY:p(\d+)$/, async (ctx) => {
    try {
      if (ctx.state.user?.isBanned) return ctx.reply(messages.banned(ctx.state.user.banReason));
      const page = Number(ctx.match[1]);
      const keyboard = await buildCountryKeyboard(page);
      return safeReplaceMessage(ctx, 'Pilih negara:', keyboard).catch(() => ctx.reply('Pilih negara:', keyboard));
    } catch (error) {
      return ctx.reply(`Gagal memuat negara: ${error.message}`, backMainKeyboard());
    }
  });

  bot.action(/^ORDER:SVC:([^:]+):p(\d+)$/, async (ctx) => {
    try {
      const countryCode = ctx.match[1];
      const page = Number(ctx.match[2]);
      const { services: visibleServices, hasNext } = await orderService.listPrioritizedServices(page, PAGE_SIZE);
      const keyboard = gridKeyboard(
        visibleServices,
        (service) => Markup.button.callback(serviceLabel(service), `ORDER:QUOTE:${countryCode}:${service.serviceCode}`),
        {
          columns: 2,
          getLabel: serviceLabel,
          maxCompactLabelLength: 28,
          prevCb: page > 0 ? `ORDER:SVC:${countryCode}:p${page - 1}` : null,
          nextCb: hasNext ? `ORDER:SVC:${countryCode}:p${page + 1}` : null,
          searchCb: `ORDER:SEARCH_SERVICE:${countryCode}`,
          searchLabel: 'Ketik Nama/ID Layanan',
          backCb: 'ORDER:COUNTRY:p0'
        }
      );
      return safeReplaceMessage(ctx, 'Pilih layanan yang kamu butuhkan:', keyboard);
    } catch (error) {
      return ctx.reply(`Gagal memuat layanan: ${error.message}`, backMainKeyboard());
    }
  });

  bot.action(/^ORDER:QUOTE:([^:]+):([^:]+)(?::p(\d+))?$/, async (ctx) => {
    try {
      const countryCode = ctx.match[1];
      const serviceCode = ctx.match[2];
      const page = Number(ctx.match[3] || 0);
      return renderPriceOptions(ctx, countryCode, serviceCode, page);
    } catch (error) {
      if (error.code === 'OUT_OF_STOCK') return ctx.reply(messages.stockEmpty('layanan ini', 'negara ini'), backMainKeyboard());
      if (isProviderTimeout(error)) {
        return safeReplaceMessage(
          ctx,
          'Supplier sedang lambat.\n\nGagal mengambil harga saat ini. Silakan coba beberapa saat lagi.',
          Markup.inlineKeyboard([
            [Markup.button.callback('Coba Lagi', `ORDER:QUOTE:${ctx.match[1]}:${ctx.match[2]}:p${ctx.match[3] || 0}`)],
            [Markup.button.callback('Kembali', `ORDER:SVC:${ctx.match[1]}:p0`)]
          ])
        );
      }
      return ctx.reply(`Gagal cek harga/stok: ${error.message}`, backMainKeyboard());
    }
  });

  bot.action('ORDER:SEARCH_COUNTRY', async (ctx) => {
    await setSearchState(ctx.from.id, { type: 'country' });
    return safeReplaceMessage(
      ctx,
      'Ketik nama negara yang ingin dicari.\n\nContoh: Indonesia, India, United States',
      Markup.inlineKeyboard([[Markup.button.callback('Kembali', 'ORDER:COUNTRY:p0')]])
    );
  });

  bot.action(/^ORDER:SEARCH_SERVICE:([^:]+)$/, async (ctx) => {
    await setSearchState(ctx.from.id, { type: 'service', countryCode: ctx.match[1] });
    return safeReplaceMessage(
      ctx,
      'Ketik nama layanan yang ingin dicari.\n\nContoh: WhatsApp, Telegram, Google',
      Markup.inlineKeyboard([[Markup.button.callback('Kembali', `ORDER:SVC:${ctx.match[1]}:p0`)]])
    );
  });

  bot.on('text', async (ctx, next) => {
    const state = await consumeSearchState(ctx.from.id);
    if (!state) return next();
    if (String(ctx.message.text || '').startsWith('/')) return next();

    try {
      if (state.type === 'country') {
        const countries = await orderService.searchCountries(ctx.message.text, 8);
        const rows = countries.map((country) => [
          Markup.button.callback(country.localName || country.countryName, `ORDER:SVC:${country.countryCode}:p0`)
        ]);
        rows.push([Markup.button.callback('Cari Lagi', 'ORDER:SEARCH_COUNTRY')]);
        rows.push([Markup.button.callback('Kembali', 'ORDER:COUNTRY:p0')]);
        return ctx.reply(
          `Hasil pencarian negara: ${ctx.message.text}\n\n${countries.length ? 'Pilih salah satu:' : 'Tidak ada hasil.'}`,
          Markup.inlineKeyboard(rows)
        );
      }

      if (state.type === 'service') {
        const services = await orderService.searchServices(ctx.message.text, 8);
        const rows = services.map((service) => [
          Markup.button.callback(
            serviceLabel(service),
            `ORDER:QUOTE:${state.countryCode}:${service.serviceCode}`
          )
        ]);
        rows.push([Markup.button.callback('Cari Lagi', `ORDER:SEARCH_SERVICE:${state.countryCode}`)]);
        rows.push([Markup.button.callback('Kembali', `ORDER:SVC:${state.countryCode}:p0`)]);
        return ctx.reply(
          `Hasil pencarian layanan: ${ctx.message.text}\n\n${services.length ? 'Pilih salah satu:' : 'Tidak ada hasil.'}`,
          Markup.inlineKeyboard(rows)
        );
      }
    } catch (error) {
      return ctx.reply(`Gagal mencari: ${error.message}`, backMainKeyboard());
    }

    return next();
  });

  bot.action(/^ORDER:OPT:([^:]+):([^:]+):([^:]+)$/, async (ctx) => {
    try {
      const countryCode = ctx.match[1];
      const serviceCode = ctx.match[2];
      const providerId = ctx.match[3];
      const options = await orderService.getOrderPriceOptions(serviceCode, countryCode, 50);
      const quote = options.find((option) => option.providerId === providerId);
      if (!quote) return ctx.reply('Opsi harga sudah tidak tersedia. Silakan refresh layanan.', backMainKeyboard());
      const token = await createCallbackToken({ countryCode, serviceCode, providerId }, 600);
      return safeReplaceMessage(
        ctx,
        `Layanan: ${quote.service.localName || quote.service.serviceName}\nNegara: ${quote.country.localName || quote.country.countryName}\nProvider: ${quote.providerId}\nHarga: ${formatRupiah(quote.sellPrice)}\nStok: ${quote.stock}\n\nLanjut order?`,
        confirmOrderKeyboard(token, maxOrderQuantity(quote.stock))
      );
    } catch (error) {
      return ctx.reply(`Gagal memilih harga: ${error.message}`, backMainKeyboard());
    }
  });

  bot.action(/^ORDER:REFRESH:(.+)$/, async (ctx) => {
    const payload = await consumeCallbackToken(ctx.match[1]);
    if (!payload) return renderExpiredOrderSession(ctx);
    const options = payload.providerId
      ? await orderService.getOrderPriceOptions(payload.serviceCode, payload.countryCode, 50)
      : null;
    const quote = payload.providerId
      ? options.find((option) => option.providerId === payload.providerId)
      : await orderService.quoteOrder(payload.serviceCode, payload.countryCode);
    if (!quote) return ctx.reply('Opsi harga sudah tidak tersedia. Silakan pilih ulang.', backMainKeyboard());
    const token = await createCallbackToken(payload, 600);
    return safeReplaceMessage(
      ctx,
      `Layanan: ${quote.service.localName || quote.service.serviceName}\nNegara: ${quote.country.localName || quote.country.countryName}\nHarga: ${formatRupiah(quote.sellPrice)}\nStok: ${quote.stock}\n\nLanjut order?`,
      confirmOrderKeyboard(token, maxOrderQuantity(quote.stock))
    );
  });

  bot.action(/^ORDER:CONFIRM:([^:]+)(?::(\d+))?$/, async (ctx) => {
    try {
      if (!(await ensureTos(ctx))) return;
      const payload = await consumeCallbackToken(ctx.match[1]);
      if (!payload) return renderExpiredOrderSession(ctx);
      const quantity = Math.max(1, Math.min(Number(ctx.match[2] || 1), env.MAX_BULK_ORDER_QUANTITY));
      const result = await orderService.createOrders(
        ctx.state.user,
        payload.serviceCode,
        payload.countryCode,
        payload.providerId,
        quantity
      );
      const firstOrder = result.orders[0];
      if (result.orders.length > 1 || result.error) {
        await ctx.deleteMessage().catch(() => null);
        for (const [index, order] of result.orders.entries()) {
          await ctx.reply(orderCreatedText(order, index + 1, result.orders.length), activeOrderKeyboard(order.id));
        }
        if (result.error) {
          return ctx.reply(`Sebagian order berhenti: ${result.error.message}`, backMainKeyboard());
        }
        return null;
      }
      await ctx.deleteMessage().catch(() => null);
      return ctx.reply(
        orderCreatedText(firstOrder),
        activeOrderKeyboard(firstOrder.id)
      );
    } catch (error) {
      if (error.code === 'TOS_REQUIRED') return ensureTos(ctx);
      if (error.code === 'INSUFFICIENT_BALANCE') return ctx.reply('Saldo tidak cukup. Silakan deposit terlebih dahulu.', backMainKeyboard());
      if (error.code === 'OUT_OF_STOCK') return ctx.reply(error.message || messages.stockEmpty('layanan ini', 'negara ini'), backMainKeyboard());
      if (error.code === 'USER_BANNED') return ctx.reply(messages.banned(ctx.state.user.banReason));
      if (error.code === 'MAINTENANCE_MODE') return ctx.reply(error.message, backMainKeyboard());
      return ctx.reply(`Gagal membuat order: ${error.message}`, backMainKeyboard());
    }
  });

  bot.action(/^ORDER:CHECK:(.+)$/, async (ctx) => {
    try {
      const order = await orderService.checkOrderOtp(ctx.match[1]);
      if (order.otpCode) {
        return ctx.reply(
          `OTP diterima\n\nNomor: ${order.phoneNumber}\nKode OTP: ${order.otpCode}\nPesan: ${order.smsText || '-'}`,
          otpReceivedKeyboard()
        );
      }
      return ctx.answerCbQuery('OTP belum masuk. Coba lagi beberapa saat lagi.');
    } catch (error) {
      return ctx.reply(`Gagal cek OTP: ${error.message}`, backMainKeyboard());
    }
  });

  bot.action(/^ORDER:CHECK_BULK:(.+)$/, async (ctx) => {
    try {
      const payload = await readCallbackToken(ctx.match[1]);
      if (!payload?.orderIds?.length) return renderExpiredOrderSession(ctx);

      const orders = [];
      for (const orderId of payload.orderIds) {
        orders.push(await orderService.checkOrderOtp(orderId));
      }

      return safeReplaceMessage(ctx, bulkOtpSummary(orders), activeOrdersKeyboard(ctx.match[1], orders));
    } catch (error) {
      return ctx.reply(`Gagal cek OTP: ${error.message}`, backMainKeyboard());
    }
  });

  bot.action(/^ORDER:CANCEL:(.+)$/, async (ctx) => {
    try {
      await orderService.cancelOrder(ctx.state.user, ctx.match[1]);
      delete ctx.state.user;
      await ctx.answerCbQuery('Order dibatalkan dan saldo direfund.').catch(() => null);
      await ctx.deleteMessage().catch(() => null);
      return renderCancelOrderMenuOnce(ctx);
    } catch (error) {
      return ctx.reply(`Gagal batalkan order: ${error.message}`, backMainKeyboard());
    }
  });

  bot.action(/^ORDER:RETRY_SMS:(.+)$/, async (ctx) => {
    try {
      await orderService.requestAnotherSms(ctx.state.user, ctx.match[1]);
      return ctx.answerCbQuery('Permintaan SMS ulang dikirim.').catch(() => null);
    } catch (error) {
      return ctx.reply(`Gagal minta SMS ulang: ${error.message}`, backMainKeyboard());
    }
  });

  bot.action(/^ORDER:CANCEL_BULK:(.+)$/, async (ctx) => {
    try {
      const payload = await readCallbackToken(ctx.match[1]);
      if (!payload?.orderIds?.length) return renderExpiredOrderSession(ctx);

      let cancelled = 0;
      for (const orderId of payload.orderIds) {
        try {
          await orderService.cancelOrder(ctx.state.user, orderId);
          cancelled += 1;
        } catch (_) {
          // Order yang sudah menerima OTP/selesai tidak bisa dibatalkan, lanjutkan order lain.
        }
      }

      delete ctx.state.user;
      await ctx.answerCbQuery(`${cancelled} order dibatalkan dan saldo direfund.`).catch(() => null);
      await ctx.deleteMessage().catch(() => null);
      return renderCancelOrderMenuOnce(ctx);
    } catch (error) {
      return ctx.reply(`Gagal batalkan order: ${error.message}`, backMainKeyboard());
    }
  });

  bot.action(/^ORDER:FINISH:(.+)$/, async (ctx) => {
    try {
      await orderService.finishOrder(ctx.state.user, ctx.match[1]);
      return ctx.reply('Order selesai.', backMainKeyboard());
    } catch (error) {
      return ctx.reply(`Gagal menyelesaikan order: ${error.message}`, backMainKeyboard());
    }
  });
}

module.exports = { registerOrderHandlers };
