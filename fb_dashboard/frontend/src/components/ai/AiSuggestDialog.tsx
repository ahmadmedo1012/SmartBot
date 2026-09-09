"use client"

/* v17-E-F12 (D6-6 — وعد Basic «ردود ذكية AI»): dialog عرض اقتراحات الرد
 * المولّدة من POST /api/ai/suggest. المكوّن عرضيّ بالكامل — الصفحة
 * (dashboard/comments) تملك useMutation (نفس نمط replyMut) فتمرر الحالة؛
 * بذلك يحمل زر «اقترح» في صف التعليق حالةَ loading نفسها («جارٍ
 * الاقتراح…») دون تكرار منطق الطلب هنا.
 *
 * عقد الخادم (routers/ai.py · ai_service.suggest_replies):
 *   POST /api/ai/suggest  (Form: comment_text, commenter_name, page_context)
 *   → ok({ suggestions: string[1..3], intent, sentiment, confidence,
 *          latency_ms })
 *   400 «AI غير مفعل — …» حين لا مفاتيح (apiFetch يرميها ApiError عربيًا).
 *
 * الحالات: جارٍ (سبينر) · خطأ عربي + إعادة محاولة · لا اقتراحات (صادق) ·
 * قائمة 1-3 بنقرة «إدراج». إغلاق Escape/زر الإغلاق من dialog.tsx المشترك
 * (base-ui) — onOpenChange(false) يصفّر الهدف في الصفحة.
 *
 * reduced-motion: كل الحركة هنا CSS صرفة (animate-spin للسبينر + انتقالات
 * dialog.tsx) — يحيّدها الـoverride العالمي `prefers-reduced-motion: reduce`
 * في globals.css (لا حركة JS إطلاقًا في هذا المكوّن). */

import { Sparkles, Loader2, AlertCircle, RefreshCw, TextCursorInput } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

/** شكل data داخل مغلّف ok() لاستجابة /api/ai/suggest (عقد ai.py:36-39). */
export interface AiSuggestResult {
  suggestions?: string[]
  intent?: string
  sentiment?: string
  confidence?: number
  latency_ms?: number
}

export interface AiSuggestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** نص التعليق المصدر (يعرض كاقتباس، dir="auto" — قيمة فيسبوك حية) */
  commentText: string
  commenterName?: string
  /** POST /api/ai/suggest في الطريق */
  pending: boolean
  /** رسالة الخطأ العربية (ApiError.detail من apiFetch) — null عند النجاح */
  error: string | null
  /** آخر استجابة ناجحة (null قبل أول نجاح) */
  result: AiSuggestResult | null
  /** إعادة إطلاق الاقتراح لنفس التعليق */
  onRetry: () => void
  /** إدراج الاقتراح المختار في مسودة الرد لصف التعليق */
  onInsert: (text: string) => void
}

export function AiSuggestDialog({
  open,
  onOpenChange,
  commentText,
  commenterName,
  pending,
  error,
  result,
  onRetry,
  onInsert,
}: AiSuggestDialogProps) {
  /* تحويل دفاعي: العقد strings، لكن لا نثق بالمصفوفة القادمة — نصفي
   * غير-النصي والفارغ حتى لا يكسر عرض النص المباشر. */
  const suggestions = (result?.suggestions ?? []).filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent-foreground shrink-0" aria-hidden="true" />
          <DialogTitle>اقتراحات الرد بالذكاء الاصطناعي</DialogTitle>
        </div>
        <DialogDescription>
          {commenterName ? `ردود مقترحة على تعليق ${commenterName}` : "ردود مقترحة للتعليق"} —
          اختر اقتراحًا لإدراجه في مسودة الرد، ويمكنك تعديله قبل الإرسال.
        </DialogDescription>

        {/* التعليق المصدر — اقتباس مختصر بنمط رد البطاقة نفسه */}
        <blockquote
          dir="auto"
          className="rounded-lg border-s-2 border-accent-foreground bg-muted/50 p-3 text-sm text-muted-foreground"
        >
          {commentText ? commentText : "—"}
        </blockquote>

        {pending ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-center gap-2 rounded-lg border border-border/60 py-8 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            جارٍ توليد الاقتراحات…
          </div>
        ) : error ? (
          <div className="space-y-3">
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span dir="auto">{error}</span>
            </div>
            <Button size="sm" variant="outline" onClick={onRetry} className="w-full">
              <RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة
            </Button>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="space-y-3">
            <p className="rounded-lg border border-border/60 p-3 text-sm text-muted-foreground">
              لم يصل أي اقتراح — جرّب مرة أخرى أو اكتب الرد يدويًا.
            </p>
            <Button size="sm" variant="outline" onClick={onRetry} className="w-full">
              <RefreshCw className="size-3" aria-hidden="true" /> إعادة المحاولة
            </Button>
          </div>
        ) : (
          <>
            {(result?.intent || result?.sentiment) && (
              <div className="flex flex-wrap gap-1.5">
                {result?.intent && <Badge variant="info" className="text-3xs">النية: {result.intent}</Badge>}
                {result?.sentiment && <Badge variant="outline" className="text-3xs">النبرة: {result.sentiment}</Badge>}
              </div>
            )}
            <ul className="space-y-2" aria-label="الاقتراحات">
              {suggestions.map((s, i) => (
                <li key={`${i}-${s.slice(0, 12)}`} className="rounded-lg border border-border/70 bg-background p-3 transition-colors hover:border-accent-foreground/40">
                  <p dir="auto" className="text-sm leading-relaxed">{s}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => onInsert(s)}
                    aria-label={`إدراج الاقتراح ${i + 1} في مسودة الرد`}
                  >
                    <TextCursorInput className="size-3" aria-hidden="true" /> إدراج
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
