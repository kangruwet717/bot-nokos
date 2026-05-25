const env = require('../config/env');

function calculateSellPrice(providerCost, options = {}) {
  const cost = Number(providerCost);
  const markupType = options.markupType || env.DEFAULT_MARKUP_TYPE;
  const markupValue = Number(options.markupValue ?? env.DEFAULT_MARKUP_VALUE);
  const minProfit = Number(options.minProfit ?? env.DEFAULT_MIN_PROFIT);
  const roundingUnit = Number(options.roundingUnit ?? env.ORDER_ROUNDING_UNIT);

  let sellPrice = markupType === 'percent' ? cost + cost * (markupValue / 100) : cost + markupValue;

  if (sellPrice - cost < minProfit) {
    sellPrice = cost + minProfit;
  }

  sellPrice = Math.ceil(sellPrice / roundingUnit) * roundingUnit;

  return {
    providerCost: Math.round(cost),
    sellPrice: Math.round(sellPrice),
    profit: Math.round(sellPrice - cost)
  };
}

module.exports = { calculateSellPrice };
