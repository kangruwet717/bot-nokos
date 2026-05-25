const { calculateSellPrice } = require('../src/services/pricing.service');

describe('pricing service', () => {
  it('calculates flat markup and rounding', () => {
    expect(calculateSellPrice(5800, { markupType: 'flat', markupValue: 2000, minProfit: 1000, roundingUnit: 100 })).toEqual({
      providerCost: 5800,
      sellPrice: 7800,
      profit: 2000
    });
  });

  it('enforces minimum profit', () => {
    expect(calculateSellPrice(5800, { markupType: 'flat', markupValue: 200, minProfit: 1000, roundingUnit: 100 }).sellPrice).toBe(6800);
  });
});
