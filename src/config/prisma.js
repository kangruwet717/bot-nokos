const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' }
  ]
});

prisma.$on('error', (event) => logger.error({ event }, 'prisma error'));
prisma.$on('warn', (event) => logger.warn({ event }, 'prisma warning'));

module.exports = prisma;
