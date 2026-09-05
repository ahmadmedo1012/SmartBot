"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

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
  success: "bg-green-500/10 text-green-500 border-green-500/20",
  warning: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  danger: "bg-red-500/10 text-red-500 border-red-500/20",
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
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md",
        className
      )}
    >
      <div className={cn("px-6", compact ? "h-12" : "h-14")}>
        <div className="flex items-center justify-between h-full gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {icon && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2, delay: 0.05 }}
                className="size-8 rounded-lg bg-gradient-to-br from-accent-foreground/15 to-accent-foreground/5 border border-accent-foreground/15 flex items-center justify-center text-accent-foreground shrink-0"
              >
                {icon}
              </motion.div>
            )}
            <div className="min-w-0 flex-1">
              {breadcrumbs && breadcrumbs.length > 0 && (
                <nav aria-label="breadcrumb" className="flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5">
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
                          <span className={last ? "text-foreground/80 truncate" : "truncate"}>{b.label}</span>
                        )}
                        {!last && <ChevronLeft className="size-3 opacity-50 shrink-0" />}
                      </span>
                    )
                  })}
                </nav>
              )}
              <div className="flex items-center gap-2 min-w-0">
                <motion.h1
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.06 }}
                  className={cn("font-bold tracking-tight truncate", compact ? "text-sm" : "text-base")}
                >
                  {title}
                </motion.h1>
                {status && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0",
                      TONE_MAP[status.tone || "neutral"]
                    )}
                  >
                    <span className={cn(
                      "size-1.5 rounded-full",
                      status.tone === "success" ? "bg-green-500" :
                      status.tone === "warning" ? "bg-amber-500" :
                      status.tone === "danger" ? "bg-red-500" : "bg-muted-foreground"
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
    </motion.header>
  )
}
