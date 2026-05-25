function formatRupiah(value) {
  const number = Number(value || 0);
  return `Rp ${new Intl.NumberFormat('id-ID').format(number)}`;
}

function toBigIntAmount(value) {
  if (typeof value === 'bigint') return value;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Invalid money amount');
  return BigInt(Math.round(number));
}

module.exports = { formatRupiah, toBigIntAmount };
