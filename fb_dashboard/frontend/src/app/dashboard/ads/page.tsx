"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import {
  Target, AlertCircle, RefreshCw, WifiOff, ChevronDown, Megaphone, BarChart3,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { unwrapApi } from "@/lib/api"
import type {
  AdsAccountsResponse, AdsListResponse, AdCampaign, AdItem, AdInsights, AdSet,
} from "@/lib/types"
import { formatNumber, formatMoney, formatDate, formatDateOnly, countPhrase } from "@/lib/format"

/* P18-W4-b — the campaign surface (API-contract-verified, read-only by
 * TRUTH not by laziness): the backend exposes exactly THREE ads endpoints,
 * all GET (facebook_routes.py:1187-1275):
 *   /api/ads/accounts          → DB-first ad-accounts envelope (v19/v21/v22-D2)
 *   /api/ads/campaigns/{id}    → the RAW Graph campaign dicts (+ nested adsets)
 *   /api/ads/ads/{id}          → the RAW Graph ad dicts (+ creative + insights)
 * There are ZERO write paths for ads in fb_dashboard/ (no POST/PATCH/DELETE
 * route, no fb_client campaign write method, no MCP ads tool beyond reads) —
 * creating/pausing campaigns also needs the ads_management permission +
 * Facebook app review + business verification. So this page renders the
 * campaigns and their metrics with the REAL fields the Graph sync re-serves,
 * and documents the management gap honestly instead of faking controls. */

/* Graph campaign/ad status enum → Arabic + the petrol chip register
 * (campaign ACTIVE = lime live-traffic, PAUSED = sand, problems = rose,
 * retired = foam grey — the posts/broadcast status grammar). */
const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "نشطة", cls: "bg-(--c-lime-bg) text-(--c-lime-ink)" },
  PAUSED: { label: "متوقفة مؤقتاً", cls: "bg-(--c-sand-bg) text-(--c-sand-ink)" },
  DELETED: { label: "محذوفة", cls: "bg-(--c-grey-bg) text-(--c-grey-ink)" },
  PENDING_REVIEW: { label: "بانتظار المراجعة", cls: "bg-(--c-sand-bg) text-(--c-sand-ink)" },
  PENDING_PROCESSING: { label: "قيد المعالجة", cls: "bg-(--c-sand-bg) text-(--c-sand-ink)" },
  DISAPPROVED: { label: "مرفوضة", cls: "bg-(--c-rose-bg) text-(--c-rose-ink)" },
  PREAPPROVED: { label: "معتمدة مسبقاً", cls: "bg-(--c-copper-bg) text-(--c-copper-ink)" },
  WITH_ISSUES: { label: "بها مشاكل", cls: "bg-(--c-rose-bg) text-(--c-rose-ink)" },
}

function StatusBadge({ status }: { status?: string }) {
  const key = (status ?? "").toUpperCase()
  const meta = STATUS_LABELS[key]
  if (meta) return <Badge variant="secondary" className={meta.cls}>{meta.label}</Badge>
  /* unknown Graph enum — show the raw code (never a fabricated label). */
  return status ? <Badge variant="secondary" className="bg-(--c-grey-bg) text-(--c-grey-ink)">{status}</Badge> : null
}

/* Graph objective enum → Arabic (OUTCOMES_* modern + legacy names). */
const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOMES_ENGAGEMENT: "تفاعل",
  OUTCOMES_TRAFFIC: "زيارات",
  OUTCOMES_SALES: "مبيعات",
  OUTCOMES_LEAD_GENERATION: "عملاء محتملون",
  OUTCOMES_AWARENESS: "وعي بالعلامة",
  OUTCOMES_APP_PROMOTION: "ترويج تطبيق",
  LINK_CLICKS: "نقرات",
  CONVERSIONS: "تحويلات",
  LEAD_GENERATION: "عملاء محتملون",
  BRAND_AWARENESS: "وعي بالعلامة",
  REACH: "وصول",
  ENGAGEMENT: "تفاعل",
  MESSAGES: "رسائل",
  PAGE_LIKES: "إعجابات الصفحة",
  POST_ENGAGEMENT: "تفاعل المنشورات",
  VIDEO_VIEWS: "مشاهدات فيديو",
  APP_INSTALLS: "تثبيتات التطبيق",
  CATALOG_SALES: "مبيعات الكتالوج",
}

function objectiveLabel(objective?: string): string | null {
  if (!objective) return null
  return OBJECTIVE_LABELS[objective] ?? objective
}

/** Graph nested-edge adsets: {data: [...]} (a bare array tolerated defensively). */
function adsetList(campaign: AdCampaign): AdSet[] {
  if (!campaign.adsets) return []
  return Array.isArray(campaign.adsets) ? campaign.adsets : (campaign.adsets.data ?? [])
}

/** Graph insights nested edge → the first (summary) row, if any. */
function insightsOf(ad: AdItem): AdInsights | null {
  const rows = ad.insights?.data
  return rows && rows.length > 0 ? rows[0] : null
}

/* phase6 r154 (P6-2-d2) — سجل ختم تاريخ الحملة (توأم المنشورات): HH:MM
 * مونو (dir="ltr"، tabular-nums)؛ التاريخ العربي الكامل في الـtitle. */
function timeStamp(t: string | null | undefined): string {
  if (!t) return ""
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
}

/* ── the per-account expansion: campaigns + ads (the real read surface) ── */

function AccountDetail({ accountId, currency }: { accountId: string; currency?: string }) {
  /* v19 Step 2 contracts verbatim: /api/ads/campaigns/{id} and /api/ads/ads/{id}
   * answer {items, source, synced} — items are the RAW Graph dicts the DB
   * sync persists (payload_json), so the fields below are the live shapes. */
  const campaignsQuery = useQuery({
    queryKey: ["ads-campaigns", accountId],
    queryFn: async () => {
      const res = await apiFetch(`/api/ads/campaigns/${encodeURIComponent(accountId)}`)
      if (!res.ok) throw new Error(`تعذّر تحميل الحملات (${res.status})`)
      return unwrapApi<AdsListResponse & { items: AdCampaign[] }>(res)
    },
    retry: 1,
  })
  const adsQuery = useQuery({
    queryKey: ["ads-items", accountId],
    queryFn: async () => {
      const res = await apiFetch(`/api/ads/ads/${encodeURIComponent(accountId)}`)
      if (!res.ok) throw new Error(`تعذّر تحميل الإعلانات (${res.status})`)
      return unwrapApi<AdsListResponse & { items: AdItem[] }>(res)
    },
    retry: 1,
  })

  const campaigns = campaignsQuery.data?.items ?? []
  const ads = adsQuery.data?.items ?? []

  return (
    <div className="mt-3 border-t border-border/50 pt-3 space-y-4" id={`ads-account-${accountId.replace(/[^a-zA-Z0-9_-]/g, "")}`}>
      {/* ── الحملات ── */}
      <section aria-label="حملات الحساب" className="space-y-2">
        <h4 className="text-xs font-bold flex items-center gap-1.5">
          <Megaphone className="size-3.5 text-accent-foreground" aria-hidden="true" />
          الحملات الإعلانية
        </h4>
        {campaignsQuery.isLoading ? (
          /* r131-F8 (A4 P1-2): pulse → .skeleton slabs. */
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Card key={i}><CardContent className="p-3.5 space-y-2">
                <div className="skeleton h-4 w-2/3 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </CardContent></Card>
            ))}
          </div>
        ) : campaignsQuery.isError ? (
          /* r131-F8 (A4 P2-8): the canonical .state family. */
          <div className="state state-danger py-8" role="alert">
            <div className="state-icon" aria-hidden="true">
              <AlertCircle />
            </div>
            <p className="state-title">تعذّر تحميل الحملات</p>
            <p className="state-desc">{(campaignsQuery.error as Error)?.message || "تعذّر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => campaignsQuery.refetch()}>
              <RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة
            </Button>
          </div>
        ) : campaigns.length === 0 ? (
          <Card><CardContent className="p-0">
            <EmptyState
              icon={Target}
              size="sm"
              title="لا توجد حملات في هذا الحساب"
              description="أنشئ حملتك الإعلانية من مدير إعلانات فيسبوك — ستظهر هنا مع حالتها وميزانيتها."
            />
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => {
              const adsets = adsetList(c)
              const dailySum = adsets.reduce((s, x) => s + Number(x.daily_budget ?? 0), 0)
              const lifetimeSum = adsets.reduce((s, x) => s + Number(x.lifetime_budget ?? 0), 0)
              const objective = objectiveLabel(c.objective)
              return (
                <Card key={c.id}>
                  <CardContent className="p-3.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      {/* live Graph name — dir="auto" isolates mixed Latin/Arabic
                          campaign names (v14-E5 pattern). */}
                      <p className="text-sm font-bold truncate" dir="auto">{c.name || "حملة بلا اسم"}</p>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                      {objective && <span>الهدف: {objective}</span>}
                      {c.created_time && (
                        <span className="flex items-center gap-1.5">
                          {formatDateOnly(c.created_time)}
                          {timeStamp(c.created_time) && (
                            <span dir="ltr" className="font-mono tabular-nums" title={formatDate(c.created_time) || undefined}>
                              {timeStamp(c.created_time)}
                            </span>
                          )}
                        </span>
                      )}
                      {adsets.length > 0 && (
                        <span>{countPhrase(adsets.length, "مجموعة إعلانية", "مجموعتان إعلانيتان", "مجموعات إعلانية")}</span>
                      )}
                    </div>
                    {/* Graph sends budgets in minor units (cents) of the
                        account currency — summed across the campaign's adsets. */}
                    {(dailySum > 0 || lifetimeSum > 0) && (
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {dailySum > 0 && (
                          <span>ميزانية يومية: <span className="sb-numerals">{formatMoney(dailySum, true)}</span>{currency ? ` ${currency}` : ""}</span>
                        )}
                        {lifetimeSum > 0 && (
                          <span>ميزانية إجمالية: <span className="sb-numerals">{formatMoney(lifetimeSum, true)}</span>{currency ? ` ${currency}` : ""}</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* ── الإعلانات + مؤشرات الأداء ── */}
      <section aria-label="إعلانات الحساب ومؤشراتها" className="space-y-2">
        <h4 className="text-xs font-bold flex items-center gap-1.5">
          <BarChart3 className="size-3.5 text-accent-foreground" aria-hidden="true" />
          الإعلانات ومؤشرات الأداء
        </h4>
        {adsQuery.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Card key={i}><CardContent className="p-3.5 space-y-2">
                <div className="skeleton h-4 w-1/2 rounded" />
                <div className="skeleton h-3 w-2/3 rounded" />
              </CardContent></Card>
            ))}
          </div>
        ) : adsQuery.isError ? (
          <div className="state state-danger py-8" role="alert">
            <div className="state-icon" aria-hidden="true">
              <AlertCircle />
            </div>
            <p className="state-title">تعذّر تحميل الإعلانات</p>
            <p className="state-desc">{(adsQuery.error as Error)?.message || "تعذّر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => adsQuery.refetch()}>
              <RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة
            </Button>
          </div>
        ) : ads.length === 0 ? (
          <Card><CardContent className="p-0">
            <EmptyState
              icon={BarChart3}
              size="sm"
              title="لا توجد إعلانات في هذا الحساب"
              description="الإعلانات داخل الحملات تظهر هنا مع مرات الظهور والنقرات والإنفاق."
            />
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {ads.map((a) => {
              const ins = insightsOf(a)
              return (
                <Card key={a.id}>
                  <CardContent className="p-3.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-sm font-bold truncate" dir="auto">{a.name || "إعلان بلا اسم"}</p>
                      <StatusBadge status={a.status} />
                    </div>
                    {a.creative?.title && (
                      <p className="text-xs text-muted-foreground mb-2 truncate" dir="auto">النص الإبداعي: {a.creative.title}</p>
                    )}
                    {/* المؤشرات = حقول insights الحقيقية التي يعيدها غراف
                        (impressions/clicks/spend/ctr/cpc — قيم رقمية نصية).
                        بدون بيانات insights يظهر الخلاص الصادق لا أصفار مزيفة. */}
                    {ins ? (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                        <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                          <p className="text-xs text-muted-foreground">مرات الظهور</p>
                          <p className="text-sm font-bold sb-numerals tabular-nums">{formatNumber(ins.impressions) || "—"}</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                          <p className="text-xs text-muted-foreground">النقرات</p>
                          <p className="text-sm font-bold sb-numerals tabular-nums">{formatNumber(ins.clicks) || "—"}</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                          <p className="text-xs text-muted-foreground">الإنفاق</p>
                          <p className="text-sm font-bold sb-numerals tabular-nums">
                            {formatMoney(ins.spend) ? `${formatMoney(ins.spend)}${currency ? ` ${currency}` : ""}` : "—"}
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                          <p className="text-xs text-muted-foreground">نسبة النقر</p>
                          <p className="text-sm font-bold sb-numerals tabular-nums">{ins.ctr != null ? `${formatMoney(ins.ctr)}%` : "—"}</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                          <p className="text-xs text-muted-foreground">تكلفة النقرة</p>
                          <p className="text-sm font-bold sb-numerals tabular-nums">
                            {formatMoney(ins.cpc) ? `${formatMoney(ins.cpc)}${currency ? ` ${currency}` : ""}` : "—"}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">لا تتوفر مؤشرات أداء لهذا الإعلان بعد.</p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

export default function AdsPage() {
  /* v19 Step 2 — DB-first envelope: {items, source, synced}. The old bare
   * array made a FAILING Graph call indistinguishable from «no accounts»
   * (the empty-state lie). synced=false now tells this page the refresh
   * itself failed: empty+failed → real error state; rows+failed → rows
   * with a "last synced" notice. */
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["ads-accounts"],
    queryFn: async () => {
      const res = await apiFetch("/api/ads/accounts")
      if (!res.ok) throw new Error(`تعذّر تحميل حسابات الإعلانات (${res.status})`)
      return unwrapApi<AdsAccountsResponse>(res)
    },
    retry: 1,
  })
  const accounts = data?.items ?? []
  /* v19 envelope semantics, pinned by AdminSidebar.v19.test: a bare
   * synced=false IS the failure verdict on this page (empty → honest
   * «تعذّر الاتصال»; rows → amber staleness notice). The envelope's optional
   * v21/v22-D2 fields (sync_attempted/sync_error/ads_unavailable) EXTEND the
   * contract — the structural page-token verdict below is the one this page
   * consumes; the posts-page v21 sync_attempted triage stays a posts twin. */
  const syncFailed = data ? data.synced === false : false
  /* v22-D2: a page token structurally cannot list ad accounts — the honest
   * structural state (NOT a retry-loop failure). */
  const adsUnavailable = data?.ads_unavailable === true

  /* P18-W4-b: the expandable account → campaigns/ads detail. One expanded
   * account at a time (accordion semantics — the list stays scannable). */
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي. */}
      <PageHeader
        icon={<Target className="size-4" />}
        title="الإعلانات"
        subtitle="إدارة الإعلانات"
        compact
        /* phase6 r154 — فاصل الأثر تحت الشريط (توقيع غرفة الآلة؛ الأثر
            الساكن — الإعلانات «قريبًا» ليست دفق أتمتة حيًا). */
        trace="static"
      />

      {/* D4-بند2 → r131-F8 (task #12): the content column rides the canonical
          1200 token (was max-w-5xl 1024). */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-(--marketing-max-w) mx-auto w-full">
        {/* P18-W4-b: the honest management-gap card. BEFORE this pass the
         * whole surface was this card (accounts list below, no campaigns
         * anywhere). NOW the campaign/ads read surface is LIVE (ads_read
         * Graph syncs + DB re-serve); what still needs Facebook app review
         * + business verification + the ads_management permission is the
         * WRITE side (creating / pausing campaigns) — no fake controls. */}
        <Card>
          <CardContent className="p-4 flex items-start gap-3.5 border border-accent-foreground/25 bg-primary/[0.03]">
            <div className="size-10 rounded-xl bg-accent-foreground/10 flex items-center justify-center shrink-0">
              <Target className="size-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold">عرض الحملات فعّال — التحكم بها قريباً</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                حملاتك ومؤشراتها (مرات الظهور، النقرات، الإنفاق) تُعرض أدناه مباشرة من فيسبوك.
                إنشاء الحملات أو إيقافها وتشغيلها يتطلب صلاحية ads_management ومراجعة التطبيق
                وتوثيق النشاط التجاري من فيسبوك — عند اكتمال الموافقة ستظهر أدوات التحكم هنا.
              </p>
            </div>
          </CardContent>
        </Card>
        {isLoading ? (
          /* r131-F8 (A4 P1-2): pulse → .skeleton slabs. (plain JS comment —
             JSX-comment braces are invalid in a ternary expression slot;
             r131-F7b syntax repair) */
          <div className="space-y-2">{[1,2].map(i => <Card key={i}><CardContent className="p-4"><div className="skeleton h-14 rounded" /></CardContent></Card>)}</div>
        ) : isError ? (
          /* r131-F7b (A4 P2-8 completion): bare-AlertCircle → the .state family. */
          <div className="state state-danger py-16" role="alert">
            <div className="state-icon" aria-hidden="true">
              <AlertCircle />
            </div>
            <h2 className="state-title">تعذّر تحميل الحسابات</h2>
            <p className="state-desc">{(error as Error)?.message || "تعذّر الاتصال"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : (adsUnavailable || syncFailed) && accounts.length === 0 ? (
          /* v22-D2 (structural) OR v19 (failed refresh) + nothing stored —
           * the OLD UI showed «لا توجد حسابات إعلانية مرتبطة» here (data
           * looked empty instead of broken). Say the truth + offer a way out. */
          <div className="text-center py-16">
            <WifiOff className="size-12 mx-auto mb-3 text-destructive-ink/50" />
            <h2 className="sb-section-title mb-1">
              {adsUnavailable ? "الإعلانات غير متاحة برمز صفحة" : "تعذّر الاتصال بفيسبوك"}
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              {adsUnavailable
                ? (data?.ads_unavailable_reason || "غير متاح برمز صفحة — يتطلب رمز مستخدم بحساب إعلاني")
                : "تعذّر تحديث حساباتك الإعلانية من فيسبوك — تحقق من صلاحية رمز الوصول ثم أعد المحاولة."}
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" /> إعادة المحاولة</Button>
          </div>
        ) : accounts.length === 0 ? (
          <Card><CardContent className="p-0">
              {/* phase6 r154 — الروبوت يستضيف البئر الفارغ (خامل: الرقيب
                  ينتظر ربط أول حساب إعلاني؛ أيقونة Target تتقاعد هنا). */}
              <EmptyState
                robot
                size="sm"
                title="لا توجد حسابات إعلانية مرتبطة"
                description="اربط حسابك الإعلاني بفيسبوك وستظهر حملاتك وأرصدتها هنا."
              />
            </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {syncFailed && (
              /* rows ARE stored + refresh failed → serve them, but honestly
               * (v19: no silent stale data). */
              <div className="flex items-center gap-2 text-xs text-warning-ink bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
                <WifiOff className="size-3.5 shrink-0" />
                <span>تعذّر التحديث من فيسبوك — يتم عرض آخر بيانات محفوظة.</span>
              </div>
            )}
            {accounts.map((a) => {
              const expanded = expandedId === a.id
              return (
                <Card key={a.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <p className="text-sm font-bold truncate" dir="auto">{a.name}</p>
                      {/* v4 §7.26 — backend returns account_status as an INT (FB
                          Marketing API codes); the old a.status === "ACTIVE"
                          string check never matched → badge rendered a raw number.
                          r131-F8 (A4 P2-3): hand-rolled wash chip → Badge. */}
                      <Badge variant={
                        a.account_status === 1 ? "success" :
                        a.account_status === 2 ? "danger" :
                        "warning"
                      }>{
                        a.account_status === 1 ? "نشطة" :
                        a.account_status === 2 ? "معطّلة" :
                        a.account_status === 3 ? "معلّقة (مبالغ مستحقة)" :
                        a.account_status === 9 ? "غير مفعّلة" :
                        a.account_status === 100 ? "معلّقة" :
                        `حالة ${a.account_status ?? "—"}`
                      }</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {a.currency && <p>العملة: {a.currency}</p>}
                      {/* phase6 r154 — أرقام الحساب الإعلاني (المصروف/الرصيد)
                          تركب سجل sb-numerals — صفوف الحسابات هادئة كما هي
                          (رقم المال على مسار العرض، بلا زخرفة إضافية). */}
                      {a.amount_spent != null && <p>المصروف: <span className="sb-numerals">{formatNumber(a.amount_spent)}</span></p>}
                      {a.balance != null && <p>الرصيد: <span className="sb-numerals">{formatNumber(a.balance)}</span></p>}
                    </div>
                    {/* P18-W4-b: التوسيع — حملات الحساب وإعلاناته على نقطة
                        النهاية الحقيقية GET /api/ads/campaigns|ads/{id}.
                        v25 (W-09) twin: h-11 — هدف لمس 44px صريح. */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 h-11 text-xs gap-1.5"
                      aria-expanded={expanded}
                      aria-controls={`ads-account-${a.id.replace(/[^a-zA-Z0-9_-]/g, "")}`}
                      onClick={() => setExpandedId(expanded ? null : a.id)}
                    >
                      <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                      {expanded ? "إخفاء الحملات" : "حملات الحساب"}
                    </Button>
                    {expanded && <AccountDetail accountId={a.id} currency={a.currency || undefined} />}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
