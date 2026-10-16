'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { dispatchHeroBeat } from './heroBus';

/* STAGE 3 INTEGRATION (2-e · directive 2) — CONCEPT B'S HONEST SCENARIO
 * ENGINE, PORTED INTO A'S TICKER.
 *
 * A's ticker was decoration: abstract capability prompts rotating every
 * 4.2s. The reference bar demands a SAMPLE INTERACTION in the first
 * viewport — and Concept B shipped exactly that (its mission-control
 * pipeline, scored 9/10 on product identity). This is the load-bearing
 * port from the loser: the real demo cycle from worktree SmartBot-wt-b
 * (HeroPipeline.tsx's scenario state machine + typing engine, scenario
 * data adapted from BotChatSimulator's honest registry) now runs INSIDE
 * A's bracket-cornered ticker geometry, keeping A's lockstep status
 * sync (one state machine drives the ticker body AND the status rows
 * AND the mobile status line) and the sr-only narration.
 *
 * The cycle (honest, labeled «عرض توضيحي — DEMO»): a customer message
 * arrives (typing beads → the message) → the intent engine classifies
 * («النية: …») → the auto-reply types out WORD BY WORD → when the
 * scenario needs a human, the handoff lights with the teammate's reply
 * → reset → next scenario. Three scenarios (price / booking /
 * complaint) mirror the published plan figures (0/19/29… — the DB seed
 * and the product schema) and the real escalation path (unified inbox
 * → team). Nothing invented, no fake customers — the numbers are the
 * product's own published terms.
 *
 * A11y: the visible ticker is NOT a live region (word-by-word typing
 * would chatter) — ONE sr-only aria-live="polite" announcer narrates
 * each stage exactly once (B's announcer contract), plus the honesty
 * line. Reduced motion: ONE fully composed static frame (scenario 1 at
 * the reply beat, inbound + full reply painted, no timers, no beads).
 * The cycle pauses offscreen (IO) and on hidden tabs (B's running
 * gate, ported). */

type Stage = 'inbound' | 'classify' | 'reply' | 'handoff';
type Beat = Stage | 'reset';

/* ── the honest scenario registry (B's BotChatSimulator SCENARIOS,
 *    adapted to the ticker's single-box shape) ───────────────────────── */
type Scenario = {
  id: string;
  label: string;
  intent: string;
  /** the customer's incoming message */
  inbound: string;
  /** the bot's auto-reply — typed out word by word */
  reply: string;
  /** only the complaint escalates (the real unified-inbox path) */
  handoff?: { sys: string; human: string };
};

const SCENARIOS: Scenario[] = [
  {
    id: 'price',
    label: 'استفسار سعر',
    intent: 'النية: استفسار عن السعر',
    inbound: 'كم سعر الاشتراك عندكم؟',
    reply:
      'الخطة المجانية تمنحك 100 رد شهرياً على صفحة واحدة — والخطط المدفوعة تبدأ من 19 د.ل شهرياً. أرشدك للاشتراك؟',
  },
  {
    id: 'booking',
    label: 'طلب حجز',
    intent: 'النية: طلب / حجز',
    inbound: 'أريد حجز طاولة لأربعة أشخاص الليلة',
    reply: 'تم تسجيل طلبك! طاولة لأربعة الليلة — أكّد لك الموعد خلال دقائق.',
  },
  {
    id: 'complaint',
    label: 'شكوى',
    intent: 'النية: شكوى — أولوية عالية',
    inbound: 'الطلب وصل متأخر ساعتين! هذا مو مقبول',
    reply: 'أشكرك على التنبيه وأسف على التأخير — وحّلت شكواك للأولوية العالية وحوّلتها فوراً للفريق.',
    handoff: {
      sys: 'تم تحويل المحادثة إلى الفريق البشري — صندوق الوارد الموحد',
      human: 'معك أحمد من فريق الدعم. راجعت الطلب — وصّلناه اليوم مع خصم على طلبتك القادمة.',
    },
  },
];

/* ── the stage script (B's pacing, verbatim) ─────────────────────────── */
const STAGE_MS: Record<Stage, number> = {
  inbound: 3200,
  classify: 2700,
  reply: 4200,
  handoff: 3600,
};
const RESET_MS = 1700;
const INBOUND_TYPE_MS = 1200;
const REPLY_DOTS_MS = 900;
const REPLY_WORD_MS = 190;

/* the status registry — one row per machine state, synced to the SAME
 * beat that drives the ticker body (A's lockstep contract, kept). The
 * tone pair is A's S5 law: teal = live machine, lime = AI/automation. */
const STATUS_ROWS: { key: Beat; ar: string; mono: string; tone: 'teal' | 'lime' }[] = [
  { key: 'inbound', ar: 'رسالة واردة', mono: 'INBOUND', tone: 'teal' },
  { key: 'classify', ar: 'جارٍ التصنيف…', mono: 'INTENT-AI', tone: 'lime' },
  { key: 'reply', ar: 'كتابة الردّ الآلي', mono: 'AUTO-REPLY', tone: 'teal' },
  { key: 'handoff', ar: 'تسليم لفريق الدعم', mono: 'HUMAN', tone: 'teal' },
];

/* the ticker body's micro-label per beat (the stage stamp) */
const STAGE_LABEL: Record<Beat, string> = {
  inbound: 'رسالة واردة',
  classify: 'تصنيف النية',
  reply: 'ردّ آلي',
  handoff: 'تسليم لموظف الدعم',
  reset: 'السيناريو التالي…',
};

const pad = (n: number) => String(n).padStart(2, '0');

export function HeroTicker() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [running, setRunning] = useState(false);
  /* inbound typing beads (first 1.2s of the inbound beat) */
  const [inTyping, setInTyping] = useState(true);
  /* reply typing: dots, then word-by-word */
  const [replyDots, setReplyDots] = useState(false);
  const [replyWords, setReplyWords] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const scenario = SCENARIOS[scenarioIdx] ?? SCENARIOS[0]!;
  /* the stage script is MEMOIZED (B's discipline): a fresh array every
     render would re-arm the machine on every typing tick and freeze the
     cycle mid-beat. The script ends with the explicit 'reset' beat. */
  const script = useMemo(() => {
    const stages: Beat[] = ['inbound', 'classify', 'reply'];
    if (scenario.handoff) stages.push('handoff');
    stages.push('reset');
    return stages;
  }, [scenario]);
  /* the RM static frame composes on the reply beat (B's contract):
     scenario 1, the full typed reply, zero timers */
  const beat: Beat = reduced ? 'reply' : (script[stageIdx] ?? 'reset');
  const nextScenario = SCENARIOS[(scenarioIdx + 1) % SCENARIOS.length]!;

  /* reduced-motion contract: read once on mount (the repo's useReveal
     convention). Reduced ⇒ the loop never arms — the derived render
     below paints the composed static frame (scenario 1, reply beat,
     everything typed whole). */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
  }, []);

  /* the running gate — B's pause family: offscreen (IO) + hidden tab */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        setRunning(entries[entries.length - 1]?.isIntersecting ?? false);
      },
      { rootMargin: '60px 0px' },
    );
    io.observe(el);
    const onVis = () => setRunning((r) => r && !document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  /* the stage machine — advances only while running (B's engine; the
     script's trailing 'reset' beat swaps to the next scenario) */
  useEffect(() => {
    if (reduced || !running) return;
    const ev = script[stageIdx] ?? 'reset';
    const ms = ev === 'reset' ? RESET_MS : STAGE_MS[ev];
    const t = window.setTimeout(() => {
      if (ev === 'reset') {
        setScenarioIdx((i) => (i + 1) % SCENARIOS.length);
        setStageIdx(0);
      } else {
        setStageIdx((i) => i + 1);
      }
    }, ms);
    return () => window.clearTimeout(t);
  }, [stageIdx, scenarioIdx, running, reduced, script]);

  /* P16-W3 · P1-c (evaluation: "no user scenario agency") — the scenario
   * selector, ported from Concept B's strongest feature. Real buttons:
   * selecting a scenario restarts the engine at ITS inbound beat (the
   * whole machine — typing beads, classifier, reply typing, handoff —
   * re-runs for the chosen conversation). Keyboard: native buttons
   * (Tab + Enter/Space), focus-visible ring in CSS, aria-pressed state,
   * ≥44px targets. Under reduced-motion the static frame re-composes
   * for the chosen scenario (scenario is derived state). The honest
   * auto-cycle continues from the selection — the demo never stops
   * being honest, the user just chooses where to look. */
  const selectScenario = (i: number) => {
    if (i === scenarioIdx && stageIdx === 0) return; /* already its first beat */
    setScenarioIdx(i);
    setStageIdx(0);
  };

  /* P16-A — the beat channel: every stage change is announced on the
   * heroBus so the CHARACTER reacts to the conversation it is having
   * (head turn toward this console on inbound, core pulse on classify,
   * eye scan while the reply types, arm raise on handoff). The engine
   * itself is untouched — same stages, same honesty, one more
   * listener. Under reduced-motion the scene ignores the channel (its
   * own static-frame contract) — the dispatch stays, it is inert. */
  useEffect(() => {
    dispatchHeroBeat({ beat, scenarioId: scenario.id });
  }, [beat, scenario]);

  /* inbound typing beads (B's engine) */
  useEffect(() => {
    if (beat !== 'inbound' || reduced) return;
    setInTyping(true);
    const t = window.setTimeout(() => setInTyping(false), INBOUND_TYPE_MS);
    return () => window.clearTimeout(t);
  }, [beat, scenarioIdx, reduced]);

  /* the reply types out — dots, then word by word (B's engine) */
  useEffect(() => {
    if (beat !== 'reply' || reduced) return;
    setReplyDots(true);
    setReplyWords(0);
    const t0 = window.setTimeout(() => setReplyDots(false), REPLY_DOTS_MS);
    const words = scenario.reply.split(' ').length;
    const iv = window.setInterval(() => {
      setReplyWords((w) => Math.min(w + 1, words));
    }, REPLY_WORD_MS);
    return () => {
      window.clearTimeout(t0);
      window.clearInterval(iv);
    };
  }, [beat, scenarioIdx, scenario, reduced]);

  /* ── derived body content (the static frame composes the same way) ── */
  const staticFull = reduced; /* the RM frame: scenario 1, reply beat, whole */
  const replyText = beat === 'handoff' && scenario.handoff ? scenario.handoff.human : scenario.reply;
  const replyIsHuman = beat === 'handoff';
  const typedWords = staticFull ? replyText.split(' ').length : replyWords;

  const activeRow = beat === 'reset' ? null : beat;
  const announce = reduced
    ? 'عرض توضيحي ثابت: استفسار سعر يصل، يصنّفه البوت، والردّ الآلي يكتمل. محاكاة لقدرات فعلية.'
    : beat === 'inbound'
      ? `عرض توضيحي — رسالة واردة: ${scenario.inbound}`
      : beat === 'classify'
        ? `عرض توضيحي — تصنيف النية: ${scenario.intent}`
        : beat === 'reply'
          ? `عرض توضيحي — ردّ آلي: ${scenario.reply}`
          : beat === 'handoff'
            ? 'عرض توضيحي — تم تسليم المحادثة لموظف الدعم، ووصل ردّ الفريق البشري.'
            : `عرض توضيحي — السيناريو التالي: ${nextScenario.label}`;

  return (
    <div className="ln-ticker-island" ref={rootRef}>
      {/* ── the prompt ticker (reading start — RTL right) ── */}
      <div className="ln-ticker" role="group" aria-label="عرض توضيحي لقدرات SmartBot — رسائل حقيقية الحالات">
        {/* bracket corners — just OUTSIDE the hairline box (the
            reference framing signature, 1px L-strokes) */}
        <i className="ln-ticker-corner c-a" aria-hidden="true" />
        <i className="ln-ticker-corner c-b" aria-hidden="true" />
        <i className="ln-ticker-corner c-c" aria-hidden="true" />
        <i className="ln-ticker-corner c-d" aria-hidden="true" />

        <p className="ln-ticker-head">
          <span className="ln-mono">SMARTBOT</span>
          <span className="ln-ticker-sep" aria-hidden="true" />
          {/* the honest DEMO badge — the HONESTY LAW, visible + readable
              (B's ln-pipe-demo pattern: a breathing dot + the stamp) */}
          <span className="ln-ticker-demo">
            <i className="ln-ticker-demo-dot" aria-hidden="true" />
            عرض توضيحي — <b className="ln-mono" dir="ltr">DEMO</b>
          </span>
          <span className="ln-ticker-idx ln-mono" dir="ltr">
            {pad(scenarioIdx + 1)} / {pad(SCENARIOS.length)}
          </span>
        </p>

        {/* the ticker body — ONE beat of the scenario at a time (the
            stage stamp + the exchange). Not a live region: the sr-only
            announcer below narrates each beat exactly once. */}
        <div className="ln-ticker-beat" data-beat={beat}>
          <p className="ln-ticker-beat-label">
            <span>{STAGE_LABEL[beat]}</span>
            <span className="ln-ticker-beat-scenario">{scenario.label}</span>
          </p>

          {beat === 'inbound' && !staticFull && inTyping ? (
            <span className="ln-typing" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          ) : beat === 'inbound' ? (
            <p className="ln-ticker-msg user">
              {scenario.inbound}
              <span className="ln-ticker-msg-meta">عميل الصفحة · عبر ماسنجر</span>
            </p>
          ) : beat === 'classify' ? (
            <p className="ln-ticker-msg intent">
              {scenario.intent}
              <span className="ln-ticker-msg-meta">محرّك النوايا · فوري</span>
            </p>
          ) : beat === 'reply' || beat === 'handoff' || staticFull ? (
            replyDots && !staticFull ? (
              <span className="ln-typing" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            ) : (
              <p className="ln-ticker-msg bot">
                {replyText.split(' ').slice(0, typedWords).join(' ')}
                {replyIsHuman ? (
                  <span className="ln-ticker-badge human">فريق بشري</span>
                ) : (
                  <span className="ln-ticker-badge auto">رد آلي</span>
                )}
                <span className="ln-ticker-msg-meta">
                  {replyIsHuman ? 'موظف الدعم · صندوق الوارد الموحد' : 'SmartBot · رد فوري'}
                </span>
              </p>
            )
          ) : (
            <p className="ln-ticker-msg reset">
              {nextScenario.label}
              <span className="ln-ticker-msg-meta">السيناريو التالي</span>
            </p>
          )}
        </div>

        {/* the scenario selector — P16-W3 P1-c: real user agency over the
            demo (B's port). Three honest conversations, one per button. */}
        <div className="ln-scenario-tabs" role="group" aria-label="اختيار سيناريو العرض">
          {SCENARIOS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className="ln-scenario-tab"
              aria-pressed={i === scenarioIdx ? 'true' : 'false'}
              onClick={() => selectScenario(i)}
            >
              <span className="ln-mono" dir="ltr">{pad(i + 1)}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* the compact status line — the side panel's mobile twin
            (display: none on desktop, so it never double-reads) */}
        <p className="ln-ticker-status">
          <b data-tone={activeRow ? STATUS_ROWS.find((r) => r.key === activeRow)?.tone : 'teal'} aria-hidden="true" />
          <span>{beat === 'reset' ? 'جاهز للسيناريو التالي…' : STAGE_LABEL[beat]}</span>
          <span className="ln-mono" dir="ltr">
            {beat === 'reset' ? 'NEXT' : STATUS_ROWS.find((r) => r.key === beat)?.mono}
          </span>
        </p>
      </div>

      {/* ── the status micro-panel (far side — RTL left) ── */}
      <aside className="ln-status" aria-label="حالة النظام">
        <p className="ln-status-head">
          <span className="ln-mono">SYSTEM</span>
          <span>حالة النظام</span>
        </p>
        <ul>
          {STATUS_ROWS.map((row) => (
            <li key={row.mono} data-active={activeRow === row.key ? 'true' : undefined}>
              <i data-tone={row.tone} aria-hidden="true" />
              <span className="ln-status-label">{row.ar}</span>
              <span className="ln-status-mono ln-mono" dir="ltr">
                {row.mono}
              </span>
            </li>
          ))}
        </ul>
      </aside>

      {/* the single sr-only announcer (B's contract: one polite
          announcement per stage beat) + the honesty line */}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <p className="sr-only">
        محاكاة لقدرات الردّ الفعلية — تصنيف النوايا وردود تلقائية وتسليم للفريق البشري. ليست بيانات عملاء حقيقيين.
      </p>
    </div>
  );
}
