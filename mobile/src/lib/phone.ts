/**
 * r138 (الموبايل يواكب عقد الخادم) — التوأم الرابع لعائلة الهاتف الليبي:
 * نفس normalizeLibyanPhone في fb_dashboard/frontend/src/lib/phone.ts (الويب)
 * و _utils.normalize_libyan_phone (الخادم — بوابة r137 «ليبي أولاً») و
 * Smart-Order src/lib/phone.ts (أصل العائلة).
 *
 * لماذا الآن: شاشتا الدفع في الموبايل (الاشتراك والشحن) كانتا تتحققان
 * بـ«‎length ≥ 7‎» — البوابة ذاتها التي أصلحها r137 على الخادم، فكان
 * المستخدم يُرسل «1234567» ويمر من جهازه ليصطدم بـ422 «قيمة غير صالحة»
 * بعد رحلة كاملة. الآن الجهاز يطبّق نفس العقد قبل الإرسال.
 *
 * العقد الموحّد الأوسع (قرار r138-SO على مستوى الأسطولة): محمول 09 بطول
 * 9-10 خانات (النموذج القصير 091234567 + جذع 0 المفقود للنموذجين) وأرضي
 * 0[1-9] بعشر خانات. يقبل 0912345678 و 218912345678 و +218 91 234 5678
 * و ٩١٢٣٤٥٦٧٨ و 912345678؛ يردّ القناع المحلي أو null.
 */

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
}

/** استخراج الأرقام المجردة من أي هاتف كتبه المستخدم. */
function phoneDigits(input: string): string {
  return normalizeDigits(String(input ?? '')).replace(/\D/g, '')
}

/**
 * تطبيع رقم ليبي إلى شكله المحلي (0XXXXXXXXX أو النموذج القصير 0XXXXXXXX)
 * أو null إذا لم يكن رقمًا ليبيًا صالحًا (محمولًا أو أرضيًا).
 */
export function normalizeLibyanPhone(input: string): string | null {
  let d = phoneDigits(input)
  if (!d) return null
  if (d.startsWith('00218')) d = d.slice(5)
  else if (d.startsWith('218')) d = d.slice(3)
  // جذع 0 المفقود للمحمول: 9xxxxxxxx و9xxxxxxx (النموذج القصير)
  if (d.startsWith('9') && (d.length === 8 || d.length === 9)) d = '0' + d
  // (r138) المحمول القصير 9 خانات: 09 + 7 أرقام
  if (d.length === 9 && d.startsWith('09')) return d
  if (d.length !== 10 || !d.startsWith('0')) return null
  if (!/^0[1-9]/.test(d)) return null // (r138) البادئات الوطنية: محمول + كل الأرضي
  return d
}
