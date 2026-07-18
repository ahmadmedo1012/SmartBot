"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { CheckCircle, XCircle, RefreshCw, AlertTriangle, ArrowLeft } from "lucide-react"

import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { fadeUp } from "@/lib/motion"
import { apiFetch } from "@/lib/csrf-client"
import Link from "next/link"

interface Payment {
  id: number
  username: string
  plan: string
  amount: number
  status: "pending" | "verified" | "cancelled"
  created_at: string
  phone: string
}

const STATUS_FILTERS = [
  { key: "pending", label: "قيد الانتظار", variant: "warning" as const },
  { key: "verified", label: "مؤكد", variant: "success" as const },
  { key: "cancelled", label: "ملغي", variant: "danger" as const },
  { key: "all", label: "الكل", variant: "outline" as const },
]

const statusConfig: Record<string, { label: string; variant: "warning" | "success" | "destructive" }> = {
  pending: { label: "قيد الانتظار", variant: "warning" },
  verified: { label: "مؤكد", variant: "success" },
  cancelled: { label: "ملغي", variant: "destructive" },
}

export default function AdminPage() {
  const [role, setRole] = useState<string | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [filter, setFilter] = useState("pending")
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<number | null>(null)
  const [roleLoading, setRoleLoading] = useState(true)

  useEffect(() => {
    const meta = document.createElement("meta")
    meta.name = "robots"
    meta.content = "noindex, nofollow"
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  useEffect(() => {
    apiFetch("/api/me")
      .then((r) => r.json())
      .then((d) => { const data = d.data || d; setRole(data.role || null); setRoleLoading(false) })
      .catch(() => { setRole(null); setRoleLoading(false) })
  }, [])

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch(`/api/admin/subscriptions?status=${filter}`)
      if (r.ok) setPayments(await r.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [filter])

  useEffect(() => { if (role === "admin") fetchPayments() }, [role, fetchPayments])

  const handleAction = useCallback(async (id: number, status: string) => {
    setActionId(id)
    try {
      const r = await apiFetch("/api/admin/subscriptions", {
        method: "POST",
        body: JSON.stringify({ id, status }),
      })
      if (!r.ok) { const d = await r.json(); toast.error(d.error || "فشل"); return }
      toast.success(status === "verified" ? "تم تأكيد الاشتراك" : "تم رفض الطلب")
      fetchPayments()
    } catch { toast.error("خطأ في الاتصال") }
    setActionId(null)
  }, [fetchPayments])

  // Unauthorized state
  if (!roleLoading && role !== "admin") {
    return (
      <SectionContainer className="min-h-screen flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md">
          <AlertTriangle className="size-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">غير مصرح</h1>
          <p className="text-muted-foreground mb-6">هذه الصفحة مخصصة للمشرفين فقط. ليس لديك صلاحيات كافية للوصول.</p>
          <Button onClick={() => window.location.href = "/dashboard"}>العودة للوحة التحكم</Button>
        </motion.div>
      </SectionContainer>
    )
  }

  if (roleLoading) {
    return (
      <SectionContainer className="min-h-screen flex items-center justify-center">
        <div className="size-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </SectionContainer>
    )
  }

  return (
    <SectionContainer className="min-h-screen py-8">
      <SectionHeader title="إدارة الاشتراكات" description="مراجعة وإدارة طلبات الاشتراك" />

      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
        <ArrowLeft className="size-4" /> العودة للوحة التحكم
      </Link>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          <Button key={f.key} variant={filter === f.key ? "primary" : "outline"} size="sm" onClick={() => setFilter(f.key)}>
            {f.label}
          </Button>
        ))}
        <Button variant="ghost" size="sm" className="mr-auto" onClick={fetchPayments} loading={loading}>
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
          ) : payments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">لا توجد طلبات اشتراك</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-right p-3 font-medium">المستخدم</th>
                    <th className="text-right p-3 font-medium">الخطة</th>
                    <th className="text-right p-3 font-medium">المبلغ</th>
                    <th className="text-right p-3 font-medium">رقم الهاتف</th>
                    <th className="text-right p-3 font-medium">الحالة</th>
                    <th className="text-right p-3 font-medium">التاريخ</th>
                    <th className="text-center p-3 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <motion.tr key={p.id} variants={fadeUp} custom={0} initial="hidden" animate="visible"
                      className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium" data-label="المستخدم">{p.username}</td>
                      <td className="p-3" data-label="الخطة">{p.plan}</td>
                      <td className="p-3" data-label="المبلغ">{p.amount} د.ل</td>
                      <td className="p-3 text-muted-foreground" data-label="رقم الهاتف" dir="ltr">{p.phone}</td>
                      <td className="p-3" data-label="الحالة">
                        <Badge variant={statusConfig[p.status]?.variant}>{statusConfig[p.status]?.label}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs" data-label="التاريخ">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString("ar-SA") : "-"}
                      </td>
                      <td className="p-3 text-center" data-label="إجراءات">
                        <div className="flex items-center justify-center gap-2">
                          {p.status === "pending" && (
                            <>
                              <Button variant="primary" size="sm" loading={actionId === p.id}
                                onClick={() => handleAction(p.id, "verified")}>
                                <CheckCircle className="size-4" /> قبول
                              </Button>
                              <Button variant="destructive" size="sm" loading={actionId === p.id}
                                onClick={() => handleAction(p.id, "cancelled")}>
                                 <XCircle className="size-4" /> رفض
                              </Button>
                            </>
                          )}
                          {p.status !== "pending" && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </SectionContainer>
  )
}
