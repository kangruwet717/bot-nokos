const jagopay = require('../src/services/jagopay.service');

describe('jagopay service', () => {
  it('parses Indonesian amount formats', () => {
    expect(jagopay.parseAmount('10.570')).toBe(10570);
    expect(jagopay.parseAmount('Rp 10.570')).toBe(10570);
    expect(jagopay.parseAmount(10570)).toBe(10570);
  });
});
