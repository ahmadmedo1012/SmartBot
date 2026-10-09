"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { Users2, Shield, User, Plus, Trash2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { unwrapApi } from "@/lib/api"
import { usePollingWhenVisible } from "@/hooks/usePollingWhenVisible"
import type { ApiUser } from "@/lib/types"

const ROLE_LABELS: Record<string, string> = {
  // v4 §2.3 — owner role existed in backend but had no label → raw English leaked
  admin: "مدير", editor: "محرر", viewer: "مشاهد", member: "عضو", owner: "مالك",
}

/* v17-E-F8 (D6-5): الأدوار القابلة للتعيين من الواجهة — عقد /api/users
 * (routers/users.py): admin|editor|viewer. حارس E-B2 يرفض منح admin
 * لأدمن المستأجر (403 عربي «تعيين دور مدير متاح لمدير المنصة فقط…»)
 * — الرسالة تظهر toast صادقة إن اختاره المستخدم. */
const ASSIGNABLE_ROLES = ["admin", "editor", "viewer"] as const

/* v25 (W-14): مفتاح استعلام الفريق — مرفوع لثبات المرجع لخطاف
 * الاستطلاع المرئي (نفس عقد activity/analytics). */
const TEAM_KEY = ["team-members"] as const

export default function TeamPage() {
  const queryClient = useQueryClient()

  /* v25 (W-14): 30s → استطلاع مرئي — المؤقّت يتوقف تماماً في تبويب الخلفية
   * (false) ويعود فور العودة مع تجديد فوري متى تقادمت البيانات. */
  const refetchInterval = usePollingWhenVisible(30_000, TEAM_KEY)
  const { data: members = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: TEAM_KEY,
    queryFn: () => apiFetch("/api/team/members").then(unwrapApi<ApiUser[]>),
    refetchInterval,
    retry: 1,
  })

  /* v17-E-F8 (D6-5): نموذج إضافة عضو — POST /api/users عقد Form-encoded
   * (username/password/role). 403 حد الفريق العربي من E-B2 يظهر toast
   * كما ينص عقد الواجهة رقم 3 في خطة v17. */
  const [showForm, setShowForm] = useState(false)
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState<string>("viewer")

  const addMember = useMutation({
    mutationFn: () =>
      apiFetch("/api/users", {
        method: "POST",
        body: new URLSearchParams({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
        }),
      }).then((res) => unwrapApi<{ id: number }>(res)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] })
      setShowForm(false)
      setNewUsername(""); setNewPassword(""); setNewRole("viewer")
      brandedToast.success("تمت إضافة العضو")
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّرت إضافة العضو"),
  })

  /* تغيير دور — PUT /api/users/{id} (Form: role)؛ الرد يتطلب موافقة المستخدم
   * عبر select تغييره صريح. الحارس العربي (admin لمدير المنصة فقط) يظهر toast. */
  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      apiFetch(`/api/users/${id}`, {
        method: "PUT",
        body: new URLSearchParams({ role }),
      }).then((res) => unwrapApi<{ ok: boolean }>(res)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] })
      brandedToast.success("تم تغيير الدور")
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر تغيير الدور"),
  })

  /* حذف — DELETE /api/users/{id} بتأكيد عربي من خطوتين
   * (نمط sequences: أيقونة ← «تأكيد الحذف» ← DELETE). */
  const deleteMember = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/users/${id}`, { method: "DELETE" }).then((res) => unwrapApi<{ ok: boolean }>(res)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] })
      setConfirmDeleteId(null)
      brandedToast.success("تم حذف العضو")
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر حذف العضو"),
  })
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  /* r127-F5a: the param is widened to `string | undefined` — the else-arm
     of `m.role === "owner"` keeps the optional role, and the switch's
     default arm (muted user icon) is the honest render for a missing role. */
  const roleIcon = (role: string | undefined) => {
    switch (role) {
      case "admin": return <Shield className="size-3 text-accent-foreground" />
      case "editor": return <User className="size-3 text-info" />
      default: return <User className="size-3 text-muted-foreground" />
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي؛ زر «عضو
          جديد» انتقل إلى actions كما في sequences. */}
      <PageHeader
        icon={<Users2 className="size-4" />}
        title="الفريق"
        subtitle="إدارة أعضاء الفريق"
        compact
        actions={
          /* v17-E-F8 (D6-5): وعد «فريق حتى N» بلا سطح إنشاء — زر مرآة
              لبقية صفحات القوائم (بث/قواعد). */
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            <Plus className="size-3.5" /> {showForm ? "إلغاء" : "عضو جديد"}
          </Button>
        }
      />
      {/* D4-بند2 → r131-F8 (task #12): the content column rides the canonical
          1200 token (was max-w-5xl 1024). */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3 max-w-(--marketing-max-w) mx-auto w-full">
        {showForm && (
          <Card
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setShowForm(false) } }}
          >
            <CardContent className="p-4 space-y-3">
              {/* v17-E-F8 (D6-5): عقد POST /api/users — Form-encoded:
                  username 3-32 حرفًا، password ≥ 8، دور من القائمة.
                  r131-F8 (A4 P1-1b/d): the raw-input idiom rides the shared
                  Input/Select primitives (16px floor / r-md / halo). */}
              <p className="text-xs font-bold text-muted-foreground">إضافة عضو جديد</p>
              <Input
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="اسم المستخدم (3-32 حرفًا)"
                aria-label="اسم المستخدم للعضو الجديد"
                autoFocus
              />
              <Input
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                type="password"
                placeholder="كلمة المرور (8 أحرف على الأقل)"
                aria-label="كلمة المرور للعضو الجديد"
                autoComplete="new-password"
              />
              <div className="flex items-center gap-2">
                <label htmlFor="new-member-role" className="text-xs font-medium text-muted-foreground">الدور</label>
                <Select
                  id="new-member-role"
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}
                >
                  {ASSIGNABLE_ROLES.map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                {newRole === "admin"
                  ? "تعيين دور «مدير» متاح لمدير المنصة فقط — سيظهر خطأ عربيًا إن لم تكن مدير المنصة"
                  : "محرر يستطيع إنشاء القواعد والبث، ومشاهد يرى التقارير فقط"}
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
                <Button
                  size="sm"
                  loading={addMember.isPending}
                  disabled={newUsername.trim().length < 3 || newPassword.length < 8 || addMember.isPending}
                  onClick={() => addMember.mutate()}
                >
                  {addMember.isPending ? "جارٍ الإضافة…" : "إضافة العضو"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          /* r131-F8 (A4 P1-2): pulse → .skeleton slabs shape-matched to the
             member row (avatar circle + name/email lines). */
          <div className="space-y-2">{[1,2,3].map(i => (
            <Card key={i}><CardContent className="p-4 flex items-center gap-3">
              <div className="skeleton size-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-32 rounded" />
                <div className="skeleton h-2.5 w-48 rounded" />
              </div>
            </CardContent></Card>
          ))}</div>
        ) : isError ? (
          /* r131-F8 (A4 P2-8): bare error row → the canonical .state family. */
          <div className="state state-danger py-8" role="alert">
            <div className="state-icon" aria-hidden="true">
              <Users2 />
            </div>
            <p className="state-desc">{(error as Error)?.message || "تعذّر تحميل الفريق"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة</Button>
          </div>
        ) : members.length === 0 ? (
          <Card><CardContent className="p-0">
              <EmptyState
                icon={Users2}
                size="sm"
                title="لا يوجد أعضاء فريق بعد"
                description="أضف أعضاء فريقك من زر «عضو جديد» أعلى الصفحة ليشاركوك إدارة الردود والتقارير."
                action={{ label: "عضو جديد", icon: Plus, onClick: () => setShowForm(true) }}
              />
            </CardContent></Card>
        ) : (
          <div className="space-y-3" role="list">
            {members.map((m) => (
              <Card key={m.id} role="listitem">
                {/* v24-C1 (A1 P1): stacked card on mobile — row 1 = avatar +
                    truncated name/email, row 2 = role select + confirm/cancel
                    actions that wrap. The old single row needed ~352px vs
                    ~295px of card content, clipping the destructive confirm. */}
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="size-10 rounded-full bg-accent-foreground/10 flex items-center justify-center font-bold text-sm text-accent-foreground shrink-0">
                      {(m.username?.[0] || "?").toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.username}</p>
                      {/* v15-E6 (D5-M7): emails are live Latin values —
                          dir="auto" isolates bidi (leads:64 pattern).
                          v24-C1: truncate — long Latin usernames/emails used
                          to widen the row past the card at 375px. */}
                      <p className="text-xs text-muted-foreground truncate" dir="auto">{m.email || ""}</p>
                    </div>
                  </div>
                  {m.role === "owner" ? (
                    /* v17-E-F8 (D6-5): المالك بلا تحكم — «owner» ليس دورًا
                        صالحًا في PUT (400) وحذف المالك مدمر؛ الدور يظهر
                        كشارة فقط. */
                    <div className="flex flex-wrap items-center gap-1 text-xs justify-end sm:shrink-0">
                      {roleIcon(m.role)}
                      <span>{ROLE_LABELS[m.role] || "مستخدم"}</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 justify-end sm:shrink-0">
                      <div className="flex items-center gap-1 text-xs">
                        {roleIcon(m.role)}
                      </div>
                      {/* تغيير الدور — select صريح؛ PUT فوري على التغيير
                          (القيمة المعروضة = دور العضو الحالي، والإلغاء
                          بإغلاق الselect دون تغيير).
                          r131-F8 (A4 P1-1d): the hand-rolled native select →
                          the shared Select primitive (44px / 16px / r-md /
                          halo — was a third focus grammar + md:text-sm). */}
                      <Select
                        value={m.role || "viewer"}
                        onChange={e => changeRole.mutate({ id: m.id, role: e.target.value })}
                        disabled={changeRole.isPending && changeRole.variables?.id === m.id}
                        aria-label={`دور العضو ${m.username}`}
                      >
                        {ASSIGNABLE_ROLES.map(r => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </Select>
                      {confirmDeleteId === m.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteMember.mutate(m.id)}
                            disabled={deleteMember.isPending && deleteMember.variables === m.id}
                            loading={deleteMember.isPending && deleteMember.variables === m.id}
                          >
                            <Trash2 className="size-3.5" /> تأكيد الحذف
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteId(null)}
                            aria-label="إلغاء حذف العضو"
                          >
                            إلغاء
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-11 p-0 hover:text-destructive"
                          onClick={() => setConfirmDeleteId(m.id)}
                          aria-label={`حذف العضو ${m.username}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
