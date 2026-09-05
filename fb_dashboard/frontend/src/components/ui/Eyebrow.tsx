"use client";

import { cn } from "@/lib/utils";

/* Ported from Smart-Menu (smart-link.ly shared identity) — plain uppercase
   tracked label with pulsing dot (was: SmartBot pill variant). */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn(
      "font-naskh inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-orange/90 mb-5",
      className,
    )}>
      {/* Animated pulsing dot — subtle premium indicator */}
      <span
        className="inline-block size-1 rounded-full bg-orange animate-pulse-dot shrink-0"
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
