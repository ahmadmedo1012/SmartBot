/**
 * v13-E6 — Sentry DSN resolution contract (v6+ §C).
 *
 * The DSN is committed on purpose and env overrides only ever DISABLE or
 * REPLACE it. These tests pin the three resolution outcomes:
 *   missing/empty → committed default · off-values (case-insensitive) →
 *   null (disabled) · anything else → the trimmed override verbatim.
 */
import { describe, expect, it } from "vitest"

import { DEFAULT_SENTRY_DSN, isSentryEnabled, resolveSentryDsn } from "./sentry-config"

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
