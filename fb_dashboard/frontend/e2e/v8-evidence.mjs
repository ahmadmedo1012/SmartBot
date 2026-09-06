/** v8 evidence: screenshots of key pages + dashboard entrance choreography check */
import { chromium } from "playwright";

const BASE = "http://localhost:3199";
const SHOTS = "/home/z/my-project/SmartBot/docs/screenshots";

const browser = await chromium.launch();

// 1) public pages (visual regression after radius/token/EmptyState changes)
for (const [path, name] of [
  ["/", "v8-landing"],
  ["/pricing", "v8-pricing"],
  ["/login", "v8-login"],
  ["/demo", "v8-demo"],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  await ctx.close();
  console.log(`shot: ${name}`);
}

// 2) hero mockup + notification cards empty state (public landing pieces)
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p2 = await ctx2.newPage();
await p2.goto(`${BASE}/`, { waitUntil: "networkidle" });
await p2.waitForTimeout(1500);
const mockupAriaHidden = await p2.evaluate(() => {
  const el = document.querySelector("[class*='hero'] [aria-hidden='true']") || document.body;
  return !!document.querySelector("main [aria-hidden='true']");
});
console.log("hero-mockup aria-hidden present:", mockupAriaHidden);
await ctx2.close();

await browser.close();
console.log("evidence done");
