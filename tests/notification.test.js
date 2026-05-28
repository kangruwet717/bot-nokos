const {
  buildDepositChannelMessage,
  buildOrderChannelMessage,
  buildCatalogSyncChannelMessage
} = require('../src/services/notification.service');

describe('channel notifications', () => {
  it('builds deposit channel message with buyer and balance info', () => {
    const message = buildDepositChannelMessage({
      id: 'dep-1',
      reference: 'DEP-123',
      method: 'QRIS',
      amount: 15000n,
      totalAmount: 15663n,
      paidAt: new Date('2026-05-25T15:38:00.000Z'),
      user: {
        telegramId: 628583123456n,
        username: 'buyer',
        balance: 22475n
      }
    });

    expect(message).toContain('DEPOSIT BERHASIL');
    expect(message).toContain('DEP-123');
    expect(message).toContain('@buyer');
    expect(message).toContain('Rp 15.663');
    expect(message).toContain('Rp 22.475');
  });

  it('builds order channel message with nokos transaction details', () => {
    const message = buildOrderChannelMessage({
      id: 'S6-338326154',
      serviceName: 'WhatsApp',
      countryName: 'Indonesia',
      phoneNumber: '628583123456',
      otpCode: '123456',
      sellPrice: 2972n,
      smsReceivedAt: new Date('2026-05-25T15:34:00.000Z'),
      user: {
        telegramId: 628583123456n,
        firstName: 'Glerxxx'
      }
    });

    expect(message).toContain('TRANSAKSI NOKOS SELESAI');
    expect(message).toContain('WhatsApp');
    expect(message).toContain('Indonesia');
    expect(message).toContain('123456');
    expect(message).toContain('Rp 2.972');
    expect(message).toContain('Glerxxx');
  });

  it('builds provider catalog sync channel message', () => {
    const message = buildCatalogSyncChannelMessage({
      provider: 'smsbower',
      intervalMinutes: 60,
      syncedAt: new Date('2026-05-28T03:00:00.000Z'),
      before: {
        totalServices: 1000,
        activeServices: 990,
        totalCountries: 200,
        activeCountries: 198
      },
      after: {
        totalServices: 1010,
        activeServices: 1001,
        totalCountries: 203,
        activeCountries: 201
      }
    });

    expect(message).toContain('PROVIDER CATALOG SYNC');
    expect(message).toContain('smsbower');
    expect(message).toContain('1001');
    expect(message).toContain('+10');
    expect(message).toContain('Harga tetap dicek live');
  });
});
