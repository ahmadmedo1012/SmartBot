"use client"

import { Crown } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

/**
 * W2-BOT-5 (P42-W3) — الحالة «متاحة في Premium» المشتركة.
 *
 * الخلفية: analytics وflows لكلٌّ منهما نسخته المحلية من PremiumLockBody
 * (الحالة الصادقة عند 403 بوابة الخطة — تاج + نسخة الخادم + دعوة
 * /subscribe)، بينما صفحتا المجدول والبث كانتا تعرضان التوست العابر فقط
 * — الفجوة المسجلة W2-BOT-5. هذا المكوّن المشترك يغلقها دون تكرار رابع.
 *
 * العقد (مرآة حرفية لنسخة flows — r131-F8 A4 P2-4 de-glow):
 *   - بئر العائلة المسطّح: أرض yellow-family بحجم 56px + family-ink
 *     للتاج (لا هالة زجاجية).
 *   - العنوان يسمّي الميزة، والنسخة إما نص الخادم الحرفي (بوابة
 *     الخطة عائلة GATE_MESSAGES — apiFetch يرفع ApiError بالتفصيل
 *     العربي) أو النص العام عند غيابه.
 *   - CTA الترقية عبر router.push (v24-C3 A2 #8: لا location.href —
 *     تحميل كامل يُسقط حالة SPA وذاكرة react-query).
 *
 * التصنيف مسؤولية الصفحة: isPlanLocked (analytics/plan-lock — P21-W5-C1)
 * يميّز عائلة البوابات («رقِّ خطتك») عن إيقاف المنظمة والصلاحيات؛
 * المكوّن لا يصنّف، يعرض فقط.
 */
export function PremiumLockCard({ title, message }: { title: string; message?: string }) {
  const router = useRouter()
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-xl bg-(--c-yellow-bg) text-(--c-yellow-ink)">
        <Crown className="size-5" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-bold">{title} — متاحة في Premium</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed" dir="auto">
          {message ?? "خطتك الحالية لا تتضمن هذه الميزة. رقِّ خطتك من صفحة الاشتراك للاطلاع عليها."}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={() => { router.push("/subscribe") }}>
        <Crown className="size-3.5" /> ترقية الخطة
      </Button>
    </div>
  )
}
