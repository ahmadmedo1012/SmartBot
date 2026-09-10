"use client"

/**
 * WebhookHealthBanner (v22-D2 / FIX-F wave-2 finish).
 *
 * The W1-D2 root cause: pages answer "connected" while
 * GET /{page}/subscribed_apps is [] (or 403 #200 — the app lacks
 * pages_manage_metadata) → ZERO live events (messages, comments, feed)
 * reach SmartBot, and the dashboard renders zero-data with the header
 * still saying «متصل». FIX-F made the verdict a PERSISTED BotState
 * (fb_webhook_subscribed) written from connect / test / the heartbeat
 * sweep; this banner is its frontend surface — the honest-state
 * principle: «متصل لكن الويبهوك غير مفعل».
 *
 * Contract with GET /api/facebook/settings (facebook_routes.py):
 *   - ``connected``: page_id + token present
 *   - ``webhook_subscribed``: ``null`` = NEVER PROBED (unknown is NOT
 *     false — only a probed-and-negative verdict may drive the banner),
 *     ``false`` = probed and not subscribed, ``true`` = healthy → hidden
 *   - ``webhook_state.missing``: the exact Graph permissions to grant
 *
 * NOT dismissible (a health signal — unlike SetupWarnings there is no X
 * and no sessionStorage: hiding a dead event pipe would reintroduce the
 * silence this banner exists to break). The banner disappears by itself
 * the moment a re-connect subscribes the page.
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { RadioTower } from "lucide-react"
import { DirectionalIcon } from "@/components/ui/directional-icon"
import { apiFetch } from "@/lib/csrf-client"

interface FacebookSettings {
  connected?: boolean
  webhook_subscribed?: boolean | null
  webhook_state?: {
    subscribed?: boolean
    error?: string
    missing?: string[]
    source?: string
  } | null
}

export function WebhookHealthBanner() {
  const router = useRouter()
  const [settings, setSettings] = useState<FacebookSettings | null>(null)

  useEffect(() => {
    let alive = true
    apiFetch("/api/facebook/settings")
      .then((r) => r.json())
      .then((j) => { if (alive && j?.success) setSettings(j.data as FacebookSettings) })
      .catch(() => { /* unauthenticated / transient — banner stays hidden */ })
    return () => { alive = false }
  }, [])

  // Unknown (null / never probed) is NOT false — only a probed-and-negative
  // verdict may paint the banner (the backend's v22-D2 contract).
  if (settings?.connected !== true || settings?.webhook_subscribed !== false) {
    return null
  }

  const missing = (settings?.webhook_state?.missing ?? []).filter(Boolean)
  const detail = missing.length
    ? `الصلاحيات الناقصة لدى فيسبوك: ${missing.join("، ")} — امنحها لتطبيق SmartBot من developers.facebook.com ثم أعد الربط لتفعيل الرسائل والتعليقات اللحظية.`
    : "راجع صلاحيات التطبيق في developers.facebook.com ثم أعد الربط من صفحة الربط لتفعيل الرسائل والتعليقات اللحظية."

  return (
    <div
      role="alert"
      aria-label="تنبيه حالة الويبهوك"
      className="mx-4 mt-2 rounded-xl border bg-warning/10 border-warning/30 p-3 sm:p-4 md:mx-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="size-8 shrink-0 rounded-lg flex items-center justify-center bg-warning/15 text-warning">
            <RadioTower className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight text-foreground">
              متصل لكن الويبهوك غير مفعل — الرسائل والتعليقات اللحظية معطلة
            </p>
            <p className="text-xs text-muted-foreground leading-snug">{detail}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/connect")}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110 transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent-foreground/50"
        >
          إصلاح الربط
          <DirectionalIcon semanticDirection="forward" className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
