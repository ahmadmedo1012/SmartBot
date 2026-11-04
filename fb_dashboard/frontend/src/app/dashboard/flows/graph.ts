/**
 * P43-C-2 — منطق المخطط النقي لاستوديو الأتمتة (صفحة /dashboard/flows).
 *
 * الخلفية: المحرك صار منفّذًا حيًا (P43-SB1 — FlowRuntime يستهلكه رصيد
 * ميسنجر + نبضة الأتمتة)، فالمحرر يبني/يقرأ عقد وحواف المخطط المسطّح
 * الذي ينفّذه الخادم حرفيًا:
 *   node {id, type: TRIGGER|MESSAGE|CONDITION|ACTION|DELAY|GOAL|SEQUENCE, data}
 *   TRIGGER   data {triggerType: "keyword", keywords[], matchMode} (بلا كلمات → manual)
 *   MESSAGE   data {text, wait?} — {{first_name}}/{{name}}… متغيرات القوالب
 *   CONDITION data {left: "var:field"|"tag:Name"|"text"|"intent", op, right}
 *             وحافتاه تحملان sourceHandle "yes"/"no"
 *   ACTION    data {actionType: add_tag|remove_tag|set_field, tag?|key?+value?}
 *   DELAY     data {minutes} (يستأنف على نبضة الأتمتة)
 *   GOAL      data {} — نهاية المسار
 *
 * تمثيل المحرر: شجرة خطوات رأسية — سلسلة Step[] لكل مستوى، والشرط
 * (CONDITION) يحمل فرعين yes/no كسلسلتين مستقلتين (عمودان مُزاحان تحت
 * بطاقة الشرط). القاعدة البنيوية: السلسلة تنتهي عند الشرط — كل ما بعده
 * يقع داخل أحد الفرعين (نفس دلالة ManyChat: المسار يتفرّع ولا يعود
 * يلتئم).
 *
 * عقد/حواف لا يستطيع المحرر تمثيلها (مخططات API يدوية غريبة): تُقرأ
 * وتُعرض غير مرتبطة مع تحذير صريح — الحفظ يعيد بناء nodes/edges من
 * البطاقات المرئية فقط (PUT يستبدل المخطط كما أُرسل — عقد الأمانة نفسها
 * التي التزم بها محرر v0، لكن نطاق الحراسة تقلّص من «كل مخطط متقدم» إلى
 * «غير التمثيلي فقط»).
 */

/* ── أنواع الشجرة ──────────────────────────────────────────────────────── */

export type StepKind = "MESSAGE" | "CONDITION" | "DELAY" | "ACTION" | "GOAL" | "SEQUENCE"

export interface MessageStep {
  id: string
  kind: "MESSAGE"
  text: string
  /** wait=true: يوقف البوت المسار بعد الإرسال بانتظار رد المشترك (المحرك يقرأ data.wait). */
  wait: boolean
  /** buttons من مخطط قائم — يُحفظ كما هو (المحرك يسجّله ولا ينفّذه). */
  buttons?: unknown[]
}

export interface ConditionStep {
  id: string
  kind: "CONDITION"
  left: string
  op: string
  right: string
  yes: Step[]
  no: Step[]
}

export interface DelayStep {
  id: string
  kind: "DELAY"
  minutes: number
}

export interface ActionStep {
  id: string
  kind: "ACTION"
  actionType: string
  /** add_tag/remove_tag: اسم الوسم. */
  tag: string
  /** set_field: مفتاح حقل custom_data + قيمته. */
  fieldKey: string
  fieldValue: string
  /** إجراء متقدم (webhook/dm/add_to_sequence…): data الأصلية تُعاد حرفيًا. */
  raw?: Record<string, unknown>
}

export interface GoalStep {
  id: string
  kind: "GOAL"
}

export interface SequenceStep {
  id: string
  kind: "SEQUENCE"
  /** data الأصلية (sequenceId…) تُعاد حرفيًا — بطاقة للقراءة والحذف/النقل. */
  raw: Record<string, unknown>
}

export type Step = MessageStep | ConditionStep | DelayStep | ActionStep | GoalStep | SequenceStep

export interface FlowDraft {
  name: string
  description: string
  /** معرّف عقدة التشغيل في المخطط القائم (المُنشأة حديثًا: "trigger"). */
  triggerId: string
  keywords: string[]
  matchMode: string
  steps: Step[]
}

/* ── عقد/حواف JSON كما تنفّذها الخدمة ─────────────────────────────────── */

export interface FlowNodeJson {
  id: string
  type: string
  data: Record<string, unknown>
}

export interface FlowEdgeJson {
  source: string
  target: string
  sourceHandle?: string
}

export interface ParsedGraph {
  triggerId: string
  keywords: string[]
  matchMode: string
  steps: Step[]
  /** عقد خارج بنية المحرر — تُعرض للقراءة وتُحذف عند الحفظ. */
  orphanNodes: FlowNodeJson[]
  warnings: string[]
}

/* ── ثوابت العرض (تُستهلك في البطاقات والاختبارات) ────────────────────── */

export const MATCH_MODES = [
  { value: "any", label: "أي كلمة" },
  { value: "all", label: "كل الكلمات" },
  { value: "exact", label: "مطابقة تامة" },
] as const

/** العمليات الأربع المسطّحة (P43) + ألقاب التراث التي يحتفظ بها المحرك. */
export const CONDITION_OPS = [
  { value: "eq", label: "يساوي" },
  { value: "ne", label: "لا يساوي" },
  { value: "contains", label: "يحتوي" },
  { value: "exists", label: "مُعرَّف (غير فارغ)" },
] as const

export const ACTION_OPTIONS = [
  { value: "add_tag", label: "إضافة وسم" },
  { value: "remove_tag", label: "إزالة وسم" },
  { value: "set_field", label: "ضبط حقل" },
] as const

export const KIND_LABEL: Record<StepKind, string> = {
  MESSAGE: "رسالة",
  CONDITION: "شرط",
  DELAY: "تأخير",
  ACTION: "إجراء",
  GOAL: "هدف",
  SEQUENCE: "تسلسل فرعي",
}

const ID_PREFIX: Record<StepKind, string> = {
  MESSAGE: "msg-",
  CONDITION: "cond-",
  DELAY: "delay-",
  ACTION: "act-",
  GOAL: "goal-",
  SEQUENCE: "seq-",
}

const OP_ALIASES: Record<string, string> = {
  equals: "eq",
  "==": "eq",
  not_equals: "ne",
  "!=": "ne",
  not_empty: "exists",
}

/** يساوي/ne/… بألقابها التراثية (يحتفظ بها المحرك) للعرض. */
export const OP_LABEL: Record<string, string> = {
  eq: "يساوي",
  ne: "لا يساوي",
  contains: "يحتوي",
  exists: "مُعرَّف",
  equals: "يساوي",
  not_equals: "لا يساوي",
  not_empty: "مُعرَّف",
  matches: "يطابق",
  gt: "أكبر من",
  lt: "أصغر من",
}

/* ── أدوات صغيرة ───────────────────────────────────────────────────────── */

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v)
}

function normalizeOp(op: string): string {
  const o = op.trim().toLowerCase()
  return OP_ALIASES[o] ?? o
}

/** عقدة جديدة بمعرّف فريد داخل المجموعة (يضيف المعرّف إلى used). */
export function newStep(kind: StepKind, used: Set<string>): Step {
  const prefix = ID_PREFIX[kind]
  let i = 1
  while (used.has(`${prefix}${i}`)) i += 1
  const id = `${prefix}${i}`
  used.add(id)
  switch (kind) {
    case "MESSAGE":
      return { id, kind, text: "", wait: false }
    case "CONDITION":
      return { id, kind, left: "", op: "eq", right: "", yes: [], no: [] }
    case "DELAY":
      return { id, kind, minutes: 30 }
    case "ACTION":
      return { id, kind, actionType: "add_tag", tag: "", fieldKey: "", fieldValue: "" }
    case "GOAL":
      return { id, kind }
    case "SEQUENCE":
      return { id, kind, raw: {} }
  }
}

/** عدد الخطوات كله (الشجرة بفروعها) — لعرض «N خطوة». */
export function countSteps(steps: Step[]): number {
  let n = 0
  for (const s of steps) {
    n += 1
    if (s.kind === "CONDITION") n += countSteps(s.yes) + countSteps(s.no)
  }
  return n
}

/* ── البناء: شجرة المحرر → nodes/edges (ما ينفّذه الخادم حرفيًا) ──────── */

export interface BuiltGraph {
  nodes: FlowNodeJson[]
  edges: FlowEdgeJson[]
}

export function buildGraph(draft: FlowDraft): BuiltGraph {
  const nodes: FlowNodeJson[] = []
  const edges: FlowEdgeJson[] = []
  const triggerId = draft.triggerId || "trigger"
  const triggerData: Record<string, unknown> =
    draft.keywords.length > 0
      ? { triggerType: "keyword", keywords: draft.keywords, matchMode: draft.matchMode }
      : { triggerType: "manual" }
  nodes.push({ id: triggerId, type: "TRIGGER", data: triggerData })
  emitChain(draft.steps, triggerId, undefined, nodes, edges)
  return { nodes, edges }
}

/**
 * يبثّ سلسلة: حافة entry→الأولى (بمقبض firstHandle لفرع الشرط) ثم
 * سلسلة الحواف بين بطاقات السلسلة. الشرط داخل سلسلة يبثّ حافتي نعم/لا
 * نحو أول بطاقة كل فرع (الفرع الفارغ لا حافة له: نهاية مسار ضمنية
 * يكملها المحرك).
 */
function emitChain(
  chain: Step[],
  entryId: string,
  firstHandle: string | undefined,
  nodes: FlowNodeJson[],
  edges: FlowEdgeJson[],
): void {
  let prev = entryId
  let handle = firstHandle
  for (const step of chain) {
    const edge: FlowEdgeJson = { source: prev, target: step.id }
    if (handle) edge.sourceHandle = handle
    edges.push(edge)
    handle = undefined
    emitNode(step, nodes, edges)
    prev = step.id
  }
}

function emitNode(step: Step, nodes: FlowNodeJson[], edges: FlowEdgeJson[]): void {
  switch (step.kind) {
    case "MESSAGE": {
      const data: Record<string, unknown> = { text: step.text }
      if (step.wait) data.wait = true
      if (Array.isArray(step.buttons)) data.buttons = step.buttons
      nodes.push({ id: step.id, type: "MESSAGE", data })
      break
    }
    case "CONDITION": {
      nodes.push({
        id: step.id,
        type: "CONDITION",
        data: { left: step.left, op: step.op, right: step.right },
      })
      if (step.yes.length > 0) emitChain(step.yes, step.id, "yes", nodes, edges)
      if (step.no.length > 0) emitChain(step.no, step.id, "no", nodes, edges)
      break
    }
    case "DELAY": {
      nodes.push({
        id: step.id,
        type: "DELAY",
        data: { minutes: Math.max(0, Math.trunc(step.minutes) || 0) },
      })
      break
    }
    case "ACTION": {
      if (step.raw) {
        nodes.push({ id: step.id, type: "ACTION", data: step.raw })
        break
      }
      if (step.actionType === "set_field") {
        nodes.push({
          id: step.id,
          type: "ACTION",
          data: { actionType: "set_field", key: step.fieldKey, value: step.fieldValue },
        })
      } else {
        nodes.push({ id: step.id, type: "ACTION", data: { actionType: step.actionType, tag: step.tag } })
      }
      break
    }
    case "GOAL": {
      nodes.push({ id: step.id, type: "GOAL", data: {} })
      break
    }
    case "SEQUENCE": {
      nodes.push({ id: step.id, type: "SEQUENCE", data: step.raw })
      break
    }
  }
}

/* ── القراءة: nodes/edges → شجرة المحرر (مع تراث المخططات القديمة) ────── */

export function parseGraph(nodes: unknown, edges: unknown): ParsedGraph {
  const warnings: string[] = []
  const nodeList: FlowNodeJson[] = []
  if (Array.isArray(nodes)) {
    for (const n of nodes) {
      if (n && typeof n === "object" && typeof (n as FlowNodeJson).id === "string") {
        const node = n as FlowNodeJson
        nodeList.push({ id: node.id, type: str(node.type), data: (node.data ?? {}) as Record<string, unknown> })
      }
    }
  }
  const edgeList: FlowEdgeJson[] = []
  if (Array.isArray(edges)) {
    for (const e of edges) {
      if (e && typeof e === "object" && typeof (e as FlowEdgeJson).source === "string") {
        const edge = e as FlowEdgeJson
        edgeList.push({
          source: edge.source,
          target: str(edge.target),
          sourceHandle: typeof edge.sourceHandle === "string" ? edge.sourceHandle : undefined,
        })
      }
    }
  }

  const byId = new Map(nodeList.map((n) => [n.id, n]))
  const outgoing = new Map<string, FlowEdgeJson[]>()
  for (const e of edgeList) {
    const list = outgoing.get(e.source) ?? []
    list.push(e)
    outgoing.set(e.source, list)
  }
  const consumed = new Set<FlowEdgeJson>()
  const visited = new Set<string>()

  const firstOutgoing = (id: string): FlowEdgeJson | undefined => {
    for (const e of outgoing.get(id) ?? []) {
      if (e.target && byId.has(e.target) && !consumed.has(e)) return e
    }
    return undefined
  }

  /** يعيد شرطًا بصيغة left/op/right + يحدد هدفي نعم/لا (لا/الحافة الأولى العادية كبديل نعم — نفس احتياط المحرك). */
  const conditionTargets = (id: string): { yes?: string; no?: string } => {
    let yesEdge: FlowEdgeJson | undefined
    let noEdge: FlowEdgeJson | undefined
    let plainEdge: FlowEdgeJson | undefined
    for (const e of outgoing.get(id) ?? []) {
      if (consumed.has(e) || !e.target || !byId.has(e.target)) continue
      const h = (e.sourceHandle ?? "").toLowerCase()
      if (h.includes("yes") || h.includes("true")) {
        yesEdge = yesEdge ?? e
      } else if (h.includes("no") || h.includes("false")) {
        noEdge = noEdge ?? e
      } else if (!h) {
        plainEdge = plainEdge ?? e
      }
      /* مقابض غريبة (ليس نعم/لا/عادية) تُترك غير مستهلكة → تحذير */
    }
    const effYes = yesEdge ?? plainEdge
    const result: { yes?: string; no?: string } = {}
    if (effYes) {
      consumed.add(effYes)
      result.yes = effYes.target
    }
    if (noEdge) {
      consumed.add(noEdge)
      result.no = noEdge.target
    }
    return result
  }

  const stepFromNode = (node: FlowNodeJson): Step | null => {
    const t = node.type.toUpperCase()
    const d = node.data ?? {}
    switch (t) {
      case "MESSAGE":
        return {
          id: node.id,
          kind: "MESSAGE",
          text: str(d.text),
          wait: d.wait === true,
          buttons: Array.isArray(d.buttons) ? d.buttons : undefined,
        }
      case "DELAY":
        return { id: node.id, kind: "DELAY", minutes: delayMinutes(d) }
      case "ACTION":
        return actionStepFrom(node.id, d)
      case "GOAL":
        return { id: node.id, kind: "GOAL" }
      case "SEQUENCE":
        return { id: node.id, kind: "SEQUENCE", raw: d }
      case "CONDITION": {
        let left = str(d.left ?? d.var ?? "").trim()
        let op = normalizeOp(str(d.op ?? d.operator ?? "eq"))
        let right = d.right != null ? d.right : d.value
        if (!left) {
          /* مخطط التراث field/operator/value — الخادم يفهمه؛ نحوّله للمسطّح */
          const field = str(d.field ?? "").trim()
          if (field === "intent" || field === "text") {
            left = field
          } else if (field === "tag_has") {
            left = `tag:${str(d.value ?? "")}`
            op = "exists"
            right = ""
          } else if (field === "custom") {
            left = `var:${str(d.customKey ?? "")}`
          } else if (field) {
            left = `var:${field}`
          }
        }
        return {
          id: node.id,
          kind: "CONDITION",
          left,
          op,
          right: str(right ?? ""),
          yes: [],
          no: [],
        }
      }
      default:
        return null
    }
  }

  /** يمشي سلسلة من startId حتى شرط (ينكسر عنده — القاعدة البنيوية) أو نهاية/دورة. */
  const parseChain = (startId: string): Step[] => {
    const steps: Step[] = []
    let cur = startId
    while (cur && !visited.has(cur)) {
      const node = byId.get(cur)
      if (!node) break
      if (node.type.toUpperCase() === "TRIGGER") break /* مشغّل داخل المسار = بوابة انتظار لا يمثّلها المحرر */
      visited.add(cur)
      if (node.type.toUpperCase() === "CONDITION") {
        const step = stepFromNode(node) as ConditionStep
        const targets = conditionTargets(cur)
        if (targets.yes) step.yes = parseChain(targets.yes)
        if (targets.no) step.no = parseChain(targets.no)
        steps.push(step)
        break
      }
      const step = stepFromNode(node)
      if (!step) break
      steps.push(step)
      const next = firstOutgoing(cur)
      if (next) {
        consumed.add(next)
        if (visited.has(next.target)) {
          warnings.push(`حافة تعود إلى عقدة سابقة (${cur} ← ${next.target}) — دورة يكسرها المحرر عند الحفظ`)
        }
        cur = next.target
      } else {
        break
      }
    }
    return steps
  }

  /* عقدة التشغيل (الأولى) + بياناتها */
  const trigger = nodeList.find((n) => n.type.toUpperCase() === "TRIGGER")
  const triggerId = trigger ? trigger.id : "trigger"
  const tData = (trigger?.data ?? {}) as Record<string, unknown>
  const triggerType = str(tData.triggerType ?? "manual")
  const keywords =
    triggerType === "keyword" && Array.isArray(tData.keywords)
      ? tData.keywords.map(str).map((k) => k.trim()).filter((k) => k !== "")
      : []
  const matchMode = keywords.length > 0 ? str(tData.matchMode ?? "any") || "any" : "any"
  if (!trigger) warnings.push("لا توجد عقدة تشغيل (TRIGGER) — سينشئ المحرر واحدة عند أول حفظ")

  const entry = firstOutgoing(triggerId)
  const steps: Step[] = entry ? (consumed.add(entry), parseChain(entry.target)) : []

  /* الكنس: عقد غير مزارة (مشغّلات زائدة/بوابات انتظار/جذور API متعددة) + حواف زائدة */
  const orphanNodes = nodeList.filter((n) => !visited.has(n.id) && n.id !== triggerId)
  const triggersExtra = orphanNodes.filter((n) => n.type.toUpperCase() === "TRIGGER")
  if (triggersExtra.length > 0) {
    warnings.push(
      `يوجد ${triggersExtra.length > 1 ? "عدة" : ""} عقدة تشغيل إضافية (${triggersExtra
        .map((n) => n.id)
        .join("، ")}) — النشر يتطلب مشغّلًا واحدًا بالضبط، والزائدة تُعرض غير مرتبطة وتُحذف عند أول حفظ`,
    )
  }
  const otherOrphans = orphanNodes.filter((n) => n.type.toUpperCase() !== "TRIGGER")
  if (otherOrphans.length > 0) {
    warnings.push(
      `${otherOrphans.length} عقدة خارج بنية المحرر الرأسي (${otherOrphans.map((n) => n.id).join("، ")}) — لا يصلها المسار من المشغّل؛ تُعرض للقراءة وتُحذف عند أول حفظ`,
    )
  }
  const droppedEdges = edgeList.filter((e) => !consumed.has(e))
  if (droppedEdges.length > 0) {
    warnings.push(`${droppedEdges.length} حافة زائدة لا يمثّلها المحرر — ستُحذف عند أول حفظ`)
  }

  return { triggerId, keywords, matchMode, steps, orphanNodes, warnings }
}

function delayMinutes(data: Record<string, unknown>): number {
  if (data.minutes != null) {
    const m = Number(data.minutes)
    return Number.isFinite(m) ? Math.max(0, Math.round(m)) : 0
  }
  const amount = Number(data.amount ?? 0) || 0
  const unit = str(data.unit ?? "seconds").toLowerCase()
  const factor = unit === "hours" ? 60 : unit === "days" ? 1440 : unit === "minutes" ? 1 : 1 / 60
  return Math.max(0, Math.round(amount * factor))
}

function actionStepFrom(id: string, data: Record<string, unknown>): ActionStep {
  const rawType = str(data.actionType ?? data.action ?? "")
  if (rawType === "tag_add" || rawType === "add_tag") {
    return { id, kind: "ACTION", actionType: "add_tag", tag: str(data.tag ?? data.value ?? ""), fieldKey: "", fieldValue: "" }
  }
  if (rawType === "tag_remove" || rawType === "remove_tag") {
    return { id, kind: "ACTION", actionType: "remove_tag", tag: str(data.tag ?? data.value ?? ""), fieldKey: "", fieldValue: "" }
  }
  if (rawType === "set_field") {
    return {
      id,
      kind: "ACTION",
      actionType: "set_field",
      tag: "",
      fieldKey: str(data.key ?? data.field ?? ""),
      fieldValue: str(data.value ?? ""),
    }
  }
  /* webhook/dm/add_to_sequence… — بياناتها الأصلية تُعاد حرفيًا عند البناء */
  return { id, kind: "ACTION", actionType: rawType, tag: "", fieldKey: "", fieldValue: "", raw: data }
}

/* ── عمليات السلسلة (كلها نقية/غير مُطفِّرة) ──────────────────────────── */

/**
 * إدراج خطوة: الشرط يبتلع ذيل السلسلة إلى فرع «نعم» (المسار يستمر
 * داخل العمود) — أي خطوة أخرى تُدرج موضعيًا.
 */
export function insertStep(chain: Step[], index: number, step: Step): Step[] {
  const i = Math.max(0, Math.min(index, chain.length))
  if (step.kind === "CONDITION") {
    return [...chain.slice(0, i), { ...step, yes: chain.slice(i) }]
  }
  return [...chain.slice(0, i), step, ...chain.slice(i)]
}

/** حذف خطوة: حذف شرط يصبّ فرعيه (نعم ثم لا) مكانه — لا فقدان بيانات. */
export function removeStep(chain: Step[], index: number): Step[] {
  const s = chain[index]
  if (!s) return chain
  if (s.kind === "CONDITION") {
    return [...chain.slice(0, index), ...s.yes, ...s.no, ...chain.slice(index + 1)]
  }
  return chain.filter((_, i) => i !== index)
}

/** نقل خطوة أعلى/أسفل داخل سلسلتها (فروعها تسافر معها). */
export function moveStep(chain: Step[], index: number, dir: -1 | 1): Step[] {
  const j = index + dir
  if (j < 0 || j >= chain.length) return chain
  const next = [...chain]
  const tmp = next[index]
  next[index] = next[j]
  next[j] = tmp
  return next
}

/** استبدال خطوة عند موضعها (تحرير الحقول). */
export function patchStep(chain: Step[], index: number, patch: Partial<Step>): Step[] {
  const s = chain[index]
  if (!s) return chain
  return chain.map((step, i) => (i === index ? ({ ...step, ...patch } as Step) : step))
}

/* ── ملخّصات العرض ─────────────────────────────────────────────────────── */

/** وصف جهة الشرط: var:city → «حقل city»، tag:VIP → «وسم VIP»… */
export function describeLeft(left: string): string {
  const l = left.trim()
  if (l === "") return "غير مضبوط"
  if (l.startsWith("var:")) return `حقل ${l.slice(4)}`
  if (l.startsWith("tag:")) return `وسم ${l.slice(4)}`
  if (l === "text") return "نص الرسالة"
  if (l === "intent") return "نية الرسالة"
  return l
}

export function opLabel(op: string): string {
  return OP_LABEL[op.trim().toLowerCase()] ?? op
}

function truncate(text: string, max: number): string {
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** سطر الملخّص لبطاقة منهارة. */
export function stepSummary(step: Step): string {
  switch (step.kind) {
    case "MESSAGE":
      return step.text.trim() === "" ? "رسالة فارغة — لن تُرسَل" : `«${truncate(step.text, 64)}»${step.wait ? " (بانتظار الرد)" : ""}`
    case "CONDITION": {
      const head = `${describeLeft(step.left)} ${opLabel(step.op)}`
      if (step.op === "exists") return head
      return `${head} «${truncate(step.right, 24)}»`
    }
    case "DELAY":
      return `انتظار ${delayPhrase(step.minutes)} قبل الخطوة التالية`
    case "ACTION":
      if (step.raw) return `إجراء متقدم: ${step.actionType || "—"}`
      if (step.actionType === "add_tag") return step.tag ? `إضافة وسم «${truncate(step.tag, 24)}»` : "إضافة وسم (بدون اسم)"
      if (step.actionType === "remove_tag") return step.tag ? `إزالة وسم «${truncate(step.tag, 24)}»` : "إزالة وسم (بدون اسم)"
      if (step.actionType === "set_field")
        return step.fieldKey ? `ضبط ${truncate(step.fieldKey, 20)} = «${truncate(step.fieldValue, 20)}»` : "ضبط حقل (بدون مفتاح)"
      return `إجراء: ${step.actionType}`
    case "GOAL":
      return "نهاية المسار — تكتمل التنفيذات هنا"
    case "SEQUENCE": {
      const sid = str(step.raw.sequenceId ?? step.raw.sequence_id ?? step.raw.subFlowId ?? step.raw.sub_flow_id ?? "")
      return sid ? `تسجيل في التسلسل #${sid}` : "تسلسل فرعي (بلا معرّف)"
    }
  }
}

/** صياغة دقائق عربية صحيحة (واحدة/دقيقتين/N دقائق). */
export function delayPhrase(minutes: number): string {
  const m = Math.max(0, Math.trunc(minutes) || 0)
  if (m === 1) return "دقيقة واحدة"
  if (m === 2) return "دقيقتين"
  if (m >= 3 && m <= 10) return `${m} دقائق`
  if (m === 0) return "أقل من دقيقة"
  return `${m} دقيقة`
}
