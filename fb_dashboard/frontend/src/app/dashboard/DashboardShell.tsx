"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { motion } from "framer-motion"
import { AdminSidebar } from "@/components/layout/AdminSidebar"
import { MobileBottomNav } from "@/components/layout/MobileBottomNav"
import { SetupWarnings } from "@/components/shared/SetupWarnings"
import { apiFetch } from "@/lib/csrf-client"
import { springGentle } from "@/lib/motion"

/* World-class launch plan v3 §6 (Smart-Menu owner-layout pattern):
 * - page entrance uses the Smart-Menu PageFade spring (250/22/0.9 — was
 *   500/30, ~2x stiffer)
 * - sidebar stays a flex sibling (no fixed overlay) — content flows beside it
 * - the dead "اشتراك" sidebar CTA is now wired to /subscribe (was never
 *   passed → button never rendered, OnboardingTour step was broken) */

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  const handleNavigate = (href: string) => {
    router.push(href)
  }

  const handleSubscribe = () => {
    router.push("/subscribe")
  }

  const handleLogout = async () => {
    try {
      await apiFetch("/api/logout", { method: "POST" })
      toast.success("تم تسجيل الخروج")
    } catch { /* ignore */ }
    router.push("/login")
  }

  return (
    <div className="flex min-h-screen bg-background" dir="rtl">
      <div className="fixed top-0 right-0 z-30 h-full w-60 hidden md:block" style={{ zIndex: "var(--z-sticky, 30)" }}>
        <AdminSidebar onNavigate={handleNavigate} onLogout={handleLogout} onSubscribe={handleSubscribe} />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springGentle}
        className="flex-1 md:pr-60 flex flex-col pb-16 md:pb-0"
      >
        {/* v3 §4.1 — loud setup-status banners (missing telegram token /
            FB secret / page connection) instead of silent zero data */}
        <SetupWarnings />
        {children}
      </motion.div>

      {/* Mobile navigation (Track F) — visible below md where the sidebar is hidden */}
      <MobileBottomNav onNavigate={handleNavigate} onLogout={handleLogout} />
    </div>
  )
}
