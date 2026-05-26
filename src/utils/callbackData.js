const { nanoid } = require('nanoid');
const { redis } = require('../config/redis');

const PREFIX = 'cbtoken:';

function buildCallback(parts) {
  return parts.filter((part) => part !== undefined && part !== null).join(':');
}

function parseCallback(data) {
  return String(data || '').split(':');
}

async function createCallbackToken(payload, ttlSeconds = 600) {
  const token = nanoid(10);
  await redis.set(`${PREFIX}${token}`, JSON.stringify(payload), 'EX', ttlSeconds);
  return token;
}

async function consumeCallbackToken(token) {
  const key = `${PREFIX}${token}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  await redis.del(key);
  return JSON.parse(raw);
}

async function readCallbackToken(token) {
  const raw = await redis.get(`${PREFIX}${token}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

module.exports = { buildCallback, parseCallback, createCallbackToken, consumeCallbackToken, readCallbackToken };
