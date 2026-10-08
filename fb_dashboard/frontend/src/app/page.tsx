/* r128 Stage B (F3b) — the SmartBot landing assembled as the Madarek
   journey (PORT-KIT §5 skeleton, §6 Bot column):
   المدار (hero sky) → شريط القدرات (marquee) → الثقة → مدار الميزات
   → رحلة التشغيل (5 stations + light path) → قصة التقدّم (--sp rings)
   → القنوات (ground plate) → الأدوار → نقطة البداية (+ compact FAQ).

   The page stays a SERVER component — the h1 and hero sub render inline
   (instant-paint LCP doctrine, v6 §D); client islands are exactly:
   LandingHeader (chrome/spy/menus), HeroDepthLayer (parallax),
   OrbitScene (the r129 canvas engine port), LandingStage (intro-seen),
   MagneticGoldLink (CTA pull), TrustBand + ProgressSection (public
   stats + CountUp), JourneySection (light path + --sp), and the
   RevealCssClass observers. HeroMockup + the flat HeroOrbits chart are
   retired. */
import "./landing.css";
import { Check, MessageCircle, Languages } from "lucide-react";
import { RevealCssClass } from "@/hooks/useReveal";
import { LandingStage } from "@/components/landing/LandingStage";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroDepthLayer } from "@/components/landing/HeroDepthLayer";
import { OrbitScene } from "@/components/landing/OrbitScene";
import { MagneticGoldLink } from "@/components/landing/MagneticGoldLink";
import { LandingMarquee } from "@/components/landing/LandingMarquee";
import { TrustBand } from "@/components/landing/TrustBand";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { JourneySection } from "@/components/landing/JourneySection";
import { ProgressSection } from "@/components/landing/ProgressSection";
import { PlateSection } from "@/components/landing/PlateSection";
import { RolesSection } from "@/components/landing/RolesSection";
import { FinaleCta } from "@/components/landing/FinaleCta";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { LandingFooter } from "@/components/landing/LandingFooter";

const SITE_URL = process.env.NEXT_PUBLIC_DOMAIN || "https://bot.smart-link.ly";

// ── Schema.org: Organization + WebSite (plan §8.1) ──
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "SmartBot",
  url: SITE_URL,
  logo: `${SITE_URL}/brand-icon.png`,
  description: "منصة إدارة صفحات فيسبوك الذكية — أتمتة الردود والتحليلات لصفحات فيسبوك في ليبيا",
  areaServed: { "@type": "Country", name: "Libya" },
  knowsLanguage: ["ar", "en"],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    availableLanguage: ["Arabic", "English"],
    hoursAvailable: "Mo-Su 00:00-24:00",
  },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "SmartBot",
  url: SITE_URL,
  inLanguage: "ar-LY",
  publisher: { "@type": "Organization", name: "SmartBot" },
};

// ── Schema.org: SoftwareApplication + AggregateOffer (plan §8.1 Product) ──
// Prices mirror the DB seed (runner.py _seed_subscription_plans): 0/19/29/129/299 LYD/month
const productSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SmartBot",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "ar",
  url: SITE_URL,
  description: "منصة أتمتة الردود والتحليلات لصفحات فيسبوك — الردود التلقائية، الرسائل الجماعية، التقارير، وحملات تسويقية متقدمة",
  featureList: [
    "ردود تلقائية ذكية على التعليقات",
    "ردود خاصة (DM) تلقائية",
    "بث جماعي للرسائل",
    "جدولة المنشورات",
    "تحليلات وتقارير PDF",
    "حملات تسويقية بالمستهدفين",
  ],
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "LYD",
    lowPrice: "0",
    highPrice: "299",
    offerCount: 5,
    offers: [
      { "@type": "Offer", name: "مجاني", price: "0", priceCurrency: "LYD", description: "100 رد/شهر، صفحة واحدة" },
      { "@type": "Offer", name: "أساسي", price: "19", priceCurrency: "LYD", description: "2,000 رد/شهر + ذكاء اصطناعي" },
      { "@type": "Offer", name: "مميز", price: "29", priceCurrency: "LYD", description: "10,000 رد/شهر + بث وجدولة" },
      { "@type": "Offer", name: "احترافي", price: "129", priceCurrency: "LYD", description: "50,000 رد/شهر + حملات تسلسلية" },
      { "@type": "Offer", name: "مؤسسي", price: "299", priceCurrency: "LYD", description: "غير محدود + دعم 24/7" },
    ],
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    { "@type": "Question", name: "هل أحتاج صلاحيات خاصة لربط الصفحة؟", acceptedAnswer: { "@type": "Answer", text: "تحتاج صلاحية إدارة الصفحة فقط. نطلب أقل الصلاحيات اللازمة للعمل." } },
    { "@type": "Question", name: "هل بياناتي آمنة؟", acceptedAnswer: { "@type": "Answer", text: "جميع البيانات مشفرة. لا نشارك معلومات صفحاتك مع أي جهة خارجية." } },
    { "@type": "Question", name: "كم صفحة يمكنني ربطها؟", acceptedAnswer: { "@type": "Answer", text: "يمكنك ربط صفحة واحدة في الخطة المجانية، وحتى 10 صفحات في الخطة الاحترافية." } },
    { "@type": "Question", name: "هل تدعم اللغة العربية كاملاً؟", acceptedAnswer: { "@type": "Answer", text: "نعم، الواجهة كاملة بالعربية مع دعم كامل للردود والتعليقات العربية." } },
    { "@type": "Question", name: "ماذا يحدث إذا تجاوزت حد الردود الشهري؟", acceptedAnswer: { "@type": "Answer", text: "في الخطة المجانية، يقتصر الرد على 100 رد شهرياً. للردود غير المحدودة، اختر الخطة المؤسسية." } },
    { "@type": "Question", name: "هل يمكنني تجربة البوت قبل الشراء؟", acceptedAnswer: { "@type": "Answer", text: "نعم! يمكنك تجربة لوحة التحكم التجريبية ببيانات وهمية لترى كل الميزات قبل الاشتراك." } },
  ],
};

/* Marquee vocabulary — the real feature names from the landing registry
   (landing-data.ts BENEFITS titles), ×2 by the marquee kit for the
   seamless 42s RTL loop. */
const MARQUEE_ITEMS = [
  "ردود تلقائية ذكية",
  "صندوق وارد موحد",
  "تحليلات وأداء",
  "جدولة المنشورات",
  "استهداف الجمهور",
  "أمان وتشفير",
  "دعم متعدد اللغات",
  "إدارة فريق كامل",
];

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      {/* r128: `.landing` wrapper (LandingStage, r129) — the Orbit-Ink token
          layer + section chrome (R4: dark stage in BOTH themes) + the
          returning-visitor data-intro-seen calm. */}
      <LandingStage>
      <LandingHeader />

      {/* r129 (P0 fix): ONE main landmark per page — the root layout owns
          the landmark + its id; this wrapper is a plain <div> (the r128
          assembly nested a second <main> carrying the SAME id here —
          duplicate id + nested landmark, invalid HTML). */}
      <div>
        {/* v8-B7/v9-D3: skip-link target — lands past the header nav.
            tabIndex={-1} moves focus here for keyboard users. */}
        <span id="page-content" className="sr-only" tabIndex={-1} />

        {/* ═══ الفصل ٠ — المدار: the hero sky ═══ */}
        <section className="ln-hero" aria-label="SmartBot — إدارة صفحات فيسبوك الذكية">
          {/* living sky (r129): starfield depth plane + the REAL canvas
              orbit engine (OrbitScene port — fails safe to the CSS sky
              below; biasX −0.35 keeps the orbital mass opposite the RTL
              text column, containment-capped at 45% of the short side) */}
          <div className="ln-hero-sky" aria-hidden="true">
            <HeroDepthLayer />
            <OrbitScene className="ln-hero-canvas" biasX={-0.35} />
          </div>

          <div className="ln-hero-content">
            <RevealCssClass as="p" className="ln-hero-eyebrow">
              <span className="ln-mono">SmartBot · إدارة صفحات فيسبوك · ليبيا</span>
            </RevealCssClass>

            {/* h1 + sub paint INSTANTLY — server-rendered inline, no reveal,
                no client gate (LCP doctrine). One lime word: واحترافية. */}
            <h1 className="ln-hero-title">
              <span className="ln-hero-line">إدارة <em>تفاعل</em> فيسبوك</span>
              <span className="ln-hero-line">بذكاءٍ <em className="ln-hero-gold">واحترافية</em></span>
            </h1>

            <p className="ln-hero-sub">
              أتمتة الردود، تحليلات متقدمة، وإدارة متكاملة لصفحات فيسبوك.{" "}
              <strong>المنصة الأولى في ليبيا بذكاء اصطناعي يفهم لهجتك.</strong>
            </p>

            <RevealCssClass as="div" className="ln-hero-actions" delay={3}>
              <MagneticGoldLink href="/subscribe" withArrow ariaLabel="ابدأ الآن مجاناً — الاشتراك في SmartBot">
                ابدأ الآن مجاناً
              </MagneticGoldLink>
              <a href="/demo" className="ln-btn-ghost">جرب البوت الآن</a>
            </RevealCssClass>

            <RevealCssClass as="ul" className="ln-hero-meta" delay={4}>
              <li><Check size={13} aria-hidden="true" /> خطة مجانية — 100 رد شهرياً</li>
              <li aria-hidden="true" className="ln-hero-meta-dot" />
              <li><MessageCircle size={13} aria-hidden="true" /> دعم على مدار الساعة</li>
              <li aria-hidden="true" className="ln-hero-meta-dot" />
              <li><Languages size={13} aria-hidden="true" /> واجهة عربية بالكامل</li>
            </RevealCssClass>
          </div>

          {/* scroll invitation */}
          <a href="#trust" className="ln-hero-scroll" aria-label="تابع الرحلة">
            <span className="ln-mono">تابع الرحلة</span>
            <span className="ln-hero-scroll-line" aria-hidden="true" />
          </a>
        </section>

        {/* ═══ شريط القدرات — مدار واحد تنتظم فيه الأسماء (marquee) ═══ */}
        <LandingMarquee items={MARQUEE_ITEMS} />

        {/* ═══ الفصل ١ — الثقة (quiet mono DATA band, real figures) ═══ */}
        <TrustBand />

        {/* ═══ الفصل ٢ — مدار الميزات ═══ */}
        <FeaturesSection />

        {/* ═══ الفصل ٣ — كيف يعمل لوحة التحكم ═══ */}
        <JourneySection />

        {/* ═══ الفصل ٤ — قصّة التقدّم ═══ */}
        <ProgressSection />

        {/* ═══ الفصل ٥ — الأرض: عالم القنوات ═══ */}
        <PlateSection />

        {/* ═══ الفصل ٦ — الأدوار ═══ */}
        <RolesSection />

        {/* ═══ الفصل ٧ — نقطة البداية ═══ */}
        <FinaleCta />

        {/* ═══ الأسئلة الشائعة — compact, ln-styled ═══ */}
        <LandingFaq />
      </div>

      <LandingFooter />

      {/* film-grain texture layer — last child, painted over the whole
          world (R7: ONE veil per page) */}
      <div className="ln-grain" aria-hidden="true" />
      </LandingStage>
    </>
  );
}
