"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AdminSidebar } from "@/components/layout/AdminSidebar"
import { apiFetch } from "@/lib/csrf-client"

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  const handleNavigate = (href: string) => {
    router.push(href)
  }

  const handleLogout = async () => {
    try {
      await apiFetch("/api/logout", { method: "POST" })
      toast.success("تم تسجيل الخروج")
      router.push("/login")
    } catch { /* ignore */ }
  }

  return (
    <div className="flex min-h-screen bg-background" dir="rtl">
      <div className="fixed top-0 right-0 z-50 h-full w-60 hidden md:block">
        <AdminSidebar onNavigate={handleNavigate} onSubscribe={handleLogout} />
      </div>
      <div className="flex-1 md:pr-60 flex flex-col">
        {children}
      </div>
    </div>
  )
}
