// Libyan phone normalization — r133 (A12 S10): the SO phone.ts twin, ported
// so the payment paths accept what Smart-Order accepts (+218 / 00218 /
// Eastern digits / missing trunk-0) while every request still leaves the
// client in the canonical local 0XXXXXXXXX mask (R10).
// r138 (توحيد الأسطولة — قرار r138-SO): «10 خانات بالضبط + 0[125-9]» كان
// صرامةً بلا مبرر موثق — «091234567» (محمول 9 خانات) يُقبل في Smart-Link
// ويُرفض هنا. العقد الموحّد الأوسع الآن في الأسطولة كلها:
//  - محمول 09 بطول 9-10 خانات (النموذج القصير 091234567 للناقلين)؛
//  - أرضي 0[1-9] بعشر خانات (البادئة اتسعت عن 0[125-9] السابقة).
// مقايضة مقبولة عمدًا (توثيقًا للعائلة): إسقاط الخانة الأخيرة من محمول
// 10 خانات يُنتج قصيرًا صالحًا — أولوية القبول على الرفض (نفس Smart-Link).

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function normalizeDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

/** Extract bare digits from any user-typed phone string. */
function phoneDigits(input: string): string {
  return normalizeDigits(String(input ?? "")).replace(/\D/g, "");
}

/**
 * Normalize a Libyan phone number to its local form (0XXXXXXXXX, or the
 * r138 short mobile 0XXXXXXXX) or null when it cannot be a valid Libyan
 * mobile/landline number.
 * Accepts: 0912345678, 218912345678, +218 91 234 5678, ٩١٢٣٤٥٦٧٨, 912345678.
 */
export function normalizeLibyanPhone(input: string): string | null {
  let d = phoneDigits(input);
  if (!d) return null;
  if (d.startsWith("00218")) d = d.slice(5);
  else if (d.startsWith("218")) d = d.slice(3);
  // جذع 0 المفقود للمحمول: 9xxxxxxxx (10 خانات بعد الجذع) و9xxxxxxx
  // (9 خانات — النموذج القصير؛ الجذع يُسبق قبل التحقق — فكرة Smart-Link)
  if (d.startsWith("9") && (d.length === 8 || d.length === 9)) d = "0" + d;
  // (r138) المحمول القصير 9 خانات: 09 + 7 أرقام — نموذج المشغلين القصار
  if (d.length === 9 && d.startsWith("09")) return d;
  if (d.length !== 10 || !d.startsWith("0")) return null;
  if (!/^0[1-9]/.test(d)) return null; // (r138) البادئات الوطنية: محمول + كل الأرضي
  return d;
}
