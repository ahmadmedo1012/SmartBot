"use client"

import { Button } from "@/components/ui/button"
import { CreditCard } from "lucide-react"
import { MotionCheck } from "@/components/ui/motion-icons"
import { PaymentDialog } from "@/components/shared/PaymentDialog"
import { toArabicNumber } from "@/lib/format"

/* Ported from Smart-Menu (smart-link.ly shared identity) — the review
   step is Smart-Menu's UpgradePlanSummary card (plan chip + features +
   full-width pay CTA that opens the PaymentDialog). SmartBot's flow is
   always the "logged-in subscriber" case, so the summary doubles as the
   pre-payment review step. */

type Plan = {
  id: number
  name: string
  nameAr: string
  price: number
  features: string[]
}

export function ReviewSummary({
  currentPlan,
  onBack,
  onPay,
}: {
  currentPlan: Plan
  onBack: () => void
  onPay: () => void
}) {
  return (
    <div className="animate-fade-in max-w-lg mx-auto">
      {/* r132-F3a: the gradient tile flattened to the Smart-Menu family twin
          (SubscribeForm.tsx:526) — identical stops = a flat 5% wash + 1px
          border + rounded-2xl; the v17-S1 2-stop gradient + 2px border were
          the last r131 de-glow-tail stragglers. */}
      <div className="rounded-2xl p-5 mb-8 border border-accent-foreground/20 bg-gradient-to-r from-accent-foreground/[0.05] to-accent-foreground/[0.05]">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-lg">{currentPlan.nameAr}</p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {Number(currentPlan.price) === 0 ? "مجاني" : `${toArabicNumber(currentPlan.price)} د.ل/شهر`}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            تغيير
          </Button>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          {currentPlan.features.slice(0, 5).map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <MotionCheck className="size-3.5 text-primary shrink-0" />
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-6 text-center">
        بيانات بوتك الحالية ستبقى كما هي — سيتم تفعيل الخطة بعد موافقة الإدارة.
      </p>
      {/* r131-F7b (A4 P2-5, "subscribe radii → r10"): the pay CTA drops the
          h-14/text-base/rounded-sm overrides — the canonical lg rung
          (h-11 44px / 14px / 600 / r-md 10px). */}
      <Button size="lg" className="w-full" onClick={onPay}>
        <CreditCard className="size-5 ms-2" />
        <span className="tabular-nums">ادفع الآن ({toArabicNumber(currentPlan.price)} د.ل)</span>
      </Button>
    </div>
  )
}

export function PaymentDialogWrapper({
  open,
  onOpenChange,
  currentPlan,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  currentPlan: Plan
  onSuccess: () => void
}) {
  return (
    <PaymentDialog
      open={open}
      onOpenChange={onOpenChange}
      planId={currentPlan.id}
      planNameAr={currentPlan.nameAr}
      price={Number(currentPlan.price)}
      onSuccess={onSuccess}
    />
  )
}
