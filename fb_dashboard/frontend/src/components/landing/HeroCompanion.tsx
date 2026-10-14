'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BotChatSimulator } from '@/components/landing/BotChatSimulator';

/* P12-2c — the hero's live transcript island. The old companion stage
 * (RobotMark SVG poses + turntable floor) is RETIRED from the hero —
 * the dimensional three.js robot (RobotScene.tsx) is the hero centerpiece
 * now. What stays valuable here is the LIVE STATE MACHINE: the simulator
 * reports its playback through onPhase, and the hero announces the
 * companion's beats politely (typing/message). The robot no longer
 * needs a mirrored 2D pose layer — the 3D mascot IS the character —
 * so this component keeps only the simulator + its sr-only narration,
 * with the same playback behavior and the same compact window. */

type Pose = 'hero' | 'wave' | 'think' | 'chat';

const POSE_COPY: Record<Pose, string> = {
  hero: 'ON STAGE · جاهز يرد على عملائك',
  wave: 'WAVE · يلوّح لك الآن',
  think: 'THINKING · يفهم نية العميل',
  chat: 'REPLYING · يردّ لحظة بلحظة',
};

const GREET_MS = 2600;

export function HeroCompanion() {
  const [pose, setPose] = useState<Pose>('hero');
  const [greet, setGreet] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const greetTimer = useRef(0);
  const wavedRef = useRef(false);
  /* what the simulator is doing right now — the pose the stage returns
     to after a greeting ends */
  const simLiveRef = useRef(false);
  const pendingRef = useRef<Pose>('hero');

  const applyPose = useCallback((next: Pose) => {
    pendingRef.current = next;
    if (!greetTimer.current) setPose(next);
  }, []);

  /* simulator → stage bridge (typing/think, bot message/chat) */
  const handlePhase = useCallback(
    (phase: 'typing' | 'message' | 'idle', who?: 'user' | 'bot' | 'sys') => {
      if (phase === 'typing') {
        if (who === 'sys') return; // the system handoff line is not a "mind" beat
        applyPose('think');
        return;
      }
      if (phase === 'message') {
        if (who === 'bot') simLiveRef.current = true;
        applyPose(who === 'bot' ? 'chat' : 'think');
        return;
      }
      /* idle — the transcript stands; the companion stays in chat */
      if (simLiveRef.current) applyPose('chat');
    },
    [applyPose],
  );

  /* wave + greeting bubble; returns to the simulator's current pose.
     The old stage button is gone with the stage; the greeting beat now
     rides the first scroll (unchanged trigger) and reads as the
     companion's own voice-over line. */
  const wave = useCallback(() => {
    window.clearTimeout(greetTimer.current);
    setGreet(true);
    setPose('wave');
    greetTimer.current = window.setTimeout(() => {
      greetTimer.current = 0;
      setGreet(false);
      setPose(simLiveRef.current ? pendingRef.current : 'hero');
    }, GREET_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(greetTimer.current), []);

  /* first scroll → the companion greets once (the wave beat). Reduced
     motion users keep the calm on-stage pose. */
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      if (wavedRef.current) return;
      const y = window.scrollY;
      if (y > 48 && y < 640) {
        wavedRef.current = true;
        window.removeEventListener('scroll', onScroll);
        wave();
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [wave]);

  return (
    <div className="ln-companion" data-pose={pose} ref={rootRef}>
      <div className="ln-companion-greet" data-show={greet || undefined} aria-hidden="true">
        أهلاً! أنا <b>SmartBot</b> — رفيق صفحتك. اضغط عليّ في أي وقت.
      </div>

      {/* the live transcript — the same state machine drives both sides */}
      <BotChatSimulator compact onPhase={handlePhase} />

      {/* the pose narration (sr-only) rides the transcript island */}
      <p className="sr-only" aria-live="polite">
        {POSE_COPY[pose]}
      </p>
    </div>
  );
}
