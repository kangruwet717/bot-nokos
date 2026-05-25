const { getPeriodRange } = require('../src/services/report.service');

describe('report service', () => {
  it('normalizes unknown period to today', () => {
    expect(getPeriodRange('weekly').period).toBe('today');
  });

  it('supports month period', () => {
    expect(getPeriodRange('month').period).toBe('month');
  });
});
