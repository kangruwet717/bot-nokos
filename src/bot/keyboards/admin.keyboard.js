const { Markup } = require('telegraf');

function adminKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Users', 'ADMIN:USERS'), Markup.button.callback('Provider', 'ADMIN:PROVIDER')],
    [Markup.button.callback('Pending Deposit', 'ADMIN:DEPOSITS:PENDING'), Markup.button.callback('Deposit Terbaru', 'ADMIN:DEPOSITS')],
    [Markup.button.callback('Order Aktif', 'ADMIN:ORDERS:ACTIVE'), Markup.button.callback('Order Terbaru', 'ADMIN:ORDERS')],
    [Markup.button.callback('Settings', 'ADMIN:SETTINGS'), Markup.button.callback('Errors', 'ADMIN:ERRORS')],
    [Markup.button.callback('Broadcast', 'ADMIN:BROADCAST'), Markup.button.callback('Report', 'ADMIN:REPORT')]
  ]);
}

function adminBackKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('Admin Panel', 'ADMIN:HOME')]]);
}

module.exports = { adminKeyboard, adminBackKeyboard };
