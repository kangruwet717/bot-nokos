const crypto = require('crypto');

function hmacSha256Hex(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function safeEqualHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

module.exports = { hmacSha256Hex, safeEqualHex };
