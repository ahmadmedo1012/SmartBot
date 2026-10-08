"use client"

/**
 * useReveal — IntersectionObserver-based reveal hook (shared belt).
 *
 * Adds a class (default `in-view`) to the target ref when it enters
 * the viewport, used by `.reveal-up` / `.reveal-fade` CSS classes
 * for premium scroll-triggered fade/translate animations.
 *
 * Lightweight, no library, respects prefers-reduced-motion.
 *
 * ── Shared observer belt (perf audit R3 #7) ─────────────────────────
 * The landing page mounts ~38 of these. The former per-instance design
 * cost 38 IntersectionObservers + 38 scrollend/resize listener sets,
 * and on Safari/iOS < 18 (no `scrollend`) it fell back to 38 global
 * `scroll` listeners, each with its own rAF — up to 38
 * `getBoundingClientRect()` calls per scroll frame (forced-layout
 * thrash). Now the whole page shares ONE observer per options
 * combination (the 38 default reveals all hit the same key), ONE
 * scroll/resize belt and ONE rAF, and a settle frame reads every
 * registered rect in a single batch BEFORE writing any reveal class —
 * one layout pass for the entire belt instead of one per element.
 * The belt attaches lazily on first registration and tears itself
 * down when the last entry reveals or unmounts.
 *
 * ── Fling-hardening (audit 4-A11 P1-1, quantified live on `/`) ──────
 * a one-shot IO alone permanently hides content. Two blind spots —
 * (a) the `-8%` bottom rootMargin creates a dead zone at the fold:
 *     an element peeking above the viewport bottom but below the
 *     shrunk root bottom (e.g. the landing hero CTA row on 882–959px
 *     viewports) never intersects, so it stays `opacity: 0` on load;
 * (b) IO delivers NO entry when an element jumps from below the root
 *     to above the viewport between observation frames — the
 *     intersection state never changed (verified live: instant jump
 *     to 70% doc height → 28/39 elements stuck). Fixed three ways:
 *     1. mount check — any part of the element at/above the fold
 *        (or already scrolled past) reveals immediately;
 *     2. IO clause — a non-intersecting entry whose rect is fully
 *        above the viewport means the user flung past it → reveal;
 *     3. scroll-settle belt — on `scrollend` (rAF-coalesced `scroll`
 *        where scrollend is unsupported) reconcile anything the IO
 *        never saw. Content must never stay hidden behind a one-shot.
 *
 * r128-F3a: verbatim port from madarek/frontend/src/hooks/useReveal.ts
 * (PORT-KIT §2) — semantics byte-equal. The .reveal-up class family it
 * drives ships in src/app/landing.css (§5 reveal family).
 */
import { createElement, useEffect, useRef, type ReactNode, type ElementType } from "react";

/* ═══════════════════════════════════════════════════════════════════
   Shared belt — module-level, shared by every useReveal instance.
   Nothing here touches window/document at import time (SSR-safe);
   everything runs lazily from component effects.
   ═══════════════════════════════════════════════════════════════════ */

interface RevealEntry {
  el: HTMLElement;
  /** one-shot semantics: reveal once, then leave the belt (default) */
  once: boolean;
  settled: boolean;
  reveal: () => void;
}

/**
 * One observer per options combination — every entry registered with
 * the same threshold/rootMargin shares a single IntersectionObserver
 * (the landing's ~38 reveals all share the default bucket).
 */
interface ObserverBucket {
  obs: IntersectionObserver;
  entries: Set<RevealEntry>;
}

/** All live registrations — what the scroll/settle belt reconciles. */
const registry = new Set<RevealEntry>();
const buckets = new Map<string, ObserverBucket>();

let beltAttached = false;
let beltRaf = 0;
let fontsHooked = false;

/**
 * Read-phase → write-phase: every registered element's rect is read
 * BEFORE any reveal class is written (adding `.in-view` only flips
 * opacity/transform, so it cannot invalidate layout) — one forced
 * layout for the whole belt per settle frame, not one per element.
 */
const reconcileAll = () => {
  if (registry.size === 0) return;
  const due: RevealEntry[] = [];
  for (const entry of registry) {
    if (!entry.settled && entry.el.getBoundingClientRect().top < window.innerHeight) {
      due.push(entry);
    }
  }
  for (const entry of due) entry.reveal();
};

/** ONE rAF per frame, no matter how many entries or belt events fired. */
const scheduleReconcile = () => {
  if (beltRaf) return;
  beltRaf = requestAnimationFrame(() => {
    beltRaf = 0;
    reconcileAll();
  });
};

const onScrollSettle = () => scheduleReconcile();
const onResize = () => scheduleReconcile();
const onLoadSettle = () => scheduleReconcile();
const onFontsSettled = () => scheduleReconcile();

const attachBelt = () => {
  if (beltAttached) return;
  beltAttached = true;
  // (Stored in a const, not an inline `in` check: TS narrows an inline
  // `'onscrollend' in window` else-branch to `never` because lib.dom
  // types the handler — branching on the boolean keeps the window type
  // wide.)
  const supportsScrollEnd = "onscrollend" in window;
  if (supportsScrollEnd) {
    window.addEventListener("scrollend", onScrollSettle, { passive: true });
  } else {
    // Safari & older engines: no scrollend — reconcile on scroll
    // frames; the shared rAF above keeps it to one batch per frame.
    window.addEventListener("scroll", onScrollSettle, { passive: true });
  }
  window.addEventListener("resize", onResize, { passive: true });
  // Geometry drift: images/fonts settle after mount and can pull an
  // element from below the fold into the rootMargin dead zone.
  if (document.readyState !== "complete") {
    window.addEventListener("load", onLoadSettle, { once: true, passive: true });
  }
  if (!fontsHooked) {
    fontsHooked = true;
    document.fonts?.ready?.then(onFontsSettled).catch(() => {
      /* fonts API rejected — the load/scrollend belts still cover */
    });
  }
};

const detachBelt = () => {
  if (!beltAttached) return;
  beltAttached = false;
  // Removing a type that was never added (scrollend vs scroll) is a
  // no-op, so both are attempted unconditionally.
  window.removeEventListener("scrollend", onScrollSettle);
  window.removeEventListener("scroll", onScrollSettle);
  window.removeEventListener("resize", onResize);
  window.removeEventListener("load", onLoadSettle);
  if (beltRaf) {
    cancelAnimationFrame(beltRaf);
    beltRaf = 0;
  }
};

const getBucket = (threshold: number, rootMargin: string): ObserverBucket => {
  const key = `${threshold}|${rootMargin}`;
  let bucket = buckets.get(key);
  if (bucket) return bucket;
  const entries = new Set<RevealEntry>();
  const obs = new IntersectionObserver(
    (list) => {
      for (const e of list) {
        for (const entry of entries) {
          if (entry.el !== e.target || entry.settled) continue;
          if (e.isIntersecting) {
            if (entry.once) {
              entry.reveal(); // also unregisters + reaps the belt when last
            } else {
              entry.el.classList.add("in-view");
            }
          } else if (entry.once && e.boundingClientRect.bottom < 0) {
            // (b) Non-intersecting and fully above the viewport — the
            // user flung/jumped past this element between observation
            // frames. One-shot semantics: passed ⇒ revealed.
            entry.reveal();
          } else if (!entry.once) {
            entry.el.classList.remove("in-view");
          }
        }
      }
    },
    { threshold, rootMargin },
  );
  bucket = { obs, entries };
  buckets.set(key, bucket);
  return bucket;
};

const unregister = (entry: RevealEntry) => {
  registry.delete(entry);
  for (const [key, bucket] of [...buckets]) {
    if (!bucket.entries.delete(entry)) continue;
    if (bucket.entries.size === 0) {
      bucket.obs.disconnect();
      buckets.delete(key);
    }
    break; // an entry lives in exactly one bucket
  }
  if (registry.size === 0) detachBelt();
};

export function useReveal<T extends HTMLElement = HTMLElement>(options?: {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Honour reduced-motion preference — show content immediately, no animation
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      el.classList.add("in-view");
      return;
    }

    const once = options?.once !== false;
    const threshold = options?.threshold ?? 0.12;
    const rootMargin = options?.rootMargin ?? "0px 0px -8% 0px";

    const entry: RevealEntry = {
      el,
      once,
      settled: false,
      reveal: () => {
        if (entry.settled) return;
        entry.settled = true;
        el.classList.add("in-view");
        unregister(entry); // one-shot ⇒ leaves the observer + belt
      },
    };

    // (a) Mount check — already visible at the fold, or scrolled past
    // (scroll-restoration / anchor deep-link): reveal now. Mirrors the
    // platform <Reveal> component's above-the-fold clause.
    if (el.getBoundingClientRect().top < window.innerHeight) {
      entry.reveal();
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      entry.reveal();
      return;
    }

    const bucket = getBucket(threshold, rootMargin);
    registry.add(entry);
    bucket.entries.add(entry);
    bucket.obs.observe(el);
    attachBelt();

    return () => unregister(entry);
  }, [options?.threshold, options?.rootMargin, options?.once]);

  return ref;
}

/**
 * RevealCssClass — thin JSX wrapper around useReveal that manages the
 * `.reveal-up` / `.reveal-d-{1..5}` class contract used by the landing
 * page's choreography (landing.css + polish.css).
 *
 * NOT the platform reveal primitive. `components/motion/Reveal.tsx`
 * (data-reveal / data-revealed + --reveal-distance tokens, RevealGroup
 * staggering) is the sanctioned component for app pages. The two used to
 * share the `Reveal` name and this file's docblock even advertised the
 * other component's API — renamed so nobody picks the wrong one
 * (audit 11-f P2-10).
 *
 * Usage:
 *   <RevealCssClass as="section" className="..." delay={2}>…</RevealCssClass>
 */
export function RevealCssClass({
  as = "div",
  className = "",
  children,
  delay,
  ...rest
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  delay?: 1 | 2 | 3 | 4 | 5;
  [k: string]: unknown;
}) {
  const ref = useReveal<HTMLElement>();
  const cls = ["reveal-up", delay ? `reveal-d-${delay}` : "", className]
    .filter(Boolean)
    .join(" ");
  return createElement(as, { ref, className: cls, ...rest }, children);
}
