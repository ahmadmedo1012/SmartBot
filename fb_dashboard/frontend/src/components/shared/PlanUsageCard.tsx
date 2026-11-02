"use client"

/**
 * W2-BOT-3 (P42-2، تدقيق 3a) — بطاقة استخدام ردود الشهر الحالي.
 *
 * لماذا: سقف الـ100 رد الشهري (باقة مجانية) كان يُطبَّق صامتًا في محرك
 * البوت — التاجر يكتشفه فقط عند النفاد برسالة رفض غامضة. هذه البطاقة
 * تعرض نفس قراءة المحرك (GET /api/subscriptions/usage ← get_plan_limits،
 * نقطة القراءة الوحيدة) في لوحة التحكم: العدد الحالي، السقف، وشريط تقدم
 * صادق الألوان (آمن → تحذير عند 80% → خطر عند النفاد).
 *
 * الحضور: تظهر للخطط المسقوفة فقط (max_replies رقمي) — الخطط «غير
 * المحدودة» بلا بطاقة (لا ضجيج)، والفشل الصامت مقصود: تعذّر القراءة
 * لا يكسر لوحة التحكم (البطاقة تختفي — نفسها بيانات المحرك fail-open).
 */
import { useQuery } from "@tanstack/react-query"
import { Bot } from "lucide-react"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

interface UsagePayload {
  plan_name_ar: string | null
  replies_used: number
  max_replies: number | null
  period_start: string | null
  unlimited: boolean
}

export function PlanUsageCard() {
  const { data } = useQuery({
    queryKey: ["subscription-usage"],
    queryFn: async () => {
      const res = await apiFetch("/api/subscriptions/usage")
      if (!res.ok) throw new Error(`تعذّر تحميل الاستخدام (${res.status})`)
      return unwrapApi<UsagePayload>(res)
    },
    staleTime: 5 * 60_000,
    retry: 1,
  })

  /* الغياب الصادق: غير المسقوف / لم تُحمّل بعد → لا بطاقة (لا أصفار
   * مختلَقة ولا سبينر دائم على بيانات عرضية). */
  if (!data || data.unlimited || data.max_replies == null) return null

  const used = data.replies_used ?? 0
  const max = data.max_replies
  const pct = Math.min(100, Math.round((used / max) * 100))
  const remaining = Math.max(0, max - used)
  const tone = pct >= 100 ? "danger" : pct >= 80 ? "warning" : "ok"

  return (
    <div
      role="status"
      aria-label={`استخدام ردود الشهر الحالي: ${used} من ${max}`}
      className="sb-fade-up rounded-xl border border-border/70 bg-card/60 p-4"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="size-4 text-primary" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-bold">
              ردود البوت هذا الشهر
              {data.plan_name_ar ? (
                <span className="text-xs text-muted-foreground font-normal"> — باقة {data.plan_name_ar}</span>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {remaining > 0
                ? `متبقٍ ${formatNumber(remaining)} ${remaining === 1 ? "رد" : remaining === 2 ? "ردّان" : "رد"} قبل بلوغ سقف الباقة`
                : "بلغتَ سقف الباقة — الردود التلقائية متوقفة حتى تجديد الشهر أو ترقية الباقة"}
            </p>
          </div>
        </div>
        <p className="text-sm font-bold tabular-nums" dir="ltr">
          <span className={cn(
            "text-base",
            tone === "danger" && "text-destructive",
            tone === "warning" && "text-warning-ink",
          )}>{formatNumber(used)}</span>
          <span className="text-muted-foreground"> / {formatNumber(max)}</span>
        </p>
      </div>
      {/* شريط التقدم — دلالة لونية ثلاثية بلا زخرفة؛ height ثابت 6px
          (هدف اللمس 44px يغطيه الصف كله، الشريط مؤشر بصري لا عنصر تفاعل). */}
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={used}
        aria-label="نسبة استهلاك ردود الشهر"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            tone === "ok" && "bg-primary",
            tone === "warning" && "bg-warning",
            tone === "danger" && "bg-destructive",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
