"use client";

import { useEffect, useState, type ReactNode } from "react";

/* r129 — the landing stage wrapper (canonical Madarek LandingPage.tsx:104
 * -120 + :213 port). Returning-visitor calm: the first visit in a session
 * plays the full canvas entrance (ln-scene-in, 380ms + 160ms delay);
 * later visits flip [data-intro-seen] on the .landing root and the canvas
 * fades in FAST instead (160ms, zero delay — the landing.css rule). The
 * key is product-scoped per the port protocol ('smartbot.intro.seen' — a
 * shared-PC visit to a sibling product must never calm this entrance).
 * The page's server children pass through untouched; the h1/sub keep
 * painting inline (LCP doctrine — only the canvas entrance is calmed). */
const INTRO_KEY = "smartbot.intro.seen";

export function LandingStage({ children }: { children: ReactNode }) {
  const [introSeen, setIntroSeen] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(INTRO_KEY) === "1";
      if (!seen) window.sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      // sessionStorage may be blocked (private mode) — full entrance stays.
    }
    if (seen) setIntroSeen(true);
  }, []);

  return (
    <div className="landing" data-intro-seen={introSeen ? "true" : undefined}>
      {children}
    </div>
  );
}
