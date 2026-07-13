import { useEffect } from "react"
import { Bot, BarChart3, MessageCircle, Calendar, Target, ShieldCheck } from "lucide-react"

const features = [
  { icon: Bot, title: "ردود تلقائية ذكية", desc: "ردود آنية ومخصصة لجميع تعليقات ورسائل صفحاتك بتقنية الذكاء الاصطناعي" },
  { icon: MessageCircle, title: "صندوق وارد موحد", desc: "إدارة جميع المحادثات من صفحة واحدة بواجهة بسيطة وسهلة" },
  { icon: BarChart3, title: "تحليلات وأداء", desc: "تقارير مفصلة عن أداء الصفحات والمنشورات ونسب التفاعل والنمو" },
  { icon: Calendar, title: "جدولة المنشورات", desc: "إنشاء وجدولة المنشورات مسبقاً مع تقويم محتوى مرئي" },
  { icon: Target, title: "استهداف الجمهور", desc: "تحليل الجمهور واستهداف الفئات المناسبة لزيادة الوصول" },
  { icon: ShieldCheck, title: "أمان وتشفير", desc: "حماية متقدمة للبيانات والاتصالات وفق أعلى معايير الأمان" },
]

const plans = [
  { name: "مجاني", price: "0", label: "د.ل", pages: "صفحة واحدة", replies: "100 رد/شهر", support: "دعم مجتمعي", cta: "ابدأ مجاناً", highlight: false },
  { name: "أساسي", price: "49", label: "د.ل/شهر", pages: "3 صفحات", replies: "ردود غير محدودة", support: "دعم عبر البريد", cta: "اشتراك الآن", highlight: true },
  { name: "احترافي", price: "129", label: "د.ل/شهر", pages: "10 صفحات", replies: "ردود غير محدودة", support: "دعم فني + تقارير PDF", cta: "تواصل معنا", highlight: false },
]

const steps = [
  { num: "١", title: "اتصل بصفحتك", desc: "اربط صفحة فيسبوك بخطوات بسيطة وآمنة" },
  { num: "٢", title: "هيئ قواعد الرد", desc: "حدد الكلمات المفتاحية والردود التلقائية التي تناسبك" },
  { num: "٣", title: "راقب الأداء", desc: "تابع الإحصائيات والتقارير وحسّن أداء صفحاتك" },
]

const faqs = [
  { q: "هل أحتاج صلاحيات خاصة لربط الصفحة؟", a: "تحتاج صلاحية إدارة الصفحة فقط. نطلب أقل الصلاحيات اللازمة للعمل." },
  { q: "هل بياناتي آمنة؟", a: "جميع البيانات مشفرة. لا نشارك معلومات صفحاتك مع أي جهة خارجية." },
  { q: "كم صفحة يمكنني ربطها؟", a: "يمكنك ربط صفحة واحدة في الخطة المجانية، وحتى 10 صفحات في الخطة الاحترافية." },
  { q: "هل تدعم اللغة العربية كاملاً؟", a: "نعم، الواجهة كاملة بالعربية مع دعم كامل للردود والتعليقات العربية." },
  { q: "ماذا يحدث إذا تجاوزت حد الردود الشهري؟", a: "في الخطة المجانية، يقتصر الرد على 100 رد شهرياً. للردود غير المحدودة، اختر الخطة الأساسية أو الاحترافية." },
]

function HeroSection({ onGetStarted }) {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden" dir="rtl">
      <div className="absolute inset-0 z-0" aria-hidden="true" style={{ background: "oklch(14% 0.008 240)" }}>
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "linear-gradient(var(--fg) 1px, transparent 1px), linear-gradient(90deg, var(--fg) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <div className="animate-blob-1 absolute -top-40 right-0 w-[700px] h-[700px]"
          style={{ background: "radial-gradient(ellipse, color-mix(in oklch, var(--accent) 20%, transparent), transparent 70%)" }} />
        <div className="animate-blob-2 absolute -bottom-40 left-0 w-[600px] h-[600px]"
          style={{ background: "radial-gradient(ellipse, color-mix(in oklch, var(--accent) 12%, transparent), transparent 70%)" }} />
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 py-20" style={{ animation: "reveal-blur 0.8s cubic-bezier(0.16,1,0.3,1) both" }}>
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="stagger-children space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg"
                style={{ background: "linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 70%, oklch(0% 0 0)))", color: "var(--accent-fg)", boxShadow: "var(--shadow-glow)" }}>S</div>
              <span className="font-bold text-lg" style={{ color: "var(--fg)" }}>SmartBot</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{background: "var(--accent-soft)", color: "var(--accent)"}}>v2</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-extrabold leading-tight text-gradient-premium" style={{lineHeight: 1.2}}>
              إدارة تفاعل فيسبوك<br />بذكاء
            </h1>
            <p className="text-lg leading-relaxed" style={{ color: "var(--muted)" }}>
              أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك — كل ما تحتاجه في منصة واحدة
            </p>
            <div className="flex gap-4 pt-2">
              <button className="btn btn-primary text-base px-8 py-3 magnetic-btn" onClick={onGetStarted}
                style={{boxShadow: "var(--shadow-glow)"}}>
                ابدأ الآن مجاناً
                <span style={{ fontSize: "18px" }}>←</span>
              </button>
              <button className="btn btn-outline text-base px-8 py-3">
                اعرف المزيد
              </button>
            </div>
          </div>

          <div className="hidden lg:flex items-center justify-center">
            <div className="glass-strong rounded-3xl p-4 w-full max-w-md aspect-[4/3] flex items-center justify-center overflow-hidden" style={{boxShadow: "var(--glass-shadow-lg), var(--shadow-glow)"}}>
              <img src="/static/assets/index-DQpn7rcg.js" alt="لوحة التحكم" className="w-full h-full object-cover rounded-2xl opacity-80"
                onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex" }} />
              <div className="hidden text-center" style={{ display: "none" }}>
                <BarChart3 className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-sm" style={{ color: "var(--muted)" }}>لوحة تحكم SmartBot</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  return (
    <section className="relative py-24" dir="rtl">
      <div className="mesh-bg" aria-hidden="true" />
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="text-center mb-16 animate-fade-in">
          <h2 className="text-3xl font-bold mb-3">مميزات SmartBot</h2>
          <p className="text-base" style={{ color: "var(--muted)" }}>كل ما تحتاجه لإدارة صفحات فيسبوك بكفاءة</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
          {features.map((f, i) => (
            <div key={i} className="glass card-premium rounded-2xl p-8 text-center"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", animation: `slide-up 0.5s ease-out ${i * 0.08}s both`, animationDelay: `${i * 0.1}s` }}>
              <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5"
                style={{ background: "color-mix(in oklch, var(--accent) 12%, transparent)" }}>
                <f.icon className="w-7 h-7" style={{ color: "var(--accent)" }} />
              </div>
              <h3 className="text-lg font-bold mb-2">{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section className="relative py-24" dir="rtl" style={{ background: "oklch(12% 0.005 240)" }}>
      <div className="relative z-10 max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-3">كيف يعمل SmartBot</h2>
          <p className="text-base" style={{ color: "var(--muted)" }}>ثلاث خطوات فقط لبدء أتمتة ردودك</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 stagger-children">
          {steps.map((s, i) => (
            <div key={i} className="text-center" style={{ animation: `slide-up 0.5s ease-out ${i * 0.12}s both` }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 text-2xl font-bold"
                style={{ background: "color-mix(in oklch, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
                {s.num}
              </div>
              <h3 className="text-xl font-bold mb-2">{s.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section className="relative py-24" dir="rtl">
      <div className="mesh-bg" aria-hidden="true" />
      <div className="relative z-10 max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-3">خطط الأسعار</h2>
          <p className="text-base" style={{ color: "var(--muted)" }}>اختر الخطة المناسبة لاحتياجاتك</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 stagger-children">
          {plans.map((p, i) => (
            <div key={i}
              className="glass rounded-2xl p-8 flex flex-col"
              style={{
                background: p.highlight
                  ? "linear-gradient(135deg, color-mix(in oklch, var(--accent) 12%, var(--surface)), var(--surface))"
                  : "var(--surface)",
                border: p.highlight ? "1px solid var(--accent)" : "1px solid var(--border)",
                transform: p.highlight ? "scale(1.05)" : "none",
                animation: `slide-up 0.5s ease-out ${i * 0.1}s both`,
              }}>
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold mb-1">{p.name}</h3>
                <div className="mt-4">
                  <span className="text-4xl font-extrabold" style={{ color: "var(--accent)" }}>{p.price}</span>
                  <span className="text-sm mr-1" style={{ color: "var(--muted)" }}>{p.label}</span>
                </div>
              </div>
              <div className="flex-1 space-y-4 mb-8">
                {[p.pages, p.replies, p.support].map((item, j) => (
                  <div key={j} className="flex items-center gap-3 text-sm">
                    <span style={{ color: "var(--accent)" }}>✓</span>
                    {item}
                  </div>
                ))}
              </div>
              <button className={`btn w-full py-3 ${p.highlight ? "btn-primary" : "btn-outline"}`}>
                {p.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FaqSection() {
  return (
    <section className="relative py-24" dir="rtl" style={{ background: "oklch(12% 0.005 240)" }}>
      <div className="relative z-10 max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-3">أسئلة شائعة</h2>
          <p className="text-base" style={{ color: "var(--muted)" }}>أهم الأسئلة عن SmartBot</p>
        </div>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <details key={i} className="glass rounded-xl p-5" style={{ border: "1px solid var(--border)", animation: `fade-in 0.4s ease-out ${i * 0.06}s both` }}>
              <summary className="font-bold cursor-pointer" style={{ color: "var(--fg)" }}>{faq.q}</summary>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTASection({ onGetStarted }) {
  return (
    <section className="relative py-28 overflow-hidden" dir="rtl">
      <div className="absolute inset-0 mesh-bg" aria-hidden="true" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, oklch(58% 0.195 45), oklch(48% 0.19 45 / .8))" }} />
      <div className="absolute inset-0 opacity-20" aria-hidden="true"
        style={{ backgroundImage: "radial-gradient(circle at 30% 50%, white 0%, transparent 50%), radial-gradient(circle at 70% 50%, white 0%, transparent 50%)" }} />
      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center reveal-up">
        <h2 className="text-3xl lg:text-4xl font-extrabold mb-4" style={{ color: "var(--accent-fg)" }}>
          استعد لتطوير أعمالك
        </h2>
        <p className="text-lg mb-8 opacity-85" style={{ color: "var(--accent-fg)" }}>
          حسّن إدارة صفحات فيسبوك وزد تفاعلك اليوم
        </p>
        <button className="btn text-base px-10 py-3 font-bold magnetic-btn"
          style={{ background: "var(--accent-fg)", color: "var(--accent)", boxShadow: "0 8px 32px oklch(0 0 0 / .2)" }}
          onClick={onGetStarted}>
          ابدأ الآن مجاناً
        </button>
      </div>
    </section>
  )
}

export function Landing({ onGetStarted }) {
  useEffect(() => { document.title = "SmartBot — منصة إدارة فيسبوك" }, [])

  return (
    <div className="page active" style={{ animation: "none", padding: 0 }}>
      <HeroSection onGetStarted={onGetStarted} />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingSection />
      <FaqSection />
      <CTASection onGetStarted={onGetStarted} />
    </div>
  )
}
