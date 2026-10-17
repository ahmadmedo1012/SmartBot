"use client"

import { usePathname, useRouter } from "next/navigation"
import { brandedToast } from "@/lib/premium-toast"
import { MobileBottomNav } from "@/components/layout/MobileBottomNav"
import { SetupWarnings } from "@/components/shared/SetupWarnings"
import { WebhookHealthBanner } from "@/components/shared/WebhookHealthBanner"
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus"
import { apiFetch } from "@/lib/csrf-client"
import { clearQueryPersistedCache } from "@/lib/query-persist"
import { ShellNavRail } from "@/components/dashboard/ShellNavRail"
import { ShellTopBar } from "@/components/dashboard/ShellTopBar"
import { ShellAssistantBar } from "@/components/dashboard/ShellAssistantBar"
import "@/components/dashboard/dashboard-shell.css"
/* v11-A7 — framer-free page entrance. This motion.div was the only reason
 * EVERY dashboard route (26) eagerly shipped the ~116KB framer-motion
 * engine in first-load JS. The springGentle entrance (opacity 0→1, y 12→0,
 * ≈400ms soft spring) is preserved as a CSS twin (.sb-page-enter in
 * enter-motion.css — same values, prefers-reduced-motion guarded, and
 * fill-mode `backwards` so the property is handed back after the run).
 * framer stays available for lazy consumers (wizard/tour). */
import "@/components/shared/enter-motion.css"

/* W2-C2a (directive §4.5/§2.2 — DASHBOARD-SHELL-SPEC.md): the ChainGPT
 * app-shell grammar translated to SmartBot's REAL domain. The 256px
 * labeled sidebar generation is retired for the authenticated shell in
 * favor of the measured structure:
 *   · narrow FIXED icon-only nav rail ≈80px on the inline-START edge
 *     (= RIGHT in RTL — the same physical edge the old sidebar docked to),
 *     52px icon pitch, active = 2px accent bar, bottom-anchored utilities
 *     (theme · settings · logout) — ShellNavRail
 *   · compact ≈70px top band (33px utility row + 37px title row, 1px
 *     hairlines) with the REAL route title + global links + the
 *     conditional subscribe CTA (spectrum BORDER gradient only) — ShellTopBar
 *   · persistent ≈88px bottom AI surface wired to the REAL
 *     POST /api/ai/suggest engine (no fake submit) — ShellAssistantBar
 *   · every surface rides the existing Madarek tokens (var(--card) on
 *     var(--background) + 1px var(--border) hairlines, zero shadows) —
 *     dashboard-shell.css, never landing.css.
 * PRESERVED contracts: QueryProvider/AppToaster wiring (layout.tsx),
 * AuthGuard, #page-content skip target (v8-B7/v9-B9), the keyed
 * sb-fade-up per-route entrance (v17-E-F2), SetupWarnings +
 * WebhookHealthBanner, the v19 Step 1 conditional subscribe CTA, the
 * v24-C3 logout contract (API logout + persisted-cache wipe + /login),
 * MobileBottomNav below md (Track F), and the r134 logical dock
 * (`fixed top-0 start-0` — the rail mirrors under [dir=ltr] for free). */

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { hasActiveSubscription, isLoading: subLoading } = useSubscriptionStatus()

  const handleSubscribe = () => {
    router.push("/subscribe")
  }

  const handleLogout = async () => {
    try {
      await apiFetch("/api/logout", { method: "POST" })
      brandedToast.success("تم تسجيل الخروج")
    } catch { /* ignore */ }
    /* v24-C3 (A2 #3 hygiene): wipe the persisted react-query cache before
     * leaving — a same-tab login as a different user must never hydrate
     * the previous account's dashboard data. */
    clearQueryPersistedCache()
    router.push("/login")
  }

  /* v19 Step 1: the CTA renders only while the tenant has NO live
   * PAID/TRIAL entitlement (unknown/loading keeps the button — avoids a
   * hide-flash on first paint for everyone). */
  const onSubscribe = subLoading || !hasActiveSubscription ? handleSubscribe : undefined

  return (
    <div className="sb-shell flex min-h-screen bg-background" dir="rtl">
      {/* NAV RAIL — fixed, inline-START edge (RIGHT in RTL), ≈80px.
       * r127-F5b: fixed chrome rail = the --z-dropdown rung (100).
       * r134 (RTL A12): start-0 is the logical spelling of the same RIGHT
       * edge (r131 rule: no physical inset props). Hidden below md (the
       * mobile shell keeps MobileBottomNav — Track F contract). */}
      <div className="fixed top-0 start-0 z-(--z-dropdown) h-full w-20 hidden md:block">
        <ShellNavRail onLogout={handleLogout} />
      </div>

      {/* v8-B7: #page-content — the skip-link target. Rail (nav) stays
       * OUTSIDE this wrapper so keyboard users land directly in the content.
       * v9-B9: tabIndex={-1} so the skip link actually MOVES focus here.
       * W2-C2a: content pads inline-start for the 80px rail and block-end
       * for the persistent 88px assistant bar (md+); mobile keeps the 4rem
       * MobileBottomNav pad. */}
      <div
        id="page-content"
        tabIndex={-1}
        className="sb-page-enter flex-1 md:ps-20 flex flex-col outline-none pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-[calc(88px+env(safe-area-inset-bottom))]"
      >
        {/* compact top band (≈70px, sticky chrome rung) */}
        <ShellTopBar onSubscribe={onSubscribe} />

        {/* v3 §4.1 — loud setup-status banners (missing telegram token /
            FB secret / page connection) instead of silent zero data */}
        <SetupWarnings />
        {/* v22-D2 (FIX-F finish): the persisted webhook-subscription verdict
            (BotState fb_webhook_subscribed) — «متصل لكن الويبهوك غير مفعل»
            instead of a silently-dead event pipe (NOT dismissible: health
            signal; hides itself once a re-connect subscribes the page) */}
        <WebhookHealthBanner />

        {/* v17-E-F2 (D2-P1 — 17 sub-pages entered with zero motion):
            .sb-page-enter runs ONCE at first shell mount — App Router then
            swaps only {children} between routes, so every subsequent
            navigation needs this keyed remount to replay .sb-fade-up
            (enter-motion.css — CSS-only, opacity+translateY so no reflow,
            fill-mode `backwards`, reduced-motion → none). One wrapper
            covers all 23 dashboard routes. */}
        <div key={pathname} className="sb-fade-up flex-1 flex flex-col">
          {children}
        </div>
      </div>

      {/* PERSISTENT bottom AI surface (≈88px, md+ only) — the REAL
          /api/ai/suggest engine; fixed above content, below modals/toasts.
          Mobile keeps MobileBottomNav (Track F) — the two never coexist. */}
      <div className="fixed bottom-0 start-20 end-0 z-(--z-dropdown) hidden md:block">
        <ShellAssistantBar />
      </div>

      {/* Mobile navigation (Track F) — visible below md where the rail is hidden.
          v24-C3 (A2 #2): same Link-prefetch contract — no onNavigate, only logout. */}
      <MobileBottomNav onLogout={handleLogout} />
    </div>
  )
}
