"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RobotMark, type RobotState } from "@/components/shared/RobotMark";
import { BotChatSimulator } from "@/components/landing/BotChatSimulator";

/* v16-r142 — «رفيق» — THE COMPANION STAGE.
 *
 * The robot is not a picture on the hero; it is the page's living
 * protagonist standing on a lit circular stage: a spotlight wash, a 3D
 * turntable floor (two counter-rotating dashed rings on a rotateX
 * plane), breathing LED dots, and a state machine every visitor can SEE:
 *
 *   hero  — on stage, ready (SSR default: the first paint is instant,
 *           LCP doctrine untouched)
 *   wave  — the visitor scrolls for the first time, or presses the
 *           stage → greeting bubble pops
 *   think — the live simulator is "typing"
 *   chat  — a bot reply just landed in the transcript
 *
 * One state machine, one truth: the simulator reports its playback
 * through onPhase, so the pose and the transcript can never disagree.
 *
 * Pointer tilt: imperative rAF writes of --rx/--ry (zero setState),
 * fine pointers only, killed under reduced motion. Every looping verb
 * (rings, LEDs) has an explicit reduced-motion off-switch in §17.
 * Decorative by role: figures/hud/greeting are aria-hidden; the stage is
 * a real button with an Arabic label; pose changes announce politely.
 *
 * phase5 r152: the four raster webp poses (60-100KB each, gold-era
 * renders) are retired — the stage now crossfades the ONE RobotMark
 * SVG (matte petrol shell · teal visor · lime LED) in its four states.
 * Zero network, zero LCP image preload: the robot ships in the HTML.
 */

type Pose = "hero" | "wave" | "think" | "chat";

const POSE_COPY: Record<Pose, string> = {
  hero: "ON STAGE · جاهز يرد على عملائك",
  wave: "WAVE · يلوّح لك الآن",
  think: "THINKING · يفهم نية العميل",
  chat: "REPLYING · يردّ لحظة بلحظة",
};

/* The pose state machine, mapped onto the RobotMark states (phase5):
 * hero → idle · wave → greeting · think → thinking · chat → responding.
 * ONE inline SVG × four crossfading layers — the same .f-* grammar the
 * webp stack used, so the CSS crossfade contract is untouched. */
const POSE_STATES: Array<{ pose: Pose; state: RobotState }> = [
  { pose: "hero", state: "idle" },
  { pose: "wave", state: "greeting" },
  { pose: "think", state: "thinking" },
  { pose: "chat", state: "responding" },
];

const GREET_MS = 2600;

export function HeroCompanion() {
  const [pose, setPose] = useState<Pose>("hero");
  const [greet, setGreet] = useState(false);

  const sceneRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const greetTimer = useRef(0);
  const wavedRef = useRef(false);
  /* what the simulator is doing right now — the pose the stage returns
     to after a greeting ends */
  const simLiveRef = useRef(false);
  const pendingRef = useRef<Pose>("hero");

  const applyPose = useCallback((next: Pose) => {
    pendingRef.current = next;
    if (!greetTimer.current) setPose(next);
  }, []);

  /* simulator → stage bridge (typing/think, bot message/chat) */
  const handlePhase = useCallback(
    (phase: "typing" | "message" | "idle", who?: "user" | "bot" | "sys") => {
      if (phase === "typing") {
        if (who === "sys") return; // the system handoff line is not a "mind" beat
        applyPose("think");
        return;
      }
      if (phase === "message") {
        if (who === "bot") simLiveRef.current = true;
        applyPose(who === "bot" ? "chat" : "think");
        return;
      }
      /* idle — the transcript stands; the companion stays in chat */
      if (simLiveRef.current) applyPose("chat");
    },
    [applyPose],
  );

  /* wave + greeting bubble; returns to the simulator's current pose */
  const wave = useCallback(() => {
    window.clearTimeout(greetTimer.current);
    setGreet(true);
    setPose("wave");
    greetTimer.current = window.setTimeout(() => {
      greetTimer.current = 0;
      setGreet(false);
      setPose(simLiveRef.current ? pendingRef.current : "hero");
    }, GREET_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(greetTimer.current), []);

  /* first scroll → the companion greets once (the wave beat). Reduced
     motion users keep the calm on-stage pose; the stage button still
     waves on demand. */
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      if (wavedRef.current) return;
      const y = window.scrollY;
      if (y > 48 && y < 640) {
        wavedRef.current = true;
        window.removeEventListener("scroll", onScroll);
        wave();
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [wave]);

  /* pointer tilt — imperative, zero setState (the canonical scroll-craft
     pattern): rAF writes of --rx/--ry, fine pointers only, RM off */
  useEffect(() => {
    const scene = sceneRef.current;
    const tilt = tiltRef.current;
    if (!scene || !tilt) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    let raf = 0;
    let rx = 0;
    let ry = 0;
    const flush = () => {
      raf = 0;
      tilt.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      tilt.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
    };
    const onMove = (e: PointerEvent) => {
      const rect = scene.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      rx = -ny * 6;
      ry = nx * 7;
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onLeave = () => {
      rx = 0;
      ry = 0;
      if (!raf) raf = requestAnimationFrame(flush);
    };
    scene.addEventListener("pointermove", onMove);
    scene.addEventListener("pointerleave", onLeave);
    return () => {
      scene.removeEventListener("pointermove", onMove);
      scene.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="ln-companion" data-pose={pose}>
      <div className="ln-companion-scene" ref={sceneRef}>
        <div className="ln-companion-tilt" ref={tiltRef}>
          <button
            type="button"
            className="ln-companion-stage"
            onClick={wave}
            aria-label="رفيقك SmartBot على المنصة — اضغط لتحيّته"
          >
            <span className="ln-companion-figures" aria-hidden="true">
              {POSE_STATES.map(({ pose: p, state }) => (
                <RobotMark
                  key={p}
                  state={state}
                  className={`ln-companion-fig f-${p}`}
                />
              ))}
            </span>
            <span className="ln-companion-vignette" aria-hidden="true" />
            <span className="ln-companion-floor" aria-hidden="true">
              <span className="ln-companion-floor-ring r1">
                <i />
              </span>
              <span className="ln-companion-floor-ring r2">
                <i />
              </span>
            </span>
            <span className="ln-companion-leds" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
        </div>

        <div className="ln-companion-greet" data-show={greet || undefined} aria-hidden="true">
          أهلاً! أنا <b>SmartBot</b> — رفيق صفحتك. اضغط عليّ في أي وقت.
        </div>

        <div className="ln-companion-hud" aria-hidden="true">
          <span className="ln-companion-hud-dot" />
          <span className="ln-mono">{POSE_COPY[pose]}</span>
        </div>

        <p className="sr-only" aria-live="polite">
          {POSE_COPY[pose]}
        </p>
      </div>

      {/* the live transcript — the same state machine drives both sides */}
      <BotChatSimulator compact onPhase={handlePhase} />
    </div>
  );
}
