/**
 * v4 radical plan §4.2 (Team 7) — pixelmatch visual regression gate.
 *
 * Compares a screenshot of every key page against its committed baseline
 * (e2e_artifacts/visual-baselines/*.png). Fails (exit 1) when a page that
 * was NOT intentionally redesigned changes visually beyond the threshold —
 * turning "verify in the browser" from a manual step into a CI gate.
 *
 * Usage:
 *   node e2e/visual-regression.mjs                        # compare vs baselines
 *   node e2e/visual-regression.mjs --update               # (re)record baselines
 *
 * BASE_URL defaults to the local production build server
 * (http://localhost:3000 — `npx next start`); override with BASE_URL.
 */
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_DIR = join(__dirname, "e2e_artifacts", "visual-baselines");
const DIFF_DIR = join(__dirname, "e2e_artifacts", "visual-diffs");
mkdirSync(BASE_DIR, { recursive: true });
mkdirSync(DIFF_DIR, { recursive: true });

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const UPDATE = process.argv.includes("--update");
// 1% threshold — same as the plan's recommendation
const THRESHOLD = 0.01;

// Public pages (no auth) — the dashboard funnel needs cookies and has its
// own e2e suites; the token surgery pages are all public/landing/demo.
const PAGES = [
  { name: "home", path: "/" },
  { name: "login", path: "/login" },
  { name: "register", path: "/register" },
  { name: "pricing", path: "/pricing" },
  { name: "demo-stats", path: "/demo" },
  { name: "terms", path: "/terms" },
  { name: "privacy", path: "/privacy" },
];

const VIEWPORT = { width: 1440, height: 900 };

const browser = await chromium.launch();
const failures = [];
const results = [];

for (const page of PAGES) {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const p = await ctx.newPage();
  await p.goto(`${BASE_URL}${page.path}`, { waitUntil: "networkidle", timeout: 30000 });
  await p.waitForTimeout(600); // let framer-motion entrances settle
  const shot = await p.screenshot({ fullPage: false });
  const baselinePath = join(BASE_DIR, `${page.name}.png`);

  if (UPDATE || !existsSync(baselinePath)) {
    writeFileSync(baselinePath, shot);
    results.push(`RECORDED  ${page.name}`);
    await ctx.close();
    continue;
  }

  const baseline = readFileSync(baselinePath);
  const a = PNG.sync.read(baseline);
  const b = PNG.sync.read(shot);
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const aResized = new PNG({ width, height });
  aResized.data.set(a.data.subarray(0, Math.min(a.data.length, aResized.data.length)));
  const bResized = new PNG({ width, height });
  bResized.data.set(b.data.subarray(0, Math.min(b.data.length, bResized.data.length)));
  const diff = new PNG({ width, height });
  const changed = pixelmatch(aResized.data, bResized.data, diff.data, width, height, { threshold: 0.1 });

  const ratio = changed / (width * height);
  if (ratio > THRESHOLD) {
    writeFileSync(join(DIFF_DIR, `${page.name}.png`), PNG.sync.write(diff));
    writeFileSync(join(DIFF_DIR, `${page.name}-current.png`), shot);
    failures.push(`${page.name}: ${(ratio * 100).toFixed(2)}% pixels changed (${changed} px, threshold ${(THRESHOLD * 100).toFixed(1)}%)`);
    results.push(`FAIL      ${page.name} — ${(ratio * 100).toFixed(2)}% diff (see e2e_artifacts/visual-diffs/)`);
  } else {
    results.push(`PASS      ${page.name} — ${(ratio * 100).toFixed(3)}% diff`);
  }
  await ctx.close();
}

await browser.close();
console.log(results.join("\n"));
if (failures.length) {
  console.error(`\nVISUAL REGRESSION: ${failures.length}/${PAGES.length} page(s) changed beyond ${(THRESHOLD * 100).toFixed(1)}%:`);
  console.error(failures.map((f) => `  - ${f}`).join("\n"));
  console.error("If the change is INTENTIONAL, re-record with: node e2e/visual-regression.mjs --update");
  process.exit(1);
}
console.log(`\nOK: visual regression clean (${PAGES.length} pages ≤ ${(THRESHOLD * 100).toFixed(1)}% diff)`);
