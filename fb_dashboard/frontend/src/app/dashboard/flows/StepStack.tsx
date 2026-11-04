"use client"

/**
 * P43-C-2 — رصة الخطوات الرأسية لاستوديو الأتمتة (نهج ManyChat بلا
 * لوحة رسم حرة — صفر تبعيات جديدة).
 *
 * كل بطاقة = عقدة: أيقونة نوعها + سطر ملخّص + إعداد قابل للفتح/الطي،
 * وسكة الدارة (خصلة start-logical + نقطة) تصل البطاقات عموديًا بوعي
 * RTL. الشرط (CONDITION) يفتح عمودين مُزاحين تحت بطاقته: «نعم» و«لا» —
 * كل عمود رصة مستقلة بنفس المكون (الاستدعاء الذاتي)، والفرع الفارغ
 * نهاية مسار صريحة (يكملها المحرك ضمنيًا).
 *
 * «إضافة خطوة» بعد أي بطاقة: صف من خمسة أنواع (رسالة/شرط/تأخير/إجراء/
 * هدف) — إدراج شرط يبتلع ذيل السلسلة إلى فرع «نعم» (منطق graph.ts).
 */
import { useState } from "react"
import type { LucideIcon } from "lucide-react"
import {
  ChevronDown, ChevronUp, Clock, Flag, GitBranch, Layers, MessageSquare,
  Plus, Trash2, Wrench,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  ACTION_OPTIONS, CONDITION_OPS, KIND_LABEL,
  countSteps, delayPhrase, describeLeft, insertStep, moveStep, newStep,
  opLabel, patchStep, removeStep, stepSummary,
  type Step, type StepKind,
} from "./graph"

const KIND_ICON: Record<StepKind, LucideIcon> = {
  MESSAGE: MessageSquare,
  CONDITION: GitBranch,
  DELAY: Clock,
  ACTION: Wrench,
  GOAL: Flag,
  SEQUENCE: Layers,
}

/** الأنواع القابلة للإضافة من المحرر (SEQUENCE يُقرأ فقط من المخطط القائم). */
const ADDABLE: { kind: StepKind; icon: LucideIcon; hint: string }[] = [
  { kind: "MESSAGE", icon: MessageSquare, hint: "رسالة ميسنجر تُرسل للمشترك" },
  { kind: "CONDITION", icon: GitBranch, hint: "تفرّع نعم/لا حسب بيانات المشترك" },
  { kind: "DELAY", icon: Clock, hint: "انتظار يستأنفه البوت تلقائيًا" },
  { kind: "ACTION", icon: Wrench, hint: "وسم أو حقل على المشترك" },
  { kind: "GOAL", icon: Flag, hint: "نهاية المسار" },
]

export interface StepStackProps {
  steps: Step[]
  usedIds: Set<string>
  onChange: (steps: Step[]) => void
}

/** الرصة: بطاقات متصلة بسكة الدارة + نقاط إدراج بعد كل بطاقة. */
export function StepStack({ steps, usedIds, onChange }: StepStackProps) {
  const endsWithCondition = steps.length > 0 && steps[steps.length - 1]?.kind === "CONDITION"
  return (
    <div className="space-y-1">
      {steps.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground text-center">
          نهاية المسار هنا — الخطوات أعلاه هي كل ما ينفّذه البوت.
        </p>
      )}
      {steps.map((step, i) => (
        <div key={step.id} className="relative ps-6">
          {/* سكة الدارة (RTL-logical) + نقطة البطاقة */}
          <span aria-hidden="true" className="absolute start-[9px] inset-y-0 w-px bg-primary/15" />
          <span aria-hidden="true" className="absolute start-[4px] top-[26px] size-2.5 rounded-full bg-primary/30 ring-2 ring-background" />
          <StepCard
            step={step}
            index={i}
            total={steps.length}
            usedIds={usedIds}
            onPatch={(patch) => onChange(patchStep(steps, i, patch))}
            onMove={(dir) => onChange(moveStep(steps, i, dir))}
            onDelete={() => onChange(removeStep(steps, i))}
          />
          <InsertPoint
            label={`إضافة خطوة بعد ${KIND_LABEL[step.kind]} ${step.id}`}
            onInsert={(kind) => onChange(insertStep(steps, i + 1, newStep(kind, usedIds)))}
          />
        </div>
      ))}
      {/* ذيل السلسلة: يُعرض فقط حين لا تنتهي بشرط (الاستمرار عندئذ داخل الفرعين) */}
      {!endsWithCondition && (
        <InsertPoint
          label="إضافة خطوة في نهاية المسار"
          onInsert={(kind) => onChange(insertStep(steps, steps.length, newStep(kind, usedIds)))}
        />
      )}
    </div>
  )
}

/* ── بطاقة خطوة ────────────────────────────────────────────────────────── */

interface StepCardProps {
  step: Step
  index: number
  total: number
  usedIds: Set<string>
  onPatch: (patch: Partial<Step>) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}

function StepCard({ step, index, total, usedIds, onPatch, onMove, onDelete }: StepCardProps) {
  const [open, setOpen] = useState(false)
  const Icon = KIND_ICON[step.kind]
  const hasConfig = step.kind !== "GOAL" && step.kind !== "SEQUENCE"
  return (
    <div className="rounded-xl border border-border/60 bg-background/40">
      <div className="flex items-center gap-1 p-2.5 ps-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-expanded={open}
          aria-label={`${KIND_LABEL[step.kind]} ${step.id}${hasConfig ? (open ? " — طيّ الإعداد" : " — فتح الإعداد") : ""}`}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-foreground/10 border border-accent-foreground/15 text-accent-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="text-xs font-bold">{KIND_LABEL[step.kind]}</span>
              <span className="font-mono text-2xs text-muted-foreground" dir="ltr">{step.id}</span>
              {step.kind === "GOAL" && <Badge variant="gold" className="shrink-0">نهاية</Badge>}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground" dir="auto" title={stepSummary(step)}>
              {stepSummary(step)}
            </span>
          </span>
          {hasConfig && (
            <ChevronDown
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
              aria-hidden="true"
            />
          )}
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            className="size-11 p-0"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`نقل ${KIND_LABEL[step.kind]} ${step.id} للأعلى`}
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="size-11 p-0"
            onClick={() => onMove(1)}
            disabled={index >= total - 1}
            aria-label={`نقل ${KIND_LABEL[step.kind]} ${step.id} للأسفل`}
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="size-11 p-0 hover:text-destructive-ink"
            onClick={onDelete}
            aria-label={`حذف ${KIND_LABEL[step.kind]} ${step.id}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {open && step.kind === "MESSAGE" && (
        <MessageConfig step={step} onPatch={onPatch} />
      )}
      {open && step.kind === "DELAY" && (
        <DelayConfig step={step} onPatch={onPatch} />
      )}
      {open && step.kind === "ACTION" && (
        <ActionConfig step={step} onPatch={onPatch} />
      )}
      {open && step.kind === "SEQUENCE" && (
        <div className="border-t border-border/60 p-3 space-y-1">
          <p className="text-xs text-muted-foreground leading-relaxed" dir="auto">
            تسجيل في تسلسل قائم — بطاقة للقراءة؛ بياناتها تُحفظ كما هي
            (<span className="font-mono" dir="ltr">{JSON.stringify(step.raw)}</span>).
          </p>
        </div>
      )}

      {step.kind === "CONDITION" && (
        <ConditionConfigAndBranches step={step} usedIds={usedIds} onPatch={onPatch} open={open} />
      )}
    </div>
  )
}

/* ── إعدادات الأنواع ───────────────────────────────────────────────────── */

function MessageConfig({ step, onPatch }: { step: Step; onPatch: (patch: Partial<Step>) => void }) {
  if (step.kind !== "MESSAGE") return null
  return (
    <div className="border-t border-border/60 p-3 space-y-2.5">
      <Textarea
        id={`${step.id}-text`}
        value={step.text}
        onChange={(e) => onPatch({ kind: "MESSAGE", text: e.target.value, wait: step.wait, buttons: step.buttons } as Partial<Step>)}
        placeholder="نص الرسالة…"
        rows={3}
        aria-label={`نص الرسالة ${step.id}`}
      />
      <p className="text-xs text-muted-foreground leading-relaxed">
        متغيرات القوالب المدعومة: {"{{first_name}}"} و{"{{name}}"} و{"{{full_name}}"} —
        يستبدلها المحرك ببيانات المشترك عند الإرسال.
      </p>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-2.5">
        <div className="min-w-0">
          <p className="text-xs font-semibold">انتظار رد المشترك</p>
          <p className="text-2xs text-muted-foreground leading-relaxed">
            بعد الإرسال يقف المسار حتى يرد المشترك (data.wait) — الرسالة التالية تُرسل عندها.
          </p>
        </div>
        <Switch
          checked={step.wait}
          onCheckedChange={(v) => onPatch({ kind: "MESSAGE", text: step.text, wait: v, buttons: step.buttons } as Partial<Step>)}
          aria-label={`انتظار رد المشترك بعد الرسالة ${step.id}`}
        />
      </div>
    </div>
  )
}

function DelayConfig({ step, onPatch }: { step: Step; onPatch: (patch: Partial<Step>) => void }) {
  if (step.kind !== "DELAY") return null
  return (
    <div className="border-t border-border/60 p-3 space-y-2.5">
      <div className="max-w-56">
        <Input
          id={`${step.id}-minutes`}
          type="number"
          min={0}
          inputMode="numeric"
          label={`مدة الانتظار بالدقائق (${step.id})`}
          value={String(step.minutes)}
          onChange={(e) => {
            const n = Number(e.target.value)
            onPatch({ kind: "DELAY", minutes: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0 } as Partial<Step>)
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {delayPhrase(step.minutes)} — يجلس المسار هنا ثم تستأنفه نبضة الأتمتة
        تلقائيًا (الرسائل الواردة لا تتجاوز الانتظار).
      </p>
    </div>
  )
}

function ActionConfig({ step, onPatch }: { step: Step; onPatch: (patch: Partial<Step>) => void }) {
  if (step.kind !== "ACTION") return null
  const opts = ACTION_OPTIONS.some((o) => o.value === step.actionType)
    ? [...ACTION_OPTIONS]
    : [...ACTION_OPTIONS, { value: step.actionType, label: `إجراء متقدم (${step.actionType})` }]
  return (
    <div className="border-t border-border/60 p-3 space-y-2.5">
      <div className="max-w-56">
        <Select
          value={step.actionType}
          onChange={(e) => onPatch({ kind: "ACTION", actionType: e.target.value, tag: step.tag, fieldKey: step.fieldKey, fieldValue: step.fieldValue, raw: step.raw } as Partial<Step>)}
          aria-label={`نوع الإجراء ${step.id}`}
        >
          {opts.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </div>
      {(step.actionType === "add_tag" || step.actionType === "remove_tag") && (
        <Input
          id={`${step.id}-tag`}
          label={`اسم الوسم (${step.id})`}
          placeholder="مثال: مهتم بالأسعار"
          value={step.tag}
          onChange={(e) => onPatch({ kind: "ACTION", actionType: step.actionType, tag: e.target.value, fieldKey: step.fieldKey, fieldValue: step.fieldValue } as Partial<Step>)}
        />
      )}
      {step.actionType === "set_field" && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Input
            id={`${step.id}-key`}
            label={`مفتاح الحقل (${step.id})`}
            placeholder="مثال: city"
            value={step.fieldKey}
            onChange={(e) => onPatch({ kind: "ACTION", actionType: step.actionType, tag: step.tag, fieldKey: e.target.value, fieldValue: step.fieldValue } as Partial<Step>)}
          />
          <Input
            id={`${step.id}-value`}
            label={`قيمة الحقل (${step.id})`}
            placeholder="مثال: طرابلس"
            value={step.fieldValue}
            onChange={(e) => onPatch({ kind: "ACTION", actionType: step.actionType, tag: step.tag, fieldKey: step.fieldKey, fieldValue: e.target.value } as Partial<Step>)}
          />
        </div>
      )}
      {step.raw && step.actionType !== "add_tag" && step.actionType !== "remove_tag" && step.actionType !== "set_field" && (
        <p className="text-xs text-muted-foreground leading-relaxed" dir="auto">
          إجراء متقدم يُحفظ كما هو دون تحرير (
          <span className="font-mono" dir="ltr">{step.actionType || "—"}</span>).
        </p>
      )}
    </div>
  )
}

/* ── الشرط: الإعداد + عمودا التفرّع ───────────────────────────────────── */

function ConditionConfigAndBranches({
  step, usedIds, onPatch, open,
}: {
  step: Step
  usedIds: Set<string>
  onPatch: (patch: Partial<Step>) => void
  open: boolean
}) {
  if (step.kind !== "CONDITION") return null
  const ops = CONDITION_OPS.some((o) => o.value === step.op)
    ? [...CONDITION_OPS]
    : [...CONDITION_OPS, { value: step.op, label: opLabel(step.op) }]
  return (
    <div className="border-t border-border/60">
      {open && (
        <div className="p-3 space-y-2.5">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Input
              id={`${step.id}-left`}
              label={`الجهة left (${step.id})`}
              placeholder="var:city أو tag:VIP أو text"
              hint="var:حقل المشترك · tag:اسم الوسم · text · intent"
              value={step.left}
              onChange={(e) => onPatch({ kind: "CONDITION", left: e.target.value, op: step.op, right: step.right, yes: step.yes, no: step.no } as Partial<Step>)}
            />
            <div className="space-y-1">
              <label htmlFor={`${step.id}-op`} className="text-sm font-medium">العملية</label>
              <Select
                id={`${step.id}-op`}
                value={step.op}
                onChange={(e) => onPatch({ kind: "CONDITION", left: step.left, op: e.target.value, right: step.right, yes: step.yes, no: step.no } as Partial<Step>)}
                aria-label={`عملية الشرط ${step.id}`}
              >
                {ops.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
            {step.op !== "exists" && (
              <Input
                id={`${step.id}-right`}
                label={`القيمة right (${step.id})`}
                placeholder="مثال: 1"
                value={step.right}
                onChange={(e) => onPatch({ kind: "CONDITION", left: step.left, op: step.op, right: e.target.value, yes: step.yes, no: step.no } as Partial<Step>)}
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            عند التنفيذ يقيّم البوت الشرط على بيانات المشترك الحية ثم يتبع حافة
            «نعم» أو «لا» تلقائيًا — العمودان أدناه هما المساران.
          </p>
        </div>
      )}
      <div className="grid gap-3 p-3 md:grid-cols-2">
        <BranchColumn
          title="نعم — إذا تحقق الشرط"
          description={describeLeft(step.left) !== "غير مضبوط" ? `${describeLeft(step.left)} ${opLabel(step.op)}` : undefined}
          steps={step.yes}
          usedIds={usedIds}
          onSteps={(next) => onPatch({ kind: "CONDITION", left: step.left, op: step.op, right: step.right, yes: next, no: step.no } as Partial<Step>)}
        />
        <BranchColumn
          title="لا — إذا لم يتحقق"
          steps={step.no}
          usedIds={usedIds}
          onSteps={(next) => onPatch({ kind: "CONDITION", left: step.left, op: step.op, right: step.right, yes: step.yes, no: next } as Partial<Step>)}
        />
      </div>
    </div>
  )
}

function BranchColumn({
  title, description, steps, usedIds, onSteps,
}: {
  title: string
  description?: string
  steps: Step[]
  usedIds: Set<string>
  onSteps: (steps: Step[]) => void
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-muted/10 p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="shrink-0">{title}</Badge>
        <span className="text-2xs text-muted-foreground">
          {countSteps(steps) === 0 ? "نهاية ضمنية" : `${countSteps(steps)} خطوة`}
        </span>
        {description && (
          <span className="min-w-0 truncate text-2xs text-muted-foreground" dir="auto">{description}</span>
        )}
      </div>
      <StepStack steps={steps} usedIds={usedIds} onChange={onSteps} />
    </div>
  )
}

/* ── نقطة الإدراج ──────────────────────────────────────────────────────── */

function InsertPoint({
  label, onInsert,
}: {
  label: string
  onInsert: (kind: StepKind) => void
}) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <div className="flex justify-center py-0.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(true)}
          aria-label={label}
        >
          <Plus className="size-3.5" aria-hidden="true" /> إضافة خطوة
        </Button>
      </div>
    )
  }
  return (
    <div className="my-1 rounded-xl border border-dashed border-border/70 bg-muted/20 p-2 space-y-2">
      <p className="px-1 text-xs font-semibold">إضافة خطوة</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {ADDABLE.map((a) => (
          <Button
            key={a.kind}
            size="sm"
            variant="outline"
            className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-start"
            onClick={() => {
              setOpen(false)
              onInsert(a.kind)
            }}
            aria-label={`${label} — ${KIND_LABEL[a.kind]}`}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <a.icon className="size-3.5" aria-hidden="true" />
              {KIND_LABEL[a.kind]}
            </span>
            <span className="text-2xs text-muted-foreground leading-snug">{a.hint}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
