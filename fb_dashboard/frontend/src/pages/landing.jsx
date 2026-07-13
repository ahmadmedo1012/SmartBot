import { useEffect, useState, useRef } from "react"
import { Bot, BarChart3, MessageCircle, Calendar, Target, ShieldCheck, ChevronDown, Star } from "lucide-react"
import { LandingHeader } from "@/components/LandingHeader"
import { LandingFooter } from "@/components/LandingFooter"


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

const testimonials = [
  { name: "أحمد المقريف", role: "صاحب صفحة — طرابلس", text: "منذ استخدام SmartBot زاد تفاعل صفحتنا بشكل ملحوظ. الردود التلقائية وفرت علينا وقتاً كبيراً." },
  { name: "سارة بن غربية", role: "مديرة تسويق — بنغازي", text: "أفضل أداة لإدارة صفحات فيسبوك في ليبيا. التحليلات والتقارير دقيقة جداً." },
  { name: "محمد التواتي", role: "صاحب متجر — مصراتة", text: "البث الجماعي والردود الذكية غيروا طريقة تعاملنا مع العملاء. أنصح الجميع بتجربته." },
]

const clients = ["مقهى الواحة", "مطعم الأصيل", "بيتزا روما", "SOHO", "مخبز النخبة", "صيدلية الشفاء", "متجر الريف", "استوديو أضواء"]

function AnimatedCounter({ value, label, suffix = "" }) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  const counted = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !counted.current) {
        counted.current = true
        const duration = 1500
        const steps = 30
        const stepVal = value / steps
        let current = 0
        const interval = setInterval(() => {
          current += stepVal
          if (current >= value) { setCount(value); clearInterval(interval) }
          else setCount(Math.floor(current))
        }, duration / steps)
      }
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [value])

  return (
    <div ref={ref} className="text-center">
      <div className="text-5xl font-extrabold" style={{ color: "var(--accent)", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
        {count}{suffix}
      </div>
      <div className="text-sm mt-2" style={{ color: "var(--muted)" }}>{label}</div>
    </div>
  )
}

function HeroSection({ onGetStarted }) {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden" dir="rtl">
      <div className="absolute inset-0 z-0" aria-hidden="true" style={{ background: "var(--muted-bg)" }}>
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: "linear-gradient(var(--fg) 1px, transparent 1px), linear-gradient(90deg, var(--fg) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <div className="bg-radial-glow" />
        <div className="animate-blob-1 absolute -top-40 -right-40 w-[900px] h-[900px]"
          style={{ background: "radial-gradient(ellipse, color-mix(in oklch, var(--accent) 20%, transparent), transparent 70%)" }} />
        <div className="animate-blob-2 absolute -bottom-40 -left-40 w-[700px] h-[700px]"
          style={{ background: "radial-gradient(ellipse, color-mix(in oklch, var(--accent) 10%, transparent), transparent 70%)" }} />
      </div>

      <div className="relative z-10 w-full pt-32 pb-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="flex items-center gap-3" style={{ animation: "reveal-blur 0.7s cubic-bezier(0.16,1,0.3,1) both" }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl magnetic-btn"
                  style={{ background: "linear-gradient(135deg, var(--accent), oklch(0.52 0.16 40))", color: "var(--accent-fg)", boxShadow: "var(--shadow-glow)" }}>S</div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xl tracking-tight" style={{ color: "var(--fg)" }}>SmartBot</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "color-mix(in oklch, var(--success) 15%, transparent)", color: "var(--success)" }}>نشط</span>
                </div>
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tighter" style={{ animation: "reveal-blur 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s both" }}>
                <span className="gradient-text">إدارة تفاعل فيسبوك</span>
                <br />بذكاء واحترافية
              </h1>

              <p className="text-lg md:text-xl leading-relaxed max-w-lg" style={{ color: "var(--muted)", animation: "reveal-blur 0.7s cubic-bezier(0.16,1,0.3,1) 0.2s both" }}>
                أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك. المنصة الأولى في ليبيا لإدارة تفاعلك بذكاء
              </p>

              <div className="flex flex-wrap gap-4" style={{ animation: "reveal-blur 0.7s cubic-bezier(0.16,1,0.3,1) 0.3s both" }}>
                <button className="btn btn-primary text-base px-10 py-3.5 magnetic-btn" onClick={onGetStarted}
                  style={{borderRadius: "var(--radius-lg)", fontSize: "15px", fontWeight: 700, boxShadow: "var(--shadow-glow)"}}>
                  ابدأ الآن مجاناً
                </button>
                <button className="btn btn-outline text-base px-10 py-3.5 magnetic-btn" style={{borderRadius: "var(--radius-lg)", fontSize: "15px"}}>
                  اعرف المزيد
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-4 pt-2" style={{ animation: "reveal-blur 0.7s cubic-bezier(0.16,1,0.3,1) 0.4s both" }}>
                <div className="flex -space-x-2" style={{ direction: "ltr" }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} className="w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-bold" style={{ borderColor: "var(--bg)", background: "linear-gradient(135deg, var(--accent), oklch(0.52 0.16 40))", color: "var(--accent-fg)" }}>
                      {["أ", "س", "م", "ن"][i-1]}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-0.5 mb-0.5">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} fill="var(--accent)" />
                    ))}
                  </div>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>أكثر من ٥٠٠ صفحة تثق فينا</span>
                </div>
              </div>
            </div>

            <div className="hidden lg:flex items-center justify-center w-full" style={{ animation: "reveal-scale 0.7s cubic-bezier(0.16,1,0.3,1) 0.15s both" }}>
              <div className="glass-card rounded-3xl overflow-hidden w-full max-w-lg"
                style={{boxShadow: "var(--glass-shadow-lg), var(--shadow-glow)", border: "1px solid var(--glass-border)"}}>
                <svg viewBox="0 0 480 360" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto" role="img" aria-label="لوحة تحكم SmartBot">
                  <rect width="480" height="360" rx="16" fill="url(#dbg)" />
                  <defs>
                    <linearGradient id="dbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#141216"/><stop offset="100%" stopColor="#0d0c0e"/></linearGradient>
                    <linearGradient id="ac" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#c84e00"/><stop offset="100%" stopColor="#9a3a00"/></linearGradient>
                    <linearGradient id="acg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c84e00" stopOpacity="0.2"/><stop offset="100%" stopColor="#c84e00" stopOpacity="0"/></linearGradient>
                  </defs>
                  {/* Top bar */}
                  <rect x="16" y="12" width="448" height="40" rx="10" fill="#1a181d" />
                  <text x="44" y="37" fill="#c84e00" fontSize="11" fontWeight="700" fontFamily="system-ui">SmartBot</text>
                  <rect x="340" y="22" width="20" height="20" rx="6" fill="#c84e00" opacity="0.15"/>
                  <rect x="370" y="22" width="20" height="20" rx="6" fill="#c84e00" opacity="0.15"/>
                  <rect x="400" y="22" width="20" height="20" rx="6" fill="#c84e00" opacity="0.15"/>
                  <circle cx="434" cy="32" r="10" fill="#c84e00" opacity="0.2"/>
                  {/* Stat cards */}
                  <rect x="16" y="64" width="108" height="72" rx="10" fill="#1a181d" stroke="#27252a" strokeWidth="1"/>
                  <rect x="26" y="72" width="22" height="22" rx="6" fill="#c84e00" opacity="0.15"/>
                  <text x="55" y="87" fill="#888" fontSize="8" fontFamily="system-ui">آخر 7 أيام</text>
                  <text x="26" y="118" fill="#f0e6d3" fontSize="20" fontWeight="800" fontFamily="system-ui">١٬٢٨٤</text>
                  <rect x="136" y="64" width="108" height="72" rx="10" fill="#1a181d" stroke="#27252a" strokeWidth="1"/>
                  <rect x="146" y="72" width="22" height="22" rx="6" fill="#22c55e" opacity="0.15"/>
                  <text x="175" y="87" fill="#888" fontSize="8" fontFamily="system-ui">ردود اليوم</text>
                  <text x="146" y="118" fill="#f0e6d3" fontSize="20" fontWeight="800" fontFamily="system-ui">٣٢٧</text>
                  <rect x="256" y="64" width="108" height="72" rx="10" fill="#1a181d" stroke="#27252a" strokeWidth="1"/>
                  <rect x="266" y="72" width="22" height="22" rx="6" fill="#ef4444" opacity="0.15"/>
                  <text x="295" y="87" fill="#888" fontSize="8" fontFamily="system-ui">المتابعون</text>
                  <text x="266" y="118" fill="#f0e6d3" fontSize="20" fontWeight="800" fontFamily="system-ui">١٢٫٥k</text>
                  <rect x="376" y="64" width="88" height="72" rx="10" fill="#1a181d" stroke="#27252a" strokeWidth="1"/>
                  <rect x="386" y="72" width="22" height="22" rx="6" fill="#eab308" opacity="0.15"/>
                  <text x="415" y="87" fill="#888" fontSize="8" fontFamily="system-ui">قواعد</text>
                  <text x="386" y="118" fill="#f0e6d3" fontSize="20" fontWeight="800" fontFamily="system-ui">٣</text>
                  {/* Chart area */}
                  <rect x="16" y="148" width="292" height="128" rx="10" fill="#1a181d" stroke="#27252a" strokeWidth="1"/>
                  <text x="28" y="168" fill="#f0e6d3" fontSize="10" fontWeight="600" fontFamily="system-ui">النشاط اليومي</text>
                  <rect x="36" y="180" width="16" height="44" rx="3" fill="url(#acg)" /><rect x="36" y="224" width="16" height="2" rx="1" fill="#c84e00" />
                  <rect x="58" y="160" width="16" height="64" rx="3" fill="url(#acg)" /><rect x="58" y="224" width="16" height="2" rx="1" fill="#c84e00" />
                  <rect x="80" y="190" width="16" height="34" rx="3" fill="url(#acg)" /><rect x="80" y="224" width="16" height="2" rx="1" fill="#c84e00" />
                  <rect x="102" y="170" width="16" height="54" rx="3" fill="url(#acg)" /><rect x="102" y="224" width="16" height="2" rx="1" fill="#c84e00" />
                  <rect x="124" y="150" width="16" height="74" rx="3" fill="url(#acg)" /><rect x="124" y="224" width="16" height="2" rx="1" fill="#c84e00" />
                  <rect x="146" y="180" width="16" height="44" rx="3" fill="url(#acg)" /><rect x="146" y="224" width="16" height="2" rx="1" fill="#c84e00" />
                  <rect x="168" y="200" width="16" height="24" rx="3" fill="url(#acg)" /><rect x="168" y="224" width="16" height="2" rx="1" fill="#c84e00" />
                  {/* Side panel */}
                  <rect x="320" y="148" width="144" height="128" rx="10" fill="#1a181d" stroke="#27252a" strokeWidth="1"/>
                  <text x="332" y="168" fill="#f0e6d3" fontSize="10" fontWeight="600" fontFamily="system-ui">آخر النشاطات</text>
                  <circle cx="340" cy="187" r="3" fill="#c84e00"/>
                  <text x="350" y="190" fill="#aaa" fontSize="8" fontFamily="system-ui">رد تلقائي جديد</text>
                  <circle cx="340" cy="205" r="3" fill="#666"/>
                  <text x="350" y="208" fill="#aaa" fontSize="8" fontFamily="system-ui">تحديث التحليلات</text>
                  <circle cx="340" cy="223" r="3" fill="#c84e00"/>
                  <text x="350" y="226" fill="#aaa" fontSize="8" fontFamily="system-ui">تمت جدولة منشور</text>
                  <circle cx="340" cy="241" r="3" fill="#666"/>
                  <text x="350" y="244" fill="#aaa" fontSize="8" fontFamily="system-ui">إضافة متابع جديد</text>
                  {/* Bottom actions */}
                  <rect x="16" y="288" width="88" height="32" rx="8" fill="#c84e00"/>
                  <text x="34" y="308" fill="#fff" fontSize="10" fontWeight="700" fontFamily="system-ui">تحديث</text>
                  <rect x="114" y="288" width="88" height="32" rx="8" fill="#1a181d" stroke="#27252a" strokeWidth="1"/>
                  <text x="132" y="308" fill="#ccc" fontSize="10" fontFamily="system-ui">تصدير</text>
                  {/* Glow dot */}
                  <circle cx="24" cy="348" r="4" fill="#22c55e"/><text x="34" y="352" fill="#666" fontSize="8" fontFamily="system-ui">البوت نشط</text>
                  <text x="430" y="352" fill="#444" fontSize="8" fontFamily="system-ui">آخر تحديث: الآن</text>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function StatsSection() {
  return (
    <section className="relative py-16" dir="rtl" style={{background: "var(--muted-bg)"}}>
      <div className="max-w-5xl mx-auto px-6 reveal-stagger">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <AnimatedCounter value={500} suffix="+" label="صفحة نشطة" />
          <AnimatedCounter value={50} suffix="k+" label="رد تلقائي" />
          <AnimatedCounter value={98} suffix="%" label="معدل رضا" />
          <AnimatedCounter value={24} suffix="/7" label="دعم فني" />
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  return (
    <section className="relative py-24 section-padding" dir="rtl">
      <div className="bg-radial-glow" />
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="text-center mb-16 reveal-up">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4" style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}>
            مميزات <span style={{ color: "var(--accent)" }}>SmartBot</span>
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: "var(--muted)" }}>
            كل ما تحتاجه لإدارة صفحات فيسبوك بكفاءة واحترافية
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 reveal-stagger">
          {features.map((f, i) => (
            <div key={i} className="glass-card rounded-2xl p-8 text-center card-premium"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ background: "color-mix(in oklch, var(--accent) 12%, transparent)" }}>
                <f.icon className="w-7 h-7" style={{ color: "var(--accent)" }} />
              </div>
              <h3 className="text-lg font-bold mb-3" style={{ color: "var(--fg)" }}>{f.title}</h3>
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
    <section className="relative py-24" dir="rtl" style={{ background: "var(--muted-bg)" }}>
      <div className="relative z-10 max-w-5xl mx-auto px-6">
        <div className="text-center mb-16 reveal-up">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4" style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}>
            كيف يعمل <span style={{ color: "var(--accent)" }}>SmartBot</span>
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: "var(--muted)" }}>
            ثلاث خطوات فقط لبدء أتمتة ردودك
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 reveal-stagger">
          {steps.map((s, i) => (
            <div key={i} className="text-center">
              <div className="relative w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold"
                style={{ background: "linear-gradient(135deg, color-mix(in oklch, var(--accent) 15%, transparent), transparent)", color: "var(--accent)" }}>
                <span>{s.num}</span>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-0.5" style={{background: "var(--accent-soft)"}} />
                )}
              </div>
              <div className="glass-card rounded-2xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <h3 className="text-xl font-bold mb-3" style={{ color: "var(--fg)" }}>{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TestimonialsSection() {
  return (
    <section className="relative py-24 section-padding" dir="rtl">
      <div className="bg-radial-glow" />
      <div className="relative z-10 max-w-5xl mx-auto px-6">
        <div className="text-center mb-16 reveal-up">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4" style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}>
            ماذا يقول عملاؤنا
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: "var(--muted)" }}>
            آراء حقيقية من مدراء الصفحات الذين يستخدمون SmartBot
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 reveal-stagger">
          {testimonials.map((t, i) => (
            <div key={i} className="glass-card rounded-2xl p-6 card-premium"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="flex gap-1 mb-4">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} className="w-4 h-4" style={{ color: "var(--accent)" }} fill="var(--accent)" />
                ))}
              </div>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--muted)" }}>"{t.text}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: "linear-gradient(135deg, var(--accent), oklch(0.42 0.14 38))", color: "var(--accent-fg)" }}>
                  {t.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-bold" style={{ color: "var(--fg)" }}>{t.name}</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ClientsSection() {
  return (
    <section className="relative py-16" dir="rtl" style={{background: "var(--muted-bg)"}}>
      <div className="max-w-6xl mx-auto px-6">
        <p className="text-center text-sm mb-8" style={{ color: "var(--muted)" }}>موثوق من قبل آلاف المداراء والمتاجر</p>
        <div className="flex flex-wrap justify-center gap-8 gap-y-6 reveal-stagger">
          {clients.map((c, i) => (
            <span key={i} className="text-base font-bold px-4 py-2 rounded-xl"
              style={{ color: "color-mix(in oklch, var(--muted) 50%, transparent)", background: "color-mix(in oklch, var(--border) 20%, transparent)" }}>
              {c}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section className="relative py-24 section-padding" dir="rtl">
      <div className="bg-radial-glow" />
      <div className="relative z-10 max-w-5xl mx-auto px-6">
        <div className="text-center mb-16 reveal-up">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4" style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}>
            خطط <span style={{ color: "var(--accent)" }}>الأسعار</span>
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: "var(--muted)" }}>
            اختر الخطة المناسبة لاحتياجاتك
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 reveal-stagger">
          {plans.map((p, i) => (
            <div key={i}
              className="rounded-2xl p-8 flex flex-col card-premium"
              style={{
                background: p.highlight
                  ? "linear-gradient(135deg, var(--surface), oklch(0.12 0.005 30))"
                  : "var(--surface)",
                border: p.highlight ? "1px solid var(--accent)" : "1px solid var(--border)",
                transform: p.highlight ? "scale(1.05)" : "none",
                boxShadow: p.highlight ? "var(--shadow-glow)" : "var(--shadow-sm)",
              }}>
              {p.highlight && (
                <div className="text-center mb-4">
                  <span className="text-xs px-3 py-1 rounded-full font-bold"
                    style={{background: "var(--accent)", color: "var(--accent-fg)"}}>الأكثر طلباً</span>
                </div>
              )}
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold mb-1" style={{ color: "var(--fg)" }}>{p.name}</h3>
                <div className="mt-4">
                  <span className="text-5xl font-extrabold" style={{ color: "var(--accent)" }}>{p.price}</span>
                  <span className="text-sm mr-1" style={{ color: "var(--muted)" }}>{p.label}</span>
                </div>
              </div>
              <div className="flex-1 space-y-4 mb-8">
                {[p.pages, p.replies, p.support].map((item, j) => (
                  <div key={j} className="flex items-center gap-3 text-sm" style={{ color: "var(--muted)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {item}
                  </div>
                ))}
              </div>
              <button className={`btn w-full py-3 ${p.highlight ? "btn-primary" : "btn-outline"}`}
                style={{borderRadius: "var(--radius-lg)", fontSize: "14px"}}>
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
  const [openIndex, setOpenIndex] = useState(null)

  return (
    <section className="relative py-24" dir="rtl" style={{ background: "var(--muted-bg)" }}>
      <div className="relative z-10 max-w-3xl mx-auto px-6">
        <div className="text-center mb-16 reveal-up">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4" style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}>
            أسئلة <span style={{ color: "var(--accent)" }}>شائعة</span>
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: "var(--muted)" }}>
            أهم الأسئلة عن SmartBot
          </p>
        </div>
        <div className="space-y-3 reveal-stagger">
          {faqs.map((faq, i) => (
            <div key={i}
              className="rounded-2xl overflow-hidden card-premium"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-right"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg)", fontSize: "14px", fontWeight: 600 }}
                aria-expanded={openIndex === i}
              >
                <span>{faq.q}</span>
                <ChevronDown className="w-5 h-5 shrink-0 mr-4"
                  style={{ transform: openIndex === i ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s var(--ease)" }} />
              </button>
              {openIndex === i && (
                <div className="px-5 pb-5">
                  <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{faq.a}</p>
                </div>
              )}
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
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 70%, oklch(0% 0 0)))" }} />
      <div className="absolute inset-0 opacity-20" aria-hidden="true"
        style={{ backgroundImage: "radial-gradient(circle at 30% 50%, white 0%, transparent 50%), radial-gradient(circle at 70% 50%, white 0%, transparent 50%)" }} />
      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-extrabold mb-4" style={{ color: "var(--accent-fg)" }}>
          استعد لتطوير أعمالك
        </h2>
        <p className="text-lg mb-8 opacity-90" style={{ color: "var(--accent-fg)" }}>
          حسّن إدارة صفحات فيسبوك وزد تفاعلك اليوم
        </p>
        <button className="btn text-base px-10 py-3 font-bold magnetic-btn"
          style={{ background: "var(--accent-fg)", color: "var(--accent)", boxShadow: "0 8px 32px oklch(0 0 0 / .2)", borderRadius: "var(--radius-lg)" }}
          onClick={onGetStarted}>
          ابدأ الآن مجاناً
        </button>
      </div>
    </section>
  )
}

function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal-up, .reveal-stagger, .reveal-scale")
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) { if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target) } }
    }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" })
    for (const el of els) obs.observe(el)
    return () => obs.disconnect()
  }, [])
}

export function Landing({ onGetStarted, onNavigate: navigateProp }) {
  useScrollReveal()
  useEffect(() => { document.title = "SmartBot - منصة إدارة فيسبوك" }, [])

  return (
    <div className="page active" style={{ animation: "none", padding: 0 }}>
      <LandingHeader onNavigate={navigateProp} />
      <div style={{ paddingBlockStart: 56 }}>
        <HeroSection onGetStarted={onGetStarted} />
        <StatsSection />
        <FeaturesSection />
        <HowItWorksSection />
        <TestimonialsSection />
        <ClientsSection />
        <PricingSection />
        <FaqSection />
        <CTASection onGetStarted={onGetStarted} />
      </div>
      <LandingFooter onNavigate={navigateProp} />
    </div>
  )
}
