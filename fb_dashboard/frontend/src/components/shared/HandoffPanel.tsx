"use client"

/**
 * HandoffPanel (P45-W1 — Initiative B, vertical slice #1).
 *
 * THE missing consumer of the finished P43-SB2 API layer: bot pause,
 * assignee, lifecycle and internal notes existed on the backend (21
 * acceptance tests in tests/test_p43_flow_runtime_handoff.py) with ZERO
 * UI. This panel is the smallest complete surface for them — reused
 * primitives only (Button/Select/Textarea/Badge, the .pill family, the
 * .state families), no restructuring of its host page.
 *
 * Contracts consumed (routers/inbox.py — {success,data} envelope,
 * unwrapped ONLY via lib/api.ts):
 *   GET    /api/inbox/conversations/{id}/detail → handoff state + notes
 *   GET    /api/inbox/assignees                 → P45-W1 roster {id,username,name}
 *   PATCH  /api/inbox/conversations/{id}        → {status|assignee_id|bot_paused}
 *   POST   /api/inbox/conversations/{id}/notes  → {content}
 *
 * Honesty doctrine (v15 §7 / P45 constraint #3): every mutation is an
 * optimistic cache slice with snapshot ROLLBACK on failure — the panel
 * never claims a pause/assignment that the server rejected. Mutations
 * disable their controls while in flight (aria-busy via Button loading),
 * viewer-role operators get disabled controls + the reason (the PATCH is
 * editor-gated server-side; the UI refuses earlier, honestly).
 */
import { useState } from "react"
import type { CSSProperties } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, BotOff, StickyNote, UserRoundCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { pillClasses } from "@/components/shared/pills"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { brandedToast } from "@/lib/premium-toast"
import { useMe } from "@/hooks/useMe"
import { countPhrase, formatDate } from "@/lib/format"
import type {
  ConversationAssignee, ConversationDetail, ConversationNoteRow,
} from "@/lib/types"

/** P43-SB2 lifecycle — the closed status set (inbox.py CONVERSATION_STATUSES). */
const LIFECYCLE = [
  { value: "open", label: "مفتوحة" },
  { value: "pending", label: "معلّقة" },
  { value: "closed", label: "مغلقة" },
] as const

const NOTE_MAX = 2000 // inbox.py truncates at 2000 — floor the composer too

/** Initials tile for the current assignee — the ConvItem hue recipe
 * (messages page), static inline: the name is the accessible content. */
function AssigneeBadge({ assignee }: { assignee: ConversationAssignee | null }) {
  if (!assignee) {
    return <span className="text-xs text-muted-foreground">غير معيّن</span>
  }
  const name = assignee.name || assignee.username
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden="true"
        className="sb-initials flex size-6 shrink-0 items-center justify-center rounded-full text-2xs font-bold"
        style={{ "--sb-hue": (name.length * 37) % 360 } as CSSProperties}
      >
        {name.trim().split(" ").slice(0, 2).map((s) => s[0]).join("").toUpperCase() || "?"}
      </span>
      <span className="truncate text-xs font-medium" dir="auto">{name}</span>
    </span>
  )
}

export function HandoffPanel({ conversationId }: { conversationId: string }) {
  const queryClient = useQueryClient()
  const [noteText, setNoteText] = useState("")

  /* The mutating role gate: PATCH/notes are editor-gated server-side
   * (require_role("editor") — admin passes too via the hierarchy). The
   * panel disables its controls for viewers instead of letting them eat
   * a 403; me is AuthGuard-resolved (the page lives inside the gate). */
  const { data: me } = useMe()
  const role = me?.user?.role
  const canEdit = role === "admin" || role === "editor"

  const detailQ = useQuery({
    queryKey: ["inbox-detail", conversationId],
    queryFn: () =>
      apiFetch(`/api/inbox/conversations/${conversationId}/detail`).then(
        unwrapApi<ConversationDetail>),
    retry: 1,
    staleTime: 15000,
  })

  const rosterQ = useQuery({
    queryKey: ["inbox-assignees"],
    queryFn: () => apiFetch("/api/inbox/assignees").then(unwrapApi<ConversationAssignee[]>),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const detail = detailQ.data
  const members = rosterQ.data ?? []

  /* One PATCH mutation for the three handoff fields — honest optimistic
   * slices + snapshot rollback (the page's sendMut pattern). */
  const patchMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/inbox/conversations/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }).then(unwrapApi<ConversationDetail>),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: ["inbox-detail", conversationId] })
      const previous = queryClient.getQueryData<ConversationDetail>(["inbox-detail", conversationId])
      if (previous) {
        queryClient.setQueryData<ConversationDetail>(["inbox-detail", conversationId], (old) => {
          if (!old) return old
          const next = { ...old }
          if ("status" in body) next.status = String(body.status)
          if ("bot_paused" in body) next.bot_paused = Boolean(body.bot_paused)
          if ("assignee_id" in body) {
            const aid = body.assignee_id as number | null
            next.assignee_id = aid ?? null
            next.assignee = aid == null ? null
              : (members.find((m) => m.id === aid) ?? null)
          }
          return next
        })
      }
      return { previous }
    },
    onSuccess: (data) => {
      /* the server's answer is the truth — it replaces the optimistic slice */
      queryClient.setQueryData<ConversationDetail>(["inbox-detail", conversationId], (old) =>
        old ? { ...old, ...data } : data)
      /* the LIST rows carry the same handoff slice — refresh the badges */
      queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] })
    },
    onError: (e: Error, _body, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["inbox-detail", conversationId], context.previous)
      }
      brandedToast.error(e.message || "تعذّر تحديث المحادثة")
    },
  })

  const noteMut = useMutation({
    mutationFn: (content: string) =>
      apiFetch(`/api/inbox/conversations/${conversationId}/notes`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }).then(unwrapApi<ConversationNoteRow>),
    onSuccess: (note) => {
      /* newest-first, the endpoint's own order (created_at desc) */
      queryClient.setQueryData<ConversationDetail>(["inbox-detail", conversationId], (old) =>
        old ? { ...old, notes: [note, ...(old.notes ?? [])] } : old)
      setNoteText("")
      brandedToast.success("أُضيفت الملاحظة")
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر إضافة الملاحظة"),
  })

  if (detailQ.isError) {
    return (
      <div className="border-b border-border bg-card/60 p-3">
        <div className="state state-danger py-6" role="alert">
          <div className="state-icon" aria-hidden="true"><UserRoundCheck /></div>
          <p className="state-title">تعذّر تحميل حالة التسليم</p>
          <Button size="sm" variant="outline" onClick={() => detailQ.refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="space-y-3 border-b border-border bg-card/60 p-3" aria-busy="true">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    )
  }

  const paused = detail.bot_paused === true
  const status = detail.status || "open"
  const patching = patchMut.isPending
  const controlsDisabled = !canEdit || patching

  return (
    <section
      id="handoff-panel"
      aria-label="لوحة التسليم اليدوي"
      className="space-y-3 border-b border-border bg-card/60 p-3"
    >
      {/* ── bot pause toggle ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            {paused ? (
              <BotOff className="size-4 text-warning-ink" aria-hidden="true" />
            ) : (
              <Bot className="size-4 text-success-ink" aria-hidden="true" />
            )}
            ردود البوت {paused ? "موقوفة" : "تعمل"}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            الإيقاف يسلّم المحادثة لفريقك: تتوقف الردود التلقائية والمسارات المنشورة
            عن الإجابة هنا حتى تعيد التشغيل — الردود بعدها بيدك أنت.
          </p>
        </div>
        <Button
          size="sm"
          variant={paused ? "outline" : "gold"}
          className="h-11"
          loading={patching}
          disabled={!canEdit}
          aria-pressed={paused}
          aria-label={paused ? "إعادة تشغيل البوت في هذه المحادثة" : "إيقاف ردود البوت في هذه المحادثة"}
          onClick={() => patchMut.mutate({ bot_paused: !paused })}
        >
          {paused ? (
            <><Bot className="size-4" aria-hidden="true" /> إعادة تشغيل البوت</>
          ) : (
            <><BotOff className="size-4" aria-hidden="true" /> إيقاف ردود البوت</>
          )}
        </Button>
      </div>

      {/* ── lifecycle chips ──────────────────────────────────────────── */}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">حالة المحادثة</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="حالة دورة حياة المحادثة">
          {LIFECYCLE.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => { if (status !== s.value) patchMut.mutate({ status: s.value }) }}
              aria-pressed={status === s.value}
              disabled={!canEdit}
              className={pillClasses(status === s.value, "min-h-11 px-3.5 disabled:opacity-55 disabled:pointer-events-none")}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── assignee ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-xs font-semibold text-muted-foreground">المسؤول</span>
          <AssigneeBadge assignee={detail.assignee ?? null} />
        </div>
        <div className="w-full sm:w-56">
          <Select
            aria-label="تعيين مسؤول للمحادثة"
            value={detail.assignee_id != null ? String(detail.assignee_id) : ""}
            disabled={controlsDisabled}
            onChange={(e) => {
              const v = e.target.value
              patchMut.mutate({ assignee_id: v === "" ? null : Number(v) })
            }}
          >
            <option value="">غير معيّن</option>
            {members.map((m) => (
              <option key={m.id} value={String(m.id)}>{m.name || m.username}</option>
            ))}
          </Select>
        </div>
      </div>

      {!canEdit && (
        <p className="text-xs text-warning-ink">
          {role === "viewer"
            ? "تغيير التسليم يتطلب صلاحية محرر — دورك الحالي مشاهد."
            : "جارٍ التحقق من صلاحيتك…"}
        </p>
      )}

      {/* ── internal notes ───────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <StickyNote className="size-3.5" aria-hidden="true" />
          ملاحظات داخلية — لا تصل للعميل أبدًا
        </p>
        {(detail.notes ?? []).length > 0 ? (
          <ul
            className="max-h-48 space-y-1.5 overflow-y-auto"
            role="list"
            aria-label="الملاحظات الداخلية"
          >
            {(detail.notes ?? []).map((n) => (
              <li key={n.id} className="rounded-lg border border-border/60 bg-background/40 p-2.5">
                <p className="text-xs leading-relaxed" dir="auto">{n.content}</p>
                <p className="mt-1 text-2xs text-muted-foreground">
                  {n.created_by ? `بواسطة ${n.created_by} · ` : ""}
                  {formatDate(n.created_at) || "—"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-2.5 text-center text-xs text-muted-foreground">
            لا ملاحظات بعد — أول ملاحظة تُسجَّل لفريقك فقط.
          </p>
        )}
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value.slice(0, NOTE_MAX))}
              placeholder="مثال: العميل يطلب استرجاعًا — تابعنا الهاتف غدًا"
              aria-label="نص ملاحظة داخلية جديدة"
              rows={2}
              className="min-h-[44px]"
            />
          </div>
          <Button
            size="sm"
            className="h-11"
            loading={noteMut.isPending}
            disabled={!canEdit || noteText.trim().length === 0 || noteMut.isPending}
            onClick={() => noteMut.mutate(noteText.trim())}
          >
            إضافة ملاحظة
          </Button>
        </div>
        {(detail.notes ?? []).length > 0 && (
          <p className="text-2xs text-muted-foreground">
            {countPhrase((detail.notes ?? []).length, "ملاحظة", "ملاحظتين", "ملاحظات")}
          </p>
        )}
      </div>
    </section>
  )
}
