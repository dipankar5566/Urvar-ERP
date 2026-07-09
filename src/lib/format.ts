// Shared display formatters — every quantity/money value shown in the UI goes
// through these, so grouping and decimals stay consistent across pages.

// Quantities keep up to 3 decimals (stock is tracked to 3, e.g. tons) but drop
// trailing zeros; en-IN grouping (12,500 / 1,45,000).
const qtyFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

export function fmtQty(n: number): string {
  return qtyFmt.format(Number(n.toFixed(3)));
}

// Money: ₹ + Indian lakh/crore grouping. Whole amounts show no paise; fractional
// amounts show exactly 2 decimals (₹450, ₹1,45,000.50 — never ₹450.5).
const moneyWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const moneyPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function fmtMoney(n: number): string {
  const rounded = Number(n.toFixed(2));
  return rounded % 1 === 0 ? moneyWhole.format(rounded) : moneyPaise.format(rounded);
}

export function fmtPct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}
