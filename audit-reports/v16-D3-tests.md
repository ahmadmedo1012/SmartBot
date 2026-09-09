# v16-D3 — Test-Suite Quality Hunt (2026-09-09)

## Time-of-day-dependent tests: exactly ONE in the whole suite
tests/test_v15_perf.py::test_b3_trend_matches_get_trend_data (:296-321; seeds :309-313 via _seed_reply :75-87 hours_ago=1/25/26/72/216; assert :321 == -50.0). _get_trend_data (fb_dashboard/_services.py:357-382) buckets by UTC calendar days. Failure window [00:00,02:00) UTC: [00:00,01:00) → today's seed lands yesterday → -100.0; [01:00,02:00) → 26h-ago seed lands day-before-yesterday → 0.0. Confirmed live at 01:40-01:45 UTC. v15 evidence ran 21:47/23:37 UTC → passed. HIGH (1/12 of uniformly-timed runs; nightly CI in window fails every night).
All other time usage classified SAFE (relative windows: expiry, due-posts, JWT, ordering w/ distinct timestamps; vitest freezes time).

## Midnight-rollover microsecond races (document-only)
test_v15_perf.py:318-320 (got vs expected recomputed across midnight), test_v15_money_core.py:1022-1032 (month anchor), :848-865 (two comments same monthly row). NEGLIGIBLE probability; F1 fix + optional skip-guard covers.

## Other flake classes
- "database is locked" v13 class: still intermittent (order-dependent pair documented at audit-reports/v15-E7-perf.md:94; 4× fresh runs green). New exposure vectors: _track_event spawn writes (fb_dashboard/_services.py:389-401) from webhook/facebook/publisher/inbox routes. Keep gate retry.
- SSE timing hazards (LOW, slow-CI): test_v14_sse.py:212-236 (approver 0.45s vs first poll) and :320-330 (0.4s) — reproduced live under load during v16 baseline (test_sse_poll_exception failed in full-suite run, 3/3 green isolated).
- No randomness/network/dict-order issues; queries order-asserted all have ORDER BY.

## Expired sim-findings TTL entries (10/12 expired at v16 start)
GREEN-flipped → prune: p10-broadcast-gate, p10-max-replies, p13-changepw-429, p13-register-race-500, p10-free-funnel (+ p13-cron-query-token after ?token= removal). STILL RED: p10-dm-gate, p10-replies-used-comments (R3 family — re-allowlist expires:"prod"), p13-ssrf-receipt-dns (fix this round), p12-wizard-focus-advance (verify green after E3 fix). Valid: p11-rtl-tab-order (expires v16), p08-crm-lead (prod).

## Battery honesty defects (root cause of stale entries)
1. Flip-detector grep bug: v15_sim_local_battery.sh:189 greps '"findingClosed": *true' in sim-findings-live.json, but db-claims.mjs:251-254 writes {status:'findingClosed'} to that file — counter structurally always 0. Fix: grep status.*findingClosed in live file.
2. SIM_ROUND stuck: db-claims.mjs:161 defaults 'v15'; battery never exports it → TTL never bites. Fix: round.env + export.

## Deterministic-time fix design
New tests/_dayseed.py: utc_day_start(ref) + seed_day(day_offset, hour) — day 0 = midpoint of elapsed today (always past+today); negative offsets = hour after that day's start. _seed_reply gains at= param. test_b3_trend seeds → at=seed_day(0/-1×2/-3/-9). Optional midnight-crossing skip guard. Verified by 24h×6 simulation: today=-50.0 stable at every run time.
