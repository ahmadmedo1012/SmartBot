"use client"

import { cn } from "@/lib/utils"

/** ponytail: native button[role=switch], no radix dep.
 *  Class-level port of Smart-Menu's Switch (final-launch plan v3 §2.4):
 *  data-size tracks (18.4×32 default / 14×24 sm), bg-background thumb with
 *  RTL-aware translate, checked:bg-primary, focus ring, disabled:bg-muted —
 *  replacing the h-5/w-9/border-2 legacy shape.
 *  v24-C1: the ≥44px hit target is now the button's REAL box (h-11 min-w-11
 *  with the track + thumb centered inside). The old track-as-button shape
 *  (18.4px tall) relied on an after:-inset-y-2 pseudo hit area that peaked
 *  at 34px AND bled over neighbouring controls (A1 S3 / B4 touch). Visual
 *  track/thumb sizes and the RTL thumb-flip math (v7) are unchanged. */
export function Switch({
  checked, onCheckedChange, id, className, size = "default", disabled, ...props
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  id?: string
  className?: string
  disabled?: boolean
  size?: "sm" | "default"
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      disabled={disabled}
      className={cn(
        "peer group/switch relative inline-flex h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-transparent outline-none",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      data-size={size}
      data-checked={checked || undefined}
      data-unchecked={checked ? undefined : ""}
      {...props}
    >
      {/* v24-C1: the painted track moved off the button (which is now the
          44px hit box) onto this span — track sizes and the thumb translate
          percentages are relative to the same 32px/24px widths as before. */}
      <span
        className={cn(
          "flex items-center rounded-full transition-colors",
          "group-data-[size=default]/switch:h-[18.4px] group-data-[size=default]/switch:w-[32px]",
          "group-data-[size=sm]/switch:h-[14px] group-data-[size=sm]/switch:w-[24px]",
          checked ? "bg-primary" : "bg-input dark:bg-input/80",
          disabled && "bg-muted",
        )}
      >
        <span
          className={cn(
            "pointer-events-none block rounded-full bg-background ring-0 transition-transform",
            "group-data-[size=default]/switch:size-4",
            "group-data-[size=sm]/switch:size-3",
            checked
              ? "group-data-[size=default]/switch:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:translate-x-[calc(100%-2px)] group-data-[size=default]/switch:rtl:-translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:rtl:-translate-x-[calc(100%-2px)]"
              : "group-data-[size=default]/switch:translate-x-0 group-data-[size=sm]/switch:translate-x-0",
            "dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground",
          )}
        />
      </span>
    </button>
  )
}
