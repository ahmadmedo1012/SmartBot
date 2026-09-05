"use client"

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { Save, Landmark, Headset, RotateCcw, Info, Loader2, ArrowLeft } from "lucide-react"
import Link from "next/link"

import { SectionContainer } from "@/components/ui/SectionContainer"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { fadeUp } from "@/lib/motion"

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
    hint: "إن تُرك فارغًا يستخدم رقم هاتف الدعم نفسه",
    ltr: true,
  },
  {
    key: "support_working_hours",
    label: "ساعات العمل",
    placeholder: "السبت-الخميس 9ص-5م",
    hint: "نص حر يُعرض كما هو — مثال: 24/7",
  },
]

const ALL_KEYS = [...PAYMENT_FIELDS, ...SUPPORT_FIELDS].map((f) => f.key)

type ConfigMap = Partial<Record<string, string>>

export default function AdminSettingsPage() {
  const [config, setConfig] = useState<ConfigMap>({})
  const [orig, setOrig] = useState<ConfigMap>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
      toast.error("تعذّر تحميل الإعدادات")
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
      toast.info("لا توجد تغييرات")
      return
    }
    setSaving(true)
    try {
      const r = await apiFetch("/api/admin/config", {
        method: "POST",
        body: JSON.stringify(changed),
      })
      if (r.ok) {
        toast.success("تم حفظ الإعدادات — تسري فورًا على الموقع")
        await load()
      } else {
        const body = await r.json().catch(() => null)
        toast.error(body?.detail || "فشل الحفظ")
      }
    } catch {
      toast.error("خطأ في الاتصال")
    }
    setSaving(false)
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
      <SectionContainer className="min-h-screen flex items-center justify-center">
        <div className="size-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </SectionContainer>
    )
  }

  return (
    <SectionContainer className="min-h-screen py-8">
      <SectionHeader
        title="إعدادات المنصة"
        description="بيانات الدفع ومعلومات الدعم — تُحفظ فورًا وتظهر مباشرة للعملاء"
      />

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" /> إدارة الاشتراكات
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
        <motion.div {...fadeUp}>
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Landmark className="size-4 text-orange" /> بيانات الدفع والتحويل
              </CardTitle>
              <CardDescription>
                تظهر داخل نافذة الدفع عند الاشتراك — التحويل البنكي والمحافظ الإلكترونية
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {PAYMENT_FIELDS.map(fieldRow)}
            </CardContent>
          </Card>
        </motion.div>

        {/* Support section */}
        <motion.div {...fadeUp}>
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Headset className="size-4 text-orange" /> معلومات الدعم
              </CardTitle>
              <CardDescription>
                بيانات التواصل التي يراها العملاء في صفحة الدعم داخل لوحة التحكم
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {SUPPORT_FIELDS.map(fieldRow)}
              <div className="rounded-lg bg-orange/10 border border-orange/20 p-3 text-xs text-foreground/80 leading-relaxed">
                اترك أي حقل فارغًا للعودة إلى القيمة الافتراضية. ما تحدده هنا يلغي القيم
                الافتراضية فور النشر — دون إعادة نشر الموقع.
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </SectionContainer>
  )
}
