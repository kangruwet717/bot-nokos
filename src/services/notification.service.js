let botInstance = null;

function setBot(bot) {
  botInstance = bot;
}

async function notifyTelegram(telegramId, text, extra = {}) {
  if (!botInstance) return false;
  try {
    await botInstance.telegram.sendMessage(Number(telegramId), text, extra);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { setBot, notifyTelegram };
