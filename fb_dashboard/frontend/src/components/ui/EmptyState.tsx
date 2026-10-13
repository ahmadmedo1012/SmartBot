"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { RobotMark, type RobotState } from "@/components/shared/RobotMark"
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
  /* phase6 r154 (P6-2-d1) — the machine grammar: the ONE SmartBot robot
     (RobotMark) hosts the icon well. `true` = idle (the bot is on duty,
     waiting — the messages-page grammar); a RobotState pins a register
     ("greeting" welcomes, "error" = the rose glitch). When neither icon,
     iconNode nor robot is passed the robot defaults to idle — every
     icon-less empty state gets the machine for free. Explicit icon /
     iconNode still win (domain glyphs stay). Decorative by role: the robot
     renders aria-hidden; title/description carry the semantics. */
  robot?: boolean | RobotState
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
  robot,
}: EmptyStateProps) {
  const s = SIZE_MAP[size]
  /* phase6 r154 — the robot register: explicit `robot` wins when no lucide
   * icon competes; icon-less + robot-less calls fall back to the idle
   * machine (the default presence). iconNode keeps its precedence over the
   * auto-robot (messages already passes RobotMark nodes explicitly). */
  const robotState: RobotState | null =
    robot === undefined
      ? (Icon || iconNode) ? null : "idle"
      : robot === false
        ? null
        : robot === true
          ? "idle"
          : robot
  return (
    <div className={cn("flex flex-col items-center justify-center text-center px-6", s.wrapper, className)}>
      {Icon || iconNode || robotState ? (
        <div className={cn("rounded-xl border border-transparent bg-(--c-grey-bg) flex items-center justify-center mb-4", s.iconBg, iconBgClassName)}>
          {Icon ? (
            <Icon className={cn(s.icon, iconClassName)} />
          ) : robotState ? (
            <RobotMark state={robotState} className={cn(s.icon, iconClassName)} />
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
  message = "تعذّر الاتصال، تحقق من الإنترنت",
  onRetry,
  className,
  size = "md",
}: ErrorStateProps) {
  return (
    <EmptyState
      /* phase6 r154 — the error register: the ONE robot in its rose glitch
       * state (visor + LED go destructive) hosts the destructive-soft well
       * — the hand-rolled alert-circle glyph retires onto the machine. */
      robot="error"
      title={title}
      description={message}
      action={onRetry ? { label: "إعادة المحاولة", onClick: onRetry } : undefined}
      className={className}
      iconBgClassName="bg-destructive-soft"
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
