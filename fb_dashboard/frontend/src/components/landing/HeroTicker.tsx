'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { dispatchHeroBeat } from './heroBus';

/* P18-W4-a (Phase 18 §2.7 — DEMO DEPTH): THE DEMONSTRATION BECOMES REAL.
 *
 * The console was honest but shallow: ONE beat of the scenario at a
 * time, replaced every few seconds — the conversation never
 * accumulated, the handoff existed in only one of three scenarios,
 * and the intent was a full sentence, not the engine's chip. This
 * pass keeps the honest stage engine (same beats, same digits, same
 * DEMO badge, same heroBus channel — the character still turns its
 * head on inbound, pulses violet on classify, leans amber on handoff)
 * and deepens the console into the product's own instrument:
 *
 * 1. TRANSCRIPT FEED — every beat APPENDS its line to a tail-anchored
 *    conversation log (role="log"): the customer's message (neutral
 *    hairline voice) → the intent chip (VIOLET — the AI register,
 *    «نية: سعر») → the typed auto-reply (cyan rule + «رد آلي») → the
 *    handoff pair (AMBER: the transfer notice + the teammate's human
 *    reply). Tail-anchored (justify-content: flex-end + overflow): the
 *    newest line is ALWAYS visible; short stages clip the oldest lines
 *    under a mask fade — the console's own wireframe grammar.
 * 2. HANDOFF IN EVERY SCENARIO — all three conversations walk the
 *    complete product path (inbound → classify → auto-reply → human
 *    handoff): the subscription question needs the payment walk-through,
 *    the table booking needs the floor team's confirmation, the
 *    complaint escalates to the unified inbox. Honest copy only —
 *    «تحويل لموظف الدعم» and the team's own reply; no connected-account
 *    claims.
 * 3. PAUSE — a real hold on the stage machine (one 44px instrument
 *    button in the console foot). Typing completes; the beat holds
 *    until resumed; scenario selection auto-resumes (choosing =
 *    watching).
 * 4. A11Y — the transcript region IS the polite region now
 *    (role="log" + aria-live="polite" + aria-relevant="additions"):
 *    each appended line announces exactly once, whole — the
 *    word-by-word typing rides an aria-hidden visual twin (typing
 *    never chatters), and the sr-only honesty line keeps the law.
 *    Reduced motion: the complete static conversation, zero timers,
 *    every line whole, no entrance animations.
 *
 * The cycle (honest, labeled «عرض توضيحي — DEMO»): a customer message
 * arrives (typing beads → the line) → the intent engine classifies
 * (the violet chip) → the auto-reply types out WORD BY WORD → the
 * handoff notice lights amber and the teammate's reply types out →
 * reset → the next scenario. Three scenarios (price / booking /
 * complaint) mirror the published plan figures (0/19/29… — the DB seed
 * and the product schema) and the real escalation path (unified inbox
 * → team). Nothing invented, no fake customers — the numbers are the
 * product's own published terms. The IO/hidden-tab pause family is
 * unchanged (plus the resume fix: visibility return re-checks the
 * intersection, the demo no longer dies after a tab switch). */

type Stage = 'inbound' | 'classify' | 'reply' | 'handoff';
type Beat = Stage | 'reset';

/* ── the honest scenario registry (B's BotChatSimulator SCENARIOS,
 *    adapted to the ticker's single-box shape; W4-a: every scenario
 *    now carries the full path INCLUDING the human handoff) ──────── */
type Scenario = {
  id: string;
  label: string;
  /** the full classification line (the sr-only voice of the intent beat) */
  intent: string;
  /** the terse chip label — the engine's own register («نية: سعر») */
  intentChip: string;
  /** the customer's incoming message */
  inbound: string;
  /** the bot's auto-reply — typed out word by word */
  reply: string;
  /** the real escalation path, in every scenario (W4-a #2): the
   *  transfer notice + the teammate's human reply — honest copy, no
   *  connected-account claims */
  handoff: { sys: string; human: string };
};

const SCENARIOS: Scenario[] = [
  {
    id: 'price',
    label: 'استفسار سعر',
    intent: 'النية: استفسار عن السعر',
    intentChip: 'نية: سعر',
    inbound: 'كم سعر الاشتراك عندكم؟',
    reply:
      'الخطة المجانية تمنحك 100 رد شهرياً على صفحة واحدة — والخطط المدفوعة تبدأ من 19 د.ل شهرياً. أرشدك للاشتراك؟',
    handoff: {
      sys: 'تم تحويل المحادثة إلى موظف الدعم — متابعة إتمام الاشتراك',
      human: 'معك سالم من فريق الدعم. أجهّز لك الاشتراك على الخطة المناسبة وأشاركك طرق الدفع المتاحة.',
    },
  },
  {
    id: 'booking',
    label: 'طلب حجز',
    intent: 'النية: طلب / حجز',
    intentChip: 'نية: حجز',
    inbound: 'أريد حجز طاولة لأربعة أشخاص الليلة',
    reply: 'تم تسجيل طلبك! طاولة لأربعة الليلة — أكّد لك الموعد خلال دقائق.',
    handoff: {
      sys: 'تم تحويل المحادثة إلى موظف الدعم — تأكيد الحجز',
      human: 'معك ليلى من الفريق. أكّدنا طاولة لأربعة الليلة — بانتظاركم في الموعد المحدد.',
    },
  },
  {
    id: 'complaint',
    label: 'شكوى',
    intent: 'النية: شكوى — أولوية عالية',
    intentChip: 'نية: شكوى',
    inbound: 'الطلب وصل متأخر ساعتين! هذا مو مقبول',
    reply: 'أشكرك على التنبيه وأسف على التأخير — وحّلت شكواك للأولوية العالية وحوّلتها فوراً للفريق.',
    handoff: {
      sys: 'تم تحويل المحادثة إلى الفريق البشري — صندوق الوارد الموحد',
      human: 'معك أحمد من فريق الدعم. راجعت الطلب — وصّلناه اليوم مع خصم على طلبتك القادمة.',
    },
  },
];

/* ── the transcript line registry (the console's voices) ──────────────
 *    W4-a #1: the feed's line kinds — the customer (neutral), the
 *    intent chip (violet), the bot's auto-reply (cyan), the handoff
 *    pair (amber), the reset notice. The sr prefix carries the role
 *    so the log announces each line whole, exactly once. */
type LineKind = 'customer' | 'intent' | 'bot' | 'handoff-sys' | 'handoff-human' | 'reset';
type TLine = { id: number; kind: LineKind; text: string; sr?: string; meta: string };

const LINE_META: Record<LineKind, string> = {
  customer: 'عميل الصفحة · عبر ماسنجر',
  intent: 'محرّك النوايا · فوري',
  bot: 'SmartBot · رد فوري',
  'handoff-sys': 'تحويل لموظف الدعم',
  'handoff-human': 'موظف الدعم · رد بشري',
  reset: 'السيناريو التالي',
};

const SR_VOICE: Record<LineKind, string> = {
  customer: 'رسالة من عميل الصفحة: ',
  /* the intent sentence is already self-describing («النية: …») — no prefix */
  intent: '',
  bot: 'ردّ آلي من SmartBot: ',
  'handoff-sys': 'تحويل لموظف الدعم: ',
  'handoff-human': 'ردّ موظف الدعم: ',
  reset: 'السيناريو التالي: ',
};

/* ── the stage script (B's pacing; W4-a: the handoff beat lives in
 *    every scenario, and reads longer — the two amber lines) ───────── */
const STAGE_MS: Record<Stage, number> = {
  inbound: 3200,
  classify: 2700,
  reply: 4200,
  handoff: 4800,
};
const RESET_MS = 1700;
const INBOUND_TYPE_MS = 1200;
const REPLY_DOTS_MS = 900;
const REPLY_WORD_MS = 190;

/* the status registry — one row per machine state, synced to the SAME
 * beat that drives the transcript (A's lockstep contract, kept). The
 * tone pair is A's S5 law: teal = live machine, lime = AI/automation. */
const STATUS_ROWS: { key: Beat; ar: string; mono: string; tone: 'teal' | 'lime' }[] = [
  { key: 'inbound', ar: 'رسالة واردة', mono: 'INBOUND', tone: 'teal' },
  { key: 'classify', ar: 'جارٍ التصنيف…', mono: 'INTENT-AI', tone: 'lime' },
  { key: 'reply', ar: 'كتابة الردّ الآلي', mono: 'AUTO-REPLY', tone: 'teal' },
  { key: 'handoff', ar: 'تسليم لفريق الدعم', mono: 'HUMAN', tone: 'teal' },
];

/* the transcript's stage stamp (the machine's current state, above the feed) */
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
  /* W4-a #3: the user's hold on the demonstration — the stage machine
   * freezes on the current beat (typing completes, the beat holds) */
  const [paused, setPaused] = useState(false);
  /* inbound typing beads (first 1.2s of the inbound beat) */
  const [inTyping, setInTyping] = useState(true);
  /* reply typing: dots, then word-by-word (the bot reply, then the
   * teammate's human reply on the handoff beat) */
  const [replyDots, setReplyDots] = useState(false);
  const [replyWords, setReplyWords] = useState(0);
  /* W4-a #1: the accumulating transcript — each beat appends its line.
   * Seeded with the first customer line so the SSR HTML paints the
   * conversation's opening beat (the mount effect re-arms the same
   * content — idempotent). */
  const [lines, setLines] = useState<TLine[]>([
    { id: 0, kind: 'customer', text: SCENARIOS[0]!.inbound, meta: LINE_META.customer },
  ]);
  const lineId = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  /* the running gate's intersection half (the resume fix: returning to
   * the tab re-checks it — the demo no longer dies after a tab switch) */
  const intersecting = useRef(false);

  const scenario = SCENARIOS[scenarioIdx] ?? SCENARIOS[0]!;
  /* the stage script is MEMOIZED (B's discipline): a fresh array every
     render would re-arm the machine on every typing tick and freeze the
     cycle mid-beat. W4-a: the script is now CONSTANT — the handoff beat
     lives in every scenario, so the cycle is the same four beats + the
     explicit 'reset' beat for all three. */
  const script = useMemo(() => ['inbound', 'classify', 'reply', 'handoff', 'reset'] as Beat[], []);
  /* the RM static frame composes on the FINAL beat (W4-a): the complete
     conversation — inbound, chip, typed reply, and the handoff pair —
     painted whole, zero timers, the stage stamp at the handoff state */
  const beat: Beat = reduced ? 'handoff' : (script[stageIdx] ?? 'reset');
  const nextScenario = SCENARIOS[(scenarioIdx + 1) % SCENARIOS.length]!;

  /* the RM static transcript (derived, never armed): scenario's full
   * conversation — the selected scenario under RM re-composes too */
  const staticLines = useMemo<TLine[]>(
    () => [
      { id: -1, kind: 'customer', text: scenario.inbound, meta: LINE_META.customer },
      { id: -2, kind: 'intent', text: scenario.intentChip, sr: scenario.intent, meta: LINE_META.intent },
      { id: -3, kind: 'bot', text: scenario.reply, meta: LINE_META.bot },
      { id: -4, kind: 'handoff-sys', text: scenario.handoff.sys, meta: LINE_META['handoff-sys'] },
      { id: -5, kind: 'handoff-human', text: scenario.handoff.human, meta: LINE_META['handoff-human'] },
    ],
    [scenario],
  );

  /* reduced-motion contract: read once on mount (the repo's useReveal
     convention). Reduced ⇒ the loop never arms — the derived render
     below paints the composed static frame (the complete conversation,
     every line whole). */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
  }, []);

  /* the running gate — B's pause family: offscreen (IO) + hidden tab.
   * W4-a resume fix: the intersection half is kept in a ref, so
   * RETURNING to the tab re-evaluates both halves — the old
   * `r && !document.hidden` latch could never re-arm once hidden. */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const is = entries[entries.length - 1]?.isIntersecting ?? false;
        intersecting.current = is;
        setRunning(is && !document.hidden);
      },
      { rootMargin: '60px 0px' },
    );
    io.observe(el);
    const onVis = () => setRunning(intersecting.current && !document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  /* the stage machine — advances only while running AND unpaused (B's
     engine + W4-a's hold; the script's trailing 'reset' beat swaps to
     the next scenario) */
  useEffect(() => {
    if (reduced || !running || paused) return;
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
  }, [stageIdx, scenarioIdx, running, reduced, paused, script]);

  /* W4-a #1 — THE TRANSCRIPT APPEND: each beat appends its line to the
   * feed (the inbound/reset beats RESET the feed — a scenario is one
   * conversation). Runs once per beat change (the beat is state); the
   * RM frame never arms (its lines are derived). */
  useEffect(() => {
    if (reduced) return;
    const push = (kind: LineKind, text: string, sr: string | undefined, meta: string) =>
      setLines((prev) => [...prev, { id: (lineId.current += 1), kind, text, sr, meta }]);
    if (beat === 'inbound') {
      lineId.current += 1;
      setLines([{ id: lineId.current, kind: 'customer', text: scenario.inbound, meta: LINE_META.customer }]);
    } else if (beat === 'classify') {
      push('intent', scenario.intentChip, scenario.intent, LINE_META.intent);
    } else if (beat === 'reply') {
      push('bot', scenario.reply, undefined, LINE_META.bot);
    } else if (beat === 'handoff') {
      push('handoff-sys', scenario.handoff.sys, undefined, LINE_META['handoff-sys']);
      push('handoff-human', scenario.handoff.human, undefined, LINE_META['handoff-human']);
    } else {
      lineId.current += 1;
      setLines([{ id: lineId.current, kind: 'reset', text: nextScenario.label, meta: LINE_META.reset }]);
    }
  }, [beat, scenario, nextScenario, reduced]);

  /* P16-W3 · P1-c (evaluation: "no user scenario agency") — the scenario
   * selector, ported from Concept B's strongest feature. Real buttons:
   * selecting a scenario restarts the engine at ITS inbound beat (the
   * whole machine — typing beads, classifier, reply typing, handoff —
   * re-runs for the chosen conversation). Keyboard: native buttons
   * (Tab + Enter/Space), focus-visible ring in CSS, aria-pressed state,
   * ≥44px targets. Under reduced-motion the static frame re-composes
   * for the chosen scenario. W4-a: selecting also RELEASES the pause —
   * choosing a conversation is the intent to watch it. */
  const selectScenario = (i: number) => {
    if (i === scenarioIdx && stageIdx === 0) return; /* already its first beat */
    setScenarioIdx(i);
    setStageIdx(0);
    setPaused(false);
  };

  /* P16-A — the beat channel: every stage change is announced on the
   * heroBus so the CHARACTER reacts to the conversation it is having
   * (head turn toward this console on inbound, violet core pulse on
   * classify, eye scan while the reply types, amber lean on handoff).
   * The engine's beats are untouched — the transcript is a DEEPER view
   * of the same machine, so the bus contract holds verbatim. Under
   * reduced-motion the scene ignores the channel (its own static-frame
   * contract) — the dispatch stays, it is inert. */
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

  /* the live message types out — dots, then word by word (B's engine;
   * W4-a: the handoff beat types the TEAMMATE's reply the same way —
   * a human answering, not a switch) */
  useEffect(() => {
    if ((beat !== 'reply' && beat !== 'handoff') || reduced) return;
    setReplyDots(true);
    setReplyWords(0);
    const t0 = window.setTimeout(() => setReplyDots(false), REPLY_DOTS_MS);
    const text = beat === 'handoff' ? scenario.handoff.human : scenario.reply;
    const words = text.split(' ').length;
    const iv = window.setInterval(() => {
      setReplyWords((w) => Math.min(w + 1, words));
    }, REPLY_WORD_MS);
    return () => {
      window.clearTimeout(t0);
      window.clearInterval(iv);
    };
  }, [beat, scenarioIdx, scenario, reduced]);

  /* ── derived render state (the static frame composes the same way) ── */
  const staticFull = reduced; /* the RM frame: the complete conversation, whole */
  const shown = staticFull ? staticLines : lines;
  const lastIdx = shown.length - 1;
  /* the line currently typing (the feed's newest, on its beat) */
  const liveTyping =
    !staticFull &&
    lastIdx >= 0 &&
    ((beat === 'reply' && shown[lastIdx]!.kind === 'bot') ||
      (beat === 'handoff' && shown[lastIdx]!.kind === 'handoff-human'));
  const beadsOn =
    !staticFull &&
    lastIdx >= 0 &&
    ((beat === 'inbound' && inTyping) || (liveTyping && replyDots));

  const activeRow = beat === 'reset' ? null : beat;

  return (
    <div className="ln-ticker-island" ref={rootRef}>
      {/* ── the prompt console (reading start — RTL right) ── */}
      <div className="ln-ticker" role="group" aria-label="عرض توضيحي لقدرات SmartBot — محادثة حقيقية الحالات">
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

        {/* the console body — the stage stamp (the machine's state) over
            THE TRANSCRIPT FEED (the accumulating conversation). The feed
            is the polite region: each appended line announces exactly
            once, whole (aria-relevant="additions" — the word-by-word
            typing rides the aria-hidden visual twin, so it never
            chatters); removals (the reset swap) stay silent. */}
        <div className="ln-ticker-beat" data-beat={beat}>
          <p className="ln-ticker-beat-label">
            <span>{STAGE_LABEL[beat]}</span>
            <span className="ln-ticker-beat-scenario">{scenario.label}</span>
          </p>

          <div
            className="ln-transcript"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="سجلّ المحادثة التوضيحية"
          >
            {shown.map((line, i) => {
              const isLive = i === lastIdx;
              const text =
                liveTyping && isLive ? line.text.split(' ').slice(0, replyWords).join(' ') : line.text;
              const beads = beadsOn && isLive;
              const badge =
                line.kind === 'bot'
                  ? { cls: 'auto', label: 'رد آلي' }
                  : line.kind === 'handoff-human'
                    ? { cls: 'human', label: 'رد بشري' }
                    : null;
              return (
                <p key={staticFull ? `s-${i}` : line.id} className="ln-ticker-msg" data-kind={line.kind}>
                  <span className="sr-only">
                    {SR_VOICE[line.kind]}
                    {line.sr ?? line.text}
                  </span>
                  <span className="ln-tr-visual" aria-hidden="true">
                    {line.kind === 'intent' ? (
                      <span className="ln-intent-chip">{line.text}</span>
                    ) : beads ? (
                      <span className="ln-typing">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      <>
                        {text}
                        {badge ? <span className={`ln-ticker-badge ${badge.cls}`}>{badge.label}</span> : null}
                      </>
                    )}
                    <span className="ln-ticker-msg-meta">{line.meta}</span>
                  </span>
                </p>
              );
            })}
          </div>
        </div>

        {/* the console foot — the scenario selector (P16-W3 P1-c: real
            user agency, B's port) + the pause control (W4-a #3). Three
            honest conversations, one per button; the fourth control
            holds the demonstration. */}
        <div className="ln-scenario-tabs" role="group" aria-label="التحكم في العرض التوضيحي">
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
          <button
            type="button"
            className="ln-ticker-pause"
            aria-pressed={paused ? 'true' : 'false'}
            aria-label="إيقاف العرض التوضيحي مؤقتاً"
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
          </button>
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

      {/* the RM frame's sr contract (the static conversation, described
          once) + the honesty line — the law, unchanged */}
      {reduced ? (
        <p className="sr-only">
          عرض توضيحي ثابت: المحادثة كاملة — رسالة العميل تصل، تُصنّف النية، يردّ البوت آلياً، وما يحتاج قراراً بشرياً يُحوَّل لموظف الدعم.
        </p>
      ) : null}
      <p className="sr-only">
        محاكاة لقدرات الردّ الفعلية — تصنيف النوايا وردود تلقائية وتسليم للفريق البشري. ليست بيانات عملاء حقيقيين.
      </p>
    </div>
  );
}
