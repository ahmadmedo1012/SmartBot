import { useEffect, useState, useRef } from "react"
import { useMotionValue, useSpring, useTransform } from "framer-motion"
import { Bot, BarChart3, MessageCircle, Calendar, Target, ShieldCheck, Sparkles, ChevronDown, Star, ArrowLeft, Globe, Users } from "lucide-react"
import { BlurOrbs } from "@/components/BlurOrbs"
import { PlanCard } from "@/components/PlanCard"
import { AnnualToggle } from "@/components/AnnualToggle"
import { LandingHeader } from "@/components/LandingHeader"
import { LandingFooter } from "@/components/LandingFooter"
import FloatingWhatsApp from "@/components/FloatingWhatsApp"

const features = [
  { icon: Bot, title: "ردود تلقائية ذكية", desc: "ردود آنية ومخصصة لجميع تعليقات ورسائل صفحاتك بتقنية الذكاء الاصطناعي" },
  { icon: MessageCircle, title: "صندوق وارد موحد", desc: "إدارة جميع المحادثات من صفحة واحدة بواجهة بسيطة وسهلة" },
  { icon: BarChart3, title: "تحليلات وأداء", desc: "تقارير مفصلة عن أداء الصفحات والمنشورات ونسب التفاعل والنمو" },
  { icon: Calendar, title: "جدولة المنشورات", desc: "إنشاء وجدولة المنشورات مسبقاً مع تقويم محتوى مرئي" },
  { icon: Target, title: "استهداف الجمهور", desc: "تحليل الجمهور واستهداف الفئات المناسبة لزيادة الوصول" },
  { icon: ShieldCheck, title: "أمان وتشفير", desc: "حماية متقدمة للبيانات والاتصالات وفق أعلى معايير الأمان" },
  { icon: Globe, title: "دعم متعدد اللغات", desc: 'دعم كامل للغة العربية والإنجليزية مع ردود ذكية بلغة العميل' },
  { icon: Users, title: "إدارة فريق كامل", desc: "إضافة أعضاء فريقك بصلاحيات مختلفة لإدارة الصفحات معاً" },
]

const howItWorks = [
  { num: "١", title: "اربط صفحتك", desc: "اربط صفحة فيسبوك بخطوات بسيطة وآمنة مع دليل تفاعلي خطوة بخطوة" },
  { num: "٢", title: "هيئ قواعد الرد", desc: "حدد الكلمات المفتاحية والردود التلقائية التي تناسب نشاطك التجاري" },
  { num: "٣", title: "راقب الأداء", desc: "تابع الإحصائيات والتقارير وحسّن أداء صفحاتك من لوحة تحكم متكاملة" },
]

const faqs = [
  { q: "هل أحتاج صلاحيات خاصة لربط الصفحة؟", a: "تحتاج صلاحية إدارة الصفحة فقط. نطلب أقل الصلاحيات اللازمة للعمل." },
  { q: "هل بياناتي آمنة؟", a: "جميع البيانات مشفرة. لا نشارك معلومات صفحاتك مع أي جهة خارجية." },
  { q: "كم صفحة يمكنني ربطها؟", a: "يمكنك ربط صفحة واحدة في الخطة المجانية، وحتى 10 صفحات في الخطة الاحترافية." },
  { q: "هل تدعم اللغة العربية كاملاً؟", a: "نعم، الواجهة كاملة بالعربية مع دعم كامل للردود والتعليقات العربية." },
  { q: "ماذا يحدث إذا تجاوزت حد الردود الشهري؟", a: "في الخطة المجانية، يقتصر الرد على 100 رد شهرياً. للردود غير المحدودة، اختر الخطة الأساسية أو الاحترافية." },
  { q: "هل يمكنني تجربة البوت قبل الشراء؟", a: "نعم! يمكنك تجربة لوحة التحكم التجريبية ببيانات وهمية لترى كل الميزات قبل الاشتراك." },
]

function AnimatedCounter({ value, label, suffix = "" }) {
  const ref = useRef(null)
  const [display, setDisplay] = useState(0)
  const count = useMotionValue(0)
  const spring = useSpring(count, { stiffness: 80, damping: 20 })
  const rounded = useTransform(spring, v => Math.floor(v))

  useEffect(() => {
    const unsub = rounded.on("change", setDisplay)
    return () => unsub()
  }, [rounded])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      count.set(value)
      obs.unobserve(el)
    }, { threshold: 0.5 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [value, count])

  return (
    <div ref={ref} className="text-center">
      <div className="text-5xl font-extrabold" style={{ color: "var(--accent)", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
        {display}{suffix}
      </div>
      <div className="text-sm mt-2" style={{ color: "var(--muted)" }}>{label}</div>
    </div>
  )
}

function HeroSection({ onGetStarted }) {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden" dir="rtl">
      <BlurOrbs />
      <div className="absolute inset-0 z-0" aria-hidden="true" style={{ backgroundImage: "radial-gradient(circle, color-mix(in oklch, var(--fg) 6%, transparent) 0.75px, transparent 0.75px)", backgroundSize: "20px 20px", opacity: 0.5 }} />

      <div className="relative z-10 w-full pt-32 pb-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-1.5 rounded-full border" style={{ borderColor: "color-mix(in oklch, var(--accent) 20%, transparent)", background: "color-mix(in oklch, var(--accent) 5%, transparent)", padding: "4px 14px 4px 10px", fontSize: 11, fontWeight: 500, color: "var(--accent)", animation: "reveal-blur 0.7s cubic-bezier(0.16,1,0.3,1) both" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", display: "inline-block", animation: "pulse-dot 1.4s ease-in-out infinite" }} />
                أكثر من ٥٠٠ صفحة تثق فينا
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tighter" style={{ animation: "reveal-blur 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s both" }}>
                <span>إدارة تفاعل فيسبوك</span>
                <br />
                <span style={{ color: "var(--accent)" }}>بذكاء واحترافية</span>
              </h1>

              <div className="w-16 h-0.5 rounded-full" style={{ background: "linear-gradient(to left, transparent, var(--accent), transparent)" }} />

              <p className="text-lg md:text-xl leading-relaxed max-w-lg" style={{ color: "var(--muted)", animation: "reveal-blur 0.7s cubic-bezier(0.16,1,0.3,1) 0.2s both" }}>
                أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك. المنصة الأولى في ليبيا لإدارة تفاعلك بذكاء
              </p>

              <div className="flex flex-wrap gap-4" style={{ animation: "reveal-blur 0.7s cubic-bezier(0.16,1,0.3,1) 0.3s both" }}>
                <button className="btn btn-primary magnetic-btn" onClick={onGetStarted}
                  style={{ borderRadius: "var(--radius-lg)", fontSize: 15, fontWeight: 700, padding: "12px 32px", boxShadow: "var(--shadow-glow)" }}>
                  ابدأ الآن مجاناً <ArrowLeft className="size-4" />
                </button>
                <button className="btn btn-outline" onClick={() => window.location.hash = "#demo"}
                  style={{ borderRadius: "var(--radius-lg)", fontSize: 15, padding: "12px 32px" }}>
                  جرب البوت الآن
                </button>
              </div>

              <div className="flex items-center gap-4 pt-2" style={{ animation: "reveal-blur 0.7s cubic-bezier(0.16,1,0.3,1) 0.4s both" }}>
                <div className="flex" style={{ direction: "ltr" }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} className="w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-bold" style={{ borderColor: "var(--bg)", marginInlineEnd: i < 4 ? -8 : 0, background: "linear-gradient(135deg, var(--accent), oklch(0.52 0.16 40))", color: "var(--accent-fg)" }}>
                      {["أ", "س", "م", "ن"][i-1]}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-0.5 mb-0.5">
                    {[1,2,3,4,5].map(s => <Star key={s} className="w-3.5 h-3.5" style={{ color: "var(--muted)" }} fill="var(--muted)" />)}
                  </div>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>موثوق من آلاف المداراء</span>
                </div>
              </div>
            </div>

            <div className="hidden lg:flex items-center justify-center w-full" style={{ animation: "reveal-scale 0.7s cubic-bezier(0.16,1,0.3,1) 0.15s both" }}>
              <div className="glass-card rounded-3xl overflow-hidden w-full max-w-lg" style={{ boxShadow: "var(--glass-shadow-lg), var(--shadow-glow)", border: "1px solid var(--glass-border)" }}>
                <svg viewBox="0 0 480 360" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto" role="img" aria-label="لوحة تحكم SmartBot">
                  <rect width="480" height="360" rx="16" fill="url(#dbg)" />
                  <defs>
                    <linearGradient id="dbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="oklch(0.08 0.003 30)"/><stop offset="100%" stopColor="oklch(0.05 0.002 30)"/></linearGradient>
                    <linearGradient id="ac" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="oklch(0.55 0.19 45)"/><stop offset="100%" stopColor="oklch(0.42 0.18 40)"/></linearGradient>
                    <linearGradient id="acg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="oklch(0.55 0.19 45 / 0.2)"/><stop offset="100%" stopColor="oklch(0.55 0.19 45 / 0)"/></linearGradient>
                  </defs>
                  <rect x="16" y="12" width="448" height="40" rx="10" fill="#1a181d" />
                  <text x="44" y="37" fill="var(--accent)" fontSize="11" fontWeight="700" fontFamily="system-ui">SmartBot</text>
                  <rect x="340" y="22" width="20" height="20" rx="6" fill="var(--accent)" opacity="0.15"/>
                  <rect x="370" y="22" width="20" height="20" rx="6" fill="var(--accent)" opacity="0.15"/>
                  <rect x="400" y="22" width="20" height="20" rx="6" fill="var(--accent)" opacity="0.15"/>
                  <circle cx="434" cy="32" r="10" fill="var(--accent)" opacity="0.2"/>
                  <rect x="16" y="64" width="108" height="72" rx="10" fill="#1a181d" stroke="#27252a" strokeWidth="1"/>
                  <rect x="26" y="72" width="22" height="22" rx="6" fill="var(--accent)" opacity="0.15"/>
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
                  <rect x="16" y="148" width="292" height="128" rx="10" fill="#1a181d" stroke="#27252a" strokeWidth="1"/>
                  <text x="28" y="168" fill="#f0e6d3" fontSize="10" fontWeight="600" fontFamily="system-ui">النشاط اليومي</text>
                  <rect x="36" y="180" width="16" height="44" rx="3" fill="url(#acg)" /><rect x="36" y="224" width="16" height="2" rx="1" fill="var(--accent)" />
                  <rect x="58" y="160" width="16" height="64" rx="3" fill="url(#acg)" /><rect x="58" y="224" width="16" height="2" rx="1" fill="var(--accent)" />
                  <rect x="80" y="190" width="16" height="34" rx="3" fill="url(#acg)" /><rect x="80" y="224" width="16" height="2" rx="1" fill="var(--accent)" />
                  <rect x="102" y="170" width="16" height="54" rx="3" fill="url(#acg)" /><rect x="102" y="224" width="16" height="2" rx="1" fill="var(--accent)" />
                  <rect x="124" y="150" width="16" height="74" rx="3" fill="url(#acg)" /><rect x="124" y="224" width="16" height="2" rx="1" fill="var(--accent)" />
                  <rect x="146" y="180" width="16" height="44" rx="3" fill="url(#acg)" /><rect x="146" y="224" width="16" height="2" rx="1" fill="var(--accent)" />
                  <rect x="168" y="200" width="16" height="24" rx="3" fill="url(#acg)" /><rect x="168" y="224" width="16" height="2" rx="1" fill="var(--accent)" />
                  <rect x="320" y="148" width="144" height="128" rx="10" fill="#1a181d" stroke="#27252a" strokeWidth="1"/>
                  <text x="332" y="168" fill="#f0e6d3" fontSize="10" fontWeight="600" fontFamily="system-ui">آخر النشاطات</text>
                  <circle cx="340" cy="187" r="3" fill="var(--accent)"/>
                  <text x="350" y="190" fill="#aaa" fontSize="8" fontFamily="system-ui">رد تلقائي جديد</text>
                  <circle cx="340" cy="205" r="3" fill="#666"/>
                  <text x="350" y="208" fill="#aaa" fontSize="8" fontFamily="system-ui">تحديث التحليلات</text>
                  <circle cx="340" cy="223" r="3" fill="var(--accent)"/>
                  <text x="350" y="226" fill="#aaa" fontSize="8" fontFamily="system-ui">تمت جدولة منشور</text>
                  <circle cx="340" cy="241" r="3" fill="#666"/>
                  <text x="350" y="244" fill="#aaa" fontSize="8" fontFamily="system-ui">إضافة متابع جديد</text>
                  <rect x="16" y="288" width="88" height="32" rx="8" fill="var(--accent)"/>
                  <text x="34" y="308" fill="#fff" fontSize="10" fontWeight="700" fontFamily="system-ui">تحديث</text>
                  <rect x="114" y="288" width="88" height="32" rx="8" fill="#1a181d" stroke="#27252a" strokeWidth="1"/>
                  <text x="132" y="308" fill="#ccc" fontSize="10" fontFamily="system-ui">تصدير</text>
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
    <section className="relative py-16" dir="rtl" style={{ background: "var(--muted-bg)" }}>
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
      <BlurOrbs />
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="text-center mb-16 reveal-up">
          <div className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium mb-4" style={{ borderColor: "color-mix(in oklch, var(--accent) 20%, transparent)", color: "var(--accent)" }}>
            <Sparkles className="size-3" /> إليك ما يمكنك تحقيقه معنا
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4" style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}>
            ميزات متكاملة <span style={{ color: "var(--accent)" }}>لإدارة صفحاتك</span>
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: "var(--muted)" }}>
            كل ما تحتاجه لإدارة صفحات فيسبوك بكفاءة واحترافية
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 reveal-stagger">
          {features.map((f, i) => (
            <div key={i} className="group rounded-sm p-4 md:p-6 lg:p-8 transition-colors duration-300"
              style={{ background: "var(--card)", border: "1px solid", borderColor: i === 0 ? "color-mix(in oklch, var(--accent) 30%, transparent)" : "color-mix(in oklch, var(--border) 50%, transparent)", minWidth: 0 }}>
              <div className="relative">
                {i === 0 && (
                  <span style={{ position: "absolute", top: -12, insetInlineEnd: -12, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "var(--accent)", color: "var(--accent-fg)" }}>
                    الأكثر طلباً
                  </span>
                )}
                <div className="size-10 sm:size-12 rounded-sm flex items-center justify-center mb-4 transition-colors duration-300"
                  style={{ background: i === 0 ? "color-mix(in oklch, var(--accent) 15%, transparent)" : "color-mix(in oklch, var(--accent) 10%, transparent)" }}>
                  <f.icon className="size-5 sm:size-6" style={{ color: "var(--accent)" }} />
                </div>
              </div>
              <h3 className="text-base sm:text-lg font-medium mb-2">{f.title}</h3>
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
          {howItWorks.map((s, i) => (
            <div key={i} className="text-center">
              <div className="relative w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold"
                style={{ background: "linear-gradient(135deg, color-mix(in oklch, var(--accent) 15%, transparent), transparent)", color: "var(--accent)" }}>
                <span>{s.num}</span>
                {i < howItWorks.length - 1 && (
                  <div className="hidden md:block absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-0.5" style={{ background: "var(--accent-soft)" }} />
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
  const testimonials = [
    { name: "أحمد السالمي", role: "صاحب صفحة — طرابلس", text: "منذ استخدام SmartBot زاد تفاعل صفحتنا بشكل ملحوظ. الردود التلقائية وفرت علينا وقتاً كبيراً." },
    { name: "سارة النفاتي", role: "مديرة تسويق — بنغازي", text: "أفضل أداة لإدارة صفحات فيسبوك في ليبيا. التحليلات والتقارير دقيقة جداً." },
    { name: "محمد الكيلاني", role: "صاحب متجر إلكتروني — مصراتة", text: "البث الجماعي والردود الذكية غيروا طريقة تعاملنا مع العملاء. أنصح الجميع بتجربته." },
  ]

  return (
    <section className="relative py-24 section-padding" dir="rtl">
      <BlurOrbs />
      <div className="relative z-10 max-w-5xl mx-auto px-6">
        <div className="text-center mb-16 reveal-up">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4" style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}>
            ماذا يقول <span style={{ color: "var(--accent)" }}>عملاؤنا</span>
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: "var(--muted)" }}>
            آراء حقيقية من مدراء الصفحات الذين يستخدمون SmartBot
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 reveal-stagger">
          {testimonials.map((t, i) => (
            <div key={i} className="rounded-sm p-6" style={{ background: "var(--card)", border: "1px solid color-mix(in oklch, var(--border) 50%, transparent)" }}>
              <div className="flex gap-1 mb-4">
                {[1,2,3,4,5].map(s => <Star key={s} className="w-4 h-4" style={{ color: "var(--accent)" }} fill="var(--accent)" />)}
              </div>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--muted)" }}>"{t.text}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "linear-gradient(135deg, var(--accent), oklch(0.42 0.14 38))", color: "var(--accent-fg)" }}>
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

function ClientLogos() {
  const clients = ["متجر أضواء الإلكتروني", "أكاديمية التعليم الذكي", "وكالة تسويق 360", "منصة متجر الإلكتروني"]
  return (
    <section className="relative py-16" dir="rtl" style={{ background: "var(--muted-bg)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <p className="text-center text-sm mb-8" style={{ color: "var(--muted)" }}>موثوق من قبل آلاف المداراء والمتاجر</p>
        <div className="flex flex-wrap justify-center gap-8 gap-y-6 reveal-stagger">
          {clients.map((c, i) => (
            <span key={i} className="text-base font-bold px-4 py-2 rounded-xl" style={{ color: "color-mix(in oklch, var(--muted) 50%, transparent)", background: "color-mix(in oklch, var(--border) 20%, transparent)" }}>
              {c}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  const [annual, setAnnual] = useState(false)
  const [plans, setPlans] = useState(null)

  useEffect(() => {
    fetch("/api/plans").then(r => r.json()).then(setPlans).catch(() => {})
  }, [])

  const defaultPlans = [
    { id: 1, name: "Free", name_ar: "مجاني", price: 0, max_replies: 100, max_pages: 1, max_rules: 5, features: ["ردود تلقائية (100/شهر)", "صفحة فيسبوك واحدة", "5 قواعد رد", "إحصائيات أساسية"] },
    { id: 2, name: "Basic", name_ar: "أساسي", price: 19, max_replies: 2000, max_pages: 1, max_rules: 20, features: ["2,000 رد/شهر", "رد خاص + ذكاء اصطناعي", "تقارير أسبوعية", "دعم فوري"] },
    { id: 3, name: "Premium", name_ar: "مميز", price: 29, max_replies: 10000, max_pages: 2, max_rules: 50, features: ["10,000 رد/شهر", "صفحتين + بث جماعي", "جدولة + تقارير PDF", "محرك العروض", "تحليلات متقدمة"] },
    { id: 4, name: "Pro", name_ar: "احترافي", price: 129, max_replies: 50000, max_pages: 5, max_rules: 100, features: ["50,000 رد/شهر", "5 صفحات + كل الميزات", "حملات تسلسلية", "فريق حتى 5", "دعم ممتاز"] },
    { id: 5, name: "Enterprise", name_ar: "مؤسسي", price: 299, max_replies: 999999, max_pages: 999, max_rules: 999, features: ["غير محدود", "كل الميزات", "فريق غير محدود", "دعم 24/7"] },
  ]

  const displayPlans = plans || defaultPlans

  return (
    <section className="relative py-24 section-padding" dir="rtl" id="pricing">
      <BlurOrbs />
      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <div className="text-center mb-16 reveal-up">
          <div className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium mb-4" style={{ borderColor: "color-mix(in oklch, var(--accent) 20%, transparent)", color: "var(--accent)" }}>
            <Sparkles className="size-3" /> خطط مرنة تناسب الجميع
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4" style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}>
            خطط <span style={{ color: "var(--accent)" }}>الأسعار</span>
          </h2>
          <p className="text-base max-w-2xl mx-auto mb-8" style={{ color: "var(--muted)" }}>
            اختر الخطة المناسبة لاحتياجاتك
          </p>
          <AnnualToggle annual={annual} onChange={setAnnual} />
        </div>
        <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4 reveal-stagger">
          {displayPlans.map((p, i) => (
            <PlanCard key={p.id} plan={p} index={i} annual={annual} />
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
            إجابات سريعة لأكثر الأسئلة تردداً
          </p>
        </div>
        <div className="max-w-2xl mx-auto space-y-2">
          {faqs.map((faq, i) => (
            <details key={i} className="group rounded-sm overflow-hidden transition-all duration-200" style={{ border: "1px solid", borderColor: openIndex === i ? "color-mix(in oklch, var(--border) 60%, transparent)" : "color-mix(in oklch, var(--border) 40%, transparent)", background: "var(--card)" }}
              onToggle={(e) => setOpenIndex(e.target.open ? i : null)}>
              <summary className="flex items-center justify-between cursor-pointer text-sm sm:text-base font-medium list-none px-4 sm:px-5 py-3 sm:py-4" style={{ color: "var(--fg)" }}>
                {faq.q}
                <ChevronDown className="size-3 shrink-0 ms-2 transition-transform duration-300" style={{ color: "color-mix(in oklch, var(--muted) 50%, transparent)" }} />
              </summary>
              <div className="px-4 sm:px-5 pb-3 sm:pb-4">
                <p className="text-xs sm:text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{faq.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTASection({ onGetStarted }) {
  return (
    <section className="relative py-28 overflow-hidden" dir="rtl" style={{ borderTop: "1px solid color-mix(in oklch, var(--accent) 10%, transparent)" }}>
      <BlurOrbs />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vmin] h-[60vmin] rounded-full pointer-events-none z-0" style={{ border: "1px solid color-mix(in oklch, var(--accent) 10%, transparent)" }} />

      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium mb-4" style={{ borderColor: "color-mix(in oklch, var(--accent) 20%, transparent)", color: "var(--accent)" }}>
          <Sparkles className="size-3" /> جهّز صفحتك للانطلاق
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold mb-4" style={{ color: "var(--fg)" }}>
          استعد <span style={{ color: "var(--accent)" }}>لتطوير أعمالك</span>
        </h2>
        <p className="text-lg mb-8" style={{ color: "var(--muted)" }}>
          حسّن إدارة صفحات فيسبوك وزد تفاعلك اليوم — انضم إلى <strong style={{ color: "var(--fg)" }}>أكثر من ٥٠٠ صفحة</strong> تثق في SmartBot
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <button className="btn btn-primary magnetic-btn" onClick={onGetStarted}
            style={{ borderRadius: "var(--radius-lg)", fontSize: 15, fontWeight: 700, padding: "12px 32px", boxShadow: "var(--shadow-glow)" }}>
            ابدأ الآن مجاناً <ArrowLeft className="size-4" />
          </button>
          <button className="btn btn-outline" onClick={() => window.location.hash = "#pricing"}
            style={{ borderRadius: "var(--radius-lg)", fontSize: 15, padding: "12px 32px" }}>
            عرض الخطط
          </button>
        </div>
        <p className="text-xs mt-6" style={{ color: "color-mix(in oklch, var(--muted) 60%, transparent)" }}>
          مجاناً بدون بطاقة ائتمان · إلغاء في أي وقت · دعم فني متكامل
        </p>
      </div>
    </section>
  )
}

function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal-up, .reveal-stagger, .reveal-scale, .reveal-card")
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
        <ClientLogos />
        <PricingSection />
        <FaqSection />
        <CTASection onGetStarted={onGetStarted} />
      </div>
      <LandingFooter onNavigate={navigateProp} />
      <FloatingWhatsApp />
    </div>
  )
}