/** v9-D5 evidence — authed /dashboard dark screenshot (AdminSidebar micro-label
 * color-contrast gate finding) + the failing nodes' computed styles. */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3199";
const USR = process.env.USR || "v9probe";
const PW = process.env.PW || "V9Probe#2026";
const ART = new URL("./e2e_artifacts/", import.meta.url).pathname;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("theme", "dark"); } catch {} });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 25000 });
await page.fill("#username", USR);
await page.fill('input[type="password"]', PW);
await page.locator("button[type=submit]").first().click();
await page.waitForURL(/dashboard|admin/, { timeout: 25000 });
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${ART}/v9-axe-_dashboard-dark-desktop.png` });
const failing = await page.evaluate(() => {
  const els = [...document.querySelectorAll(".animate-fade-in > p.uppercase")];
  return els.map((el) => ({
    text: el.textContent.trim().slice(0, 30),
    cls: el.className.slice(0, 80),
    color: getComputedStyle(el).color,
    bg: getComputedStyle(el).backgroundColor,
    fontSize: getComputedStyle(el).fontSize,
  }));
});
console.log("sidebar section micro-labels:", JSON.stringify(failing, null, 1).slice(0, 900));
await browser.close();
console.log("shot saved");
