/**
 * v13-E6 — Sentry DSN resolution contract (v6+ §C).
 *
 * The DSN is committed on purpose and env overrides only ever DISABLE or
 * REPLACE it. These tests pin the three resolution outcomes:
 *   missing/empty → committed default · off-values (case-insensitive) →
 *   null (disabled) · anything else → the trimmed override verbatim.
 */
import { describe, expect, it } from "vitest"

import { DEFAULT_SENTRY_DSN, isSentryEnabled, resolveSentryDsn, resolveSentryRelease } from "./sentry-config"

describe("resolveSentryDsn", () => {
  it("falls back to the committed default when the env value is undefined or empty", () => {
    expect(resolveSentryDsn(undefined)).toBe(DEFAULT_SENTRY_DSN)
    expect(resolveSentryDsn("")).toBe(DEFAULT_SENTRY_DSN)
  })

  it("treats whitespace-only values as empty (default after trim)", () => {
    expect(resolveSentryDsn("   ")).toBe(DEFAULT_SENTRY_DSN)
    expect(resolveSentryDsn("\t\n")).toBe(DEFAULT_SENTRY_DSN)
  })

  it("resolves every off-value to null, case-insensitively", () => {
    for (const off of ["off", "0", "disabled", "false", "no"]) {
      expect(resolveSentryDsn(off)).toBeNull()
      expect(resolveSentryDsn(off.toUpperCase())).toBeNull()
      expect(resolveSentryDsn(` ${off} `)).toBeNull()
    }
  })

  it("returns an explicit override as-is (trimmed), not the default", () => {
    expect(resolveSentryDsn("https://key@glitchtip.example.com/7")).toBe(
      "https://key@glitchtip.example.com/7",
    )
    expect(resolveSentryDsn("  https://key@glitchtip.example.com/7  ")).toBe(
      "https://key@glitchtip.example.com/7",
    )
    // a different DSN must never silently become the committed default
    expect(resolveSentryDsn("https://key@glitchtip.example.com/7")).not.toBe(
      DEFAULT_SENTRY_DSN,
    )
  })

  it("keeps the committed default verbatim (public send-only client key)", () => {
    expect(DEFAULT_SENTRY_DSN).toBe(
      "https://1ad19921c5836bd4f8a2b08fbfbff580@o4511397349097472.ingest.de.sentry.io/4512037258395728",
    )
  })
})

describe("isSentryEnabled", () => {
  it("is a plain binary gate over resolveSentryDsn", () => {
    expect(isSentryEnabled(undefined)).toBe(true)
    expect(isSentryEnabled("")).toBe(true)
    expect(isSentryEnabled("https://key@x.example.com/1")).toBe(true)
    expect(isSentryEnabled("off")).toBe(false)
    expect(isSentryEnabled("0")).toBe(false)
    expect(isSentryEnabled("Disabled")).toBe(false)
  })
})

/* v15-E6 (D14-H2): the release resolver behind the next.config.ts env gate —
 * pin the chain: explicit build vars verbatim → VERCEL_GIT_COMMIT_SHA
 * (shortened to the build-script's 7-char convention) → undefined. */
describe("resolveSentryRelease", () => {
  it("passes the explicit build-script value through verbatim (trimmed)", () => {
    // package.json build: r=$(git rev-parse --short HEAD)
    expect(resolveSentryRelease({ NEXT_PUBLIC_SENTRY_RELEASE: "558623b" })).toBe("558623b")
    expect(resolveSentryRelease({ SENTRY_RELEASE: "558623b" })).toBe("558623b")
    expect(resolveSentryRelease({ NEXT_PUBLIC_SENTRY_RELEASE: " 558623b " })).toBe("558623b")
    // NEXT_PUBLIC_ wins when both are present (matches instrumentation order)
    expect(
      resolveSentryRelease({ NEXT_PUBLIC_SENTRY_RELEASE: "aaaaaaa", SENTRY_RELEASE: "bbbbbbb" }),
    ).toBe("aaaaaaa")
    // a named release tag is NOT mangled (only the platform SHA is shortened)
    expect(resolveSentryRelease({ NEXT_PUBLIC_SENTRY_RELEASE: "smartbot-web@2.2.0" })).toBe(
      "smartbot-web@2.2.0",
    )
  })

  it("falls back to VERCEL_GIT_COMMIT_SHA shortened to the 7-char convention", () => {
    expect(
      resolveSentryRelease({ VERCEL_GIT_COMMIT_SHA: "558623b3f0e1d2a3c4b5d6e7f8a9b0c1d2e3f4a5" }),
    ).toBe("558623b")
    expect(resolveSentryRelease({ VERCEL_GIT_COMMIT_SHA: " 558623b3f0e1d2a3c4b5d6e7f8a9b0c1d2e3f4a5" })).toBe(
      "558623b",
    )
    // still wins when the explicit names exist but are empty/whitespace
    expect(
      resolveSentryRelease({ NEXT_PUBLIC_SENTRY_RELEASE: "  ", VERCEL_GIT_COMMIT_SHA: "abcdef1234567890" }),
    ).toBe("abcdef1")
  })

  it("returns undefined when no honest release exists (no inlining gate)", () => {
    expect(resolveSentryRelease({})).toBeUndefined()
    expect(resolveSentryRelease({ NEXT_PUBLIC_SENTRY_RELEASE: "", SENTRY_RELEASE: undefined })).toBeUndefined()
    expect(resolveSentryRelease({ VERCEL_GIT_COMMIT_SHA: "   " })).toBeUndefined()
  })
})
