/* v16-r142 — «رفيق» the radical redesign: the page IS the companion's
   story. The robot is not a hero image — it is the protagonist with a
   live state (HeroCompanion: the lit stage + the 4-pose state machine
   hero→wave→think→chat, driven by the visitor's first scroll, the stage
   press, and the SAME playback that streams the integrated chat
   simulator).

   The narrative (RTL reading order), stitched together by the circuit-trace
   chapter separators (TraceSep — the Circuit Petrol signature divider,
   live lime node on the two live-product beats):
   ٠ الهيرو «تعرّف على رفيقك» — stage + live simulator (one state machine)
   ٠ شريط القدرات (marquee) — the real capability names
   ٠ لغة العقل (#mind) — capabilities as chat threads + intent chips
   ٠ يوم في الحياة (#day) — the 4-state storyboard, --sp-lit rail
   ٠ المنصة الحقيقية (#platform) — live mini-boards in the product's own
     tokens (inbox + analytics), honestly captioned «بيانات وهمية»
   ٠ الأرقام (#trust) — the mono cockpit band (public stats, CountUp)
   ٠ الختام «وظّف رفيقك الرقمي» — finale CTA + compact FAQ

   The page stays a SERVER component — the h1 and hero sub render inline
   (instant-paint LCP doctrine, v6 §D) and the stage's default pose is
   server-rendered. Client islands are exactly: LandingHeader (chrome/
   spy/menus), HeroDepthLayer (starfield parallax), OrbitScene (the r129
   canvas sky — the ambient particle field around the stage), LandingStage
   (intro-seen calm), MagneticGoldLink (CTA pull), HeroCompanion (the
   stage state machine + simulator), TrustBand (public stats + CountUp),
   BotDayStoryboard (--sp scrub) and the RevealCssClass observers.
   Retired with the old ladder: FeaturesSection (constellation),
   BotDemoSection, BotHeroPortrait, BotStatesStrip, JourneySection,
   JourneyLightPath, ProgressSection, PlateSection, RolesSection. */
import "./landing.css";
import Link from "next/link";
import { Check, MessageCircle, Languages } from "lucide-react";
import { RevealCssClass } from "@/hooks/useReveal";
import { LandingStage } from "@/components/landing/LandingStage";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroDepthLayer } from "@/components/landing/HeroDepthLayer";
import { OrbitScene } from "@/components/landing/OrbitScene";
import { HeroCompanion } from "@/components/landing/HeroCompanion";
import { MagneticGoldLink } from "@/components/landing/MagneticGoldLink";
import { LandingMarquee } from "@/components/landing/LandingMarquee";
import { MindSection } from "@/components/landing/MindSection";
import { BotDayStoryboard } from "@/components/landing/BotDayStoryboard";
import { ProductSection } from "@/components/landing/ProductSection";
import { TrustBand } from "@/components/landing/TrustBand";
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
    { "@type": "Question", name: "كم صفحة يمكنني ربطها؟", acceptedAnswer: { "@type": "Answer", text: "يمكنك ربط صفحة واحدة في الخطة المجانية، وحتى 5 صفحات في الخطة الاحترافية." } },
    { "@type": "Question", name: "هل تدعم اللغة العربية كاملاً؟", acceptedAnswer: { "@type": "Answer", text: "نعم، الواجهة كاملة بالعربية مع دعم كامل للردود والتعليقات العربية." } },
    { "@type": "Question", name: "ماذا يحدث إذا تجاوزت حد الردود الشهري؟", acceptedAnswer: { "@type": "Answer", text: "في الخطة المجانية، يقتصر الرد على 100 رد شهرياً. للردود غير المحدودة، اختر الخطة المؤسسية." } },
    { "@type": "Question", name: "هل يمكنني تجربة البوت قبل الشراء؟", acceptedAnswer: { "@type": "Answer", text: "نعم! يمكنك تجربة لوحة التحكم التجريبية ببيانات وهمية لترى كل الميزات قبل الاشتراك." } },
  ],
};

/* Marquee vocabulary — the real capability names (the product schema's
   featureList + the shipped dashboard routes), ×2 by the marquee kit for
   the seamless 42s RTL loop. r144: «دعم متعدد اللغات» replaced with
   «فهم اللهجة الليبية» — the product is Arabic-only at every surface, but
   the Libyan dialect IS engine-backed (enhanced_intent.py Libyan keyword
   catalogs; ai_service.py «الردود باللهجة الليبية العامية» prompt) — the
   old multi-language claim had zero backing (QA r144 P3). */
/* Circuit Petrol section separators (phase5 r152) — the signature trace
   (globals.css .sb-trace: thin signal line + node dots) stitches the
   narrative chapters together. data-live lights the inline-end node LIME
   (the reserved AI/automation register) on the two beats where the story
   crosses live product territory: the automation proof (day→platform) and
   the public live metrics (platform→trust). Decorative by role: aria-hidden
   — every chapter carries its own real heading. */
function TraceSep({ live = false }: { live?: boolean }) {
  return (
    <hr className="sb-trace" aria-hidden="true" data-live={live ? "true" : undefined} />
  );
}

const MARQUEE_ITEMS = [
  "ردود تلقائية ذكية",
  "صندوق وارد موحد",
  "تحليلات وأداء",
  "جدولة المنشورات",
  "استهداف الجمهور",
  "أمان وتشفير",
  "فهم اللهجة الليبية",
  "إدارة فريق كامل",
];

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      {/* `.landing` wrapper (LandingStage) — the Orbit-Ink token layer +
          section chrome (R4: dark stage in BOTH themes) + the
          returning-visitor data-intro-seen calm. */}
      <LandingStage>
      <LandingHeader />

      {/* r129 (P0 fix): ONE main landmark per page — the root layout owns
          the landmark + its id; this wrapper is a plain <div>. */}
      {/* v8-B7/v9-D3: skip-link target — lands past the header nav.
          r149 (SB2 — audit: the sr-only <span> carried tabIndex while
          clipped to 1×1, an invisible "interactive" element): the id
          rides the real content wrapper now (the SL/SO fleet pattern —
          the target is the content block itself, tabIndex -1). Same
          focus behavior, zero visual change. */}
      <div id="page-content" tabIndex={-1}>

        {/* ═══ ٠ الهيرو — «تعرّف على رفيقك»: the companion takes the stage
            — literally. The OrbitScene sky stays (parity pin + ambient
            particle field), the copy column keeps its instant paint, and
            the stage + live simulator form ONE client island sharing a
            single state machine. ═══ */}
        <section className="ln-hero" aria-label="SmartBot — رفيق صفحات فيسبوك">
          {/* living sky: starfield depth plane + the REAL canvas orbit
              engine (fails safe to the CSS sky below; biasX −0.35 keeps
              the orbital mass opposite the RTL text column) */}
          <div className="ln-hero-sky" aria-hidden="true">
            <HeroDepthLayer />
            <OrbitScene className="ln-hero-canvas" biasX={-0.35} />
          </div>

          <div className="ln-hero-grid">
          <div className="ln-hero-content">
            <RevealCssClass as="p" className="ln-hero-eyebrow">
              <span className="ln-mono">SmartBot · رفيق صفحات فيسبوك · ليبيا</span>
            </RevealCssClass>

            {/* h1 + sub paint INSTANTLY — server-rendered inline, no reveal,
                no client gate (LCP doctrine). One lime word: رفيقك. */}
            <h1 className="ln-hero-title">
              <span className="ln-hero-line">تعرّف على <em className="ln-hero-gold">رفيقك</em> الرقمي</span>
              <span className="ln-hero-line">يرد، يفهم، ويشتغل <em>دائماً</em></span>
            </h1>

            <p className="ln-hero-sub">
              SmartBot رفيق صفحتك على فيسبوك: يصنّف نية كل عميل لحظة وصوله،
              يردّ فوراً بلغته، ويحوّل اللي يحتاج قراراً لفريقك —{" "}
              <strong>وتقارير النمو تصلك جاهزة.</strong>
            </p>

            <RevealCssClass as="div" className="ln-hero-actions" delay={3}>
              <MagneticGoldLink href="/subscribe" withArrow ariaLabel="ابدأ الآن مجاناً — الاشتراك في SmartBot">
                ابدأ الآن مجاناً
              </MagneticGoldLink>
              {/* the hero secondary CTA rides next/link like every other
                  internal anchor on the route (parity-pinned contract). */}
              <Link href="/demo" className="ln-btn-ghost">جرب البوت الآن</Link>
            </RevealCssClass>

            <RevealCssClass as="ul" className="ln-hero-meta" delay={4}>
              <li><Check size={13} aria-hidden="true" /> خطة مجانية — 100 رد شهرياً</li>
              <li aria-hidden="true" className="ln-hero-meta-dot" />
              <li><MessageCircle size={13} aria-hidden="true" /> دعم على مدار الساعة</li>
              <li aria-hidden="true" className="ln-hero-meta-dot" />
              <li><Languages size={13} aria-hidden="true" /> واجهة عربية بالكامل</li>
            </RevealCssClass>
          </div>

          {/* the companion: lit stage + live state machine + the integrated
              simulator (hero island §17) */}
          <HeroCompanion />
          </div>

          {/* scroll invitation */}
          <a href="#mind" className="ln-hero-scroll" aria-label="تابع رحلة رفيقك">
            <span className="ln-mono">تابع رحلة رفيقك</span>
            <span className="ln-hero-scroll-line" aria-hidden="true" />
          </a>
        </section>

        {/* ═══ شريط القدرات — مدار واحد تنتظم فيه الأسماء (marquee) ═══ */}
        <LandingMarquee items={MARQUEE_ITEMS} />

        {/* ═══ circuit trace — الفاصل الأول (marquee → لغة العقل) ═══ */}
        <TraceSep />

        {/* ═══ ٠١ — لغة العقل: القدرات كخيوط محادثة حقيقية ═══ */}
        <MindSection />

        <TraceSep />

        {/* ═══ ٠٢ — يوم في الحياة: قصة لوحات متتابعة بالحالات الأربع ═══ */}
        <BotDayStoryboard />

        {/* live node — القصة تعبر إلى إثبات الأتمتة الحيّ */}
        <TraceSep live />

        {/* ═══ ٠٣ — المنصة الحقيقية: لوحات من شكل المنصة الفعلي ═══ */}
        <ProductSection />

        {/* live node — بعدها الأرقام العمومية الحيّة */}
        <TraceSep live />

        {/* ═══ ٠٤ — الأرقام: قمرة المنصّة (بيانات عمومية حقيقية) ═══ */}
        <TrustBand />

        {/* ═══ الختام — وظّف رفيقك الرقمي ═══ */}
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
