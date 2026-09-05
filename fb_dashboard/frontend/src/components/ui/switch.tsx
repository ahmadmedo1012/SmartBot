"use client"

import { cn } from "@/lib/utils"

/** ponytail: native button[role=switch], no radix dep.
 *  Class-level port of Smart-Menu's Switch (final-launch plan v3 §2.4):
 *  data-size tracks (18.4×32 default / 14×24 sm), bg-background thumb with
 *  RTL-aware translate, checked:bg-primary, focus ring + expanded hit area,
 *  disabled:bg-muted — replacing the h-5/w-9/border-2 legacy shape. */
export function Switch({
  checked, onCheckedChange, id, className, size = "default", ...props
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
      className={cn(
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none",
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        "data-[size=default]:h-[18.4px] data-[size=default]:w-[32px]",
        "data-[size=sm]:h-[14px] data-[size=sm]:w-[24px]",
        "dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        checked ? "bg-primary data-checked:bg-primary" : "bg-input data-unchecked:bg-input dark:data-unchecked:bg-input/80",
        "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
        className,
      )}
      data-size={size}
      data-checked={checked || undefined}
      data-unchecked={checked ? undefined : ""}
      {...props}
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
    </button>
  )
}
