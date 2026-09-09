"use client"

/* v11-A3: extracted from PaymentDialog.tsx — the animated resolution
   screens after the payment request is sent:
   - WaitingScreen: pulsing indicator while admin approval is pending.
   - ApprovedScreen / RejectedScreen: admin decision + action buttons.
   - SuccessScreen: request acknowledged (payment still pending).
   - PendingScreen (v18 1-b): a PREVIOUS request is still pending — the
     dialog opens here instead of the form (or lands here from the 400
     «لديك طلب دفع معلق»), with cancel / wait affordances.
   Purely presentational — all state and callbacks live in the dialog. */

import { type Ref } from "react"
import { Smartphone, CheckCircle2, XCircle, Hourglass } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/format"
import type { Provider } from "./payment-constants"

interface WaitingScreenProps {
  provider: Provider
  /* v15-E5 (C-FREE1): free-plan waiting copy — «تأكيد الدفع»/«بعد التحويل»
   * are wrong for a 0 د.ل activation request. */
  freePlan?: boolean
  /* v14-E4 (D4 H-01): focus target for the step-change focus management in
   * the dialog — tabIndex=-1 makes the title programmatically focusable
   * without joining the tab order. */
  headingRef?: Ref<HTMLParagraphElement>
}

export function WaitingScreen({ provider, freePlan, headingRef }: WaitingScreenProps) {
  return (
    <div className="flex flex-col items-center py-10 space-y-6">
      {/* Animated payment indicator */}
      <div className="relative size-28">
        {/* Outer pulsing ring */}
        <div
          className="absolute inset-0 rounded-full border-2 border-accent-foreground/20 animate-ping opacity-75"
          style={{ animationDuration: "2s" }}
        />
        {/* Middle ring */}
        <div className="absolute inset-2 rounded-full border border-accent-foreground/30" />
        {/* Inner icon */}
        <div className="absolute inset-4 rounded-full bg-gradient-to-br from-accent-foreground to-accent-foreground/80 flex items-center justify-center shadow-lg shadow-accent-foreground/25">
          <Smartphone className="size-8 text-white" />
        </div>
      </div>

      {/* Title */}
      <div className="text-center space-y-1.5">
        <p ref={headingRef} tabIndex={-1} className="text-base font-bold">
          {freePlan ? "في انتظار تفعيل الخطة المجانية" : "في انتظار تأكيد الدفع"}
        </p>
        <p className="text-xs text-muted-foreground max-w-[220px] mx-auto leading-relaxed">
          {freePlan ? "سيتم التفعيل بعد موافقة الإدارة — لا يوجد أي مبلغ" : "بعد التحويل، انتظر موافقة الإدارة"}
        </p>
      </div>

      {/* Live status indicator */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/30 border border-border/20">
        <span className="relative flex size-2">
          <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75" />
          <span className="relative rounded-full size-2 bg-primary" />
        </span>
        <span className="text-2xs text-muted-foreground">
          {freePlan
            ? "بانتظار موافقة الإدارة"
            : provider === "liyana"
              ? "بانتظار تأكيد التحويل"
              : "بانتظار موافقة الإدارة"}
        </span>
      </div>

      {/* v18 (1-b): the honest admin-route line — the Telegram notification
          leaves with the POST response (v14-E1 inline send) and SSE/poll are
          live, so "close the window and come back" is now a safe promise
          instead of the old silent limbo the first customer hit. */}
      <p className="text-2xs text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
        سيصل إشعار للمسؤول فوراً — يمكنك إغلاق النافذة والعودة لاحقاً، أو انتظار الموافقة هنا
      </p>
    </div>
  )
}

interface ApprovedScreenProps {
  resolutionMsg: string
  onContinue: () => void
  /* v14-E4 (D4 H-01): focus target on the approval swap (see WaitingScreen). */
  headingRef?: Ref<HTMLParagraphElement>
}

export function ApprovedScreen({ resolutionMsg, onContinue, headingRef }: ApprovedScreenProps) {
  return (
    <div className="flex flex-col items-center py-8 space-y-6">
      <div className="relative size-20 animate-scale-in">
        <div
          className="absolute inset-0 rounded-full bg-success/20 animate-ping opacity-75"
          style={{ animationDuration: "1.5s" }}
        />
        <div className="relative size-full rounded-full bg-gradient-to-br from-success to-success/80 flex items-center justify-center shadow-lg shadow-success/30">
          <CheckCircle2 className="size-10 text-success-foreground" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <p ref={headingRef} tabIndex={-1} className="text-lg font-bold text-success animate-fade-in">
          تم الموافقة على الاشتراك
        </p>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed animate-fade-in-150">
          {resolutionMsg}
        </p>
      </div>
      <div className="animate-fade-in delay-300">
        <Button
          className="w-full h-11 rounded-xl bg-success hover:bg-success/90 text-success-foreground"
          onClick={onContinue}
        >
          الانتقال إلى لوحة التحكم
        </Button>
      </div>
    </div>
  )
}

interface RejectedScreenProps {
  resolutionMsg: string
  onClose: () => void
  onRetry: () => void
  /* v14-E4 (D4 H-01): focus target on the rejection swap (see WaitingScreen). */
  headingRef?: Ref<HTMLParagraphElement>
}

export function RejectedScreen({ resolutionMsg, onClose, onRetry, headingRef }: RejectedScreenProps) {
  return (
    <div className="flex flex-col items-center py-8 space-y-6">
      <div className="relative size-20 animate-scale-in">
        <div
          className="absolute inset-0 rounded-full bg-destructive/20 animate-ping opacity-75"
          style={{ animationDuration: "1.5s" }}
        />
        <div className="relative size-full rounded-full bg-gradient-to-br from-destructive to-destructive/80 flex items-center justify-center shadow-lg shadow-destructive/30">
          <XCircle className="size-10 text-destructive-foreground" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <p ref={headingRef} tabIndex={-1} className="text-lg font-bold text-destructive animate-fade-in">
          تم رفض طلب الاشتراك
        </p>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed animate-fade-in-150">
          {resolutionMsg}
        </p>
      </div>
      <div className="flex gap-2 w-full animate-fade-in delay-300">
        <Button
          variant="outline"
          className="flex-1 h-11 rounded-xl"
          onClick={onClose}
        >
          إغلاق
        </Button>
        <Button
          className="flex-1 h-11 rounded-xl"
          onClick={onRetry}
        >
          إعادة المحاولة
        </Button>
      </div>
    </div>
  )
}

interface SuccessScreenProps {
  onClose: () => void
  /* v14-E4 (D4 H-01): focus target on the success swap (see WaitingScreen). */
  headingRef?: Ref<HTMLParagraphElement>
}

export function SuccessScreen({ onClose, headingRef }: SuccessScreenProps) {
  return (
    <div className="flex flex-col items-center py-8 space-y-6">
      <div className="relative size-20">
        <div className="absolute inset-0 rounded-full bg-success/10 animate-scale-in" />
        <div className="relative size-full rounded-full bg-gradient-to-br from-success/20 to-success/10 flex items-center justify-center">
          <CheckCircle2 className="size-10 text-success" />
        </div>
      </div>
      <div className="text-center space-y-1">
        <p ref={headingRef} tabIndex={-1} className="text-base font-bold">تم إرسال طلب الدفع</p>
        <p className="text-xs text-muted-foreground">سيتم تفعيل اشتراكك بعد موافقة الإدارة</p>
      </div>
      <Button
        className="w-full h-11 rounded-xl"
        variant="outline"
        onClick={onClose}
      >
        إغلاق
      </Button>
    </div>
  )
}

interface PendingScreenProps {
  /* v18 (1-b): details of the pending request when known (GET /api/
   * subscriptions/pending probe) — the pending plan may differ from the plan
   * this dialog instance was opened for, so the summary names it explicitly. */
  planName?: string | null
  amount?: number | null
  onCancel: () => void
  onWait: () => void
  /* true while POST /api/subscriptions/cancel is in flight (dialog state). */
  cancelling?: boolean
  /* v14-E4 (D4 H-01): focus target on the pending swap (see WaitingScreen). */
  headingRef?: Ref<HTMLParagraphElement>
}

/* v18 (1-b): the pending-request screen — replaces the fast-vanishing 400
 * toast that left the user stuck in the payment form with no way out (the
 * production dead-end: «انتظر الموافقة أو ألغِه» promised an cancel that
 * did not exist). Same visual family as waiting/approved/rejected: icon
 * circle + centered title + copy + actions. Warning tone (amber) — a
 * decision is requested, not an error (rejected) nor a success. */
export function PendingScreen({ planName, amount, onCancel, onWait, cancelling, headingRef }: PendingScreenProps) {
  return (
    <div className="flex flex-col items-center py-8 space-y-6">
      <div className="relative size-20 animate-scale-in">
        <div
          className="absolute inset-0 rounded-full bg-warning/20 animate-ping opacity-75"
          style={{ animationDuration: "1.5s" }}
        />
        <div className="relative size-full rounded-full bg-gradient-to-br from-warning/25 to-warning/10 border border-warning/30 flex items-center justify-center shadow-lg shadow-warning/20">
          <Hourglass className="size-10 text-warning" aria-hidden="true" />
        </div>
      </div>
      <div className="text-center space-y-2">
        <p ref={headingRef} tabIndex={-1} className="text-lg font-bold text-warning animate-fade-in">
          لديك طلب دفع معلق
        </p>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed animate-fade-in-150">
          {planName
            ? `طلب «${planName}»${typeof amount === "number" && Number.isFinite(amount) ? ` بمبلغ ${formatNumber(amount)} د.ل` : ""} قيد المراجعة من قبل الإدارة.`
            : "طلبك السابق قيد المراجعة من قبل الإدارة."}{" "}
          يمكنك الانتظار حتى الموافقة، أو إلغاء الطلب وإرسال طلب جديد.
        </p>
      </div>
      <div className="w-full space-y-2 animate-fade-in delay-300">
        <Button
          className="w-full h-11 rounded-xl"
          onClick={onCancel}
          disabled={cancelling}
        >
          {cancelling ? "جارٍ الإلغاء…" : "إلغاء الطلب المعلق وإعادة المحاولة"}
        </Button>
        <Button
          variant="ghost"
          className="w-full h-11 rounded-xl"
          onClick={onWait}
        >
          الانتظار حتى الموافقة
        </Button>
      </div>
    </div>
  )
}
