'use client';

import { useEffect, useRef, useState } from 'react';

/* P15 (concept A — CHARACTER-LED) — THE PROMPT TICKER + STATUS PANEL.
 * The hero's first-viewport interaction beat (it replaces the retired
 * below-fold BotChatSimulator dock): a bracket-cornered hairline box
 * on the reading-start side (RTL: right) cycling REAL capability
 * statements, while a mono status panel on the far side (left) mirrors
 * the SAME beat — one state machine, one truth: the ticker prompt and
 * the status label can never disagree (the r142 simulator↔stage
 * contract, translated to the ChainGPT ticker↔panel grammar).
 *
 * Honesty: every beat is a shipped capability (auto replies on
 * comments/messages, intent classification, human handoff through the
 * unified inbox) — no fabricated metrics, no fake customers, no
 * numbers at all. The rotating loop is a DEMO of real states, labeled
 * as such in the box head (قدرات فعلية).
 *
 * A11y: the prompt swaps inside ONE persistent aria-live="polite"
 * region; the sr-only pose line narrates the beat for screen readers
 * (the SR_POSE_COPY pattern — the canvas is aria-hidden decorative).
 * Reduced motion: beat 0 paints statically, no timers. The rotation
 * pauses offscreen (IO) and on hidden tabs.
 *
 * One shared index drives: the prompt, the mobile status line, the
 * desktop status rows, the index counter and the sr narration. */

type Beat = {
  /** the capability statement (Arabic, honest) */
  prompt: string;
  /** what the machine is doing on that beat (Arabic status) */
  status: string;
  /** the mono ALL-CAPS register (Latin only — tracked) */
  mono: string;
  /** dot register: teal = live machine, lime = AI/automation (S5 pair) */
  tone: 'teal' | 'lime';
  /** the sr-only pose narration (SR_POSE_COPY pattern) */
  sr: string;
};

const BEATS: Beat[] = [
  {
    prompt: 'ردّ تلقائي على تعليقات صفحتك',
    status: 'جارٍ الرد…',
    mono: 'AUTO-REPLY',
    tone: 'teal',
    sr: 'ON STAGE · جاهز يرد على عملائك',
  },
  {
    prompt: 'تصنيف نية العميل تلقائياً',
    status: 'جارٍ التصنيف…',
    mono: 'INTENT-AI',
    tone: 'lime',
    sr: 'THINKING · يفهم نية العميل',
  },
  {
    prompt: 'تسليم فوري للموظف البشري',
    status: 'تسليم لموظف الدعم',
    mono: 'HUMAN-HANDOFF',
    tone: 'teal',
    sr: 'HANDOFF · سلّم المحادثة للفريق البشري',
  },
];

const BEAT_MS = 4200;

export function HeroTicker() {
  const [idx, setIdx] = useState(0);
  const [reduced, setReduced] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /* reduced-motion contract: read once on mount (the repo's useReveal
     convention — SSR renders the calm first beat, the effect
     reconciles). Reduced ⇒ the loop never arms. */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
  }, []);

  /* the rotation — one interval, advanced only while the island is
     onscreen (IO) and the tab is visible. Drift-free, cheap. */
  useEffect(() => {
    if (reduced) return;
    const el = rootRef.current;
    if (!el) return;
    let onscreen = true;
    const io = new IntersectionObserver(
      (entries) => {
        onscreen = entries[entries.length - 1]?.isIntersecting ?? true;
      },
      { rootMargin: '60px 0px' },
    );
    io.observe(el);
    const t = window.setInterval(() => {
      if (onscreen && !document.hidden) setIdx((i) => (i + 1) % BEATS.length);
    }, BEAT_MS);
    return () => {
      window.clearInterval(t);
      io.disconnect();
    };
  }, [reduced]);

  const beat = BEATS[idx] ?? BEATS[0]!;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="ln-ticker-island" ref={rootRef}>
      {/* ── the prompt ticker (reading start — RTL right) ── */}
      <div className="ln-ticker" role="group" aria-label="قدرات SmartBot الفعلية — تتناوب">
        {/* bracket corners — just OUTSIDE the hairline box (the
            reference framing signature, 1px L-strokes) */}
        <i className="ln-ticker-corner c-a" aria-hidden="true" />
        <i className="ln-ticker-corner c-b" aria-hidden="true" />
        <i className="ln-ticker-corner c-c" aria-hidden="true" />
        <i className="ln-ticker-corner c-d" aria-hidden="true" />

        <p className="ln-ticker-head">
          <span className="ln-mono">SMARTBOT</span>
          <span className="ln-ticker-sep" aria-hidden="true" />
          <span>قدرات فعلية</span>
          <span className="ln-ticker-idx ln-mono" dir="ltr">
            {pad(idx + 1)} / {pad(BEATS.length)}
          </span>
        </p>

        {/* ONE persistent live region; the key'd prompt re-mounts inside
            it so each rotation is announced politely exactly once */}
        <p className="ln-ticker-prompt" aria-live="polite">
          <span key={idx} className="ln-ticker-swap">
            {beat.prompt}
          </span>
          <i className="ln-ticker-caret" aria-hidden="true" />
        </p>

        {/* the compact status line — the side panel's mobile twin
            (display: none on desktop, so it never double-reads) */}
        <p className="ln-ticker-status">
          <b data-tone={beat.tone} aria-hidden="true" />
          <span>{beat.status}</span>
          <span className="ln-mono" dir="ltr">
            {beat.mono}
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
          {BEATS.map((b, i) => (
            <li key={b.mono} data-active={i === idx ? 'true' : undefined}>
              <i data-tone={b.tone} aria-hidden="true" />
              <span className="ln-status-label">{b.status}</span>
              <span className="ln-status-mono ln-mono" dir="ltr">
                {b.mono}
              </span>
            </li>
          ))}
        </ul>
      </aside>

      {/* the pose narration (sr-only, SR_POSE_COPY pattern) */}
      <p className="sr-only">{beat.sr}</p>
    </div>
  );
}
