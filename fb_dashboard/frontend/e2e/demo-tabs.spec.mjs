/**v4 plan §5 criterion #5 — demo tabs must actually switch content.
 * Clicks 4 sidebar tabs on /demo and asserts the header + content change. */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/demo`, { waitUntil: "networkidle" });

const headerSel = "header h1";
const getHeader = () => page.locator(headerSel).first().innerText();

const clicks = [
  { label: "الرسائل", expect: "الرسائل" },
  { label: "الجمهور", expect: "الجمهور" },
  { label: "التحليلات", expect: "التحليلات" },
  { label: "لوحة البيانات", expect: "لوحة البيانات" },
];

let pass = 0;
const results = [];
const h0 = await getHeader();
results.push(`initial: ${h0}`);

for (const c of clicks) {
  await page.getByRole("link", { name: c.label, exact: true }).first().click();
  await page.waitForTimeout(400);
  const h = await getHeader();
  const ok = h.includes(c.expect);
  results.push(`${ok ? "PASS" : "FAIL"} click «${c.label}» → header «${h}»`);
  if (ok) pass++;
}

// content distinctness: replies tab shows a chat thread, stats shows KPI cards
await page.getByRole("link", { name: "الرسائل", exact: true }).first().click();
await page.waitForTimeout(400);
const hasThread = await page.locator("text=محادثة: أحمد سالم").count();
await page.getByRole("link", { name: "لوحة البيانات", exact: true }).first().click();
await page.waitForTimeout(400);
const hasKpis = await page.locator("text=ردود اليوم").count();
results.push(`${hasThread > 0 ? "PASS" : "FAIL"} replies tab shows chat thread`);
results.push(`${hasKpis > 0 ? "PASS" : "FAIL"} stats tab shows KPI cards`);
if (hasThread > 0) pass++;
if (hasKpis > 0) pass++;

console.log(results.join("\n"));
await browser.close();
if (pass !== clicks.length + 2) {
  console.error(`DEMO TABS: ${pass}/${clicks.length + 2} failed`);
  process.exit(1);
}
console.log(`\nOK: demo tab navigation works (${pass}/${clicks.length + 2})`);
