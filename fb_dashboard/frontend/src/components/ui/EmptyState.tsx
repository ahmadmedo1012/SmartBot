"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

interface EmptyStateProps {
  icon?: LucideIcon
  iconNode?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
    icon?: LucideIcon
  }
  secondaryAction?: {
    label: string
    onClick: () => void
    variant?: "outline" | "ghost"
  }
  className?: string
  iconClassName?: string
  iconBgClassName?: string
  size?: "sm" | "md" | "lg"
}

const SIZE_MAP = {
  sm: { wrapper: "py-12", icon: "size-12", iconBg: "size-12", title: "text-sm", desc: "text-xs" },
  md: { wrapper: "py-16", icon: "size-14", iconBg: "size-14", title: "text-base", desc: "text-sm" },
  lg: { wrapper: "py-20", icon: "size-16", iconBg: "size-16", title: "text-lg", desc: "text-sm" },
}

export function EmptyState({
  icon: Icon,
  iconNode,
  title,
  description,
  action,
  secondaryAction,
  className,
  /* r130 (W1-E D-10): the icon tile = the Madarek .state-icon recipe — grey
     family (--c-grey-bg ground / --c-grey-deep glyph), 16px radius (--r-xl).
     Was a gold accent tint at 20px. ErrorState keeps its destructive-soft
     override below. */
  iconClassName = "text-(color:--c-grey-deep)",
  iconBgClassName = "bg-(--c-grey-bg)",
  size = "md",
}: EmptyStateProps) {
  const s = SIZE_MAP[size]
  return (
    <div className={cn("flex flex-col items-center justify-center text-center px-6", s.wrapper, className)}>
      {Icon || iconNode ? (
        <div className={cn("rounded-xl border border-transparent bg-(--c-grey-bg) flex items-center justify-center mb-4", s.iconBg, iconBgClassName)}>
          {Icon ? (
            <Icon className={cn(s.icon, iconClassName)} />
          ) : (
            iconNode
          )}
        </div>
      ) : null}
      <p className={cn("font-bold mb-1 text-foreground", s.title)}>{title}</p>
      {description && (
        <p className={cn("text-muted-foreground mb-4 max-w-xs leading-relaxed", s.desc)}>{description}</p>
      )}
      {action && (
        <div className="flex gap-2 flex-wrap justify-center">
          {/* r131-F7b (A4 P2-4): the gold-tinted shadow-sm /15 override is
             retired — the Button's own shadow-sm (neutral) carries it. */}
          <Button size="sm" onClick={action.onClick}>
            {action.icon && <action.icon className="size-3.5" />}
            {action.label}
          </Button>
          {secondaryAction && (
            <Button size="sm" variant={secondaryAction.variant || "outline"} onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
  className?: string
  size?: "sm" | "md" | "lg"
}

export function ErrorState({
  title = "حدث خطأ",
  message = "تعذر الاتصال، تحقق من الإنترنت",
  onRetry,
  className,
  size = "md",
}: ErrorStateProps) {
  return (
    <EmptyState
      icon={undefined}
      iconNode={<svg className="size-6 text-destructive-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
      title={title}
      description={message}
      action={onRetry ? { label: "إعادة المحاولة", onClick: onRetry } : undefined}
      className={className}
      iconBgClassName="bg-destructive-soft"
      iconClassName="text-destructive-ink"
      size={size}
    />
  )
}

interface LoadingStateProps {
  count?: number
  className?: string
}

export function LoadingState({ count = 3, className }: LoadingStateProps) {
  /* r131-F7b (A4 P1-2 completion): the pulse-blink rows ride the canonical
   * .skeleton shimmer surface (same swap F8 landed on the 19 in-page
   * loading blocks — this shared component was the 20th, still pulsing).
   * Shape kept: icon-well + title/desc bars per row. */
  return (
    <div className={cn("space-y-3 p-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="skeleton size-10 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2 py-1">
            <div className="skeleton h-3 w-3/4" />
            <div className="skeleton h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}
