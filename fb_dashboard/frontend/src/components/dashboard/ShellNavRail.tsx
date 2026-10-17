"use client"

/**
 * W2-C2a — ShellNavRail: the narrow FIXED icon-only nav rail (≈80px) on the
 * inline-START edge (RIGHT in RTL, LEFT under [dir=ltr] — logical CSS only).
 * Grammar source: DASHBOARD-SHELL-SPEC.md §1/§3 — icon slots at ~52px pitch,
 * no text labels at rest, active = 2px accent bar + teal icon + soft wash,
 * bottom-anchored utility cluster (theme · settings · logout).
 *
 * Route inventory: the REAL 23-route dashboard tree, consumed from
 * defaultNavSections (AdminSidebar's exported inventory) — every existing
 * route stays reachable, tour ids are preserved for the onboarding tour,
 * and demo/activeHref semantics are not needed here (this rail is only the
 * authenticated shell's).
 */

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { LogOut, Settings } from "lucide-react"
import { defaultNavSections } from "@/components/layout/AdminSidebar"
import { ThemeToggle } from "@/components/shared/ThemeToggle"

interface ShellNavRailProps {
  onLogout: () => void
}

/* Same active-match contract as the sidebar's (root slot exact-match only,
 * children light their own slot) — kept local because the sidebar's helper
 * is module-private; the rail must not fork its semantics. */
function isActiveItem(href: string | undefined, pathname: string): boolean {
  if (!href) return false
  if (href === "/dashboard") return pathname === href
  return pathname.startsWith(href)
}

export function ShellNavRail({ onLogout }: ShellNavRailProps) {
  const pathname = usePathname() ?? ""
  const items = defaultNavSections.flatMap((s) => s.items)

  return (
    <aside className="sb-rail" aria-label="التنقل الرئيسي">
      {/* brand cap — the real mark, hairline underneath (reference: logo
          block ends at the rail's first hairline) */}
      <div className="sb-rail-brand">
        <Image
          src="/brand-icon.png"
          alt="SmartBot"
          width={64}
          height={64}
          sizes="36px"
          className="size-9 rounded-lg object-cover"
          priority
        />
      </div>

      {/* icon slots — all 23 real routes, scrollable rail (spec §1 pitch) */}
      <nav className="sb-rail-nav" aria-label="أقسام لوحة التحكم">
        {items.map((item) => {
          const active = isActiveItem(item.href, pathname)
          return (
            <Link
              key={`${item.label}-${item.href ?? ""}`}
              id={item.tourId}
              href={item.href ?? "#"}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
              className="sb-rail-item"
            >
              <item.icon className="size-[22px] shrink-0" aria-hidden="true" />
              <span className="sb-rail-tip" aria-hidden="true">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* bottom-anchored utility cluster (spec §1: icon anchored at bottom) */}
      <div className="sb-rail-footer">
        <ThemeToggle className="!size-11 mx-auto shrink-0" />
        <Link
          href="/dashboard/settings"
          aria-label="الإعدادات"
          title="الإعدادات"
          aria-current={isActiveItem("/dashboard/settings", pathname) ? "page" : undefined}
          className="sb-rail-item"
        >
          <Settings className="size-[22px] shrink-0" aria-hidden="true" />
          <span className="sb-rail-tip" aria-hidden="true">الإعدادات</span>
        </Link>
        <button
          type="button"
          onClick={onLogout}
          aria-label="تسجيل الخروج"
          title="تسجيل الخروج"
          className="sb-rail-item"
        >
          <LogOut className="size-[22px] shrink-0 rtl:-scale-x-100" aria-hidden="true" />
          <span className="sb-rail-tip" aria-hidden="true">تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  )
}
