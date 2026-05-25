const { Queue } = require('bullmq');
const { createRedis } = require('./redis');

const otpPollingQueue = new Queue('otp-polling', {
  connection: createRedis()
});

module.exports = { otpPollingQueue };
