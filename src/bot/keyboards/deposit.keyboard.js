const { Markup } = require('telegraf');

function depositKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Rp10.000', 'DEP:AMT:10000'), Markup.button.callback('Rp25.000', 'DEP:AMT:25000')],
    [Markup.button.callback('Rp50.000', 'DEP:AMT:50000'), Markup.button.callback('Rp100.000', 'DEP:AMT:100000')],
    [Markup.button.callback('Rp250.000', 'DEP:AMT:250000'), Markup.button.callback('Rp500.000', 'DEP:AMT:500000')],
    [Markup.button.callback('Nominal Custom', 'DEP:CUSTOM')],
    [Markup.button.callback('Kembali', 'MAIN')]
  ]);
}

function depositDetailKeyboard(deposit) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Cek Status', `DEP:CHECK:${deposit.id}`)],
    [Markup.button.callback('Batalkan Invoice', `DEP:CANCEL:${deposit.id}`)],
    [Markup.button.callback('Menu Utama', 'MAIN')]
  ]);
}

module.exports = { depositKeyboard, depositDetailKeyboard };
