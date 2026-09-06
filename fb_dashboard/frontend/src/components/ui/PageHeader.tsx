"use client"

import * as React from "react"
import Link from "next/link"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { cn } from "@/lib/utils"

/* v6+ — framer-free: the header/icon/h1 entrance animations are now
 * CSS (.animate-fade-in / animate-scale-in in globals.css). PageHeader is
 * mounted by every dashboard page — the motion bundle stays out of any
 * page that (like /demo) renders it pre-login. */

interface PageHeaderProps {
  icon?: React.ReactNode
  title: string
  subtitle?: React.ReactNode
  description?: React.ReactNode
  breadcrumbs?: { label: string; href?: string }[]
  actions?: React.ReactNode
  status?: { label: string; tone?: "success" | "warning" | "danger" | "neutral" }
  className?: string
  compact?: boolean
}

const TONE_MAP = {
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  danger: "bg-destructive-soft text-destructive border-destructive/20",
  neutral: "bg-muted text-muted-foreground border-border/60",
} as const

export function PageHeader({
  icon,
  title,
  subtitle,
  description,
  breadcrumbs,
  actions,
  status,
  className,
  compact = false,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md animate-fade-in",
        className
      )}
    >
      <div className={cn("px-6", compact ? "h-12" : "h-14")}>
        <div className="flex items-center justify-between h-full gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {icon && (
              <div
                className="size-8 rounded-lg bg-gradient-to-br from-accent-foreground/15 to-accent-foreground/5 border border-accent-foreground/15 flex items-center justify-center text-accent-foreground shrink-0 animate-scale-in delay-100"
              >
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              {breadcrumbs && breadcrumbs.length > 0 && (
                <nav aria-label="مسار التنقل" className="flex items-center gap-1 text-2xs text-muted-foreground mb-0.5">
                  {breadcrumbs.map((b, i) => {
                    const last = i === breadcrumbs.length - 1
                    return (
                      <span key={i} className="flex items-center gap-1 min-w-0">
                        {b.href && !last ? (
                          <Link
                            href={b.href}
                            className="hover:text-foreground transition-colors truncate"
                          >
                            {b.label}
                          </Link>
                        ) : (
                          <span
                            className={last ? "text-foreground/80 truncate" : "truncate"}
                            aria-current={last ? "page" : undefined}
                          >
                            {b.label}
                          </span>
                        )}
                        {!last && (
                          // v7 §2.2: breadcrumb separator follows the reading flow —
                          // forward semantics; the component flips it per direction.
                          <DirectionalIcon semanticDirection="forward" variant="chevron" className="size-3 opacity-50 shrink-0" />
                        )}
                      </span>
                    )
                  })}
                </nav>
              )}
              <div className="flex items-center gap-2 min-w-0">
                <h1
                  className={cn("font-bold tracking-tight truncate animate-fade-in delay-100", compact ? "text-sm" : "text-base")}
                >
                  {title}
                </h1>
                {status && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-2xs font-medium px-2 py-0.5 rounded-full border shrink-0",
                      TONE_MAP[status.tone || "neutral"]
                    )}
                  >
                    <span className={cn(
                      "size-1.5 rounded-full",
                      status.tone === "success" ? "bg-success" :
                      status.tone === "warning" ? "bg-warning" :
                      status.tone === "danger" ? "bg-destructive" : "bg-muted-foreground"
                    )} />
                    {status.label}
                  </span>
                )}
                {subtitle && (
                  <span className="text-xs text-muted-foreground truncate hidden sm:inline">{subtitle}</span>
                )}
              </div>
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      </div>
    </header>
  )
}
