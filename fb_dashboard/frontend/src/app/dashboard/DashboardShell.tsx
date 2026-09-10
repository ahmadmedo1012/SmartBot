"use client"

import { usePathname, useRouter } from "next/navigation"
import { brandedToast } from "@/lib/premium-toast"
import { AdminSidebar } from "@/components/layout/AdminSidebar"
import { MobileBottomNav } from "@/components/layout/MobileBottomNav"
import { SetupWarnings } from "@/components/shared/SetupWarnings"
import { WebhookHealthBanner } from "@/components/shared/WebhookHealthBanner"
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus"
import { apiFetch } from "@/lib/csrf-client"
/* v11-A7 — framer-free page entrance. This motion.div was the only reason
 * EVERY dashboard route (26) eagerly shipped the ~116KB framer-motion
 * engine in first-load JS. The springGentle entrance (opacity 0→1, y 12→0,
 * ≈400ms soft spring) is preserved as a CSS twin (.sb-page-enter in
 * enter-motion.css — same values, prefers-reduced-motion guarded, and
 * fill-mode `backwards` so the property is handed back after the run).
 * framer stays available for lazy consumers (wizard/tour). */
import "@/components/shared/enter-motion.css"

/* World-class launch plan v3 §6 (Smart-Menu owner-layout pattern):
 * - page entrance uses the Smart-Menu PageFade spring (250/22/0.9 — was
 *   500/30, ~2x stiffer)
 * - sidebar stays a flex sibling (no fixed overlay) — content flows beside it
 * - the dead "اشتراك" sidebar CTA is now wired to /subscribe (was never
 *   passed → button never rendered, OnboardingTour step was broken)
 * - v19 Step 1: the CTA is now CONDITIONAL — it renders only while the
 *   tenant has NO live PAID/TRIAL entitlement (useSubscriptionStatus, the
 *   shared /api/me derivation). A subscribed customer saw a dead upsell
 *   button forever + could re-enter the payment flow (the duplicate
 *   complaint); pending-payment users keep the button so they can reach
 *   the v18 cancel flow from the sidebar. */

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  // v17-E-F2 (D2-P1 entrance census): keyed per-route entrance below.
  const pathname = usePathname()
  const { hasActiveSubscription, isLoading: subLoading } = useSubscriptionStatus()

  const handleNavigate = (href: string) => {
    router.push(href)
  }

  const handleSubscribe = () => {
    router.push("/subscribe")
  }

  const handleLogout = async () => {
    try {
      await apiFetch("/api/logout", { method: "POST" })
      brandedToast.success("تم تسجيل الخروج")
    } catch { /* ignore */ }
    router.push("/login")
  }

  return (
    <div className="flex min-h-screen bg-background" dir="rtl">
      <div className="fixed top-0 right-0 z-30 h-full w-60 hidden md:block">
        {/* v19 Step 1: hide the upsell CTA once the tenant is actively
            subscribed (unknown/loading keeps the button — avoids a
            hide-flash on first paint for everyone). */}
        <AdminSidebar
          onNavigate={handleNavigate}
          onLogout={handleLogout}
          onSubscribe={subLoading || !hasActiveSubscription ? handleSubscribe : undefined}
        />
      </div>
      {/* v8-B7: #page-content — the skip-link target. Sidebar (nav) stays
       * OUTSIDE this wrapper so keyboard users land directly in the content.
       * v9-B9: tabIndex={-1} — a div is not focusable by default, so the skip
       * link scrolled here but focus stayed in the sidebar; -1 makes the
       * container programmatically focusable so focus actually moves. */}
      <div
        id="page-content"
        tabIndex={-1}
        className="sb-page-enter flex-1 md:ps-60 flex flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 outline-none"
      >
        {/* v3 §4.1 — loud setup-status banners (missing telegram token /
            FB secret / page connection) instead of silent zero data */}
        <SetupWarnings />
        {/* v22-D2 (FIX-F finish): the persisted webhook-subscription verdict
            (BotState fb_webhook_subscribed) — «متصل لكن الويبهوك غير مفعل»
            instead of a silently-dead event pipe (NOT dismissible: health
            signal; hides itself once a re-connect subscribes the page) */}
        <WebhookHealthBanner />
        {/* v17-E-F2 (D2-P1 — 17 sub-pages entered with zero motion):
            .sb-page-enter (on #page-content above) runs ONCE at first shell
            mount — App Router then swaps only {children} between routes, so
            every subsequent navigation rendered instantly with no entrance
            (D2 census: leads/posts/comments/… zero motion classes). Keying
            this wrapper by pathname remounts it per navigation and replays
            .sb-fade-up (enter-motion.css — CSS-only, opacity+translateY so
            no reflow, fill-mode `backwards`, prefers-reduced-motion → none).
            One wrapper covers all 23 dashboard routes; E-F9's sequences page
            inherits it automatically (contract E-F2→الكل). */}
        <div key={pathname} className="sb-fade-up flex-1 flex flex-col">
          {children}
        </div>
      </div>

      {/* Mobile navigation (Track F) — visible below md where the sidebar is hidden */}
      <MobileBottomNav onNavigate={handleNavigate} onLogout={handleLogout} />
    </div>
  )
}
