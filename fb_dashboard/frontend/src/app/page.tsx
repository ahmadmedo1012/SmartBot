"use client"

import { useEffect, useState } from "react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import FloatingWhatsApp from "@/components/shared/FloatingWhatsApp"
import { Button } from "@/components/ui/button"
import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { GlowPool } from "@/components/ui/GlowPool"
import { motion } from "framer-motion"
import { springDefault, springSnappy, springGentle } from "@/lib/motion"
import { Sparkles, ChevronDown, Star, ArrowLeft, Bot, BarChart3, MessageCircle, Calendar, Target, ShieldCheck, Globe, Users, ArrowRight } from "lucide-react"
import Link from "next/link"

const features = [
  { icon: Bot, title: "ردود تلقائية ذكية", desc: "ردود آنية ومخصصة لجميع تعليقات ورسائل صفحاتك بتقنية الذكاء الاصطناعي" },
  { icon: MessageCircle, title: "صندوق وارد موحد", desc: "إدارة جميع المحادثات من صفحة واحدة بواجهة بسيطة وسهلة" },
  { icon: BarChart3, title: "تحليلات وأداء", desc: "تقارير مفصلة عن أداء الصفحات والمنشورات ونسب التفاعل والنمو" },
  { icon: Calendar, title: "جدولة المنشورات", desc: "إنشاء وجدولة المنشورات مسبقاً مع تقويم محتوى مرئي" },
  { icon: Target, title: "استهداف الجمهور", desc: "تحليل الجمهور واستهداف الفئات المناسبة لزيادة الوصول" },
  { icon: ShieldCheck, title: "أمان وتشفير", desc: "حماية متقدمة للبيانات والاتصالات وفق أعلى معايير الأمان" },
  { icon: Globe, title: "دعم متعدد اللغات", desc: "دعم كامل للغة العربية والإنجليزية مع ردود ذكية بلغة العميل" },
  { icon: Users, title: "إدارة فريق كامل", desc: "إضافة أعضاء فريقك بصلاحيات مختلفة لإدارة الصفحات معاً" },
]

const steps = [
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

const testimonials = [
  { name: "أحمد السالمي", role: "صاحب صفحة - طرابلس", text: "منذ استخدام SmartBot زاد تفاعل صفحتنا بشكل ملحوظ. الردود التلقائية وفرت علينا وقتاً كبيراً." },
  { name: "سارة النفاتي", role: "مديرة تسويق - بنغازي", text: "أفضل أداة لإدارة صفحات فيسبوك في ليبيا. التحليلات والتقارير دقيقة جداً." },
  { name: "محمد الكيلاني", role: "صاحب متجر إلكتروني - مصراتة", text: "البث الجماعي والردود الذكية غيروا طريقة تعاملنا مع العملاء. أنصح الجميع بتجربته." },
]

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden">
      <Header />

      {/* Hero */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <GlowPool position="top-0 left-1/2 -translate-x-1/2" size="size-[70vmin]" color="orange/10" />
        <div className="absolute inset-0 z-0 opacity-50" style={{ backgroundImage: "radial-gradient(circle, color-mix(in oklch, var(--foreground) 6%, transparent) 0.75px, transparent 0.75px)", backgroundSize: "20px 20px" }} />
        <div className="relative z-10 w-full pt-32 pb-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-8">
                <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.05 }}
                  className="eyebrow">
                  <span className="size-1.5 rounded-full bg-orange animate-pulse-dot" />
                  أكثر من ٥٠٠ صفحة تثق فينا
                </motion.div>
                <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.1 }}
                  className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tighter font-heading">
                  إدارة تفاعل فيسبوك<br />
                  <span className="text-orange">بذكاء واحترافية</span>
                </motion.h1>
                <div className="w-16 h-0.5 rounded-full bg-gradient-to-l from-orange/0 via-orange to-orange/0" />
                <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.2 }}
                  className="text-lg md:text-xl leading-relaxed max-w-lg text-muted-foreground">
                  أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك. المنصة الأولى في ليبيا
                </motion.p>
                <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springDefault, delay: 0.3 }}
                  className="flex flex-wrap gap-4">
                  <Link href="/subscribe">
                    <Button size="lg" className="text-base">ابدأ الآن مجاناً <ArrowLeft className="size-4 rtl:-scale-x-100" /></Button>
                  </Link>
                  <Link href="/demo">
                    <Button variant="outline" size="lg" className="text-base">جرب البوت الآن</Button>
                  </Link>
                </motion.div>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...springDefault, delay: 0.4 }}
                  className="flex items-center gap-4 pt-2">
                  <div className="flex -space-x-2" style={{ direction: "ltr" }}>
                    {["أ", "س", "م", "ن"].map((l, i) => (
                      <div key={i} className="size-9 rounded-full border-2 border-background flex items-center justify-center text-xs font-bold bg-gradient-to-br from-orange to-orange/80 text-orange-foreground">{l}</div>
                    ))}
                  </div>
                  <div>
                    <div className="flex gap-0.5">{[1,2,3,4,5].map(s => <Star key={s} className="size-3.5 fill-muted text-muted" />)}</div>
                    <span className="text-xs text-muted-foreground">موثوق من آلاف المداراء</span>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-card/50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[{ v: "500+", l: "صفحة نشطة" }, { v: "50k+", l: "رد تلقائي" }, { v: "98%", l: "معدل رضا" }, { v: "24/7", l: "دعم فني" }].map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-5xl font-extrabold text-orange tabular-nums leading-[1.1]">{s.v}</div>
                <div className="text-sm mt-2 text-muted-foreground">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <SectionContainer>
        <SectionHeader eyebrow="إليك ما يمكنك تحقيقه معنا" title="ميزات متكاملة لإدارة صفحاتك" subtitle="كل ما تحتاجه لإدارة صفحات فيسبوك بكفاءة واحترافية" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }}
              transition={{ ...springDefault, delay: i * 0.06 }}
              className={`group rounded-sm bg-card border p-4 md:p-6 transition-colors ${i === 0 ? "border-orange/30" : "border-border/50 hover:border-orange/30"}`}>
              {i === 0 && <span className="absolute -top-3 -end-3 text-[10px] font-bold px-2 py-0.5 rounded-sm bg-orange text-orange-foreground">الأكثر طلباً</span>}
              <div className={`size-10 sm:size-12 rounded-sm flex items-center justify-center mb-4 ${i === 0 ? 'bg-orange/15' : 'bg-orange/10 group-hover:bg-orange/20'}`}>
                <f.icon className="size-5 sm:size-6 text-orange" />
              </div>
              <h3 className="text-base sm:text-lg font-medium mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </SectionContainer>

      {/* How it works */}
      <section className="relative py-24 bg-card/50">
        <div className="relative z-10 max-w-5xl mx-auto px-6">
          <SectionHeader title="كيف يعمل SmartBot" subtitle="ثلاث خطوات فقط لبدء أتمتة ردودك" />
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <div key={i} className="text-center">
                <div className="relative size-20 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold text-orange"
                  style={{ background: "linear-gradient(135deg, color-mix(in oklch, var(--orange) 15%, transparent), transparent)" }}>
                  <span>{s.num}</span>
                  {i < steps.length - 1 && <div className="hidden md:block absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-0.5 bg-orange/30" />}
                </div>
                <div className="glass-card rounded-sm p-6">
                  <h3 className="text-xl font-bold mb-3">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <SectionContainer>
        <SectionHeader title="ماذا يقول عملاؤنا" subtitle="آراء حقيقية من مدراء الصفحات الذين يستخدمون SmartBot" />
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ ...springGentle, delay: i * 0.1 }}
              className="rounded-sm p-6 bg-card border border-border/50">
              <div className="flex gap-1 mb-4">{[1,2,3,4,5].map(s => <Star key={s} className="size-4 fill-orange text-orange" />)}</div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">"{t.text}"</p>
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full flex items-center justify-center text-sm font-bold bg-gradient-to-br from-orange to-orange/70 text-orange-foreground">{t.name.charAt(0)}</div>
                <div>
                  <div className="text-sm font-bold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </SectionContainer>

      {/* FAQ */}
      <section className="relative py-24 bg-card/50">
        <div className="relative z-10 max-w-3xl mx-auto px-6">
          <SectionHeader title="أسئلة شائعة" subtitle="إجابات سريعة لأكثر الأسئلة تردداً"
            icon={<Sparkles className="size-3" />} />
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={springGentle} className="max-w-2xl mx-auto space-y-3">
            {faqs.map((faq, i) => (
              <details key={i} className="group rounded-sm border border-border/40 bg-card open:border-border/60 transition-all">
                <summary className="flex items-center justify-between cursor-pointer text-sm sm:text-base font-medium list-none px-4 sm:px-5 py-3 sm:py-4">
                  {faq.q}
                  <ChevronDown className="size-3 text-muted-foreground/50 group-open:rotate-180 transition-transform shrink-0 ms-2" />
                </summary>
                <div className="grid grid-rows-[0fr] group-open:grid-rows-[1fr] transition-all duration-300">
                  <div className="overflow-hidden">
                    <p className="px-4 sm:px-5 pb-3 sm:pb-4 text-xs sm:text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                  </div>
                </div>
              </details>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <SectionContainer className="border-t border-orange/10 relative">
        <GlowPool position="top-0 start-0" size="size-80 sm:size-96" color="orange/30" />
        <GlowPool position="bottom-0 end-0" size="size-80 sm:size-96" color="orange/25" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[60vmin] rounded-full border border-orange/10 pointer-events-none z-0" />
        <div className="relative z-10 text-center">
          <SectionHeader
            icon={<Sparkles className="size-3" />}
            title="جهّز صفحتك للانطلاق الرقمي"
            subtitle={<>انطلق الآن — انضم إلى <strong className="text-foreground">أكثر من ٥٠٠ صفحة</strong> تثق في SmartBot</>}
          />
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ ...springSnappy, delay: 0.4 }} className="flex gap-4 justify-center flex-wrap">
            <Link href="/subscribe">
              <Button size="lg">ابدأ مجاناً <ArrowRight className="size-4" /></Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" size="lg">عرض الخطط</Button>
            </Link>
          </motion.div>
          <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            transition={{ ...springDefault, delay: 0.5 }}
            className="text-xs text-muted-foreground/60 mt-6">
            مجاناً بدون بطاقة ائتمان · إلغاء في أي وقت · دعم فني متكامل
          </motion.p>
        </div>
      </SectionContainer>

      <Footer />
      <FloatingWhatsApp />
    </div>
  )
}
