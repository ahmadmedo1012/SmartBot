# v16-E4 — Frontend Performance + Slop Cleanup Report (2026-09-09)

> Agent E4 timed out during final verification; the coordinator verified all edits and completed the measurement. All code changes below were made by E4 except the csrf-client dynamic-import fix (coordinator, same mandate).

## Task 1 — AppToaster out of root providers: DONE
- providers.tsx: dynamic AppToaster import REMOVED from root Providers (comment documents the v16 move).
- Mounted (plain imports in server layouts, same pattern as QueryProvider): dashboard/layout.tsx, admin/layout.tsx, login/layout.tsx, register/layout.tsx, connect/layout.tsx, subscribe/layout.tsx — verified via repo-wide toast()/brandedToast()/premiumToast() sweep: those are the only trees that fire toasts; landing/pricing/demo/terms/privacy have zero toast call sites.
- **Coordinator follow-up (root cause found post-E4):** sonner (chunk 41h__5uxgxaji.js, 44,217 bytes) was STILL shipped on public routes via csrf-client.ts:1 static `import { premiumToast }` — every apiFetch page (landing islands, pricing) pulled it. Fixed: dynamic `import("@/lib/premium-toast")` inside handleSessionExpired() only (event-driven: a session 401), .catch-guarded. ApiGlobal401.test.ts updated: burst-dedupe + first-toast assertions now flush via vi.waitFor (dynamic import resolution). 18/18 tests green (ApiGlobal401 + csrf-client).

## Task 2 — dual-shape guards removed: DONE
admin/telegram/page.tsx:94,:122 — `Array.isArray(x) ? x : []` → `x || []` (react-query loading-undefined only; backend returns ok([...]) always — telegram_config.py:130-134,157-162). Convention v13-3 enforced.

## Task 3 — dead string-split branch removed: DONE
plan-comparison.ts:53-57 — features typed string[] (models.py:681 Column(JSON, default=list); zero string write-sites repo-wide); test file updated accordingly.

## Task 4 — before/after measurement (final, coordinator-run)
| Route | Before (v15 main) | After v16-E4 | Δ |
|---|---|---|---|
| landing | 709.7 / 221.0 | **667.4 / 208.5** | **−42.3 raw / −12.5 gz** |
| pricing | 705.2 / 220.3 | **662.7 / 208.1** | **−42.5 raw / −12.2 gz** |
| login | 708.2 / 221.2 | 707.0 / 221.8 | ±0 (toaster mounted — login fires toasts) |
| connect | 704.7 / 219.0 | 702.4 / 217.8 | −2.3 raw (toaster mounted — connect fires toasts) |
| register | 620.1 / 193.7 | 655.0 / 203.2 | +34.9 raw (toaster mounted — register fires toasts; still well under landing) |
| subscribe | 622.3 / 194.7 | 657.1 / 204.2 | +34.8 raw (toaster mounted — payment flows fire toasts) |
| COMMON BASE | 605.3 / 187.3 | **602.2 / 186.3** | −3.1 raw / −1.0 gz — budget ≤190KB gz PASS |

D5's predicted −43.2KB raw / −12.8KB gz on landing materialized exactly (−42.3/−12.5 measured). Routes that legitimately fire toasts now pay for the toaster only in their own tree.

## Gates
tsc --noEmit: 0 errors · vitest: 30 files / 245 tests green · build: clean (41/41 routes) · a11y labels: PASS.
