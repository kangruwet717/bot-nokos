const express = require('express');
const prisma = require('../config/prisma');
const { redis } = require('../config/redis');

const router = express.Router();

async function checkDb() {
  await prisma.$queryRaw`SELECT 1`;
  return 'ok';
}

async function checkRedis() {
  const pong = await redis.ping();
  return pong === 'PONG' ? 'ok' : 'error';
}

router.get('/', async (req, res) => {
  const checks = { db: 'unknown', redis: 'unknown' };
  try {
    checks.db = await checkDb();
  } catch (_) {
    checks.db = 'error';
  }
  try {
    checks.redis = await checkRedis();
  } catch (_) {
    checks.redis = 'error';
  }

  const status = Object.values(checks).every((value) => value === 'ok') ? 'ok' : 'degraded';
  res.status(status === 'ok' ? 200 : 503).json({ status, uptime: process.uptime(), checks });
});

module.exports = router;
