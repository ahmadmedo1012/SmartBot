"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useMagnetic } from "@/hooks/useMagnetic";

/* r128 Stage B (F3b) — the gold conversion pill with the canonical
   magnetic pull (PORT-KIT §4: hero/finale CTA strength 7). Client island
   around a plain anchor so the surrounding page stays server-rendered;
   useMagnetic writes --mag-x/--mag-y, the CSS in landing.css §0g
   consumes them (R8). */

export function MagneticGoldLink({
  href,
  external = false,
  xl = false,
  withArrow = false,
  children,
  ariaLabel,
}: {
  href: string;
  external?: boolean;
  xl?: boolean;
  withArrow?: boolean;
  children: ReactNode;
  ariaLabel?: string;
}) {
  const ref = useMagnetic<HTMLAnchorElement>(7);

  return (
    <a
      ref={ref}
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`ln-btn-gold${xl ? " xl" : ""}`}
      aria-label={ariaLabel}
    >
      {children}
      {withArrow && <ArrowLeft size={xl ? 16 : 14} aria-hidden="true" />}
    </a>
  );
}
