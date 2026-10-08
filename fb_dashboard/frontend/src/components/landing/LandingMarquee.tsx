/**
 * LandingMarquee — r128-F3a Stage A kit (PORT-KIT §3).
 *
 * Self-contained, SERVER-SAFE (RSC — no hooks, no "use client"): the
 * strip is decorative (aria-hidden) and the loop is pure CSS, so it
 * costs zero hydration. Structure mirrors madarek LandingPage.tsx:409-419:
 * the real item list duplicated ×2 inside one track; every item carries
 * a trailing dot separator whose "·" glyph is hidden by the CSS
 * (font-size: 0) and redrawn as a true 5px lime dot.
 *
 * CSS: src/app/landing.css §3 (marquee block) — 48px track gap, 24px
 * seam correction (translateX 0 → calc(50% + 24px)), 42s linear loop,
 * hard edges (no mask/fade), explicit reduced-motion off-switch.
 */
export function LandingMarquee({ items }: { items: string[] }) {
  return (
    <section className="ln-marquee" aria-hidden="true">
      <div className="ln-marquee-track">
        {[...items, ...items].map((it, i) => (
          <span className="ln-marquee-item" key={i}>
            {it}
            <span className="ln-marquee-sep">·</span>
          </span>
        ))}
      </div>
    </section>
  )
}
