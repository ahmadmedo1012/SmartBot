"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserCheck, Plus, Trash2, Loader2, Stethoscope, CheckCircle2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { apiFetch } from "@/lib/csrf-client"

interface DiagnoseResult {
  configExists: boolean
  isActive: boolean
  botTokenPreview: string | null
  events: string[]
  linkedAdmins: number
  broadcastTargets?: {
    id: number; label: string; chatId: string; isActive: boolean
    ok: boolean | null; error: string | null
  }[]
}

interface Approver {
  id: number; telegramId: number; label: string
  addedBy: { id: number; name: string; username: string } | null
  createdAt: string
}

export function DiagnosticsSection({
  diagnose, approvers, approversLoading,
  onApproversChange,
}: {
  diagnose: DiagnoseResult | null
  approvers: Approver[]
  approversLoading: boolean
  onApproversChange: (approvers: Approver[]) => void
}) {
  const [newApproverId, setNewApproverId] = useState("")
  const [newApproverLabel, setNewApproverLabel] = useState("")
  const [addingApprover, setAddingApprover] = useState(false)

  const handleAddApprover = async () => {
    if (!newApproverId.trim()) { toast.error("يرجى إدخال معرف تليجرام"); return }
    setAddingApprover(true)
    try {
      const res = await apiFetch("/api/admin/telegram/approvers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId: Number(newApproverId), label: newApproverLabel.trim() }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "فشل الإضافة")
      onApproversChange([json.data, ...approvers])
      setNewApproverId("")
      setNewApproverLabel("")
      toast.success("تمت إضافة الموافق")
    } catch (e: any) {
      toast.error(e.message || "فشل إضافة الموافق")
    } finally { setAddingApprover(false) }
  }

  const handleDeleteApprover = async (id: number) => {
    try {
      const res = await apiFetch(`/api/admin/telegram/approvers/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "فشل الحذف")
      onApproversChange(approvers.filter((x) => x.id !== id))
      toast.success("تم حذف الموافق")
    } catch (e: any) {
      toast.error(e.message || "فشل حذف الموافق")
    }
  }

  return (
    <>
      {/* Approvers section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <UserCheck className="size-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">الموافقون على الاشتراكات</h3>
        </div>
        <div className="rounded-md bg-card/50 border border-border/30 overflow-hidden">
          <div className="p-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              أضف معرفات تليجرام لأشخاص إضافيين يمكنهم الموافقة أو رفض طلبات الاشتراك عبر البوت
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="appr-telegram-id">معرف تليجرام (User ID)</Label>
                <Input id="appr-telegram-id" type="number" value={newApproverId}
                  onChange={(e) => setNewApproverId(e.target.value)} placeholder="123456789"
                  className="h-11 rounded-xl mt-1.5 text-left" dir="ltr" />
              </div>
              <div className="flex-1">
                <Label htmlFor="appr-label">تسمية</Label>
                <Input id="appr-label" value={newApproverLabel}
                  onChange={(e) => setNewApproverLabel(e.target.value)} placeholder="مثال: أحمد"
                  className="h-11 rounded-xl mt-1.5" />
              </div>
              <Button onClick={handleAddApprover} disabled={addingApprover || !newApproverId.trim()}
                className="rounded-xl gap-1 shrink-0">
                {addingApprover ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                إضافة
              </Button>
            </div>
            {approversLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            ) : approvers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">لا يوجد موافقون مضافة</p>
            ) : (
              <div className="space-y-2">
                {approvers.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-background/50 border border-border/20">
                    <UserCheck className="size-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.label || `ID: ${a.telegramId}`}</p>
                      <p className="text-xs font-mono text-muted-foreground" dir="ltr">
                        {a.telegramId}
                        {a.addedBy && <span className="text-muted-foreground/60"> · أضيف بواسطة {a.addedBy.name}</span>}
                      </p>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteApprover(a.id)} className="rounded-xl">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Diagnose results */}
      {diagnose && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Stethoscope className="size-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">نتيجة التشخيص</h3>
          </div>
          <div className="rounded-md bg-card/50 border border-border/30 overflow-hidden">
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">الإعدادات موجودة</span>
                {diagnose.configExists ? (
                  <Badge variant="default" className="gap-1"><CheckCircle2 className="size-3" /> نعم</Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1"><XCircle className="size-3" /> لا</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">البوت نشط</span>
                {diagnose.isActive ? (
                  <Badge variant="default" className="gap-1"><CheckCircle2 className="size-3" /> نعم</Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1"><XCircle className="size-3" /> لا</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">رمز البوت</span>
                <span className="text-sm font-mono text-muted-foreground" dir="ltr">{diagnose.botTokenPreview ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">الأحداث</span>
                <span className="text-sm text-muted-foreground">{(diagnose.events ?? []).join(", ") || "—"}</span>
              </div>
              {diagnose.configExists && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-success/10 border border-success/20">
                  <CheckCircle2 className="size-4 shrink-0 text-success" />
                  <p className="text-sm text-success">اتصال API سليم — البوت يعمل بشكل صحيح</p>
                </div>
              )}
              {diagnose.broadcastTargets && diagnose.broadcastTargets.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">نتائج جهات الإرسال</h4>
                  <div className="space-y-2">
                    {diagnose.broadcastTargets.map(t => (
                      <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-background/50 border border-border/20">
                        <span className="text-sm truncate">{t.label || t.chatId}</span>
                        {t.ok === true && <Badge variant="default">✅</Badge>}
                        {t.ok === false && <Badge variant="destructive">❌ {t.error}</Badge>}
                        {t.ok === null && <Badge variant="secondary">⏳ لم يُختبر</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
