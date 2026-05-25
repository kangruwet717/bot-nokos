const { redis } = require('../config/redis');

async function hitLimit(key, limit, windowSeconds) {
  const current = await redis.incr(key);
  if (current === 1) await redis.expire(key, windowSeconds);
  return current > limit;
}

module.exports = { hitLimit };
