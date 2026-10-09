"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/csrf-client"
import { brandedToast } from "@/lib/premium-toast"
import { countPhrase } from "@/lib/format"
import { AtSign, Bot, Loader2, MessageCircle, Pencil, Plus, RefreshCw, Sparkles, ToggleLeft, ToggleRight, Trash2, AlertCircle } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader } from "@/components/ui/PageHeader"
import { EmptyState } from "@/components/ui/EmptyState"
/* v23: مفتاح تبديل منزلي (button[role=switch] + aria-checked، بلا radix) —
   نفس مكون صفحة الأدوات؛ يوفّر عقد الإتاحة (WCAG 4.1.2) لمفاتيح البطاقة
   الثلاثة مع دعم disabled أثناء الـPUT التفاؤلي. */
import { Switch } from "@/components/ui/switch"
import { unwrapApi } from "@/lib/api"
import { usePollingWhenVisible } from "@/hooks/usePollingWhenVisible"
import type { BotBehavior, BotBehaviorPatch, ReplyRule } from "@/lib/types"

/* v23 (المهمة 2-ب): بطاقة «سلوك البوت» فوق قسم القواعد — المنشن/الرسالة
 * الخاصة/رد AI تتحكم في سلوك البوت العام بمعزل عن القائمة نفسها، لذا
 * استعلامها الخاص (لا يعاد جلبه مع refetchInterval القواعد كل 30 ثانية).
 * العقد: GET/PUT /api/bot/behavior بغلاف ok()؛ PUT بجسم patch JSON. */

/** مفاتيح البطاقة الثلاثة — مصدر واحد للعنوان/الوصف/الأيقونة وlabel الـaria
 * حتى لا يتباعد نص الشاشة عن نص قارئ الشاشة. */
type BehaviorSwitchKey = "mention_in_replies" | "comment_dm_enabled" | "ai_auto_reply"

const BEHAVIOR_SWITCHES: { key: BehaviorSwitchKey; title: string; description: string; Icon: LucideIcon }[] = [
  {
    key: "mention_in_replies",
    title: "إشارة المعلّق في الرد",
    description: "يبدأ رد البوت بإشارة (منشن) لاسم المعلّق فيصلبه إشعار من فيسبوك فوراً.",
    Icon: AtSign,
  },
  {
    key: "comment_dm_enabled",
    title: "رسالة مباشرة عند التعليق",
    description: "يرسل البوت رداً خاصاً في ماسنجر لمن يعلّق على منشوراتك (مرة واحدة لكل تعليق خلال 7 أيام).",
    Icon: MessageCircle,
  },
  {
    key: "ai_auto_reply",
    title: "رد الذكاء الاصطناعي عند عدم مطابقة قاعدة",
    description: "إذا لم تطابق أي قاعدة، يولّد الذكاء الاصطناعي رداً مناسباً بدل الصمت.",
    Icon: Sparkles,
  },
]

/** حدود حقل نبرة AI — عقد الخادم: نص حر قصير (≤40 حرفاً). */
const TONE_MAX_LEN = 40
const TONE_DEBOUNCE_MS = 600

/** اسم المزود كما يُعرض في شريط الحالة (none لا يظهر أصلاً عند غير المتاح). */
const AI_PROVIDER_LABEL: Record<BotBehavior["ai_provider"], string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  none: "—",
}

/* v25 (W-14): مفتاح استعلام القواعد — مرفوع لثبات المرجع لخطاف
 * الاستطلاع المرئي (نفس عقد activity/analytics). */
const RULES_KEY = ["rules"] as const

/* v25 (W-13 — تثبيت عميل لعقد أولوية القاعدة): الخادم يقبل أعداداً صحيحة
 * 1-999 فقط (rules.py Form priority)؛ إدخال خارج النطاق أو غير رقمي كان
 * يُرسل كما هو فيفشل 422 بصمت نموذج كامل. المصحّح يحوّل أي قيمة إلى عدد
 * صحيح داخل النطاق (غير الرقمي → الافتراضي 50) عند blur وعند الإرسال. */
const PRIORITY_MIN = 1
const PRIORITY_MAX = 999
const PRIORITY_DEFAULT = 50
function clampPriority(raw: string): string {
  const n = parseInt(raw, 10)
  if (Number.isNaN(n)) return String(PRIORITY_DEFAULT)
  return String(Math.min(PRIORITY_MAX, Math.max(PRIORITY_MIN, n)))
}

export default function AutoReplyPage() {
  const [showForm, setShowForm] = useState(false)
  /* v17-E-F8 (D6 #7): وضع تعديل القاعدة — نفس النموذج يتحول لوضع PUT
     (PUT موجود خلفيًا: /api/rules/{id} — Form: name/keywords/reply_template/priority). */
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  /* v24-C2 (task 3 / A3-A1): حذف القاعدة بلمستين — نفس نمط sequences/team
     داخل المستودع: الضغط الأول يكشف «تأكيد الحذف / إلغاء»، والثاني فقط
     يحذف. لا حذف بلمسة أيقونة واحدة (32px) بعد الآن. */
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [name, setName] = useState("")
  const [keyword, setKeyword] = useState("")
  const [replyText, setReplyText] = useState("")
  const [priority, setPriority] = useState("50")
  const queryClient = useQueryClient()

  /* v25 (W-14): 30s → استطلاع مرئي — المؤقّت يتوقف تماماً في تبويب الخلفية
   * (false) ويعود فور العودة مع تجديد فوري متى تقادمت البيانات. */
  const refetchInterval = usePollingWhenVisible(30_000, RULES_KEY)
  const { data: rules = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: RULES_KEY,
    queryFn: async () => {
      const res = await apiFetch("/api/rules")
      if (!res.ok) throw new Error(`تعذّر تحميل القواعد (${res.status})`)
      return unwrapApi<ReplyRule[]>(res)
    },
    refetchInterval,
    retry: 1,
  })

  const createMut = useMutation({
    // v4 §2.3/§5.14 — send the fields the backend actually declares
    // (name, keywords, reply_template, priority). The old body sent
    // keyword/reply_text → guaranteed 422, so NO rule was ever creatable
    // from this page.
    /* v25 (W-13): الأولوية تُرسل بعد التثبيت (1-999 عدد صحيح) — إدخال
     * خارج النطاق لم يعد يصل الخادم أساساً. */
    mutationFn: () =>
      apiFetch("/api/rules", {
        method: "POST",
        body: new URLSearchParams({
          name: name.trim() || keyword.trim(),
          keywords: keyword.trim(),
          reply_template: replyText.trim(),
          priority: clampPriority(priority),
        }),
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); setShowForm(false); setName(""); setKeyword(""); setReplyText(""); setPriority("50"); brandedToast.success("تم إنشاء القاعدة") },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر الإنشاء"),
  })

  const toggleMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/rules/${id}/toggle`, { method: "POST" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rules"] }); brandedToast.success("تم التبديل") },
    onError: (e: Error) => brandedToast.error(e.message),
  })

  /* v17-E-F8 (D6 #7): تعديل قاعدة قائمة — PUT /api/rules/{id} بنفس حقول
     الإنشاء (Form-encoded؛ الخادم يفصل keywords على الفاصلة الإنجليزية
     لذا نُعيد تجميع المصفوفة بـ ", " عند الملء). */
  const updateRuleMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/rules/${id}`, {
        method: "PUT",
        body: new URLSearchParams({
          name: name.trim() || keyword.trim(),
          keywords: keyword.trim(),
          reply_template: replyText.trim(),
          /* v25 (W-13): نفس تثبيت الإنشاء — 1-999 عدد صحيح. */
          priority: clampPriority(priority),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] })
      setEditingRuleId(null)
      setName(""); setKeyword(""); setReplyText(""); setPriority("50")
      brandedToast.success("تم حفظ تعديلات القاعدة")
    },
    onError: (e: Error) => brandedToast.error(e.message || "تعذّر حفظ التعديلات"),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rules"] })
      /* v24-C2 (task 3): القاعدة حُذفت — أعد عنقود الإجراءات لوضعه الطبيعي */
      setConfirmDeleteId(null)
      brandedToast.success("تم حذف القاعدة")
    },
    onError: (e: Error) => brandedToast.error(e.message),
  })

  /* v23: سلوك البوت — GET مستقل عن القواعد (staleTime 30 ثانية كافٍ: لا
 * مصدر آخر يغيّر هذه القيم)، retry: 1 مثل استعلام القواعد فوقه. */
  const {
    data: behavior,
    isLoading: behaviorLoading,
    isError: behaviorError,
    error: behaviorErrorObj,
    refetch: refetchBehavior,
  } = useQuery({
    queryKey: ["bot-behavior"],
    queryFn: async () => {
      const res = await apiFetch("/api/bot/behavior")
      if (!res.ok) throw new Error(`تعذّر تحميل سلوك البوت (${res.status})`)
      return unwrapApi<BotBehavior>(res)
    },
    staleTime: 30000,
    retry: 1,
  })

  /* v23: PUT فوري لكل تبديل/حفظ نبرة — تحديث تفاؤلي في كاش bot-behavior،
 * والخادم يعيد الحالة الكاملة بعد PUT فنستبدل الكاش بها (لا invalidate
 * يطلق GETاً إضافياً بلا داعٍ)، وعند الفشل يعود الكاش للقيمة السابقة. */
  const behaviorMut = useMutation({
    mutationFn: (patch: BotBehaviorPatch) =>
      apiFetch("/api/bot/behavior", { method: "PUT", body: JSON.stringify(patch) }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["bot-behavior"] })
      const prev = queryClient.getQueryData<BotBehavior>(["bot-behavior"])
      if (prev) queryClient.setQueryData<BotBehavior>(["bot-behavior"], { ...prev, ...patch })
      return { prev }
    },
    onSuccess: async (res) => {
      queryClient.setQueryData<BotBehavior>(["bot-behavior"], await unwrapApi<BotBehavior>(res))
      brandedToast.success("تم حفظ سلوك البوت")
    },
    onError: (e: Error, _patch: BotBehaviorPatch, ctx) => {
      if (ctx?.prev) queryClient.setQueryData<BotBehavior>(["bot-behavior"], ctx.prev)
      brandedToast.error(e.message || "تعذّر حفظ سلوك البوت")
    },
  })

  /* v23: حقل النبرة — إدخال محلي يتزامن مع الكاش فقط وهو «نظيف»، ويُحفظ
 * عبر PUT بعد توقف الكتابة 600ms أو عند blur فوراً؛ حارس lastSavedTone
 * يمنع PUT مكرراً عند blur دون تغيير (وعرف الاحتفاظ بالمسودة عند فشل
 * الحفظ كما في صفحة الرسائل D10-M2). */
  const [toneInput, setToneInput] = useState("")
  const toneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedTone = useRef("")

  useEffect(() => {
    const serverTone = behavior?.ai_tone ?? ""
    if (serverTone === lastSavedTone.current) return
    /* المزامنة تصل فقط والحقل لم يُحرّر بعد (وإلا لطمست المسودة الجارية)،
       ثم نعتبر القيمة الخادمية آخر قيمة محفوظة. */
    if (toneInput === lastSavedTone.current) setToneInput(serverTone)
    lastSavedTone.current = serverTone
    /* r133 (eslint adoption): toneInput joins the deps — the guard above
       short-circuits while the user types (serverTone === lastSavedTone),
       so the sync still only fires on real server arrivals. */
  }, [behavior?.ai_tone, toneInput])

  /* v23: تنظيف مؤقّت الـdebounce عند مغادرة الصفحة حتى لا يطلق PUT يتيماً. */
  useEffect(
    () => () => {
      if (toneTimer.current) clearTimeout(toneTimer.current)
    },
    [],
  )

  const saveTone = (value: string) => {
    const v = value.trim().slice(0, TONE_MAX_LEN)
    if (v === lastSavedTone.current) return
    behaviorMut.mutate({ ai_tone: v })
  }

  const scheduleToneSave = (value: string) => {
    if (toneTimer.current) clearTimeout(toneTimer.current)
    toneTimer.current = setTimeout(() => {
      toneTimer.current = null
      saveTone(value)
    }, TONE_DEBOUNCE_MS)
  }

  const flushToneSave = () => {
    if (toneTimer.current) {
      clearTimeout(toneTimer.current)
      toneTimer.current = null
    }
    saveTone(toneInput)
  }

  const toneSaving = behaviorMut.isPending && !!behaviorMut.variables && "ai_tone" in behaviorMut.variables

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader
        icon={<Bot className="size-4" />}
        title="الردود التلقائية"
        subtitle="قواعد الرد الآلي وسلوك البوت على التعليقات"
        compact
      />

      {/* D4-بند2 (v17-S1) → r131-F8 (task #12): the content column rides the
          canonical 1200 token (was max-w-5xl 1024). */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-(--marketing-max-w) mx-auto w-full">
        {/* v23 (المهمة 2-ب): بطاقة «سلوك البوت» فوق قسم القواعد مباشرة —
            مستقلة عن حالة القواعد (تحميلها/فشلها/فراغها لا يخفي البطاقة ولا العكس). */}
        {behaviorLoading ? (
          /* r131-F8 (A4 P1-2): pulse blink → shape-matched .skeleton slabs
             (icon well + title/desc lines + switch circle per row). */
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="skeleton h-3 w-20 mb-2" />
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="skeleton size-9 shrink-0 rounded-xl" />
                    <div className="space-y-1.5 py-1 flex-1">
                      <div className="skeleton h-3.5 w-28" />
                      <div className="skeleton h-2.5 w-44" />
                    </div>
                  </div>
                  <div className="skeleton size-5 shrink-0 rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : behaviorError ? (
          /* v23 → r131-F8 (A4 P2-8): the destructive-soft tile idiom rides the
              canonical .state family (rose-soft 56px r-xl + -ink glyph + 42ch). */
          <div className="state state-danger py-10" role="alert">
            <div className="state-icon" aria-hidden="true">
              <AlertCircle />
            </div>
            <h2 className="state-title">تعذّر تحميل سلوك البوت</h2>
            <p className="state-desc">{(behaviorErrorObj as Error)?.message || "تعذّر الاتصال، تحقق من الإنترنت ثم أعد المحاولة"}</p>
            <Button size="sm" variant="outline" onClick={() => refetchBehavior()}>
              <RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة
            </Button>
          </div>
        ) : behavior ? (
          /* r131-F8 (A4 P2-4): de-glow — the accent border + accent wash
             shadow drop to the flat hairline card language. */
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-bold text-muted-foreground mb-1">سلوك البوت</p>
              {BEHAVIOR_SWITCHES.map((row) => {
                const checked = behavior[row.key] === true
                const saving = behaviorMut.isPending && !!behaviorMut.variables && row.key in behaviorMut.variables
                return (
                  <div key={row.key} className="flex items-center justify-between gap-4 py-2.5 border-b border-border/40 last:border-b-0">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="size-9 rounded-xl bg-accent-foreground/10 border border-accent-foreground/20 flex items-center justify-center text-accent-foreground shrink-0">
                        <row.Icon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold mb-0.5">{row.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{row.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pt-1">
                      {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                      <Switch
                        checked={checked}
                        onCheckedChange={(v) => behaviorMut.mutate({ [row.key]: v } as BotBehaviorPatch)}
                        disabled={saving}
                        aria-label={`${row.title} — ${checked ? "مفعّلة" : "متوقفة"}`}
                      />
                    </div>
                  </div>
                )
              })}

              {/* v23: شريط حالة مزود AI — role=status (aria-live ضمنياً) حتى
                  يُعلن تغيّر جاهزية المزود لقارئات الشاشة دون تفاعل. */}
              <div role="status" className="flex items-center gap-2 pt-3 border-t border-border/40">
                <span className={`size-2 rounded-full shrink-0 ${behavior.ai_available ? "bg-success" : "bg-warning"}`} />
                <p className="text-xs text-muted-foreground">
                  {behavior.ai_available
                    ? `الذكاء الاصطناعي جاهز (${AI_PROVIDER_LABEL[behavior.ai_provider] ?? "—"})`
                    : "الذكاء الاصطناعي غير مفعّل — أضف مفتاح API من إعدادات الأدمن"}
                </p>
              </div>

              {behavior.ai_auto_reply && (
                <div className="pt-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <label htmlFor="ai-tone" className="text-xs font-medium text-muted-foreground">نبرة الردود (اختياري)</label>
                    {toneSaving && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                  </div>
                  {/* v16-E3 (D1 C3) → r131-F8 (A4 P1-1b): the raw-input idiom
                      (h-11 rounded-lg + hand-rolled ring + md:text-sm 14px)
                      rides the shared Input primitive — 16px floor, r-md,
                      halo token; dir=auto is built in. */}
                  <Input
                    id="ai-tone"
                    value={toneInput}
                    onChange={(e) => {
                      setToneInput(e.target.value)
                      scheduleToneSave(e.target.value)
                    }}
                    onBlur={flushToneSave}
                    maxLength={TONE_MAX_LEN}
                    placeholder="مثال: ودية ومهنية"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">{countPhrase(rules.length, "قاعدة", "قاعدتين", "قواعد")}</p>
          <Button size="sm" onClick={() => { setShowForm(!showForm); setEditingRuleId(null) }}>
            <Plus className="size-3.5" /> قاعدة جديدة
          </Button>
        </div>

        {(showForm || editingRuleId !== null) && (
          <Card
            /* r131-F8 (A4 P2-4): de-glow — the accent border + wash shadow drop
               to the flat hairline card language.
               v10-B7 (G2-05): Escape closes the inline form (same as «إلغاء») —
               the first field is focused on open so the key lands inside */
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setShowForm(false); setEditingRuleId(null) } }}
          >
            <CardContent className="p-4 space-y-3">
              {/* v17-E-F8 (D6 #7): عنوان النموذج يفرّق الإنشاء عن التعديل. */}
              <p className="text-xs font-bold text-muted-foreground">
                {editingRuleId !== null ? "تعديل القاعدة" : "قاعدة جديدة"}
              </p>
              <div>
                <label htmlFor="rule-name" className="text-xs font-medium text-muted-foreground mb-1.5 block">اسم القاعدة</label>
                {/* r131-F8 (A4 P1-1b): raw input → the shared Input
                    primitive (16px floor / r-md / halo; dir=auto built in). */}
                <Input
                  id="rule-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="مثال: الرد على الاستفسارات"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="rule-keywords" className="text-xs font-medium text-muted-foreground mb-1.5 block">الكلمات المفتاحية (افصل بفاصلة)</label>
                <Input
                  id="rule-keywords"
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  placeholder="مثال: سعر، توصيل، عنوان"
                />
              </div>
              <div>
                <label htmlFor="rule-reply" className="text-xs font-medium text-muted-foreground mb-1.5 block">نص الرد</label>
                {/* r131-F8 (A4 P1-1c): raw textarea → the shared Textarea
                    primitive (min-h-24 / 16px floor / r-md / halo). */}
                <Textarea
                  id="rule-reply"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="النص الذي سيرد به البوت عند تطابق الكلمة…"
                  rows={3}
                />
              </div>
              <div>
                <label htmlFor="rule-priority" className="text-xs font-medium text-muted-foreground mb-1.5 block">الأولوية (الرقم الأقل يُفحص أولاً: 1-999)</label>
                <div className="w-32">
                  <Input
                    id="rule-priority"
                    value={priority}
                    onChange={e => setPriority(e.target.value)}
                    /* v25 (W-13): تثبيت عند مغادرة الحقل — أي قيمة خارج 1-999
                       أو غير رقمية تُصحّح فوراً (نفس ما سيُرسل للخادم). */
                    onBlur={() => setPriority(p => clampPriority(p))}
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setEditingRuleId(null); setName(""); setKeyword(""); setReplyText(""); setPriority("50") }}>إلغاء</Button>
                <Button
                  size="sm"
                  loading={createMut.isPending || updateRuleMut.isPending}
                  disabled={!keyword.trim() || !replyText.trim() || createMut.isPending || updateRuleMut.isPending}
                  onClick={() => { if (editingRuleId !== null) updateRuleMut.mutate(editingRuleId); else createMut.mutate() }}
                >
                  {(createMut.isPending || updateRuleMut.isPending) ? "جارٍ الحفظ…" : editingRuleId !== null ? "حفظ التعديلات" : "حفظ القاعدة"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          /* r131-F8 (A4 P1-2): pulse blink → .skeleton slabs shape-matched to
             the rule row (keyword chips + two-line reply preview). */
          <div className="space-y-2">{[1,2,3].map(i => <Card key={i}><CardContent className="p-4"><div className="skeleton h-4 w-1/3 mb-2 rounded" /><div className="skeleton h-3 w-2/3 rounded" /></CardContent></Card>)}</div>
        ) : isError ? (
          /* r131-F8 (A4 P2-8): the 64px destructive-soft rounded-2xl tile →
             the canonical .state family. */
          <div className="state state-danger py-16" role="alert">
            <div className="state-icon" aria-hidden="true">
              <AlertCircle />
            </div>
            <h2 className="state-title">تعذّر تحميل القواعد</h2>
            <p className="state-desc">{(error as Error)?.message || "تعذّر الاتصال، تحقق من الإنترنت ثم أعد المحاولة"}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة</Button>
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="لا توجد قواعد رد تلقائي"
            description="أنشئ أول قاعدة من زر قاعدة جديدة أعلى الصفحة ليبدأ البوت بالرد تلقائياً على التعليقات المتطابقة."
          />
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <Card key={r.id} elevation="elevated" className="border-border/50 group">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {/* v4 §2.3 — backend returns keywords[] / reply_template / enabled;
                          the old r.keyword / r.reply_text / r.is_active rendered blanks
                          and every rule showed "نشط" even when disabled */}
                      {(r.keywords || []).map((k: string, i: number) => (
                        <code key={i} className="text-xs font-bold bg-accent-foreground/10 text-accent-foreground px-2 py-0.5 rounded border border-accent-foreground/20">
                          {k}
                        </code>
                      ))}
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${r.enabled === false ? "text-muted-foreground" : "text-success-ink"}`}>
                        <span className={`size-1.5 rounded-full ${r.enabled === false ? "bg-muted-foreground" : "bg-success"}`} />
                        {r.enabled === false ? "متوقف" : "نشط"}
                      </span>
                      <span className="text-xs text-muted-foreground" title="الأولوية — الأقل يُفحص أولاً">
                        أولوية {r.priority ?? 999}
                      </span>
                      {/* r127-F5a: replies_count is optional — `?? 0` (unreachable
                          behind the guard, but proves the type for countPhrase). */}
                      {(r.replies_count ?? 0) > 0 && (
                        <span className="text-xs text-muted-foreground">{countPhrase(r.replies_count ?? 0, "رد", "ردين", "ردود")}</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{r.reply_template}</p>
                  </div>
                  {/* v15-E6 (D5-M2 + L10): toggle/delete disclose their state
                      and target row programmatically (the icon alone isn't a
                      state for SRs — WCAG 4.1.2), and the hover-only opacity
                      reveal now also lifts on keyboard focus. */}
                  {/* v24-C2 (task 3 / A3-A1): أثناء تأكيد حذف صفٍّ يستبدل
                      العنقود كاملًا بـ«تأكيد الحذف / إلغاء» — أزرار 44px
                      (min-h-11) بلا ازدحام على الشاشات الضيقة، ونفس بصر
                      sequences/team. الفشل يُبقي التأكيد (رسالة الخطأ toast
                      تظهر) للإعادة أو الإلغاء. */}
                  <div className="flex gap-1 shrink-0 opacity-70 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                    {confirmDeleteId === r.id ? (
                      <>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMut.mutate(r.id)}
                          disabled={deleteMut.isPending && deleteMut.variables === r.id}
                          loading={deleteMut.isPending && deleteMut.variables === r.id}
                        >
                          <Trash2 className="size-3.5" /> تأكيد الحذف
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(null)}
                          aria-label={`إلغاء حذف قاعدة ${r.name}`}
                        >
                          إلغاء
                        </Button>
                      </>
                    ) : (
                      <>
                    {/* v17-E-F8 (D6 #7): زر تعديل القاعدة — يفتح النموذج
                        معبّأ بصف القاعدة لوضع PUT.
                        v25 (W-09): size-11 p-0 — هدف لمس 44px صريح (كان
                        size-8؛ الأيقونة تبقى صغيرة داخل منطقة اللمس). */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-11 p-0"
                      onClick={() => {
                        setEditingRuleId(r.id)
                        setShowForm(false)
                        setName(r.name)
                        setKeyword((r.keywords || []).join(", "))
                        setReplyText(r.reply_template || "")
                        setPriority(String(r.priority ?? 999))
                      }}
                      aria-label={`تعديل قاعدة ${r.name}`}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    {/* v25 (W-09): size-11 p-0 — هدف لمس 44px صريح (كان size-8). */}
                    <Button size="sm" variant="ghost" onClick={() => toggleMut.mutate(r.id)} disabled={toggleMut.isPending && toggleMut.variables === r.id} className="size-11 p-0" aria-pressed={r.enabled !== false} aria-label={`تبديل حالة قاعدة ${r.name}`}>
                      {r.enabled === false ? <ToggleLeft className="size-4" /> : <ToggleRight className="size-4 text-success" />}
                    </Button>
                    {/* v24-C2 (task 3 / A3-A1): الضغط الأول يكشف خطوة التأكيد
                        (لا حذف مباشر) — أزرار التأكيد تستوفي 44px افتراضيا.
                        v25 (W-09): size-11 p-0 صريح (كان size-8). */}
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(r.id)} className="size-11 p-0 hover:text-destructive" aria-label={`حذف قاعدة ${r.name}`}>
                      <Trash2 className="size-3.5" />
                    </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
