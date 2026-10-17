# SmartBot Phase 20 — Reference Brief: ChainGPT (marketing + app)
## Evidence base

Scraped keyless via Firecrawl (v1.26.8) on 2026-10-17:
- https://www.chaingpt.org/ → /tmp/fc-chaingpt-marketing.md (5592 lines — full marketing site)
- https://app.chaingpt.org/ → /tmp/fc-chaingpt-app.md (2862 lines — the AI Hub shell; wallet-gated interior, reCAPTCHA wall on deep views)
- https://app.chaingpt.org/pricing → same shell (wallet-gated; pricing route exists inside the app)
- https://www.awwwards.com/sites/chaingpt-blockchain-ai → /tmp/fc-awwwards.md (SOTD Sep 13 2023, **7.3/10**, by Sigma Software Design; listed Elements: Pricing, Coin Animation, Side Menu, Preloader, Blog Page)
- Search: "ChainGPT app dashboard interface design" (5 results — Behance case study, burn-dashboard blog, template roundups)
- Prior first-hand P17-3-a browser study (worklog P17-1→P17-4): bg #0a090f + hairline #353539, warm cream #efefe5 text, 4-hue ramp (violet #724ce8 → teal #26f4d0 → amber #f8cf3e → coral #fc6756), single-weight 400 display + 12px mono labels, 3-line instrument grid (17/50/17), bracket CTAs, sections fade over one canvas, robot = matte off-white full figure + black glass face + white dot eyes + rainbow bezel + breathing idle.

## 1 · Marketing site (chaingpt.org) — visual principles that transfer

- **Hero = headline + stat trio + audience line.** "Your Gateway To Web3 AI" with a three-stat instrument row (AI TOOLS `10` · TVL `$30m+` · MAUs `550k`) — 12px mono uppercase labels above big tabular values, NO card boxes around them. The stat row IS the "proof" — no icons, no decoration.
- **Awards/logos as a marquee band** under the hero (Awwwards SOTD, FWA, Binance grants) — social proof as furniture, not a section.
- **One canvas, faded sections.** Sections dissolve over the same near-black ground; hairline 1px separators (#353539 on #0a090f), no card-in-card stacking.
- **Typography hierarchy = size + weight discipline.** Display stays a single weight (400 at poster scale); hierarchy comes from scale jumps (display ≈ 9-11× body) and the 12px mono label register. No bold-everything.
- **Pricing = per-tool cards with tier tables** (General Chatbot / Auditor / Generator / TA / NFT Gen / Ask Crypto / News) — each tool lists Free-vs-Paid limits in compact hairline tables, not feature-checkmark walls.
- **Ecosystem diagram** (AI Application Layer → $CGPT Token Layer → AIVM Blockchain Layer → Labs & Launchpads) — a layered architecture read, one-line descriptions per layer.

## 2 · Application (app.chaingpt.org) — the operational UI

The public shell (pre-wallet) shows the app's real organization:
- **Grouped tool navigation with labels + per-group descriptions.** Groups: `AI Tools` (Web3 AI Chatbot; AI Smart Contracts → Auditor/Generator sub-items; AI Trading Assistant; Ask Crypto People; Cross Chain Swap; Crypto Compliance; AI Crypto Alerts; AI Web3 News; AI NFT Generator), `$CGPT Hub` (Staking, Cross-Chain Swap, DAO Governance, Supply Dashboard, Buy $CGPT DEX/CEX lists), `Dev Hub` (Developer workspace "Projects, API keys and usage" / API quickstart "Make your first request" / Plans & usage / API funding / Legacy SDK dashboard), `Pricing`, `Community`, `Legal`.
- **Dense, disciplined rows**: every group entry is a compact row — small icon, 13-14px label, one-line 12-13px muted description. No big cards for navigation; big cards only for the tool showcase grid (128px icons in a responsive grid).
- **The sub-item pattern**: a parent row expands to nested function links (Auditor/Generator under Smart Contracts) — navigation hierarchy rendered as indented compact rows, not dropdowns.
- **Persistent top chrome**: logo + Sign in + Connect Wallet; OUR ECOSYSTEM dropdown panel on the left rail; the same hairline-border language as the marketing site.
- **The app reuses the marketing tokens** (same ground, same cream, same ramp) — zero visual break between marketing and product.

## 3 · Color roles (reference reading)

- Ground #0a090f + elevated surfaces ~#111-#141419 range; hairlines #353539 (≈ 9-10% cream).
- Warm cream #efefe5 for text (not pure white) — the "paper on void" read.
- The 4-hue ramp is used SPARINGLY: panel top-lines, small chart accents, logo marks — never fills of large surfaces.
- Buttons: light cream fills with dark text (primary) + dark outline (secondary) — same porcelain-CTA law SmartBot already adopted.

## 4 · What transfers to SmartBot (Phase 20 actions)

1. **Navigation organization**: SmartBot's sidebar already groups 23 items under 5 labeled sections (الرئيسية/التحليلات/الأعمال/الإدارة/المزيد) — same organizational pattern as the reference's AI Tools/$CGPT Hub/Dev Hub clusters. Keep; do not add per-item descriptions (23 Arabic descriptions would bloat the rail; the reference's descriptions cover ~15 top-level tools only).
2. **Borders discipline**: sibling cards on one surface should read as one family — audit the demo/dashboard card borders when touching a surface (KpiCard / Card / ChartCard rungs), don't introduce new rungs.
3. **Compact data presentation**: mono HH:MM/tabular stamps on EVERY time/number cell in operational lists (the reference's "machine register"); zero-padded operational codes (01…04) on indexed tables.
4. **Typography scale**: page-title rung (`--fs-page-title`) + 13px table cells + 11px/600 header bands + 12px mono labels — the existing SmartBot canon matches the reference's scale; deviations are defects.
5. **Marketing→app token continuity**: SmartBot already shares tokens between landing and dashboard (globals.css family) — preserve.

## 5 · What must NOT be copied (identity law)

- The **robot character**: ChainGPT's matte off-white figure with black glass face + white DOT eyes + rainbow bezel is THEIR identity asset. SmartBot's Vessel (Phase 19) stays: lathe-turned porcelain, ONE cyan arc eye, swept pauldron, recessed smoked-glass lens. Craft refinements to the Vessel only if evidence demands — none found this phase beyond the P19-contract grid-hairline violation (fixed in P20-C1).
- The **mascot/silhouette/composition**: no mirrored hero layouts, no copy of ChainGPT's coin animation, side-menu choreography, or preloader.
- The **4-hue ramp values**: SmartBot's ramp stays cyan #56E2F2 → violet #9380FF → amber #FF9A69 (P17 contract). The reference's coral and its exact ramp values are not adopted.
- **Marketing claims**: ChainGPT's TVL/MAU stats and awards bands are their real data. SmartBot keeps its honest-content law (no invented metrics — the landing stats mirror the DB seed).

## 6 · Concrete implementation changes (this phase, evidence-cited)

1. Hero grid hairlines REMOVED (P19 Vessel contract: "No grid hairlines" — the P17 grid rule survived the Vessel rebuild and rendered in production; VLM-verified at 17%/83%).
2. /demo (the public app-route mirror): activity-log timestamps join the mono tabular machine register (real twin dashboard/activity already mono).
3. /demo scheduled rows: HH:MM rides the mono stamp like the real scheduled twin (Arabic day + mono time).
4. /demo audience rows gain the quiet hover wash the real audience twin carries.
5. /demo rules table gains the zero-padded mono index column the real dashboard rules table carries.
