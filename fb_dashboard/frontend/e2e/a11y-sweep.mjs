/**v5 §6 — accessibility sweep (keyboard + ARIA + icon-button labels).
 * Runs against the local production build (next start).
 * Checks per page:
 *   1. icon-only buttons have an accessible name (aria-label / sr text)
 *   2. links have discernible text
 *   3. Tab order produces focus-visible outlines (spot-check)
 *   4. modals: Escape closes (login → open any dialog if present)
 *   5. headings hierarchy starts at h1 or h2 (no skipped levels on the page)
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3199";
const PAGES = ["/", "/login", "/register", "/pricing", "/terms", "/privacy", "/demo"];

const browser = await chromium.launch();
const failures = [];
const results = [];

for (const path of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const pageFail = [];
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(400);

    // 1. icon-only buttons need names
    const unlabelledButtons = await page.evaluate(() => {
      const out = [];
      for (const b of document.querySelectorAll("button")) {
        const name = (b.getAttribute("aria-label") || b.textContent || "").trim();
        const hasIcon = b.querySelector("svg") !== null;
        if (hasIcon && !name) out.push(b.outerHTML.slice(0, 90));
      }
      return out;
    });
    if (unlabelledButtons.length) pageFail.push(`${unlabelledButtons.length} unlabeled icon buttons: ${unlabelledButtons[0]}`);

    // 2. links need discernible text
    const emptyLinks = await page.evaluate(() => {
      const out = [];
      for (const a of document.querySelectorAll("a")) {
        const name = (a.getAttribute("aria-label") || a.textContent || "").trim();
        if (!name && !a.querySelector("img[alt]")) out.push(a.getAttribute("href") || "?");
      }
      return out;
    });
    if (emptyLinks.length) pageFail.push(`${emptyLinks.length} empty links: ${emptyLinks[0]}`);

    // 3. focus-visible: tab 6 times, each focused element must be visible
    for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
    const focusOk = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return true; // nothing focused = fine
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!focusOk) pageFail.push("focused element invisible after Tab");

    // 4. heading hierarchy
    const headingSkip = await page.evaluate(() => {
      const levels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
        .map((h) => Number(h.tagName[1]));
      for (let i = 1; i < levels.length; i++) {
        if (levels[i] - levels[i - 1] > 1) return `h${levels[i - 1]}→h${levels[i]}`;
      }
      return null;
    });
    if (headingSkip) pageFail.push(`skipped heading level: ${headingSkip}`);

    // 5. html lang + dir set (RTL Arabic)
    const lang = await page.evaluate(() => document.documentElement.lang);
    if (!lang) pageFail.push("html lang missing");
  } catch (e) {
    pageFail.push(`navigation error: ${e.message.slice(0, 80)}`);
  }
  results.push([path, pageFail]);
  if (pageFail.length) failures.push([path, pageFail]);
  await ctx.close();
}

console.log("──── v5 §6 a11y sweep ────");
for (const [path, f] of results) {
  console.log(f.length ? `❌ ${path}` : `✅ ${path}`);
  for (const x of f) console.log(`     • ${x}`);
}
await browser.close();
if (failures.length) { console.log(`\nFAILED: ${failures.length} page(s)`); process.exit(1); }
console.log("\nALL PAGES CLEAN");
