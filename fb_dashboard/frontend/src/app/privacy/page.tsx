import type { Metadata } from "next"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"

export const metadata: Metadata = {
  title: "سياسة الخصوصية",
  description: "كيف تجمع منصة الربط الذكي SmartBot بياناتك وتحميها وتستخدمها",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-20">
        <h1 className="text-3xl font-bold mb-8">سياسة الخصوصية</h1>
        <div className="space-y-6 text-foreground/80 leading-relaxed">
          <p>
            تلتزم منصة الربط الذكي (SmartBot) بحماية خصوصيتك. توضح هذه السياسة كيفية جمعنا
            للمعلومات الشخصية واستخدامها وحمايتها، وتنطبق على جميع مستخدمي المنصة. نلتزم بجمع
            الحد الأدنى من البيانات اللازمة لتشغيل الخدمة فقط، وبعدم بيع أي بيانات لأي طرف
            ثالث.
          </p>

          <h2 className="text-foreground text-xl font-semibold mt-8">المعلومات التي نجمعها</h2>
          <ul className="list-disc ps-5 space-y-2">
            <li>بيانات الحساب: الاسم، البريد الإلكتروني، رقم الهاتف</li>
            <li>بيانات صفحة فيسبوك: الصفحات المرتبطة، ومؤشرات التفاعل الخاصة بها</li>
            <li>إعدادات الأتمتة: قواعد الردود، الجداول، والحملات التي تهيئها بنفسك</li>
            <li>بيانات الاستخدام: سجلات التفاعل، التحليلات، وإحصاءات الأداء</li>
          </ul>

          <h2 className="text-foreground text-xl font-semibold mt-8">كيف نستخدم معلوماتك</h2>
          <ul className="list-disc ps-5 space-y-2">
            <li>تقديم خدمات أتمتة التفاعل مع فيسبوك وتحسينها باستمرار</li>
            <li>تنفيذ قواعد الأتمتة وتوصيل المحتوى المجدول في مواعيده</li>
            <li>تحليل الأداء وإرسال تقارير الاستخدام إلى لوحة التحكم الخاصة بك</li>
            <li>التواصل معك بشأن حسابك وتحديثات الخدمة والدعم الفني</li>
          </ul>

          <h2 className="text-foreground text-xl font-semibold mt-8">حماية البيانات</h2>
          <p>
            نطبق إجراءات أمنية متقدمة لحماية بياناتك من الوصول غير المصرح به أو التعديل أو
            الإفصاح، تشمل تشفير رموز الوصول لصفحاتك عند تخزينها، وتشفير الاتصالات بين متصفحك
            وخوادمنا، وفصل بيانات كل عميل في مساحة عمل مستقلة لا يمكن لعملاء آخرين الوصول
            إليها. وتُحذف بيانات مساحة العمل بالكامل عند طلب حذف الحساب.
          </p>

          <h2 className="text-foreground text-xl font-semibold mt-8">الأطراف الثالثة</h2>
          <p>
            لا نشارك معلوماتك مع أي طرف ثالث إلا بالقدر اللازم لتقديم الخدمة نفسها (مثل واجهة
            فيسبوك البرمجية الضرورية لتشغيل البوت)، وتحت معايير أمنية صارمة، أو عندما يفرض
            القانون ذلك. لا نستخدم بياناتك لأغراض إعلانية ولن نبيعها لأي جهة.
          </p>

          <h2 className="text-foreground text-xl font-semibold mt-8">تواصل معنا</h2>
          <p>
            لأي استفسارات متعلقة بالخصوصية أو لطلب نسخة من بياناتك أو حذفها، تواصل معنا عبر
            قنوات الدعم المتاحة في لوحة التحكم أو صفحة الدعم داخل حسابك، وسنستجيب في أقرب وقت
            ممكن.
          </p>

          <p className="text-sm mt-12 text-muted-foreground">آخر تحديث: سبتمبر 2026</p>
        </div>
      </div>
      <Footer />
    </div>
  )
}
