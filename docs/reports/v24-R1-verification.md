# v24-R1 — Messages Thread Hardening Verification

> **Agent:** R1-THREAD (implementation; report completed by orchestrator after agent context-timeout)
> **Scope:** scroll-to-bottom FAB · new-messages pill · thread identity header · offline banner · send-queue draft safety

## Implementation summary (all tagged `v24-R1`)

| # | Task | Status |
|---|---|---|
| 1 | **Scroll-to-bottom FAB** — appears when scrolled >~300px above bottom (rAF-throttled scroll listener); 44px circular button, `aria-label="الانتقال لآخر رسالة"`, positioned above composer, RTL-safe (vertical glyph) | ✅ |
| 2 | **New-messages pill** — "رسائل جديدة (N)" above the FAB when scrolled up + new poll arrivals; excludes own in-flight optimistic replies; click → scroll bottom + reset count; resets on scroll-to-bottom | ✅ |
| 3 | **Thread identity header** — subscriber name/subject with truncation, compact 44px row | ✅ |
| 4 | **Offline banner** — window online/offline listeners flip a slim `role="status"` banner: "انقطع الاتصال بالإنترنت — سيتم إعادة المحاولة تلقائياً" (auto-dismiss on reconnect) | ✅ |
| 5 | **Draft safety on failure** — drafts clear only on SUCCESS (verified by the pinned test "a FAILED reply keeps the draft") | ✅ |

## Verification gates
- Full frontend suite: **416 passed / 51 files** (includes new MessagesPage pins: FAB-on-scroll, pill count, offline banner, draft-on-failure, URL/back pins)
- `tsc --noEmit` clean · `next build` 43/43 pages
- Follow-up hardening (v24-R4 F3/F4) layered on top by orchestrator: aria-live suppression during load/placeholder/prepend windows; push-depth stamped in `history.state`
