'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/* P15 (concept A — CHARACTER-LED) — THE SINK-AND-FADE SCROLL EXIT.
 * The reference signature translated: as the first scroll leaves the
 * hero, the machine layer sinks and fades (translateY + opacity on
 * ONE wrapper) while the page scrolls past it — the robot recedes
 * into the floor faster than the world, clipped at the hero's bounds.
 * The copy/ticker/CTAs scroll away naturally; only the canvas layer
 * recedes (the ChainGPT webgl-layer exit).
 *
 * Reduced motion: the listener never arms — the composed frame stays
 * static (the scene's own RM contract renders one posed frame).
 * rAF-gated, passive, listener removed on unmount; transform/opacity
 * only (compositor verbs, no layout). */

const EXIT_SPAN_VH = 0.72; /* fully sunk after 72% of a viewport of scroll */
const EXIT_SINK_PX = 96; /* how deep the machine sinks */

export function HeroExit({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const vh = window.innerHeight || 800;
      const p = Math.min(1, Math.max(0, window.scrollY / (vh * EXIT_SPAN_VH)));
      el.style.transform = `translateY(${Math.round(p * EXIT_SINK_PX)}px)`;
      el.style.opacity = String(1 - p * 0.92);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="ln-robot-exit" ref={ref}>
      {children}
    </div>
  );
}
