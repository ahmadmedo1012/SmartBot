/** v9-D5 part 2 — authenticated axe + runtime probes.
 *
 *  A. Identify non-2xx requests (the per-page 404) on public pages.
 *  B. DOM proof: #page-content (skip-link target) existence per public page.
 *  C. Authed axe: /dashboard + /dashboard/messages × {light,dark} desktop,
 *     fresh tenant v9probe (wizard skipped), console captured too.
 *  D. PaymentDialog keyboard probe on /subscribe (authed): focus containment
 *     + Escape close (Base UI dialog).
 *
 * Run: node e2e/v9-authed-axe.mjs (stack must be up; see v9-run-stack.sh)
 */
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { writeFileSync } from "fs";

const BASE = process.env.BASE_URL || "http://localhost:3201";
const USR = process.env.USR || "v9probe";
const PW = process.env.PW || "V9Probe#2026";
const ART = new URL("./e2e_artifacts/", import.meta.url).pathname;

const GATE_TAGS = new Set(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
const ALL_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const PUBLIC_PAGES = ["/", "/pricing", "/login", "/register", "/demo", "/subscribe", "/privacy", "/terms", "/connect"];

const out = { failedRequests: [], skipLinkTargets: {}, auth: { pages: [] }, paymentDialog: {} };
const browser = await chromium.launch();

// ── A + B: failed requests & #page-content on public pages ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" });
  const page = await ctx.newPage();
  const failed = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "").slice(0, 90)}`);
  });
  for (const path of PUBLIC_PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(300);
    out.skipLinkTargets[path] = await page.evaluate(() => {
      const el = document.getElementById("page-content");
      if (!el) return { exists: false };
      const st = getComputedStyle(el);
      return { exists: true, display: st.display, visibility: st.visibility, focusable: el.tabIndex >= 0 };
    });
  }
  out.failedRequests = [...new Set(failed)];
  console.log("── non-2xx requests (unique):");
  out.failedRequests.forEach((f) => console.log("   ", f));
  console.log("── #page-content (skip-link target) per page:");
  for (const [p, v] of Object.entries(out.skipLinkTargets)) {
    console.log(`    ${p.padEnd(11)} ${v.exists ? "EXISTS" : "❌ MISSING"}${v.exists ? ` display=${v.display} focusable=${v.focusable}` : ""}`);
  }
  await ctx.close();
}

// ── helper: axe one page in ctx ──
async function axePage(ctx, path, theme) {
  const page = await ctx.newPage();
  const logs = { errors: [], warnings: [], pageErrors: [] };
  page.on("console", (m) => {
    if (m.type() === "error") logs.errors.push(m.text().slice(0, 260));
    else if (m.type() === "warning") logs.warnings.push(m.text().slice(0, 260));
  });
  page.on("pageerror", (e) => logs.pageErrors.push(String(e && e.message ? e.message : e).slice(0, 260)));
  await page.addInitScript((th) => { try { localStorage.setItem("theme", th); } catch {} }, theme);
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500); // react-query dashboards settle
  const themeApplied = await page.evaluate((th) => document.documentElement.classList.contains(th), theme).catch(() => null);
  const res = await new AxeBuilder({ page }).withTags(ALL_TAGS).analyze();
  const gate = [], advisory = [];
  for (const v of res.violations || []) {
    const isGate = (v.tags || []).some((t) => GATE_TAGS.has(t));
    const rec = {
      id: v.id, impact: v.impact || "—", help: v.help, nodes: v.nodes.length,
      firstSelector: v.nodes && v.nodes[0] ? v.nodes[0].target.join(" ").slice(0, 140) : "(none)",
      summary: v.nodes && v.nodes[0] ? (v.nodes[0].failureSummary || "").split("\n").filter(Boolean).slice(0, 2).join(" | ").slice(0, 200) : "",
    };
    (isGate ? gate : advisory).push(rec);
  }
  const rec = {
    path, theme, viewport: "desktop-1440", themeApplied, finalUrl: page.url().replace(BASE, ""),
    gate, advisory, passes: (res.passes || []).length,
    incomplete: (res.incomplete || []).map((i) => ({ id: i.id, nodes: i.nodes.length })),
    console: logs,
  };
  console.log(`${gate.length ? "❌" : "✅"} ${path} ${theme}: gate=${gate.length} advisory=${advisory.length} console=${logs.errors.length}/${logs.warnings.length}/${logs.pageErrors.length}`);
  for (const g of gate) console.log(`     GATE ${g.id} (${g.impact}) ×${g.nodes} — ${g.firstSelector}`);
  await page.close();
  return rec;
}

// ── C: authenticated axe ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" });
  const page = await ctx.newPage();
  let loginOk = false;
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 25000 });
    await page.fill("#username", USR).catch(() => page.fill('input[type="text"]', USR));
    await page.fill('input[type="password"]', PW);
    await page.locator("button[type=submit]").first().click();
    await page.waitForURL(/dashboard|admin/, { timeout: 25000 });
    loginOk = true;
  } catch (e) { out.auth.loginError = String(e && e.message ? e.message : e).slice(0, 200); }
  out.auth.login = { ok: loginOk, redirectedTo: page.url().replace(BASE, "") };
  console.log(`\n── auth login: ${loginOk ? "OK" : "FAIL"} → ${out.auth.login.redirectedTo}`);
  if (loginOk) {
    if (await page.locator("button:has-text('تخطي')").count() > 0) {
      await page.locator("button:has-text('تخطي')").first().click().catch(() => {});
      await page.waitForTimeout(1500);
      out.auth.onboardingSkipped = true;
    }
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    out.auth.dashboardReachable = /dashboard/.test(page.url());
    console.log(`   /dashboard reachable for tenant: ${out.auth.dashboardReachable}`);
    await page.close();
    for (const theme of ["light", "dark"]) {
      for (const path of ["/dashboard", "/dashboard/messages"]) {
        out.auth.pages.push(await axePage(ctx, path, theme));
      }
    }
  }
  await ctx.close();
}

// ── D: PaymentDialog keyboard probe (authed /subscribe) ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 25000 });
    await page.fill("#username", USR);
    await page.fill('input[type="password"]', PW);
    await page.locator("button[type=submit]").first().click();
    await page.waitForURL(/dashboard|admin/, { timeout: 25000 });
    await page.goto(`${BASE}/subscribe`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    // select the first plan card then continue
    const planBtn = page.locator("button[role='radio']").first();
    if (!(await planBtn.count())) {
      // fallback: plan cards are buttons containing د.ل/شهر
      await page.locator("button:has-text('د.ل')").first().click();
    } else await planBtn.click();
    await page.waitForTimeout(600);
    const cont = page.locator("button:has-text('متابعة')").first();
    if (await cont.count()) { await cont.click(); await page.waitForTimeout(1200); }
    // review step → pay button opens the PaymentDialog
    const pay = page.locator("button:has-text('ادفع الآن')").first();
    if (await pay.count()) { await pay.click(); await page.waitForTimeout(1500); }
    const dlg = page.locator("[role='dialog'], [role='alertdialog']").first();
    const dialogOpen = (await dlg.count()) > 0 && (await dlg.isVisible().catch(() => false));
    out.paymentDialog.opened = dialogOpen;
    console.log(`\n── PaymentDialog open: ${dialogOpen}`);
    if (dialogOpen) {
      // tab 10 times with 150ms settle (Base UI sentinel redirect is async —
      // measuring immediately after the synthetic keypress catches a transient
      // sentinel state and would false-positive a "focus escape")
      let contained = true; const seq = [];
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press("Tab");
        await page.waitForTimeout(150);
        const inDlg = await page.evaluate(() => {
          const d = document.querySelector("[role='dialog'], [role='alertdialog']");
          const a = document.activeElement;
          return !!(d && a && d.contains(a));
        });
        const sig = await page.evaluate(() => {
          const a = document.activeElement;
          return a && a !== document.body ? `${a.tagName.toLowerCase()}[${(a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 30)}]` : "body";
        });
        seq.push(sig);
        if (!inDlg) contained = false;
      }
      out.paymentDialog.focusContained = contained;
      out.paymentDialog.focusSequence = seq;
      // Escape closes
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);
      out.paymentDialog.escapeCloses = !(await dlg.isVisible().catch(() => false));
      console.log(`   focus contained in dialog: ${contained}`);
      console.log(`   Escape closes: ${out.paymentDialog.escapeCloses}`);
      console.log(`   focus seq: ${seq.join(" → ").slice(0, 400)}`);
    }
  } catch (e) { out.paymentDialog.error = String(e && e.message ? e.message : e).slice(0, 250); console.log("dialog probe error:", out.paymentDialog.error); }
  await ctx.close();
}

await browser.close();
const outPath = `${ART}/v9-authed-axe.json`;
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\njson: ${outPath}`);
