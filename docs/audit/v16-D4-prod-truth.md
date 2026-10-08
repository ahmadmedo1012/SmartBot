# v16-D4 — Production-Truth Hunt (2026-09-09)

## Freeze-class sweep (Vercel function freeze after response)
- routers/bot.py:195 (/api/bot/restart create_task) — latent MEDIUM (no frontend caller).
- agent_engine.py:264 (AI toggle_bot loop) — latent MEDIUM (no frontend caller).
- app/startup.py:245,256,263,340; sequence_engine.py:488; content_calendar.py:485 — SAFE (gated !IS_VERCEL, local-only).
- **routers/support.py:118 — HIGH: support-ticket Telegram notify spawn'd; dies on Vercel; NO platform-admin ticket route exists (support.py:172 tenant-check 404s admins) → owner has ZERO channels to see a ticket while user is promised 24h response (:126).**
- WS/SSE fan-outs (bot.py:196,210; pipeline.py:306,559,563; engine.py:182,690; messenger_service.py:378; alerts_routes.py:40,69) — dead-end (frontend opens no WS; zero clients).
- _services.py:401 _track_event spawn + except:pass — analytics rows lost.
- Money notifications inline (wallet.py:69-95, plans.py:171-173,271-273) — SAFE (awaited, 8s timeout).
- Broadcasts/campaigns/scheduled publishing — SAFE claim pattern.

## Heartbeat consumer latency (only driver = daily 04:00 Vercel cron; cron-job.org channel DEAD)
Broadcasts pending: up to ~24h. Scheduled campaigns: ~24h late. Scheduled posts: up to ~19-24h. Comment auto-replies: real-time via webhook, else 24h. DM: webhook ONLY — no fallback ever. Plan expiry: first-use. Fan count: 24h stale. **Sequence drip: NOTHING on Vercel — NEVER runs (scheduler gated startup.py:247-256).** Flows: manual only. ReportSchedule: no consumer. SSE payment: ≤2s but capped ~30s by maxDuration vs 600s design.

## Money-path walk: live and truthful end-to-end; remaining dead branches
- Trial branch unreachable (auth.py:219-227 needs plan_id+trial_days>0; frontend sends neither; no seeded plan has trial_days) — dec-trial-journey confirmed.
- Dormant wallet: topup/confirm/upgrade have ZERO frontend callers; PaymentRequest approvals exist only via Telegram callbacks — dec-wallet-spend confirmed stronger than documented (credit_wallet single call site, zero debit paths).
- Write-only: User.subscription_status (models.py:159) written (approvals.py:130,135; telegram.py:114), never read; user.plan_id only in Telegram path (telegram.py:113) — HTTP approvals drift; login returns user.plan (auth.py:166) — never written → always "free".
- SSE terminals (sse.py:86): "rejected"/"EXPIRED_TRIAL" never written; "cancelled" missing from close list.
- ReportSchedule rows written, zero consumers, no email stack in repo.

## Silent swallows on money/cron paths (bypass Sentry)
approvals.py:153-154 (decision notification), engine.py:408-413 (renewal notice rollback), pipeline.py:206-210 (gate log), webhooks.py:47-48 (app-secret read), _services.py:399-400, support.py:119-120, messenger_service.py:324-330 (message commit — money-adjacent DM durability).

## Top-5 production-truth actions
1. dec-cron-restore (owner) — now quantified above. 2. Fix support notify freeze + add platform-admin ticket queue. 3. Sequence drip: add cycle consumer (claim pattern) — paid feature with zero production surface. 4. DM single-point-of-failure → dec-dm-sweep. 5. Clean write-only money state + dead islands.
