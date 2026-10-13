"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, UserRound, Zap } from "lucide-react";
import { RobotMark, type RobotState } from "@/components/shared/RobotMark";

/* v16-r142 «رفيق» — the live conversation simulator, now mounted INSIDE
 * the hero beside the companion stage. Three honest scenarios drawn from
 * the shipped product — price inquiry (auto reply + real plan terms),
 * booking intent (auto confirmation), complaint (auto empathy +
 * escalation to the HUMAN team via the unified inbox). Each step: a
 * typing phase (messenger beads), then the message — bot replies carry
 * the «رد آلي ⚡» badge, the human takeover carries the amber
 * «فريق بشري» badge.
 * Honesty rules: plan figures mirror the published offers (0/19/29…,
 * the product schema), and the escalation path is the real unified-inbox
 * + team-roles capability. Nothing invented.
 * r142 — `onPhase` lets the hero companion stage ride the SAME playback
 * (typing → think, bot message → chat): one state machine, one truth —
 * the character's pose and the transcript can never disagree.
 * Reduced motion: the matchMedia gate renders the FULL transcript
 * instantly — no timers, no typing beads (the CSS belt kills the rest).
 * Auto-starts once when the stage enters the viewport; tabs + replay
 * re-run a scenario on demand. The log auto-scrolls, is scroll-capped
 * (max-height + overflow-y), and announces via aria-live. */

type SimPhase = "typing" | "message" | "idle";
type SimWho = "user" | "bot" | "sys";

type Msg = {
  from: "user" | "bot" | "sys";
  text: string;
  /** "auto" = رد آلي ⚡ (lime) · "human" = فريق بشري (amber) */
  badge?: "auto" | "human";
};

type Scenario = {
  id: string;
  label: string;
  /** what the intent engine classified — shown in the header chip */
  intent: string;
  msgs: Msg[];
};

const SCENARIOS: Scenario[] = [
  {
    id: "price",
    label: "استفسار سعر",
    intent: "النية: استفسار عن السعر",
    msgs: [
      { from: "user", text: "كم سعر الاشتراك عندكم؟" },
      {
        from: "bot",
        text: "الخطة المجانية تمنحك 100 رد شهرياً على صفحة واحدة — والخطط المدفوعة تبدأ من 19 د.ل شهرياً. أرشدك للاشتراك؟",
        badge: "auto",
      },
      { from: "user", text: "ووش الفرق بين الأساسية والمميزة؟" },
      {
        from: "bot",
        text: "الأساسية: 2,000 رد شهرياً مع الذكاء الاصطناعي. المميزة: 10,000 رد + البث الجماعي وجدولة المنشورات.",
        badge: "auto",
      },
    ],
  },
  {
    id: "booking",
    label: "طلب حجز",
    intent: "النية: طلب / حجز",
    msgs: [
      { from: "user", text: "أريد حجز طاولة لأربعة أشخاص الليلة" },
      {
        from: "bot",
        text: "تم تسجيل طلبك! طاولة لأربعة الليلة — أكّد لك الموعد خلال دقائق.",
        badge: "auto",
      },
      { from: "user", text: "ممكن نغيّرها لباكري؟" },
      {
        from: "bot",
        text: "تم التعديل: حجز باكري لأربعة. أرسلت لك التأكيد هنا في الرسائل.",
        badge: "auto",
      },
    ],
  },
  {
    id: "complaint",
    label: "شكوى",
    intent: "النية: شكوى — أولوية عالية",
    msgs: [
      { from: "user", text: "الطلب وصل متأخر ساعتين! هذا مو مقبول" },
      {
        from: "bot",
        text: "أشكرك على التنبيه وأسف على التأخير — وحّلت شكواك للأولوية العالية وحوّلتها فوراً للفريق.",
        badge: "auto",
      },
      { from: "sys", text: "تم تحويل المحادثة إلى الفريق البشري — صندوق الوارد الموحد" },
      {
        from: "bot",
        text: "معك أحمد من فريق الدعم. راجعت الطلب — وصّلناه اليوم مع خصم على طلبتك القادمة.",
        badge: "human",
      },
    ],
  },
];

/* pacing — the messenger rhythm (typing beads then the message) */
const TYPING_USER_MS = 950;
const TYPING_BOT_MS = 1250;

export function BotChatSimulator({
  compact = false,
  onPhase,
}: {
  /** hero variant — the compact window docked under the stage */
  compact?: boolean;
  /** live-state bridge for the companion stage (optional) */
  onPhase?: (phase: SimPhase, who?: SimWho) => void;
} = {}) {
  /* the callback rides a ref so the playback effect never re-arms
     because the parent passed a new closure */
  const phaseRef = useRef(onPhase);
  useEffect(() => {
    phaseRef.current = onPhase;
  }, [onPhase]);

  const [scenarioId, setScenarioId] = useState(SCENARIOS[0]!.id);
  const [step, setStep] = useState(0); // messages visible so far
  const [typing, setTyping] = useState<"user" | "bot" | null>(null);
  const [started, setStarted] = useState(false);
  const [reduced, setReduced] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]!;

  /* reduced-motion contract: read once on mount (the repo's useReveal
     convention — SSR renders the empty stage, the effect reconciles) */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
  }, []);

  /* auto-start once when the stage approaches the viewport */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setStarted(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* reduced motion ⇒ the full transcript paints immediately, no timers */
  useEffect(() => {
    if (!reduced) return;
    setStep(scenario.msgs.length);
    setTyping(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, scenarioId]);

  /* the playback engine — one timer per step, cleaned on every change */
  useEffect(() => {
    if (!started || reduced) return;
    if (step >= scenario.msgs.length) {
      setTyping(null);
      phaseRef.current?.("idle");
      return;
    }
    const next = scenario.msgs[step]!;
    const isUser = next.from === "user";
    const isSys = next.from === "sys";
    setTyping(isSys ? null : isUser ? "user" : "bot");
    phaseRef.current?.("typing", isSys ? "sys" : isUser ? "user" : "bot");
    const t = window.setTimeout(
      () => {
        setTyping(null);
        setStep((s) => s + 1);
        phaseRef.current?.("message", next.from);
      },
      isSys ? 650 : isUser ? TYPING_USER_MS : TYPING_BOT_MS,
    );
    return () => window.clearTimeout(t);
  }, [started, step, reduced, scenario]);

  /* keep the latest message in view */
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [step, typing]);

  const runScenario = (id: string) => {
    setScenarioId(id);
    setStep(0);
    setTyping(null);
    setStarted(true);
  };

  const replay = () => runScenario(scenarioId);

  const finished = step >= scenario.msgs.length;

  /* phase5 r152 — the bot's live presence in the window chrome: the avatar
   * robot rides the SAME playback (it can never disagree with the
   * transcript): thinking while SmartBot types, responding right after a
   * bot message lands, idle while the customer types or the log rests.
   * Reduced motion → the calm idle robot (the transcript paints whole). */
  const lastMsg = step > 0 ? scenario.msgs[step - 1] : undefined;
  let robotState: RobotState = "idle";
  if (!reduced) {
    if (typing === "bot") robotState = "thinking";
    else if (typing === null && lastMsg?.from === "bot") robotState = "responding";
  }

  return (
    <div ref={rootRef} className={`ln-botchat${compact ? " compact" : ""}`} data-testid="bot-chat-simulator">
      {/* window chrome — the page's bot on duty */}
      <div className="ln-botchat-head">
        <span className="ln-botchat-avatar" aria-hidden="true">
          <RobotMark state={robotState} className="ln-botchat-avatar-robot" />
        </span>
        <span>
          <span className="ln-botchat-name">SmartBot</span>
          <span className="ln-botchat-status">يرد تلقائياً · متصل الآن</span>
        </span>
        <span className="ln-botchat-intent">{scenario.intent}</span>
      </div>

      {/* the three honest scenarios */}
      <div className="ln-botchat-tabs" role="group" aria-label="اختر سيناريو المحاكاة">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="ln-botchat-tab"
            aria-pressed={s.id === scenarioId}
            onClick={() => runScenario(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* the transcript */}
      <div className="ln-botchat-log" ref={logRef} aria-live="polite" aria-label="محادثة تجريبية بين عميل وردود SmartBot">
        {scenario.msgs.slice(0, step).map((m, i) => {
          if (m.from === "sys") {
            return (
              <p key={i} className="ln-botchat-msg sys">
                {m.text}
              </p>
            );
          }
          const isUser = m.from === "user";
          return (
            <div key={i} className={`ln-botchat-msg ${m.from}`}>
              {m.text}
              {m.badge && !isUser && (
                <span className={`ln-botchat-badge ${m.badge}`}>
                  {m.badge === "auto" ? (
                    <>
                      <Zap size={10} strokeWidth={2.4} aria-hidden="true" /> رد آلي
                    </>
                  ) : (
                    <>
                      <UserRound size={10} strokeWidth={2.4} aria-hidden="true" /> فريق بشري
                    </>
                  )}
                </span>
              )}
            </div>
          );
        })}
        {typing && !reduced && (
          <div
            className={`ln-botchat-typing${typing === "user" ? " ln-botchat-typing--user" : ""}`}
            aria-hidden="true"
          >
            <span className="ln-botchat-dot" />
            <span className="ln-botchat-dot" />
            <span className="ln-botchat-dot" />
          </div>
        )}
        {typing && !reduced && (
          <p className="sr-only">{typing === "user" ? "العميل يكتب…" : "SmartBot يكتب…"}</p>
        )}
      </div>

      {/* the honest footer */}
      <div className="ln-botchat-foot">
        <span>محاكاة لقدرات الرد الفعلية — تصنيف النوايا، ردود تلقائية، وتصعيد للفريق.</span>
        {finished && (
          <button type="button" className="ln-botchat-replay" onClick={replay}>
            <RotateCcw size={12} aria-hidden="true" />
            إعادة التشغيل
          </button>
        )}
      </div>
    </div>
  );
}
