/**
 * v18-1-c — بيانات الخطط الخمس الافتراضية (مصدر الرسم الفوري).
 *
 * WHY: /subscribe و /pricing كانتا ترسمان skeleton وتنتظران GET /api/plans
 * — على دالة Vercel باردة يعني هذا حتى ~12.5 ثانية من مسار الأموال
 * الأبيض (worklog v18 Task 0). هذه الثوابت مرآة حرفية لبذرة الكانون
 * fb_dashboard/app/startup.py::_seed_subscription_plans (طُوبقت مع استجابة
 * الإنتاج الحية GET /api/plans بتاريخ 2026-09-09: خمس باقات نشطة ids
 * 1-5 بذات الأسعار والميزات)، فأي صفحة ترسم بطاقات الخطط من أول إطار
 * ثم تستبدلها ببيانات API عند وصولها (تبديل صامت عبر plansEqual).
 *
 * العقد: ComparisonPlanInput — نفس شكل السلك لـ GET /api/plans (انظر
 * components/subscribe/plan-comparison.ts). أبقِ الحقول مطابقة للبذرة؛
 * عند تعديل أسعار/ميزات الباقات في الخادم عدّل هنا أيضاً (يحمي ذلك
 * اختبار default-plans.test.ts).
 *
 * التبديل الصامت: الصفحات التي hydrate من الـAPI تستدعي plansEqual لتجنّب
 * إعادة الرسم (والوميض المرئي) حين تطابق بيانات الـAPI الافتراضية —
 * setPlans(prev => plansEqual(prev, next) ? prev : next) يجعل React
 * يتخلى عن التحديث لنفس مرجع المصفوفة.
 */
import { toComparisonPlan, type ComparisonPlan, type ComparisonPlanInput } from "@/components/subscribe/plan-comparison"

/** الخطط الخمس الكانونية — مرآة بذرة الخادم (لا تختلق ids/أسعاراً). */
export const DEFAULT_PLANS: ComparisonPlanInput[] = [
  {
    id: 1,
    name: "Free",
    name_ar: "مجاني",
    price: 0,
    max_replies: 100,
    max_pages: 1,
    max_rules: 5,
    features: ["ردود تلقائية (100/شهر)", "صفحة فيسبوك واحدة", "5 قواعد رد", "إحصاءات أساسية"],
    sort_order: 1,
  },
  {
    id: 2,
    name: "Basic",
    name_ar: "أساسي",
    price: 19,
    max_replies: 2000,
    max_pages: 1,
    max_rules: 20,
    features: [
      "2,000 رد/شهر",
      "صفحة فيسبوك واحدة",
      "20 قاعدة رد",
      "رد خاص على التعليقات",
      "ردود ذكية بالذكاء الاصطناعي",
      "تقارير أسبوعية",
      "دعم فوري",
    ],
    sort_order: 2,
  },
  {
    id: 3,
    name: "Premium",
    name_ar: "مميز",
    price: 29,
    max_replies: 10000,
    max_pages: 2,
    max_rules: 50,
    features: [
      "10,000 رد/شهر",
      "صفحتين فيسبوك",
      "50 قاعدة رد",
      "رد خاص + ذكاء اصطناعي",
      "بث جماعي للرسائل",
      "جدولة المنشورات",
      "تقارير PDF",
      "محرك العروض الترويجية",
      "تحليلات متقدمة",
      "فريق حتى 2",
    ],
    sort_order: 3,
  },
  {
    id: 4,
    name: "Pro",
    name_ar: "احترافي",
    price: 129,
    max_replies: 50000,
    max_pages: 5,
    max_rules: 100,
    features: [
      "50,000 رد/شهر",
      "5 صفحات فيسبوك",
      "100 قاعدة رد",
      "جميع الميزات المتقدمة",
      "حملات تسلسلية",
      "فريق حتى 5 أعضاء",
      "دعم فني ممتاز",
    ],
    sort_order: 4,
  },
  {
    id: 5,
    name: "Enterprise",
    name_ar: "مؤسسي",
    price: 299,
    max_replies: 999999,
    max_pages: 999,
    max_rules: 999,
    features: [
      "ردود غير محدودة",
      "صفحات غير محدودة",
      "قواعد غير محدودة",
      "جميع الميزات بدون استثناء",
      "فريق غير محدود",
      "دعم 24/7",
    ],
    sort_order: 5,
  },
]

/** الشكل الجاهز للرسم (تحويل واحد عند تحميل الوحدة). */
export const DEFAULT_COMPARISON_PLANS: ComparisonPlan[] = DEFAULT_PLANS.map(toComparisonPlan)

/**
 * مساواة بنيوية رخيصة للتبديل الصامت عند الـhydrate: نفس الطول ونفس
 * id/sortOrder/price/عدد الميزات في كل موضع → نفس ناتج الرسم → أبقِ
 * مرجع المصفوفة السابق ودع React يتخلى عن التحديث (لا وميض).
 * (مقارنة عميقة لنصوص الميزات العربية ستكون عملاً ضائعاً لحارس وظيفته
 * الوحيدة تجنّب وميض مرئي — انحراف نصي بلا تغير سعر/ترتيب/عدد يُعرض
 * من الافتراضي حتى أول تبديل غير متطابق.)
 */
export function plansEqual(a: ComparisonPlan[], b: ComparisonPlan[]): boolean {
  if (a.length !== b.length) return false
  return a.every(
    (p, i) =>
      p.id === b[i].id &&
      p.sortOrder === b[i].sortOrder &&
      p.price === b[i].price &&
      p.features.length === b[i].features.length,
  )
}
