const prisma = require('../config/prisma');

async function getSetting(key, defaultValue = null) {
  const setting = await prisma.setting.findUnique({ where: { key } });
  return setting?.value ?? defaultValue;
}

async function setSetting(key, value) {
  return prisma.setting.upsert({
    where: { key },
    create: { key, value: String(value) },
    update: { value: String(value) }
  });
}

async function getBooleanSetting(key, defaultValue = false) {
  const value = await getSetting(key, defaultValue ? 'true' : 'false');
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

async function setBooleanSetting(key, value) {
  return setSetting(key, value ? 'true' : 'false');
}

module.exports = {
  getSetting,
  setSetting,
  getBooleanSetting,
  setBooleanSetting
};
