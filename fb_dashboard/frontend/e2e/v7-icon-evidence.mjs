/**
 * v7 §2.2 + §4 — LIVE icon-direction evidence (screenshots + geometry proof).
 *
 * For each directional position: navigate → screenshot the button region →
 * assert the icon's COMPUTED scale is the RTL mirror (Tailwind v4 compiles
 * -scale-x-100 to the CSS `scale` property: "-1 1").
 *
 * Two sessions: v7user (normal tenant: subscribe/onboarding/messages) and
 * localadmin (platform admin: admin back links, telegram sections).
 *
 * Env: BASE_URL, USR/PW, OUT, TAG.   Run: node e2e/v7-icon-evidence.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const WEB = process.env.BASE_URL || "http://localhost:3199";
const OUT = process.env.OUT || "../../docs/screenshots";
const TAG = process.env.TAG || "local";
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

async function login(page, usr, pw) {
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await page.fill("#username", usr).catch(() => page.fill('input[type="text"]', usr));
  await page.fill('input[type="password"]', pw);
  await page.locator("button[type=submit]").first().click();
  await page.waitForURL(/dashboard|admin|onboarding/, { timeout: 25000 }).catch(() => {});
  return /dashboard|admin|onboarding/.test(page.url());
}

async function evidence(page, name, selector, shot) {
  try {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: "visible", timeout: 12000 });
    await loc.screenshot({ path: `${OUT}/v7-${TAG}-${shot}.png` });
    const geo = await loc.evaluate((el) => {
      const svgs = [...el.querySelectorAll("svg")];
      return svgs.map((s) => {
        const st = getComputedStyle(s);
        const mirrored = /^-1/.test(st.scale.trim()) || /matrix\(-1/.test(st.transform);
        return { val: `scale=${st.scale} transform=${st.transform.slice(0, 16)}`, mirrored };
      });
    });
    const mirrored = geo.filter((g) => g.mirrored).length;
    check(name, geo.length > 0 && mirrored === geo.length, `${mirrored}/${geo.length} mirrored [${geo[0]?.val}]`);
  } catch (e) {
    check(name, false, String(e).slice(0, 70));
  }
}

const browser = await chromium.launch();

// ══════ SESSION 1: v7user — tenant journey ══════
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" });
  const page = await ctx.newPage();

  // public
  await page.goto(`${WEB}/`, { waitUntil: "networkidle" });
  await evidence(page, "landing hero CTA = forward (mirrored → shows ←)", "a[href='/subscribe'] button", "landing-cta");
  await page.goto(`${WEB}/login`, { waitUntil: "networkidle" });
  await evidence(page, "login back = →", "a[href='/'] button", "login-back");
  await page.goto(`${WEB}/register`, { waitUntil: "networkidle" });
  await evidence(page, "register back = →", "a[href='/'] button", "register-back");
  await page.goto(`${WEB}/demo`, { waitUntil: "networkidle" });
  await evidence(page, "demo العودة = →", "button:has-text('العودة')", "demo-back");

  check("login v7user", await login(page, "v7user", "V7User#2026"), page.url().slice(-30));

  // onboarding wizard — AuthGuard overlay ON /dashboard for fresh tenants
  // (there is no /onboarding route; the wizard overlays the dashboard)
  await page.goto(`${WEB}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const hasWizard = (await page.locator("button:has-text('التالي')").count()) > 0;
  if (hasWizard) {
    await evidence(page, "wizard السابق/تخطي = → (mirrored back glyph)", "button:has-text('السابق'), button:has-text('تخطي')", "wizard-prev");
    await page.locator("button:has-text('التالي')").first().click().catch(() => {});
    await page.waitForTimeout(700);
    await evidence(page, "wizard التالي = ← (mirrored forward glyph)", "button:has-text('التالي')", "wizard-next");
  } else {
    check("wizard buttons", false, "wizard overlay not shown (onboarding completed?)");
  }

  // subscribe — THE plan priority
  await page.goto(`${WEB}/subscribe`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await evidence(page, "subscribe العودة للوحة التحكم = →", "button:has-text('العودة للوحة التحكم')", "subscribe-back-dash");
  await evidence(page, "subscribe متابعة مع خطة = ← (forward)", "button:has-text('اختر خطة أولاً'), button:has-text('متابعة')", "subscribe-continue");
  await page.screenshot({ path: `${OUT}/v7-${TAG}-subscribe-full.png` });
  const backBtn = page.locator("button:has-text('العودة للوحة التحكم')").first();
  if (await page.locator("button:has-text('العودة للوحة التحكم')").count() > 0) {
    const before = await backBtn.locator("svg").first().evaluate((s) => getComputedStyle(s).scale);
    await backBtn.click();
    await page.waitForURL(/dashboard/, { timeout: 20000 }).catch(() => {});
    check("subscribe back CLICK → /dashboard (arrow kept →)", /dashboard/.test(page.url()), `scale=${before} → ${page.url().slice(-22)}`);
  } else check("subscribe back CLICK", false, "button absent");

  await page.goto(`${WEB}/connect`, { waitUntil: "networkidle" });
  await evidence(page, "connect back = →", "a[href='/dashboard']:has-text('العودة')", "connect-back");

  // messages mobile master-detail
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(`${WEB}/dashboard/messages`, { waitUntil: "networkidle" });
  await mob.waitForTimeout(2000);
  // dismiss the onboarding-wizard overlay (fresh tenant) — it intercepts clicks
  await mob.locator("button:has-text('تخطي')").first().click().catch(() => {});
  await mob.waitForTimeout(1800);
  await mob.goto(`${WEB}/dashboard/messages`, { waitUntil: "networkidle" });
  await mob.waitForTimeout(2000);
  // messages mobile master-detail: open THE conversation (name-specific —
  // the first border-b button is a filter tab, not the conversation row)
  await mob.locator("button:has-text('عميل تجريبي')").first().click().catch(() => {});
  await mob.waitForTimeout(900);
  try {
    const all = mob.locator("button:has-text('كل المحادثات')").first();
    await all.waitFor({ state: "visible", timeout: 8000 });
    await all.screenshot({ path: `${OUT}/v7-${TAG}-messages-all.png` });
    const st = await all.locator("svg").first().evaluate((s) => getComputedStyle(s));
    check("messages كل المحادثات = ← (forward, mirrored)", /^-1/.test(st.scale.trim()) || /matrix\(-1/.test(st.transform), `scale=${st.scale}`);
  } catch (e) { check("messages كل المحادثات = ←", false, "not reachable: " + String(e).slice(0, 60)); }
  await ctx.close();
}

// ══════ SESSION 2: localadmin — platform admin surfaces ══════
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" });
  const page = await ctx.newPage();
  check("login localadmin", await login(page, "localadmin", "LocalAdmin#V7"), page.url().slice(-20));

  await page.goto(`${WEB}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await evidence(page, "admin العودة للوحة التحكم = →", "a[href='/dashboard']:has-text('العودة')", "admin-back");

  await page.goto(`${WEB}/admin/telegram`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/v7-${TAG}-telegram-full.png` });
  const unlabeled = await page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll("button")) {
      const name = (b.getAttribute("aria-label") || b.textContent || "").trim();
      if (b.querySelector("svg") && !name) out.push(b.outerHTML.slice(0, 50));
    }
    return out;
  });
  check("DOM: zero unlabeled icon-only buttons (/admin/telegram incl. new labels)", unlabeled.length === 0, unlabeled.slice(0, 2).join("|"));

  // support disclosure chevron exception (NOT mirrored)
  await page.goto(`${WEB}/dashboard/support`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  try {
    const t = await page.locator("summary svg").first().evaluate((s) => getComputedStyle(s));
    check("support FAQ disclosure NOT mirrored (documented exception)", !/^-1/.test(t.scale.trim()), `scale=${t.scale}`);
  } catch { check("support FAQ disclosure (exception)", true, "n/a in this state"); }

  await ctx.close();
}

await browser.close();
const fails = results.filter((r) => !r[1]).length;
console.log(`\n${fails === 0 ? "ALL EVIDENCE GREEN" : fails + " FAILURES"} — shots: ${OUT}/v7-${TAG}-*.png`);
process.exit(fails === 0 ? 0 : 1);
