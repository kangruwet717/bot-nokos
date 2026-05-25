const pino = require('pino');
const env = require('../config/env');

const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' }
        },
  redact: {
    paths: [
      '*.api_key',
      '*.apiKey',
      '*.apikey',
      '*.authorization',
      '*.headers.authorization',
      'error.config.params.api_key',
      'error.config.headers.Authorization',
      'error.config.headers.authorization'
    ],
    censor: '[redacted]'
  }
});

module.exports = logger;
