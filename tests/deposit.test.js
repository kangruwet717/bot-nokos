const depositService = require('../src/services/deposit.service');
const jagopay = require('../src/services/jagopay.service');

describe('deposit service', () => {
  it('normalizes JagoPay create QRIS fields', () => {
    const response = {
      status: true,
      data: {
        qris_string: '000201010212',
        qris_url: 'https://api.qrserver.com/v1/create-qr-code/?data=000201',
        nominal: 10570
      }
    };
    const extracted = depositService.extractPaymentData(response);
    expect(extracted).toMatchObject({
      providerPaymentId: null,
      paymentUrl: null,
      qrImageUrl: response.data.qris_url,
      qrString: response.data.qris_string,
      totalAmount: 10570n
    });
  });

  it('normalizes JagoPay mutation records', () => {
    const mutation = jagopay.normalizeMutation({
      id: 206750644,
      kredit: '10.570',
      keterangan: 'NOBU / GOPAY',
      tanggal: '22/05/2026 21:03:58',
      status: 'IN',
      brand: { name: 'GOPAY' }
    });
    expect(mutation).toMatchObject({
      id: '206750644',
      amount: 10570,
      status: 'IN',
      description: 'NOBU / GOPAY',
      brand: 'GOPAY'
    });
  });

  it('matches paid mutations by exact unique total amount', () => {
    const deposit = { totalAmount: 10037n };
    expect(jagopay.isPaidMutationForDeposit({ amount: 10037, status: 'IN' }, deposit)).toBe(true);
    expect(jagopay.isPaidMutationForDeposit({ amount: 10000, status: 'IN' }, deposit)).toBe(false);
    expect(jagopay.isPaidMutationForDeposit({ amount: 10037, status: 'OUT' }, deposit)).toBe(false);
  });
});
