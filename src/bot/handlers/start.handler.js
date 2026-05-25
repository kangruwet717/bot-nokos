const prisma = require('../../config/prisma');
const userService = require('../../services/user.service');
const { formatDateTime } = require('../../utils/date');
const { formatRupiah } = require('../../utils/money');
const { mainKeyboard, backMainKeyboard } = require('../keyboards/main.keyboard');
const messages = require('../../constants/messages');
const { safeReplaceMessage } = require('../../utils/telegram');

async function renderMainMenu(ctx) {
  const user = ctx.state.user || (await userService.findOrCreateTelegramUser(ctx.from));
  const totalUser = await prisma.user.count();
  const text = `Halo ${user.firstName || 'User'}\n${formatDateTime()}\n\nUser Info:\n- ID: ${user.telegramId}\n- Saldo: ${formatRupiah(user.balance)}\n\nBOT Stats:\n- Total User: ${totalUser}\n\nSilakan pilih menu di bawah ini:`;
  if (ctx.callbackQuery) return safeReplaceMessage(ctx, text, mainKeyboard()).catch(() => ctx.reply(text, mainKeyboard()));
  return ctx.reply(text, mainKeyboard());
}

function registerStartHandlers(bot) {
  bot.start(renderMainMenu);
  bot.command('saldo', async (ctx) => {
    const user = await userService.getByTelegramId(ctx.from.id);
    return ctx.reply(`Saldo kamu: ${formatRupiah(user?.balance || 0)}`);
  });
  bot.command('tos', (ctx) => ctx.reply(messages.tos, backMainKeyboard()));
  bot.command('help', (ctx) =>
    ctx.reply(
      'Bantuan\n\n/start - menu utama\n/saldo - cek saldo\n/tos - Terms of Service\n\nGunakan tombol menu untuk deposit, order, histori, dan bantuan CS.',
      backMainKeyboard()
    )
  );
  bot.action('MAIN', renderMainMenu);
  bot.action('menu_home', renderMainMenu);
  bot.action('HELP:HOW', (ctx) =>
    safeReplaceMessage(
      ctx,
      'Cara Pakai\n\n1. Deposit saldo terlebih dahulu.\n2. Pilih negara.\n3. Pilih layanan.\n4. Pastikan stok tersedia.\n5. Klik order.\n6. Gunakan nomor sesuai kebutuhan legal.\n7. Tunggu OTP masuk.\n8. Jika gagal dan memenuhi aturan refund, klik batalkan.',
      backMainKeyboard()
    )
  );
  bot.action('HELP:CS', (ctx) => safeReplaceMessage(ctx, messages.support, backMainKeyboard()));
  bot.action('REF:MENU', (ctx) => {
    const code = ctx.state.user?.referralCode || '-';
    return safeReplaceMessage(ctx, `Undang Teman\n\nKode referral kamu: ${code}\nFitur komisi segera hadir.`, backMainKeyboard());
  });
  bot.action('TOS:ACCEPT', async (ctx) => {
    ctx.state.user = await userService.acceptTos(ctx.from.id);
    return safeReplaceMessage(ctx, 'Terima kasih. Kamu sudah menyetujui Terms of Service.', backMainKeyboard());
  });
}

module.exports = { registerStartHandlers, renderMainMenu };
