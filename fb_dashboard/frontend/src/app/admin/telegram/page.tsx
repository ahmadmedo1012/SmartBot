"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { brandedToast } from "@/lib/premium-toast"
import { AlertTriangle, Loader2, RefreshCw, Info } from "lucide-react"
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
  botTokenConfigured?: boolean
  chatId: string
  events: string[]
  isActive: boolean
}

/* v15-E5 (D4-H4): the DiagnoseResult now mirrors the REAL backend contract
 * (routers/telegram_config.py /api/telegram/diagnose) — adminCount (was
 * linkedAdmins, always undefined → «0»), dryRunResult (was never rendered —
 * the page claimed «البوت يعمل بشكل صحيح» on configExists alone), source.
 * The never-served `events`/`broadcastTargets` keys are gone (dead code). */
interface DiagnoseResult {
  configExists: boolean
  isActive: boolean
  source?: string
  adminCount: number
  botTokenPreview: string | null
  dryRunResult?: string
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
      /* v15-E5 (D4-H2): NEVER seed the field with the «••••••••» mask —
       * saving with the mask used to send it to the backend and fail the
       * regex (400), making every chatId/isActive change impossible without
       * re-pasting the secret. The field starts EMPTY; botTokenMasked only
       * drives the placeholder («الرمز محفوظ…») and handleSave omits the
       * key entirely while the field is untouched (backend: absent =
       * no-change; only an explicitly-typed new token is sent).
       *
       * v17-E-B2 (D5-F2): the «تفعيل إشعارات تليجرام» switch (isActive) and
       * «الأحداث المرسلة» (events) now ROUND-TRIP — the backend persists
       * both (SystemConfig telegram_notify_config) and GET returns the
       * stored values, so these initial values are the real saved ones and
       * no longer snap back after a save+reload. handleSave always sends
       * both keys (backend merges, key-present semantics). */
      setConfig({ botToken: "", botTokenMasked: d.botTokenMasked ?? false, chatId: d.chatId ?? "", events: d.events ?? [], isActive: d.isActive ?? false })
      setEventsInput((d.events ?? []).join(", "))
    }
  }, [configQuery.data])

  // ── Broadcast targets ──
  const targetsQuery = useQuery({
    queryKey: ["telegram-broadcast-targets"],
    queryFn: () => apiFetch("/api/telegram/broadcast-targets").then(unwrapApi<BroadcastTarget[]>),
    retry: 1,
  })
  /* v16-E4 (D7 slop-scan): the Array.isArray dual-shape guards are gone —
   * unwrapApi already types the payload and the backend always returns
   * ok([...]) (telegram_config.py) — convention v13-3 (single envelope,
   * no per-call shape guards). `|| []` only covers react-query's
   * undefined-while-loading state (same idiom as dashboard/support:98
   * and dashboard/notifications:140). */
  const targets: BroadcastTarget[] = targetsQuery.data || []
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
  /* v15-E5 (D4-H4): adminCount is the backend's real key (linkedAdmins was
   * never in the response → the count read 0 forever). */
  const linkedAdmins = diagnose?.adminCount ?? 0

  /* v18-1-d (حارس الإشارة): «غير مكوّن» = لا توكن بوت أو لا مستلم واحد —
   * الحالة التي كانت تمر بصمت تام (حلقة فارغة في notify_*) وتترك طلبات
   * الدفع معلقة للأبد. تُعرض كبطاقة تحذير برتقالية واضحة أعلى الصفحة
   * قبل أي شيء آخر، مع خطوات الإصلاح المختصرة (BotFather → التوكن → لصقه). */
  const tokenConfigured = configQuery.data?.botTokenConfigured ?? configQuery.data?.botTokenMasked ?? false
  const notifyUnconfigured = configQuery.isSuccess && diagnoseQuery.isSuccess &&
    (!tokenConfigured || linkedAdmins === 0)

  // ── Subscription approvers ──
  const approversQuery = useQuery({
    queryKey: ["admin-telegram-approvers"],
    queryFn: () => apiFetch("/api/admin/telegram/approvers").then(unwrapApi<Approver[]>),
    retry: 1,
  })
  const approvers: Approver[] = approversQuery.data || []
  useEffect(() => {
    if (approversQuery.isError) brandedToast.error("فشل تحميل الموافقين")
  }, [approversQuery.isError])

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [diagnosing, setDiagnosing] = useState(false)

  const handleSave = async () => {
    /* v15-E5 (D4-H2): an untouched token field (empty) is OMITTED from the
     * payload — the masked placeholder is never sent, and the backend
     * treats the absent key as “keep the stored token” (an explicit empty
     * string still clears it). Only a genuinely-typed new token rides along. */
    if (!config.chatId.trim()) { brandedToast.error("يرجى إدخال معرف المحادثة"); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        chatId: config.chatId.trim(),
        events: eventsInput.split(",").map((e) => e.trim()).filter(Boolean),
        isActive: config.isActive,
      }
      if (config.botToken.trim()) payload.botToken = config.botToken.trim()
      const res = await apiFetch("/api/telegram/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      brandedToast.success("تم إرسال رسالة الاختبار")
    } catch (e) { brandedToast.error((e as Error).message || "فشل إرسال رسالة الاختبار") }
    finally { setTesting(false) }
  }

  const handleDiagnose = async () => {
    setDiagnosing(true); setDiagnose(null)
    try {
      /* v15-E5 (D4-H4): dryRun=true is what makes the verdict REAL — the
       * backend only attempts the test send (and only reports dryRunResult)
       * with the flag set; without it the manual button returned less data
       * than the page's own initial load. */
      const d = await apiFetch("/api/telegram/diagnose?dryRun=true").then(unwrapApi<DiagnoseResult>)
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
      {/* v14-E5 (D4 M-02b): the unauth branch had no h1 while the authorized
          branch has one (v8-B5 sr-only pattern) — page-heading parity. */}
      <h1 className="sr-only">إعدادات تليجرام</h1>
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

      {/* v18-1-d (حارس الإشارة): قناة الإشعارات ميتة — بطاقة تحذير صفراء/برتقالية
          واضحة (نفس idiom SetupWarnings) بدل الصمت: بدون توكن أو بدون مستلم
          واحد لن تصل أي إشعار، وكل دفعة جديدة تبقى معلقة بلا موافقة. */}
      {notifyUnconfigured && (
        <div role="alert" aria-label="تحذير: إشعارات تليجرام غير مكوّنة"
             className="rounded-xl border border-warning/30 bg-warning/10 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
            {!tokenConfigured ? "إشعارات تليجرام غير مكوّنة — لن يصل أي إشعار" : "لا يوجد مستلم للإشعارات — لن يصل أي إشعار"}
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            {!tokenConfigured ? (
              <>لن تصل أي إشعارات حتى تضيف توكن البوت ومستلمًا واحدًا على الأقل —
              كل طلب دفع أو اشتراك جديد سيبقى معلّقًا في انتظار موافقة لا تصل لأحد.</>
            ) : (
              <>توكن البوت محفوظ لكن لا يوجد مستلم واحد على الأقل — أضف معرف
              تليجرام خاصتك في قسم «الموافقون على الاشتراكات» بالأسفل لتصلك
              طلبات الموافقة.</>
            )}
          </p>
          {!tokenConfigured && (
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>افتح <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" aria-label="@BotFather — يفتح في تبويب جديد" className="underline text-warning">@BotFather</a> في تليجرام وأرسل /newbot ثم انسخ التوكن.</li>
              <li>الصق التوكن (بصيغة 123456789:AA…) في حقل «رمز البوت» بالأسفل واحفظ الإعدادات.</li>
              <li>أضف معرف تليجرام في «الموافقون على الاشتراكات» ثم اضغط «اختبار الإرسال» للتحقق.</li>
            </ol>
          )}
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
          {/* v17-E-F4 (D3 #7): 💡 emoji → Info (the app's info-state glyph,
              aria-hidden, size-4 matching the text-sm heading scale). */}
          <h3 className="flex items-center gap-1.5 text-sm font-semibold mb-2">
            <Info className="size-4 shrink-0" aria-hidden="true" />
            خطوات التفعيل
          </h3>
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
