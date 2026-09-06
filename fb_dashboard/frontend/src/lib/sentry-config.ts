/**
 * v6+ §C — Sentry wiring, shared by client instrumentation + error
 * boundaries + server instrumentation.
 *
 * The DSN is COMMITTED on purpose: Sentry DSNs are public by design —
 * client keys are send-only (they cannot read project data, cannot
 * authorise anything; same secret class as a webhook URL). This makes
 * error tracking active in every deployment without dashboard access.
 *
 * Org: subnation · Project: smartbot-web (separate from smartbot-api,
 * the FastAPI backend project — keeps frontend/backend issues clean).
 *
 * Override: set NEXT_PUBLIC_SENTRY_DSN (e.g. a self-hosted GlitchTip DSN —
 * same wire protocol). Disable: set it to the literal "off".
 */
export const DEFAULT_SENTRY_DSN =
  "https://1ad19921c5836bd4f8a2b08fbfbff580@o4511397349097472.ingest.de.sentry.io/4512037258395728"

const OFF_VALUES = new Set(["off", "0", "disabled", "false", "no"])

/**
 * Resolve the effective DSN from an env var value:
 * explicit off-value → null (disabled) · empty → committed default.
 * Call sites pass `process.env.NEXT_PUBLIC_SENTRY_DSN` (or the server-side
 * SENTRY_DSN) directly so the bundler inlines build-time values.
 */
export function resolveSentryDsn(envValue: string | undefined): string | null {
  const raw = (envValue ?? "").trim()
  if (OFF_VALUES.has(raw.toLowerCase())) return null
  return raw || DEFAULT_SENTRY_DSN
}

/** Gate for capture sites (error boundaries): true when tracking is on. */
export function isSentryEnabled(envValue: string | undefined): boolean {
  return resolveSentryDsn(envValue) !== null
}
