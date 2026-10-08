import type { Metadata } from "next"
import type { ReactNode } from "react"

/* r131-F7 (A7 Cluster D — WCAG 2.4.2): per-route Arabic title. The page
 * component is a client island ("use client"), so the metadata export
 * lives here — a thin server layout that composes the dashboard shell
 * layout (title rides the root template "%s | SmartBot"). */
export const metadata: Metadata = {
  title: "تقويم المحتوى",
}

/* r131-F7c: Next requires every layout.tsx to ship a default export —
 * metadata-only files fail the .next/types validator ("Property 'default' is
 * missing in type typeof layout"); pass-through render — the shell stays the parent
 * dashboard/admin layout. */
export default function CalendarLayout({ children }: { children: ReactNode }) {
  return children
}
