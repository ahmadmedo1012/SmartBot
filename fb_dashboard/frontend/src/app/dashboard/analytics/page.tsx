"use client"

import dynamic from "next/dynamic"
import { useQuery } from "@tanstack/react-query"
import { apiFetch, ApiError } from "@/lib/csrf-client"
import { countPhrase, toArabicNumber } from "@/lib/format"
import {
  BarChart3, MessageSquare, Activity, Clock, Users, AlertCircle, RefreshCw, Smile,
  TrendingUp, Grid3x3, Flame, Scale, Crown, Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/EmptyState"
import { ChartCard } from "@/components/shared/ChartCard"
import { unwrapApi } from "@/lib/api"
import type { AnalyticsOverview } from "@/lib/types"
/* v9-B14 — lazy recharts: the direct import pulled the ~344KB recharts chunk
 * into this route's first-load JS; the lazy barrel defers it until render. */
import { ActivityBarChart, ComparisonBars } from "@/components/charts/lazy"
/* v17-E-F10 (D6-8) — خريطة النشاط CSS grid خالصة (بلا recharts): استيراد
 * مباشر بلا كلفة حزمة؛ المخطط الخطي الجديد lazy محليًا أدناه. */
import { ActivityHeatmap, WEEKDAY_LABELS } from "@/components/charts/ActivityHeatmap"
import type { HeatmapCell } from "@/components/charts/ActivityHeatmap"

/* v17-E-F10 (D6-8) — lazy boundary محلي للمخطط الخطي الجديد: نفس عقد
 * charts/lazy.tsx حرفيًا (next/dynamic ssr:false + سكلتون بنفس الارتفاع
 * حتى لا يهتز التخطيط أثناء سحب قطعة recharts) — دون لمس الملف المشترك
 * (خارج ملكية هذه الموجة). */
const TrendLineChart = dynamic(
  () => import("@/components/charts/TrendLineChart").then((m) => m.TrendLineChart),
  { ssr: false, loading: () => <div className="h-44 rounded-xl bg-muted/30 animate-pulse" aria-hidden="true" /> },
)

const SENTIMENT_LABELS: Record<string, string> = {
  positive: "إيجابي", negative: "سلبي", neutral: "محايد", mixed: "مختلط",
}

/* ══════════════════════════════════════════════════════════════════════════
 * v17-E-F10 (D6-8 + D1-P3) — التحليلات المتقدمة
 *
 * جرد endpoints الجاهزة فعليًا (rg "@router" fb_dashboard/routers/analytics.py):
 *   GET /api/analytics/daily-trend        → [{date, replies}]
 *   GET /api/analytics/hourly-heatmap     → [{hour, day, count}]
 *   GET /api/analytics/peak-hour          → {peak_hour: number|null}
 *   GET /api/analytics/top-rules          → [{rule_id, name, count, percentage}]
 *   GET /api/analytics/period-comparison  → {replies_before, replies_now, change_pct}
 * (sentiment-trend وtop-commenters جاهزان أيضًا لكن خارج بنود المهمة —
 *  موثقان في تقرير v17-E-F10.)
 *
 * عقد كل قسم: ChartCard (سكلتون/فراغ/خطأ بإعادة محاولة) + عربية +
 * countPhrase للعدادات + 403 خطة → حالة «متاحة في Premium» صادقة.
 * ملاحظة عقد: هذه المسارات بلا بوابة خطة اليوم (has_analytics_advanced
 * زخرفي بلا إنفاذ — D6 §3)؛ فرع الـ403 موجود للأمانة المستقبلية إن
 * أُضيف التقييد لاحقًا.
 * ══════════════════════════════════════════════════════════════════════════ */

const WINDOW_DAYS = 30

/** صف /api/analytics/daily-trend. */
interface DailyTrendRow {
  date: string
  replies: number
}

/** صف /api/analytics/top-rules (بنسبة الحصة من المحرك). */
interface AdvancedTopRule {
  rule_id?: number | null
  name?: string | null
  count: number
  percentage?: number
}

/** /api/analytics/period-comparison. */
interface PeriodComparison {
  replies_before?: number
  replies_now?: number
  change_pct?: number
}

/** 403 خطة؟ (ApiError يرفع detail العربية — csrf-client) */
function isPlanLocked(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403
}

/** حالة «متاحة في Premium» الصادقة — بديل بطاقة الخطأ عند 403 الخطة. */
function PremiumLockBody({ feature }: { feature: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="size-11 rounded-2xl border border-warning/20 bg-warning/10 flex items-center justify-center">
        <Crown className="size-5 text-warning" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-bold">{feature} — متاحة في Premium</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
          خطتك الحالية لا تتضمن هذه الميزة. رقِّ خطتك من صفحة الاشتراك للاطلاع عليها.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={() => { window.location.href = "/subscribe" }}>
        <Crown className="size-3.5" /> ترقية الخطة
      </Button>
    </div>
  )
}

/* ── 1) الاتجاه اليومي (مخطط خطي) ── */
function DailyTrendSection() {
  const q = useQuery({
    queryKey: ["analytics-daily-trend"],
    queryFn: () => apiFetch(`/api/analytics/daily-trend?days=${WINDOW_DAYS}`).then(unwrapApi<DailyTrendRow[]>),
    refetchInterval: 60000,
    retry: 1,
  })
  const rows = q.data ?? []
  const locked = q.isError && isPlanLocked(q.error)
  const total = rows.reduce((s, r) => s + (r.replies ?? 0), 0)
  return (
    <ChartCard
      title="الاتجاه اليومي للردود"
      description={`منحنى عدد الردود المرسلة يوميًا خلال آخر ${toArabicNumber(WINDOW_DAYS)} يومًا`}
      icon={TrendingUp}
      loading={q.isLoading}
      error={q.isError && !locked ? ((q.error as Error)?.message || "تعذر تحميل الاتجاه اليومي") : null}
      onRetry={() => q.refetch()}
      empty={!q.isError && !q.isLoading && rows.length === 0}
      emptyTitle="لا توجد بيانات بعد"
      emptyDescription="سيظهر منحنى الردود اليومية هنا بعد أول تفاعل على صفحتك."
      summary={!locked && rows.length > 0
        ? `منحنى خطي للردود اليومية خلال آخر ${WINDOW_DAYS} يومًا — إجمالي ${countPhrase(total, "رد", "ردين", "ردود")}`
        : undefined}
    >
      {locked ? (
        <PremiumLockBody feature="الاتجاه اليومي" />
      ) : (
        <TrendLineChart
          height={180}
          data={rows.map((r) => ({ label: r.date.slice(5), value: Number(r.replies) ?? 0, hint: r.date }))}
        />
      )}
    </ChartCard>
  )
}

/* ── 2) خريطة النشاط بالساعة (heatmap CSS grid) ── */
function HeatmapSection() {
  const q = useQuery({
    queryKey: ["analytics-hourly-heatmap"],
    queryFn: () => apiFetch(`/api/analytics/hourly-heatmap?days=${WINDOW_DAYS}`).then(unwrapApi<HeatmapCell[]>),
    refetchInterval: 60000,
    retry: 1,
  })
  const cells = q.data ?? []
  const locked = q.isError && isPlanLocked(q.error)

  /* ملخص sr-only ذو معنى: أكثر خلية كثافة (يوم الأسبوع + الساعة) */
  let summaryText: string | undefined
  if (!locked && cells.length > 0) {
    let best = cells[0]
    for (const c of cells) if ((c.count ?? 0) > (best.count ?? 0)) best = c
    if ((best.count ?? 0) > 0) {
      const wd = new Date(`${best.day}T00:00:00Z`).getUTCDay()
      if (wd >= 0 && wd < 7) {
        summaryText = `خريطة كثافة الردود حسب أيام الأسبوع والساعات بتوقيت غرينتش — أكثرها نشاطًا ${WEEKDAY_LABELS[wd]} الساعة ${best.hour}:00 بواقع ${countPhrase(best.count, "رد", "ردين", "ردود")}`
      }
    }
  }
  return (
    <ChartCard
      title="خريطة النشاط بالساعة"
      description={`كثافة الردود حسب أيام الأسبوع والساعات — بتوقيت غرينتش (UTC) — آخر ${toArabicNumber(WINDOW_DAYS)} يومًا`}
      icon={Grid3x3}
      loading={q.isLoading}
      error={q.isError && !locked ? ((q.error as Error)?.message || "تعذر تحميل خريطة النشاط") : null}
      onRetry={() => q.refetch()}
      empty={!q.isError && !q.isLoading && cells.length === 0}
      emptyTitle="لا توجد بيانات بعد"
      emptyDescription="ستتلون خريطة النشاط هنا فور وصول أول ردود على صفحتك."
      summary={summaryText}
    >
      {locked ? (
        <PremiumLockBody feature="خريطة النشاط بالساعة" />
      ) : (
        <ActivityHeatmap cells={cells} />
      )}
    </ChartCard>
  )
}

/* ── 3) ساعة الذروة (بطاقة صغيرة) ── */
function PeakHourSection() {
  const q = useQuery({
    queryKey: ["analytics-peak-hour"],
    queryFn: () => apiFetch(`/api/analytics/peak-hour?days=${WINDOW_DAYS}`).then(unwrapApi<{ peak_hour: number | null }>),
    refetchInterval: 60000,
    retry: 1,
  })
  const peak = q.data?.peak_hour
  const locked = q.isError && isPlanLocked(q.error)
  return (
    <ChartCard
      title="ساعة الذروة"
      description={`الساعة الأكثر تفاعلًا — بتوقيت غرينتش (UTC) — آخر ${toArabicNumber(WINDOW_DAYS)} يومًا`}
      icon={Clock}
      loading={q.isLoading}
      error={q.isError && !locked ? ((q.error as Error)?.message || "تعذر تحميل ساعة الذروة") : null}
      onRetry={() => q.refetch()}
      /* peak_hour=0 منتصف الليل قيمة صالحة — المقارنة بـ!=null لا ==truthy */
      empty={!q.isError && !q.isLoading && peak == null}
      emptyTitle="لا توجد بيانات بعد"
      emptyDescription="ستظهر ساعة الذروة بعد أول ردود على صفحتك."
      summary={!locked && peak != null ? `ساعة الذروة هي ${peak}:00 بتوقيت غرينتش` : undefined}
    >
      {locked ? (
        <PremiumLockBody feature="ساعة الذروة" />
      ) : peak != null ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6">
          <p className="text-5xl font-bold tabular-nums" dir="ltr">{String(peak).padStart(2, "0")}:00</p>
          <p className="text-xs text-muted-foreground">أكثر ساعة يسجّل فيها جمهورك تفاعلًا مع صفحتك</p>
        </div>
      ) : null}
    </ChartCard>
  )
}

/* ── 4) أكثر القواعد تشغيلًا (قائمة بحصص) ── */
function TopRulesSection() {
  const q = useQuery({
    queryKey: ["analytics-top-rules"],
    queryFn: () => apiFetch(`/api/analytics/top-rules?days=${WINDOW_DAYS}&limit=10`).then(unwrapApi<AdvancedTopRule[]>),
    refetchInterval: 60000,
    retry: 1,
  })
  const rules = q.data ?? []
  const locked = q.isError && isPlanLocked(q.error)
  const topShare = rules.reduce((m, r) => Math.max(m, r.percentage ?? 0), 0)
  const firstName = rules[0]?.name || (rules[0]?.rule_id != null ? `قاعدة #${rules[0].rule_id}` : "")
  return (
    <ChartCard
      title="أكثر القواعد تشغيلًا"
      description={`القواعد التي أطلقت أكبر عدد من الردود ونسبتها من الإجمالي — آخر ${toArabicNumber(WINDOW_DAYS)} يومًا`}
      icon={Flame}
      loading={q.isLoading}
      error={q.isError && !locked ? ((q.error as Error)?.message || "تعذر تحميل أكثر القواعد تشغيلًا") : null}
      onRetry={() => q.refetch()}
      empty={!q.isError && !q.isLoading && rules.length === 0}
      emptyTitle="لا توجد قواعد بعد"
      emptyDescription="أنشئ قواعد رد من صفحة الردود التلقائية وستظهر الأكثر تشغيلًا هنا."
      summary={!locked && rules.length > 0
        ? `ترتيب أكثر القواعد تشغيلًا — الأولى ${firstName} بواقع ${countPhrase(rules[0]?.count ?? 0, "رد", "ردين", "ردود")}`
        : undefined}
    >
      {locked ? (
        <PremiumLockBody feature="أكثر القواعد تشغيلًا" />
      ) : (
        <div className="space-y-3">
          {rules.map((r, i) => (
            /* v9-B12 — sorted list: rule_id هو الهوية (المفاتيح الموضعية
               تفسّد diffing عند تغيّر الترتيب) */
            <div
              key={r.rule_id ?? r.name ?? i}
              className="flex items-center gap-3"
              title={`${r.name || `قاعدة #${r.rule_id}`}: ${countPhrase(r.count, "رد", "ردين", "ردود")} (${toArabicNumber(r.percentage ?? 0)}% من إجمالي الردود)`}
            >
              <span className="flex-1 min-w-0 truncate text-sm" dir="auto">
                {r.name || `قاعدة #${r.rule_id}`}
              </span>
              {/* شريط النسبة نسبةً إلى القاعدة الأولى (وليس % من الإجمالي) */}
              <div className="hidden sm:block w-28 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${topShare > 0 ? Math.min(100, ((r.percentage ?? 0) / topShare) * 100) : 0}%`,
                    background: "var(--primary)",
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-28 text-end">
                {countPhrase(r.count, "رد", "ردين", "ردود")}{r.percentage != null ? ` · ${toArabicNumber(r.percentage)}%` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  )
}

/* ── 5) مقارنة الفترات ── */
function PeriodComparisonSection() {
  const q = useQuery({
    queryKey: ["analytics-period-comparison"],
    queryFn: () => apiFetch(`/api/analytics/period-comparison?days=${WINDOW_DAYS}`).then(unwrapApi<PeriodComparison>),
    refetchInterval: 60000,
    retry: 1,
  })
  const d = q.data
  const locked = q.isError && isPlanLocked(q.error)
  const now = d?.replies_now ?? 0
  const before = d?.replies_before ?? 0
  const pct = d?.change_pct ?? 0
  /* أمانة: change_pct=0 عندما لا توجد فترة سابقة للمقارنة
     (analytics_engine._pct_change) — لا نعرضها «بلا تغيير» كذبًا. */
  const noBaseline = before === 0
  return (
    <ChartCard
      title="مقارنة الفترات"
      description={`آخر ${toArabicNumber(WINDOW_DAYS)} يومًا مقابل ${toArabicNumber(WINDOW_DAYS)} يومًا قبلها`}
      icon={Scale}
      loading={q.isLoading}
      error={q.isError && !locked ? ((q.error as Error)?.message || "تعذر تحميل مقارنة الفترات") : null}
      onRetry={() => q.refetch()}
      empty={!q.isError && !q.isLoading && d !== undefined && now === 0 && before === 0}
      emptyTitle="لا توجد بيانات بعد"
      emptyDescription="ستظهر مقارنة الفترات هنا بعد تراكم ردود على صفحتك."
      summary={!locked && d
        ? `مقارنة آخر ${WINDOW_DAYS} يومًا (${countPhrase(now, "رد", "ردين", "ردود")}) بالفترة السابقة (${countPhrase(before, "رد", "ردين", "ردود")})`
        : undefined}
    >
      {locked ? (
        <PremiumLockBody feature="مقارنة الفترات" />
      ) : d ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border/60 p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">الفترة الحالية</p>
            <p className="text-2xl font-bold tabular-nums">{countPhrase(now, "رد", "ردين", "ردود")}</p>
            <p className="text-2xs text-muted-foreground mt-1">آخر {toArabicNumber(WINDOW_DAYS)} يومًا</p>
          </div>
          <div className="rounded-lg border border-border/60 p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">الفترة السابقة</p>
            <p className="text-2xl font-bold tabular-nums">{countPhrase(before, "رد", "ردين", "ردود")}</p>
            <p className="text-2xs text-muted-foreground mt-1">{toArabicNumber(WINDOW_DAYS)} يومًا قبلها</p>
          </div>
          <div className="rounded-lg border border-border/60 p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">التغيّر</p>
            {noBaseline ? (
              <p className="text-sm font-medium text-muted-foreground mt-2 leading-relaxed">
                أول فترة نشطة — لا أساس سابق للمقارنة
              </p>
            ) : (
              <p
                className={`text-2xl font-bold tabular-nums flex items-center justify-center gap-1 ${pct > 0 ? "text-success" : pct < 0 ? "text-destructive" : "text-muted-foreground"}`}
                dir="ltr"
              >
                <span aria-hidden="true">{pct > 0 ? "↑" : pct < 0 ? "↓" : "—"}</span>
                {toArabicNumber(Math.abs(pct))}%
              </p>
            )}
          </div>
        </div>
      ) : null}
    </ChartCard>
  )
}

export default function AnalyticsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => apiFetch("/api/analytics/overview?days=30").then(unwrapApi<AnalyticsOverview>),
    refetchInterval: 60000,
  })

  const stats = [
    { label: "إجمالي الردود", value: data?.total_replies ?? "—", icon: MessageSquare, color: "bg-accent-foreground/10 text-accent-foreground" },
    { label: "ردود اليوم", value: data?.today_replies ?? "—", icon: Activity, color: "bg-info-soft text-info" },
    { label: "متابعو الصفحة", value: data?.fan_count ?? "—", icon: Users, color: "bg-success-soft text-success" },
    { label: "ذروة النشاط", value: data?.peak_hour != null ? `${data.peak_hour}:00` : "—", icon: Clock, color: "bg-accent text-accent-foreground" },
  ]

  const daily = data?.daily_breakdown ? Object.entries(data.daily_breakdown) : []
  const maxVal = Math.max(...daily.map(([,v]) => v as number), 1)

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1/S4 (D4): manual header → PageHeader — 23/24 dashboard pages unified */}
      <PageHeader
        icon={<BarChart3 className="size-4" />}
        title="التحليلات"
        subtitle="إحصائيات الأداء"
        compact
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {isError ? (
          <div className="text-center py-16">
            <AlertCircle className="size-12 mx-auto mb-3 text-destructive/50" />
            <h2 className="text-sm font-bold mb-1">فشل تحميل التحليلات</h2>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : (<><div className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-busy={isLoading || undefined}>
          {isLoading ? (
            /* v17-E-F10 (D1-P3): كانت بطاقات KPI تعرض «—» أثناء التحميل —
               سكلتون بنفس بنية البطاقة الحقيقية (نمط dashboard/page.tsx:45-63):
               مربع الأيقونة size-8 + سطر القيمة + سطر التسمية، فيحفظ الارتفاع
               (CLS=0) ويُقرأ كتحميل جارٍ لا كقيمة مفقودة. */
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="size-8 rounded-lg" />
                  </div>
                  <Skeleton className="h-7 w-12 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </CardContent>
              </Card>
            ))
          ) : (
          stats.map((s, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`size-8 rounded-lg flex items-center justify-center ${s.color}`}>
                    <s.icon className="size-4" />
                  </div>
                </div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))
          )}
        </div>

        <Card>
          <CardContent className="p-4">
            <h2 className="font-bold text-sm mb-4">الردود اليومية (آخر 30 يوم)</h2>
            {isLoading ? (
              <div className="h-32 bg-muted rounded animate-pulse" />
            ) : daily.length === 0 ? (
              <EmptyState icon={BarChart3} size="sm" title="لا توجد بيانات بعد" description="ستظهر حركة الردود اليومية هنا بعد أول تفاعل على صفحتك." />
            ) : (
              <ActivityBarChart
                height={128}
                summary="مخطط أعمدة للردود اليومية خلال آخر 30 يوماً"
                data={daily.slice(-30).map(([d, v]: [string, unknown]) => ({ label: d, value: Number(v) ?? 0, hint: d }))}
              />
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <h2 className="font-bold text-sm mb-3">أفضل القواعد</h2>
              {data?.top_rules?.length > 0 ? (
                <div className="space-y-2">
                  {data.top_rules.map((r, i) => (
                    /* v9-B12 — sorted list: positional keys corrupt React's
                        diffing when the order shifts; rule_id is the identity */
                    <div key={r.rule_id ?? r.name ?? i} className="flex items-center justify-between text-sm">
                      {/* v4 §7.24 — backend now sends rule names (incl. DM replies) */}
                      <span>{r.name || `القاعدة #${r.rule_id}`}</span>
                      <span className="text-muted-foreground">{countPhrase(r.count, "رد", "ردين", "ردود")}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Activity} size="sm" title="لا توجد قواعد بعد" description="أنشئ قواعد رد من صفحة الردود التلقائية وستظهر الأكثر فاعلية هنا." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h2 className="font-bold text-sm mb-3">توزيع المشاعر</h2>
              {data?.sentiment_distribution && Object.keys(data.sentiment_distribution).length > 0 ? (
                <ComparisonBars
                  summary="أشرطة أفقية تقارن عدد رسائل كل فئة شعور: إيجابي، سلبي، محايد، مختلط"
                  data={Object.entries(data.sentiment_distribution as Record<string, number>).map(([k, v]) => ({ label: SENTIMENT_LABELS[k] || k, value: Number(v) ?? 0 }))}
                />
              ) : (
                <EmptyState icon={Smile} size="sm" title="لا توجد بيانات مشاعر" description="سيُحلَّل شعور التعليقات هنا فور وصول أول تعليق على منشوراتك." />
              )}
            </CardContent>
          </Card>
        </div>
      </>
      )}

        {/* ── v17-E-F10 (D6-8): قسم «تحليلات متقدمة» — تحت الكل ──
            خارج فرع خطأ الـoverview: كل بطاقة تدير حالاتها الثلاث
            بنفسها (سكلتون/فراغ/خطأ بإعادة محاولة) فلا تختفي الأقسام
            السليمة إن فشل استعلام واحد فقط. الحركة دخول تلقائية عبر
            غلاف DashboardShell (لا framer ولا CSS إضافي). */}
        <section aria-labelledby="advanced-analytics-heading" className="space-y-4">
          <div>
            <h2 id="advanced-analytics-heading" className="font-bold text-sm flex items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
              تحليلات متقدمة
            </h2>
            <p className="text-2xs text-muted-foreground mt-1">أنماط نشاط أعمق خلال آخر {toArabicNumber(WINDOW_DAYS)} يومًا</p>
          </div>

          <DailyTrendSection />
          <HeatmapSection />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <PeakHourSection />
            <div className="lg:col-span-2">
              <TopRulesSection />
            </div>
          </div>

          <PeriodComparisonSection />
        </section>
      </div>
    </div>
  )
}
