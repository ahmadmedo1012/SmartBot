import { useEffect } from "react"

const features = [
  { icon: "🤖", title: "ردود تلقائية ذكية", desc: "ردود آنية ومخصصة لجميع تعليقات ورسائل صفحاتك بتقنية الذكاء الاصطناعي" },
  { icon: "📊", title: "تحليلات وأداء", desc: "تقارير مفصلة عن أداء الصفحات والمنشورات ونسب التفاعل والنمو" },
  { icon: "💬", title: "صندوق وارد موحد", desc: "إدارة جميع المحادثات من صفحة واحدة بواجهة بسيطة وسهلة" },
  { icon: "📅", title: "جدولة المنشورات", desc: "إنشاء وجدولة المنشورات مسبقاً مع تقويم محتوى مرئي" },
  { icon: "🎯", title: "استهداف الجمهور", desc: "تحليل الجمهور واستهداف الفئات المناسبة لزيادة الوصول" },
  { icon: "🔐", title: "أمان وتشفير", desc: "حماية متقدمة للبيانات والاتصالات وفق أعلى معايير الأمان" },
]

const plans = [
  { name: "مجاني", price: "0", label: "د.ل", pages: "صفحة واحدة", replies: "100 رد/شهر", support: "دعم مجتمعي", cta: "ابدأ مجاناً", highlight: false },
  { name: "أساسي", price: "49", label: "د.ل/شهر", pages: "3 صفحات", replies: "ردود غير محدودة", support: "دعم عبر البريد", cta: "اشتراك الآن", highlight: true },
  { name: "احترافي", price: "129", label: "د.ل/شهر", pages: "10 صفحات", replies: "ردود غير محدودة", support: "دعم فني + تقارير PDF", cta: "تواصل معنا", highlight: false },
]

function HeroSection({ onGetStarted }) {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden" dir="rtl">
      {/* Mesh bg */}
      <div className="absolute inset-0 z-0" aria-hidden="true"
        style={{ background: "oklch(14% 0.008 240)" }}>
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "linear-gradient(var(--fg) 1px, transparent 1px), linear-gradient(90deg, var(--fg) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <div className="animate-blob-1 absolute -top-40 right-0 w-[700px] h-[700px]"
          style={{ background: "radial-gradient(ellipse, color-mix(in oklch, var(--accent) 20%, transparent), transparent 70%)" }} />
        <div className="animate-blob-2 absolute -bottom-40 left-0 w-[600px] h-[600px]"
          style={{ background: "radial-gradient(ellipse, color-mix(in oklch, var(--accent) 12%, transparent), transparent 70%)" }} />
        <div className="animate-blob-3 absolute top-1/2 left-1/3 w-[500px] h-[500px]"
          style={{ background: "radial-gradient(ellipse, oklch(55% 0.18 260 / 0.06), transparent 60%)" }} />
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 py-20" style={{ animation: "fade-in 0.6s ease-out" }}>
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="stagger-children space-y-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>S</div>
              <span className="font-bold text-lg" style={{ color: "var(--fg)" }}>SmartBot</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-extrabold leading-tight" style={{ color: "var(--fg)" }}>
              لوحة تحكم ذكية<br />لصفحات فيسبوك
            </h1>
            <p className="text-lg leading-relaxed" style={{ color: "var(--muted)" }}>
              أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك
            </p>
            <div className="flex gap-4 pt-2">
              <button className="btn btn-primary text-base px-8 py-3" onClick={onGetStarted}>
                ابدأ الآن مجاناً
                <span style={{ fontSize: "18px" }}>←</span>
              </button>
              <button className="btn btn-outline text-base px-8 py-3">
                اعرف المزيد
              </button>
            </div>
          </div>

          <div className="hidden lg:flex items-center justify-center">
            <div className="glass-liquid rounded-3xl p-8 w-full max-w-md aspect-[4/3] flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4 opacity-30">📱</div>
                <p className="text-sm" style={{ color: "var(--muted)" }}>واجهة SmartBot</p>
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
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-3">مميزات SmartBot</h2>
          <p className="text-base" style={{ color: "var(--muted)" }}>كل ما تحتاجه لإدارة صفحات فيسبوك بكفاءة</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
          {features.map((f, i) => (
            <div key={i} className="glass card-premium rounded-2xl p-8 text-center"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="text-5xl mb-5">{f.icon}</div>
              <h3 className="text-lg font-bold mb-2">{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section className="relative py-24" dir="rtl"
      style={{ background: "oklch(14% 0.008 240)" }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="animate-blob-1 absolute -top-32 right-1/4 w-[500px] h-[500px]"
          style={{ background: "radial-gradient(ellipse, oklch(62% 0.18 55 / 0.08), transparent 70%)" }} />
      </div>
      <div className="relative z-10 max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-3" style={{ color: "var(--fg)" }}>خطط الأسعار</h2>
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
              }}>
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold mb-1" style={{ color: "var(--fg)" }}>{p.name}</h3>
                <div className="mt-4">
                  <span className="text-4xl font-extrabold" style={{ color: "var(--accent)" }}>{p.price}</span>
                  <span className="text-sm mr-1" style={{ color: "var(--muted)" }}>{p.label}</span>
                </div>
              </div>
              <div className="flex-1 space-y-4 mb-8">
                {[p.pages, p.replies, p.support].map((item, j) => (
                  <div key={j} className="flex items-center gap-3 text-sm" style={{ color: "var(--fg)" }}>
                    <span style={{ color: "var(--accent)" }}>✓</span>
                    {item}
                  </div>
                ))}
              </div>
              <button className={`btn w-full py-3 ${p.highlight ? "btn-primary" : "btn-outline"}`}
                onClick={p.highlight ? undefined : undefined}>
                {p.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTASection({ onGetStarted }) {
  return (
    <section className="relative py-28 overflow-hidden" dir="rtl">
      <div className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, oklch(62% 0.18 55), oklch(55% 0.18 260))",
        }} />
      <div className="absolute inset-0 opacity-20" aria-hidden="true"
        style={{ backgroundImage: "radial-gradient(circle at 30% 50%, white 0%, transparent 50%), radial-gradient(circle at 70% 50%, white 0%, transparent 50%)" }} />
      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl lg:text-4xl font-extrabold mb-4" style={{ color: "var(--accent-fg)" }}>
          استعد لتطوير أعمالك
        </h2>
        <p className="text-lg mb-8 opacity-85" style={{ color: "var(--accent-fg)" }}>
          حسّن إدارة صفحات فيسبوك وزد تفاعلك
        </p>
        <button className="btn text-base px-10 py-3 font-bold"
          style={{
            background: "var(--accent-fg)",
            color: "var(--accent)",
          }}
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
      <PricingSection />
      <CTASection onGetStarted={onGetStarted} />
    </div>
  )
}
