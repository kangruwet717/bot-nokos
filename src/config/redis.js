const Redis = require('ioredis');
const env = require('./env');

function createRedis() {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });
}

const redis = createRedis();

module.exports = { redis, createRedis };
