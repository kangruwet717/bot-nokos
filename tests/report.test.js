const { getPeriodRange } = require('../src/services/report.service');

describe('report service', () => {
  it('normalizes unknown period to today', () => {
    expect(getPeriodRange('unknown').period).toBe('today');
  });

  it('supports day aliases', () => {
    expect(getPeriodRange('day').period).toBe('today');
    expect(getPeriodRange('daily').period).toBe('today');
  });

  it('supports week period', () => {
    expect(getPeriodRange('week').period).toBe('week');
    expect(getPeriodRange('weekly').period).toBe('week');
  });

  it('supports month period', () => {
    expect(getPeriodRange('month').period).toBe('month');
  });
});
