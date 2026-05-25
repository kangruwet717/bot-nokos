const prisma = require('../config/prisma');
const env = require('../config/env');
const SmsBowerProvider = require('../providers/smsbower.provider');
const { stringifyJsonField } = require('../utils/jsonField');

const providers = {
  smsbower: new SmsBowerProvider()
};

function getProvider(name = env.OTP_PROVIDER) {
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown OTP provider: ${name}`);
  return provider;
}

async function logProvider({ provider, action, requestPayload = null, responseBody = null, statusCode = null, isError = false, errorMessage = null, relatedOrderId = null }) {
  return prisma.providerLog.create({
    data: {
      provider,
      action,
      requestPayload: stringifyJsonField(requestPayload),
      responseBody: stringifyJsonField(responseBody),
      statusCode,
      isError,
      errorMessage,
      relatedOrderId
    }
  });
}

async function callProvider(action, args = [], providerName = env.OTP_PROVIDER, relatedOrderId = null) {
  const provider = getProvider(providerName);
  try {
    const result = await provider[action](...args);
    await logProvider({
      provider: providerName,
      action,
      requestPayload: { args },
      responseBody: result?.raw !== undefined ? { raw: result.raw } : result,
      relatedOrderId
    });
    return result;
  } catch (error) {
    await logProvider({
      provider: providerName,
      action,
      requestPayload: { args },
      responseBody: error.response?.data ? { raw: error.response.data } : null,
      statusCode: error.response?.status || null,
      isError: true,
      errorMessage: error.message,
      relatedOrderId
    });
    throw error;
  }
}

module.exports = { getProvider, callProvider, logProvider };
