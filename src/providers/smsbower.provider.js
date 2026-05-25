const axios = require('axios');
const BaseProvider = require('./base.provider');
const env = require('../config/env');

function shouldFallbackPriceOptions(error) {
  return error?.code === 'ECONNABORTED' && !String(error.message || '').includes('connect ETIMEDOUT');
}

function parseAccessPair(text, prefix) {
  const value = String(text || '');
  if (!value.startsWith(prefix)) return null;
  return value.slice(prefix.length).split(':');
}

class SmsBowerProvider extends BaseProvider {
  constructor(options = {}) {
    super();
    this.baseUrl = options.baseUrl || env.SMSBOWER_BASE_URL;
    this.fallbackBaseUrls = options.fallbackBaseUrls || env.SMSBOWER_FALLBACK_BASE_URL_LIST;
    this.apiKey = options.apiKey || env.SMSBOWER_API_KEY;
    this.name = 'smsbower';
  }

  async requestWithBaseUrl(baseUrl, action, params = {}) {
    const response = await axios.get(baseUrl, {
      params: { api_key: this.apiKey, action, ...params },
      timeout: env.SMSBOWER_TIMEOUT_MS
    });
    return response.data;
  }

  async request(action, params = {}) {
    const baseUrls = [this.baseUrl, ...this.fallbackBaseUrls].filter(Boolean);
    let lastError;
    for (const baseUrl of baseUrls) {
      try {
        return await this.requestWithBaseUrl(baseUrl, action, params);
      } catch (error) {
        lastError = error;
        if (!['ECONNABORTED', 'ETIMEDOUT'].includes(error.code) && !String(error.message || '').includes('ETIMEDOUT')) {
          throw error;
        }
      }
    }
    throw lastError;
  }

  async getBalance() {
    const data = await this.request('getBalance');
    const parsed = parseAccessPair(data, 'ACCESS_BALANCE:');
    if (!parsed) throw new Error(String(data));
    return Number(parsed[0]);
  }

  async getCountries() {
    const data = await this.request('getCountries');
    return Object.values(data || {}).map((country) => ({
      code: String(country.id),
      name: country.eng || country.rus || String(country.id),
      raw: country
    }));
  }

  async getServices() {
    const data = await this.request('getServicesList');
    return (data.services || []).map((service) => ({
      code: service.code,
      name: service.name,
      raw: service
    }));
  }

  async getPrices(service, country) {
    const data = await this.request('getPrices', { service, country });
    const record = data?.[country]?.[service];
    if (!record) return { cost: 0, count: 0, raw: data };
    const providerCost = Number(record.cost || 0);
    return {
      cost: Math.ceil(providerCost * env.SMSBOWER_USD_TO_IDR_RATE),
      providerCost,
      currency: 'IDR',
      providerCurrency: 'USD',
      count: Number(record.count || 0),
      raw: data
    };
  }

  async getPriceOptions(service, country) {
    let data;
    try {
      data = await this.request('getPricesV3', { service, country });
    } catch (error) {
      if (!shouldFallbackPriceOptions(error)) throw error;
      const fallback = await this.getPrices(service, country);
      if (!fallback.count || !fallback.providerCost) return [];
      return [
        {
          providerId: 'any',
          providerCost: fallback.providerCost,
          cost: fallback.cost,
          count: fallback.count,
          providerCurrency: fallback.providerCurrency,
          currency: fallback.currency,
          isFallback: true,
          raw: fallback.raw
        }
      ];
    }
    const records = data?.[country]?.[service] || {};
    return Object.values(records)
      .map((record) => {
        const providerCost = Number(record.price || 0);
        return {
          providerId: String(record.provider_id || record.providerId || ''),
          providerCost,
          cost: Math.ceil(providerCost * env.SMSBOWER_USD_TO_IDR_RATE),
          count: Number(record.count || 0),
          providerCurrency: 'USD',
          currency: 'IDR',
          raw: record
        };
      })
      .filter((option) => option.providerId && option.count > 0 && option.providerCost > 0)
      .sort((a, b) => a.providerCost - b.providerCost || b.count - a.count);
  }

  async createActivation(service, country, maxPrice, options = {}) {
    try {
      return await this.createActivationV2(service, country, maxPrice, options);
    } catch (error) {
      if (!['BAD_ACTION', 'BAD_SERVICE', 'BAD_COUNTRY'].includes(error.providerCode)) throw error;
    }

    const data = await this.request('getNumber', {
      service,
      country,
      maxPrice,
      providerIds: options.providerId || options.providerIds,
      minPrice: options.minPrice
    });
    const parsed = parseAccessPair(data, 'ACCESS_NUMBER:');
    if (!parsed || parsed.length < 2) {
      const error = new Error(String(data));
      error.providerCode = String(data);
      throw error;
    }
    return {
      activationId: parsed[0],
      phoneNumber: parsed[1],
      raw: data
    };
  }

  async createActivationV2(service, country, maxPrice, options = {}) {
    const data = await this.request('getNumberV2', {
      service,
      country,
      maxPrice,
      providerIds: options.providerId || options.providerIds,
      minPrice: options.minPrice
    });
    if (typeof data === 'string') {
      const error = new Error(data);
      error.providerCode = data;
      throw error;
    }
    if (!data?.activationId || !data?.phoneNumber) {
      const error = new Error(typeof data === 'string' ? data : JSON.stringify(data));
      error.providerCode = error.message;
      throw error;
    }
    return {
      activationId: String(data.activationId),
      phoneNumber: String(data.phoneNumber),
      cost: Number(data.activationCost || 0),
      raw: data
    };
  }

  async checkActivationStatus(activationId) {
    const data = await this.request('getStatus', { id: activationId });
    const text = String(data);
    if (text.startsWith('STATUS_OK:')) {
      const otpCode = text
        .slice('STATUS_OK:'.length)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      return { status: 'SMS_RECEIVED', otpCode, smsText: text, raw: data };
    }
    if (text.startsWith('STATUS_WAIT_RETRY:')) {
      return { status: 'WAITING_SMS', lastCode: text.slice('STATUS_WAIT_RETRY:'.length), raw: data };
    }
    if (text === 'STATUS_WAIT_CODE') return { status: 'WAITING_SMS', raw: data };
    if (text === 'STATUS_CANCEL') return { status: 'CANCELLED', raw: data };
    if (text === 'NO_ACTIVATION') return { status: 'FAILED', raw: data };
    return { status: 'WAITING_SMS', raw: data };
  }

  async cancelActivation(activationId) {
    const data = await this.request('setStatus', { id: activationId, status: 8 });
    return {
      ok: String(data) === 'ACCESS_CANCEL',
      raw: data,
      message: String(data),
      earlyDenied: String(data) === 'EARLY_CANCEL_DENIED'
    };
  }

  async finishActivation(activationId) {
    const data = await this.request('setStatus', { id: activationId, status: 6 });
    return { ok: String(data) === 'ACCESS_ACTIVATION', raw: data, message: String(data) };
  }
}

module.exports = SmsBowerProvider;
