"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

/**
 * JourneyLightPath — r128 Stage B (F3b), ported from the Smart-Link/Madarek
 * landing (frontend/src/components/landing/JourneyLightPath.tsx),
 * semantics byte-equal.
 *
 * The serpentine path is COMPUTED, not hand-drawn: after layout we
 * measure every `.ln-station-node` (layout position via offset chain —
 * immune to the reveal-up transform) and generate a smooth cubic path
 * guaranteed to pass through each node, so the thread visibly ties the
 * stations together at every breakpoint.
 *
 * · Flat-craft stroke: the lit thread is a bright SOLID lime line that
 *   reads by contrast against the flat ink ground — `filter: none`.
 * · Scroll-scrub: pathLength=1 + stroke-dashoffset driven by the
 *   section's --sp var (pure CSS, written by useSectionProgress) — no
 *   per-frame JS; geometry is cached and only recomputed on stage
 *   resize / webfont settle, rAF-coalesced.
 * · Reduced motion: a static ~35% lit segment — no scrub.
 */

type Pt = { x: number; y: number };

/** Un-lit track — cream hairline. */
const BASE_STROKE = "rgba(245,243,231,0.14)";
/** Lit thread — bright lime, legible without any glow filter. */
const LIGHT_STROKE = "rgba(223,237,178,0.85)";
/** Reduced motion: static ~35% progress (dashoffset = 1 − 0.35). */
const STATIC_DASHOFFSET = 0.65;

const BASE_STYLE: CSSProperties = { stroke: BASE_STROKE };
const LIGHT_STYLE: CSSProperties = { stroke: LIGHT_STROKE, filter: "none" };
const LIGHT_STYLE_STATIC: CSSProperties = { stroke: LIGHT_STROKE, filter: "none", strokeDashoffset: STATIC_DASHOFFSET };

/** Layout-box position of `el` relative to `ancestor` (transform-immune). */
function layoutPos(el: HTMLElement, ancestor: HTMLElement): Pt | null {
  let x = 0;
  let y = 0;
  let cur: HTMLElement | null = el;
  while (cur && cur !== ancestor) {
    x += cur.offsetLeft;
    y += cur.offsetTop;
    cur = cur.offsetParent as HTMLElement | null;
  }
  return cur === ancestor ? { x, y } : null;
}

/** Smooth vertical-tangent cubic through every point (serpentine feel). */
function buildD(pts: Pt[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1]!;
    const p1 = pts[i]!;
    const dy = (p1.y - p0.y) * 0.5;
    d += ` C ${p0.x.toFixed(1)} ${(p0.y + dy).toFixed(1)}, ${p1.x.toFixed(1)} ${(p1.y - dy).toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

export function JourneyLightPath() {
  const stageRef = useRef<SVGSVGElement | null>(null);
  const [geo, setGeo] = useState<{ d: string; w: number; h: number } | null>(null);
  /* SSR guard (Next.js adaptation — the canonical SPA never prerendered):
     reduced-motion is resolved lazily on the client; the server renders
     false and the first client frame corrects if needed. */
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const measure = useCallback(() => {
    const svg = stageRef.current;
    if (!svg) return;
    const stage = svg.closest(".ln-journey-stage") as HTMLElement | null;
    if (!stage) return;

    const w = stage.offsetWidth;
    const h = stage.offsetHeight;
    const nodes = Array.from(stage.querySelectorAll<HTMLElement>(".ln-station-node"));
    const pts: Pt[] = [];
    for (const n of nodes) {
      const p = layoutPos(n, stage);
      if (!p) continue;
      pts.push({ x: p.x + n.offsetWidth / 2, y: p.y + n.offsetHeight / 2 });
    }
    if (pts.length >= 2) {
      setGeo({ d: buildD(pts), w, h });
    }
  }, []);

  useEffect(() => {
    const svg = stageRef.current;
    if (!svg) return;
    const stage = svg.closest(".ln-journey-stage") as HTMLElement | null;
    if (!stage) return;

    measure();

    // rAF-coalesce: at most one measure per frame, no matter how the
    // resize / font-load / load events arrive.
    let measureRaf = 0;
    const scheduleMeasure = () => {
      if (measureRaf) return;
      measureRaf = requestAnimationFrame(() => {
        measureRaf = 0;
        measure();
      });
    };

    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(stage);
    // card heights shift when webfonts swap + when reveals settle
    let t1 = 0;
    let t2 = 0;
    const settle = () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      t1 = window.setTimeout(scheduleMeasure, 650);
      t2 = window.setTimeout(scheduleMeasure, 2200);
    };
    document.fonts?.ready.then(settle).catch(() => undefined);
    window.addEventListener("load", settle);

    return () => {
      ro.disconnect();
      if (measureRaf) cancelAnimationFrame(measureRaf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("load", settle);
    };
  }, [measure]);

  return (
    <svg ref={stageRef} className="ln-journey-path" viewBox={geo ? `0 0 ${geo.w} ${geo.h}` : undefined} preserveAspectRatio="none" aria-hidden="true">
      {geo && (
        <>
          <path className="ln-journey-path-base" d={geo.d} pathLength={1} vectorEffect="non-scaling-stroke" style={BASE_STYLE} />
          <path
            className="ln-journey-path-light"
            d={geo.d}
            pathLength={1}
            vectorEffect="non-scaling-stroke"
            style={reducedMotion ? LIGHT_STYLE_STATIC : LIGHT_STYLE}
          />
        </>
      )}
    </svg>
  );
}
