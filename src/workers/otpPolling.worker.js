const { Worker } = require('bullmq');
const env = require('../config/env');
const logger = require('../utils/logger');
const prisma = require('../config/prisma');
const { createRedis } = require('../config/redis');
const { otpPollingQueue } = require('../config/queue');
const orderService = require('../services/order.service');
const OrderStatus = require('../constants/orderStatus');

function createOtpPollingWorker() {
  const worker = new Worker(
    'otp-polling',
    async (job) => {
      const { orderId } = job.data;
      const order = await orderService.checkOrderOtp(orderId);
      if (order.status === OrderStatus.WAITING_SMS) {
        await otpPollingQueue.add(
          'poll',
          { orderId },
          { delay: env.OTP_POLL_INTERVAL_SECONDS * 1000, attempts: 1, removeOnComplete: true }
        );
      }
      await orderService.expireTimedOutOrders();
    },
    { connection: createRedis() }
  );

  worker.on('failed', (job, error) => logger.error({ jobId: job?.id, error }, 'otp polling failed'));
  worker.on('completed', (job) => logger.debug({ jobId: job.id }, 'otp polling completed'));
  return worker;
}

if (require.main === module) {
  const worker = createOtpPollingWorker();

  process.once('SIGINT', async () => {
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  });

  process.once('SIGTERM', async () => {
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}

module.exports = { createOtpPollingWorker };
