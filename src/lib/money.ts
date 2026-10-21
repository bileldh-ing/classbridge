/**
 * Money is always an integer number of minor units plus an ISO-4217 code.
 * Never use floating point for amounts; conversion to major units happens only for display.
 */
export const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "TND", "CAD", "MAD"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export function minorUnitDigits(currency: string): number {
  // Intl knows ISO-4217 exponents (e.g. TND = 3, JPY = 0)
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function assertMinor(amount: number): void {
  if (!Number.isSafeInteger(amount)) throw new Error(`Money amount must be an integer minor-unit value, got ${amount}`);
}

export function formatMoney(amountMinor: number, currency: string, locale = "en"): string {
  assertMinor(amountMinor);
  const digits = minorUnitDigits(currency);
  const loc = locale === "ar" ? "ar-TN" : locale;
  return new Intl.NumberFormat(loc, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(amountMinor / 10 ** digits);
}

/** Parses a user-entered major-unit decimal string ("25.50") into minor units without float math. */
export function parseMajorToMinor(input: string, currency: string): number {
  const digits = minorUnitDigits(currency);
  const s = input.trim().replace(",", ".");
  if (!/^\d{1,9}(\.\d+)?$/.test(s)) throw new Error("Invalid amount");
  const [whole, frac = ""] = s.split(".");
  if (frac.length > digits) throw new Error(`At most ${digits} decimal places for ${currency}`);
  return Number(whole) * 10 ** digits + Number(frac.padEnd(digits, "0") || "0");
}

export function minorToMajorString(amountMinor: number, currency: string): string {
  assertMinor(amountMinor);
  const digits = minorUnitDigits(currency);
  if (digits === 0) return String(amountMinor);
  const s = String(Math.abs(amountMinor)).padStart(digits + 1, "0");
  return `${amountMinor < 0 ? "-" : ""}${s.slice(0, -digits)}.${s.slice(-digits)}`;
}

/** Platform fee in basis points, rounded half-up on integers. */
export function platformFee(amountMinor: number, bps: number): number {
  assertMinor(amountMinor);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error("bps out of range");
  return Math.floor((amountMinor * bps + 5_000) / 10_000);
}

/** Price for a lesson of `minutes` given an hourly rate, rounded half-up. */
export function priceForDuration(hourlyRateMinor: number, minutes: number): number {
  assertMinor(hourlyRateMinor);
  return Math.floor((hourlyRateMinor * minutes + 30) / 60);
}

export function splitEarning(amountMinor: number, bps: number) {
  const fee = platformFee(amountMinor, bps);
  return { gross: amountMinor, fee, net: amountMinor - fee };
}
