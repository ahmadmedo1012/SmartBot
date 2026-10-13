import { defineConfig } from "@playwright/test";

/**
 * v14-E6 (D9 gap 1 — e2e revival) — routing fix ONLY.
 *
 * The old config hard-wired `baseURL: http://localhost:8000` — the FastAPI
 * SPA shell, which serves the LANDING page markup for every path. /register
 * there has zero form fields, so journey.spec could never pass against its
 * configured target (the documented rot: specs were never re-aimed after
 * the Next/Vercel + API split).
 *
 * New contract (safe defaults — nothing auto-starts):
 *   PLAYWRIGHT_BASE_URL   — origin of the FULL Next stack (the dual-stack
 *                           local recipe: `next build` with
 *                           LOCAL_API_PROXY=http://127.0.0.1:8000, then
 *                           `next start -p 3200` + uvicorn on :8000; /api/*
 *                           and /webhook ride the baked same-origin proxy).
 *                           Default: http://localhost:3200. For post-deploy
 *                           runs set it to https://bot.smart-link.ly.
 *   PLAYWRIGHT_START_WEB_SERVER=1 — opt-IN: start the two servers below
 *                           (uvicorn + `next start`, assuming a build with
 *                           the proxy already baked exists). Default OFF —
 *                           CI and the coordinator bring their own stack.
 *   PLAYWRIGHT_WEB_PORT   — Next port (default 3200).
 *   PLAYWRIGHT_API_PORT   — uvicorn port (default 8000).
 *
 * The other specs (smartbot-e2e, mobile-nav) hard-code their own :8000 BASE
 * and never read this baseURL — unchanged behavior for them.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3200";
const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT || "3200";
const API_PORT = process.env.PLAYWRIGHT_API_PORT || "8000";
const START_SERVERS = process.env.PLAYWRIGHT_START_WEB_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "e2e_artifacts/html-report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  outputDir: "e2e_artifacts/test-results",
  ...(START_SERVERS
    ? {
        webServer: [
          {
            // canonical local backend (CLAUDE.md §local): repo root + app-dir.
            //
            // phase6 (P6-2-d5) — the bare `python3 -m uvicorn …` command could
            // NEVER boot in a clean sandbox, for three independent reasons
            // (each observed live here):
            //   1. Python deps: system python3 has no fastapi/sqlalchemy — the
            //      repo venv (.venv/, created via `uv venv` + `uv pip install
            //      -r requirements.txt`) is preferred when present.
            //   2. DATABASE_URL hygiene: a leaked sandbox DATABASE_URL (a
            //      Prisma-style `file:…` URL) is a NON-SQLAlchemy dialect →
            //      create_async_engine dies at import (`env -u` drops it;
            //      the app then defaults to sqlite+aiosqlite:///data.db at
            //      the repo root — schema auto-created + seeded on boot).
            //   3. config.py fail-fasts: without DEBUG=1 the boot is treated
            //      as production and an empty SECRET_KEY/CRON_SECRET raises
            //      at import. DEBUG=1 is the local-dev switch (also relaxes
            //      the CSRF origin allowlist for localhost — required for
            //      same-origin proxied /api/* form posts) and FERNET_KEY is
            //      left empty on purpose: _crypto.py then derives the cipher
            //      from SECRET_KEY (the documented dev fallback).
            command: `if [ -x .venv/bin/python ]; then PY=.venv/bin/python; else PY=python3; fi; exec env -u DATABASE_URL -u DATABASE_POOLED_URL DEBUG=1 SENTRY_DSN=off SENTRY_BOOT_CANARY=off SECRET_KEY=smartbot-e2e-dev-key CRON_SECRET=smartbot-e2e-cron "$PY" -m uvicorn runner:app --app-dir fb_dashboard --host 127.0.0.1 --port ${API_PORT} --timeout-keep-alive 120`,
            cwd: "../..",
            url: `http://127.0.0.1:${API_PORT}/healthz`,
            reuseExistingServer: true,
            timeout: 60_000,
          },
          {
            // `next start` serves the PRE-BUILT .next — the LOCAL_API_PROXY
            // rewrites were baked at BUILD time, so nothing is set here.
            command: `npx next start -p ${WEB_PORT}`,
            url: BASE_URL,
            reuseExistingServer: true,
            timeout: 60_000,
          },
        ],
      }
    : {}),
});
