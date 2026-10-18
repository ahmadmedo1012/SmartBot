"use client"

/**
 * W2-C2a — ShellTopBar: the compact horizontal primary nav band (≈70px =
 * 33px utility row + 37px title row, 1px hairlines between — spec §1).
 * Row 1 (utility): brand wordmark + global links (REAL routes: /pricing,
 * /dashboard/support) + the CONDITIONAL subscribe CTA (v19 Step 1 contract:
 * only while the tenant has no live paid/trial entitlement) — the CTA is
 * the shell's one spectrum-gradient BORDER moment (spec §2 accent law).
 * Row 2 (title): the current page's REAL title derived from the route
 * inventory (defaultNavSections) — the shell stays in sync with the 24
 * real routes for free.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sparkles } from "lucide-react"
import { defaultNavSections } from "@/components/layout/AdminSidebar"

interface ShellTopBarProps {
  onSubscribe?: () => void
}

function routeTitle(pathname: string): string {
  if (pathname === "/dashboard") return "لوحة التحكم"
  const items = defaultNavSections.flatMap((s) => s.items)
  // longest-prefix match so /dashboard/notifications never resolves to a
  // shorter prefix slot
  const match = items
    .filter((i) => i.href && i.href !== "/dashboard" && pathname.startsWith(i.href))
    .sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0))[0]
  return match?.label ?? "لوحة التحكم"
}

export function ShellTopBar({ onSubscribe }: ShellTopBarProps) {
  const pathname = usePathname() ?? ""

  return (
    <header className="sb-topband">
      {/* utility row (33px) — global links, hairline below (reference y≈33) */}
      <div className="sb-topband-row1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-bold tracking-tight text-foreground">SmartBot</span>
          <span className="hidden lg:inline text-[11px] text-muted-foreground truncate">
            إدارة الردود الذكية لصفحات فيسبوك
          </span>
        </div>
        <div className="sb-topband-links">
          <Link href="/pricing" className="sb-topband-link">الأسعار</Link>
          <Link href="/dashboard/support" className="sb-topband-link">الدعم</Link>
          {onSubscribe && (
            <button type="button" onClick={onSubscribe} className="sb-spectrum-cta">
              <Sparkles className="size-3.5" aria-hidden="true" /> اشتراك
            </button>
          )}
        </div>
      </div>
      {/* title row (37px) — the current route's real title (reference y≈71).
       * p, not h1: every route's own PageHeader keeps the page's single h1
       * (fleet pattern); the band is chrome context, W2-C2b will consolidate. */}
      <div className="sb-topband-row2">
        <p className="text-[15px] font-semibold text-foreground leading-tight truncate">
          {routeTitle(pathname)}
        </p>
      </div>
    </header>
  )
}
