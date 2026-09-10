"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { Newspaper, Send, Trash2, AlertCircle, RefreshCw, WifiOff, ThumbsUp, MessageSquare, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { unwrapApi } from "@/lib/api"
import type { ScheduledPost, PostsResponse } from "@/lib/types"
import { formatDate, formatNumber } from "@/lib/format"

const POST_STATUS_LABELS: Record<string, string> = {
  published: "منشور", scheduled: "مجدول", draft: "مسودة", failed: "فاشل",
}

export default function PostsPage() {
  const [newMessage, setNewMessage] = useState("")
  const queryClient = useQueryClient()

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
    queryKey: ["fb-posts"],
    queryFn: async () => {
      const res = await apiFetch("/api/posts")
      if (!res.ok) throw new Error(`فشل تحميل منشورات فيسبوك (${res.status})`)
      return unwrapApi<PostsResponse>(res)
    },
    retry: 1,
  })
  const fbPosts = fbEnvelope?.items ?? []
  const syncFailed = fbEnvelope?.synced === false && fbEnvelope?.sync_attempted === true

  const { data: posts = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["scheduled-posts"],
    queryFn: () => apiFetch("/api/scheduled-posts").then(unwrapApi<ScheduledPost[]>),
    refetchInterval: 30000,
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
      brandedToast.success("تم النشر على فيسبوك")
    },
    onError: (e: Error) => brandedToast.error(e.message || "فشل النشر"),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/scheduled-posts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] })
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

      {/* D4-بند2 — قرار سقف العرض الموحد: max-w-5xl (1024px) + mx-auto. */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
        <Card>
          <CardContent className="p-4">
            <textarea
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="اكتب منشوراً جديداً…"
              aria-label="نص المنشور"
              /* v16-E3 (D1 C3): raw textarea bypasses the shared Textarea
                  seam — dir="auto" isolates mixed Arabic/Latin post text. */
              dir="auto"
              className="w-full min-h-[100px] rounded-xl border border-input bg-background p-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent-foreground/30 resize-none"
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
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <Card key={i}><CardContent className="p-4 animate-pulse space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                </CardContent></Card>
              ))}
            </div>
          ) : fbIsError ? (
            <div className="text-center py-8">
              <AlertCircle className="size-10 mx-auto mb-3 text-destructive/50" />
              <p className="text-sm font-bold mb-1">فشل تحميل منشورات فيسبوك</p>
              <p className="text-xs text-muted-foreground mb-4">{(fbError as Error)?.message || "تعذر الاتصال"}</p>
              <Button size="sm" variant="outline" onClick={() => refetchFb()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
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
            </div>
          )}
        </section>

        {/* v21 (T4-b): المسودات المحلية والمجدولة — القسم الأصلي للصفحة تحت
            عنوان صريح يفصله عن منشورات فيسبوك أعلاه. */}
        <section className="space-y-3" aria-labelledby="drafts-heading">
          <h2 id="drafts-heading" className="text-sm font-bold">المسودات والمجدولة</h2>
          {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <Card key={i}><CardContent className="p-4 animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </CardContent></Card>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-12">
            <AlertCircle className="size-12 mx-auto mb-3 text-destructive/50" />
            <p className="text-sm font-bold mb-1">فشل تحميل المنشورات</p>
            <p className="text-xs text-muted-foreground mb-4">{(error as Error)?.message || "تعذر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>
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
                      <span className={`px-2 py-0.5 rounded-full ${
                        p.status === "published" ? "bg-success/15 text-success" :
                        p.status === "scheduled" ? "bg-info/15 text-info" :
                        "bg-muted text-muted-foreground"
                      }`}>{POST_STATUS_LABELS[p.status] || p.status}</span>
                      {p.scheduled_at && <span>{formatDate(p.scheduled_at)}</span>}
                    </div>
                    <div className="flex gap-1">
                      {p.status !== "published" && (
                        <Button size="sm" variant="ghost" onClick={() => publishMut.mutate(p.id)} disabled={publishMut.isPending && publishMut.variables === p.id} aria-label="نشر المنشور الآن">
                          <Send className="size-3 rtl:-scale-x-100" aria-hidden="true" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(p.id)} disabled={deleteMut.isPending && deleteMut.variables === p.id} aria-label="حذف المنشور">
                        <Trash2 className="size-3" aria-hidden="true" />
                      </Button>
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
