/**
 * P45-W1 (المبادرة A — تمديد الاستوديو) — قوالب انطلاق جاهزة.
 *
 * ثلاثة مسارات مُعلَّبة (client-side فقط — بلا أي تغيير خلفي: نفس عقد
 * POST /api/flows مع nodes/edges مصممة مسبقًا، والبنية مسطّحة P43 كما
 * ينفّذها المحرك حرفيًا — انظر graph.ts). القالب يوفر على المستخدم
 * الصفحة البيضاء: مشغّل بكلمات منطقية + خطوات مرتبة، ويبقى كل شيء
 * قابلًا للتعديل في الاستوديو بعد الإنشاء.
 */
import type { FlowEdgeJson, FlowNodeJson } from "./graph"

export interface FlowTemplate {
  id: string
  label: string
  /** سطر وصف قصير تحت اسم القالب في الحوار. */
  hint: string
  nodes: FlowNodeJson[]
  edges: FlowEdgeJson[]
}

/** بناء سلسلة خطوات: مشغّل → …خطوات… → هدف (الحواف تُشتق تلقائيًا). */
function chain(
  keywords: string[],
  steps: Array<Partial<FlowNodeJson> & { id: string; type: string; data: Record<string, unknown> }>,
): { nodes: FlowNodeJson[]; edges: FlowEdgeJson[] } {
  const trigger: FlowNodeJson = {
    id: "trigger",
    type: "TRIGGER",
    data: { triggerType: "keyword", keywords, matchMode: "any" },
  }
  const goal: FlowNodeJson = { id: "goal-1", type: "GOAL", data: {} }
  const nodes = [trigger, ...steps, goal]
  const ids = nodes.map((n) => n.id)
  const edges: FlowEdgeJson[] = []
  for (let i = 0; i < ids.length - 1; i++) {
    edges.push({ source: ids[i]!, target: ids[i + 1]! })
  }
  return { nodes, edges }
}

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "welcome",
    label: "ترحيب المتابعين",
    hint: "كلمة ترحيب تفتح المحادثة وتعرّف بالخدمة",
    ...chain(
      ["مرحبا", "سلام", "أهلا", "السلام عليكم"],
      [{
        id: "msg-1", type: "MESSAGE",
        data: { text: "أهلاً {{first_name}}! نورت صفحتنا 👋 كيف نقدر نساعدك اليوم؟" },
      }],
    ),
  },
  {
    id: "pricing",
    label: "أسئلة الأسعار",
    hint: "يرد على «كم السعر» بقائمة الأسعار ثم يدعو للطلب",
    ...chain(
      ["سعر", "السعر", "كم", "بكام", "السعار"],
      [
        {
          id: "msg-1", type: "MESSAGE",
          data: { text: "أسعارنا: المنتج أ 25 دينار، المنتج ب 40 دينار، والتوصيل 5 دنانير داخل المدينة. أي منهم يهمك؟" },
        },
      ],
    ),
  },
  {
    id: "order-followup",
    label: "متابعة الطلبات",
    hint: "يطمئن العميل على طلبه ثم متابعة بعد ساعة",
    ...chain(
      ["طلبي", "الطلب", "طلب", "وين طلبي"],
      [
        {
          id: "msg-1", type: "MESSAGE",
          data: { text: "طلبك قيد التجهيز ✅ بنوافيك بأي تحرك فورًا." },
        },
        { id: "delay-1", type: "DELAY", data: { minutes: 60 } },
        {
          id: "msg-2", type: "MESSAGE",
          data: { text: "تحديث: هل وصلك طلبك؟ لو في أي ملاحظة نحن هنا 🙌" },
        },
      ],
    ),
  },
]
