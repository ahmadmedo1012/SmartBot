import "./landing.css";
import Link from "next/link";
import { Check, MessageCircle, Languages } from "lucide-react";
import { RevealCssClass } from "@/hooks/useReveal";
import { LandingStage } from "@/components/landing/LandingStage";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroTicker } from "@/components/landing/HeroTicker";
import { HeroExit } from "@/components/landing/HeroExit";
import { RobotSceneMount } from "@/components/landing/RobotSceneMount";
import { MagneticGoldLink } from "@/components/landing/MagneticGoldLink";
import { LandingMarquee } from "@/components/landing/LandingMarquee";
import { MindSection } from "@/components/landing/MindSection";
import { BotDayStoryboard } from "@/components/landing/BotDayStoryboard";
import { ProductSection } from "@/components/landing/ProductSection";
import { TrustBand } from "@/components/landing/TrustBand";
import { FinaleCta } from "@/components/landing/FinaleCta";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { LandingFooter } from "@/components/landing/LandingFooter";

/* P15 (concept A — CHARACTER-LED HERO):
 * the robot IS the protagonist. The three.js SmartBot renders as a
 * full-height presence (~62svh mass) in the CENTER of a 100svh-minus-
 * chrome hero, standing on its pedestal + grid floor IN the first
 * viewport (the world is never below the fold). The interface is
 * composed AROUND the machine with real depth: a bracket-cornered
 * PROMPT TICKER at the reading start (RTL: right) cycling real
 * capability statements, a mono status micro-panel on the far side,
 * both UNDER the transparent canvas so the robot's body physically
 * anchors them; a thin animated teal→lime circuit line crosses the
 * machine's zone above the canvas; the oversized Arabic display
 * headline (IBM Plex Sans Arabic 700 — a REAL Arabic face at last)
 * anchors the bottom third with a mono-caps eyebrow, exactly the
 * reference's bottom-anchored display grammar. On scroll the machine
 * layer sinks and fades (HeroExit). Mobile (≤1024px): a deliberate
 * vertical stack — copy top, full-figure robot (~44svh, never a
 * cropped head), ticker, CTA.
 * The retired P12-2c layer: floating capability chips (the ticker +
 * status panel carry the same real copy now, anchored), the below-
 * fold HeroCompanion/BotChatSimulator dock (the ticker is the
 * first-viewport beat; the honest 3-scenario transcripts live on in
 * MindSection's chat threads). The page stays a SERVER component —
 * the canvas mounts via dynamic import ssr:false, the h1/sub paint
 * inline (LCP doctrine untouched). All real copy/links below the
 * hero are untouched. */

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
    { "@type": "Question", name: "كم صفحة يمكنني ربطها؟", acceptedAnswer: { "@type": "Answer", text: "يمكنك ربط صفحة فيسبوك واحدة لكل حساب في جميع الخطط." } },
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

        {/* ═══ ٠ الهيرو — «تعرّف على رفيقك»: P15 concept A — the robot is
            the protagonist. One 100svh scene: machine centered on its
            visible stage, ticker/status composed around it with depth,
            the Arabic display headline anchoring the bottom third. ═══ */}
        <section className="ln-hero ln-hero-robot" aria-label="SmartBot — رفيق صفحات فيسبوك">
          {/* the machine layer — the canvas is TRANSPARENT, so the ticker
              and status boxes under it are physically anchored by the
              robot's body. Decorative by role (aria-hidden): the ticker,
              status panel and copy are the accessible surface. Sinks and
              fades on the first scroll (HeroExit). */}
          <div className="ln-robot-stage" aria-hidden="true">
            <HeroExit>
              <div className="ln-robot-frame">
                {/* the floor glow + shadow anchor under the pedestal
                    (the CSS half of the machine's light spill) and the
                    edge vignette — both UNDER the canvas, at the exact
                    viewport fractions the scene's framing solver places
                    the pedestal (--sb-floor) */}
                <span className="ln-robot-glow" />
                <span className="ln-robot-vignette" />
                {/* the circuit line — a thin animated teal→lime trace
                    crossing the machine's zone (right→left, RTL flow),
                    tying the text world to the machine. It rides UNDER
                    the canvas, so the machine's body OCCLUDES its middle
                    — the line reads on both sides of the robot and the
                    character visibly stands IN the circuit (one more
                    depth interlock, the reference's text→machine trace).
                    Decorative. */}
                <svg className="ln-circuit" viewBox="0 0 600 2" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                  <defs>
                    <linearGradient id="ln-circuit-grad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" stopColor="#17C3A4" stopOpacity="0.1" />
                      <stop offset="0.22" stopColor="#17C3A4" stopOpacity="0.85" />
                      <stop offset="0.5" stopColor="#C6F24E" stopOpacity="0.95" />
                      <stop offset="0.78" stopColor="#17C3A4" stopOpacity="0.85" />
                      <stop offset="1" stopColor="#17C3A4" stopOpacity="0.1" />
                    </linearGradient>
                  </defs>
                  <line x1="4" y1="1" x2="596" y2="1" stroke="url(#ln-circuit-grad)" strokeWidth="1" vectorEffect="non-scaling-stroke" className="ln-circuit-base" />
                  <line x1="4" y1="1" x2="596" y2="1" stroke="url(#ln-circuit-grad)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" className="ln-circuit-run" />
                  {/* node dots in the VISIBLE zones flanking the machine —
                      the circuit reads as infrastructure, not a lone line */}
                  <circle cx="100" cy="1" r="2" fill="#17C3A4" opacity="0.7" />
                  <circle cx="500" cy="1" r="2" fill="#C6F24E" opacity="0.7" />
                  <circle cx="4" cy="1" r="3" fill="#17C3A4" />
                  <circle cx="596" cy="1" r="3" fill="#C6F24E" />
                </svg>
                <RobotSceneMount className="ln-robot-canvas" />
              </div>
            </HeroExit>
          </div>

          {/* the interface layer under the machine: the prompt ticker
              (reading start — RTL right) + the mono status panel (far
              side), one synced state machine (client island) */}
          <HeroTicker />

          {/* the message layer — bottom-anchored display block. The h1
              + sub paint INSTANTLY (server-rendered inline, no reveal,
              no client gate — LCP doctrine). The display face is IBM
              Plex Sans Arabic 700 (a REAL Arabic display treatment —
              Space Grotesk carries no Arabic and never renders the
              headline; it stays on Latin mono runs only). */}
          <div className="ln-hero-copy">
            <RevealCssClass as="p" className="ln-hero-eyebrow">
              <span className="ln-mono ln-eyebrow-latin" dir="ltr">SMARTBOT</span>
              <i className="ln-eyebrow-sep" aria-hidden="true" />
              <span className="ln-eyebrow-ar">أتمتة صفحات فيسبوك · ليبيا</span>
            </RevealCssClass>

            <h1 className="ln-hero-title">
              <span className="ln-hero-line">تعرّف على <em className="ln-hero-gold">رفيقك</em> الرقمي</span>
              <span className="ln-hero-line">يرد، يفهم، ويشتغل <em>دائماً</em></span>
            </h1>

            <p className="ln-hero-sub">
              SmartBot رفيق صفحتك على فيسبوك: يصنّف نية كل عميل لحظة وصوله،
              يردّ فوراً بلغته، ويحوّل اللي يحتاج قراراً لفريقك —{" "}
              <strong>وتقارير النمو تصلك جاهزة.</strong>
            </p>
          </div>

          {/* the actions foot — the CTA is part of the composition (the
              bottom-right display block's closing row), not a floating
              pill. The hero secondary CTA rides next/link like every
              other internal anchor on the route (parity contract). */}
          <RevealCssClass as="div" className="ln-hero-foot" delay={3}>
            <div className="ln-hero-actions">
              <MagneticGoldLink href="/subscribe" xl withArrow ariaLabel="ابدأ الآن مجاناً — الاشتراك في SmartBot">
                ابدأ الآن مجاناً
              </MagneticGoldLink>
              <Link href="/demo" className="ln-btn-ghost">جرب البوت الآن</Link>
            </div>

            <RevealCssClass as="ul" className="ln-hero-meta" delay={4}>
              <li><Check size={13} aria-hidden="true" /> خطة مجانية — 100 رد شهرياً</li>
              <li aria-hidden="true" className="ln-hero-meta-dot" />
              <li><MessageCircle size={13} aria-hidden="true" /> دعم على مدار الساعة</li>
              <li aria-hidden="true" className="ln-hero-meta-dot" />
              <li><Languages size={13} aria-hidden="true" /> واجهة عربية بالكامل</li>
            </RevealCssClass>
          </RevealCssClass>

          {/* scroll invitation — reading end (RTL left), out of the
              display block's way */}
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
