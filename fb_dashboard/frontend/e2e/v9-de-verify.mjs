/** v9-exec-DE verification — font fix + axe gate re-run on the fresh build.
 *
 * (a) FONT PROOF: computed font-family of body/h1/p + document.fonts.check
 *     + a real network request for cairo-arabic.woff2 (font actually used).
 * (c) AXE: 4 pages (/, /pricing, /login, /privacy) × light/dark —
 *     gate tags (wcag2a/2aa/21a/21aa) must be ZERO violations.
 * (d) joyride laziness: skip-link target presence on all 8 fixed pages.
 * Run: node e2e/v9-de-verify.mjs  (BASE_URL default http://localhost:3100)
 */
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const BASE = process.env.BASE_URL || "http://localhost:3100";
const GATE_TAGS = new Set(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
const out = { font: null, axe: [], skipTargets: [], joyride: null };

const browser = await chromium.launch();

// ── (a) FONT PROOF ─────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" });
  const page = await ctx.newPage();
  const fontRequests = [];
  page.on("request", (r) => { if (r.url().includes("/fonts/") && r.url().endsWith(".woff2")) fontRequests.push(r.url().split("/fonts/")[1]); });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  const font = await page.evaluate(() => {
    const bodyFF = getComputedStyle(document.body).fontFamily;
    const h1FF = getComputedStyle(document.querySelector("h1")).fontFamily;
    const pFF = getComputedStyle(document.querySelector("p")).fontFamily;
    return {
      bodyFF, h1FF, pFF,
      checkCairo: document.fonts.check('16px "Cairo"'),
      checkCairoArabic: document.fonts.check('16px "Cairo"', "أ"),
      checkNaskh: document.fonts.check('16px "Noto Naskh Arabic"'),
      checkReadex: document.fonts.check('16px "Readex Pro"'),
      checkNotoSansArabic: document.fonts.check('16px "Noto Sans Arabic"'),
      loadedFaces: [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} [${f.weight}]`),
    };
  });
  font.woff2Requests = fontRequests;
  out.font = font;
  console.log("FONT body:", font.bodyFF);
  console.log("FONT h1  :", font.h1FF);
  console.log("checks:", { cairo: font.checkCairo, cairoArabic: font.checkCairoArabic, readex: font.checkReadex, naskh: font.checkNaskh, notoSansArabic: font.checkNotoSansArabic });
  console.log("loaded faces:", font.loadedFaces.join(" | "));
  console.log("woff2 requested:", fontRequests.join(", "));
  await ctx.close();
}

// ── (c) AXE gate on 4 pages × 2 themes ─────────────────────────
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" });
  for (const path of ["/", "/pricing", "/login", "/privacy"]) {
    const page = await ctx.newPage();
    await page.addInitScript((th) => { try { localStorage.setItem("theme", th); } catch { } }, theme);
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(400);
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
    const gate = res.violations.filter((v) => (v.tags || []).some((t) => GATE_TAGS.has(t)));
    const advisory = res.violations.filter((v) => !(v.tags || []).some((t) => GATE_TAGS.has(t)));
    out.axe.push({ path, theme, gate: gate.length, advisory: advisory.map((a) => `${a.id}:${a.nodes.length}`) });
    console.log(`${gate.length === 0 ? "✅" : "❌"} ${path.padEnd(9)} ${theme.padEnd(5)} gate=${gate.length} advisory=${advisory.map((a) => a.id + ":" + a.nodes.length).join(",") || "none"}`);
    for (const v of gate) console.log("   GATE VIOLATION:", v.id, v.impact, v.nodes.length, v.nodes[0].target.join(" "));
    await page.close();
  }
  await ctx.close();
}

// ── skip-link target presence on the 8 fixed pages ─────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" });
  for (const path of ["/", "/pricing", "/login", "/register", "/demo", "/subscribe", "/privacy", "/terms", "/connect"]) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(350);
    const has = await page.evaluate(() => !!document.getElementById("page-content"));
    const focusable = await page.evaluate(() => {
      const el = document.getElementById("page-content");
      return el ? el.tabIndex === -1 : false;
    });
    out.skipTargets.push({ path, has, focusable });
    console.log(`${has ? "✅" : "❌"} skip-target ${path} present=${has} tabIndex-1=${focusable}`);
    await page.close();
  }
  await ctx.close();
}
await browser.close();

const gateTotal = out.axe.reduce((s, r) => s + r.gate, 0);
console.log("\n══ SUMMARY ══");
console.log("gate violations total:", gateTotal);
console.log("font body stack contains Cairo:", /Cairo/i.test(out.font.bodyFF));
console.log("Cairo loadable:", out.font.checkCairo && out.font.checkCairoArabic, "| cairo woff2 requested:", out.font.woff2Requests.some((u) => u.includes("cairo-arabic")));
console.log("Noto Sans Arabic loadable (must be false):", out.font.checkNotoSansArabic);
process.exit(gateTotal === 0 ? 0 : 1);
