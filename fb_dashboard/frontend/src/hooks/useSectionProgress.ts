"use client"

import { useEffect, useRef } from "react";

/**
 * useSectionProgress — rAF-coalesced scroll progress (0…1) for a section,
 * written into a CSS variable (`--sp` by default) on the section element.
 *
 * The progress is 0 when the section's top hits the bottom of the
 * viewport and 1 when its bottom leaves the top — the classic
 * "scrub" range. Used by the landing's journey path and progress
 * orbit for scroll-linked storytelling WITHOUT pinning or scroll
 * hijacking: native scrolling, keyboard and reduced-motion all stay
 * untouched.
 *
 * Shared listener belt (perf audit R3 B#2): sections register into a
 * module-level registry served by ONE passive scroll listener + ONE
 * rAF. The flush reads every section's rect in a batch BEFORE writing
 * any CSS variable — one layout pass per frame for the whole page, no
 * matter how many sections are scrubbing. The belt attaches on first
 * registration and releases when the last section unmounts.
 *
 * prefers-reduced-motion → progress snaps to 1 (final composed state)
 * so no animation is required to see the complete picture, and no
 * listener is ever attached.
 *
 * r128-F3a: verbatim port from madarek/frontend/src/hooks/useSectionProgress.ts
 * (PORT-KIT §2) — semantics byte-equal.
 */

interface ProgressTarget {
  el: HTMLElement;
  varName: string;
}

const targets = new Set<ProgressTarget>();
let listening = false;
let raf = 0;

const progressOf = (el: HTMLElement, vh: number) => {
  const rect = el.getBoundingClientRect();
  const total = rect.height + vh;
  const passed = vh - rect.top;
  return Math.max(0, Math.min(1, passed / total)).toFixed(4);
};

/** Read every rect first, then write every variable — no interleaved
 *  read/write cycles inside a frame. */
const flush = () => {
  raf = 0;
  if (targets.size === 0) return;
  const vh = window.innerHeight || 1;
  const writes: Array<[ProgressTarget, string]> = [];
  for (const target of targets) {
    writes.push([target, progressOf(target.el, vh)]);
  }
  for (const [target, value] of writes) {
    target.el.style.setProperty(target.varName, value);
  }
};

const schedule = () => {
  if (!raf) raf = requestAnimationFrame(flush);
};

const ensureListeners = () => {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
};

const maybeReleaseListeners = () => {
  if (targets.size > 0 || !listening) return;
  listening = false;
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", schedule);
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
};

export function useSectionProgress<T extends HTMLElement = HTMLElement>(
  varName = "--sp",
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      el.style.setProperty(varName, "1");
      return;
    }

    const target: ProgressTarget = { el, varName };
    // Synchronous first sample — the CSS var must exist before the
    // first styled frame (identical initial paint to the per-instance
    // listener version).
    el.style.setProperty(varName, progressOf(el, window.innerHeight || 1));
    targets.add(target);
    ensureListeners();

    return () => {
      targets.delete(target);
      maybeReleaseListeners();
    };
  }, [varName]);

  return ref;
}
