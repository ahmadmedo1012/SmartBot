"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface NavLinkProps {
  href: string
  label: string
  icon: LucideIcon
  onClick?: () => void
  exact?: boolean
}

export function NavLink({ href, label, icon: Icon, onClick, exact }: NavLinkProps) {
  const pathname = usePathname()
  const isActive = exact
    ? pathname === href
    : pathname === href || (href !== "/" && pathname.startsWith(href))

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 overflow-hidden",
        isActive
          ? "bg-gradient-to-r from-orange/15 to-orange/10 text-foreground shadow-xs dark:from-orange/15 dark:to-orange/10"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {isActive && (
        <motion.span
          layoutId="activeNavIndicator"
          className="absolute end-0 top-1/2 -translate-y-1/2 w-0.5 h-7 rounded-full bg-gradient-to-b from-orange to-orange/80 shadow-sm shadow-orange/20 dark:from-orange dark:to-orange/80"
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        />
      )}
      {isActive && <span className="sr-only">(current page)</span>}
      <Icon
        className={cn(
          "size-4 shrink-0 transition-all duration-200",
          isActive && "text-orange dark:text-orange",
          !isActive && "group-hover:scale-110 group-hover:text-primary/70 group-hover:drop-shadow-sm",
        )}
      />
      <span>{label}</span>
    </Link>
  )
}
