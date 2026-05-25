const axios = require('axios');
const env = require('../config/env');

function assertConfigured() {
  if (env.DATA_MODE !== 'api') return;
  if (!env.BACKEND_API_URL || !env.BACKEND_API_SECRET) {
    throw new Error('BACKEND_API_URL dan BACKEND_API_SECRET wajib diisi saat DATA_MODE=api');
  }
}

function client() {
  assertConfigured();
  return axios.create({
    baseURL: `${env.BACKEND_API_URL.replace(/\/$/, '')}/api/bot`,
    timeout: 30000,
    headers: { 'X-Bot-Api-Secret': env.BACKEND_API_SECRET }
  });
}

async function request(method, path, data = null, config = {}) {
  const response = await client().request({ method, url: path, data, ...config });
  if (!response.data?.ok) {
    const error = new Error(response.data?.error?.message || 'Backend API error');
    error.code = response.data?.error?.code || 'BACKEND_API_ERROR';
    throw error;
  }
  return response.data.data;
}

module.exports = {
  request,
  upsertUser: (from) =>
    request('post', '/users/upsert', {
      telegramId: from.id,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name
    }),
  getSummary: (telegramId) => request('get', `/users/${telegramId}/summary`),
  acceptTos: (telegramId) => request('post', `/users/${telegramId}/tos/accept`),
  createBindCode: (from) =>
    request('post', '/bind-code', {
      telegramId: from.id,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name
    }),
  listCountries: (q = '') => request('get', '/countries', null, { params: { q } }),
  listServices: (q = '') => request('get', '/services', null, { params: { q } }),
  quoteOrder: (payload) => request('post', '/orders/quote', payload),
  createOrder: (payload) => request('post', '/orders', payload),
  checkOrder: (orderId) => request('post', `/orders/${orderId}/check`),
  cancelOrder: (orderId, telegramId) => request('post', `/orders/${orderId}/cancel`, { telegramId }),
  createDeposit: (payload) => request('post', '/deposits', payload),
  checkDeposit: (depositId) => request('post', `/deposits/${depositId}/check`),
  orderHistory: (telegramId, limit = 10) => request('get', '/history/orders', null, { params: { telegramId, limit } }),
  depositHistory: (telegramId, limit = 10) => request('get', '/history/deposits', null, { params: { telegramId, limit } })
};
