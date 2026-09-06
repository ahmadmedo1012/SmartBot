/** v9-D5 — LIVE axe-core runtime audit (deepest a11y + runtime evidence).
 *
 * Matrix: 9 public pages × {light,dark} × {desktop-1440, mobile-375}
 *   + authenticated /dashboard & /dashboard/messages (dark+light, desktop)
 *   + focus-order walk (12 Tabs) on /login & /subscribe
 *   + keyboard-trap probe (30 Tabs) on /subscribe & /demo
 *
 * Hard gate tags: wcag2a, wcag2aa, wcag21a, wcag21aa.
 * 'best-practice' violations are REPORTED separately (advisory, not gating).
 *
 * Theme forcing: next-themes attribute="class" defaultTheme="dark" enableSystem
 *   → localStorage.theme = 'light'|'dark' via addInitScript (pre-hydration),
 *   verified post-load via html.classList.
 *
 * Console + page errors are captured per page (hydration warnings = gold).
 * Output: e2e/e2e_artifacts/v9-axe-results.json + screenshots of top offenders.
 *
 * Run: node e2e/v9-axe-sweep.mjs   (BASE_URL default http://localhost:3199,
 * expects `next start` built with LOCAL_API_PROXY for the authed section;
 * creds: USR/PW env or v9probe/V9Probe#2026 auto-registered via /api/register)
 */
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE_URL || "http://localhost:3199";
const USR = process.env.USR || "v9probe";
const PW = process.env.PW || "V9Probe#2026";
const ART = new URL("./e2e_artifacts/", import.meta.url).pathname;
mkdirSync(ART, { recursive: true });

const PUBLIC_PAGES = ["/", "/pricing", "/login", "/register", "/demo", "/subscribe", "/privacy", "/terms", "/connect"];
const THEMES = ["light", "dark"];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 375, height: 812 },
];
const ALL_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const GATE_TAGS = new Set(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);

const t0 = Date.now();
const results = [];

function shortSel(target) {
  if (!target) return "(none)";
  return target.slice(0, 160);
}

async function attach(page, theme) {
  const logs = { errors: [], warnings: [], pageErrors: [] };
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error") logs.errors.push(m.text().slice(0, 300));
    else if (t === "warning") logs.warnings.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => logs.pageErrors.push(String(e && e.message ? e.message : e).slice(0, 300)));
  await page.addInitScript((th) => {
    try { localStorage.setItem("theme", th); } catch { /* ignore */ }
  }, theme);
  return logs;
}

async function loadPage(page, path) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 25000 });
  } catch {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
  }
  await page.waitForTimeout(450);
}

function classifyViolations(violations) {
  const gate = [];
  const advisory = [];
  for (const v of violations || []) {
    const isGate = (v.tags || []).some((t) => GATE_TAGS.has(t));
    const rec = {
      id: v.id,
      impact: v.impact || "—",
      help: v.help,
      tags: (v.tags || []).filter((t) => GATE_TAGS.has(t) || t === "best-practice"),
      nodes: v.nodes ? v.nodes.length : 0,
      firstSelector: v.nodes && v.nodes[0] ? shortSel(v.nodes[0].target.join(" ")) : "(none)",
      nodeSelectors: (v.nodes || []).slice(0, 5).map((n) => shortSel((n.target || []).join(" "))),
      summary: v.nodes && v.nodes[0] ? (v.nodes[0].failureSummary || "").split("\n").filter(Boolean).slice(0, 2).join(" | ").slice(0, 220) : "",
    };
    if (isGate) gate.push(rec); else advisory.push(rec);
  }
  return { gate, advisory };
}

async function axeCombo(ctx, path, theme, vp) {
  const page = await ctx.newPage();
  const logs = await attach(page, theme);
  await loadPage(page, path);
  const themeApplied = await page
    .evaluate((th) => document.documentElement.classList.contains(th), theme)
    .catch(() => null);
  const finalUrl = page.url().replace(BASE, "");
  let axe = null;
  let err = null;
  try {
    const res = await new AxeBuilder({ page }).withTags(ALL_TAGS).analyze();
    axe = {
      violations: classifyViolations(res.violations),
      passes: (res.passes || []).length,
      incomplete: (res.incomplete || []).map((i) => ({ id: i.id, nodes: (i.nodes || []).length })),
      inapplicable: (res.inapplicable || []).length,
    };
  } catch (e) {
    err = String(e && e.message ? e.message : e).slice(0, 200);
  }
  const rec = {
    path, theme, viewport: vp.name, finalUrl, themeApplied, axe, err,
    console: {
      errors: logs.errors, warnings: logs.warnings, pageErrors: logs.pageErrors,
    },
  };
  results.push(rec);
  const g = axe ? axe.violations.gate.length : "?";
  const a = axe ? axe.violations.advisory.length : "?";
  const ce = logs.errors.length, cw = logs.warnings.length, pe = logs.pageErrors.length;
  console.log(
    `${err ? "ERR " : g === 0 ? "✅ " : "❌ "} ${path.padEnd(11)} ${theme.padEnd(5)} ${vp.name.padEnd(7)} ` +
    `gate=${g} advisory=${a} console(err/warn/page)=${ce}/${cw}/${pe}` +
    (themeApplied === false ? " ⚠ THEME NOT APPLIED" : "")
  );
  await page.close();
  return rec;
}

const browser = await chromium.launch();

// ══════ SECTION 1: public matrix ══════
for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "ar" });
    for (const path of PUBLIC_PAGES) {
      await axeCombo(ctx, path, theme, vp).catch((e) => console.log(`HARD FAIL ${path} ${theme} ${vp.name}: ${String(e).slice(0, 100)}`));
    }
    await ctx.close();
  }
}

// ══════ SECTION 2: authenticated (dashboard + messages, dark+light, desktop) ══════
const authSection = { login: null, pages: [] };
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" });
  // ensure the probe user exists (fresh local DB); ignore "already exists"
  const reg = await ctx.request
    .post(`${BASE}/api/register`, { data: { username: USR, email: `${USR}@smartbot.local`, password: PW, name: "مسبار v9" } })
    .catch((e) => null);
  authSection.registerStatus = reg ? `${reg.status()}` : "request-failed";

  const page = await ctx.newPage();
  const logs = await attach(page, "dark");
  let loginOk = false;
  try {
    await loadPage(page, "/login");
    await page.fill("#username", USR).catch(() => page.fill('input[type="text"]', USR));
    await page.fill('input[type="password"]', PW);
    await page.locator("button[type=submit]").first().click();
    await page.waitForURL(/dashboard/, { timeout: 25000 });
    loginOk = true;
  } catch (e) {
    authSection.loginError = String(e && e.message ? e.message : e).slice(0, 200);
  }
  authSection.login = { ok: loginOk, url: page.url().replace(BASE, ""), console: { errors: logs.errors, warnings: logs.warnings, pageErrors: logs.pageErrors } };
  console.log(`\n── auth: login=${loginOk ? "OK" : "FAIL"} register=${authSection.registerStatus} url=${authSection.login.url}`);

  if (loginOk) {
    // dismiss onboarding wizard overlay if present (fresh tenant)
    try {
      if (await page.locator("button:has-text('تخطي')").count() > 0) {
        await page.locator("button:has-text('تخطي')").first().click();
        await page.waitForTimeout(1500);
        authSection.onboardingSkipped = true;
      }
    } catch { /* ignore */ }
    await page.close();

    for (const theme of THEMES) {
      for (const path of ["/dashboard", "/dashboard/messages"]) {
        const p2 = await ctx.newPage();
        const rec = await axeCombo(ctx, path, theme, VIEWPORTS[0]);
        // extra settle time for react-query dashboards
        authSection.pages.push({ path, theme, gate: rec.axe ? rec.axe.violations.gate.length : null });
        await p2.close();
      }
    }
  }
  await ctx.close();
}

// ══════ SECTION 3: focus order walk (12 Tabs) on /login & /subscribe ══════
async function focusWalk(path, n) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => { (document.activeElement || document.body).blur?.(); document.body.focus?.(); window.focus?.(); });
  const seq = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { tag: "body", name: "", sig: "body" };
      const name =
        el.getAttribute("aria-label") ||
        (el.labels && el.labels[0] ? el.labels[0].textContent.trim() : "") ||
        el.textContent.trim() ||
        el.getAttribute("placeholder") ||
        el.getAttribute("title") || "";
      const tag = el.tagName.toLowerCase() + (el.getAttribute("type") ? `[${el.getAttribute("type")}]` : "");
      const href = el.getAttribute("href");
      const id = el.id ? `#${el.id}` : "";
      return {
        tag: tag + (href ? `[href=${href.slice(0, 30)}]` : "") + id,
        name: name.replace(/\s+/g, " ").slice(0, 60),
        sig: `${tag}${id}${href ? href.slice(0, 30) : ""}|${name.replace(/\s+/g, " ").slice(0, 30)}`,
      };
    });
    seq.push(info);
  }
  await ctx.close();
  return seq;
}

const focusOrder = {};
for (const path of ["/login", "/subscribe"]) {
  focusOrder[path] = await focusWalk(path, 12);
  console.log(`\n── focus order ${path}:`);
  focusOrder[path].forEach((f, i) => console.log(`   ${String(i + 1).padStart(2)}. ${f.tag.padEnd(18)} "${f.name}"`));
}

// ══════ SECTION 4: keyboard trap probe (30 Tabs) on /subscribe & /demo ══════
async function trapProbe(path, n) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(500);
  const seq = [];
  let stuck = 0, maxStuck = 0;
  let prev = null;
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    const sig = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return "body";
      const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}[${name}]`;
    });
    seq.push(sig);
    if (prev !== null && sig === prev) { stuck++; maxStuck = Math.max(maxStuck, stuck); } else stuck = 0;
    prev = sig;
  }
  const revisits = {};
  for (const s of seq) revisits[s] = (revisits[s] || 0) + 1;
  const loopSuspects = Object.entries(revisits).filter(([, c]) => c >= 3);
  await ctx.close();
  return { tabs: n, consecutiveStuckMax: maxStuck, loopSuspects, sequence: seq };
}

const keyboardTrap = {};
for (const path of ["/subscribe", "/demo"]) {
  keyboardTrap[path] = await trapProbe(path, 30);
  const k = keyboardTrap[path];
  console.log(`\n── trap probe ${path}: consecutiveStuckMax=${k.consecutiveStuckMax} loopSuspects=${JSON.stringify(k.loopSuspects)}`);
}

await browser.close();

// ══════ SECTION 5: screenshots of top 3 offending combos ══════
const ranked = [...results].filter((r) => r.axe && r.axe.violations.gate.length > 0)
  .sort((a, b) => b.axe.violations.gate.length - a.axe.violations.gate.length);
const top3 = ranked.slice(0, 3);
if (top3.length) {
  const b2 = await chromium.launch();
  for (const r of top3) {
    const ctx = await b2.newContext({
      viewport: r.viewport === "mobile" ? { width: 375, height: 812 } : { width: 1440, height: 900 },
      locale: "ar",
    });
    const page = await ctx.newPage();
    await attach(page, r.theme);
    await loadPage(page, r.path);
    const file = `${ART}/v9-axe-${r.path.replace(/\//g, "_") || "home"}-${r.theme}-${r.viewport}.png`;
    await page.screenshot({ path: file, fullPage: false }).catch(() => {});
    console.log(`shot: ${file} (gate=${r.axe.violations.gate.length})`);
    await ctx.close();
  }
  await b2.close();
}

// ══════ SECTION 6: aggregate + save JSON ══════
const agg = {
  combos: results.length,
  gateTotal: results.reduce((s, r) => s + (r.axe ? r.axe.violations.gate.length : 0), 0),
  advisoryTotal: results.reduce((s, r) => s + (r.axe ? r.axe.violations.advisory.length : 0), 0),
  cleanCombos: results.filter((r) => r.axe && r.axe.violations.gate.length === 0).length,
  byRule: {},
  consoleErrors: 0,
  consoleWarnings: 0,
  pageErrors: 0,
};
for (const r of results) {
  for (const v of r.axe ? r.axe.violations.gate : []) {
    const key = `${v.id} (${v.impact})`;
    agg.byRule[key] = agg.byRule[key] || { count: 0, nodes: 0, pages: new Set() };
    agg.byRule[key].count++;
    agg.byRule[key].nodes += v.nodes;
    agg.byRule[key].pages.add(`${r.path} ${r.theme}/${r.viewport}`);
  }
  agg.consoleErrors += r.console.errors.length;
  agg.consoleWarnings += r.console.warnings.length;
  agg.pageErrors += r.console.pageErrors.length;
}
for (const k of Object.keys(agg.byRule)) agg.byRule[k].pages = [...agg.byRule[k].pages];

const out = {
  meta: {
    base: BASE, startedAt: new Date(t0).toISOString(), durationSec: Math.round((Date.now() - t0) / 1000),
    tags: ALL_TAGS, gateTags: [...GATE_TAGS], userAgent: "playwright-chromium",
  },
  aggregate: agg,
  results,
  authSection,
  focusOrder,
  keyboardTrap,
  topOffenders: top3.map((r) => ({ path: r.path, theme: r.theme, viewport: r.viewport, gate: r.axe.violations.gate })),
};
const outPath = `${ART}/v9-axe-results.json`;
writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log(`\n══ v9-D5 axe sweep summary ══`);
console.log(`combos=${agg.combos} clean=${agg.cleanCombos} gateViolations=${agg.gateTotal} advisory(best-practice)=${agg.advisoryTotal}`);
console.log(`console: errors=${agg.consoleErrors} warnings=${agg.consoleWarnings} pageErrors=${agg.pageErrors}`);
console.log(`byRule:`);
for (const [k, v] of Object.entries(agg.byRule)) console.log(`  ${k}: ${v.count} combos, ${v.nodes} nodes — e.g. ${v.pages[0]}`);
console.log(`json: ${outPath}`);
console.log(`duration: ${out.meta.durationSec}s`);
