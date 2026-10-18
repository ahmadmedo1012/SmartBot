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

/* P16-A (concept A — CHARACTER-LED CINEMATIC hero):
 * the authored GLB character IS the protagonist. The three.js scene
 * renders the chibi attendant-machine full-figure (~62vh, head near
 * the vertical midline) dead-CENTER of a 100svh-minus-chrome hero,
 * standing on its pedestal + rings + grid floor IN the first viewport.
 * The composition is the product story, ChainGPT-informed and
 * RTL-adapted: the typed prompt console (the scenario's incoming
 * message) at the INLINE-START (RTL: right), the status/capability
 * readout at the INLINE-END (left), the character between them —
 * prompt → agent → result. The character is ALIVE at three
 * timescales: pointer head-tracking, idle layers (bob/blink/antenna
 * sway/edge-strip breathing), and scenario reactions driven by the
 * honest HeroTicker engine (the beat bus). The oversized Arabic
 * display headline (IBM Plex Sans Arabic 700) anchors the bottom
 * third (the reference's fold-proof grammar). The decorative circuit
 * traces were RETIRED with the primitives robot — the character's ONE
 * emissive edge strip is the light signature now (no decorative
 * noise). On scroll the machine layer sinks and fades (HeroExit).
 * Mobile (≤1024px): its OWN composition — character-first stack
 * (~62svh stage), one console line above the title lockup, CTA last.
 * The page stays a SERVER component — the canvas mounts via dynamic
 * import ssr:false, the h1/sub paint inline (LCP doctrine
 * untouched). All real copy/links below the hero are untouched. */

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
    { "@type": "Question", name: "ماذا يحدث إذا تجاوزت حد الردود الشهري؟", acceptedAnswer: { "@type": "Answer", text: "في الخطة المجانية، يقتصر الرد على 100 رد شهرياً. للردود بلا حد عملي (حتى 999,999 رد شهريًا)، اختر الخطة المؤسسية." } },
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

        {/* ═══ ٠ الهيرو — «تعرّف على رفيقك»: P18-W2-a — THE ASYMMETRIC
            SCENE. The obelisk attendant (the procedural character) is
            the protagonist at the INLINE-END band (--sb-x camera bias:
            RTL screen-left) on its visible stage; the display lockup
            (eyebrow + h1 + sub + CTAs) owns inline-start, the demo
            console rides the reading-start upper band, the SYSTEM
            telemetry panel the inline-end rail — no text ever crosses
            the figure, no scrims (§2.5). ═══ */}
        <section className="ln-hero ln-hero-robot" aria-label="SmartBot — رفيق صفحات فيسبوك">
          {/* the machine layer — the canvas is TRANSPARENT and the
              composition is ASYMMETRIC (P18-W2-a, §2.5): the obelisk
              attendant stands at the INLINE-END band (--sb-x camera
              bias), the display lockup owns inline-start — no glyph
              ever crosses the figure, so the P16 scrim stack is
              RETIRED (legibility from composition, not gradients).
              Decorative by role (aria-hidden): the ticker, status
              panel and copy are the accessible surface. Sinks and
              fades on the first scroll (HeroExit). */}
          <div className="ln-robot-stage" aria-hidden="true">
            <HeroExit>
              <div className="ln-robot-frame">
                {/* the floor glow + contact-pool anchor under the
                    pedestal (the CSS half of the machine's light spill,
                    at the exact viewport fraction the scene's framing
                    solver places the floor — --sb-floor, pooled at
                    --sb-glow-x) and the edge vignette — both UNDER the
                    canvas */}
                <span className="ln-robot-glow" />
                <span className="ln-robot-vignette" />
                {/* W2-C1 (delta 1) — CONNECTOR TRACES: the reference's
                    circuit grammar — thin 1px traces with 45° elbows and
                    small node pads linking the machine to the terminal
                    console (head + chest) and down the far rail to the
                    scroll invitation. DOM/SVG so the paths respect the
                    layout layer (viewBox maps the ≥1025px hero box);
                    desktop composition only — the CSS layer gates it off
                    below 1025px and mirrors it for LTR. Decorative
                    (aria-hidden); rides INSIDE the exit frame so it sinks
                    with the machine layer on scroll. */}
                <svg
                  className="ln-hero-traces"
                  viewBox="0 0 1440 900"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  {/* console → head (the upper terminal line) */}
                  <path className="ln-tx" d="M 962 250 H 660 L 600 190 H 312" />
                  {/* console → chest (the lower terminal line — exits the
                      console's bottom corner, verified against the live
                      rects: console [968,116→312] hero-rel) */}
                  <path className="ln-tx" d="M 962 312 H 700 L 627 385 H 322" />
                  {/* machine → far rail → the scroll invitation (the drop
                      lands just above the invitation label — live rect
                      [65,721] hero-rel, the invitation line at x≈104) */}
                  <path className="ln-tx" d="M 135 505 H 118 L 104 519 V 712" />
                  {/* the node pads — ports on the console edge, live nodes
                      at the machine, one terminal above the invitation */}
                  <rect className="ln-tx-node" x="959" y="247" width="5" height="5" />
                  <rect className="ln-tx-node" x="959" y="309" width="5" height="5" />
                  <rect className="ln-tx-node ln-tx-live" x="308" y="187" width="6" height="6" />
                  <rect className="ln-tx-node ln-tx-live" x="318" y="382" width="6" height="6" />
                  <rect className="ln-tx-node" x="101" y="709" width="6" height="6" />
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
              {/* P21-C: the reference's L-bracket tech-frame — open corner
                  brackets (top reading-start + bottom inline-end) carrying
                  the spectrum accent. Decorative: aria-hidden. */}
              <i className="ln-bracket ln-bracket-a" aria-hidden="true" />
              <i className="ln-bracket ln-bracket-b" aria-hidden="true" />
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
