const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().url().optional(),
  BOT_TOKEN: z.string().default(''),
  BOT_MODE: z.enum(['webhook', 'polling']).default('polling'),
  DATA_MODE: z.enum(['local', 'api']).default('local'),
  BACKEND_API_URL: z.string().url().optional(),
  BACKEND_API_SECRET: z.string().default(''),
  TELEGRAM_WEBHOOK_SECRET: z.string().default(''),
  TELEGRAM_CHANNEL_ID: z.string().default(''),
  ADMIN_IDS: z.string().default(''),
  SUPPORT_USERNAME: z.string().default('@admin'),
  SUPPORT_HOUR: z.string().default('09.00-21.00 WIB'),
  DATABASE_URL: z.string().default('file:./data/botnokos.db'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JAGOPAY_BASE_URL: z.string().url().default('https://jagopay.my.id'),
  JAGOPAY_API_KEY: z.string().default(''),
  JAGOPAY_DEFAULT_METHOD: z.string().default('QRIS'),
  JAGOPAY_UNIQUE_CODE_MAX: z.coerce.number().int().nonnegative().default(999),
  JAGOPAY_INVOICE_TTL_MINUTES: z.coerce.number().int().positive().default(1440),
  JAGOPAY_MUTATION_SCAN_PAGES: z.coerce.number().int().positive().default(1),
  OTP_PROVIDER: z.string().default('smsbower'),
  SMSBOWER_BASE_URL: z.string().url().default('https://smsbower.com/stubs/handler_api.php'),
  SMSBOWER_FALLBACK_BASE_URLS: z.string().default('https://smsbower.org/stubs/handler_api.php,https://smsbower.page/stubs/handler_api.php'),
  SMSBOWER_API_KEY: z.string().default(''),
  SMSBOWER_WEBHOOK_ALLOWED_IPS: z.string().default('167.235.198.205'),
  SMSBOWER_USD_TO_IDR_RATE: z.coerce.number().positive().default(17000),
  SMSBOWER_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  MIN_DEPOSIT: z.coerce.number().int().nonnegative().default(10000),
  MAX_DEPOSIT: z.coerce.number().int().positive().default(10000000),
  ORDER_ROUNDING_UNIT: z.coerce.number().int().positive().default(100),
  DEFAULT_MARKUP_TYPE: z.enum(['flat', 'percent']).default('flat'),
  DEFAULT_MARKUP_VALUE: z.coerce.number().int().nonnegative().default(2000),
  DEFAULT_MIN_PROFIT: z.coerce.number().int().nonnegative().default(1000),
  MAX_ACTIVE_ORDERS_PER_USER: z.coerce.number().int().positive().default(2),
  MAX_BULK_ORDER_QUANTITY: z.coerce.number().int().positive().max(10).default(5),
  MAX_ORDERS_PER_HOUR: z.coerce.number().int().positive().default(10),
  MAX_DEPOSITS_PER_HOUR: z.coerce.number().int().positive().default(6),
  MAX_CALLBACKS_PER_MINUTE: z.coerce.number().int().positive().default(60),
  MAX_PENDING_DEPOSITS_PER_USER: z.coerce.number().int().positive().default(3),
  OTP_POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(10),
  OTP_ORDER_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(20),
  CATALOG_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  START_EMBEDDED_WORKER: z
    .string()
    .transform((value) => !['false', '0', 'no'].includes(String(value).toLowerCase()))
    .default('true'),
  LOG_LEVEL: z.string().default('info')
});

const result = schema.safeParse(process.env);
if (!result.success) {
  const details = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

const env = result.data;

env.ADMIN_ID_SET = new Set(
  env.ADMIN_IDS.split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => Number(id))
);

env.SMSBOWER_WEBHOOK_ALLOWED_IP_SET = new Set(
  env.SMSBOWER_WEBHOOK_ALLOWED_IPS.split(',')
    .map((ip) => ip.trim())
    .filter(Boolean)
);

env.SMSBOWER_FALLBACK_BASE_URL_LIST = env.SMSBOWER_FALLBACK_BASE_URLS.split(',')
  .map((url) => url.trim())
  .filter(Boolean);

module.exports = env;
