const SmsBowerProvider = require('../src/providers/smsbower.provider');

describe('smsbower provider parser', () => {
  it('maps received SMS status', async () => {
    const provider = new SmsBowerProvider();
    provider.request = async () => "STATUS_OK:'12345'";
    await expect(provider.checkActivationStatus('1')).resolves.toMatchObject({
      status: 'SMS_RECEIVED',
      otpCode: '12345'
    });
  });

  it('maps wait retry status with last code as received SMS', async () => {
    const provider = new SmsBowerProvider();
    provider.request = async () => 'STATUS_WAIT_RETRY:149671';
    await expect(provider.checkActivationStatus('1')).resolves.toMatchObject({
      status: 'SMS_RECEIVED',
      otpCode: '149671'
    });
  });

  it('maps cancel response', async () => {
    const provider = new SmsBowerProvider();
    provider.request = async () => 'ACCESS_CANCEL';
    await expect(provider.cancelActivation('1')).resolves.toMatchObject({ ok: true });
  });

  it('maps request another SMS response', async () => {
    const provider = new SmsBowerProvider();
    provider.request = async () => 'ACCESS_RETRY_GET';
    await expect(provider.requestAnotherSms('1')).resolves.toMatchObject({ ok: true });
  });

  it('uses getNumberV2 for activation', async () => {
    const provider = new SmsBowerProvider();
    provider.request = async (action) => {
      expect(action).toBe('getNumberV2');
      return { activationId: '10', phoneNumber: '628123', activationCost: 1.2 };
    };

    await expect(provider.createActivation('wa', '6', 2)).resolves.toMatchObject({
      activationId: '10',
      phoneNumber: '628123',
      cost: 1.2
    });
  });

  it('converts provider USD price to IDR', async () => {
    const provider = new SmsBowerProvider();
    provider.request = async () => ({ 6: { wa: { cost: 0.4, count: 10 } } });

    await expect(provider.getPrices('wa', '6')).resolves.toMatchObject({
      cost: 6800,
      providerCost: 0.4,
      providerCurrency: 'USD',
      count: 10
    });
  });

  it('parses V3 price options', async () => {
    const provider = new SmsBowerProvider();
    provider.request = async () => ({
      6: {
        wa: {
          1170: { count: 1, price: 0.128, provider_id: 1170 },
          3109: { count: 3000, price: 0.163, provider_id: 3109 }
        }
      }
    });

    await expect(provider.getPriceOptions('wa', '6')).resolves.toMatchObject([
      { providerId: '1170', providerCost: 0.128, cost: 2176, count: 1 },
      { providerId: '3109', providerCost: 0.163, cost: 2771, count: 3000 }
    ]);
  });

  it('falls back to getPrices when V3 price options time out', async () => {
    const provider = new SmsBowerProvider();
    const timeout = new Error('timeout');
    timeout.code = 'ECONNABORTED';
    let calls = 0;
    provider.request = async (action) => {
      calls += 1;
      if (action === 'getPricesV3') throw timeout;
      return { 6: { wa: { cost: 0.1, count: 12 } } };
    };

    await expect(provider.getPriceOptions('wa', '6')).resolves.toMatchObject([
      { providerId: 'any', providerCost: 0.1, cost: 1700, count: 12, isFallback: true }
    ]);
    expect(calls).toBe(2);
  });

  it('does not retry price fallback when host connection times out', async () => {
    const provider = new SmsBowerProvider();
    const timeout = new Error('connect ETIMEDOUT 116.203.15.192:443');
    timeout.code = 'ECONNABORTED';
    let calls = 0;
    provider.request = async () => {
      calls += 1;
      throw timeout;
    };

    await expect(provider.getPriceOptions('wa', '6')).rejects.toThrow('connect ETIMEDOUT');
    expect(calls).toBe(1);
  });

  it('tries fallback base URL when the primary endpoint times out', async () => {
    const provider = new SmsBowerProvider({
      baseUrl: 'https://primary.example/stubs/handler_api.php',
      fallbackBaseUrls: ['https://fallback.example/stubs/handler_api.php']
    });
    const timeout = new Error('connect ETIMEDOUT');
    timeout.code = 'ETIMEDOUT';
    const calls = [];
    provider.requestWithBaseUrl = async (baseUrl) => {
      calls.push(baseUrl);
      if (baseUrl.includes('primary')) throw timeout;
      return 'ACCESS_BALANCE:1.23';
    };

    await expect(provider.getBalance()).resolves.toBe(1.23);
    expect(calls).toEqual([
      'https://primary.example/stubs/handler_api.php',
      'https://fallback.example/stubs/handler_api.php'
    ]);
  });
});
