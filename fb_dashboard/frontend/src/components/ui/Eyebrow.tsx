"use client";

import { cn } from "@/lib/utils";

/* Ported from Smart-Menu (smart-link.ly shared identity) — plain mono label
   with pulsing dot (was: SmartBot pill variant; uppercase/tracking retired —
   both are no-ops on the Arabic feed, see the class comment below). */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      /* r130 (W1-H SB-2): .font-naskh renamed .font-eyebrow-mono (the class
         renders the mono eyebrow voice — the repo ships no Naskh face), and
         tracking-[0.18em] dropped: this eyebrow is Arabic-fed and the RTL
         guard zeroed it anyway (drift-bait for LTR per the 21-c law).
         r131-F7 (globals hygiene): `uppercase` dropped too — text-transform
         is a no-op on the Arabic script (no case), so the class was dead
         weight; Latin eyebrows would need it re-added deliberately. */
      "font-eyebrow-mono inline-flex items-center gap-2 text-2xs font-medium text-accent-foreground/90 mb-5",
      className,
    )}>
      {/* Animated pulsing dot — subtle premium indicator */}
      <span
        className="inline-block size-1 rounded-full bg-primary animate-pulse-dot shrink-0"
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
