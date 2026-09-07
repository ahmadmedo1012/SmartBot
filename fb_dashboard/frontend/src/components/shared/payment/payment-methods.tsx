"use client"

/* v11-A3: extracted from PaymentDialog.tsx — the payment-method tab rail
   (ليبيانا / مدار / تحويل بنكي). The two wallet tabs disable when the plan
   price exceeds the mobile-wallet cap (auto bank-switch is owned by the
   dialog). */

import { Smartphone, Landmark } from "lucide-react"
import { useId } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { formatNumber } from "@/lib/format"
import type { Provider } from "./payment-constants"
import { LIBYANA_LABEL, MADAR_LABEL, BANK_TRANSFER_LABEL } from "./payment-constants"

interface PaymentMethodTabsProps {
  provider: Provider
  onProviderChange: (provider: Provider) => void
  requiresBank: boolean
  walletCap: number
}

export function PaymentMethodTabs({
  provider,
  onProviderChange,
  requiresBank,
  walletCap,
}: PaymentMethodTabsProps) {
  /* v14-E4 (D4 H-08): the visible label also names the button group —
   * SR users hear "طريقة الدفع، مجموعة" instead of an anonymous rail. */
  const groupLabelId = useId()
  const methods = [
    { id: "liyana" as Provider, label: LIBYANA_LABEL, icon: Smartphone, disabled: requiresBank },
    { id: "madar" as Provider, label: MADAR_LABEL, icon: Smartphone, disabled: requiresBank },
    { id: "bank" as Provider, label: BANK_TRANSFER_LABEL, icon: Landmark, disabled: false },
  ]

  return (
    <div>
      <Label id={groupLabelId}>طريقة الدفع</Label>
      <div
        role="group"
        aria-labelledby={groupLabelId}
        className="grid grid-cols-3 gap-2 mt-1.5"
      >
        {methods.map((opt) => {
          const Icon = opt.icon
          const selected = provider === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onProviderChange(opt.id)}
              disabled={opt.disabled}
              /* v14-E4 (D4 H-08, WCAG 4.1.2 name/role/VALUE): aria-pressed +
                 data-state expose WHICH method is selected programmatically
                 (same toggle-button pattern as admin:156 / messages:180 /
                 pricing:129) — the visual accent alone was invisible to AT. */
              aria-pressed={selected}
              data-state={selected ? "active" : "inactive"}
              className={cn(
                "h-14 rounded-xl border-2 text-[13px] font-medium transition-[border-color,box-shadow,color,background-color] flex flex-col items-center justify-center gap-1",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/50",
                opt.disabled && "opacity-40 cursor-not-allowed",
                selected
                  ? "border-accent-foreground bg-accent/40 dark:bg-accent/20 shadow-sm"
                  : "border-border/30 hover:border-accent-foreground/30 text-muted-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {opt.label}
            </button>
          )
        })}
      </div>
      {requiresBank && (
        <p className="text-xs text-accent-foreground mt-2">
          المبالغ فوق {formatNumber(walletCap)} د.ل تتطلب تحويل بنكي — اختر &quot;تحويل بنكي&quot; لإتمام الدفع
        </p>
      )}
    </div>
  )
}
