const prisma = require('../config/prisma');
const env = require('../config/env');
const OrderStatus = require('../constants/orderStatus');
const wallet = require('./wallet.service');
const providerService = require('./provider.service');
const settings = require('./settings.service');
const { calculateSellPrice } = require('./pricing.service');
const { hitLimit } = require('./rateLimit.service');
const { otpPollingQueue } = require('../config/queue');
const { notifyOrderChannel, notifyTelegram } = require('./notification.service');
const { formatRupiah } = require('../utils/money');

function orderExpiresAt() {
  return new Date(Date.now() + env.OTP_ORDER_TIMEOUT_MINUTES * 60 * 1000);
}

async function lockOrder(tx, orderId) {
  if (env.DATABASE_URL.startsWith('file:')) return;
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
}

async function syncCountries() {
  const countries = await providerService.callProvider('getCountries');
  for (const country of countries) {
    await prisma.country.upsert({
      where: { provider_countryCode: { provider: env.OTP_PROVIDER, countryCode: country.code } },
      create: {
        provider: env.OTP_PROVIDER,
        countryCode: country.code,
        countryName: country.name,
        localName: country.name
      },
      update: { countryName: country.name }
    });
  }
  return countries;
}

async function syncServices() {
  const services = await providerService.callProvider('getServices');
  for (const service of services) {
    await prisma.service.upsert({
      where: { provider_serviceCode: { provider: env.OTP_PROVIDER, serviceCode: service.code } },
      create: {
        provider: env.OTP_PROVIDER,
        serviceCode: service.code,
        serviceName: service.name,
        localName: service.name,
        markupType: env.DEFAULT_MARKUP_TYPE,
        markupValue: BigInt(env.DEFAULT_MARKUP_VALUE),
        minProfit: BigInt(env.DEFAULT_MIN_PROFIT)
      },
      update: { serviceName: service.name }
    });
  }
  return services;
}

async function syncProviderCatalog() {
  const [countries, services] = await Promise.all([syncCountries(), syncServices()]);
  return { countries: countries.length, services: services.length };
}

async function getProviderBalance() {
  return providerService.callProvider('getBalance');
}

async function listCountries(page = 0, pageSize = 8) {
  const total = await prisma.country.count({ where: { provider: env.OTP_PROVIDER, isActive: true } });
  if (!total) await syncCountries();
  return prisma.country.findMany({
    where: { provider: env.OTP_PROVIDER, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { countryName: 'asc' }],
    skip: page * pageSize,
    take: pageSize
  });
}

async function getFavoriteCountries() {
  const indonesia = await prisma.country.findUnique({
    where: { provider_countryCode: { provider: env.OTP_PROVIDER, countryCode: '6' } }
  });
  if (indonesia?.isActive) return [indonesia];
  return [];
}

async function listCountriesExcludingFavorites(page = 0, pageSize = 8) {
  const where = {
    provider: env.OTP_PROVIDER,
    isActive: true,
    countryCode: { notIn: ['6'] }
  };
  const total = await prisma.country.count({ where });
  if (!total) await syncCountries();
  return prisma.country.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { countryName: 'asc' }],
    skip: page * pageSize,
    take: pageSize
  });
}

async function searchCountries(query, limit = 8) {
  const keyword = String(query || '').trim();
  if (!keyword) return [];
  const total = await prisma.country.count({ where: { provider: env.OTP_PROVIDER } });
  if (!total) await syncCountries();
  return prisma.country.findMany({
    where: {
      provider: env.OTP_PROVIDER,
      isActive: true,
      OR: [
        { countryName: { contains: keyword } },
        { localName: { contains: keyword } },
        { countryCode: keyword }
      ]
    },
    orderBy: [{ sortOrder: 'asc' }, { countryName: 'asc' }],
    take: limit
  });
}

async function listServices(page = 0, pageSize = 8) {
  const total = await prisma.service.count({
    where: { provider: env.OTP_PROVIDER, isActive: true, isBlacklisted: false }
  });
  if (!total) await syncServices();
  return prisma.service.findMany({
    where: { provider: env.OTP_PROVIDER, isActive: true, isBlacklisted: false },
    orderBy: [{ sortOrder: 'asc' }, { localName: 'asc' }],
    skip: page * pageSize,
    take: pageSize
  });
}

const POPULAR_SERVICE_CODES = [
  'wa',
  'tg',
  'go',
  'ig',
  'fb',
  'lf',
  'tw',
  'ds',
  'me',
  'vi',
  'wb',
  'kt',
  'nv',
  'ka',
  'xd',
  'dl',
  'fr',
  'xh',
  'aeb',
  'jg',
  'ni',
  'am',
  'mm',
  'mb',
  'ts',
  'nf',
  'alj',
  'mt',
  'ub'
];

async function getPopularServices(page = 0, pageSize = 8) {
  const services = await prisma.service.findMany({
    where: {
      provider: env.OTP_PROVIDER,
      isActive: true,
      isBlacklisted: false,
      serviceCode: { in: POPULAR_SERVICE_CODES }
    }
  });
  return POPULAR_SERVICE_CODES.map((code) => services.find((service) => service.serviceCode === code))
    .filter(Boolean)
    .slice(page * pageSize, page * pageSize + pageSize);
}

async function listServicesExcludingPopular(page = 0, pageSize = 8) {
  const popularCount = await prisma.service.count({
    where: {
      provider: env.OTP_PROVIDER,
      isActive: true,
      isBlacklisted: false,
      serviceCode: { in: POPULAR_SERVICE_CODES }
    }
  });
  const popularPages = Math.ceil(popularCount / pageSize);
  const adjustedPage = Math.max(0, page - popularPages);
  const where = {
    provider: env.OTP_PROVIDER,
    isActive: true,
    isBlacklisted: false,
    serviceCode: { notIn: POPULAR_SERVICE_CODES }
  };
  const total = await prisma.service.count({ where });
  if (!total) await syncServices();
  return prisma.service.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { localName: 'asc' }],
    skip: adjustedPage * pageSize,
    take: pageSize
  });
}

async function listPrioritizedServices(page = 0, pageSize = 8) {
  const total = await prisma.service.count({
    where: { provider: env.OTP_PROVIDER, isActive: true, isBlacklisted: false }
  });
  if (!total) await syncServices();

  const popular = await getPopularServices(page, pageSize);
  if (popular.length === pageSize) {
    return { services: popular, hasNext: true };
  }

  const remainingSlots = pageSize - popular.length;
  const other = await listServicesExcludingPopular(page, remainingSlots);
  const services = [...popular, ...other];
  return { services, hasNext: services.length === pageSize };
}

async function searchServices(query, limit = 8) {
  const keyword = String(query || '').trim();
  if (!keyword) return [];
  const total = await prisma.service.count({ where: { provider: env.OTP_PROVIDER } });
  if (!total) await syncServices();
  return prisma.service.findMany({
    where: {
      provider: env.OTP_PROVIDER,
      isActive: true,
      isBlacklisted: false,
      OR: [
        { serviceName: { contains: keyword } },
        { localName: { contains: keyword } },
        { serviceCode: { contains: keyword } }
      ]
    },
    orderBy: [{ sortOrder: 'asc' }, { localName: 'asc' }],
    take: limit
  });
}

async function quoteOrder(serviceCode, countryCode) {
  const [service, country, price] = await Promise.all([
    prisma.service.findUnique({ where: { provider_serviceCode: { provider: env.OTP_PROVIDER, serviceCode } } }),
    prisma.country.findUnique({ where: { provider_countryCode: { provider: env.OTP_PROVIDER, countryCode } } }),
    providerService.callProvider('getPrices', [serviceCode, countryCode])
  ]);

  if (!service || service.isBlacklisted || !service.isActive) throw new Error('Service tidak aktif');
  if (!country || !country.isActive) throw new Error('Negara tidak aktif');
  if (!price.count) {
    const error = new Error('Stok kosong');
    error.code = 'OUT_OF_STOCK';
    throw error;
  }

  const calculated = calculateSellPrice(price.cost, {
    markupType: service.markupType,
    markupValue: Number(service.markupValue),
    minProfit: Number(service.minProfit)
  });

  return {
    service,
    country,
    stock: price.count,
    providerCostRaw: price.providerCost ?? price.cost,
    providerCurrency: price.providerCurrency || 'IDR',
    ...calculated
  };
}

async function getOrderPriceOptions(serviceCode, countryCode, limit = 8) {
  const [service, country, options] = await Promise.all([
    prisma.service.findUnique({ where: { provider_serviceCode: { provider: env.OTP_PROVIDER, serviceCode } } }),
    prisma.country.findUnique({ where: { provider_countryCode: { provider: env.OTP_PROVIDER, countryCode } } }),
    providerService.callProvider('getPriceOptions', [serviceCode, countryCode])
  ]);

  if (!service || service.isBlacklisted || !service.isActive) throw new Error('Service tidak aktif');
  if (!country || !country.isActive) throw new Error('Negara tidak aktif');

  const pricedOptions = options.slice(0, limit).map((option) => {
    const calculated = calculateSellPrice(option.cost, {
      markupType: service.markupType,
      markupValue: Number(service.markupValue),
      minProfit: Number(service.minProfit)
    });
    return {
      ...option,
      ...calculated,
      service,
      country,
      stock: option.count,
      providerCostRaw: option.providerCost
    };
  });

  if (!pricedOptions.length) {
    const error = new Error('Stok kosong');
    error.code = 'OUT_OF_STOCK';
    throw error;
  }

  return pricedOptions;
}

async function assertOrderAllowed(user, sellPrice) {
  const orderEnabled = await settings.getBooleanSetting('order_enabled', true);
  const maintenanceMode = await settings.getBooleanSetting('maintenance_mode', false);
  if (!orderEnabled || maintenanceMode) {
    const error = new Error((await settings.getSetting('maintenance_message', null)) || 'Order sedang ditutup sementara');
    error.code = 'MAINTENANCE_MODE';
    throw error;
  }
  if (user.isBanned) {
    const error = new Error('User banned');
    error.code = 'USER_BANNED';
    throw error;
  }
  if (!user.tosAcceptedAt) {
    const error = new Error('TOS required');
    error.code = 'TOS_REQUIRED';
    throw error;
  }
  if (user.balance < BigInt(sellPrice)) {
    const error = new Error('Insufficient balance');
    error.code = 'INSUFFICIENT_BALANCE';
    throw error;
  }

  const activeOrders = await prisma.order.count({
    where: { userId: user.id, status: { in: [OrderStatus.PENDING_PROVIDER, OrderStatus.WAITING_SMS] } }
  });
  if (activeOrders >= env.MAX_ACTIVE_ORDERS_PER_USER) {
    const error = new Error('Terlalu banyak order aktif');
    error.code = 'ORDER_LIMIT';
    throw error;
  }

  const limited = await hitLimit(`rate:order:${user.id}`, env.MAX_ORDERS_PER_HOUR, 3600);
  if (limited) {
    const error = new Error('Limit order per jam tercapai');
    error.code = 'ORDER_RATE_LIMIT';
    throw error;
  }
}

function isProviderOutOfStock(error) {
  const code = String(error?.providerCode || error?.message || '').toUpperCase();
  return code === 'NO_NUMBERS' || code.includes('NO_NUMBERS');
}

function createOutOfStockError() {
  const error = new Error('Stok baru saja habis. Silakan refresh stok atau pilih provider lain.');
  error.code = 'OUT_OF_STOCK';
  return error;
}

async function createOrder(user, serviceCode, countryCode, selectedProviderId = null) {
  let quote;
  if (selectedProviderId) {
    const options = await getOrderPriceOptions(serviceCode, countryCode, 50);
    quote = options.find((option) => option.providerId === String(selectedProviderId));
    if (!quote) {
      const error = new Error('Opsi harga sudah tidak tersedia');
      error.code = 'OUT_OF_STOCK';
      throw error;
    }
  } else {
    quote = await quoteOrder(serviceCode, countryCode);
  }
  await assertOrderAllowed(user, quote.sellPrice);

  const providerIdForOrder = selectedProviderId === 'any' ? null : selectedProviderId;
  let activation;
  try {
    activation = await providerService.callProvider('createActivation', [
      serviceCode,
      countryCode,
      quote.providerCostRaw ?? quote.providerCost,
      providerIdForOrder ? { providerId: providerIdForOrder } : {}
    ]);
  } catch (error) {
    if (isProviderOutOfStock(error)) throw createOutOfStockError();
    throw error;
  }

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId: user.id,
          provider: env.OTP_PROVIDER,
          providerOrderId: activation.activationId,
          serviceCode,
          serviceName: quote.service.localName || quote.service.serviceName,
          countryCode,
          countryName: quote.country.localName || quote.country.countryName,
          phoneNumber: activation.phoneNumber,
          providerCost: BigInt(quote.providerCost),
          sellPrice: BigInt(quote.sellPrice),
          profit: BigInt(quote.profit),
          status: OrderStatus.WAITING_SMS,
          expiredAt: orderExpiresAt()
        }
      });

      await wallet.debit({
        userId: user.id,
        amount: quote.sellPrice,
        type: 'order',
        referenceType: 'order',
        referenceId: created.id,
        note: `Order ${created.serviceName} ${created.countryName}`,
        tx
      });

      return created;
    });
  } catch (error) {
    await providerService
      .callProvider('cancelActivation', [activation.activationId], env.OTP_PROVIDER)
      .catch(() => null);
    throw error;
  }

  await otpPollingQueue.add(
    'poll',
    { orderId: order.id },
    { delay: env.OTP_POLL_INTERVAL_SECONDS * 1000, attempts: 1, removeOnComplete: true }
  );

  return order;
}

async function createOrders(user, serviceCode, countryCode, selectedProviderId = null, quantity = 1) {
  const count = Math.max(1, Math.min(Number(quantity) || 1, env.MAX_BULK_ORDER_QUANTITY));
  const orders = [];
  let error = null;

  for (let index = 0; index < count; index += 1) {
    try {
      const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (!freshUser) throw new Error('User tidak ditemukan');
      const order = await createOrder(freshUser, serviceCode, countryCode, selectedProviderId);
      orders.push(order);
    } catch (caught) {
      error = caught;
      break;
    }
  }

  if (!orders.length && error) throw error;
  return { orders, error };
}

async function checkOrderOtp(orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true } });
  if (!order) throw new Error('Order tidak ditemukan');
  if (![OrderStatus.WAITING_SMS, OrderStatus.SMS_RECEIVED].includes(order.status)) return order;
  if (order.status === OrderStatus.SMS_RECEIVED) return order;

  const status = await providerService.callProvider('checkActivationStatus', [order.providerOrderId], order.provider, order.id);
  if (status.status === OrderStatus.SMS_RECEIVED) {
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.SMS_RECEIVED,
        otpCode: status.otpCode,
        smsText: status.smsText,
        smsReceivedAt: new Date()
      },
      include: { user: true }
    });
    await notifyTelegram(
      updated.user.telegramId,
      `OTP diterima\n\nNomor: ${updated.phoneNumber}\nKode OTP: ${updated.otpCode}\nPesan: ${updated.smsText || '-'}`
    );
    await notifyOrderChannel(updated);
    return updated;
  }

  if (status.status === OrderStatus.CANCELLED || status.status === OrderStatus.FAILED) {
    return prisma.order.update({ where: { id: order.id }, data: { status: status.status } });
  }

  return order;
}

async function cancelOrder(user, orderId) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: user.id } });
  if (!order) throw new Error('Order tidak ditemukan');
  if (order.status !== OrderStatus.WAITING_SMS) throw new Error('Order tidak dapat dibatalkan');

  const result = await providerService.callProvider('cancelActivation', [order.providerOrderId], order.provider, order.id);
  if (!result.ok) throw new Error('Provider menolak pembatalan');

  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, order.id);
    const current = await tx.order.findUnique({ where: { id: order.id } });
    if (current.status !== OrderStatus.WAITING_SMS) return current;
    const updated = await tx.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.REFUNDED, cancelReason: 'User cancel' }
    });
    await wallet.credit({
      userId: user.id,
      amount: order.sellPrice,
      type: 'refund',
      referenceType: 'order',
      referenceId: order.id,
      note: `Refund order ${order.id}`,
      tx
    });
    return updated;
  });
}

async function requestAnotherSms(user, orderId) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: user.id } });
  if (!order) throw new Error('Order tidak ditemukan');
  if (order.status !== OrderStatus.WAITING_SMS) throw new Error('Order tidak dapat meminta SMS ulang');

  const result = await providerService.callProvider('requestAnotherSms', [order.providerOrderId], order.provider, order.id);
  if (!result.ok) throw new Error(result.message || 'Gagal meminta SMS ulang');
  return order;
}

async function finishOrder(user, orderId) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId: user.id } });
  if (!order) throw new Error('Order tidak ditemukan');
  await providerService.callProvider('finishActivation', [order.providerOrderId], order.provider, order.id).catch(() => null);
  return prisma.order.update({
    where: { id: order.id },
    data: { status: OrderStatus.COMPLETED, completedAt: new Date() }
  });
}

async function expireTimedOutOrders() {
  const expired = await prisma.order.findMany({
    where: { status: OrderStatus.WAITING_SMS, expiredAt: { lt: new Date() } },
    include: { user: true },
    take: 25
  });
  for (const order of expired) {
    const cancelResult = await providerService
      .callProvider('cancelActivation', [order.providerOrderId], order.provider, order.id)
      .catch((error) => ({ ok: false, message: error.message }));

    if (cancelResult.ok) {
      await prisma.$transaction(async (tx) => {
        await lockOrder(tx, order.id);
        const current = await tx.order.findUnique({ where: { id: order.id } });
        if (!current || current.status !== OrderStatus.WAITING_SMS) return current;

        const updated = await tx.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.REFUNDED, cancelReason: 'Timeout refund' }
        });

        await wallet.credit({
          userId: order.userId,
          amount: order.sellPrice,
          type: 'refund',
          referenceType: 'order',
          referenceId: order.id,
          note: `Refund timeout order ${order.id}`,
          tx
        });

        return updated;
      });
      await notifyTelegram(
        order.user.telegramId,
        `Order timeout dan saldo direfund.\n\nLayanan: ${order.serviceName}\nNomor: ${order.phoneNumber || '-'}\nRefund: ${formatRupiah(order.sellPrice)}`
      );
    } else {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.EXPIRED, cancelReason: cancelResult.message || 'Timeout' }
      });
      await notifyTelegram(
        order.user.telegramId,
        `Order timeout.\n\nLayanan: ${order.serviceName}\nNomor: ${order.phoneNumber || '-'}\nStatus: EXPIRED`
      );
    }
  }
  return expired.length;
}

module.exports = {
  syncCountries,
  syncServices,
  syncProviderCatalog,
  getProviderBalance,
  getFavoriteCountries,
  listCountries,
  listCountriesExcludingFavorites,
  searchCountries,
  getPopularServices,
  listServices,
  listServicesExcludingPopular,
  listPrioritizedServices,
  searchServices,
  quoteOrder,
  getOrderPriceOptions,
  createOrder,
  createOrders,
  checkOrderOtp,
  cancelOrder,
  requestAnotherSms,
  finishOrder,
  expireTimedOutOrders
};
