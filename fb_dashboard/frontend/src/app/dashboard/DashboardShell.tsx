"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { motion } from "framer-motion"
import { AdminSidebar } from "@/components/layout/AdminSidebar"
import { apiFetch } from "@/lib/csrf-client"
import { springSnappy } from "@/lib/motion"

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  const handleNavigate = (href: string) => {
    router.push(href)
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
      <div className="fixed top-0 right-0 z-50 h-full w-60 hidden md:block">
        <AdminSidebar onNavigate={handleNavigate} onLogout={handleLogout} />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSnappy}
        className="flex-1 md:pr-60 flex flex-col"
      >
        {children}
      </motion.div>
    </div>
  )
}
