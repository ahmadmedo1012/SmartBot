/**
 * v6 §A — THE single formatting seam for every number and date shown to users.
 *
 * Canonical conventions (decided once, enforced by scripts/check_i18n_calls.py):
 *   - Numbers: "ar-LY" locale — Western digits 0-9, dot thousand separators ("1.234.567").
 *     (Before v6 the codebase mixed three styles: browser-locale toLocaleString(),
 *     "ar-LY", and "ar-EG" Arabic-Indic digits ١٢٣ — never again.)
 *   - Dates:  Arabic month names + Western digits, day-month-year order, 24-hour clock.
 *   - Any display formatting MUST live here. Direct toLocaleString/toLocaleDateString/
 *     toLocaleTimeString outside this file fails the i18n CI gate.
 */

/**
 * Converts a number to a string using only Western digits (0-9).
 * Never uses Arabic-Indic numerals (٠-٩). No thousand separators.
 * - Integers: "123456"
 * - Floats: "1234.5"
 * - Strings: returned as-is
 */
function toArabicNumber(n: number | string): string {
  if (typeof n === "number") {
    return n.toString();
  }
  return n;
}

/**
 * Format a number Libyan-style: Western digits + "ar-LY" grouping.
 * Accepts number | string | null | undefined (renders "" for missing values,
 * so callers can pass API fields directly: formatNumber(p.amount)).
 */
function formatNumber(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return String(n);
  return num.toLocaleString("ar-LY");
}

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

function toDate(date: Date | string | number | null | undefined): Date {
  if (date === null || date === undefined || date === "") return new Date(NaN);
  return date instanceof Date ? date : new Date(date);
}

function isValid(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/**
 * Date + time: "6 سبتمبر 2026 14:05" (24-hour clock).
 */
function formatDate(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  if (!isValid(d)) return "";
  return `${toArabicNumber(d.getDate())} ${ARABIC_MONTHS[d.getMonth()]} ${toArabicNumber(d.getFullYear())} ${d
    .getHours()
    .toString()
    .padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/**
 * Date only (no time): "6 سبتمبر 2026".
 */
function formatDateOnly(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  if (!isValid(d)) return "";
  return `${toArabicNumber(d.getDate())} ${ARABIC_MONTHS[d.getMonth()]} ${toArabicNumber(d.getFullYear())}`;
}

/**
 * Month + year (calendar header): "سبتمبر 2026".
 */
function formatMonth(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  if (!isValid(d)) return "";
  return `${ARABIC_MONTHS[d.getMonth()]} ${toArabicNumber(d.getFullYear())}`;
}

export { toArabicNumber, formatNumber, formatDate, formatDateOnly, formatMonth };
