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

import { arabicNumberState, getArabicPlural } from "@/lib/arabic-plural";

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

/* ── v8-E5/E6: relative time + count phrases — ONE format for the whole app ──
 * Before v8 the codebase had THREE competing relative-time formats
 * ("منذ 5 د" / "قبل 5 دقيقة" / "منذ 5 دقائق") and ~15 raw `${n} noun`
 * interpolations with no dual/plural, while a full Arabic pluralization
 * engine (lib/arabic-plural.ts) sat unused. */

function _unitPhrase(count: number, one: string, two: string, few: string): string {
  switch (arabicNumberState(count)) {
    case "one": return one;
    case "two": return two;
    case "few": return `${toArabicNumber(count)} ${few}`;
    default: return `${toArabicNumber(count)} ${one}`;
  }
}

/**
 * Relative time: "الآن" / "قبل دقيقة" / "قبل دقيقتين" / "قبل 5 دقائق" / "قبل 11 دقيقة"
 * / "قبل ساعتين" / "قبل 3 أيام" …
 */
function timeAgo(date: Date | string | number | null | undefined): string {
  const d = toDate(date);
  if (!isValid(d)) return "";
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "الآن";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `قبل ${_unitPhrase(minutes, "دقيقة", "دقيقتين", "دقائق")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${_unitPhrase(hours, "ساعة", "ساعتين", "ساعات")}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `قبل ${_unitPhrase(days, "يوم", "يومين", "أيام")}`;
  const months = Math.floor(days / 30);
  return `قبل ${_unitPhrase(months, "شهر", "شهرين", "أشهر")}`;
}

/**
 * Count + noun phrase with correct Arabic dual/plural:
 * "5 رسائل" / "رسالتان" / "1 رسالة" / "15 رسالة".
 * Optional explicit forms follow getArabicPlural's signature.
 */
function countPhrase(
  count: number,
  singular: string,
  dualOrForms?: string | { two?: string; few?: string },
  plural?: string,
): string {
  const noun = getArabicPlural(count, singular, dualOrForms, plural);
  switch (arabicNumberState(count)) {
    case "zero": return noun; // "لا رسائل"
    case "two": return noun; // "رسالتان"
    default: return `${toArabicNumber(count)} ${noun}`;
  }
}

export { toArabicNumber, formatNumber, formatDate, formatDateOnly, formatMonth, timeAgo, countPhrase };
