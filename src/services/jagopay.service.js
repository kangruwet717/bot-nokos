const axios = require('axios');
const env = require('../config/env');

const TRANSIENT_CODES = new Set(['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']);
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function apiUrl() {
  return `${env.JAGOPAY_BASE_URL.replace(/\/$/, '')}/api.php`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientAxiosError(error) {
  const status = error.response?.status;
  return TRANSIENT_CODES.has(error.code) || TRANSIENT_STATUSES.has(status);
}

function normalizeRequestError(error, action) {
  if (!axios.isAxiosError(error)) return error;

  const status = error.response?.status;
  const code = error.code || null;
  const detail = status ? `status ${status}` : code || error.message;
  const wrapped = new Error(`JagoPay ${action} failed: ${detail}`);
  wrapped.name = 'JagoPayRequestError';
  wrapped.code = code;
  wrapped.status = status;
  wrapped.action = action;
  wrapped.isTransient = isTransientAxiosError(error);
  return wrapped;
}

async function request(action, params = {}, options = {}) {
  const attempts = options.attempts || 3;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await axios.request({
        method: options.method || 'GET',
        url: apiUrl(),
        params: { apikey: env.JAGOPAY_API_KEY, action, ...params },
        data: options.data,
        headers: options.headers,
        timeout: 15000
      });
      return response.data;
    } catch (error) {
      lastError = normalizeRequestError(error, action);
      if (!lastError.isTransient || attempt >= attempts) break;
      await sleep(500 * attempt);
    }
  }

  throw lastError;
}

function assertSuccess(response, fallbackMessage) {
  if (response?.status === true || response?.success === true) return response;
  const message = response?.message || fallbackMessage || 'JagoPay request failed';
  const error = new Error(message);
  error.responseBody = response;
  throw error;
}

function parseAmount(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Math.round(value);
  const text = String(value).trim();
  if (!text) return 0;
  const cleaned = text.replace(/[^\d.,-]/g, '');
  const normalized =
    cleaned.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(cleaned)
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned;
  const number = Number(normalized);
  if (Number.isFinite(number)) return Math.round(number);
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function extractPaymentData(response) {
  const data = response?.data || response || {};
  return {
    providerPaymentId: data.id ? String(data.id) : null,
    qrImageUrl: data.qris_url || data.qr_url || data.qrImageUrl || data.qr_image_url || null,
    qrString: data.qris_string || data.qrString || data.qr_string || data.qris || null,
    nominal: parseAmount(data.nominal),
    rawResponse: response
  };
}

function normalizeMutation(record) {
  const amount = parseAmount(record?.kredit || record?.amount || record?.nominal || record?.jumlah);
  const date = record?.tanggal || record?.date || record?.created_at || null;
  return {
    id: record?.id ? String(record.id) : null,
    amount,
    status: String(record?.status || '').toUpperCase(),
    description: record?.keterangan || record?.description || null,
    date,
    paidAt: parseMutationDate(date),
    brand: record?.brand?.name || record?.brand || null,
    raw: record
  };
}

function parseMutationDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  const localMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localMatch) {
    const [, day, month, year, hour, minute, second = '0'] = localMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function createDynamicQris(nominal) {
  const response = await request('qris_dinamis', { nominal: Number(nominal) });
  assertSuccess(response, 'Gagal generate QRIS JagoPay');
  return extractPaymentData(response);
}

async function getMutations(page = 1) {
  const response = await request('qris_mutasi', { page });
  assertSuccess(response, 'Gagal mengambil mutasi JagoPay');
  const mutations = response?.data?.mutasi || response?.mutasi || [];
  return {
    mutations: Array.isArray(mutations) ? mutations.map(normalizeMutation) : [],
    rawResponse: response
  };
}

async function requestOtp(username, password) {
  return request('request_otp', {}, { method: 'POST', data: new URLSearchParams({ username, password }) });
}

async function verifyOtp(otp) {
  return request('verify_otp', {}, { method: 'POST', data: new URLSearchParams({ otp }) });
}

function isPaidMutationForDeposit(mutation, deposit) {
  if (!mutation || mutation.status !== 'IN') return false;
  if (BigInt(mutation.amount) !== deposit.totalAmount) return false;
  if (!deposit.createdAt || !mutation.paidAt) return true;
  return mutation.paidAt.getTime() >= new Date(deposit.createdAt).getTime() - 2 * 60 * 1000;
}

module.exports = {
  createDynamicQris,
  getMutations,
  requestOtp,
  verifyOtp,
  extractPaymentData,
  normalizeMutation,
  parseMutationDate,
  parseAmount,
  isPaidMutationForDeposit
};
