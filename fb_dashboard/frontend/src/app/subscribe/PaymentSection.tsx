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
      <div className="rounded-md p-5 mb-8 border-2 border-orange/30 bg-gradient-to-r from-orange-muted/80 to-white dark:from-orange-muted/20 dark:to-card">
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
      <Button className="w-full h-14 text-base font-semibold rounded-sm" size="lg" onClick={onPay}>
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
