"use client"

import { useCallback, useEffect, useState } from "react"
import { brandedToast } from "@/lib/premium-toast"
import { Save, Landmark, Headset, RotateCcw, Info, Loader2, Send, Bot, Webhook, Sparkles } from "lucide-react"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import Link from "next/link"

import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch, ApiError } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
/* v12-E5.1: framer-motion left this route — entrances are the CSS twins
 * .sb-fade-up (components/shared/enter-motion.css): 1:1 copy of lib/motion.ts
 * fadeUp (0.5s cubic-bezier(0.165,0.84,0.44,1), y24→0), delay 0 (custom was
 * unset), guarded by prefers-reduced-motion. */
import "@/components/shared/enter-motion.css"

// ── Field descriptors ────────────────────────────────────────────────────────
type Field = {
  key: string
  label: string
  placeholder: string
  hint: string
  ltr?: boolean
  type?: string
}

const PAYMENT_FIELDS: Field[] = [
  {
    key: "balance_transfer_phone_1",
    label: "رقم محفظة مدار",
    placeholder: "0912345678",
    hint: "الرقم الذي يحوّل إليه المشتركون عبر محفظة مدار",
    ltr: true,
  },
  {
    key: "balance_transfer_phone_2",
    label: "رقم محفظة ليبيانا",
    placeholder: "0923456789",
    hint: "الرقم الذي يحوّل إليه المشتركون عبر محفظة ليبيانا",
    ltr: true,
  },
  {
    key: "bank_transfer_bank_name",
    label: "اسم البنك",
    placeholder: "بنك الواحة",
    hint: "اسم البنك المعروض في نافذة الدفع (تحويل بنكي)",
  },
  {
    key: "bank_transfer_account_number",
    label: "رقم الحساب البنكي",
    placeholder: "0021-xxxx-xxxx",
    hint: "رقم الحساب المعروض للمشتركين",
    ltr: true,
  },
  {
    key: "bank_transfer_iban",
    label: "الآيبان (IBAN)",
    placeholder: "LY83 0020 xxxx xxxx xxxx xxxx",
    hint: "اختياري — يُعرض إن وُجد",
    ltr: true,
  },
  {
    key: "mobile_wallet_cap",
    label: "الحد الأقصى للمحفظة (د.ل)",
    placeholder: "500",
    hint: "المبلغ الأقصى المقبول عبر المحافظ الإلكترونية (1-10000)",
    ltr: true,
    type: "number",
  },
]

const SUPPORT_FIELDS: Field[] = [
  {
    key: "support_email",
    label: "البريد الإلكتروني للدعم",
    placeholder: "support@smart-link.ly",
    hint: "يظهر للعملاء في صفحة الدعم — بريد صالح",
    ltr: true,
    type: "email",
  },
  {
    key: "support_phone",
    label: "هاتف الدعم",
    placeholder: "0912345678",
    hint: "رقم التواصل المعروض للعملاء",
    ltr: true,
  },
  {
    key: "support_whatsapp",
    label: "واتساب الدعم",
    placeholder: "0912345678",
    hint: "إن تُرك فارغاً يستخدم رقم هاتف الدعم نفسه",
    ltr: true,
  },
  {
    key: "support_working_hours",
    label: "ساعات العمل",
    placeholder: "السبت-الخميس 9ص-5م",
    hint: "نص حر يُعرض كما هو — مثال: 24/7",
  },
]

const TELEGRAM_FIELDS: Field[] = [
  {
    key: "telegram_bot_token",
    label: "رمز بوت تليجرام",
    placeholder: "123456789:AAHfAk...",
    hint: "من @BotFather في تليجرام — يفعّل إشعارات الدفع والاشتراك والتحكم بالموافقة",
    ltr: true,
    type: "password",
  },
  {
    key: "telegram_chat_id",
    label: "معرف الدردشة الافتراضي",
    placeholder: "123456789",
    hint: "اختياري — رقم حسابك أو @قناتك لتلقي الرسائل التجريبية والإشعارات العامة",
    ltr: true,
  },
]

const FACEBOOK_FIELDS: Field[] = [
  {
    key: "facebook_app_secret",
    label: "سر تطبيق فيسبوك (App Secret)",
    placeholder: "32 حرفاً سداسياً عشرياً",
    hint: "من developers.facebook.com ← تطبيقك ← Settings ← Basic — مطلوب لقبول أحداث الويبهوك (الرسائل والتعليقات) الموقّعة",
    ltr: true,
    type: "password",
  },
]

const AI_FIELDS: Field[] = [
  {
    key: "openai_api_key",
    label: "مفتاح OpenAI",
    placeholder: "sk-proj-...",
    hint: "يفعّل مساعد الردود الذكية (اقتراحات الردود وتحليلها) — يُستخدم فور الحفظ دون إعادة نشر",
    ltr: true,
    type: "password",
  },
  {
    key: "openai_base_url",
    label: "عنوان OpenAI البديل (اختياري)",
    placeholder: "https://api.openai.com/v1",
    hint: "اتركه فارغاً للخدمة الرسمية — أو ضع عنوان مزوّد متوافق",
    ltr: true,
  },
  {
    key: "gemini_api_key",
    label: "مفتاح Google Gemini",
    placeholder: "AIza...",
    hint: "بديل عن OpenAI — يُستخدم إن لم يوجد مفتاح OpenAI",
    ltr: true,
    type: "password",
  },
  {
    key: "ai_model",
    label: "اسم النموذج (اختياري)",
    placeholder: "gpt-4o-mini / gemini-1.5-flash",
    hint: "اتركه فارغاً للاختيار التلقائي المناسب للمزوّد",
    ltr: true,
  },
]

const ALL_KEYS = [...PAYMENT_FIELDS, ...SUPPORT_FIELDS, ...TELEGRAM_FIELDS, ...FACEBOOK_FIELDS, ...AI_FIELDS].map((f) => f.key)

type ConfigMap = Partial<Record<string, string>>

export default function AdminSettingsPage() {
  const [config, setConfig] = useState<ConfigMap>({})
  const [orig, setOrig] = useState<ConfigMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  // robots noindex — admin area
  useEffect(() => {
    const meta = document.createElement("meta")
    meta.name = "robots"
    meta.content = "noindex, nofollow"
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiFetch("/api/admin/config")
      const d = await unwrapApi(r)
      setConfig(d || {})
      setOrig(d || {})
    } catch {
      brandedToast.error("تعذّر تحميل الإعدادات")
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const dirty = ALL_KEYS.some((k) => (config[k] || "") !== (orig[k] || ""))

  const setField = (key: string, value: string) =>
    setConfig((c) => ({ ...c, [key]: value }))

  const save = async () => {
    // send only changed keys (empty string clears the DB override)
    const changed: ConfigMap = {}
    for (const k of ALL_KEYS) {
      if ((config[k] || "") !== (orig[k] || "")) changed[k] = config[k] || ""
    }
    if (Object.keys(changed).length === 0) {
      brandedToast.info("لا توجد تغييرات")
      return
    }
    setSaving(true)
    try {
      /* v15-E5 (D4-H5): apiFetch THROWS on !ok — the old `if (r.ok) … else …`
       * was dead code and the catch showed «خطأ في الاتصال» instead of the
       * backend's Arabic detail (e.g. a 403 for a tenant admin reaching the
       * platform-only endpoint). */
      await apiFetch("/api/admin/config", {
        method: "POST",
        body: JSON.stringify(changed),
      })
      brandedToast.success("تم حفظ الإعدادات — تسري فوراً على الموقع")
      await load()
    } catch (e) {
      brandedToast.error(e instanceof ApiError ? e.message : "فشل الحفظ")
    }
    setSaving(false)
  }

  const sendTelegramTest = async () => {
    setTesting(true)
    try {
      /* v15-E5 (D4-H5): same dead-branch removal — the backend's Arabic
       * detail («لم يتم إعداد توكن البوت…» / «فشل الإرسال — تحقق من
       * التوكن…») surfaces verbatim instead of «خطأ في الاتصال». */
      await apiFetch("/api/telegram/test", { method: "POST" })
      brandedToast.success("تم إرسال رسالة تجريبية — تحقق من تليجرام")
    } catch (e) {
      brandedToast.error(
        e instanceof ApiError ? e.message : "فشل الإرسال — احفظ رمز البوت أولاً",
      )
    }
    setTesting(false)
  }

  const reset = () => setConfig({ ...orig })

  const fieldRow = (f: Field) => (
    <div key={f.key} className="space-y-1.5">
      <Label htmlFor={f.key}>{f.label}</Label>
      <Input
        id={f.key}
        type={f.type || "text"}
        value={config[f.key] || ""}
        onChange={(e) => setField(f.key, e.target.value)}
        placeholder={f.placeholder}
        className="h-11 rounded-xl"
        dir={f.ltr ? "ltr" : undefined}
      />
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Info className="size-3 shrink-0" aria-hidden="true" />
        {f.hint}
      </p>
    </div>
  )

  if (loading) {
    return (
      <SectionContainer className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
        <span className="sr-only">جارٍ التحميل…</span>
        <div className="size-8 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" />
      </SectionContainer>
    )
  }

  return (
    <SectionContainer className="min-h-screen py-8">
      {/* Visually-hidden page heading — SectionHeader renders the visible title
          as h2, so heading navigation had no h1 target (v8-B5) */}
      <h1 className="sr-only">إعدادات المنصة</h1>
      <SectionHeader
        title="إعدادات المنصة"
        description="بيانات الدفع ومعلومات الدعم — تُحفظ فوراً وتظهر مباشرة للعملاء"
      />

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <DirectionalIcon semanticDirection="back" className="size-4" /> إدارة الاشتراكات
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={reset} disabled={!dirty || saving}>
            <RotateCcw className="size-4" /> تراجع
          </Button>
          <Button variant="orange" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            حفظ التغييرات
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {/* Payment section */}
        <div className="sb-fade-up">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Landmark className="size-4 text-accent-foreground" /> بيانات الدفع والتحويل
              </CardTitle>
              <CardDescription>
                تظهر داخل نافذة الدفع عند الاشتراك — التحويل البنكي والمحافظ الإلكترونية
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {PAYMENT_FIELDS.map(fieldRow)}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Support section */}
          <div className="sb-fade-up">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Headset className="size-4 text-accent-foreground" /> معلومات الدعم
                </CardTitle>
                <CardDescription>
                  بيانات التواصل التي يراها العملاء في صفحة الدعم داخل لوحة التحكم
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {SUPPORT_FIELDS.map(fieldRow)}
                <div className="rounded-lg bg-accent-foreground/10 border border-accent-foreground/20 p-3 text-xs text-foreground/80 leading-relaxed">
                  اترك أي حقل فارغاً للعودة إلى القيمة الافتراضية. ما تحدده هنا يلغي القيم
                  الافتراضية فور النشر — دون إعادة نشر الموقع.
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Telegram notifications section (plan v3 §5.3) */}
          <div className="sb-fade-up">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="size-4 text-accent-foreground" /> إشعارات تليجرام
                </CardTitle>
                <CardDescription>
                  يصلك إشعار فوري عند كل طلب دفع أو اشتراك جديد — مع أزرار موافقة/رفض مباشرة من تليجرام
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {TELEGRAM_FIELDS.map(fieldRow)}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1 min-w-[220px]">
                    بعد حفظ رمز البوت، أرسل /start لبوتك في تليجرام ثم جرّب الإرسال.
                    أضف مدراء إضافيين من صفحة تليجرام في لوحة الإدارة.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={sendTelegramTest}
                    disabled={testing || dirty}
                    className="shrink-0"
                  >
                    <Send className="size-3.5 rtl:-scale-x-100" /> {testing ? "جارٍ الإرسال…" : "إرسال رسالة تجريبية"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Facebook webhook signature (plan v3 §4 final gap) */}
          <div className="sb-fade-up">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Webhook className="size-4 text-accent-foreground" /> توقيع ويبهوك فيسبوك
                </CardTitle>
                <CardDescription>
                  بدونه يرفض النظام كل أحداث فيسبوك (الرسائل والتعليقات) — السبب الجذري لعدم ظهور أي بيانات سابقاً
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {FACEBOOK_FIELDS.map(fieldRow)}
                <div className="rounded-lg bg-accent-foreground/10 border border-accent-foreground/20 p-3 text-xs text-foreground/80 leading-relaxed">
                  بعد الحفظ سجّل الويبهوك في developers.facebook.com ← تطبيقك ← Webhooks ← Page
                  بعنوان <span className="font-mono" dir="ltr">https://api.smart-link.ly/webhook</span> واشترك في
                  حقلي <span dir="ltr">feed</span> و<span dir="ltr">messages</span>.
                </div>
              </CardContent>
            </Card>
          </div>
          {/* AI provider keys (v4 §5.20) */}
          <div className="sb-fade-up">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="size-4 text-accent-foreground" /> مفاتيح الذكاء الاصطناعي
                </CardTitle>
                <CardDescription>
                  تفعّل مساعد الردود الذكية (اقتراح ردود، تحليل مشاعر) من صفحة الأدوات — الحفظ يُطبّق فوراً
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {AI_FIELDS.map(fieldRow)}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </SectionContainer>
  )
}
