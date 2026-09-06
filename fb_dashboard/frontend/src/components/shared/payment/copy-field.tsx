"use client"

/* v11-A3: extracted from PaymentDialog.tsx — the copy-to-clipboard
   primitives shared by the instruction panels:
   - CopyIconButton: the icon-only copy button (Arabic title + aria-label
     are mandatory — a11y gate for icon-only buttons).
   - CopyRow: the bank-account row (label + LTR mono value + copy button),
     repeated for bank name / account number / IBAN. */

import AnimatedCopy from "@/components/ui/copy-icon"

interface CopyIconButtonProps {
  onCopy: () => void
  title: string
  ariaLabel: string
  className?: string
  iconClassName?: string
}

/** Icon-only copy button — callers MUST pass a descriptive Arabic
    title/ariaLabel (a11y gate for icon-only buttons). */
export function CopyIconButton({
  onCopy,
  title,
  ariaLabel,
  className = "size-10 rounded-lg border border-border/30 flex items-center justify-center hover:bg-accent transition-colors",
  iconClassName = "size-4",
}: CopyIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className={className}
      title={title}
      aria-label={ariaLabel}
    >
      <AnimatedCopy className={iconClassName} />
    </button>
  )
}

interface CopyRowProps {
  label: string
  value: string
  onCopy: (value: string) => void
}

/** Bank-account row: Arabic label + LTR monospace value + icon-only copy. */
export function CopyRow({ label, value, onCopy }: CopyRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="font-mono text-sm font-bold text-left truncate" dir="ltr">
        {value}
      </span>
      <CopyIconButton
        onCopy={() => onCopy(value)}
        className="size-10 rounded-lg border border-border/30 flex items-center justify-center hover:bg-accent transition-colors shrink-0"
        title={`نسخ ${label}`}
        ariaLabel={`نسخ ${label}`}
      />
    </div>
  )
}
