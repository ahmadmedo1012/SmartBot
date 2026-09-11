/**
 * SmartBot Mobile — التنسيق الموحد (منقول من src/lib/format.ts للويب).
 *
 * نفس الاصطلاحات المعتمدة هناك (بوابة i18n في CI تفرضها):
 *  - الأرقام: locale "ar-LY" — أرقام غربية 0-9 وفواصل الآلاف النقطية.
 *  - التواريخ: أسماء شهور عربية + أرقام غربية + ترتيب يوم-شهر-سنة + ساعة 24.
 */

export function toArabicNumber(n: number | string): string {
  return typeof n === 'number' ? n.toString() : n
}

/** رقم بالأسلوب الليبي: أرقام غربية + تجميع آلاف. */
export function formatNumber(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return ''
  const num = typeof n === 'string' ? Number(n) : n
  if (!Number.isFinite(num)) return String(n)
  return num.toLocaleString('ar-LY')
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

function toDate(date: Date | string | number | null | undefined): Date {
  if (date === null || date === undefined || date === '') return new Date(NaN)
  return date instanceof Date ? date : new Date(date)
}

function isValid(d: Date): boolean {
  return !Number.isNaN(d.getTime())
}

/** تاريخ + وقت: "6 سبتمبر 2026 14:05". */
export function formatDate(date: Date | string | number | null | undefined): string {
  const d = toDate(date)
  if (!isValid(d)) return ''
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${d.getDate()} ${ARABIC_MONTHS[d.getMonth()]} ${d.getFullYear()} ${h}:${m}`
}

/** تاريخ فقط: "6 سبتمبر 2026". */
export function formatDateOnly(date: Date | string | number | null | undefined): string {
  const d = toDate(date)
  if (!isValid(d)) return ''
  return `${d.getDate()} ${ARABIC_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** وقت فقط: "14:05". */
export function formatTime(date: Date | string | number | null | undefined): string {
  const d = toDate(date)
  if (!isValid(d)) return ''
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

/** فرق زمني نسبي مبسّط: "قبل 5 دقائق". */
export function timeAgo(date: Date | string | number | null | undefined): string {
  const d = toDate(date)
  if (!isValid(d)) return ''
  const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (seconds < 60) return 'الآن'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `قبل ${minutes} دقيقة`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `قبل ${hours} ساعة`
  const days = Math.floor(hours / 24)
  if (days < 30) return `قبل ${days} يوم`
  return formatDateOnly(d)
}

/** عملة: "19 د.ل". */
export function formatMoney(n: number | string | null | undefined): string {
  const v = formatNumber(n)
  return v ? `${v} د.ل` : ''
}

/** نسبة مئوية موقعة: "+12.5%" / "-3.2%" / "0%". */
export function formatTrend(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '0%'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct}%`
}
