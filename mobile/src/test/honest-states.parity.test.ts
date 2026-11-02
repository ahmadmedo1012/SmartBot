/**
 * P42-5a — دبابيس تكافؤ «الحالات الصادقة» على الجوال (GAP-X1 + GAP-BOT-1).
 *
 * لماذا دبابيس مصدر (نمط theme.parity.test.ts §4/§6) لا اختبارات رسم؟
 * عدّاء الجوال بيئة node بلا jsdom ولا react-test-renderer ولا RNTL
 * (vitest.config.ts: environment 'node'، include ‎*.test.ts) — فلا مجال
 * عمليًا لرسم مكوّنات RN هنا. المنطق كله (المصنّفات + البث المركزي)
 * مُثبَّت سلوكيًا في lib/gates.test.ts؛ وما يخص طبقة العرض نثبّته هنا
 * كعقود مصدر حرفية — نفس النمط الذي يثبّت به المستودع سلك الخطوط
 * وموتيفات غرفة الآلة على الجوال. أي انجراف لاحق في المسارات/النسخ/
 * أماكن التركيب يكسر الدمج.
 *
 * ما يُثبَّت (من الجهتين — الجوال والويب):
 *   §1 مكوّن PremiumLock: النسخة الحرفية للويب، باب الترقية إلى شاشة
 *      الاشتراك الجوّالية، بئر العائلة الأصفر 56px.
 *   §2 حالة الإيقاف SuspendedState: النسخة الحرفية، قناة الدعم العام،
 *      باب الخروج، استطلاع رفع الإيقاف.
 *   §3 الحارس الجوّالي: التركيب في (app)/_layout + تسجيل المعالج في
 *      AuthProvider + علم suspended في عقد الحالة.
 *   §4 انتشار القفل: المجدول والبث (إنشاءً وإرسالًا) والتقويم والتاب
 *      الدفاعي — أزرار الإنشاء تختفي عند القفل (عقيدة 3ce58c3).
 *   §5 مسارات lucide الحرفية للتاج والدرع (نفس مجموعة الويب).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { GATE_FAMILY_SUFFIX } from '@/lib/gates'

/* ملاحظة: لا نستورد من ملفات .tsx هنا (سحب react-native Flow يفجّر
 * المحلل في بيئة node) — عقود العرض تُقرأ من المصدر نفسه، وهذا هو
 * نمط theme.parity.test.ts §4/§6 أصلًا. */

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/* ── §1 PremiumLock — التوأن البصري لـPremiumLockCard الويب ─────────── */
describe('P42-5a · PremiumLock (GAP-X1)', () => {
  const src = read('../components/premium-lock.tsx')

  const PREMIUM_LOCK_DEFAULT =
    "'خطتك الحالية لا تتضمن هذه الميزة. رقِّ خطتك من صفحة الاشتراك للاطلاع عليها.'"

  it('النص العام حرفيًا من PremiumLockCard الويب (نسخة معتمدة من المنتج)', () => {
    expect(src).toContain(PREMIUM_LOCK_DEFAULT)
    // والمكوّن يستهلكه كقيمة افتراضية للنسخة الغائبة
    expect(src).toContain('message ?? PREMIUM_LOCK_DEFAULT_MESSAGE')
  })


  it('العنوان يسمّي الميزة بلقب العائلة — «— متاحة في Premium»', () => {
    expect(src).toContain('{title} — متاحة في Premium')
  })

  it('باب الترقية نصّه «ترقية الخطة» (نفس زر billing الويب والجوال)', () => {
    expect(src).toContain('title="ترقية الخطة"')
  })

  it('باب الترقية يقود إلى شاشة الاشتراك الجوّالية (الوجهة الموجودة فعلًا)', () => {
    expect(src).toContain("pathname: '/(app)/subscribe'")
  })

  it('بئر العائلة المسطّح: أصفر عائلي 56px بدرجة r-xl (مرآة size-14 rounded-xl)', () => {
    expect(src).toContain('families[isDark ? \'dark\' : \'light\'].yellow')
    expect(src).toContain('width: 56, height: 56')
  })

  it('التاج يرسم بلون حبر العائلة الأصفر (لا هالة زجاجية — de-glow r131-F8)', () => {
    expect(src).toContain('<Icon name="crown" size={20} color={fam.ink} />')
  })

  it('المكوّن لا يصنّف — عرضٌ فقط؛ التصنيف مسؤولية الشاشة (لا استيراد isPlanLocked)', () => {
    expect(src).not.toContain("from '@/lib/gates'")
    expect(src).not.toContain('isPlanLocked(')
  })
})

/* ── §2 SuspendedState — التوأن الجوّالي لصفحة إيقاف AuthGuard ─────── */
describe('P42-5a · SuspendedState (GAP-BOT-1)', () => {
  const src = read('../components/suspended-state.tsx')

  it('العنوان الحرفي للويب: «حساب منظمتك موقوف»', () => {
    expect(src).toContain('حساب منظمتك موقوف')
  })

  it('النسخة الحرفية للويب: البيانات محفوظة + الدعم هو الطريق', () => {
    expect(src).toContain('بياناتك محفوظة كما هي — تواصل مع الدعم لمعرفة السبب وخطوات استعادة الحساب.')
  })

  it('نقض حلقة إعادة المحاولة — الجملة الحرفية للويب', () => {
    expect(src).toContain('إعادة المحاولة لن تنجح — الإيقاف حالة على الخادم تُرفع من جانب الدعم فقط.')
  })

  it('قناة الدعم من العقد العام GET /api/support/info (يعمل تحت الإيقاف)', () => {
    expect(src).toContain("apiGet<PublicConfig>('/api/support/info')")
  })

  it('باب واتساب فعّال عبر wa.me (قناة الدعم التي يستعملها التطبيق)', () => {
    expect(src).toContain('https://wa.me/')
  })

  it('باب الخروج موجود (نفس عقد AuthGuard الويب — الباب الوحيد المتاح)', () => {
    expect(src).toContain('title="تسجيل الخروج"')
    expect(src).toContain('onPress={() => logout()}')
  })

  it('استطلاع رفع الإيقاف: /api/me كل 60 ثانية (مرآة useMe الويب) + تنظيف الذاكرة', () => {
    expect(src).toContain("apiGet<{ user: User }>('/api/me')")
    expect(src).toContain('RECHECK_INTERVAL_MS = 60_000')
    expect(src).toContain('removeQueries')
  })
})

/* ── §3 الحارس الجوّالي — التركيب والتوصيل ─────────────────────────── */
describe('P42-5a · الحارس الجوّالي (توأن AuthGuard)', () => {
  it('(app)/_layout يركّب SuspendedState عند العلم — قبل أي توجيه آخر', () => {
    const src = read('../app/(app)/_layout.tsx')
    expect(src).toContain('if (suspended) return <SuspendedState />')
    // الإيقاف يسبق توجيه onboarding (الويب: suspended قبل authorized)
    const suspendedAt = src.indexOf('if (suspended)')
    const onboardingAt = src.indexOf('onboardingCompleted === false')
    expect(suspendedAt).toBeGreaterThan(-1)
    expect(onboardingAt).toBeGreaterThan(suspendedAt)
  })

  it('AuthProvider يسجّل معالج الإيقاف المركزي ويصدّر clearSuspended', () => {
    const src = read('../state/auth.tsx')
    expect(src).toContain('setSuspendedHandler(() => {')
    expect(src).toContain('clearSuspended')
    expect(src).toContain('suspended: boolean')
  })

  it('الدخول والخروج ومعالج 401 كلها تبدأ علمًا نظيفًا (لا إيقاف موروثًا)', () => {
    const src = read('../state/auth.tsx')
    const clean = (src.match(/status: 'unauthenticated', suspended: false/g) ?? []).length
    expect(clean).toBeGreaterThanOrEqual(3) // الخروج + 401 + الاستعادة الفارغة
    expect(src).toContain("status: 'authenticated', suspended: false")
  })
})

/* ── §4 انتشار القفل الصادق — أين يركّب وأين يختفي ─────────────────── */
describe('P42-5a · انتشار القفل (عقيدة 3ce58c3 على الجوال)', () => {
  it('المجدول: بوابة الإنشاء (has_scheduling) → قفل صادق + إخفاء زر الإنشاء + بقاء القائمة', () => {
    const src = read('../app/(app)/scheduled/index.tsx')
    expect(src).toContain('isPlanLocked(e)')
    expect(src).toContain('setPlanLocked((e as Error).message)')
    expect(src).toContain('planLocked ? undefined :')
    expect(src).toContain('<PremiumLock title="جدولة المنشورات"')
  })

  it('البث: الإنشاء والإرسال (has_broadcast) كلاهما يقفلان + زر «بث جديد» يختفي', () => {
    const src = read('../app/(app)/broadcast/index.tsx')
    const locks = (src.match(/isPlanLocked\(e\)/g) ?? []).length
    expect(locks).toBe(2) // createMutation + sendMutation
    expect(src).toContain('planLocked ? undefined :')
    expect(src).toContain('<PremiumLock title="البث الجماعي"')
  })

  it('البث: نص حالة الفراغ عند القفل هو الحرفي الويب (لا CTA ميتًا)', () => {
    const src = read('../app/(app)/broadcast/index.tsx')
    expect(src).toContain('بث الرسائل الجماعية متاح في خطط أعلى — رقِّ خطتك من صفحة الاشتراك.')
  })

  it('التقويم: سطح الإنشاء الثاني لـhas_scheduling ينضم للعائلة (POST فقط — PUT بلا بوابة)', () => {
    const src = read('../app/(app)/calendar/index.tsx')
    expect(src).toContain('!editing && isPlanLocked(e)')
    expect(src).toContain('<PremiumLock title="جدولة المنشورات"')
    expect(src).toContain('planLocked ? undefined :')
  })

  it('تاب التحليلات: دفاعية العائلة — بوابة خطة بديل خطأ «أعد المحاولة»', () => {
    const src = read('../app/(app)/(tabs)/analytics.tsx')
    expect(src).toContain('isPlanLocked(error)')
    expect(src).toContain('<PremiumLock title="التحليلات"')
  })
})

/* ── §5 مسارات lucide الحرفية — نفس مجموعة الويب ───────────────────── */
describe('P42-5a · أيقونتا العائلة (lucide-react 1.x — نسخة الويب)', () => {
  const src = read('../components/icon.tsx')

  it('التاج Crown: مسار lucide الحرفي (dist/esm/icons/crown.mjs)', () => {
    expect(src).toContain(
      'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z',
    )
  })

  it('درع التنبيه ShieldAlert: مسار lucide الحرفي (مرآة أيقونة صفحة الإيقاف الويب)', () => {
    expect(src).toContain('M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z')
  })

  it('زر التطبيق المشترك يقبل خانة أيقونة (تاج الترقية داخل الزر كالويب)', () => {
    const ui = read('../components/ui.tsx')
    expect(ui).toContain('icon?: React.ReactNode')
  })
})

/* ── §6 لا فرضًا عميلًا — العرض الصادق فقط ─────────────────────────── */
describe('P42-5a · حدود العقيدة', () => {
  it('لا مصنّف ولا بوابات داخل طبقة العرض تمنع نداءً خادميًا (الفرض خادمي)', () => {
    const lock = read('../components/premium-lock.tsx')
    const suspended = read('../components/suspended-state.tsx')
    // المكوّنان عرضان صادقان: لا يمنعان نداءً ولا يخفيان فشلًا غير مصنَّف
    expect(lock).not.toContain('apiFetch')
    expect(lock).not.toContain('apiGet')
    expect(suspended).not.toContain('isPlanLocked')
  })

  it('لاحقة العائلة موثّقة من الجهتين (الجوال يقرأ عقد الخادم نفسه)', () => {
    expect(GATE_FAMILY_SUFFIX).toBe('رقِّ خطتك')
  })
})
