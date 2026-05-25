const { Markup } = require('telegraf');

function paginatedKeyboard(items, makeButton, prevCb, nextCb, backCb = 'MAIN') {
  const rows = items.map((item) => [makeButton(item)]);
  const nav = [];
  if (prevCb) nav.push(Markup.button.callback('Prev', prevCb));
  if (nextCb) nav.push(Markup.button.callback('Next', nextCb));
  if (nav.length) rows.push(nav);
  rows.push([Markup.button.callback('Kembali', backCb)]);
  return Markup.inlineKeyboard(rows);
}

function gridKeyboard(items, makeButton, options = {}) {
  const columns = options.columns || 4;
  const rows = [];
  let current = [];

  for (const item of items) {
    const label = options.getLabel ? options.getLabel(item) : '';
    const button = makeButton(item);
    const shouldStandAlone = label.length > (options.maxCompactLabelLength || 14);

    if (shouldStandAlone) {
      if (current.length) {
        rows.push(current);
        current = [];
      }
      rows.push([button]);
      continue;
    }

    current.push(button);
    if (current.length === columns) {
      rows.push(current);
      current = [];
    }
  }

  if (current.length) rows.push(current);

  const nav = [];
  if (options.prevCb) nav.push(Markup.button.callback('Sebelumnya', options.prevCb));
  if (options.nextCb) nav.push(Markup.button.callback('Selanjutnya', options.nextCb));
  if (nav.length) rows.push(nav);

  if (options.searchCb) rows.push([Markup.button.callback(options.searchLabel || 'Cari', options.searchCb)]);
  rows.push([Markup.button.callback('Kembali', options.backCb || 'MAIN')]);

  return Markup.inlineKeyboard(rows);
}

function confirmOrderKeyboard(token) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Order Sekarang', `ORDER:CONFIRM:${token}`)],
    [Markup.button.callback('Refresh Stok', `ORDER:REFRESH:${token}`)],
    [Markup.button.callback('Kembali', 'ORDER:COUNTRY:p0')]
  ]);
}

function activeOrderKeyboard(orderId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Cek OTP', `ORDER:CHECK:${orderId}`), Markup.button.callback('Batalkan', `ORDER:CANCEL:${orderId}`)],
    [Markup.button.callback('Selesai', `ORDER:FINISH:${orderId}`), Markup.button.callback('Menu Utama', 'MAIN')]
  ]);
}

function otpReceivedKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Selesai', 'MAIN'), Markup.button.callback('Order Lagi', 'ORDER:COUNTRY:p0')],
    [Markup.button.callback('Menu Utama', 'MAIN')]
  ]);
}

module.exports = { paginatedKeyboard, gridKeyboard, confirmOrderKeyboard, activeOrderKeyboard, otpReceivedKeyboard };
