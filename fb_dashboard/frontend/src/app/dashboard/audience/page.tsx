"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { Users, Activity, AlertCircle, RefreshCw, Tags, TagPlus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { KpiCard, KpiCardSkeleton } from "@/components/shared/KpiCard"
import { TablePagination } from "@/components/shared/TablePagination"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { unwrapApi } from "@/lib/api"
import { TAG_COLORS } from "@/lib/tag-colors"
import { tagPillClasses } from "@/components/shared/pills"
import type { AnalyticsOverview, Paginated, Subscriber, TagRow, TopCommenter } from "@/lib/types"
import { countPhrase, formatDateOnly } from "@/lib/format"

/* v25 (W-05): عقد /api/subscribers (routers/subscribers_tags_routes.py:20 +
 * subscriber_engine.search) — page ge=1 وper_page ge=1 le=200 بغلاف
 * {items,total,page,per_page}؛ الصفحة كانت تجلب أول 10 مشتركين فقط إلى
 * الأبد بلا أي سبيل للوصول لما بعدها. */
const SUBS_PER_PAGE = 10

/* P21-W6-B5 (gap #3a): مفتاح استعلام الوسوم — الطلبان (مدير الوسوم
 * وحوار المشترِك) يشتركان فيه فيجلبان مرة واحدة (react-query de-dupe). */
const TAGS_KEY = ["tags"] as const

function useTags() {
  return useQuery({
    queryKey: TAGS_KEY,
    queryFn: () => apiFetch("/api/tags").then(unwrapApi<TagRow[]>),
    staleTime: 30000,
    retry: 1,
  })
}

export default function AudiencePage() {
  /* P21-W6-B5 (gap #3a): حالة الوسوم — مدير الوسوم (من رأس بطاقة
   * المشتركين) + حوار تعيين/إزالة وسوم مشترِك بعينه. */
  const [tagsManagerOpen, setTagsManagerOpen] = useState(false)
  const [tagging, setTagging] = useState<Subscriber | null>(null)
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

  return (
    <div className="flex-1 flex flex-col">
      {/* v17-S1 (D4-P1): الهيدر اليدوي → PageHeader المؤسسي. */}
      <PageHeader
        icon={<Users className="size-4" />}
        title="الجمهور"
        subtitle="تحليل الجمهور ومتابعي الصفحة"
        compact
        /* phase6 r154 — فاصل الأثر تحت الشريط (توقيع غرفة الآلة؛ الأثر
            الساكن — جدول البيانات ليس دفق أتمتة حيًا). */
        trace="static"
      />

      {/* r131-F8 (A12 SB#3 + task #12): max-w-5xl (1024) → the canonical
          1200 marketing/content column token (dashboard home rides the same
          column via SectionContainer — one content-width regime). */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-(--marketing-max-w) mx-auto w-full">
        {isError ? (
          /* r131-F8 (A4 P2-8): bare-AlertCircle error → the canonical .state family */
          <div className="state state-danger py-16" role="alert">
            <div className="state-icon" aria-hidden="true">
              <AlertCircle />
            </div>
            <h2 className="state-title">تعذّر تحميل بيانات الجمهور</h2>
            <p className="state-desc">تعذّر الاتصال بالخادم، تحقق من الإنترنت ثم أعد المحاولة.</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة</Button>
          </div>
        ) : (<>
        {/* r131-F8 (A4 P2-2): the hand-rolled 24px-value/32px-well strip →
            the canonical KpiCard (30px tnum value, 44px pastel well + rim).
            Height-stable KpiCardSkeleton while the overview loads. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {isLoading ? <KpiCardSkeleton /> : (
            <KpiCard icon={Users} label="متابعو الصفحة" value={data?.fan_count ?? null} tone="copper" index={0} />
          )}
          {isLoading ? <KpiCardSkeleton /> : (
            <KpiCard icon={Activity} label="إجمالي التفاعل" value={data?.total_replies ?? null} tone="sky" index={1} />
          )}
          {isLoading ? <KpiCardSkeleton /> : (
            <KpiCard icon={Activity} label="نشاط اليوم" value={data?.today_replies ?? null} tone="mint" index={2} />
          )}
        </div>

        <Card>
          <CardContent className="p-4">
            <h3 className="sb-section-title mb-2">المعلقون الأكثر نشاطاً</h3>
            {/* v4 §2.5 — honest error state + gate on topQuery's own flags
                (the old gate used the overview query's isLoading → premature
                empty state while top commenters were still loading) */}
            {isLoading || topQuery.isLoading ? (
              <div className="space-y-2">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-5" />)}
              </div>
            ) : topQuery.isError ? (
              <p className="text-sm text-muted-foreground text-center py-4">تعذّر تحميل المعلقين — <button className="underline outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded" onClick={() => topQuery.refetch()}>إعادة المحاولة</button></p>
            /* r127-F5a: truthiness guard (same semantics as `(len||0)>0` for
               arrays) also NARROWS topQuery.data for the .map below. */
            ) : topQuery.data?.length ? (
              <div className="space-y-2">
                {topQuery.data.map((c, i) => (
                  /* v9-B12 — ranked list: positional keys corrupt React's
                      diffing when the ranking shifts; commenter_id is stable */
                  <div key={c.commenter_id ?? c.name ?? i} className="flex items-center justify-between text-sm py-1 border-b border-border last:border-0">
                    <span>{c.name || `معلق #${c.commenter_id}`}</span>
                    {/* phase6 r154 — عدّاد التعليقات يركب سجل sb-numerals
                        (رقم العرض + tabular — أرقام الجدول على مسار البترول). */}
                    <span className="text-muted-foreground sb-numerals">{countPhrase(c.count, "تعليق", "تعليقين", "تعليقات")}</span>
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
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <h3 className="sb-section-title">
                {/* phase6 r154 — عدّاد المشتركين يركب سجل sb-numerals
                    (رقم العرض + tabular — توأم عدّادات KpiCard أعلاه). */}
                المشتركون (<span className="sb-numerals tabular-nums">{subsQuery.data?.total ?? 0}</span>)
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  يتغذّى تلقائياً من محادثات الماسنجر
                </span>
                {/* P21-W6-B5 (gap #3a): مدير الوسوم — إنشاء الوسوم وإدارتها.
                    عقد الخادم: POST /api/tags (JSON {name, color}) يرد
                    {id,name,color,subscriber_count}؛ التكرار 400 بنص
                    الخادم؛ GET مفتوح لكل مستخدم مصدّق. */}
                <Button size="sm" variant="outline" onClick={() => setTagsManagerOpen(true)} aria-haspopup="dialog">
                  <Tags className="size-3.5" aria-hidden="true" /> إدارة الوسوم
                </Button>
              </div>
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
              <p className="text-sm text-muted-foreground text-center py-4">تعذّر تحميل المشتركين — <button className="underline outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded" onClick={() => subsQuery.refetch()}>إعادة المحاولة</button></p>
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
                      <span className="size-7 rounded-full bg-accent-foreground/10 text-accent-foreground text-xs font-bold flex items-center justify-center shrink-0">
                        {(s.first_name || s.name || "؟").slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm truncate">{s.name || `مشترك #${s.id}`}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {s.platform === "messenger" ? "ماسنجر" : s.platform}
                          {s.last_interaction_at ? ` · آخر تفاعل ${formatDateOnly(s.last_interaction_at)}` : ""}
                        </p>
                        {/* P21-W6-B5 (gap #3a): رقائق وسوم المشترِك — نفس
                            قائمة الوسوم التي يعيدها محرك البحث لكل صف
                            ({id,name,color} — subscriber_engine.search)،
                            والتعبئة/الإزالة من حوار الوسوم أدناه. */}
                        {(s.tags ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(s.tags ?? []).map((tag) => (
                              <span key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-muted/60 border border-border/40 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                                <span
                                  className="size-2 rounded-full shrink-0 border border-border/60"
                                  style={{ backgroundColor: tag.color || "var(--muted)" }}
                                  aria-hidden="true"
                                />
                                <span dir="auto">{tag.name}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* P21-W6-B5 (gap #3a): تعيين/إزالة الوسوم لهذا
                          المشترِك — عقد الخادم حرفياً: POST
                          /api/subscribers/{id}/tags (JSON {tag_id}) و
                          DELETE /api/subscribers/{id}/tags/{tag_id}؛
                          44px هدف لمس (v25 W-09). */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-11 p-0"
                        onClick={() => setTagging(s)}
                        aria-haspopup="dialog"
                        aria-label={`وسوم المشترِك ${s.name || `#${s.id}`}`}
                      >
                        <TagPlus className="size-4" />
                      </Button>
                      <Badge variant={s.status === "active" ? "success" : "secondary"}>
                        {s.status === "active" ? "نشط" : "غير نشط"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* v25 (W-05): مِرقاة الصفحات — القائمة كانت محصورة في أول 10
                مشتركين. r131-F8 (A4 P2-1): the السابق/التالي row → the
                canonical numbered windowed pagination footer (count on the
                start side + page-number buttons + ellipsis gaps). تُخفى عند
                التحميل/الخطأ/الفراغ. */}
            {!subsQuery.isLoading && !subsQuery.isError && subsTotal > 0 && (
              <TablePagination
                page={shownPage}
                totalPages={totalPages}
                total={subsTotal}
                onPageChange={(p) => setSubsPage(p)}
                unitLabel="مشترك"
                className="mt-1"
              />
            )}
          </CardContent>
        </Card>

        {/* P21-W6-B5 (gap #3a): حوارا الوسوم — المدارة من حالة الصفحة
            (البورتال يخرجها عن التدفق فلا تُزحزح البطاقات). الحوار يستقبل
            الصف الطازج من كاش القائمة (بعد invalidate) لا اللقطة التي
            فتح منها — وإلا بقي ضغط الرقائق على حالته القديمة. */}
        {tagsManagerOpen && (
          <TagsManagerDialog onClosed={() => setTagsManagerOpen(false)} />
        )}
        {tagging && (
          <SubscriberTagsDialog
            sub={(subsQuery.data?.items || []).find((s) => s.id === tagging.id) ?? tagging}
            onClosed={() => setTagging(null)}
          />
        )}
      </>
      )}
      </div>
    </div>
  )
}

/* ── P21-W6-B5 (gap #3a): مدير الوسوم ─────────────────────────────────────
 * العقد الحقيقي (routers/subscribers_tags_routes.py — لا افتراضات):
 *   GET /api/tags → TagRow[] {id,name,color,subscriber_count} (مفتوح لكل
 *   مستخدم مصدّق) · POST /api/tags JSON {name, color?} يرد نفس شكل الصف
 *   ويطلب صلاحية editor؛ التكرار 400 بنص الخادم (Tag 'x' already exists)
 *   يظهر toast كما هو (عرف الأخطاء: نص الخادم حرفياً). حذف الوسم
 *   (DELETE /api/tags/{id}) يتطلب admin — خارج نطاق هذه المهمة ولا
 *   يُعرض زرٌّ له (لا زر يموت بـ403). */
function TagsManagerDialog({ onClosed }: { onClosed: () => void }) {
  const queryClient = useQueryClient()
  const { data: tags = [], isLoading, isError, refetch } = useTags()
  const [newName, setNewName] = useState("")
  const [color, setColor] = useState<string>(TAG_COLORS[0])

  const createMut = useMutation({
    mutationFn: () =>
      apiFetch("/api/tags", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), color }),
      }).then(unwrapApi<TagRow>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] })
      setNewName("")
      brandedToast.success("تم إنشاء الوسم")
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر إنشاء الوسم"),
  })

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClosed() }}>
      <DialogContent>
        <DialogTitle>إدارة الوسوم</DialogTitle>
        <DialogDescription>
          الوسوم تُطبّق على المشتركين من زر الوسم بجانب كل صف، وتُستخدم في تصفية البث الجماعي.
        </DialogDescription>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton h-9 rounded-lg" />)}
          </div>
        ) : isError ? (
          <div className="state state-danger py-6" role="alert">
            <div className="state-icon" aria-hidden="true">
              <AlertCircle />
            </div>
            <h2 className="state-title">تعذّر تحميل الوسوم</h2>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة
            </Button>
          </div>
        ) : tags.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2" dir="auto">
            لا توجد وسوم بعد — أنشئ أول وسم من النموذج أدناه.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {tags.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 text-sm py-1.5 px-2 rounded-lg bg-muted/30">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="size-3 rounded-full shrink-0 border border-border/60"
                    style={{ backgroundColor: t.color || "var(--muted)" }}
                    aria-hidden="true"
                  />
                  <span className="truncate font-medium" dir="auto">{t.name}</span>
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {countPhrase(t.subscriber_count ?? 0, "مشترك", "مشتركين", "مشتركين")}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* إنشاء وسم — عقد الخادم: JSON {name, color}؛ الاسم مطابقة حرفية
            (التكرار 400). حقل الاسم dir=auto مدمج في المكون. */}
        <div className="space-y-2 pt-1 border-t border-border/60">
          <p className="text-xs font-bold text-muted-foreground">وسم جديد</p>
          <Input
            id="new-tag-name"
            label="اسم الوسم"
            placeholder="مثال: مهتم بالتوصيل"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={40}
          />
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">اللون</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="لون الوسم">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-pressed={color === c}
                  aria-label={`لون ${c}`}
                  title={c}
                  className="size-11 rounded-full border border-border/60 flex items-center justify-center transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <span
                    className="size-5 rounded-full"
                    style={{ backgroundColor: c }}
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onClosed}>إغلاق</Button>
            <Button
              size="sm"
              loading={createMut.isPending}
              disabled={!newName.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? "جارٍ الإنشاء…" : "إنشاء الوسم"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── P21-W6-B5 (gap #3a): وسوم مشترِك بعينه ────────────────────────────────
 * تعيين/إزالة فوريان عبر العقد الحقيقي: POST /api/subscribers/{id}/tags
 * (JSON {tag_id}، يرد {ok}) و DELETE /api/subscribers/{id}/tags/{tag_id}
 * (404 عربي إن لم يكن معيناً) — كلاهما editor. إنشاء ووسم = استدعاءان
 * متتاليان (لا نقطة نهاية مجمعة)؛ الاسم الموجود مسبقاً يُعاد استخدامه
 * بدل اصطدام 400 مضمون. */
function SubscriberTagsDialog({ sub, onClosed }: { sub: Subscriber; onClosed: () => void }) {
  const queryClient = useQueryClient()
  const { data: tags = [], isLoading } = useTags()
  const [newName, setNewName] = useState("")

  /* الحالة المعروضة = وسوم الصف (من قائمة المشتركين) + أثر التبديل
   * الفوري: invalidate ["subscribers"] يجلب الصف الجديد فتتحدث الرقائق
   * داخل الحوار وخارجها معاً (نفس الكاش). */
  const assigned = new Set((sub.tags ?? []).map((t) => t.id))

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["tags"] })
    queryClient.invalidateQueries({ queryKey: ["subscribers"] })
  }

  const assignMut = useMutation({
    mutationFn: (tagId: number) =>
      apiFetch(`/api/subscribers/${sub.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ tag_id: tagId }),
      }).then(unwrapApi<{ ok: boolean }>),
    onSuccess: () => {
      invalidateAll()
      brandedToast.success("تم تعيين الوسم")
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر تعيين الوسم"),
  })

  const removeMut = useMutation({
    mutationFn: (tagId: number) =>
      apiFetch(`/api/subscribers/${sub.id}/tags/${tagId}`, { method: "DELETE" }).then(
        unwrapApi<{ ok: boolean }>,
      ),
    onSuccess: () => {
      invalidateAll()
      brandedToast.success("تمت إزالة الوسم")
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّرت إزالة الوسم"),
  })

  /* إنشاء ووسم: POST /api/tags ثم التعيين — اسم مطابق لوسم قائم يعاد
   * استخدامه (تطابق حرفي، نفس مقارنة الخادم) بلا اصطدام 400 مضمون. */
  const createAndAssign = useMutation({
    mutationFn: async () => {
      const name = newName.trim()
      const existing = tags.find((t) => t.name === name)
      const tag = existing
        ? existing
        : await apiFetch("/api/tags", {
            method: "POST",
            body: JSON.stringify({ name }),
          }).then(unwrapApi<TagRow>)
      await apiFetch(`/api/subscribers/${sub.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ tag_id: tag.id }),
      }).then(unwrapApi<{ ok: boolean }>)
      return { reused: !!existing }
    },
    onSuccess: ({ reused }) => {
      invalidateAll()
      setNewName("")
      brandedToast.success(reused ? "الوسم موجود — تم تعيينه للمشترِك" : "تم إنشاء الوسم وتعيينه للمشترِك")
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر إنشاء الوسم"),
  })

  const busy = assignMut.isPending || removeMut.isPending || createAndAssign.isPending

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClosed() }}>
      <DialogContent>
        <DialogTitle>وسوم: {sub.name || `مشترك #${sub.id}`}</DialogTitle>
        <DialogDescription>
          فعّل الوسوم لهذا المشترِك بنقرة — الوسم المعيّن يظهر مضغوطاً، والنقر عليه يزيله.
        </DialogDescription>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton h-9 rounded-lg" />)}
          </div>
        ) : tags.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2" dir="auto">
            لا توجد وسوم بعد — أنشئ أول وسم أدناه وسيُعيّن لهذا المشترِك مباشرة.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label="وسوم المشترك">
            {tags.map((t) => {
              const on = assigned.has(t.id)
              const pending =
                (assignMut.isPending && assignMut.variables === t.id) ||
                (removeMut.isPending && removeMut.variables === t.id)
              /* W7-G (A4 P2-6): the canonical tag twin of the pill family —
                 kills the private focus-visible:ring-2 + the hand-rolled
                 on/off wash pair this dialog carried. */
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => (on ? removeMut.mutate(t.id) : assignMut.mutate(t.id))}
                  disabled={pending || busy}
                  aria-pressed={on}
                  aria-label={`${on ? "إزالة وسم" : "تعيين وسم"} ${t.name}`}
                  className={tagPillClasses(on, "disabled:opacity-60")}
                >
                  {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                  <span
                    className="size-2.5 rounded-full shrink-0 border border-border/60"
                    style={{ backgroundColor: t.color || "var(--muted)" }}
                    aria-hidden="true"
                  />
                  <span dir="auto">{t.name}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="space-y-2 pt-1 border-t border-border/60">
          <p className="text-xs font-bold text-muted-foreground">وسم جديد لهذا المشترِك</p>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                id="sub-new-tag-name"
                label="اسم الوسم"
                placeholder="مثال: عميل متكرر"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={40}
              />
            </div>
            <Button
              size="sm"
              loading={createAndAssign.isPending}
              disabled={!newName.trim() || busy}
              onClick={() => createAndAssign.mutate()}
            >
              {createAndAssign.isPending ? "جارٍ الحفظ…" : "إنشاء ووسم"}
            </Button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={onClosed}>إغلاق</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
