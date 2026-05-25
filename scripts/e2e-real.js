const env = require('../src/config/env');
const prisma = require('../src/config/prisma');
const { redis } = require('../src/config/redis');
const jagopay = require('../src/services/jagopay.service');
const depositService = require('../src/services/deposit.service');
const providerService = require('../src/services/provider.service');

function mask(value) {
  if (!value) return null;
  const text = String(value);
  if (text.length <= 10) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 6)}***${text.slice(-4)}`;
}

async function ensureE2EUser() {
  const adminId = Number(String(env.ADMIN_IDS).split(',')[0] || '900000000001');
  return prisma.user.upsert({
    where: { telegramId: BigInt(adminId) },
    create: {
      telegramId: BigInt(adminId),
      firstName: 'E2E',
      username: 'e2e_admin',
      referralCode: `e2e${Date.now()}`
    },
    update: {}
  });
}

async function runJagoPay() {
  console.log('\n[JagoPay] create QRIS invoice');
  const user = await ensureE2EUser();
  const amount = Number(process.env.E2E_DEPOSIT_AMOUNT || env.MIN_DEPOSIT);
  const deposit = await depositService.createDepositInvoice(user, amount);
  console.log({
    depositId: deposit.id,
    reference: deposit.reference,
    amount: Number(deposit.amount),
    uniqueCode: Number(deposit.fee),
    totalAmount: Number(deposit.totalAmount),
    status: deposit.status,
    providerPaymentId: deposit.providerPaymentId,
    hasQrString: Boolean(deposit.qrString),
    qrImageUrl: deposit.qrImageUrl,
    expiredAt: deposit.expiredAt
  });

  console.log('\n[JagoPay] latest QRIS mutations');
  const mutations = await jagopay.getMutations(1);
  console.log({
    count: mutations.mutations.length,
    first: mutations.mutations[0] || null
  });

  const waitSeconds = Number(process.env.E2E_WAIT_PAID_SECONDS || 0);
  if (waitSeconds > 0) {
    console.log(`\n[JagoPay] waiting up to ${waitSeconds}s for real payment`);
    const deadline = Date.now() + waitSeconds * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const synced = await depositService.syncDepositStatus(deposit.id, user.id);
      console.log({ reference: synced.reference, status: synced.status, paidAt: synced.paidAt });
      if (synced.status === 'PAID') break;
    }
  } else {
    console.log('\n[JagoPay] paid flow skipped. Set E2E_WAIT_PAID_SECONDS and pay the QRIS to test PAID polling.');
  }
}

async function runSmsBower() {
  console.log('\n[SMSBower] balance');
  const balance = await providerService.callProvider('getBalance');
  console.log({ balance });

  console.log('\n[SMSBower] countries/services');
  const [countries, services] = await Promise.all([
    providerService.callProvider('getCountries'),
    providerService.callProvider('getServices')
  ]);
  console.log({
    countriesCount: countries.length,
    servicesCount: services.length,
    firstCountry: countries[0],
    firstService: services[0]
  });

  const service = process.env.E2E_SMS_SERVICE || 'wa';
  const country = process.env.E2E_SMS_COUNTRY || '6';
  console.log(`\n[SMSBower] prices service=${service} country=${country}`);
  const price = await providerService.callProvider('getPrices', [service, country]);
  console.log({
    providerCost: price.providerCost,
    providerCurrency: price.providerCurrency,
    convertedCostIdr: price.cost,
    count: price.count,
    rawKeys: Object.keys(price.raw || {})
  });

  if (process.env.E2E_CREATE_ACTIVATION !== 'true') {
    console.log('\n[SMSBower] create activation skipped. Set E2E_CREATE_ACTIVATION=true to buy a real number.');
    return;
  }

  if (!price.count) throw new Error('No stock for requested E2E service/country');
  console.log(`\n[SMSBower] creating real activation, maxPrice=${price.providerCost ?? price.cost}`);
  const activation = await providerService.callProvider('createActivation', [service, country, price.providerCost ?? price.cost]);
  console.log({
    activationId: activation.activationId,
    phoneNumber: mask(activation.phoneNumber),
    cost: activation.cost || price.cost
  });

  const status = await providerService.callProvider('checkActivationStatus', [activation.activationId]);
  console.log({ activationStatus: status.status, otpCode: mask(status.otpCode), smsText: status.smsText });

  if (process.env.E2E_CANCEL_ACTIVATION !== 'false') {
    const cancel = await providerService.callProvider('cancelActivation', [activation.activationId]);
    console.log({ cancelled: cancel.ok, message: cancel.message, earlyDenied: cancel.earlyDenied });
  }
}

async function main() {
  console.log({
    jagopayBaseUrl: env.JAGOPAY_BASE_URL,
    jagopayApiKey: mask(env.JAGOPAY_API_KEY),
    smsbowerBaseUrl: env.SMSBOWER_BASE_URL,
    smsbowerApiKey: mask(env.SMSBOWER_API_KEY),
    minDeposit: env.MIN_DEPOSIT,
    depositAmount: Number(process.env.E2E_DEPOSIT_AMOUNT || env.MIN_DEPOSIT),
    smsService: process.env.E2E_SMS_SERVICE || 'wa',
    smsCountry: process.env.E2E_SMS_COUNTRY || '6'
  });

  const target = process.argv[2] || 'all';
  if (target === 'all' || target === 'jagopay') await runJagoPay();
  if (target === 'all' || target === 'smsbower') await runSmsBower();
}

main()
  .catch((error) => {
    console.error({
      message: error.message,
      statusCode: error.response?.status || null,
      response: error.response?.data || error.responseBody || null
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await redis.quit();
  });
