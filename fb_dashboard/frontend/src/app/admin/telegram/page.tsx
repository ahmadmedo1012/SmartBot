"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  Bot, Save, Send, Stethoscope, CheckCircle2, XCircle, Loader2,
  AlertTriangle, BotMessageSquare,
} from "lucide-react"
import { apiFetch } from "@/lib/csrf-client"
import { TelegramConfigSection } from "./TelegramConfigSection"
import { BroadcastTargetsSection } from "./BroadcastTargetsSection"
import { DiagnosticsSection } from "./DiagnosticsSection"

interface TelegramConfig {
  botToken: string
  botTokenMasked?: boolean
  chatId: string
  events: string[]
  isActive: boolean
}

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

interface BroadcastTarget {
  id: number; label: string; chatId: string; isActive: boolean; createdAt: string
}

interface Approver {
  id: number; telegramId: number; label: string
  addedBy: { id: number; name: string; username: string } | null
  createdAt: string
}

export default function AdminTelegramPage() {
  const [accessDenied, setAccessDenied] = useState(false)
  const [config, setConfig] = useState<TelegramConfig>({ botToken: "", chatId: "", events: [], isActive: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnose, setDiagnose] = useState<DiagnoseResult | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [eventsInput, setEventsInput] = useState("")
  const [targets, setTargets] = useState<BroadcastTarget[]>([])
  const [linkedAdmins, setLinkedAdmins] = useState(0)
  const [approvers, setApprovers] = useState<Approver[]>([])
  const [approversLoading, setApproversLoading] = useState(true)

  useEffect(() => {
    apiFetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        const data = d.data || d
        if (data.role !== "admin") {
          setAccessDenied(true); setLoading(false); return
        }
      })
      .catch(() => { setAccessDenied(true); setLoading(false); return })

    fetch("/api/telegram/config", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (json.data) {
          const d = json.data
          setConfig({ botToken: d.botTokenMasked ? "••••••••" : "", botTokenMasked: d.botTokenMasked ?? false, chatId: d.chatId ?? "", events: d.events ?? [], isActive: d.isActive ?? false })
          setEventsInput((d.events ?? []).join(", "))
        }
      })
      .catch(() => toast.error("فشل تحميل الإعدادات"))
      .finally(() => setLoading(false))

    fetch("/api/telegram/broadcast-targets", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => { if (json.success && json.data) setTargets(json.data) })
      .catch(() => {})

    fetch("/api/telegram/diagnose?dryRun=true", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => { if (json.success && json.data) { setLinkedAdmins(json.data.linkedAdmins ?? 0); setDiagnose(json.data) } })
      .catch(() => {})

    fetch("/api/admin/telegram/approvers", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => { if (json.success) setApprovers(json.data ?? []) })
      .catch(() => {})
      .finally(() => setApproversLoading(false))
  }, [])

  const handleSave = async () => {
    if (!config.botToken.trim() || !config.chatId.trim()) { toast.error("يرجى إدخال رمز البوت ومعرف المحادثة"); return }
    setSaving(true)
    try {
      const res = await apiFetch("/api/telegram/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, events: eventsInput.split(",").map((e) => e.trim()).filter(Boolean) }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "فشل الحفظ")
      toast.success("تم حفظ إعدادات تليجرام")
    } catch (e: any) { toast.error(e.message || "فشل حفظ الإعدادات") }
    finally { setSaving(false) }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const res = await apiFetch("/api/telegram/test", { method: "POST" })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "فشل الإرسال")
      toast.success("تم إرسال رسالة الاختبار بنجاح!")
    } catch (e: any) { toast.error(e.message || "فشل إرسال رسالة الاختبار") }
    finally { setTesting(false) }
  }

  const handleDiagnose = async () => {
    setDiagnosing(true); setDiagnose(null)
    try {
      const res = await apiFetch("/api/telegram/diagnose")
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "فشل التشخيص")
      setDiagnose(json.data); setLinkedAdmins(json.data.linkedAdmins ?? 0)
    } catch (e: any) { toast.error(e.message || "فشل التشخيص") }
    finally { setDiagnosing(false) }
  }

  const handleAddTarget = async (label: string, chatId: string) => {
    try {
      const res = await apiFetch("/api/telegram/broadcast-targets", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, chatId }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "فشل الإضافة")
      setTargets((prev) => [json.data, ...prev])
      toast.success("تمت إضافة جهة الإرسال")
    } catch (e: any) { toast.error(e.message || "فشل إضافة جهة الإرسال") }
  }

  const handleToggleTarget = async (id: number, isActive: boolean) => {
    try {
      const res = await apiFetch(`/api/telegram/broadcast-targets/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "فشل التحديث")
      setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, isActive } : t)))
    } catch (e: any) { toast.error(e.message || "فشل تحديث الحالة") }
  }

  const handleDeleteTarget = async (id: number) => {
    try {
      const res = await apiFetch(`/api/telegram/broadcast-targets/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "فشل الحذف")
      setTargets((prev) => prev.filter((t) => t.id !== id))
      toast.success("تم حذف جهة الإرسال")
    } catch (e: any) { toast.error(e.message || "فشل حذف جهة الإرسال") }
  }

  if (accessDenied) return (
    <div className="flex flex-col items-center justify-center py-20 text-center" role="alert">
      <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="size-8 text-destructive" />
      </div>
      <h2 className="text-xl font-bold mb-2">غير مصرح</h2>
      <p className="text-sm text-muted-foreground max-w-xs">لا تملك الصلاحية للوصول إلى إعدادات التليجرام. يرجى التواصل مع المدير العام.</p>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center py-20" aria-live="polite">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl">
      <h2 className="text-2xl font-bold tracking-tight">إعدادات تليجرام</h2>

      <TelegramConfigSection
        config={config} eventsInput={eventsInput} showToken={showToken}
        saving={saving} testing={testing} diagnosing={diagnosing}
        onConfigChange={setConfig} onEventsChange={setEventsInput}
        onToggleShowToken={() => setShowToken(!showToken)}
        onSave={handleSave} onTest={handleTest} onDiagnose={handleDiagnose}
      />

      <BroadcastTargetsSection
        targets={targets} linkedAdmins={linkedAdmins}
        onAdd={handleAddTarget} onToggle={handleToggleTarget} onDelete={handleDeleteTarget}
      />

      <DiagnosticsSection
        diagnose={diagnose} approvers={approvers} approversLoading={approversLoading}
        onApproversChange={setApprovers}
      />

      {/* Broadcast guide */}
      <section>
        <div className="rounded-md bg-muted/30 border border-border/20 p-5">
          <h3 className="text-sm font-semibold mb-2">💡 خطوات التفعيل</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>قم بإضافة البوت الخاص بالمنصة كمشرف (Admin) داخل قناتك أو مجموعتك الخاصة.</li>
            <li>تأكد من تفعيل صلاحية &quot;نشر الرسائل&quot; (Post Messages).</li>
            <li>الصق معرف القناة (تبدأ بـ -100) هنا لحفظ الإعدادات.</li>
          </ol>
        </div>
      </section>

      {/* Help */}
      <section>
        <div className="rounded-md bg-muted/30 border border-border/20 p-5">
          <h3 className="text-sm font-semibold mb-2">كيفية الإعداد</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>افتح <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="underline">@BotFather</a> في تليجرام وأنشئ بوت جديد</li>
            <li>انسخ الرمز (token) والصقه في حقل رمز البوت</li>
            <li>أرسل أي رسالة إلى بوتك الجديد، ثم افتح <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="underline">@userinfobot</a> لمعرفة معرف المحادثة</li>
            <li>أدخل المعرف في حقل معرف المحادثة واحفظ الإعدادات</li>
            <li>اضغط اختبار الإرسال للتحقق من العمل</li>
          </ol>
        </div>
      </section>
    </div>
  )
}
