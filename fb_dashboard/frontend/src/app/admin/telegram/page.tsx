"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { brandedToast } from "@/lib/premium-toast"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"
import { apiFetch } from "@/lib/csrf-client"
import { Button } from "@/components/ui/button"
import { TelegramConfigSection } from "./TelegramConfigSection"
import { BroadcastTargetsSection } from "./BroadcastTargetsSection"
import { DiagnosticsSection } from "./DiagnosticsSection"
import { unwrapApi } from "@/lib/api"
import type { ApiUser } from "@/lib/types"

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
  const queryClient = useQueryClient()

  /* v9-B10 — all loads migrated from raw useEffect fetch() (which never
   * checked res.ok: 403/500 responses parsed as "no data" and failed
   * silently) to useQuery + apiFetch/unwrapApi. apiFetch throws ApiError on
   * !ok, unwrapApi throws on success:false — every failure is now a real
   * loading/error state react-query can retry and refetch. */

  // ── Access gate ──
  const meQuery = useQuery({
    queryKey: ["admin-telegram-me"],
    queryFn: () => apiFetch("/api/me").then(unwrapApi<{ user?: ApiUser }>),
    retry: 1,
  })
  const accessDenied = meQuery.isError || (meQuery.isSuccess && meQuery.data?.user?.role !== "admin")

  // ── Bot config (editable local copy seeded from the query) ──
  const configQuery = useQuery({
    queryKey: ["telegram-config"],
    queryFn: () => apiFetch("/api/telegram/config").then(unwrapApi<TelegramConfig>),
    retry: 1,
  })
  const [config, setConfig] = useState<TelegramConfig>({ botToken: "", chatId: "", events: [], isActive: false })
  const [showToken, setShowToken] = useState(false)
  const [eventsInput, setEventsInput] = useState("")
  useEffect(() => {
    const d = configQuery.data
    if (d) {
      setConfig({ botToken: d.botTokenMasked ? "••••••••" : "", botTokenMasked: d.botTokenMasked ?? false, chatId: d.chatId ?? "", events: d.events ?? [], isActive: d.isActive ?? false })
      setEventsInput((d.events ?? []).join(", "))
    }
  }, [configQuery.data])

  // ── Broadcast targets ──
  const targetsQuery = useQuery({
    queryKey: ["telegram-broadcast-targets"],
    queryFn: () => apiFetch("/api/telegram/broadcast-targets").then(unwrapApi<BroadcastTarget[]>),
    retry: 1,
  })
  const targets: BroadcastTarget[] = Array.isArray(targetsQuery.data) ? targetsQuery.data : []
  useEffect(() => {
    if (targetsQuery.isError) brandedToast.error("فشل تحميل جهات الإرسال")
  }, [targetsQuery.isError])

  // ── Initial dry-run diagnose (health snapshot) ──
  const diagnoseQuery = useQuery({
    queryKey: ["telegram-diagnose", "dry"],
    queryFn: () => apiFetch("/api/telegram/diagnose?dryRun=true").then(unwrapApi<DiagnoseResult>),
    retry: 1,
  })
  const [diagnose, setDiagnose] = useState<DiagnoseResult | null>(null)
  useEffect(() => {
    if (diagnoseQuery.data) setDiagnose(diagnoseQuery.data)
  }, [diagnoseQuery.data])
  useEffect(() => {
    if (diagnoseQuery.isError) brandedToast.error("فشل تحميل التشخيص الأولي")
  }, [diagnoseQuery.isError])
  const linkedAdmins = diagnose?.linkedAdmins ?? 0

  // ── Subscription approvers ──
  const approversQuery = useQuery({
    queryKey: ["admin-telegram-approvers"],
    queryFn: () => apiFetch("/api/admin/telegram/approvers").then(unwrapApi<Approver[]>),
    retry: 1,
  })
  const approvers: Approver[] = Array.isArray(approversQuery.data) ? approversQuery.data : []
  useEffect(() => {
    if (approversQuery.isError) brandedToast.error("فشل تحميل الموافقين")
  }, [approversQuery.isError])

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)

  const handleSave = async () => {
    if (!config.botToken.trim() || !config.chatId.trim()) { brandedToast.error("يرجى إدخال رمز البوت ومعرف المحادثة"); return }
    setSaving(true)
    try {
      const res = await apiFetch("/api/telegram/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, events: eventsInput.split(",").map((e) => e.trim()).filter(Boolean) }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "فشل الحفظ")
      queryClient.invalidateQueries({ queryKey: ["telegram-config"] })
      brandedToast.success("تم حفظ إعدادات تليجرام")
    } catch (e) { brandedToast.error((e as Error).message || "فشل حفظ الإعدادات") }
    finally { setSaving(false) }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const res = await apiFetch("/api/telegram/test", { method: "POST" })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "فشل الإرسال")
      brandedToast.success("تم إرسال رسالة الاختبار بنجاح!")
    } catch (e) { brandedToast.error((e as Error).message || "فشل إرسال رسالة الاختبار") }
    finally { setTesting(false) }
  }

  const handleDiagnose = async () => {
    setDiagnosing(true); setDiagnose(null)
    try {
      const d = await apiFetch("/api/telegram/diagnose").then(unwrapApi<DiagnoseResult>)
      setDiagnose(d)
    } catch (e) { brandedToast.error((e as Error).message || "فشل التشخيص") }
    finally { setDiagnosing(false) }
  }

  const handleAddTarget = async (label: string, chatId: string) => {
    try {
      const res = await apiFetch("/api/telegram/broadcast-targets", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label, chatId }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "فشل الإضافة")
      queryClient.invalidateQueries({ queryKey: ["telegram-broadcast-targets"] })
      brandedToast.success("تمت إضافة جهة الإرسال")
    } catch (e) { brandedToast.error((e as Error).message || "فشل إضافة جهة الإرسال") }
  }

  const handleToggleTarget = async (id: number, isActive: boolean) => {
    try {
      const res = await apiFetch(`/api/telegram/broadcast-targets/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "فشل التحديث")
      queryClient.invalidateQueries({ queryKey: ["telegram-broadcast-targets"] })
    } catch (e) { brandedToast.error((e as Error).message || "فشل تحديث الحالة") }
  }

  const handleDeleteTarget = async (id: number) => {
    try {
      const res = await apiFetch(`/api/telegram/broadcast-targets/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "فشل الحذف")
      queryClient.invalidateQueries({ queryKey: ["telegram-broadcast-targets"] })
      brandedToast.success("تم حذف جهة الإرسال")
    } catch (e) { brandedToast.error((e as Error).message || "فشل حذف جهة الإرسال") }
  }

  if (accessDenied) return (
    <div className="flex flex-col items-center justify-center py-20 text-center" role="alert">
      <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="size-8 text-destructive" />
      </div>
      <h2 className="text-xl font-bold mb-2">غير مصرح</h2>
      <p className="text-sm text-muted-foreground max-w-xs">لا تملك الصلاحية للوصول إلى إعدادات تليجرام. يرجى التواصل مع المدير العام.</p>
    </div>
  )

  if (meQuery.isLoading || configQuery.isLoading) return (
    <div className="flex items-center justify-center py-20" role="status">
      <span className="sr-only">جارٍ التحميل…</span>
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl">
      {/* Visually-hidden page heading — the visible title below is h2 (v8-B5) */}
      <h1 className="sr-only">إعدادات تليجرام</h1>
      <h2 className="text-2xl font-bold tracking-tight">إعدادات تليجرام</h2>

      {/* v9-B10 — config load failure is now a visible, retryable error state
          (was a one-off toast + silently empty form) */}
      {configQuery.isError && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-destructive">{(configQuery.error as Error)?.message || "فشل تحميل الإعدادات"}</p>
          <Button size="sm" variant="outline" onClick={() => configQuery.refetch()}>
            <RefreshCw className="size-3.5" aria-hidden="true" /> إعادة المحاولة
          </Button>
        </div>
      )}

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
        diagnose={diagnose} approvers={approvers} approversLoading={approversQuery.isLoading}
        onApproversChange={() => { queryClient.invalidateQueries({ queryKey: ["admin-telegram-approvers"] }) }}
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
            <li>افتح <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" aria-label="@BotFather — يفتح في تبويب جديد" className="underline">@BotFather</a> في تليجرام وأنشئ بوت جديد</li>
            <li>انسخ الرمز (token) والصقه في حقل رمز البوت</li>
            <li>أرسل أي رسالة إلى بوتك الجديد، ثم افتح <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" aria-label="@userinfobot — يفتح في تبويب جديد" className="underline">@userinfobot</a> لمعرفة معرف المحادثة</li>
            <li>أدخل المعرف في حقل معرف المحادثة واحفظ الإعدادات</li>
            <li>اضغط اختبار الإرسال للتحقق من العمل</li>
          </ol>
        </div>
      </section>
    </div>
  )
}
