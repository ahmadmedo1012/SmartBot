"use client"

/* v11-A3: extracted from PaymentDialog.tsx — the animated resolution
   screens after the payment request is sent:
   - WaitingScreen: pulsing indicator while admin approval is pending.
   - ApprovedScreen / RejectedScreen: admin decision + action buttons.
   - SuccessScreen: request acknowledged (payment still pending).
   Purely presentational — all state and callbacks live in the dialog. */

import { type Ref } from "react"
import { Smartphone, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Provider } from "./payment-constants"

interface WaitingScreenProps {
  provider: Provider
  /* v14-E4 (D4 H-01): focus target for the step-change focus management in
   * the dialog — tabIndex=-1 makes the title programmatically focusable
   * without joining the tab order. */
  headingRef?: Ref<HTMLParagraphElement>
}

export function WaitingScreen({ provider, headingRef }: WaitingScreenProps) {
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
        <p ref={headingRef} tabIndex={-1} className="text-base font-bold">في انتظار تأكيد الدفع</p>
        <p className="text-xs text-muted-foreground max-w-[220px] mx-auto leading-relaxed">
          بعد التحويل، انتظر موافقة الإدارة
        </p>
      </div>

      {/* Live status indicator */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted/30 border border-border/20">
        <span className="relative flex size-2">
          <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-75" />
          <span className="relative rounded-full size-2 bg-primary" />
        </span>
        <span className="text-2xs text-muted-foreground">
          {provider === "liyana" ? "بانتظار تأكيد التحويل" : "بانتظار موافقة الإدارة"}
        </span>
      </div>
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
