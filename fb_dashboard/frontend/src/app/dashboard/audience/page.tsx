"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { Users, Activity, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { unwrapApi } from "@/lib/api"
import type { AnalyticsOverview, Paginated, Subscriber, TopCommenter } from "@/lib/types"
import { countPhrase, formatDateOnly, formatNumber } from "@/lib/format"

/* v25 (W-05): عقد /api/subscribers (routers/subscribers_tags_routes.py:20 +
 * subscriber_engine.search) — page ge=1 وper_page ge=1 le=200 بغلاف
 * {items,total,page,per_page}؛ الصفحة كانت تجلب أول 10 مشتركين فقط إلى
 * الأبد بلا أي سبيل للوصول لما بعدها. */
const SUBS_PER_PAGE = 10

export default function AudiencePage() {
  /* v25 (W-05): صفحة المشتركين الحالية — تتبع مفتاح الاستعلام فتُجلب
   * النافذة المطلوبة من الخلفية. */
  const [subsPage, setSubsPage] = useState(1)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => apiFetch("/api/analytics/overview?days=30").then(unwrapApi<AnalyticsOverview>),
    refetchInterval: 60000,
  })
  const topQuery = useQuery({
    queryKey: ["top-commenters"],
    queryFn: () => apiFetch("/api/analytics/top-commenters?limit=5").then(unwrapApi<TopCommenter[]>),
    refetchInterval: 60000,
  })
  // v4 §7.25 — real subscriber list (feed: messenger events)
  const subsQuery = useQuery({
    queryKey: ["subscribers", "audience", subsPage],
    queryFn: () =>
      apiFetch(`/api/subscribers?page=${subsPage}&per_page=${SUBS_PER_PAGE}`).then(
        unwrapApi<Paginated<Subscriber>>,
      ),
    /* v25 (W-05): تبديل الصفحة يُبقي الصفوف السابقة معروضة (بهتة isFetching
     * عبر المؤشر أدناه) بدل وميض الهيكل — نمط admin/support v24-C3. */
    placeholderData: (prev) => prev,
    refetchInterval: 60000,
    retry: 1,
  })
  /* v25 (W-05): المؤشرات من الظرف نفسه — الصفحة الفعلية من data.page (تحمي
   * من انزياح الحد الأدنى)، وعدد الصفحات من total/per_page. */
  const subsTotal = subsQuery.data?.total ?? 0
  const shownPage = subsQuery.data?.page ?? subsPage
  const totalPages = Math.max(1, Math.ceil(subsTotal / (subsQuery.data?.per_page ?? SUBS_PER_PAGE)))
  const hasNextPage = shownPage < totalPages

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي. */}
      <PageHeader
        icon={<Users className="size-4" />}
        title="الجمهور"
        subtitle="تحليل الجمهور ومتابعي الصفحة"
        compact
      />

      {/* D4-بند2 — قرار سقف العرض الموحد: max-w-5xl (1024px) + mx-auto. */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
        {isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-destructive/50" />
            <h2 className="text-sm font-bold mb-1">تعذر تحميل بيانات الجمهور</h2>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : (<>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="size-8 rounded-lg bg-accent-foreground/10 flex items-center justify-center mb-2">
                <Users className="size-4 text-muted-foreground" />
              </div>
              {/* v17-E-F3 (D1 §5.5): KPI value is a skeleton while the overview
                  loads (mirror: dashboard/page.tsx:52-58) — h-8 matches
                  text-2xl's line box so the card height never shifts (the
                  static label stays visible; background refetches keep the
                  previous value — no flicker). */}
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{data?.fan_count ?? "—"}</p>
              )}
              <p className="text-xs text-muted-foreground">متابعو الصفحة</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="size-8 rounded-lg bg-info-soft flex items-center justify-center mb-2">
                <Activity className="size-4 text-info" />
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{data?.total_replies ?? "—"}</p>
              )}
              <p className="text-xs text-muted-foreground">إجمالي التفاعل</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="size-8 rounded-lg bg-success-soft flex items-center justify-center mb-2">
                <Activity className="size-4 text-success" />
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{data?.today_replies ?? "—"}</p>
              )}
              <p className="text-xs text-muted-foreground">نشاط اليوم</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4">
            <h3 className="font-bold text-sm mb-2">المعلقون الأكثر نشاطاً</h3>
            {/* v4 §2.5 — honest error state + gate on topQuery's own flags
                (the old gate used the overview query's isLoading → premature
                empty state while top commenters were still loading) */}
            {isLoading || topQuery.isLoading ? (
              <div className="space-y-2">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-5" />)}
              </div>
            ) : topQuery.isError ? (
              <p className="text-sm text-muted-foreground text-center py-4">تعذر تحميل المعلقين — <button className="underline outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded" onClick={() => topQuery.refetch()}>إعادة المحاولة</button></p>
            ) : (topQuery.data?.length || 0) > 0 ? (
              <div className="space-y-2">
                {topQuery.data.map((c, i) => (
                  /* v9-B12 — ranked list: positional keys corrupt React's
                      diffing when the ranking shifts; commenter_id is stable */
                  <div key={c.commenter_id ?? c.name ?? i} className="flex items-center justify-between text-sm py-1 border-b border-border last:border-0">
                    <span>{c.name || `معلق #${c.commenter_id}`}</span>
                    <span className="text-muted-foreground">{countPhrase(c.count, "تعليق", "تعليقين", "تعليقات")}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Activity} size="sm" title="لا توجد بيانات بعد" description="ستظهر أسماء المعلقين الأكثر تفاعلاً هنا مع وصول التعليقات على منشوراتك." />
            )}
          </CardContent>
        </Card>

        {/* v4 §7.25 — the REAL subscriber list. /api/subscribers existed but no
            UI consumed it: the audience page never showed actual subscribers
            (and the table was empty forever since nothing ingested it — now
            messenger events upsert subscribers, see messenger_service §5.17). */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">
                المشتركون ({subsQuery.data?.total ?? 0})
              </h3>
              <span className="text-3xs text-muted-foreground">
                يتغذّى تلقائياً من محادثات الماسنجر
              </span>
            </div>
            {subsQuery.isLoading ? (
              <div className="space-y-3">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex items-center gap-2.5">
                    <Skeleton className="size-7 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-1/3" />
                      <Skeleton className="h-2.5 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : subsQuery.isError ? (
              /* v17-E-F3 (D1 §5.5): mirror of the top-commenters error above
                 — inline retry link (subsQuery.refetch) instead of hanging
                 text-only error. */
              <p className="text-sm text-muted-foreground text-center py-4">تعذر تحميل المشتركين — <button className="underline outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded" onClick={() => subsQuery.refetch()}>إعادة المحاولة</button></p>
            ) : (subsQuery.data?.items?.length || 0) === 0 ? (
              <EmptyState
                icon={Users}
                size="sm"
                title="لا يوجد مشتركون بعد"
                description="أول من يراسل صفحتك عبر الماسنجر سيظهر هنا تلقائياً."
              />
            ) : (
              <div className="space-y-1.5">
                {(subsQuery.data?.items || []).map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="size-7 rounded-full bg-accent-foreground/10 text-accent-foreground text-3xs font-bold flex items-center justify-center shrink-0">
                        {(s.first_name || s.name || "؟").slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm truncate">{s.name || `مشترك #${s.id}`}</p>
                        <p className="text-3xs text-muted-foreground truncate">
                          {s.platform === "messenger" ? "ماسنجر" : s.platform}
                          {s.last_interaction_at ? ` · آخر تفاعل ${formatDateOnly(s.last_interaction_at)}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className={`text-3xs px-2 py-0.5 rounded-full shrink-0 ${
                      s.status === "active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                    }`}>
                      {s.status === "active" ? "نشط" : "غير نشط"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* v25 (W-05): مِرقاة الصفحات — القائمة كانت محصورة في أول 10
                مشتركين؛ السابق/التالي + «صفحة X من Y» من الظرف الفعلي
                (نمط admin/support v24-C3: DirectionalIcon chevrons). تُخفى
                عند التحميل/الخطأ/الفراغ. */}
            {!subsQuery.isLoading && !subsQuery.isError && subsTotal > 0 && (
              <div className="flex items-center justify-center gap-3 pt-3 mt-1 border-t border-border/60">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubsPage((p) => Math.max(1, p - 1))}
                  disabled={subsPage <= 1}
                  aria-label="الصفحة السابقة"
                >
                  <DirectionalIcon semanticDirection="back" variant="chevron" className="size-4" /> السابق
                </Button>
                <span className="text-xs text-muted-foreground" role="status">
                  صفحة {formatNumber(shownPage)} من {formatNumber(totalPages)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubsPage((p) => p + 1)}
                  disabled={!hasNextPage}
                  aria-label="الصفحة التالية"
                >
                  التالي <DirectionalIcon semanticDirection="forward" variant="chevron" className="size-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </>
      )}
      </div>
    </div>
  )
}
