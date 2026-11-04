/**
 * P43-C-2 — عقود منطق المخطط النقي لاستوديو الأتمتة (flows/graph.ts).
 *
 * Pins:
 *   - buildGraph: المخطط المسطّح الذي ينفّذه الخادم حرفيًا (TRIGGER
 *     {triggerType,keywords,matchMode} / بلا كلمات → manual؛ سلسلة
 *     MESSAGE؛ CONDITION يبثّ حافتي yes/no مع sourceHandle — الفرع الفارغ
 *     بلا حافة (نهاية ضمنية)؛ DELAY {minutes}؛ ACTION add_tag/remove_tag
 *     {actionType,tag} و set_field {actionType,key,value}؛ GOAL {})
 *   - parseGraph: قراءة نفس المخطط + مخططات التراث (field/operator/value
 *     و amount/unit و الألقاب equals/not_empty) → الصيغة المسطّحة؛ كسر
 *     الدورات؛ العقد/الحواف غير التمثيلية تُحصى في warnings/orphanNodes
 *   - الاستدارة (build→parse→build) مطابقة للبنية المدعومة
 *   - عمليات السلسلة: إدراج شرط يبتلع الذيل إلى فرع نعم؛ حذف شرط يصبّ
 *     الفرعين مكانه (لا فقدان)؛ النقل داخل السلسلة
 *   - ملخّصات العرض: stepSummary/delayPhrase/describeLeft بالعربية
 */
import { describe, expect, it } from "vitest"

import {
  buildGraph,
  countSteps,
  delayPhrase,
  describeLeft,
  insertStep,
  moveStep,
  newStep,
  opLabel,
  parseGraph,
  patchStep,
  removeStep,
  stepSummary,
  type FlowDraft,
  type Step,
} from "./graph"

const used = () => new Set<string>(["trigger"])

function draft(partial: Partial<FlowDraft> = {}): FlowDraft {
  return {
    name: "تدفق الاختبار",
    description: "",
    triggerId: "trigger",
    keywords: ["سعر"],
    matchMode: "any",
    steps: [],
    ...partial,
  }
}

function msg(id: string, text: string): Step {
  return { id, kind: "MESSAGE", text, wait: false }
}

describe("buildGraph — the flat schema the runtime executes verbatim", () => {
  it("emits TRIGGER{triggerType,keywords,matchMode} + a chained MESSAGE", () => {
    const g = buildGraph(draft({ steps: [msg("msg-1", "أهلاً")] }))
    expect(g).toEqual({
      nodes: [
        { id: "trigger", type: "TRIGGER", data: { triggerType: "keyword", keywords: ["سعر"], matchMode: "any" } },
        { id: "msg-1", type: "MESSAGE", data: { text: "أهلاً" } },
      ],
      edges: [{ source: "trigger", target: "msg-1" }],
    })
  })

  it("no keywords → the honest manual trigger (never auto-starts)", () => {
    const g = buildGraph(draft({ keywords: [], steps: [] }))
    expect(g.nodes).toEqual([{ id: "trigger", type: "TRIGGER", data: { triggerType: "manual" } }])
    expect(g.edges).toEqual([])
  })

  it("a CONDITION emits BOTH sourceHandle edges; an empty branch emits none (implicit dead end)", () => {
    const g = buildGraph({
      ...draft(),
      steps: [
        {
          id: "cond-1",
          kind: "CONDITION",
          left: "var:vip",
          op: "eq",
          right: "1",
          yes: [msg("msg-1", "أهلاً VIP")],
          no: [],
        },
      ],
    })
    expect(g.nodes).toEqual([
      { id: "trigger", type: "TRIGGER", data: { triggerType: "keyword", keywords: ["سعر"], matchMode: "any" } },
      { id: "cond-1", type: "CONDITION", data: { left: "var:vip", op: "eq", right: "1" } },
      { id: "msg-1", type: "MESSAGE", data: { text: "أهلاً VIP" } },
    ])
    expect(g.edges).toEqual([
      { source: "trigger", target: "cond-1" },
      { source: "cond-1", target: "msg-1", sourceHandle: "yes" },
    ])
  })

  it("DELAY carries minutes; negative clamps to 0", () => {
    const g = buildGraph(draft({ steps: [{ id: "d-1", kind: "DELAY", minutes: -5 }] }))
    expect(g.nodes[1]).toEqual({ id: "d-1", type: "DELAY", data: { minutes: 0 } })
  })

  it("ACTION add_tag/remove_tag → {actionType, tag}; set_field → {actionType, key, value}", () => {
    const g = buildGraph({
      ...draft(),
      steps: [
        { id: "a-1", kind: "ACTION", actionType: "add_tag", tag: "VIP", fieldKey: "", fieldValue: "" },
        { id: "a-2", kind: "ACTION", actionType: "set_field", tag: "", fieldKey: "city", fieldValue: "طرابلس" },
      ],
    })
    expect(g.nodes.slice(1)).toEqual([
      { id: "a-1", type: "ACTION", data: { actionType: "add_tag", tag: "VIP" } },
      { id: "a-2", type: "ACTION", data: { actionType: "set_field", key: "city", value: "طرابلس" } },
    ])
  })

  it("MESSAGE wait=true rides data.wait (the reply-park flag); GOAL is an empty terminal", () => {
    const g = buildGraph({
      ...draft(),
      steps: [
        { id: "msg-1", kind: "MESSAGE", text: "مرحبا", wait: true },
        { id: "g-1", kind: "GOAL" },
      ],
    })
    expect(g.nodes[1]).toEqual({ id: "msg-1", type: "MESSAGE", data: { text: "مرحبا", wait: true } })
    expect(g.nodes[2]).toEqual({ id: "g-1", type: "GOAL", data: {} })
  })

  it("preserves a legacy action verbatim via raw (webhook) and a SEQUENCE node's data", () => {
    const g = buildGraph({
      ...draft(),
      steps: [
        { id: "a-1", kind: "ACTION", actionType: "webhook", tag: "", fieldKey: "", fieldValue: "", raw: { actionType: "webhook", url: "https://x" } },
        { id: "sq-1", kind: "SEQUENCE", raw: { sequenceId: 3 } },
      ],
    })
    expect(g.nodes[1]).toEqual({ id: "a-1", type: "ACTION", data: { actionType: "webhook", url: "https://x" } })
    expect(g.nodes[2]).toEqual({ id: "sq-1", type: "SEQUENCE", data: { sequenceId: 3 } })
  })
})

describe("parseGraph — reads the flat schema + legacy shapes into the editor tree", () => {
  it("round-trips a nested build (build → parse → build) for supported structures", () => {
    const d = draft({
      steps: [
        msg("msg-1", "أهلاً {{first_name}}"),
        {
          id: "cond-1",
          kind: "CONDITION",
          left: "tag:VIP",
          op: "contains",
          right: "",
          yes: [{ id: "msg-2", kind: "MESSAGE", text: "خاص", wait: false }],
          no: [{ id: "delay-1", kind: "DELAY", minutes: 30 }],
        },
      ],
    })
    const once = buildGraph(d)
    const parsed = parseGraph(once.nodes, once.edges)
    expect(parsed.steps).toEqual(d.steps)
    expect(parsed.warnings).toEqual([])
    expect(buildGraph({ ...d, steps: parsed.steps })).toEqual(once)
  })

  it("maps the legacy CONDITION {field,operator,value} to the flat left/op/right", () => {
    const parsed = parseGraph(
      [
        { id: "trigger", type: "TRIGGER", data: { triggerType: "keyword", keywords: ["سعر"], matchMode: "any" } },
        { id: "c-1", type: "CONDITION", data: { field: "text", operator: "equals", value: "سعر" } },
      ],
      [{ source: "trigger", target: "c-1" }],
    )
    expect(parsed.steps).toEqual([
      { id: "c-1", kind: "CONDITION", left: "text", op: "eq", right: "سعر", yes: [], no: [] },
    ])
  })

  it("legacy tag_has/intent/custom + alias operators normalize (not_empty→exists)", () => {
    const parsed = parseGraph(
      [
        { id: "trigger", type: "TRIGGER", data: {} },
        { id: "c-1", type: "CONDITION", data: { field: "tag_has", value: "VIP", operator: "not_empty" } },
        { id: "c-2", type: "CONDITION", data: { field: "custom", customKey: "city", operator: "contains", value: "طر" } },
      ],
      [
        { source: "trigger", target: "c-1" },
        { source: "c-1", target: "c-2", sourceHandle: "yes" },
      ],
    )
    /* c-2 داخل فرع «نعم» لc-1 (السلسلة تنكسر عند الشرط) */
    const root = parsed.steps[0] as { kind: string; left: string; op: string; yes: { kind: string; left: string; op: string }[] }
    expect([root.left, root.op]).toEqual(["tag:VIP", "exists"])
    expect([root.yes[0].left, root.yes[0].op]).toEqual(["var:city", "contains"])
  })

  it("legacy DELAY {amount,unit} converts to minutes (hours/days/seconds)", () => {
    const parsed = parseGraph(
      [
        { id: "trigger", type: "TRIGGER", data: {} },
        { id: "d-1", type: "DELAY", data: { amount: 2, unit: "hours" } },
        { id: "d-2", type: "DELAY", data: { amount: 1, unit: "days" } },
        { id: "d-3", type: "DELAY", data: { minutes: 45 } },
      ],
      [
        { source: "trigger", target: "d-1" },
        { source: "d-1", target: "d-2" },
        { source: "d-2", target: "d-3" },
      ],
    )
    expect(parsed.steps.map((s) => (s.kind === "DELAY" ? s.minutes : null))).toEqual([120, 1440, 45])
  })

  it("legacy ACTION {actionType,value} + the flat tag key both map; unknown actions keep raw", () => {
    const parsed = parseGraph(
      [
        { id: "trigger", type: "TRIGGER", data: {} },
        { id: "a-1", type: "ACTION", data: { actionType: "add_tag", value: "مهتم" } },
        { id: "a-2", type: "ACTION", data: { actionType: "remove_tag", tag: "متردد" } },
        { id: "a-3", type: "ACTION", data: { actionType: "set_field", key: "city", value: "بنغازي" } },
        { id: "a-4", type: "ACTION", data: { actionType: "webhook", url: "https://x" } },
      ],
      [
        { source: "trigger", target: "a-1" },
        { source: "a-1", target: "a-2" },
        { source: "a-2", target: "a-3" },
        { source: "a-3", target: "a-4" },
      ],
    )
    expect(parsed.steps).toEqual([
      { id: "a-1", kind: "ACTION", actionType: "add_tag", tag: "مهتم", fieldKey: "", fieldValue: "" },
      { id: "a-2", kind: "ACTION", actionType: "remove_tag", tag: "متردد", fieldKey: "", fieldValue: "" },
      { id: "a-3", kind: "ACTION", actionType: "set_field", tag: "", fieldKey: "city", fieldValue: "بنغازي" },
      { id: "a-4", kind: "ACTION", actionType: "webhook", tag: "", fieldKey: "", fieldValue: "", raw: { actionType: "webhook", url: "https://x" } },
    ])
  })

  it("breaks cycles (the walk never loops) and warns about the broken back-edge", () => {
    const parsed = parseGraph(
      [
        { id: "trigger", type: "TRIGGER", data: {} },
        { id: "msg-1", type: "MESSAGE", data: { text: "أ" } },
        { id: "msg-2", type: "MESSAGE", data: { text: "ب" } },
      ],
      [
        { source: "trigger", target: "msg-1" },
        { source: "msg-1", target: "msg-2" },
        { source: "msg-2", target: "msg-1" },
      ],
    )
    expect(parsed.steps.map((s) => s.id)).toEqual(["msg-1", "msg-2"])
    expect(parsed.warnings.some((w) => w.includes("دورة"))).toBe(true)
  })

  it("collects unreachable nodes + extra TRIGGERs into orphanNodes with warnings", () => {
    const parsed = parseGraph(
      [
        { id: "trigger", type: "TRIGGER", data: {} },
        { id: "msg-1", type: "MESSAGE", data: { text: "أ" } },
        { id: "t-2", type: "TRIGGER", data: {} },
        { id: "x-1", type: "MESSAGE", data: { text: "يتيمة" } },
      ],
      [{ source: "trigger", target: "msg-1" }],
    )
    expect(parsed.steps.map((s) => s.id)).toEqual(["msg-1"])
    expect(parsed.orphanNodes.map((n) => n.id)).toEqual(["t-2", "x-1"])
    expect(parsed.warnings.some((w) => w.includes("عقدة تشغيل إضافية"))).toBe(true)
    expect(parsed.warnings.some((w) => w.includes("خارج بنية المحرر"))).toBe(true)
  })

  it("a condition with only a plain outgoing edge treats it as the yes branch (the engine fallback)", () => {
    const parsed = parseGraph(
      [
        { id: "trigger", type: "TRIGGER", data: {} },
        { id: "c-1", type: "CONDITION", data: { left: "text", op: "contains", right: "سعر" } },
        { id: "msg-1", type: "MESSAGE", data: { text: "أ" } },
      ],
      [
        { source: "trigger", target: "c-1" },
        { source: "c-1", target: "msg-1" },
      ],
    )
    expect(parsed.steps).toEqual([
      { id: "c-1", kind: "CONDITION", left: "text", op: "contains", right: "سعر", yes: [msg("msg-1", "أ")], no: [] },
    ])
    expect(parsed.warnings).toEqual([])
  })
})

describe("chain operations (pure, no data loss)", () => {
  it("inserting a CONDITION swallows the chain tail into its yes branch", () => {
    const chain: Step[] = [msg("msg-1", "أ"), msg("msg-2", "ب")]
    const cond = newStep("CONDITION", used())
    const next = insertStep(chain, 1, cond)
    expect(next.map((s) => s.id)).toEqual(["msg-1", cond.id])
    const inserted = next[1]
    expect(inserted.kind === "CONDITION" && inserted.yes.map((s) => s.id)).toEqual(["msg-2"])
    expect(inserted.kind === "CONDITION" && inserted.no).toEqual([])
  })

  it("deleting a CONDITION pours both branches back into the parent chain (yes then no)", () => {
    const y = msg("msg-y", "نعم")
    const n = msg("msg-n", "لا")
    const chain: Step[] = [msg("msg-1", "أ"), { id: "cond-1", kind: "CONDITION", left: "", op: "eq", right: "", yes: [y], no: [n] }]
    expect(removeStep(chain, 1).map((s) => s.id)).toEqual(["msg-1", "msg-y", "msg-n"])
  })

  it("moves a step within its chain and no-ops at the edges", () => {
    const chain: Step[] = [msg("msg-1", "أ"), msg("msg-2", "ب"), msg("msg-3", "ج")]
    expect(moveStep(chain, 1, -1).map((s) => s.id)).toEqual(["msg-2", "msg-1", "msg-3"])
    expect(moveStep(chain, 0, -1)).toBe(chain)
    expect(moveStep(chain, 2, 1)).toBe(chain)
  })

  it("newStep mints unique ids per kind against the used set", () => {
    const u = new Set<string>(["trigger", "msg-1"])
    const a = newStep("MESSAGE", u)
    const b = newStep("MESSAGE", u)
    expect(a.id).toBe("msg-2")
    expect(b.id).toBe("msg-3")
    expect(newStep("GOAL", u).id).toBe("goal-1")
  })

  it("patchStep replaces a step in place", () => {
    const chain: Step[] = [msg("msg-1", "أ")]
    expect(patchStep(chain, 0, { kind: "MESSAGE", text: "ب" } as Partial<Step>)).toEqual([msg("msg-1", "ب")])
  })
})

describe("display summaries (Arabic)", () => {
  it("stepSummary formats every kind honestly (empty message flagged, long text truncated)", () => {
    const long = "أ".repeat(80)
    expect(stepSummary(msg("m", long))).toBe(`«${"أ".repeat(63)}…»`)
    expect(stepSummary(msg("m", "أهلاً"))).toBe("«أهلاً»")
    expect(stepSummary(msg("m", ""))).toBe("رسالة فارغة — لن تُرسَل")
    expect(stepSummary({ id: "c", kind: "CONDITION", left: "var:vip", op: "eq", right: "1", yes: [], no: [] })).toBe("حقل vip يساوي «1»")
    expect(stepSummary({ id: "d", kind: "DELAY", minutes: 30 })).toBe("انتظار 30 دقيقة قبل الخطوة التالية")
    expect(stepSummary({ id: "a", kind: "ACTION", actionType: "add_tag", tag: "VIP", fieldKey: "", fieldValue: "" })).toBe("إضافة وسم «VIP»")
    expect(stepSummary({ id: "g", kind: "GOAL" })).toBe("نهاية المسار — تكتمل التنفيذات هنا")
  })

  it("delayPhrase uses the correct Arabic dual/plural; describeLeft maps the flat left grammar", () => {
    expect(delayPhrase(1)).toBe("دقيقة واحدة")
    expect(delayPhrase(2)).toBe("دقيقتين")
    expect(delayPhrase(5)).toBe("5 دقائق")
    expect(delayPhrase(30)).toBe("30 دقيقة")
    expect(delayPhrase(0)).toBe("أقل من دقيقة")
    expect(describeLeft("var:city")).toBe("حقل city")
    expect(describeLeft("tag:VIP")).toBe("وسم VIP")
    expect(describeLeft("text")).toBe("نص الرسالة")
    expect(describeLeft("")).toBe("غير مضبوط")
    expect(opLabel("not_empty")).toBe("مُعرَّف")
    expect(opLabel("eq")).toBe("يساوي")
  })

  it("countSteps counts the whole tree including branches", () => {
    expect(
      countSteps([
        msg("m1", "أ"),
        { id: "c", kind: "CONDITION", left: "", op: "eq", right: "", yes: [msg("m2", "ب")], no: [msg("m3", "ج"), msg("m4", "د")] },
      ]),
    ).toBe(5)
  })
})
