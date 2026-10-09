"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { usePollingWhenVisible } from "@/hooks/usePollingWhenVisible"
import { Newspaper, Send, Trash2, AlertCircle, RefreshCw, WifiOff, ThumbsUp, MessageSquare, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
/* r132 (A8 F-SB-1): the retired «السابق/التالي» hand-rolled pager → the
 * canonical numbered TablePagination footer (fleet ruling "numbered pag" —
 * the audience/admin-support/leads twin). */
import { TablePagination } from "@/components/shared/TablePagination"
import { unwrapApi } from "@/lib/api"
import type { ScheduledPost, PostsResponse } from "@/lib/types"
import { formatDate, formatNumber } from "@/lib/format"

const POST_STATUS_LABELS: Record<string, string> = {
  published: "منشور", scheduled: "مجدول", draft: "مسودة", failed: "فاشل",
}

/* v25 (W-14): مفتاح استعلام المسودات — مرفوع لثبات المرجع لخطاف
 * الاستطلاع المرئي (نفس عقد activity/analytics). */
const DRAFTS_KEY = ["scheduled-posts"] as const

export default function PostsPage() {
  const [newMessage, setNewMessage] = useState("")
  const queryClient = useQueryClient()
  /* v24-C2 (task 3 / A3-P2): النشر والحذف بلمستين — نفس نمط sequences/team
     داخل المستودع: الضغط الأول يكشف «تأكيد النشر/الحذف + إلغاء» (أزرار
     44px)، والثاني فقط ينفّذ. النشر يدفع للصفحة الحية على فيسبوك والحذف
     لا رجعة فيه — لا تنفيذ بلمسة أيقونة واحدة بعد الآن. */
  const [confirmPublishId, setConfirmPublishId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  /* v25 (W-07): صفحة منشورات فيسبوك الحالية — /api/posts (facebook_routes
   * .py:1036) يقبل page ge=1 + per_page (10 افتراضياً) ويُرجع الظرف
   * {items,total,page,per_page,has_next}؛ القسم كان يعرض أول 10 فقط بلا
   * سبيل للأقدم. الصفحة 1 تبقى بلا معامل (عقد الخلفية الافتراضي نفسه). */
  const [fbPage, setFbPage] = useState(1)

  /* v21 (T4-b) — منشورات صفحة فيسبوك: الظرف DB-first من GET /api/posts
   * (نفس نمط /api/ads/accounts في v19): {items, total, page, per_page,
   * has_next, source, synced, sync_attempted, sync_error}. المزامنة الحية
   * best-effort داخل نافذة 30ث — synced=false وحدها لا تعني فشلاً (قد
   * تكون تخطياً مقصوداً للنافذة)، لذا الشارة الصفراء تظهر فقط عند
   * synced=false && sync_attempted=true (المزامنة جرت فعلاً وفشلت).
   * قبل هذا القسم كان فشل المزامنة صامتاً 100%: قسم فارغ بلا شرح
   * (عيب المتصفح T2-a — «الصمت» كان العرَض رقم 1 للمستخدم). */
  const {
    data: fbEnvelope,
    isLoading: fbLoading,
    isError: fbIsError,
    error: fbError,
    refetch: refetchFb,
  } = useQuery({
    queryKey: ["fb-posts", fbPage],
    queryFn: async () => {
      /* v25 (W-07): صفحة 1 بلا معامل (الافتراضي الخلفي نفسه — يبقي عقد
       * الاستهلاك الحالي)، والأعلى تحمل page صراحةً. */
      const res = await apiFetch(fbPage === 1 ? "/api/posts" : `/api/posts?page=${fbPage}`)
      if (!res.ok) throw new Error(`فشل تحميل منشورات فيسبوك (${res.status})`)
      return unwrapApi<PostsResponse>(res)
    },
    /* v25 (W-07): تبديل الصفحة يُبقي الصفوف السابقة معروضة (بهتة
     * isFetching) بدل وميض الهيكل — نمط admin/support v24-C3. */
    placeholderData: (prev) => prev,
    retry: 1,
  })
  const fbPosts = fbEnvelope?.items ?? []
  const syncFailed = fbEnvelope?.synced === false && fbEnvelope?.sync_attempted === true
  /* v25 (W-07): المؤشرات من الظرف — الصفحة الفعلية من data.page وعدد
   * الصفحات من total/per_page (عقد audience/leads نفسه).
   * r132 (A8 F-SB-1): both now feed the canonical TablePagination — the
   * envelope's has_next was only the hand-rolled «التالي» disabled source
   * and is derived server-side from the SAME total (facebook_routes.py:1064),
   * so totalPages is the exact equivalent for the numbered window. */
  const fbShownPage = fbEnvelope?.page ?? fbPage
  const fbTotalPages = Math.max(1, Math.ceil((fbEnvelope?.total ?? 0) / (fbEnvelope?.per_page ?? 10)))

  /* v25 (W-14): 30s → استطلاع مرئي — المؤقّت يتوقف تماماً في تبويب الخلفية
   * (false) ويعود فور العودة مع تجديد فوري متى تقادمت البيانات. */
  const draftsRefetchInterval = usePollingWhenVisible(30_000, DRAFTS_KEY)
  const { data: posts = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: DRAFTS_KEY,
    queryFn: () => apiFetch("/api/scheduled-posts").then(unwrapApi<ScheduledPost[]>),
    refetchInterval: draftsRefetchInterval,
    retry: 1,
  })
  // v4 §2.5 — API failure previously rendered as "لا توجد منشورات بعد"
  // (data looked empty instead of broken)

  const createMut = useMutation({
    mutationFn: (message: string) =>
      apiFetch("/api/scheduled-posts", {
        method: "POST", body: new URLSearchParams({ message }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] })
      setNewMessage("")
      brandedToast.success("تم إنشاء المنشور")
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل إنشاء المنشور"),
  })

  const publishMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/scheduled-posts/${id}/publish`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] })
      /* v24-C2 (task 3): نُفّذ النشر — أعد عنقود الإجراءات لوضعه الطبيعي */
      setConfirmPublishId(null)
      brandedToast.success("تم النشر على فيسبوك")
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل النشر"),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/scheduled-posts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] })
      /* v24-C2 (task 3): نُفّذ الحذف — أعد عنقود الإجراءات لوضعه الطبيعي */
      setConfirmDeleteId(null)
      brandedToast.success("تم حذف المنشور")
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل الحذف"),
  })

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي. */}
      <PageHeader
        icon={<Newspaper className="size-4" />}
        title="المنشورات"
        subtitle="إدارة ونشر المنشورات"
        compact
      />

      {/* D4-بند2 → r131-F8 (task #12): the content column rides the canonical
          1200 token (was max-w-5xl 1024). */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-(--marketing-max-w) mx-auto w-full">
        <Card>
          <CardContent className="p-4">
            {/* r131-F8 (A4 P1-1c): the raw composer textarea (rounded-xl +
                hand-rolled ring + md:text-sm) rides the shared Textarea
                recipe — 16px floor, r-md, halo; dir=auto built in. */}
            <Textarea
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="اكتب منشوراً جديداً…"
              aria-label="نص المنشور"
              rows={3}
            />
            <div className="flex justify-end mt-3">
              {/* v17-E-F3 (D1 §5.6): loading prop + «جارٍ النشر…» (mirror:
                  support:341-349 / marketing:218) — the button was disabled
                  only, with no in-flight affordance. */}
              <Button
                onClick={() => { if (newMessage.trim()) createMut.mutate(newMessage.trim()) }}
                disabled={!newMessage.trim() || createMut.isPending}
                loading={createMut.isPending}
              >
                <Send className="size-4 rtl:-scale-x-100" /> {createMut.isPending ? "جارٍ النشر…" : "نشر"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* v21 (T4-b) — قسم منشورات فيسبوك المُزامَنة: الصفحة لم تكن تُستهلك
            GET /api/posts إطلاقاً (المسودات المحلية فقط) — منشورات الصفحة
            الحقيقية لم تُعرض يوماً، وفشل المزامنة ظلّ صامتاً (T2-a). */}
        <section className="space-y-3" aria-labelledby="fb-posts-heading">
          <h2 id="fb-posts-heading" className="text-sm font-bold">منشورات فيسبوك</h2>
          {fbLoading ? (
            /* r131-F8 (A4 P1-2): pulse → .skeleton slabs. */
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <Card key={i}><CardContent className="p-4 space-y-2">
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/3 rounded" />
                </CardContent></Card>
              ))}
            </div>
          ) : fbIsError ? (
            /* r131-F8 (A4 P2-8): bare-AlertCircle error → the canonical .state family. */
            <div className="state state-danger py-8" role="alert">
              <div className="state-icon" aria-hidden="true">
                <AlertCircle />
              </div>
              <p className="state-title">فشل تحميل منشورات فيسبوك</p>
              <p className="state-desc">{(fbError as Error)?.message || "تعذر الاتصال، تحقق من الإنترنت ثم أعد المحاولة"}</p>
              <Button size="sm" variant="outline" onClick={() => refetchFb()}><RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {syncFailed && (
                /* v19 ads-page pattern verbatim (dashboard/ads:87-94): stored
                 * rows serve, but honestly — same amber classes, same WifiOff
                 * icon, same copy. Gated on synced=false && sync_attempted=true
                 * ONLY (a bare synced=false can be the 30s throttle skip — not
                 * a failure, no banner). v21: sync_error (English diagnostic)
                 * rides as the title tooltip, never as main Arabic text. */
                <div
                  className="flex items-center gap-2 text-2xs text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2"
                  title={fbEnvelope?.sync_error || undefined}
                >
                  <WifiOff className="size-3.5 shrink-0" />
                  <span>فشل التحديث من فيسبوك — يتم عرض آخر بيانات محفوظة.</span>
                </div>
              )}
              {fbPosts.length === 0 ? (
                <EmptyState
                  icon={Newspaper}
                  size="sm"
                  title="لا توجد منشورات على صفحتك بعد"
                  description="انشر على صفحتك — ستظهر منشوراتك من فيسبوك هنا مع تفاعلاتها."
                />
              ) : (
                fbPosts.map(p => (
                  <Card key={p.id}>
                    <CardContent className="p-4">
                      {/* live Facebook text — dir="auto" isolates mixed
                          Arabic/Latin post bodies (v14-E5 pattern). */}
                      <p className="text-sm mb-3" dir="auto">{p.message || "—"}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{formatDate(p.created_time)}</span>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1" title="إعجابات">
                            <ThumbsUp className="size-3" aria-hidden="true" />{formatNumber(p.likes ?? 0)}
                          </span>
                          <span className="flex items-center gap-1" title="تعليقات">
                            <MessageSquare className="size-3" aria-hidden="true" />{formatNumber(p.comments ?? 0)}
                          </span>
                          <span className="flex items-center gap-1" title="مشاركات">
                            <Share2 className="size-3" aria-hidden="true" />{formatNumber(p.shares ?? 0)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}

              {/* r132 (A8 F-SB-1): the «السابق/التالي» link row → the canonical
                  numbered TablePagination footer (window from the envelope's
                  total/per_page — the exact math admin/support uses; the
                  sr-only status line stays as the polite live region,
                  admin/support:514 twin). */}
              {!fbLoading && !fbIsError && fbPosts.length > 0 && (
                <>
                  <p className="sr-only" role="status">
                    صفحة {formatNumber(fbShownPage)} من {formatNumber(fbTotalPages)}
                  </p>
                  <TablePagination
                    page={fbShownPage}
                    totalPages={fbTotalPages}
                    total={fbEnvelope?.total ?? 0}
                    onPageChange={setFbPage}
                    unitLabel="منشور"
                  />
                </>
              )}
            </div>
          )}
        </section>

        {/* v21 (T4-b): المسودات المحلية والمجدولة — القسم الأصلي للصفحة تحت
            عنوان صريح يفصله عن منشورات فيسبوك أعلاه. */}
        <section className="space-y-3" aria-labelledby="drafts-heading">
          <h2 id="drafts-heading" className="text-sm font-bold">المسودات والمجدولة</h2>
          {isLoading ? (
          /* r131-F8 (A4 P1-2): pulse → .skeleton slabs. */
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <Card key={i}><CardContent className="p-4 space-y-2">
                <div className="skeleton h-4 w-3/4 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </CardContent></Card>
            ))}
          </div>
        ) : isError ? (
          /* r131-F8 (A4 P2-8): bare-AlertCircle error → the canonical .state family. */
          <div className="state state-danger py-12" role="alert">
            <div className="state-icon" aria-hidden="true">
              <AlertCircle />
            </div>
            <p className="state-title">فشل تحميل المنشورات</p>
            <p className="state-desc">{(error as Error)?.message || "تعذر الاتصال، تحقق من الإنترنت ثم أعد المحاولة"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة</Button>
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={Newspaper}
            size="sm"
            title="لا توجد مسودات بعد"
            description="اكتب أول منشور في النموذج أعلاه واضغط نشر — ستظهر مسوداتك هنا مع حالتها."
          />
        ) : (
          <div className="space-y-3">
            {posts.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <p className="text-sm mb-2">{p.message}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {/* r131-F8 (A4 P2-3): hand-rolled status chip → Badge.
                          r127-F5a: status is optional on ScheduledPost — `?? ""`
                          indexes safely; the `|| p.status` fallback is unchanged. */}
                      <Badge variant={
                        p.status === "published" ? "success" :
                        p.status === "scheduled" ? "info" :
                        "secondary"
                      }>{POST_STATUS_LABELS[p.status ?? ""] || p.status}</Badge>
                      {p.scheduled_at && <span>{formatDate(p.scheduled_at)}</span>}
                    </div>
                    {/* v24-C2 (task 3 / A3-P2): أثناء التأكيد يستبدل العنقود
                        كاملاً بأزرار «تأكيد … / إلغاء» (44px، بلا ازدحام على
                        الشاشات الضيقة) — نفس بصر sequences/team. */}
                    <div className="flex gap-1">
                      {confirmPublishId === p.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => publishMut.mutate(p.id)}
                            disabled={publishMut.isPending && publishMut.variables === p.id}
                            loading={publishMut.isPending && publishMut.variables === p.id}
                          >
                            <Send className="size-3 rtl:-scale-x-100" aria-hidden="true" /> تأكيد النشر
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmPublishId(null)}
                            aria-label="إلغاء نشر المنشور"
                          >
                            إلغاء
                          </Button>
                        </>
                      ) : confirmDeleteId === p.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteMut.mutate(p.id)}
                            disabled={deleteMut.isPending && deleteMut.variables === p.id}
                            loading={deleteMut.isPending && deleteMut.variables === p.id}
                          >
                            <Trash2 className="size-3" aria-hidden="true" /> تأكيد الحذف
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteId(null)}
                            aria-label="إلغاء حذف المنشور"
                          >
                            إلغاء
                          </Button>
                        </>
                      ) : (
                        <>
                          {p.status !== "published" && (
                            <Button size="sm" variant="ghost" onClick={() => setConfirmPublishId(p.id)} aria-label="نشر المنشور الآن">
                              <Send className="size-3 rtl:-scale-x-100" aria-hidden="true" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(p.id)} className="hover:text-destructive" aria-label="حذف المنشور">
                            <Trash2 className="size-3" aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        </section>
      </div>
    </div>
  )
}
