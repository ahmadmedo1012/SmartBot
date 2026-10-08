"use client"

import { useEffect, useRef } from "react";

/**
 * useMagnetic — a subtle magnetic pull for primary CTAs.
 *
 * Desktop-hover devices only: the element drifts a few pixels toward the
 * cursor (max 6px) and springs back on leave. Disabled entirely for
 * touch devices (`(hover: none)`), reduced-motion users, and while the
 * element is offscreen (IntersectionObserver). Transform only — the
 * pull is written as `--mag-x` / `--mag-y` custom properties consumed
 * by a `translate()` in CSS, so there is no layout cost; pointermove
 * is rAF-throttled to one write per frame.
 *
 * r128-F3a: verbatim port from madarek/frontend/src/hooks/useMagnetic.ts
 * (PORT-KIT §2) — semantics byte-equal; landing CTA strength 7.
 */
export function useMagnetic<T extends HTMLElement = HTMLElement>(strength = 6) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canHover = window.matchMedia("(hover: hover)").matches;
    if (reduced || !canHover) return;

    let raf = 0;
    let visible = true;

    const reset = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      el.style.setProperty("--mag-x", "0px");
      el.style.setProperty("--mag-y", "0px");
    };

    const io = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      if (!visible) reset();
    });
    io.observe(el);

    const onMove = (e: MouseEvent) => {
      if (!visible) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = (e.clientX - cx) / (r.width / 2);
        const dy = (e.clientY - cy) / (r.height / 2);
        // clamped, eased pull — never more than `strength` px
        const mx = Math.max(-1, Math.min(1, dx)) * strength;
        const my = Math.max(-1, Math.min(1, dy)) * strength * 0.7;
        el.style.setProperty("--mag-x", `${mx.toFixed(1)}px`);
        el.style.setProperty("--mag-y", `${my.toFixed(1)}px`);
      });
    };

    const onLeave = () => reset();

    el.addEventListener("mousemove", onMove, { passive: true });
    el.addEventListener("mouseleave", onLeave, { passive: true });
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      reset();
    };
  }, [strength]);

  return ref;
}
