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

/**
 * v15-E6 (D14-H2) — release resolution: every event must carry the SHA that
 * was ACTUALLY built and deployed, so Sentry can bind issues to a deployment.
 *
 * Chain:
 *   1. NEXT_PUBLIC_SENTRY_RELEASE / SENTRY_RELEASE — the build script exports
 *      both (package.json "build": r=$(git rev-parse --short HEAD); …). The
 *      client inlines the NEXT_PUBLIC_ name at build time; the server file
 *      reads the other one. Explicit values pass through VERBATIM (trimmed).
 *   2. VERCEL_GIT_COMMIT_SHA — the platform-provided full 40-char SHA,
 *      available at build AND runtime on every Vercel deployment; shortened
 *      to 7 chars to match the `git rev-parse --short HEAD` convention.
 *   3. undefined — no honest release to report (event stays untagged, as
 *      before; the DSN gate still applies independently).
 *
 * Why a resolver at all: build-shell env vars do NOT persist into the Vercel
 * serverless runtime, which is exactly how 100% of live frontend events
 * shipped with release=null (D14: the v14-claimed release `541b7585` does
 * not exist in Sentry at all). next.config.ts feeds this resolver into the
 * Next `env` gate, which INLINES the resolved literal into both bundles at
 * build time — see next.config.ts.
 */
export type SentryReleaseEnv = {
  // index signature: accepts `process.env` (ProcessEnv) directly at the
  // next.config.ts gate — TS otherwise flags a weak type with no common props.
  [key: string]: string | undefined
  NEXT_PUBLIC_SENTRY_RELEASE?: string | undefined
  SENTRY_RELEASE?: string | undefined
  VERCEL_GIT_COMMIT_SHA?: string | undefined
}

export function resolveSentryRelease(env: SentryReleaseEnv): string | undefined {
  const explicit = (env.NEXT_PUBLIC_SENTRY_RELEASE ?? env.SENTRY_RELEASE ?? "").trim()
  if (explicit) return explicit
  const sha = (env.VERCEL_GIT_COMMIT_SHA ?? "").trim()
  // Vercel provides the full commit SHA; the build-script convention is the
  // 7-char short form — keep the two spellings of the same release identical.
  return sha ? sha.slice(0, 7) : undefined
}
