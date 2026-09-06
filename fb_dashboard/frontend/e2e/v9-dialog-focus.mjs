/** v9-D5 part 3 — PaymentDialog (Base UI modal) focus-trap deep probe.
 * Logs, per Tab press: active element, dialog existence/visibility, and
 * whether the page behind is inert/aria-hidden (true modal semantics).
 * Also probes Shift+Tab wrap and re-Tab after wrap.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3199";
const USR = process.env.USR || "v9probe";
const PW = process.env.PW || "V9Probe#2026";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 25000 });
await page.fill("#username", USR);
await page.fill('input[type="password"]', PW);
await page.locator("button[type=submit]").first().click();
await page.waitForURL(/dashboard|admin/, { timeout: 25000 });

await page.goto(`${BASE}/subscribe`, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2500);
const radio = page.locator("button[role='radio']").first();
if (await radio.count()) await radio.click();
else await page.locator("button:has-text('د.ل')").first().click();
await page.waitForTimeout(700);
await page.locator("button:has-text('متابعة')").first().click();
await page.waitForTimeout(1000);
await page.locator("button:has-text('ادفع الآن')").first().click();
await page.waitForTimeout(1800);

const state = () =>
  page.evaluate(() => {
    const dlg = document.querySelector("[role='dialog'], [role='alertdialog']");
    const a = document.activeElement;
    const sig = a && a !== document.body ? `${a.tagName.toLowerCase()}${a.id ? "#" + a.id : ""}[${(a.getAttribute("aria-label") || a.textContent || a.getAttribute("placeholder") || "").trim().slice(0, 28)}]` : "body";
    return {
      sig,
      dialogVisible: !!(dlg && dlg.offsetParent !== null),
      dialogCount: document.querySelectorAll("[role='dialog'],[role='alertdialog']").length,
      bodyInert: document.body.getAttribute("inert") !== null || document.body.getAttribute("aria-hidden") === "true",
      mainInert: (() => {
        const m = document.querySelector("main");
        return m ? (m.getAttribute("inert") !== null || m.getAttribute("aria-hidden") === "true") : null;
      })(),
      outsideInertCount: document.querySelectorAll("[inert]").length,
      outsideHiddenCount: [...document.querySelectorAll("body > *")].filter((el) => el.getAttribute("aria-hidden") === "true" && !el.querySelector("[role='dialog']")).length,
      focusedInDialog: !!(dlg && a && dlg.contains(a)),
    };
  });

console.log("initial dialog state:", JSON.stringify(await state()));

console.log("\n── backward wrap: 3 × Shift+Tab immediately after open:");
for (let i = 0; i < 3; i++) {
  await page.keyboard.press("Shift+Tab");
  await page.waitForTimeout(150); // allow any async focus redirect
  const s = await state();
  console.log(`  S-Tab${i + 1} → ${s.sig.padEnd(30)} dialogs=${s.dialogCount} inDialog=${s.focusedInDialog}`);
}

console.log("\n── forward walk with 150ms settle (async-redirect-proof), 10 × Tab:");
for (let i = 0; i < 10; i++) {
  await page.keyboard.press("Tab");
  await page.waitForTimeout(150);
  const s = await state();
  console.log(`  Tab${String(i + 1).padStart(2)} → ${s.sig.padEnd(30)} dialogs=${s.dialogCount} inDialog=${s.focusedInDialog}`);
}

console.log("\n── 4 × Shift+Tab (from wherever we are):");
for (let i = 0; i < 4; i++) {
  await page.keyboard.press("Shift+Tab");
  const s = await state();
  console.log(`  S-Tab${i + 1} → ${s.sig.padEnd(30)} dialog=${s.dialogVisible} inDialog=${s.focusedInDialog}`);
}

console.log("\n── Escape:");
await page.keyboard.press("Escape");
await page.waitForTimeout(800);
console.log("  after Escape:", JSON.stringify(await state()));

await browser.close();
