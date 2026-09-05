"use client"

/**
 * SetupWarnings (final-launch plan v3 §4.1).
 *
 * The plan calls out the SILENCE problem: when the Telegram token / FB app
 * secret / page connection are missing, the dashboard just shows zero data
 * with no hint why — the owner reads it as a hidden bug. This banner makes
 * the missing setup LOUD: red for pipeline-blocking items, amber for
 * advisories, each with a direct CTA to the page that fixes it.
 *
 * Data: GET /api/setup-status (booleans only — secrets never leave server).
 * Dismissal: sessionStorage (re-appears next session; setup is still undone).
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Link2, Send, MessageSquareReply, ArrowLeft, X } from "lucide-react"
import { apiFetch } from "@/lib/csrf-client"

interface SetupStatus {
  page_connected?: boolean
  has_rules?: boolean
  platform_admin?: boolean
  telegram_configured?: boolean
  fb_webhook_secret_configured?: boolean
}

interface WarningItem {
  key: string
  critical: boolean
  icon: React.ComponentType<{ className?: string }>
  title: string
  detail: string
  cta: string
  href: string
}

const DISMISS_KEY = "sb-setup-warnings-dismissed"

export function SetupWarnings() {
  const router = useRouter()
  const [status, setStatus] = useState<SetupStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1") } catch { /* private mode */ }
    let alive = true
    apiFetch("/api/setup-status")
      .then((r) => r.json())
      .then((j) => { if (alive && j?.success) setStatus(j.data as SetupStatus) })
      .catch(() => { /* unauthenticated → banners stay hidden */ })
    return () => { alive = false }
  }, [])

  if (!status || dismissed) return null

  const warnings: WarningItem[] = []
  if (!status.page_connected) {
    warnings.push({
      key: "page",
      critical: true,
      icon: Link2,
      title: "لم يتم ربط صفحة فيسبوك",
      detail: "الرسائل والتعليقات والإعلانات لن تصل إطلاقًا — اربط صفحتك أولًا من صفحة الربط.",
      cta: "اربط صفحتك الآن",
      href: "/connect",
    })
  }
  if (status.platform_admin && !status.fb_webhook_secret_configured) {
    warnings.push({
      key: "fbsecret",
      critical: true,
      icon: AlertTriangle,
      title: "لم يتم إعداد Facebook App Secret",
      detail: "الويبهوك يرفض كل أحداث فيسبوك (401) — الصق السر من إعدادات التطبيق في فيسبوك.",
      cta: "الإعدادات",
      href: "/admin/settings",
    })
  }
  if (status.platform_admin && !status.telegram_configured) {
    warnings.push({
      key: "telegram",
      critical: true,
      icon: Send,
      title: "لم يتم إعداد بوت تليجرام — لن تصلك إشعارات",
      detail: "إشعارات الاشتراكات والدفع والتذاكر معطّلة. الصق توكن BotFather من إعدادات الأدمن.",
      cta: "الإعدادات",
      href: "/admin/settings",
    })
  }
  if (!status.has_rules && status.page_connected) {
    warnings.push({
      key: "rules",
      critical: false,
      icon: MessageSquareReply,
      title: "لا توجد قواعد رد تلائي",
      detail: "البوت متصل لكنه لن يرد على أي رسالة — أنشئ قاعدة رد واحدة على الأقل.",
      cta: "أنشئ قاعدة",
      href: "/dashboard/autoreply",
    })
  }

  if (warnings.length === 0) return null
  const critical = warnings.some((w) => w.critical)

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1") } catch { /* private mode */ }
    setDismissed(true)
  }

  return (
    <div
      role="alert"
      aria-label="تنبيهات الإعداد الناقص"
      className={`mx-4 mt-4 md:mx-6 md:mt-6 rounded-xl border p-3 sm:p-4 space-y-2.5 ${
        critical
          ? "bg-destructive/8 border-destructive/30"
          : "bg-warning/10 border-warning/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <AlertTriangle className={`size-4 shrink-0 ${critical ? "text-destructive" : "text-warning"}`} />
          {warnings.length > 1 ? "إعدادات ناقصة توقف عمل المنصة" : warnings[0].title}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="إخفاء التنبيهات لهذه الجلسة"
          className="size-7 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {warnings.map((w) => (
        <div key={w.key} className="flex flex-col sm:flex-row sm:items-center gap-2.5 rounded-lg bg-card/60 border border-border/40 px-3 py-2.5">
          <div className={`flex items-center gap-2.5 min-w-0 flex-1`}>
            <div className={`size-8 shrink-0 rounded-lg flex items-center justify-center ${
              w.critical ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"
            }`}>
              <w.icon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">{w.title}</p>
              <p className="text-xs text-muted-foreground leading-snug">{w.detail}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push(w.href)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110 transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/50"
          >
            {w.cta}
            <ArrowLeft className="size-3.5 rtl:rotate-180" />
          </button>
        </div>
      ))}
    </div>
  )
}
