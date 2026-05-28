const prisma = require('../config/prisma');

function getPeriodRange(period) {
  const now = new Date();
  const start = new Date(now);
  const normalizedPeriod = String(period || 'today').toLowerCase();
  if (normalizedPeriod === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { start, end: now, period: 'month' };
  }
  if (['week', 'weekly'].includes(normalizedPeriod)) {
    const day = start.getDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - daysSinceMonday);
    start.setHours(0, 0, 0, 0);
    return { start, end: now, period: 'week' };
  }
  if (['day', 'daily', 'today'].includes(normalizedPeriod)) {
    start.setHours(0, 0, 0, 0);
    return { start, end: now, period: 'today' };
  }

  start.setHours(0, 0, 0, 0);
  return { start, end: now, period: 'today' };
}

async function buildReport(period = 'today') {
  const range = getPeriodRange(period);
  const orderWhere = { createdAt: { gte: range.start, lte: range.end } };
  const paidDepositWhere = { status: 'PAID', paidAt: { gte: range.start, lte: range.end } };
  const successfulOrderWhere = {
    ...orderWhere,
    status: { in: ['SMS_RECEIVED', 'COMPLETED'] }
  };
  const refundWhere = {
    createdAt: { gte: range.start, lte: range.end },
    type: 'refund'
  };

  const [
    totalDeposit,
    successfulOrders,
    refundAmount,
    revenue,
    providerCost,
    profit,
    topServices,
    topCountries
  ] = await Promise.all([
    prisma.deposit.aggregate({ _sum: { amount: true }, where: paidDepositWhere }),
    prisma.order.count({ where: successfulOrderWhere }),
    prisma.balanceLog.aggregate({ _sum: { amount: true }, where: refundWhere }),
    prisma.order.aggregate({ _sum: { sellPrice: true }, where: successfulOrderWhere }),
    prisma.order.aggregate({ _sum: { providerCost: true }, where: successfulOrderWhere }),
    prisma.order.aggregate({ _sum: { profit: true }, where: successfulOrderWhere }),
    prisma.order.groupBy({
      by: ['serviceName'],
      where: successfulOrderWhere,
      _count: { serviceName: true },
      orderBy: { _count: { serviceName: 'desc' } },
      take: 1
    }),
    prisma.order.groupBy({
      by: ['countryName'],
      where: successfulOrderWhere,
      _count: { countryName: true },
      orderBy: { _count: { countryName: 'desc' } },
      take: 1
    })
  ]);

  return {
    period: range.period,
    totalDeposit: totalDeposit._sum.amount || 0n,
    successfulOrders,
    refundAmount: refundAmount._sum.amount ? refundAmount._sum.amount * -1n : 0n,
    revenue: revenue._sum.sellPrice || 0n,
    providerCost: providerCost._sum.providerCost || 0n,
    grossProfit: profit._sum.profit || 0n,
    topService: topServices[0]?.serviceName || '-',
    topCountry: topCountries[0]?.countryName || '-'
  };
}

module.exports = { buildReport, getPeriodRange };
