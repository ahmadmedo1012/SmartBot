"use client"

/**
 * WebhookHealthChip (P45-W1 — Initiative B, the inbox-header slice).
 *
 * A COMPACT version of the shell-level WebhookHealthBanner for the inbox —
 * the page where a dead event pipe hurts most (an operator answering
 * customers from a thread that stopped receiving their messages). Same
 * state source, same verdict law, no duplication of the banner's role:
 *
 *   - source: GET /api/facebook/settings → {connected, webhook_subscribed}
 *     (the v22-D2 persisted BotState verdict — NOT a live probe per render)
 *   - unknown (null / never probed) is NOT false: no chip. Only a
 *     probed-and-negative verdict may paint the warning.
 *   - not connected → no chip either: the inbox list itself renders the
 *     needs-setup state (the banner + the 400 list verdict own that case).
 *   - subscribed === false → the amber chip, LINKING to /connect (the
 *     banner's reconnect path — the chip adds the where-it-matters anchor)
 *   - subscribed === true → the quiet green receipt («الويبهوك يعمل»).
 */
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { RadioTower } from "lucide-react"
import { apiFetch } from "@/lib/csrf-client"
import { unwrapApi } from "@/lib/api"
import type { FacebookSettings } from "@/lib/types"

export function WebhookHealthChip() {
  const q = useQuery({
    queryKey: ["webhook-health"],
    queryFn: () =>
      apiFetch("/api/facebook/settings").then(unwrapApi<FacebookSettings>),
    /* the verdict is a persisted state (heartbeat-swept) — a minute of
     * staleness is nothing; 2min keeps it honest mid-session */
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 0,
  })

  const s = q.data
  if (!s || s.connected !== true || s.webhook_subscribed == null) return null

  if (s.webhook_subscribed === false) {
    return (
      <Link
        href="/connect"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-3 text-xs font-semibold text-warning-ink transition-colors hover:border-warning/60"
        aria-label="الويبهوك متوقف — انتقل إلى صفحة الربط لإصلاحه"
      >
        <RadioTower className="size-3.5 shrink-0" aria-hidden="true" />
        الويبهوك متوقف
      </Link>
    )
  }
  return (
    <span
      role="status"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-success/20 bg-success-soft px-3 text-xs font-semibold text-success-ink"
    >
      <RadioTower className="size-3.5 shrink-0" aria-hidden="true" />
      الويبهوك يعمل
    </span>
  )
}
