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

/**
 * (r140 — درس Smart-Link r138 «بوابة wa.me»): wa.me يتطلب الصيغة الدولية
 * بلا صفر بادئ ولا "+"، وقيمة الإنتاج الحية لـ support_whatsapp مخزنة
 * بالشكل المحلي (0910089975) فكانت روابط wa.me على كل صفحة (الزر العائم
 * في layout الجذري + التذييل + صفحة الدعم) تُبنى من الرقم الخام مباشرةً
 * → wa.me/0910089975 = رابط ميت. toWaMe يقبل الرقم الخام كما خزّنه
 * الأدمن (أي إملاء) ويعيد الأرقام الجاهزة لبناء رابط wa.me صالح:
 *  - محمول محلي طويل 09XXXXXXXX أو قصير r138 0XXXXXXXX (9 خانات)
 *      → يُقلب إلى 218 + الباقي؛
 *  - محمول دولي جاهز 2189XXXXXXXX(X) → كما هو؛
 *  - غير ذلك (أرضي/غريب/جذع) → الرقم كما نُظّف فقط — الاحتياطي الحالي
 *    حرفيًا: لا تحويل أعمى (البادئة 021… لا تصبح 21821…) — wa.me محمول
 *    حصرًا، والأرضي يُعرض نصًا خامًا عند المستهلك فلا يولد رابطًا ميتًا
 *    (مذهب الأسطولة — درس Smart-Menu r103-F8، توأم Smart-Link
 *    contact-emails.tsx:99-105).
 * ملاحظة العائلة: التوائم الأربعة (_utils/ويب/موبايل/أصل SO) لم يُمس
 * عقدها (normalizeLibyanPhone نفسه حرفيًا) — هذه إضافة طبقة عرض في بيت
 * العقد العائلي حصرًا؛ تطبيق الموبايل بلا مستهلك wa.me فلا يحتاجها.
 */
export function toWaMe(raw: string): string {
  const d = phoneDigits(String(raw ?? ""));
  // محمول محلي (طويل 10 أو قصير 9 — عقد r138) → دولي
  const localMobile = d.match(/^0(9\d{7,8})$/);
  if (localMobile) return "218" + localMobile[1];
  // محمول دولي جاهز → كما هو
  if (/^2189\d{7,8}$/.test(d)) return d;
  // الاحتياطي الحالي: الرقم كما نُظّف (بلا تحويل)
  return d;
}

/**
 * (r140) هل يحلّ الرقم الخام إلى هدف wa.me صالح (محمول ليبي بأي إملاء)؟
 * للمستهلكين الذين يعرضون الرقم نصًا (صفحة الدعم): المحمول → رابط، وما
 * عداه → نص خام قابل للقراءة فلا يولد رابطًا ميتًا — نفس مذهب الأسطولة.
 */
export function isWaMeNumber(raw: string): boolean {
  return /^2189\d{7,8}$/.test(toWaMe(raw));
}
