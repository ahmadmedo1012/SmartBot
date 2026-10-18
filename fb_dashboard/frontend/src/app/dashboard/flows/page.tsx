"use client"

/**
 * P21-W6-B1 — صفحة «التدفقات» (ميزة Premium: has_flows).
 *
 * الخلفية (تدقيق W6-A1 فجوة #1): الاستحقاق has_flows مُنفَّذ خادميًا منذ
 * W4-B (flows.py:44-52) لكن بلا أي مستهلك واجهة — المشتركون في مميز/
 * احترافي/مؤسسي يدفعون لميزة لا سبيل للوصول إليها. هذه الصفحة تغلق الفجوة.
 *
 * خريطة العقد المقروءة من routers/flows.py (غلاف _responses.ok):
 *   GET    /api/flows                    → صفوف {id,name,description,status,
 *          version,total_replies,created_at,updated_at} — لأي مستخدم موثّق
 *          (بلا بوابة خطة: القائمة مفتوحة والبوابة عند الإنشاء فقط).
 *   POST   /api/flows {name,description?,nodes?,edges?} → {id} (دور editor؛
 *          بوابة has_flows هنا فقط — 403 «التدفقات متاحة في خطة مميز أو
 *          أعلى — رقِّ خطتك»؛ 422 عربية لناقص name).
 *   GET    /api/flows/{id}               → الكائن + nodes/edges/created_by/
 *          last_triggered_at (مفتوح).
 *   PUT    /api/flows/{id} {name?,description?,nodes?,edges?,status?} → {ok}
 *          (editor؛ PUT فوقي يستبدل nodes/edges كما هي مُرسلة).
 *   DELETE /api/flows/{id}               → {ok} (editor؛ يمحو المنفَّذات).
 *   POST   /api/flows/{id}/toggle        → {status} (editor؛ دورة الحالات
 *          draft→active→paused→active — انظر ST_CYCLE).
 *   POST   /api/flows/{id}/test {from_id?,from_name?,text} → {execution_id,
 *          trace} (editor؛ مشغّل manual عبر FlowContext).
 *
 * مخطط العقد/الحواف (flow_engine.py:262-379): node {id,type,data} حيث
 * type ∈ TRIGGER|MESSAGE|CONDITION|ACTION|DELAY|GOAL|SEQUENCE؛ TRIGGER data
 * {triggerType: keyword|post_comment|page_visit|manual, keywords[],
 * matchMode: any|all|exact}؛ MESSAGE data {text, buttons[]}؛ CONDITION يحتاج
 * حافتين {source,target,sourceHandle:"true"|"false"}.
 *
 * ══ الأمانة أولًا (عقد هذه الواجهة) ══
 * 1) المحرك ساكن: لا شيء يستهلك flow_engine إلا مسار /test (المحرك نفسه
 *    موسوم [DEPRECATED — kept for future use]؛ _match_trigger معرَّف بلا
 *    مستدعٍ واحد في مسار التنفيذ). لا تؤكد الواجهة أتمتةً حيّة: لا عقدة
 *    لايم حية على الصفوف، و«trace="static"» في PageHeader (عقد الأدوات —
 *    ليس دفق أتمتة حيًا)، ولاحظة «وضع الاختبار — التنفيذ اليدوي» في
 *    رأس الصفحة وفي حوار الاختبار حيث تُعرض النتائج.
 * 2) «مفعّل» إعداد محفوظ: POST /toggle يخزّن status فقط (لا قارئ له اليوم
 *    — حتى /test ينفّذ بغضّ النظر عن الحالة). المفتاح = إعداد جاهز للربط
 *    القادم، وليس تشغيلًا فعليًا — مذكور في لاحظة الوضع.
 * 3) total_replies عدّاد تنفيذات لا ردود: execute() يزيده على كل تشغيل
 *    (والاختبار ضمنه) فتُعرض «تنفيذ» لا «رد» — نفس الحقيقة التي يراها
 *    الخادم.
 * 4) نتيجة /تُعرض حرفيًا: سلسلة أفعال المحرك (action/node_id/message)
 *    تُعرض كما أعادها الخادم (مونو dir=ltr) — لا ترجمة اخترعناها تدّعي
 *    إرسالًا ناجحًا (action:"message_sent" يطلقه المحرك حتى إن فشل
 *    إرسال فيسبوك للمعرّف التجريبي).
 * 5) المحرر v0 = نموذج مُهيكل لا لوحة رسم: مشغّل (كلمات+نمط مطابقة) +
 *    سلسلة رسائل خطية، تُبنى nodes/edges فعليًا في المتصفح بعقد مخطط
 *    المحرك. التدفقات ذات العقد المتقدمة (شرط/تأخير/إجراء/فرع) تُحرَّر
 *    بياناتها الوصفية فقط مع عرض السلسلة للقراءة — PUT يستبدل nodes/edges
 *    كما أُرسلت فأي إعادة بناء ناقصة كانت ستمحوها (فئة فقدان بيانات).
 * 6) محطة الجوال (Expo) خارج هذه الدفعة عمدًا — سطح الويب أولًا.
 */
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  GitBranch, AlertCircle, RefreshCw, Plus, Trash2, Pencil,
  FlaskConical, ChevronUp, ChevronDown, Crown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { brandedToast } from "@/lib/premium-toast"
import { isPlanLocked } from "@/app/dashboard/analytics/plan-lock"
import { countPhrase, formatDateOnly } from "@/lib/format"

/* ── عقد الصفوف (serializers المقروءة من routers/flows.py) ───────────── */

/** صف GET /api/flows (list_flows). */
interface FlowRow {
  id: number
  name: string
  description?: string | null
  status: string // draft/active/paused (عقد models.Flow + ST_CYCLE)
  version?: number
  total_replies?: number | null
  created_at?: string | null
  updated_at?: string | null
}

/** GET /api/flows/{id} كاملًا (nodes/edges من أعمدة JSON). */
interface FlowDetail extends FlowRow {
  nodes: unknown
  edges: unknown
  created_by?: string | null
  last_triggered_at?: string | null
}

/** نتيجة POST /api/flows/{id}/test (flow_engine.execute). */
interface TestResult {
  execution_id?: number
  trace?: unknown
}

/** عقدة المخطط (flow_engine._traverse — type فوقي داخل المحرك). */
interface FlowNode {
  id: string
  type?: string
  data?: Record<string, unknown>
}

/** حافة المخطط (المحرك يتبع الحافة الأولى من كل مصدر). */
interface FlowEdge {
  source?: string
  target?: string
  sourceHandle?: string
}

/* ── ثوابت العرض ───────────────────────────────────────────────────────── */

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  active: "مفعّل",
  paused: "متوقف مؤقتًا",
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary" | "outline"> = {
  draft: "secondary",
  active: "success",
  paused: "warning",
}

/** نتيجة /toggle تُعرض من الخادم لا من توقّعنا (ST_CYCLE هو مصدر الحقيقة). */
function toggleToast(status: string): string {
  if (status === "active") return "تم تفعيل التدفق"
  if (status === "paused") return "تم إيقاف التدفق مؤقتًا"
  return `تغيّرت حالة التدفق إلى ${STATUS_LABEL[status] ?? status}`
}

/* ── بنّاء/قارئ المخطط (v0: مشغّل + سلسلة رسائل خطية) ─────────────────── */

const MATCH_MODES = [
  { value: "any", label: "أي كلمة" },
  { value: "all", label: "كل الكلمات" },
  { value: "exact", label: "مطابقة تامة" },
] as const

/** رسالة مسودة في المحرر — المفتاح هوية React فقط (PUT يستبدل الكل). */
interface DraftMessage {
  key: string
  text: string
}

let msgKeySeq = 0
function messageDraft(): DraftMessage {
  return { key: `msg-${++msgKeySeq}`, text: "" }
}

/** حواف/عقد السلسلة الخطية كما ينفّذها المحرك (الحافة الأولى من كل مصدر). */
function buildGraph(keywords: string[], matchMode: string, messages: string[]) {
  const triggerData: Record<string, unknown> =
    keywords.length > 0
      ? { triggerType: "keyword", keywords, matchMode }
      : { triggerType: "manual" }
  const nodes: FlowNode[] = [{ id: "trigger", type: "TRIGGER", data: triggerData }]
  const edges: FlowEdge[] = []
  messages.forEach((text, i) => {
    const id = `msg-${i + 1}`
    nodes.push({ id, type: "MESSAGE", data: { text } })
    edges.push({ source: i === 0 ? "trigger" : `msg-${i}`, target: id })
  })
  return { nodes, edges }
}

/** هل المخطط سلسلة خطية يعرفها المحرر؟ (وإلا: تحرير وصفي فقط — أمانة
 *  الحفاظ على عقد الشرط/التأخير/الإجراء: PUT يستبدل nodes/edges كما
 *  أُرسلت، فإعادة بناء ناقصة كانت ستمحوها). */
interface ParsedGraph {
  simple: boolean
  keywords: string[]
  matchMode: string
  messages: string[]
}

function parseGraph(detail: FlowDetail): ParsedGraph {
  const nodes = Array.isArray(detail.nodes) ? (detail.nodes as FlowNode[]) : []
  const edges = Array.isArray(detail.edges) ? (detail.edges as FlowEdge[]) : []
  const triggers = nodes.filter((n) => String(n?.type ?? "").toUpperCase() === "TRIGGER")
  const others = nodes.filter((n) => String(n?.type ?? "").toUpperCase() !== "TRIGGER")
  const tData = (triggers[0]?.data ?? {}) as Record<string, unknown>
  const keywords = Array.isArray(tData.keywords)
    ? tData.keywords.map((k) => String(k)).filter((k) => k.trim() !== "")
    : []
  const matchMode = typeof tData.matchMode === "string" ? tData.matchMode : "any"

  /* متابعة الحافة الأولى من كل مصدر — نفس ما يفعله _traverse. */
  const byId = new Map(nodes.map((n) => [String(n?.id ?? ""), n]))
  const nextOf = new Map<string, string>()
  for (const e of edges) {
    const src = String(e?.source ?? "")
    if (src && !nextOf.has(src)) nextOf.set(src, String(e?.target ?? ""))
  }
  const messages: string[] = []
  const chain = new Set<string>()
  let cur = triggers[0] ? nextOf.get(String(triggers[0].id ?? "")) : undefined
  while (cur && !chain.has(cur)) {
    chain.add(cur)
    const node = byId.get(cur)
    if (node && String(node.type ?? "").toUpperCase() === "MESSAGE") {
      const d = (node.data ?? {}) as Record<string, unknown>
      messages.push(typeof d.text === "string" ? d.text : "")
    }
    cur = nextOf.get(cur)
  }

  /* «بسيط» = مشغّل واحد + رسائل فقط + كل الرسائل داخل السلسلة + لا
   * حواف sourceHandle (تفرّع شرط) ولا رسائل خارجها ولا حواف زائدة. */
  const simple =
    triggers.length === 1 &&
    others.length === messages.length &&
    others.every((n) => chain.has(String(n.id ?? ""))) &&
    edges.length === messages.length &&
    edges.every((e) => !e?.sourceHandle)

  return { simple, keywords, matchMode, messages }
}

/** ملخّص عقدة للعرض للقراءة (المخططات المتقدمة). */
function nodeSummary(n: FlowNode): string {
  const t = String(n?.type ?? "").toUpperCase()
  const d = (n?.data ?? {}) as Record<string, unknown>
  if (t === "TRIGGER") {
    const tt = String(d.triggerType ?? "manual")
    const kws = Array.isArray(d.keywords) ? (d.keywords as unknown[]).map(String) : []
    return tt === "keyword" && kws.length > 0
      ? `مشغّل الكلمات: ${kws.join("، ")}`
      : `مشغّل: ${tt}`
  }
  if (t === "MESSAGE") return `رسالة: ${typeof d.text === "string" ? d.text : ""}`
  if (t === "CONDITION") return `شرط: ${String(d.field ?? "")} ${String(d.operator ?? "")} ${String(d.value ?? "")}`
  if (t === "DELAY") return `تأخير: ${String(d.amount ?? "")} ${String(d.unit ?? "seconds")}`
  if (t === "ACTION") return `إجراء: ${String(d.actionType ?? "")} ${String(d.value ?? "")}`
  if (t === "GOAL") return "هدف التدفق"
  if (t === "SEQUENCE") return `تدفق فرعي: ${String(d.subFlowId ?? d.sub_flow_id ?? "")}`
  return `${t}`
}

/* ── الحالة «متاحة في Premium» (نمط analytics/PremiumLockBody) ─────────── */

/** 403 بوابة الخطة من POST /api/flows — نسخة الخادم العربية + دعوة /subscribe.
 *  (isPlanLocked يميّز عائلة البوابات عن إيقاف المنظمة وصلاحيات editor —
 *  P21-W5-C1.) */
function PremiumLockBody({ message }: { message: string }) {
  const router = useRouter()
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-xl bg-(--c-yellow-bg) text-(--c-yellow-ink)">
        <Crown className="size-5" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-bold">التدفقات — متاحة في Premium</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed" dir="auto">
          {message}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={() => { router.push("/subscribe") }}>
        <Crown className="size-3.5" /> ترقية الخطة
      </Button>
    </div>
  )
}

/* ── محرر التدفق (إنشاء/تحرير — نموذج مُهيكل v0) ───────────────────────── */

function FlowEditor({
  flowId,
  row,
  onClosed,
}: {
  /** null = إنشاء؛ رقم = تحرير تدفق قائم. */
  flowId: number | null
  row?: FlowRow
  onClosed: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [keywords, setKeywords] = useState("")
  const [matchMode, setMatchMode] = useState<string>("any")
  const [messages, setMessages] = useState<DraftMessage[]>([messageDraft()])
  /** true = إنشاء اصطدم ببوابة الخطة — اعرض القفل بدل النموذج. */
  const [planLocked, setPlanLocked] = useState<string | null>(null)
  /** مخطط متقدم؟ (عقد شرط/تأخير/إجراء أو تفرّع) → تحرير وصفي فقط. */
  const [advanced, setAdvanced] = useState(false)
  const [readonlyNodes, setReadonlyNodes] = useState<FlowNode[]>([])
  const hydrated = useRef(false)

  const isCreate = flowId === null

  const detail = useQuery({
    queryKey: ["flow", flowId],
    queryFn: () => apiFetch(`/api/flows/${flowId}`).then(unwrapApi<FlowDetail>),
    enabled: !isCreate,
    retry: 1,
  })

  useEffect(() => {
    if (isCreate || !detail.data || hydrated.current) return
    hydrated.current = true
    setName(detail.data.name ?? "")
    setDescription(detail.data.description ?? "")
    const parsed = parseGraph(detail.data)
    setKeywords(parsed.keywords.join("، "))
    setMatchMode(parsed.matchMode)
    setMessages(
      parsed.messages.length > 0 ? parsed.messages.map((t) => ({ key: `msg-${++msgKeySeq}`, text: t })) : [messageDraft()],
    )
    setAdvanced(!parsed.simple)
    setReadonlyNodes(Array.isArray(detail.data.nodes) ? (detail.data.nodes as FlowNode[]) : [])
  }, [isCreate, detail.data])

  const saveMut = useMutation({
    mutationFn: async () => {
      const kw = keywords.split(/[،,]/).map((k) => k.trim()).filter(Boolean)
      const texts = messages.map((m) => m.text.trim()).filter((t) => t !== "")
      /* المخططات المتقدمة: بيانات وصفية فقط — nodes/edges الأصلية محفوظة
       * (PUT يستبدلها كما أُرسلت فأي إعادة بناء ناقصة يمحوها). */
      const payload = advanced
        ? { name: name.trim(), description: description.trim() }
        : {
            name: name.trim(),
            description: description.trim(),
            ...buildGraph(kw, matchMode, texts),
          }
      if (isCreate) {
        return apiFetch("/api/flows", {
          method: "POST",
          body: JSON.stringify(payload),
        }).then(unwrapApi<{ id: number }>)
      }
      return apiFetch(`/api/flows/${flowId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }).then(unwrapApi<{ ok: boolean }>)
    },
    onSuccess: () => {
      brandedToast.success(isCreate ? "تم إنشاء التدفق" : "تم حفظ تعديلات التدفق")
      queryClient.invalidateQueries({ queryKey: ["flows"] })
      onClosed()
    },
    onError: (e: Error) => {
      /* بوابة الخطة (إنشاء فقط — القائمة/التحرير مفتوحان بعد التنزيل):
       * اعرض قفل Premium بنسخة الخادم بدل توست عابر. */
      if (isCreate && isPlanLocked(e)) {
        setPlanLocked(e.message)
        return
      }
      brandedToast.error(e.message || "تعذّر حفظ التدفق")
    },
  })

  const valid = name.trim().length > 0

  if (!isCreate && detail.isLoading) {
    return (
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="skeleton h-4 w-32 rounded" />
          <div className="skeleton h-12 rounded-lg" />
          <div className="skeleton h-24 rounded-xl" />
        </CardContent>
      </Card>
    )
  }
  if (!isCreate && detail.isError) {
    return (
      <Card>
        <CardContent className="p-5">
          <EmptyState
            robot="error"
            size="sm"
            title="تعذّر تحميل التدفق"
            description={(detail.error as Error)?.message || "تعذّر جلب تفاصيل التدفق"}
            action={{ label: "إعادة المحاولة", onClick: () => detail.refetch() }}
          />
        </CardContent>
      </Card>
    )
  }
  if (planLocked) {
    return (
      <Card>
        <CardContent className="p-5">
          <PremiumLockBody message={planLocked} />
          <div className="flex justify-center">
            <Button size="sm" variant="ghost" onClick={onClosed}>إغلاق</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const patchMessage = (index: number, text: string) => {
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, text } : m)))
  }
  const moveMessage = (index: number, dir: -1 | 1) => {
    setMessages((prev) => {
      const j = index + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const tmp = next[index]!
      next[index] = next[j]!
      next[j] = tmp
      return next
    })
  }
  const removeMessage = (index: number) => {
    setMessages((prev) => (prev.length <= 1 ? [messageDraft()] : prev.filter((_, i) => i !== index)))
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
          <h2 className="sb-section-title">{isCreate ? "إنشاء تدفق" : `تحرير: ${row?.name ?? name}`}</h2>
          <Button size="sm" variant="ghost" onClick={onClosed} aria-label="إغلاق المحرر">
            إلغاء
          </Button>
        </div>

        <Input
          id="flow-name"
          label="اسم التدفق"
          placeholder="مثال: أسئلة الأسعار"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus={isCreate}
        />
        <Input
          id="flow-description"
          label="الوصف (اختياري)"
          placeholder="ماذا يفعل هذا التدفق؟"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {advanced ? (
          /* مخطط متقدم: السلسلة للقراءة فقط — PUT لن يمس nodes/edges. */
          <div className="space-y-2">
            <p className="text-sm font-semibold">مخطط التدفق (للقراءة)</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              يحتوي هذا التدفق عقدًا متقدمة (شرط/تأخير/إجراء أو تفرّعًا) — محرر
              النموذج يدعم السلسلة الخطية فقط، لذا تُحرَّر البيانات الوصفية
              أعلاه ويُحفظ المخطط الأصلي كما هو.
            </p>
            <ol className="space-y-1.5">
              {readonlyNodes.map((n, i) => (
                <li key={`${n.id}-${i}`} className="rounded-lg border border-border/60 bg-background/40 p-2.5 text-xs" dir="auto">
                  <span className="font-mono tabular-nums text-muted-foreground" dir="ltr">{String(n.id ?? "")}</span>
                  {" — "}
                  <span dir="auto">{nodeSummary(n)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <>
            {/* المشغّل */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">المشغّل</p>
              <Input
                id="flow-keywords"
                label="كلمات التشغيل (اختياري)"
                placeholder="مثال: سعر، كم، توصيل"
                hint="مفصولة بفواصل — تُحفظ في تصميم التدفق؛ الربط التلقائي بها لم يُفعَّل بعد"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
              <div className="max-w-56">
                <Select
                  value={matchMode}
                  onChange={(e) => setMatchMode(e.target.value)}
                  aria-label="نمط مطابقة الكلمات"
                  disabled={keywords.trim() === ""}
                >
                  {MATCH_MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </Select>
              </div>
            </div>

            {/* سلسلة الرسائل */}
            <div className="space-y-2">
              <p className="text-sm font-semibold">رسائل التدفق</p>
              <p className="text-xs text-muted-foreground">
                تُرسل تباعًا عند التنفيذ. متغيرات متاحة: {"{name}"} {"{full_name}"} {"{text}"} {"{mention}"}
              </p>
              {/* phase6 r154 — سكة الدارة (توأم محرر الحملات): خصلة تيل
                  هادئة تصل عقد الرسائل؛ بلا عقدة لايم حية — التدفق لا
                  يعمل ذاتيًا (عقد الأمانة أعلاه). */}
              <div className="relative space-y-2">
                <span aria-hidden="true" className="absolute start-[9px] top-8 bottom-8 w-px bg-primary/20" />
                {messages.map((m, i) => (
                  <div key={m.key} className="relative rounded-xl border border-border/60 p-3 ps-6 space-y-2 bg-background/40">
                    <span aria-hidden="true" className="absolute start-[4px] top-[27px] size-2.5 rounded-full bg-primary/30 ring-2 ring-background" />
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor={`flow-msg-${i + 1}`} className="text-xs font-semibold">الرسالة {i + 1}</label>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-11 p-0"
                          onClick={() => moveMessage(i, -1)}
                          disabled={i === 0}
                          aria-label={`نقل الرسالة ${i + 1} للأعلى`}
                        >
                          <ChevronUp className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-11 p-0"
                          onClick={() => moveMessage(i, 1)}
                          disabled={i === messages.length - 1}
                          aria-label={`نقل الرسالة ${i + 1} للأسفل`}
                        >
                          <ChevronDown className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-11 p-0 hover:text-destructive-ink"
                          onClick={() => removeMessage(i)}
                          aria-label={`حذف الرسالة ${i + 1}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      id={`flow-msg-${i + 1}`}
                      value={m.text}
                      onChange={(e) => patchMessage(i, e.target.value)}
                      placeholder="نص الرسالة…"
                      rows={2}
                    />
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => setMessages((prev) => [...prev, messageDraft()])}>
                <Plus className="size-3.5" /> إضافة رسالة
              </Button>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            loading={saveMut.isPending}
            disabled={!valid || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending ? "جارٍ الحفظ…" : isCreate ? "إنشاء التدفق" : "حفظ التعديلات"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ── حوار «تشغيل اختبار» (POST /test — التنفيذ اليدوي الوحيد) ─────────── */

/** سطر واحد من أثر التنفيذ — أفعال المحرك تُعرض حرفيًا (أمانة #4). */
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

function TestFlowDialog({ row, onClosed }: { row: FlowRow; onClosed: () => void }) {
  const [fromName, setFromName] = useState("")
  const [text, setText] = useState("")
  const [result, setResult] = useState<TestResult | null>(null)

  const testMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/flows/${row.id}/test`, {
        method: "POST",
        body: JSON.stringify({
          from_name: fromName.trim() || undefined,
          text: text.trim(),
        }),
      }).then(unwrapApi<TestResult>),
    onSuccess: (d) => setResult(d),
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر تشغيل الاختبار"),
  })

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClosed() }}>
      <DialogContent>
        <DialogTitle>تشغيل اختبار: {row.name || `تدفق #${row.id}`}</DialogTitle>
        <DialogDescription>
          يُنفَّذ التدفق مرة واحدة الآن ويُعرض أثر التنفيذ كما أعاده المحرك.
        </DialogDescription>

        {/* لاحظة الأمانة — حيث تُعرض النتائج (بند المهمة): التنفيذ اليدوي. */}
        <p className="rounded-lg border border-border/60 bg-background/40 p-2.5 text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground">وضع الاختبار — التنفيذ اليدوي</span>
          : شغّلة واحدة عند الطلب، بلا جدولة أو تكرار أو مراقبة للتعليقات الواردة.
        </p>

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

/* ── الصفحة ────────────────────────────────────────────────────────────── */

export default function FlowsPage() {
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<null | { mode: "create" } | { mode: "edit"; id: number; row: FlowRow }>(null)
  const [testing, setTesting] = useState<FlowRow | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const { data: flows = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["flows"],
    queryFn: () => apiFetch("/api/flows").then(unwrapApi<FlowRow[]>),
    retry: 1,
  })

  /* POST /toggle (ST_CYCLE) — الحالة المرجعة من الخادم هي الحقيقة. */
  const toggleMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/flows/${id}/toggle`, { method: "POST" }).then(unwrapApi<{ status: string }>),
    onSuccess: (d) => {
      brandedToast.success(toggleToast(String(d?.status ?? "")))
      queryClient.invalidateQueries({ queryKey: ["flows"] })
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر تغيير حالة التدفق"),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/flows/${id}`, { method: "DELETE" }).then(unwrapApi<{ ok: boolean }>),
    onSuccess: () => {
      brandedToast.success("تم حذف التدفق وسجل تنفيذاته")
      setConfirmDeleteId(null)
      queryClient.invalidateQueries({ queryKey: ["flows"] })
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر حذف التدفق"),
  })

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader
        icon={<GitBranch className="size-4" />}
        title="التدفقات"
        subtitle="مسارات محادثة تُصمَّم وتُختبر يدويًا"
        compact
        /* phase6 r154 — أثر الدارة الساكن (توأم الأدوات): عقدة اللايم
           الحية تعني «أتمتة تعمل الآن» — والتدفقات لا تعمل ذاتيًا بعد
           (البند 1 في عقد الأمانة أعلاه)، فالأثر الساكن هو الصادق. */
        trace="static"
        actions={
          !editor && (
            <Button size="sm" onClick={() => setEditor({ mode: "create" })} className="gap-1.5">
              <Plus className="size-3.5" /> تدفق جديد
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {editor && (
            <FlowEditor
              flowId={editor.mode === "edit" ? editor.id : null}
              row={editor.mode === "edit" ? editor.row : undefined}
              onClosed={() => setEditor(null)}
            />
          )}

          {/* لاحظة الوضع — أمانة السطح: المحرك ساكن، والتسمية تقول ذلك. */}
          {!editor && (
            <Card>
              <CardContent className="p-4 flex items-start gap-3">
                <FlaskConical className="size-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">وضع الاختبار — التنفيذ اليدوي</span>
                  : صمّم التدفق وشغّله من زر «تشغيل اختبار». الربط التلقائي بالتعليقات والرسائل
                  الواردة غير مفعّل بعد، وحالة «مفعّل» تُحفَظ إعدادًا جاهزًا للتنفيذ القادم.
                </p>
              </CardContent>
            </Card>
          )}

          {isError ? (
            /* r131-F8 (A4 P2-8): the canonical .state family. */
            <div className="state state-danger py-16" role="alert">
              <div className="state-icon" aria-hidden="true">
                <AlertCircle />
              </div>
              <h2 className="state-title">تعذّر تحميل التدفقات</h2>
              <p className="state-desc">
                {(error as Error)?.message || "تعذّر الاتصال، تحقق من الإنترنت ثم أعد المحاولة"}
              </p>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                <RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة
              </Button>
            </div>
          ) : isLoading ? (
            /* r131-F8 (A4 P1-2): pulse → .skeleton slabs. */
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4"><div className="skeleton h-16 rounded" /></CardContent>
                </Card>
              ))}
            </div>
          ) : flows.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  robot="greeting"
                  size="sm"
                  title="لا توجد تدفقات"
                  description="أنشئ أول مسار محادثة — مشغّل ورسائل تُختبر يدويًا من هذه الصفحة."
                  action={{
                    label: "تدفق جديد",
                    icon: Plus,
                    onClick: () => setEditor({ mode: "create" }),
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {flows.map((f) => (
                <Card key={f.id}>
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold truncate" dir="auto">{f.name || `تدفق #${f.id}`}</p>
                          <Badge variant={STATUS_VARIANT[f.status] ?? "secondary"} className="shrink-0">
                            {STATUS_LABEL[f.status] ?? f.status}
                          </Badge>
                          {/* لا عقدة لايم حية هنا عمدًا: status لا يشغّل شيئًا
                              اليوم (البند 2 في عقد الأمانة) — عقدة الحياة
                              كانت ستقول «يعمل الآن» وهي لا تعمل. */}
                        </div>
                        {f.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1" dir="auto">{f.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {/* total_replies عدّاد تنفيذات المحرك (يزيد حتى على
                              الاختبار) — «تنفيذ» لا «رد» (البند 3). */}
                          <span className="font-mono tabular-nums">
                            {countPhrase(f.total_replies ?? 0, "تنفيذ", "تنفيذين", "تنفيذات")}
                          </span>{" "}
                          · آخر تحديث {formatDateOnly(f.updated_at) || "—"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 justify-end">
                        <Switch
                          checked={f.status === "active"}
                          onCheckedChange={() => toggleMut.mutate(f.id)}
                          disabled={toggleMut.isPending && toggleMut.variables === f.id}
                          aria-label={f.status === "active" ? `إيقاف التدفق ${f.name || f.id}` : `تفعيل التدفق ${f.name || f.id}`}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTesting(f)}
                          aria-label={`تشغيل اختبار التدفق ${f.name || f.id}`}
                        >
                          <FlaskConical className="size-3.5" aria-hidden="true" /> تشغيل اختبار
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditor({ mode: "edit", id: f.id, row: f })}
                          aria-label={`تحرير التدفق ${f.name || f.id}`}
                        >
                          <Pencil className="size-3.5" /> تحرير
                        </Button>
                        {confirmDeleteId === f.id ? (
                          <>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteMut.mutate(f.id)}
                              disabled={deleteMut.isPending && deleteMut.variables === f.id}
                              loading={deleteMut.isPending && deleteMut.variables === f.id}
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" /> تأكيد الحذف
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmDeleteId(null)}
                              aria-label="إلغاء حذف التدفق"
                            >
                              إلغاء
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="hover:text-destructive-ink"
                            onClick={() => setConfirmDeleteId(f.id)}
                            aria-label={`حذف التدفق ${f.name || f.id}`}
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

      {testing && <TestFlowDialog row={testing} onClosed={() => { setTesting(null) }} />}
    </div>
  )
}
