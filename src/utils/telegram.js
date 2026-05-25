function isMessageNotModified(error) {
  return (
    error?.response?.error_code === 400 &&
    String(error.response.description || '').includes('message is not modified')
  );
}

async function safeEditMessageText(ctx, text, extra) {
  try {
    return await ctx.editMessageText(text, extra);
  } catch (error) {
    if (isMessageNotModified(error)) {
      return ctx.answerCbQuery().catch(() => null);
    }
    throw error;
  }
}

async function safeEditMessageContent(ctx, text, extra) {
  const hasPlainText = Boolean(ctx.callbackQuery?.message?.text);
  const hasCaption = Boolean(ctx.callbackQuery?.message?.caption || ctx.callbackQuery?.message?.photo);
  try {
    if (hasPlainText) return await ctx.editMessageText(text, extra);
    if (hasCaption) return await ctx.editMessageCaption(text, extra);
    return await ctx.editMessageText(text, extra);
  } catch (error) {
    if (isMessageNotModified(error)) {
      return ctx.answerCbQuery().catch(() => null);
    }
    throw error;
  }
}

async function safeReplaceMessage(ctx, text, extra) {
  const isMediaMessage = Boolean(ctx.callbackQuery?.message?.photo);
  if (!isMediaMessage) return safeEditMessageContent(ctx, text, extra);

  await ctx.deleteMessage().catch(() => null);
  return ctx.reply(text, extra);
}

module.exports = { isMessageNotModified, safeEditMessageText, safeEditMessageContent, safeReplaceMessage };
