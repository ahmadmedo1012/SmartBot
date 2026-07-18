import { useState } from "react"
import { PublicHeader } from "@/components/PublicHeader"
import { PublicFooter } from "@/components/PublicFooter"
import { GlowPool } from "@/components/GlowPool"
import { SectionContainer } from "@/components/SectionContainer"
import { SectionHeader } from "@/components/SectionHeader"
import { OrangeButton } from "@/components/OrangeButton"

const iconPath = {
  check: "M20 6L9 17l-5-5",
  chevron: "m6 9 6 6 6-6",
  arrow: "M5 12h14 M12 5l7 7-7 7",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
}

function Svg({ d, size = 24, stroke = "var(--orange)", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={style}>
      {d.split(/ M/).map((seg, i) => <path key={i} d={i === 0 ? seg : "M" + seg} />)}
    </svg>
  )
}

const plans = [
  {
    name: "مجاني",
    nameEn: "Free",
    monthly: 0,
    yearly: 0,
    desc: "للبدء والتجربة",
    features: [
      "صفحة واحدة",
      "100 رد تلقائي/شهر",
      "جدولة 5 منشورات",
      "إحصائيات أساسية",
      "دعم عبر الواتساب",
    ],
    popular: false,
  },
  {
    name: "مبتدئ",
    nameEn: "Starter",
    monthly: 29,
    yearly: 290,
    desc: "للنشاطات الصغيرة",
    features: [
      "3 صفحات",
      "ردود غير محدودة",
      "جدولة غير محدودة",
      "بث جماعي",
      "تحليلات متقدمة",
      "دعم فني 24/7",
    ],
    popular: false,
  },
  {
    name: "محترف",
    nameEn: "Pro",
    monthly: 59,
    yearly: 590,
    desc: "للنشاطات المتنامية",
    features: [
      "10 صفحات",
      "ردود غير محدودة",
      "جدولة غير محدودة",
      "بث جماعي ذكي",
      "تقارير متقدمة",
      "إدارة فريق كامل",
      "دعم فني 24/7",
      "استهداف الجمهور",
    ],
    popular: true,
  },
  {
    name: "مؤسسات",
    nameEn: "Enterprise",
    monthly: 99,
    yearly: 990,
    desc: "للشركات الكبرى",
    features: [
      "صفحات غير محدودة",
      "ردود غير محدودة",
      "جدولة غير محدودة",
      "بث جماعي ذكي",
      "تقارير ولوحات تحكم مخصصة",
      "إدارة فريق غير محدود",
      "مدير حساب مخصص",
      "تكامل API مخصص",
      "دعم فني 24/7",
      "أولوية في التحديثات",
    ],
    popular: false,
  },
]

const faqs = [
  {
    q: "هل أحتاج صلاحيات خاصة لربط الصفحة؟",
    a: "تحتاج صلاحية إدارة الصفحة فقط. نطلب أقل الصلاحيات اللازمة للعمل.",
  },
  {
    q: "هل يمكنني الترقية أو تخفيض خطتي لاحقاً؟",
    a: "نعم، يمكنك الترقية في أي وقت وسيتم احتساب الفرق بشكل تناسبي. يمكنك أيضاً تخفيض خطتك في بداية كل دورة فوترة.",
  },
  {
    q: "كم صفحة يمكنني ربطها في كل خطة؟",
    a: "في الخطة المجانية يمكنك ربط صفحة واحدة. المبتدئ يسمح ب 3 صفحات. المحترف يسمح ب 10 صفحات. مؤسسات يسمح بصفحات غير محدودة.",
  },
  {
    q: "هل توجد فترة تجريبية؟",
    a: "نعم! الخطة المجانية متاحة بدون بطاقة ائتمان لتجربة جميع الميزات الأساسية. للخطط المدفوعة، نقدم ضمان استرداد الأموال لمدة 14 يوماً.",
  },
  {
    q: "ماذا يحدث إذا تجاوزت حد الردود الشهري في الخطة المجانية؟",
    a: "في الخطة المجانية، يقتصر الرد على 100 رد شهرياً. للردود غير المحدودة، يمكنك الترقية إلى أي من الخطط المدفوعة.",
  },
  {
    q: "هل يمكنني إلغاء اشتراكي في أي وقت؟",
    a: "نعم بالطبع. يمكنك إلغاء اشتراكك في أي وقت ولن يتم تحصيل أي رسوم إضافية. تبقى الخدمة متاحة حتى نهاية دورة الفوترة الحالية.",
  },
]

export function Pricing() {
  const [yearly, setYearly] = useState(false)

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", overflowX: "hidden" }}>
      <PublicHeader />

      {/* Hero */}
      <section style={{ position: "relative", minHeight: "60vh", display: "flex", alignItems: "center", overflow: "hidden" }}>
        <GlowPool position="top-0 left-1/2" size="70vmin" color="orange" />
        <div style={{ position: "absolute", inset: 0, zIndex: 0, opacity: 0.5, backgroundImage: "radial-gradient(circle, color-mix(in oklch, var(--fg) 6%, transparent) .75px, transparent .75px)", backgroundSize: "20px 20px" }} />
        <div style={{ position: "relative", zIndex: 10, width: "100%", paddingTop: 128, paddingBottom: 96 }}>
          <div style={{ maxWidth: 1220, margin: "0 auto", padding: "0 24px" }}>
            <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
              <h1 style={{ fontSize: "clamp(2rem,6vw,3.5rem)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-.02em", margin: "0 0 16px" }}>
                اختر الخطة <span style={{ color: "var(--orange)" }}>المناسبة لك</span>
              </h1>
              <p style={{ fontSize: "1rem", color: "var(--muted-foreground)", lineHeight: 1.7, margin: "0 auto 32px", maxWidth: 560 }}>
                ابدأ مجاناً، ثم ارتقِ إلى خطة تناسب حجم نشاطك. جميع الخطط تشمل دعمًا فنيًا متكاملًا.
              </p>

              {/* Toggle */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9999, padding: 4 }}>
                <button onClick={() => setYearly(false)}
                  style={{
                    padding: "8px 20px", borderRadius: 9999, border: "none", cursor: "pointer",
                    fontSize: ".8125rem", fontWeight: 600,
                    background: yearly ? "transparent" : "var(--orange)",
                    color: yearly ? "var(--muted)" : "var(--orange-foreground)",
                    transition: "background .2s, color .2s",
                  }}>
                  شهري
                </button>
                <button onClick={() => setYearly(true)}
                  style={{
                    padding: "8px 20px", borderRadius: 9999, border: "none", cursor: "pointer",
                    fontSize: ".8125rem", fontWeight: 600,
                    background: yearly ? "var(--orange)" : "transparent",
                    color: yearly ? "var(--orange-foreground)" : "var(--muted)",
                    transition: "background .2s, color .2s",
                  }}>
                  سنوي
                </button>
              </div>
              {yearly && (
                <div style={{ fontSize: ".75rem", color: "var(--orange)", marginTop: 8, fontWeight: 500 }}>
                  وفر شهرين مجاناً مع الاشتراك السنوي
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Plans */}
      <SectionContainer>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 16,
        }}>
          {plans.map((plan, i) => {
            const price = yearly ? plan.yearly : plan.monthly
            return (
              <div key={i} style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                background: "var(--surface)",
                borderRadius: "var(--radius-sm)",
                border: plan.popular ? "1.5px solid var(--orange)" : "1px solid var(--border)",
                padding: 32,
                textAlign: "center",
                transition: "border-color .2s, box-shadow .2s",
                ...(plan.popular ? { boxShadow: "0 0 30px color-mix(in oklch, var(--orange) 15%, transparent)" } : {}),
              }}>
                {plan.popular && (
                  <div style={{
                    position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
                    fontSize: ".65rem", fontWeight: 700, padding: "6px 16px", borderRadius: 9999,
                    background: "var(--orange)", color: "var(--orange-foreground)",
                    whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <Svg d={iconPath.star} size={10} stroke="currentColor" /> الأكثر طلباً
                  </div>
                )}

                <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 4px" }}>{plan.name}</h3>
                <p style={{ fontSize: ".75rem", color: "var(--muted)", margin: "0 0 16px" }}>{plan.desc}</p>

                <div style={{
                  fontSize: "2.25rem", fontWeight: 800,
                  color: yearly && plan.yearly > 0 ? "color-mix(in srgb, var(--orange) 70%, transparent)" : "var(--orange)",
                  margin: "0 0 4px",
                }}>
                  {price === 0 ? "مجاني" : `$${price}`}
                  <span style={{ fontSize: ".8125rem", fontWeight: 400, color: "var(--muted)", marginInlineStart: 4 }}>
                    {price > 0 ? (yearly ? "/سنة" : "/شهر") : ""}
                  </span>
                </div>
                {yearly && price > 0 && (
                  <div style={{ fontSize: ".6875rem", color: "var(--orange)", margin: "0 0 20px" }}>
                    ${plan.monthly * 12 - plan.yearly} توفير
                  </div>
                )}

                <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0", paddingTop: 16, textAlign: "start", flex: 1 }}>
                  {plan.features.map((f, j) => (
                    <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".8125rem", color: "var(--fg)", padding: "6px 0" }}>
                      <Svg d={iconPath.check} size={14} stroke="var(--orange)" />
                      {f}
                    </div>
                  ))}
                </div>

                {price > 0 ? (
                  <OrangeButton onClick={() => window.location.href = "/subscribe"}>
                    اشترك الآن <Svg d={iconPath.arrow} size={14} stroke="currentColor" />
                  </OrangeButton>
                ) : (
                  <button
                    onClick={() => window.location.href = "/register"}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                      borderRadius: "var(--radius-sm)", fontSize: ".8125rem", fontWeight: 600,
                      height: "2.5rem", padding: "0 1rem", textDecoration: "none", cursor: "pointer",
                      background: "transparent", color: "var(--fg)", border: "1px solid var(--border)",
                      transition: "border-color .2s, background .2s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--orange)"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                  >
                    ابدأ الآن <Svg d={iconPath.arrow} size={14} stroke="var(--orange)" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </SectionContainer>

      {/* FAQ */}
      <section style={{ position: "relative", padding: "96px 0", background: "var(--surface)" }}>
        <GlowPool position="bottom-0 left-0" size="20rem" color="orange" />
        <div style={{ position: "relative", zIndex: 10, maxWidth: 640, margin: "0 auto", padding: "0 24px" }}>
          <SectionHeader title="أسئلة شائعة عن الخطط" subtitle="إجابات سريعة لأكثر الأسئلة تردداً" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {faqs.map((f, i) => (
              <details key={i} style={{
                borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
                background: "var(--bg)", overflow: "hidden",
                transition: "border-color .2s",
              }}>
                <summary style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  cursor: "pointer", listStyle: "none", padding: "14px 20px",
                  fontSize: ".875rem", fontWeight: 500,
                }}>
                  {f.q} <Svg d={iconPath.chevron} size={12} stroke="var(--muted)" />
                </summary>
                <p style={{
                  margin: 0, padding: "0 20px 14px",
                  fontSize: ".8125rem", color: "var(--muted-foreground)", lineHeight: 1.6,
                }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <SectionContainer>
        <div style={{ textAlign: "center", position: "relative" }}>
          <GlowPool position="top-0 left-0" size="20rem" color="orange" />
          <GlowPool position="bottom-0 right-0" size="20rem" color="orange" />
          <div style={{ position: "relative", zIndex: 10 }}>
            <SectionHeader
              title="جاهز للانطلاق؟"
              subtitle={<>انضم إلى <strong>أكثر من ٥٠٠ صفحة</strong> تثق في SmartBot وابدأ رحلة نجاحك اليوم</>}
            />
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <a href="/register" style={{ textDecoration: "none" }}>
                <OrangeButton>ابدأ مجاناً <Svg d={iconPath.arrow} stroke="currentColor" /></OrangeButton>
              </a>
            </div>
            <p style={{ fontSize: ".75rem", color: "var(--muted-foreground)", marginTop: 24, opacity: 0.6 }}>
              مجاناً بدون بطاقة ائتمان · إلغاء في أي وقت · ضمان استرداد الأموال 14 يوماً
            </p>
          </div>
        </div>
      </SectionContainer>

      <PublicFooter />
    </div>
  )
}
