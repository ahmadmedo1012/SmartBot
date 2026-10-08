# v16-D5 — Frontend Bundle & Performance (2026-09-09)

## Build + measurement (measure_bundle.py)
Build SUCCESS (Next 16.3.4 Turbopack, 41/41 routes static). Common base: 605.3 raw / **187.3 gz (PASS ≤190KB — headroom 2.7KB)**. Base composition: next runtime 228.7 + next/react 138.2 + polyfill 110.0 (38.5 gz) + infra + 2×5.6KB Sentry loaders; app-authored bytes in base ≈ 0.
Route-extra (app-code arm, v13 convention): landing 104.4 ⚠ / login 102.9 ⚠ / pricing 99.9 ⚠ / connect 99.3 ⚠ / demo 86.2 ⚠ — v13 landing was 64.7KB. **Silent drift +40.6KB raw (+5.4%) through v14+v15 because measure_bundle.py is wired into NO gate (E-CI-4 open).** Live prod landing: 710.6KB raw / 221.3KB gz.
Root: AppToaster sonner chunk 43.2KB/12.8 gz emitted as async <script src> on landing/login/pricing/connect (providers.tsx:30-33 — v12's out-of-first-load claim no longer holds under Turbopack) + 2×30.3KB Next client-infra. 3G impact: 221KB gz ≈ 4-5s at 400kbps.

## browserslist: absent (dec-browserslist open). Polyfill = 20.6% of gz baseline, every route.
## Static sync: FRESH (11/14 chunks byte-identical; 3 diffs = SENTRY_RELEASE env-inlining + turbopack runtime name).
## Runtime findings
1. HIGH ungated budget + route drift (wire measure into gate). 2. MED AppToaster preload on 4 public routes. 3. MED client-side plan fetch on pricing/subscribe (extra 3G RTT before prices). 4. MED dashboard polling 16 sites (10-20s) on visible mobile. 5. LOW-MED 566.9KB dashboard bucket on first client nav; LOW brand-icon.png 12.7KB at 36px.
GREEN: QueryClient scoped to dashboard/admin; staleTime 30s; recharts+joyride lazy absent from public HTML; fonts local woff2 swap + preloads; no raw img on public pages.

## vitest: 30 files / 243 tests ALL GREEN (34.1s). (--reporter=basic crashes on vitest 4 — use default.)

## Top-5: 1) wire measure into gate (190KB gz) 2) AppToaster out of root 3) RSC-ify pricing+subscribe (deferred dec-rsc-public) 4) browserslist via SpeedInsights data 5) network-aware polling + 36px icon.
