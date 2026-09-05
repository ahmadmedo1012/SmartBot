/**v4 plan Team 5 — viewport overflow sweep (375 / 768 / 1440).
 * Asserts zero horizontal overflow on every public page + the demo shell. */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PAGES = ["/", "/login", "/register", "/pricing", "/demo", "/terms", "/privacy"];
const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

const browser = await chromium.launch();
const failures = [];
const results = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  for (const path of PAGES) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(500);
      // click through 2 demo tabs on the demo page (mobile nav path)
      if (path === "/demo" && vp.width < 768) {
        const msg = await page.evaluate(() => document.body.innerText);
        // mobile bottom nav drives tabs too — tap two items if present
        const links = page.getByRole("link", { name: "الرسائل", exact: true });
        if ((await links.count()) > 0) {
          await links.first().click().catch(() => {});
          await page.waitForTimeout(400);
        }
      }
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflowX = doc.scrollWidth - doc.clientWidth;
        // find the widest offending element (if any)
        let worst = null;
        if (overflowX > 1) {
          for (const el of document.querySelectorAll("*")) {
            const r = el.getBoundingClientRect();
            if (r.right > doc.clientWidth + 1 && r.width > 24) {
              worst = `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]} right=${Math.round(r.right)}`;
              break;
            }
          }
        }
        return { overflowX, worst };
      });
      const ok = overflow.overflowX <= 1;
      results.push(`${ok ? "PASS" : "FAIL"}  ${vp.name.padEnd(14)} ${path.padEnd(10)} overflow=${overflow.overflowX}px${overflow.worst ? ` (${overflow.worst})` : ""}`);
      if (!ok) failures.push(`${vp.name} ${path}: ${overflow.overflowX}px horizontal overflow`);
    } catch (e) {
      results.push(`ERROR ${vp.name.padEnd(14)} ${path.padEnd(10)} ${String(e).slice(0, 60)}`);
      failures.push(`${vp.name} ${path}: navigation error`);
    }
  }
  await ctx.close();
}

await browser.close();
console.log(results.join("\n"));
if (failures.length) {
  console.error(`\nOVERFLOW FAILURES (${failures.length}):`);
  console.error(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log(`\nOK: zero horizontal overflow across ${VIEWPORTS.length} viewports × ${PAGES.length} pages`);
