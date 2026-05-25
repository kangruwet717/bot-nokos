const { Markup } = require('telegraf');

function mainKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Order OTP', 'ORDER:COUNTRY:p0')],
    [Markup.button.callback('Deposit Saldo', 'DEP:MENU'), Markup.button.callback('Undang Teman', 'REF:MENU')],
    [Markup.button.callback('Histori Order', 'HIST:ORDER:p0'), Markup.button.callback('Histori Depo', 'HIST:DEPO:p0')],
    [Markup.button.callback('Cara Pakai', 'HELP:HOW'), Markup.button.callback('Bantuan CS', 'HELP:CS')]
  ]);
}

function backMainKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('Menu Utama', 'MAIN')]]);
}

module.exports = { mainKeyboard, backMainKeyboard };
