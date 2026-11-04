"use client"

/**
 * P43-C-2 — صفحة «التدفقات» = استوديو الأتمتة (قائمة + محرر).
 *
 * الخلفية: المحرك ساكن حتى P43-SB1 — كان محرر v0 نموذجًا مُهيكلًا صادقًا
 * (وضع اختبار يدوي حصرًا). الآن FlowRuntime منفّذ حي يستهلكه رصيد
 * ميسنجر + نبضة الأتمتة، فالصفحة تتقلب لاستوديو كامل:
 *   * قائمة المسارات مع ملخّص إحصاءات كل مسار (GET /stats)
 *   * إنشاء عبر بوابة Premium (has_flows — 403 عند الإنشاء فقط)
 *   * محرر رصفة رأسية (FlowStudio): نشر/إيقاف، حفظ تلقائي، تنفيذات
 *
 * خريطة العقد (routers/flows.py — غلاف {success,data}):
 *   GET    /api/flows              → صفوف {id,name,description,status,
 *          version,total_replies,created_at,updated_at}
 *   POST   /api/flows              → {id} (بوابة has_flows؛ 422 عربية)
 *   GET    /api/flows/{id}         → التفاصيل + nodes/edges
 *   PUT    /api/flows/{id}         → {ok} (يستبدل nodes/edges كما أُرسلت)
 *   DELETE /api/flows/{id}         → {ok} (يمحو التنفيذات)
 *   POST   /api/flows/{id}/publish   → {status:"active",version} (422 عربية
 *          لأخطاء البنية؛ 403 بوابة Premium+)
 *   POST   /api/flows/{id}/unpublish → {status:"paused"}
 *   GET    /api/flows/{id}/stats     → إحصاءات (ملخّص البطاقة/الشريط)
 *   POST   /api/flows/{id}/test      → {execution_id,trace} (يدوم)
 *
 * أمانة النسخ: المحرك حي — النسخ القديم («وضع الاختبار — التنفيذ اليدوي»،
 * «الربط التلقائي غير مفعّل») تقاعد لأنه صار كذبة؛ البديل: «ينشر المسار
 * وينفّذه البوت فعليًا على رسائل ميسنجر الواردة». عقدة اللايم الحية في
 * رأس الصفحة تُشعل فقط حين يوجد مسار منشور فعلًا (trace={hasActive}).
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertCircle, Crown, GitBranch, Pencil, Plus, RefreshCw, Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { brandedToast } from "@/lib/premium-toast"
import { isPlanLocked } from "@/app/dashboard/analytics/plan-lock"
import { countPhrase, formatDateOnly, formatNumber } from "@/lib/format"
import { FlowStudio, STATUS_LABEL, type FlowRow, type FlowStats } from "./FlowStudio"

/* ── عقد الإحصاءات للبطاقة (GET /api/flows/{id}/stats) ─────────────────── */

const num = (v: unknown) => Number(v ?? 0) || 0

function FlowStatsSummary({ flowId, replies }: { flowId: number; replies: number }) {
  const q = useQuery({
    queryKey: ["flow-stats", flowId],
    queryFn: () => apiFetch(`/api/flows/${flowId}/stats`).then(unwrapApi<FlowStats>),
    retry: 1,
  })
  if (q.data) {
    const s = q.data
    return (
      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
        <span className="font-mono tabular-nums">
          {countPhrase(num(s.total_executions), "تنفيذ", "تنفيذين", "تنفيذات")}
        </span>
        {" · مكتملة "}
        <span className="font-mono tabular-nums">{formatNumber(num(s.completed))}</span>
        {" · رسائل مرسلة "}
        <span className="font-mono tabular-nums">{formatNumber(num(s.messages_sent))}</span>
      </p>
    )
  }
  /* قبل جلب الإحصاءات (أو فشله): عدّاد total_replies — عدّاد تنفيذات
   * المحرك (يزيد على كل تشغيل) — «تنفيذ» لا «رد» (نفس حقيقة الخادم). */
  return (
    <p className="text-xs text-muted-foreground mt-0.5">
      <span className="font-mono tabular-nums">
        {countPhrase(replies, "تنفيذ", "تنفيذين", "تنفيذات")}
      </span>
    </p>
  )
}

/* ── الحالة «متاحة في Premium» (نمط analytics/PremiumLockBody) ─────────── */

/** 403 بوابة الخطة (إنشاء/نشر) — نسخة الخادم العربية + دعوة /subscribe. */
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

/* ── حوار الإنشاء (POST /api/flows → فتح المحرر فورًا) ─────────────────── */

function CreateFlowDialog({
  onClosed, onCreated,
}: {
  onClosed: () => void
  onCreated: (id: number) => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [planLocked, setPlanLocked] = useState<string | null>(null)

  const createMut = useMutation({
    /* مسودة فارغة: nodes/edges يبدآن فارغين (الخدمة تسمح) والتصميم في المحرر */
    mutationFn: () =>
      apiFetch("/api/flows", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      }).then(unwrapApi<{ id: number }>),
    onSuccess: (d) => {
      brandedToast.success("تم إنشاء المسودة — صمّم الخطوات وانشرها")
      onCreated(Number(d?.id))
    },
    onError: (e: Error) => {
      if (isPlanLocked(e)) {
        setPlanLocked(e.message)
        return
      }
      setError(e.message || "تعذّر إنشاء التدفق")
    },
  })

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClosed() }}>
      <DialogContent>
        <DialogTitle>تدفق جديد</DialogTitle>
        <DialogDescription>
          مسودة تبدأ فارغة — المشغّل والخطوات تُصمَّم في الاستوديو بعد الإنشاء.
        </DialogDescription>

        {planLocked ? (
          <PremiumLockBody message={planLocked} />
        ) : (
          <>
            <Input
              id="new-flow-name"
              label="اسم التدفق"
              placeholder="مثال: أسئلة الأسعار"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              error={error ?? undefined}
            />
            <Input
              id="new-flow-description"
              label="الوصف (اختياري)"
              placeholder="ماذا يفعل هذا التدفق؟"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </>
        )}

        <div className="flex justify-end gap-2">
          {planLocked ? (
            <Button size="sm" variant="ghost" onClick={onClosed}>إغلاق</Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={onClosed}>إلغاء</Button>
              <Button
                size="sm"
                loading={createMut.isPending}
                disabled={name.trim().length === 0 || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                إنشاء التدفق
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── بطاقة مسار في القائمة ─────────────────────────────────────────────── */

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary" | "outline"> = {
  draft: "secondary",
  active: "success",
  paused: "warning",
  archived: "outline",
}

function FlowCard({
  flow, onOpen, confirmDelete, onArm, onConfirmDelete, onCancelDelete, deleting,
}: {
  flow: FlowRow
  onOpen: () => void
  confirmDelete: boolean
  onArm: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  deleting: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold truncate" dir="auto">{flow.name || `تدفق #${flow.id}`}</p>
              <Badge variant={STATUS_VARIANT[flow.status] ?? "secondary"} className="shrink-0">
                {STATUS_LABEL[flow.status] ?? flow.status}
              </Badge>
            </div>
            {flow.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1" dir="auto">{flow.description}</p>
            )}
            <FlowStatsSummary flowId={flow.id} replies={flow.total_replies ?? 0} />
            <p className="text-xs text-muted-foreground mt-0.5">
              آخر تحديث {formatDateOnly(flow.updated_at) || "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={onOpen}
              aria-label={`فتح محرر التدفق ${flow.name || flow.id}`}
            >
              <Pencil className="size-3.5" /> فتح المحرر
            </Button>
            {confirmDelete ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={onConfirmDelete}
                  disabled={deleting}
                  loading={deleting}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" /> تأكيد الحذف
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onCancelDelete}
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
                onClick={onArm}
                aria-label={`حذف التدفق ${flow.name || flow.id}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ── الصفحة ────────────────────────────────────────────────────────────── */

export default function FlowsPage() {
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const { data: flows = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["flows"],
    queryFn: () => apiFetch("/api/flows").then(unwrapApi<FlowRow[]>),
    retry: 1,
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

  /* المحرر يحلّ محل القائمة (نفس المسار — بلا تغيير تنقّل) */
  if (editingId !== null) {
    const row = flows.find((f) => f.id === editingId)
    return (
      <FlowStudio
        key={editingId}
        flowId={editingId}
        row={row}
        onBack={() => setEditingId(null)}
      />
    )
  }

  const hasActive = flows.some((f) => f.status === "active")

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader
        icon={<GitBranch className="size-4" />}
        title="التدفقات"
        subtitle="استوديو أتمتة — ينشر المسار وينفّذه البوت فعليًا على رسائل ميسنجر الواردة"
        compact
        trace={hasActive}
        actions={
          <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="size-3.5" /> تدفق جديد
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {isError ? (
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
                  description="أنشئ أول مسار أتمتة — مشغّل وخطوات، ثم انشره لينفّذه البوت على الرسائل الواردة."
                  action={{
                    label: "تدفق جديد",
                    icon: Plus,
                    onClick: () => setCreating(true),
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {flows.map((f) => (
                <FlowCard
                  key={f.id}
                  flow={f}
                  onOpen={() => setEditingId(f.id)}
                  confirmDelete={confirmDeleteId === f.id}
                  onArm={() => setConfirmDeleteId(f.id)}
                  onConfirmDelete={() => deleteMut.mutate(f.id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  deleting={deleteMut.isPending && deleteMut.variables === f.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {creating && (
        <CreateFlowDialog
          onClosed={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            setEditingId(id)
          }}
        />
      )}
    </div>
  )
}
