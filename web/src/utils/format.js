const numberFormatter = new Intl.NumberFormat('id-ID');

export function formatNumber(value) {
  const number = typeof value === 'number' ? value : Number(value);
  return numberFormatter.format(Number.isFinite(number) ? number : 0);
}
