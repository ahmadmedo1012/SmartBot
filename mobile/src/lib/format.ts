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

/* ── r134: الجمع المزدوج/الجمع العربي (CLDR) — منقول حرفيًا من الويب ──
 * (format.ts:91-117 + arabicNumberState من arabic-plural.ts): كان الجوال
 * يفرد دائمًا («قبل 5 دقيقة») بينما الويب يجمع (دقيقتين/دقائق/ساعات)
 * ويستكمل بفرع الأشهر بعد الثلاثين يومًا بدل السقوط على التاريخ. */
function arabicNumberState(count: number): 'one' | 'two' | 'few' | 'many' {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`arabicNumberState expects a non-negative integer, got ${count}`)
  }
  if (count === 1) return 'one'
  if (count === 2) return 'two'
  if (count >= 3 && count <= 10) return 'few'
  return 'many' // 11+
}

function _unitPhrase(count: number, one: string, two: string, few: string): string {
  switch (arabicNumberState(count)) {
    case 'one':
      return one
    case 'two':
      return two
    case 'few':
      return `${toArabicNumber(count)} ${few}`
    default:
      return `${toArabicNumber(count)} ${one}`
  }
}

/** فرق زمني نسبي بالجمع الصحيح: "قبل دقيقة" / "قبل دقيقتين" / "قبل 5 دقائق"
 *  / "قبل ساعتين" / "قبل 3 أيام" / "قبل شهرين" … */
export function timeAgo(date: Date | string | number | null | undefined): string {
  const d = toDate(date)
  if (!isValid(d)) return ''
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'الآن'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `قبل ${_unitPhrase(minutes, 'دقيقة', 'دقيقتين', 'دقائق')}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `قبل ${_unitPhrase(hours, 'ساعة', 'ساعتين', 'ساعات')}`
  const days = Math.floor(hours / 24)
  if (days < 30) return `قبل ${_unitPhrase(days, 'يوم', 'يومين', 'أيام')}`
  const months = Math.floor(days / 30)
  return `قبل ${_unitPhrase(months, 'شهر', 'شهرين', 'أشهر')}`
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
