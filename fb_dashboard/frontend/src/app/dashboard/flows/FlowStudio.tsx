"use client"

/**
 * P43-C-2 — محرر استوديو الأتمتة (رصفة رأسية + نشر/إيقاف + إحصاءات
 * + تنفيذات + حفظ تلقائي).
 *
 * عقود الخدمة المستهلكة (routers/flows.py — غلاف {success,data}):
 *   GET  /api/flows/{id}            → التفاصيل + nodes/edges
 *   PUT  /api/flows/{id}            → حفظ المسودة {name,description,nodes,edges}
 *   POST /api/flows/{id}/publish    → {status:"active", version} — 422 عربية
 *                                     لكل خلل بنية (مشغّل وحيد/حواف معلّقة/
 *                                     دورة يتيمة/لا عقد) و403 بوابة Premium+
 *   POST /api/flows/{id}/unpublish  → {status:"paused"} (التنفيذات الجارية
 *                                     تُنهى بصدق عند لمسها)
 *   GET  /api/flows/{id}/stats      → الإحصاءات (شريط الرأس)
 *   GET  /api/flows/{id}/executions → سجل التنفيذات (لوحة أسفل المحرر)
 *   POST /api/flows/{id}/test       → {execution_id, trace} — التنفيذ اليدوي
 *
 * أمانة النسخ: المحرك حي (P43-SB1) — النشر يجعل البوت ينفّذ المسار فعليًا
 * على رسائل ميسنجر الواردة؛ ولاحظة «وضع الاختبار» القديمة تقاعدت مع صدقها.
 * الخادم هو المصدر الوحيد للتحقق عند النشر — رسائل 422 العربية تُعرض
 * كما أعادها (مرآة لا ترجمة اخترعناها).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle, CheckCircle2, FlaskConical, GitBranch, Pause, Rocket,
  Save, Trash2, X, Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { brandedToast } from "@/lib/premium-toast"
import { isPlanLocked } from "@/app/dashboard/analytics/plan-lock"
import { countPhrase, formatMoney, formatNumber } from "@/lib/format"
import { buildGraph, countSteps, MATCH_MODES, parseGraph, type FlowDraft, type FlowEdgeJson, type FlowNodeJson, type Step } from "./graph"
import { StepStack } from "./StepStack"
import { ExecutionsPanel } from "./ExecutionsPanel"

/* ── عقد الصفوف (كما في page.tsx — تصدير مشترك) ────────────────────────── */

export interface FlowRow {
  id: number
  name: string
  description?: string | null
  status: string
  version?: number
  total_replies?: number | null
  created_at?: string | null
  updated_at?: string | null
  /** P45-W1 (المبادرة A) — ملخّص آخر تنفيذ من قائمة المسارات (تراكيب
   * flows.py): null صادقة حين لا تنفيذات إطلاقًا. */
  last_execution?: {
    id?: number
    status?: string
    started_at?: string | null
    finished_at?: string | null
  } | null
}

export interface FlowDetail extends FlowRow {
  nodes: unknown
  edges: unknown
  created_by?: string | null
  last_triggered_at?: string | null
}

/** GET /api/flows/{id}/stats — إحصاءات المسار (حقول دفاعية). */
export interface FlowStats {
  flow_id?: number
  status?: string
  total_executions?: number
  active?: number
  completed?: number
  failed?: number
  expired?: number
  messages_sent?: number
  avg_steps?: number
  total_replies?: number
}

export interface TestResult {
  execution_id?: number
  trace?: unknown
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  active: "نشط",
  paused: "متوقف",
  archived: "مؤرشف",
}

const STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "danger"> = {
  draft: "neutral",
  active: "success",
  paused: "warning",
  archived: "neutral",
}

/** مهلة الحفظ التلقائي بعد آخر تعديل. */
const AUTOSAVE_DELAY_MS = 1200

/* ── شريط الإحصاءات (رأس المحرر) ───────────────────────────────────────── */

function StatsStrip({ flowId }: { flowId: number }) {
  const q = useQuery({
    queryKey: ["flow-stats", flowId],
    queryFn: () => apiFetch(`/api/flows/${flowId}/stats`).then(unwrapApi<FlowStats>),
    retry: 1,
  })
  if (q.isError) return null /* شريط تكميلي — فشله لا يقفل المحرر */
  const num = (v: unknown) => Number(v ?? 0) || 0
  const cells: { label: string; value: string }[] = [
    { label: "التنفيذات الكلية", value: formatNumber(num(q.data?.total_executions)) },
    { label: "مكتملة", value: formatNumber(num(q.data?.completed)) },
    { label: "فاشلة", value: formatNumber(num(q.data?.failed)) },
    { label: "رسائل مرسلة", value: formatNumber(num(q.data?.messages_sent)) },
    { label: "متوسط الخطوات", value: formatMoney(num(q.data?.avg_steps)) },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label="إحصاءات التدفق">
      {cells.map((c) => (
        <div key={c.label} className="rounded-xl border border-border/60 bg-card p-3">
          <p className="text-2xs text-muted-foreground">{c.label}</p>
          {q.isLoading ? (
            <div className="skeleton mt-1 h-6 w-12 rounded" />
          ) : (
            <p className="mt-0.5 font-heading text-lg font-bold tabular-nums">{c.value}</p>
          )}
        </div>
      ))}
    </div>
  )
}

/* ── بطاقة المشغّل ─────────────────────────────────────────────────────── */

function TriggerCard({
  keywords, matchMode, onKeywords, onMatchMode,
}: {
  keywords: string[]
  matchMode: string
  onKeywords: (next: string[]) => void
  onMatchMode: (next: string) => void
}) {
  const [draftWord, setDraftWord] = useState("")
  const commit = () => {
    const parts = draftWord.split(/[،,]/).map((k) => k.trim()).filter((k) => k !== "")
    if (parts.length > 0) onKeywords([...keywords, ...parts.filter((p) => !keywords.includes(p))])
    setDraftWord("")
  }
  return (
    <Card className="border-primary/25">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/25 text-primary">
            <Zap className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">المشغّل — عندما تصل رسالة</p>
            <p className="text-xs text-muted-foreground">
              البوت يراقب رسائل ميسنجر الواردة ويبدأ التنفيذ عند التطابق.
            </p>
          </div>
        </div>

        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="list" aria-label="كلمات التشغيل">
            {keywords.map((k, i) => (
              <span
                key={`${k}-${i}`}
                role="listitem"
                className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs"
              >
                <span dir="auto">{k}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 text-muted-foreground hover:text-destructive-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  aria-label={`حذف الكلمة ${k}`}
                  onClick={() => onKeywords(keywords.filter((_, j) => j !== i))}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Input
              id="flow-keyword-input"
              label="كلمات التشغيل"
              placeholder="اكتب كلمة واضغط Enter — مثال: سعر"
              value={draftWord}
              onChange={(e) => setDraftWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "," || e.key === "،") {
                  e.preventDefault()
                  commit()
                }
              }}
              onBlur={commit}
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              value={matchMode}
              onChange={(e) => onMatchMode(e.target.value)}
              aria-label="نمط مطابقة الكلمات"
              disabled={keywords.length === 0}
            >
              {MATCH_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </div>
        </div>
        {keywords.length === 0 && (
          <p className="text-xs text-warning-ink leading-relaxed">
            بدون كلمات مفتاحية يُحفظ المشغّل «يدويًا» — لن يبدأ التدفق تلقائيًا؛
            التشغيل عبر زر الاختبار فقط.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/* ── أثر التنفيذ اليدوي (يُعرض حرفيًا كما أعاده المحرك) ────────────────── */

function TraceSteps({ trace }: { trace: unknown }) {
  const steps: { action: string; nodeId: string; message?: string }[] = []
  let cur: unknown = trace
  let depth = 0
  while (cur && typeof cur === "object" && depth < 60) {
    const node = cur as Record<string, unknown>
    steps.push({
      action: String(node.action ?? "—"),
      nodeId: String(node.node_id ?? ""),
      message: typeof node.message === "string" ? node.message : undefined,
    })
    cur = node.next
    depth += 1
  }
  if (steps.length === 0) {
    return <p className="text-xs text-muted-foreground" dir="auto">لا أثر عائد من المحرك</p>
  }
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-2 rounded-lg border border-border/60 bg-background/40 p-2.5">
          <span className="font-mono tabular-nums text-muted-foreground" dir="ltr">{s.nodeId || "—"}</span>
          <span className="font-mono text-xs font-semibold" dir="ltr">{s.action}</span>
          {s.message !== undefined && (
            <span className="text-xs min-w-0 flex-1 truncate" dir="auto" title={s.message}>«{s.message}»</span>
          )}
        </li>
      ))}
    </ol>
  )
}

function TestFlowDialog({ flowId, name, onClosed }: { flowId: number; name: string; onClosed: () => void }) {
  const queryClient = useQueryClient()
  const [fromName, setFromName] = useState("")
  const [text, setText] = useState("")
  const [result, setResult] = useState<TestResult | null>(null)

  const testMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/flows/${flowId}/test`, {
        method: "POST",
        body: JSON.stringify({
          from_name: fromName.trim() || undefined,
          text: text.trim(),
        }),
      }).then(unwrapApi<TestResult>),
    onSuccess: (d) => {
      setResult(d)
      /* تنفيذ حقيقي يُسجَّل — حدّث السجل والإحصاءات */
      queryClient.invalidateQueries({ queryKey: ["flow-executions", flowId] })
      queryClient.invalidateQueries({ queryKey: ["flow-stats", flowId] })
      queryClient.invalidateQueries({ queryKey: ["flows"] })
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر تشغيل الاختبار"),
  })

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClosed() }}>
      <DialogContent>
        <DialogTitle>تشغيل اختبار: {name || `تدفق #${flowId}`}</DialogTitle>
        <DialogDescription>
          تنفيذ حقيقي عبر المحرك يُسجَّل في سجل التنفيذات — مهما كانت حالة النشر.
        </DialogDescription>

        <Input
          id="test-from-name"
          label="اسم المرسِل التجريبي (اختياري)"
          placeholder="مثال: أحمد"
          value={fromName}
          onChange={(e) => setFromName(e.target.value)}
        />
        <div className="space-y-1">
          <label htmlFor="test-text" className="text-sm font-medium">نص الرسالة الواردة التجريبي</label>
          <Textarea
            id="test-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="مثال: كم سعر التوصيل؟"
            rows={2}
          />
        </div>

        {result && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">أثر التنفيذ</p>
            <p className="text-xs text-muted-foreground">
              معرّف التنفيذ:{" "}
              <span className="font-mono tabular-nums" dir="ltr">{result.execution_id ?? "—"}</span>
            </p>
            <TraceSteps trace={result.trace} />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClosed}>إغلاق</Button>
          <Button
            size="sm"
            loading={testMut.isPending}
            disabled={testMut.isPending}
            onClick={() => testMut.mutate()}
          >
            <FlaskConical className="size-3.5" aria-hidden="true" /> تشغيل
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── المحرر ────────────────────────────────────────────────────────────── */

export function FlowStudio({
  flowId, row, onBack,
}: {
  flowId: number
  row?: FlowRow
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(row?.name ?? "")
  const [description, setDescription] = useState(row?.description ?? "")
  const [steps, setSteps] = useState<Step[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [matchMode, setMatchMode] = useState("any")
  const [triggerId, setTriggerId] = useState("trigger")
  const [orphanNodes, setOrphanNodes] = useState<FlowNodeJson[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const hydratedRef = useRef(false)
  const lastSavedRef = useRef<string>("")
  const [status, setStatus] = useState(row?.status ?? "draft")
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [planLocked, setPlanLocked] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  /* معرّفات مستعملة لتوليد معرفات فريدة للخطوات الجديدة — مشتقة من الحالة لا من ref أثناء التصيير (react-hooks/refs). */
  const usedIds = useMemo(() => {
    const ids = new Set<string>([triggerId, ...orphanNodes.map((n) => n.id)])
    const collect = (chain: Step[]) => {
      for (const s of chain) {
        ids.add(s.id)
        if (s.kind === "CONDITION") {
          collect(s.yes)
          collect(s.no)
        }
      }
    }
    collect(steps)
    return ids
  }, [steps, triggerId, orphanNodes])

  const detail = useQuery({
    queryKey: ["flow", flowId],
    queryFn: () => apiFetch(`/api/flows/${flowId}`).then(unwrapApi<FlowDetail>),
    retry: 1,
  })

  /* الترطيب مرة واحدة (PUT يستبدل nodes/edges — إعادة الترطيب فوق
   * التعديلات المحلية كانت ستبتلعها)؛ الحالة وحدها تتبع إعادة الجلب. */
  useEffect(() => {
    if (!detail.data || hydratedRef.current) return
    hydratedRef.current = true
    setName(detail.data.name ?? "")
    setDescription(detail.data.description ?? "")
    setStatus(String(detail.data.status ?? "draft"))
    const parsed = parseGraph(detail.data.nodes, detail.data.edges)
    setSteps(parsed.steps)
    setKeywords(parsed.keywords)
    setMatchMode(parsed.matchMode)
    setTriggerId(parsed.triggerId)
    setOrphanNodes(parsed.orphanNodes)
    setWarnings(parsed.warnings)
    const initial: FlowDraft = {
      name: detail.data.name ?? "",
      description: detail.data.description ?? "",
      triggerId: parsed.triggerId,
      keywords: parsed.keywords,
      matchMode: parsed.matchMode,
      steps: parsed.steps,
    }
    lastSavedRef.current = JSON.stringify(savePayloadOf(initial))
  }, [detail.data])

  /* الحالة تتبع detail (بعد النشر/الإيقاف) دون لمس المسودة */
  useEffect(() => {
    if (detail.data?.status) setStatus(String(detail.data.status))
  }, [detail.data?.status])

  const currentPayload = useCallback(() => {
    const kw = keywords.map((k) => k.trim()).filter((k) => k !== "")
    const draft: FlowDraft = {
      name: name.trim(),
      description: description.trim(),
      triggerId,
      keywords: kw,
      matchMode,
      steps,
    }
    return savePayloadOf(draft)
  }, [name, description, triggerId, keywords, matchMode, steps])

  /** الحفظ الفوري (زر الحفظ/قبل النشر). يعيد {ok, message}. */
  const saveNow = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    const payload = currentPayload()
    const serialized = JSON.stringify(payload)
    const force = orphanNodes.length > 0
    if (serialized === lastSavedRef.current && !force) return { ok: true }
    setSaveState("saving")
    setSaveError(null)
    try {
      await apiFetch(`/api/flows/${flowId}`, {
        method: "PUT",
        body: serialized,
      }).then(unwrapApi<{ ok: boolean }>)
      lastSavedRef.current = serialized
      if (force) {
        setOrphanNodes([])
        setWarnings([])
      }
      setSaveState("saved")
      return { ok: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : "تعذّر الحفظ"
      setSaveState("error")
      setSaveError(message)
      return { ok: false, message }
    }
  }, [currentPayload, flowId, orphanNodes.length])

  /* الحفظ التلقائي المؤجّل بعد آخر تعديل */
  useEffect(() => {
    if (!hydratedRef.current) return
    const serialized = JSON.stringify(currentPayload())
    if (serialized === lastSavedRef.current) return
    const timer = setTimeout(() => { void saveNow() }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [currentPayload, saveNow])

  const publishMut = useMutation({
    mutationFn: async () => {
      const saved = await saveNow()
      if (!saved.ok) throw new Error(saved.message || "تعذّر حفظ المسودة قبل النشر")
      return apiFetch(`/api/flows/${flowId}/publish`, { method: "POST" }).then(
        unwrapApi<{ status: string; version?: number }>,
      )
    },
    onSuccess: (d) => {
      setPublishError(null)
      setPlanLocked(null)
      setStatus(String(d?.status ?? "active"))
      brandedToast.success("تم نشر التدفق — سينفّذه البوت على الرسائل الواردة")
      queryClient.invalidateQueries({ queryKey: ["flows"] })
      queryClient.invalidateQueries({ queryKey: ["flow", flowId] })
      queryClient.invalidateQueries({ queryKey: ["flow-stats", flowId] })
    },
    onError: (e: Error) => {
      if (isPlanLocked(e)) {
        setPlanLocked(e.message)
        return
      }
      setPublishError(e.message || "تعذّر نشر التدفق")
    },
  })

  const unpublishMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/flows/${flowId}/unpublish`, { method: "POST" }).then(unwrapApi<{ status: string }>),
    onSuccess: (d) => {
      setStatus(String(d?.status ?? "paused"))
      brandedToast.success("تم إيقاف التدفق — لن تبدأ تنفيذات جديدة")
      queryClient.invalidateQueries({ queryKey: ["flows"] })
      queryClient.invalidateQueries({ queryKey: ["flow", flowId] })
      queryClient.invalidateQueries({ queryKey: ["flow-stats", flowId] })
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر إيقاف التدفق"),
  })

  if (detail.isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="skeleton h-10 rounded" />
          <div className="skeleton h-24 rounded-xl" />
          <div className="skeleton h-16 rounded-xl" />
          <div className="skeleton h-32 rounded-xl" />
        </div>
      </div>
    )
  }
  if (detail.isError) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <Card>
            <CardContent className="p-5">
              <EmptyState
                robot="error"
                size="sm"
                title="تعذّر تحميل التدفق"
                description={(detail.error as Error)?.message || "تعذّر جلب تفاصيل التدفق"}
                action={{ label: "إعادة المحاولة", onClick: () => detail.refetch() }}
                secondaryAction={{ label: "عودة للقائمة", onClick: onBack, variant: "ghost" }}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const flowName = name || detail.data?.name || row?.name || `تدفق #${flowId}`
  const isActive = status === "active"

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader
        icon={<GitBranch className="size-4" />}
        title={flowName}
        breadcrumbs={[{ label: "التدفقات" }]}
        subtitle="ينشر المسار وينفّذه البوت فعليًا على رسائل ميسنجر الواردة"
        status={{ label: STATUS_LABEL[status] ?? status, tone: STATUS_TONE[status] ?? "neutral" }}
        compact
        trace={isActive}
        actions={
          <Button size="sm" variant="ghost" onClick={onBack}>
            <DirectionalIcon semanticDirection="back" variant="chevron" className="size-3.5" />
            التدفقات
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <div className="max-w-3xl mx-auto space-y-4">

          <StatsStrip flowId={flowId} />

          {planLocked && (
            <Card className="border-warning/40">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="size-4 text-warning-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-bold">النشر متاح في Premium</p>
                    <p className="text-xs text-muted-foreground leading-relaxed" dir="auto">{planLocked}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-8 p-0 ms-auto"
                    aria-label="إغلاق ملاحظة الخطة"
                    onClick={() => setPlanLocked(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {publishError && (
            <Card className="border-destructive/40">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start gap-2.5" role="alert">
                  <AlertCircle className="size-4 text-destructive-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold">تعذّر النشر — الخادم ردّ:</p>
                    <p className="mt-0.5 text-xs text-destructive-ink leading-relaxed break-words" dir="auto">
                      {publishError}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-8 p-0 ms-auto"
                    aria-label="إغلاق خطأ النشر"
                    onClick={() => setPublishError(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {saveError && (
            <Card className="border-destructive/40">
              <CardContent className="p-4">
                <div className="flex items-start gap-2.5" role="alert">
                  <AlertCircle className="size-4 text-destructive-ink shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold">تعذّر الحفظ التلقائي</p>
                    <p className="mt-0.5 text-xs text-destructive-ink leading-relaxed break-words" dir="auto">
                      {saveError}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* بطاقة العنوان + شريط الأدوات */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  id="flow-name"
                  label="اسم التدفق"
                  placeholder="مثال: أسئلة الأسعار"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  id="flow-description"
                  label="الوصف (اختياري)"
                  placeholder="ماذا يفعل هذا التدفق؟"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-end">
                {/* مؤشر الحفظ التلقائي */}
                <span className="me-auto text-xs text-muted-foreground" aria-live="polite">
                  {saveState === "saving" && "جارٍ الحفظ…"}
                  {saveState === "saved" && (
                    <span className="inline-flex items-center gap-1 text-success-ink">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" /> محفوظ
                    </span>
                  )}
                  {saveState === "error" && "تعديلات غير محفوظة"}
                  {saveState === "idle" && countSteps(steps) > 0 && countPhrase(countSteps(steps), "خطوة")}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTesting(true)}
                >
                  <FlaskConical className="size-3.5" aria-hidden="true" /> تشغيل اختبار
                </Button>
                {isActive ? (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={unpublishMut.isPending}
                    disabled={unpublishMut.isPending}
                    onClick={() => unpublishMut.mutate()}
                  >
                    <Pause className="size-3.5" aria-hidden="true" /> إيقاف النشر
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={publishMut.isPending}
                    disabled={publishMut.isPending}
                    onClick={() => publishMut.mutate()}
                  >
                    <Rocket className="size-3.5" aria-hidden="true" /> نشر التدفق
                  </Button>
                )}
                <Button
                  size="sm"
                  loading={saveState === "saving"}
                  disabled={saveState === "saving"}
                  onClick={() => { void saveNow() }}
                >
                  <Save className="size-3.5" aria-hidden="true" /> حفظ
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* العقد غير التمثيلية — أمانة إعادة البناء */}
          {orphanNodes.length > 0 && (
            <Card className="border-warning/40">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-bold">عقد خارج بنية المحرر الرأسي</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  الحفظ يعيد بناء المخطط من البطاقات أعلاه فقط — هذه العقد
                  ({orphanNodes.map((n) => n.id).join("، ")}) ستُحذف عند أول حفظ
                  (زر «حفظ» أو الحفظ التلقائي بعد أول تعديل).
                </p>
                <ol className="space-y-1">
                  {orphanNodes.map((n) => (
                    <li key={n.id} className="rounded-lg border border-border/60 bg-background/40 p-2.5 text-xs" dir="auto">
                      <span className="font-mono text-muted-foreground" dir="ltr">{n.id}</span>
                      {" — "}
                      <span className="font-mono" dir="ltr">{n.type}</span>
                    </li>
                  ))}
                </ol>
                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" className="hover:text-destructive-ink" onClick={() => { void saveNow() }}>
                    <Trash2 className="size-3.5" aria-hidden="true" /> حذفها الآن وحفظ
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {warnings.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-1.5">
                <p className="text-sm font-semibold">ملاحظات المخطط</p>
                <ul className="space-y-1 text-xs text-muted-foreground leading-relaxed">
                  {warnings.map((w, i) => (
                    <li key={i} dir="auto">• {w}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <TriggerCard
            keywords={keywords}
            matchMode={matchMode}
            onKeywords={setKeywords}
            onMatchMode={setMatchMode}
          />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold">خطوات المسار</p>
              <span className="text-xs text-muted-foreground">
                {countPhrase(countSteps(steps), "خطوة")} — تُنفَّذ بهذا الترتيب
              </span>
            </div>
            <StepStack steps={steps} usedIds={usedIds} onChange={setSteps} />
            {steps.length === 0 && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                المسودة فارغة — أضف أول خطوة تحت المشغّل، ثم انشر التدفق
                لينفّذه البوت على الرسائل المطابقة.
              </p>
            )}
          </div>

          <ExecutionsPanel flowId={flowId} />
        </div>
      </div>

      {testing && (
        <TestFlowDialog flowId={flowId} name={flowName} onClosed={() => setTesting(false)} />
      )}
    </div>
  )
}

/** حِمل الحفظ: PUT {name, description, nodes, edges} (بلا status — النشر/الإيقاف يملكان الحالة). */
function savePayloadOf(draft: FlowDraft): { name: string; description: string; nodes: FlowNodeJson[]; edges: FlowEdgeJson[] } {
  const { nodes, edges } = buildGraph(draft)
  return { name: draft.name, description: draft.description, nodes, edges }
}
