/**
 * Converts a number to a string using only Western/Arabic digits (0-9).
 * Never uses Arabic-Indic numerals (٠-٩). No thousand separators.
 * - Integers: "123456"
 * - Floats: "1234.5"
 * - Strings: returned as-is
 */
function toArabicNumber(n: number | string): string {
  if (typeof n === 'number') {
    return n.toString();
  }
  return n;
}

/**
 * Format a date with Arabic month names and Western digits only.
 */
const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

function formatDate(date: Date): string {
  const d = date.getDate();
  const m = ARABIC_MONTHS[date.getMonth()];
  const y = date.getFullYear();
  const h = date.getHours().toString().padStart(2, '0');
  const min = date.getMinutes().toString().padStart(2, '0');
  return `${toArabicNumber(d)} ${m} ${toArabicNumber(y)} ${h}:${min}`;
}

export { toArabicNumber, formatDate };
