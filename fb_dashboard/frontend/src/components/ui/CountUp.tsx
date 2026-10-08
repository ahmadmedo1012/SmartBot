"use client"

import { useEffect, useRef } from "react";

/**
 * CountUp — animates the numeric part of a marketing stat (e.g. "+50K", "#6",
 * "29", "90") when it scrolls into view, preserving any prefix/suffix.
 *
 * Robust by design: the REAL value is shown by default and is the guaranteed
 * fallback. Animation only ever replaces it temporarily; it can never get
 * stuck at 0 (the previous bug). Honours prefers-reduced-motion.
 * Marketing/hero use only — never for live in-app data.
 *
 * Perf (audit R3 D#13): the value is written straight into the rendered
 * text node via the span ref — no React state, so no re-render per frame
 * across the 7 landing counters. Formatting uses one cached
 * Intl.NumberFormat instance per decimal count (`toLocaleString` is
 * specified as a NumberFormat call, so the output is byte-identical
 * while skipping the per-frame locale-object construction). The
 * animation writes mutate the text NODE React owns rather than
 * replacing it (textContent would orphan React's host instance and
 * break a later prop change).
 *
 * r128-F3a: verbatim port from madarek/frontend/src/components/CountUp.tsx
 * (PORT-KIT §2) — semantics byte-equal.
 */
const formatters = new Map<number, Intl.NumberFormat>();

function formatterFor(decimals: number): Intl.NumberFormat {
  let fmt = formatters.get(decimals);
  if (!fmt) {
    fmt = new Intl.NumberFormat("ar-LY", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, fmt);
  }
  return fmt;
}

export function CountUp({ value, duration = 1100 }: { value: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const m = value.match(/([^\d]*)([\d.,]+)(.*)/);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!m || !m[2] || reduced) return; // keep real value, no animation

    const prefix = m[1] ?? "";
    const numStr = m[2];
    const suffix = m[3] ?? "";
    const target = parseFloat(numStr.replace(/,/g, ""));
    const decimals = numStr.includes(".") ? (numStr.split(".")[1]?.length ?? 0) : 0;
    if (Number.isNaN(target)) return;

    const fmt = formatterFor(decimals);
    const write = (text: string) => {
      const node = el.firstChild;
      if (node && node.nodeType === Node.TEXT_NODE) {
        node.nodeValue = text;
      } else {
        el.textContent = text; // firstChild missing — plain DOM fallback
      }
    };

    let raf = 0;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      let start = 0;
      const tick = (t: number) => {
        if (!start) start = t;
        const p = Math.min((t - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        // always settle on the real value
        write(p < 1 ? `${prefix}${fmt.format(target * eased)}${suffix}` : value);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) { obs.disconnect(); run(); }
    }, { threshold: 0.25 });
    obs.observe(el);

    // Fallback: if already in the viewport at mount, animate right away.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) run();

    return () => { obs.disconnect(); cancelAnimationFrame(raf); };
  }, [value, duration]);

  return <span ref={ref} data-numeric="true">{value}</span>;
}
