"use client"

/**
 * v17-E-F9 — صفحة «الحملات التسلسلية» (ميزة Pro 129: drip campaigns).
 *
 * المحرك + CRUD API حيّان منذ v16 (fb_dashboard/sequence_engine.py و
 * routers/sequences.py) لكن لم تكن هناك أي واجهة — وعد الدفع كان
 * غير قابل للتنفيذ من لوحة التحكم. هذه الصفحة تغلق الفجوة.
 *
 * خريطة العقد المقروءة من routers/sequences.py (غلاف _responses.ok):
 *   GET    /api/sequences                       → list_sequences: صفوف {id,name,
 *          description,status,total_subscribers,total_sent,subscriber_count,
 *          created_at,updated_at} — بلا عدد خطوات (تُجلب تفاصيلًا).
 *   POST   /api/sequences {name,description?}   → {id} (editor role)
 *   GET    /api/sequences/{id}                  → كائن + steps[] مفصّلة
 *   PUT    /api/sequences/{id} {name?,description?,status?} → {ok} (editor)
 *   DELETE /api/sequences/{id}                  → {ok} (editor؛ cascade للخطوات)
 *   POST   /api/sequences/{id}/steps {step_order,delay_days,delay_hours,
 *          message_template}                    → {id} (editor)
 *   PUT    /api/sequences/steps/{id} (نفس الحقول) → {ok} (editor)
 *   DELETE /api/sequences/steps/{id}            → {ok} (editor)
 *   POST   /api/sequences/{id}/subscribe/{sub_id}    → {ok:bool} (false=مكرر)
 *   POST   /api/sequences/{id}/unsubscribe/{sub_id}  → {ok:bool}
 *
 * قيود الخلفية: لا يوجد بوابة خطة (plan gate) على /api/sequences — فقط
 * require_role("editor") للكتابة؛ دور viewer يستقبل 403 «صلاحيات غير
 * كافية» ويظهر عبر brandedToast (ApiError يرفع detail العربية). لذلك لا
 * توجد حالة «متاحة في Pro» هنا: الميزة مفتوحة لكل أدوار المحرر فأعلى.
 *
 * حالات المحرك (models.Sequence.status): draft/active/paused/archived —
 * «completed» خاصة بالاشتراكات وليست حالة حملة، فالبطاقات تعرض عقد
 * الخلفية الفعلي. ترقيم الخطوات من 0 (اتفاقية المحرك: subscribe يبدأ
 * current_step=0 فالخطوات المرقّمة من 1 لن تُرسل أبدًا لمشترك جديد —
 * موثّق في tests/test_v11_broadcast_sequence.py)؛ الواجهة تعرض لل مستخدم
 * «الخطوة 1» لكن تحفظ step_order=index.
 */

import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Workflow, AlertCircle, RefreshCw, Plus, Trash2, Play, Pause,
  Pencil, ChevronUp, ChevronDown, Users, Send, Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { EmptyState, ErrorState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { brandedToast } from "@/lib/premium-toast"
import { countPhrase, formatDateOnly } from "@/lib/format"
import type { Subscriber } from "@/lib/types"

/* ── عقد الصفوف (serializers المقروءة من sequence_engine.py) ───────────── */

/** صف GET /api/sequences (list_sequences). */
interface SequenceRow {
  id: number
  name: string
  description?: string
  status: string // draft/active/paused/archived (عقد models.Sequence)
  total_subscribers?: number
  total_sent?: number
  subscriber_count?: number
  created_at?: string | null
  updated_at?: string | null
}

/** خطوة من GET /api/sequences/{id} (get_sequence.steps). */
interface SequenceStepRow {
  id: number
  step_order: number
  delay_days: number
  delay_hours: number
  message_template: string
}

/** GET /api/sequences/{id} كاملًا. */
interface SequenceDetail extends SequenceRow {
  steps: SequenceStepRow[]
}

/** صف القائمة بعد إثرائها بعدد الخطوات (تفصيل متوازٍ — العقد لا يعده).
 *  v24-C1: step_count/steps are now optional + tolerant — if the backend
 *  later ships step_count (or inline steps) directly on the list rows, the
 *  render falls back to them instead of showing «—» (see stepCountOf). */
interface SequenceCardRow extends SequenceRow {
  step_count?: number // -1 = تعذّر جلب التفاصيل → «—»
  steps?: SequenceStepRow[]
}

/* ── ثوابت العرض ───────────────────────────────────────────────────────── */

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  active: "نشطة",
  paused: "متوقفة مؤقتًا",
  archived: "مؤرشفة",
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary" | "outline"> = {
  draft: "secondary",
  active: "success",
  paused: "warning",
  archived: "outline",
}

/** مساعد نص التأخير بصيغة عربية سليمة (جمع/مثنى). */
function delayLabel(days: number, hours: number): string {
  if (!days && !hours) return "فورًا"
  const d = days ? countPhrase(days, "يوم", "يومين", "أيام") : ""
  const h = hours ? countPhrase(hours, "ساعة", "ساعتين", "ساعات") : ""
  return d && h ? `${d} و${h}` : d || h
}

/* v24-C1: tolerant step-count read for the list cards — the enrichment
 * (parallel detail fetch) owns step_count today (-1 = fetch failed → «—»),
 * but the list contract may later ship step_count or inline steps straight
 * from the backend; fall back instead of rendering «—» for a healthy row. */
function stepCountOf(s: SequenceCardRow): number {
  return s.step_count ?? s.steps?.length ?? 0
}

/* ── محرر الحملة (إنشاء/تحرير + محرر الخطوات + الجمهور) ────────────────── */

/** خطوة في المحرر — id غائب = خطوة جديدة (POST)، موجودة = PUT عند التغيير. */
interface DraftStep {
  id?: number
  message: string
  days: number
  hours: number
  /** لقطة وقت التحميل — نرسل PUT للخطوات المتغيّرة فقط. */
  orig?: { message: string; days: number; hours: number; order: number }
}

function stepDraft(): DraftStep {
  return { message: "", days: 0, hours: 0 }
}

function SequenceEditor({
  seqId,
  row,
  onClosed,
}: {
  /** null = إنشاء؛ رقم = تحرير حملة قائمة. */
  seqId: number | null
  /** صف القائمة للعدّادات الحية (يحدَّث عبر invalidate دون مسح التعديلات). */
  row?: SequenceCardRow
  onClosed: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [steps, setSteps] = useState<DraftStep[]>([stepDraft()])
  /* الجمهور: بحث يُطبَّق عند الإرسال (لا debounce — أبسط وأرخص). */
  const [audSearch, setAudSearch] = useState("")
  const [audApplied, setAudApplied] = useState("")
  const hydrated = useRef(false)

  const isCreate = seqId === null

  const detail = useQuery({
    queryKey: ["sequence", seqId],
    queryFn: () => apiFetch(`/api/sequences/${seqId}`).then(unwrapApi<SequenceDetail>),
    enabled: !isCreate,
    retry: 1,
  })

  /* الترطيب مرة واحدة لكل فتح — invalidate لاحق (اشتراك جديد) يجب ألا
   * يمسح تعديلات المستخدم الجارية؛ العدّادات الحية تأتي من row لا من detail. */
  useEffect(() => {
    if (isCreate || !detail.data || hydrated.current) return
    hydrated.current = true
    setName(detail.data.name)
    setDescription(detail.data.description ?? "")
    const mapped: DraftStep[] = detail.data.steps.map((st) => ({
      id: st.id,
      message: st.message_template ?? "",
      days: st.delay_days ?? 0,
      hours: st.delay_hours ?? 0,
      orig: {
        message: st.message_template ?? "",
        days: st.delay_days ?? 0,
        hours: st.delay_hours ?? 0,
        order: st.step_order,
      },
    }))
    setSteps(mapped.length > 0 ? mapped : [stepDraft()])
  }, [isCreate, detail.data])

  const subscribers = useQuery({
    queryKey: ["sequence-audience", audApplied],
    queryFn: () =>
      apiFetch(
        `/api/subscribers?per_page=20${audApplied ? `&search=${encodeURIComponent(audApplied)}` : ""}`,
      ).then(unwrapApi<{ items: Subscriber[]; total: number }>),
    enabled: !isCreate,
    retry: 1,
  })

  /* ── عمليات الخطوات محليًا ── */
  const moveStep = (index: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const j = index + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const tmp = next[index]!
      next[index] = next[j]!
      next[j] = tmp
      return next
    })
  }

  const removeStep = (index: number) => {
    setSteps((prev) => (prev.length <= 1 ? [stepDraft()] : prev.filter((_, i) => i !== index)))
  }

  const patchStep = (index: number, patch: Partial<Pick<DraftStep, "message" | "days" | "hours">>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  /* ── الحفظ: إنشاء (POST + خطوات) أو تحرير (PUT فوقية + فرق الخطوات) ── */
  const saveMut = useMutation({
    mutationFn: async () => {
      const postStep = (sid: number, i: number, st: DraftStep) =>
        apiFetch(`/api/sequences/${sid}/steps`, {
          method: "POST",
          body: JSON.stringify({
            /* ترقيم من 0 — اتفاقية المحرك (subscribe يبدأ current_step=0) */
            step_order: i,
            delay_days: st.days,
            delay_hours: st.hours,
            message_template: st.message,
          }),
        }).then(unwrapApi<{ id: number }>)

      if (isCreate) {
        const created = await apiFetch("/api/sequences", {
          method: "POST",
          body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        }).then(unwrapApi<{ id: number }>)
        if (!created?.id) throw new Error("تعذر إنشاء الحملة")
        for (let i = 0; i < steps.length; i++) {
          const d = await postStep(created.id, i, steps[i]!)
          if (!d?.id) throw new Error(`تعذر حفظ الخطوة ${i + 1}`)
        }
        return
      }

      /* تحرير: البيانات الوصفية ثم حذف المحذوف ثم upsert الباقية */
      await apiFetch(`/api/sequences/${seqId}`, {
        method: "PUT",
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      }).then(unwrapApi<{ ok: boolean }>)

      const keptIds = new Set(steps.map((s) => s.id).filter((id): id is number => typeof id === "number"))
      for (const st of detail.data?.steps ?? []) {
        if (!keptIds.has(st.id)) {
          await apiFetch(`/api/sequences/steps/${st.id}`, { method: "DELETE" })
        }
      }

      for (let i = 0; i < steps.length; i++) {
        const st = steps[i]!
        const payload = {
          step_order: i,
          delay_days: st.days,
          delay_hours: st.hours,
          message_template: st.message,
        }
        if (!st.id) {
          const d = await postStep(seqId as number, i, st)
          if (!d?.id) throw new Error(`تعذر حفظ الخطوة ${i + 1}`)
        } else if (
          !st.orig ||
          st.orig.message !== st.message ||
          st.orig.days !== st.days ||
          st.orig.hours !== st.hours ||
          st.orig.order !== i
        ) {
          await apiFetch(`/api/sequences/steps/${st.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          }).then(unwrapApi<{ ok: boolean }>)
        }
      }
    },
    onSuccess: () => {
      brandedToast.success(isCreate ? "تم إنشاء الحملة التسلسلية" : "تم حفظ تعديلات الحملة")
      queryClient.invalidateQueries({ queryKey: ["sequences"] })
      onClosed()
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل حفظ الحملة"),
  })

  /* ── الجمهور: إضافة مشترك عبر عقد subscribe ── */
  const enrollMut = useMutation({
    mutationFn: async (subId: number) =>
      apiFetch(`/api/sequences/${seqId}/subscribe/${subId}`, { method: "POST" }).then(
        unwrapApi<{ ok: boolean }>,
      ),
    onSuccess: (d) => {
      /* ok:false = اشتراك مكرر (uq_seq_sub) — رسالة صادقة لا خطأ شبكة */
      if (d && d.ok === false) {
        brandedToast.error("هذا المشترك مضاف بالفعل إلى الحملة")
        return
      }
      brandedToast.success("أُضيف المشترك — سيبدأ من الخطوة الأولى")
      queryClient.invalidateQueries({ queryKey: ["sequences"] })
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشلت إضافة المشترك"),
  })

  const valid =
    name.trim().length > 0 &&
    steps.length > 0 &&
    steps.every((s) => s.message.trim().length > 0)

  /* تحرير: تفاصيل لم تُحمَّل بعد */
  if (!isCreate && detail.isLoading) {
    return (
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          <div className="h-12 rounded-lg bg-muted animate-pulse" />
          <div className="h-24 rounded-xl bg-muted animate-pulse" />
        </CardContent>
      </Card>
    )
  }
  if (!isCreate && detail.isError) {
    return (
      <Card>
        <CardContent className="p-5">
          <ErrorState
            title="فشل تحميل الحملة"
            message={(detail.error as Error)?.message || "تعذر جلب تفاصيل الحملة"}
            onRetry={() => detail.refetch()}
            size="sm"
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault()
          onClosed()
        }
      }}
    >
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold text-sm">{isCreate ? "إنشاء حملة تسلسلية" : `تحرير: ${name}`}</h2>
          <Button size="sm" variant="ghost" onClick={onClosed} aria-label="إغلاق المحرر">
            إلغاء
          </Button>
        </div>

        <Input
          id="sequence-name"
          label="اسم الحملة"
          placeholder="مثال: سلسلة ترحيب العملاء الجدد"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={isCreate}
        />
        <Input
          id="sequence-description"
          label="الوصف (اختياري)"
          placeholder="ما هدف هذه السلسلة؟"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* محرر الخطوات المتسلسلة */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">خطوات السلسلة</p>
          <p className="text-2xs text-muted-foreground">
            كل خطوة تُرسل بعد انقضاء تأخيرها من إرسال الخطوة السابقة (الأولى من
            إضافة المشترك). متغيرات متاحة: {"{name}"} {"{full_name}"} {"{mention}"} {"{date}"}
          </p>
          {steps.map((st, i) => (
            <div key={i} className="rounded-xl border border-border/60 p-3 space-y-2 bg-background/40">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="orange" className="shrink-0">الخطوة {i + 1}</Badge>
                  <span className="text-2xs text-muted-foreground truncate">
                    {i === 0 ? "بعد إضافة المشترك" : "بعد الخطوة السابقة"} · {delayLabel(st.days, st.hours)}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-10 p-0"
                    aria-label={`نقل الخطوة ${i + 1} للأعلى`}
                    disabled={i === 0}
                    onClick={() => moveStep(i, -1)}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-10 p-0"
                    aria-label={`نقل الخطوة ${i + 1} للأسفل`}
                    disabled={i === steps.length - 1}
                    onClick={() => moveStep(i, 1)}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-10 p-0 hover:text-destructive"
                    aria-label={`حذف الخطوة ${i + 1}`}
                    onClick={() => removeStep(i)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <Textarea
                aria-label={`نص الخطوة ${i + 1}`}
                placeholder="مرحباً {name}، شكرًا لاهتمامك بمنتجاتنا…"
                rows={3}
                value={st.message}
                onChange={(e) => patchStep(i, { message: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  id={`step-${i}-days`}
                  type="number"
                  min={0}
                  label="التأخير (أيام)"
                  value={st.days}
                  onChange={(e) => patchStep(i, { days: Math.max(0, Number(e.target.value) || 0) })}
                />
                <Input
                  id={`step-${i}-hours`}
                  type="number"
                  min={0}
                  label="التأخير (ساعات)"
                  value={st.hours}
                  onChange={(e) => patchStep(i, { hours: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setSteps((p) => [...p, stepDraft()])} className="gap-1.5">
            <Plus className="size-3.5" /> إضافة خطوة
          </Button>
        </div>

        {/* الجمهور — عقد الخلفية لا يملك حقل جمهور على الحملة نفسها؛
            الجمهور = اشتراكات فردية عبر /subscribe/{sub_id} (وضع التحرير فقط
            لأن الاشتراك يحتاج seq_id موجودًا). */}
        {!isCreate && (
          <div className="space-y-3 rounded-xl border border-border/60 p-3 bg-background/40">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Users className="size-4 text-muted-foreground" /> الجمهور المستهدف
              </p>
              <span className="text-xs text-muted-foreground">
                {countPhrase(row?.total_subscribers ?? 0, "مشترك", "مشتركين", "مشتركين")} · أُرسلت{" "}
                {countPhrase(row?.total_sent ?? 0, "رسالة", "رسالتين", "رسائل")}
              </span>
            </div>
            <p className="text-2xs text-muted-foreground">
              كل مشترك تضيفه يستلم الخطوات تباعًا وفق تأخير كل خطوة.
            </p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                setAudApplied(audSearch.trim())
              }}
            >
              <Input
                id="audience-search"
                placeholder="ابحث بالاسم…"
                value={audSearch}
                onChange={(e) => setAudSearch(e.target.value)}
                aria-label="البحث في المشتركين"
              />
              <Button size="sm" variant="outline" type="submit" aria-label="تنفيذ البحث">
                <Search className="size-3.5" />
              </Button>
            </form>
            {subscribers.isLoading ? (
              <div className="space-y-1.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-11 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : subscribers.isError ? (
              <ErrorState
                title="فشل تحميل المشتركين"
                message={(subscribers.error as Error)?.message || "تعذر جلب قائمة المشتركين"}
                onRetry={() => subscribers.refetch()}
                size="sm"
              />
            ) : (subscribers.data?.items ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">لا يوجد مشتركون مطابقون.</p>
            ) : (
              <div className="space-y-1.5">
                {(subscribers.data?.items ?? []).map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">
                        {sub.first_name || sub.name || `مشترك #${sub.id}`}
                      </p>
                      <p className="text-2xs text-muted-foreground">
                        {sub.platform === "instagram" ? "إنستغرام" : "ماسنجر"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => enrollMut.mutate(sub.id)}
                      loading={enrollMut.isPending && enrollMut.variables === sub.id}
                      aria-label={`إضافة ${sub.first_name || sub.name || sub.id} إلى الحملة`}
                    >
                      <Plus className="size-3.5" /> إضافة
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={() => saveMut.mutate()}
            disabled={!valid}
            loading={saveMut.isPending}
            className="gap-2"
          >
            <Send className="size-4 rtl:-scale-x-100" />
            {isCreate ? "إنشاء الحملة" : "حفظ التعديلات"}
          </Button>
          <Button variant="outline" onClick={onClosed}>
            إلغاء
          </Button>
        </div>
        {!valid && (
          <p className="text-2xs text-muted-foreground">
            الحفظ يحتاج اسمًا وخطوة واحدة على الأقل بنص رسالة لكل خطوة.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/* ── الصفحة ────────────────────────────────────────────────────────────── */

export default function SequencesPage() {
  const queryClient = useQueryClient()
  /** null = مغلق؛ {mode:"create"} أو {mode:"edit", id, row}. */
  const [editor, setEditor] = useState<
    { mode: "create" } | { mode: "edit"; id: number; row: SequenceCardRow } | null
  >(null)
  /** تأكيد حذف من خطوتين (عربي) — id الحملة في وضع التأكيد. */
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const { data: sequences = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["sequences"],
    queryFn: async () => {
      const list = await apiFetch("/api/sequences").then(unwrapApi<SequenceRow[]>)
      /* عقد القائمة لا يشمل عدد الخطوات — جلب تفاصيل متوازٍ (قوائم إدارية
       * صغيرة؛ فشل تفصيل يتدرّج إلى «—» دون إسقاط القائمة). */
      const counts = await Promise.all(
        (list ?? []).map(async (s) => {
          try {
            const d = await apiFetch(`/api/sequences/${s.id}`).then(unwrapApi<SequenceDetail>)
            return [s.id, d?.steps?.length ?? 0] as const
          } catch {
            return [s.id, -1] as const
          }
        }),
      )
      const stepCounts = new Map(counts)
      return (list ?? []).map((s) => ({ ...s, step_count: stepCounts.get(s.id) ?? -1 }))
    },
    retry: 1,
  })

  const toggleMut = useMutation({
    mutationFn: async (v: { id: number; status: string }) =>
      apiFetch(`/api/sequences/${v.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: v.status }),
      }).then(unwrapApi<{ ok: boolean }>),
    onSuccess: (_d, v) => {
      brandedToast.success(v.status === "active" ? "تم تفعيل الحملة" : "تم إيقاف الحملة مؤقتًا")
      queryClient.invalidateQueries({ queryKey: ["sequences"] })
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل تغيير حالة الحملة"),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: number) =>
      apiFetch(`/api/sequences/${id}`, { method: "DELETE" }).then(unwrapApi<{ ok: boolean }>),
    onSuccess: () => {
      brandedToast.success("تم حذف الحملة وكل خطواتها")
      setConfirmDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ["sequences"] })
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل حذف الحملة"),
  })

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader
        icon={<Workflow className="size-4" />}
        title="الحملات التسلسلية"
        subtitle="سلاسل رسائل تُرسل تلقائيًا بمرور الوقت"
        compact
        actions={
          !editor && (
            <Button size="sm" onClick={() => setEditor({ mode: "create" })} className="gap-1.5">
              <Plus className="size-3.5" /> حملة جديدة
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {editor && (
            <SequenceEditor
              seqId={editor.mode === "edit" ? editor.id : null}
              row={editor.mode === "edit" ? editor.row : undefined}
              onClosed={() => setEditor(null)}
            />
          )}

          {isError ? (
            <div className="text-center py-16">
              <AlertCircle className="size-12 mx-auto mb-3 text-destructive/50" />
              <h2 className="text-sm font-bold mb-1">فشل تحميل الحملات التسلسلية</h2>
              <p className="text-xs text-muted-foreground mb-4">
                {(error as Error)?.message || "تعذر الاتصال"}
              </p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                <RefreshCw className="size-3" /> إعادة المحاولة
              </Button>
            </div>
          ) : isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4 animate-pulse h-16" />
                </Card>
              ))}
            </div>
          ) : sequences.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  icon={Workflow}
                  size="sm"
                  title="لا توجد حملات تسلسلية"
                  description="أنشئ أول سلسلة رسائل مؤقتة — كل مشترك يستلم الخطوات تباعًا حسب التوقيت الذي تحدده."
                  action={{
                    label: "حملة جديدة",
                    icon: Plus,
                    onClick: () => setEditor({ mode: "create" }),
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sequences.map((s) => (
                <Card key={s.id}>
                  <CardContent className="p-4 space-y-2.5">
                    {/* v24-C1 (A1 P1): stacked on mobile — the actions cluster
                        (edit + pause/activate + confirm-delete pair) needed
                        ~368px vs ~295px of card content; shrink-0 on the
                        cluster blocked flex-wrap from ever engaging, clipping
                        the destructive confirm at 375px. Actions now stack
                        under the meta on mobile and wrap within the row ≥sm. */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold truncate">{s.name || `حملة #${s.id}`}</p>
                          <Badge variant={STATUS_VARIANT[s.status] ?? "secondary"} className="shrink-0">
                            {STATUS_LABEL[s.status] ?? s.status}
                          </Badge>
                        </div>
                        {s.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {/* v24-C1: tolerant step count (stepCountOf above) —
                              -1 (detail fetch failed) still renders «—». */}
                          {stepCountOf(s) >= 0
                            ? countPhrase(stepCountOf(s), "خطوة", "خطوتين", "خطوات")
                            : "—"}{" "}
                          · {countPhrase(s.subscriber_count ?? 0, "مشترك نشط", "مشتركان نشطان", "مشتركين نشطين")} ·
                          أُرسلت {countPhrase(s.total_sent ?? 0, "رسالة", "رسالتين", "رسائل")}
                        </p>
                        <p className="text-2xs text-muted-foreground">
                          أُنشئت {formatDateOnly(s.created_at) || "—"} · آخر تحديث{" "}
                          {formatDateOnly(s.updated_at) || "—"}
                        </p>
                      </div>
                      {/* v24-C1: shrink-0 dropped so the wrap above can engage
                          on narrow rows; actions stay end-aligned in RTL. */}
                      <div className="flex flex-wrap items-center gap-1.5 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditor({ mode: "edit", id: s.id, row: s })}
                          aria-label={`تحرير الحملة ${s.name}`}
                        >
                          <Pencil className="size-3.5" /> تحرير
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            toggleMut.mutate({
                              id: s.id,
                              status: s.status === "active" ? "paused" : "active",
                            })
                          }
                          disabled={toggleMut.isPending && toggleMut.variables?.id === s.id}
                          loading={toggleMut.isPending && toggleMut.variables?.id === s.id}
                          aria-label={s.status === "active" ? `إيقاف الحملة ${s.name}` : `تفعيل الحملة ${s.name}`}
                        >
                          {s.status === "active" ? (
                            <>
                              <Pause className="size-3.5" /> إيقاف
                            </>
                          ) : (
                            <>
                              <Play className="size-3.5" /> تفعيل
                            </>
                          )}
                        </Button>
                        {confirmDeleteId === s.id ? (
                          <>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteMut.mutate(s.id)}
                              disabled={deleteMut.isPending && deleteMut.variables === s.id}
                              loading={deleteMut.isPending && deleteMut.variables === s.id}
                            >
                              <Trash2 className="size-3.5" /> تأكيد الحذف
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmDeleteId(null)}
                              aria-label="إلغاء حذف الحملة"
                            >
                              إلغاء
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="hover:text-destructive"
                            onClick={() => setConfirmDeleteId(s.id)}
                            aria-label={`حذف الحملة ${s.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
