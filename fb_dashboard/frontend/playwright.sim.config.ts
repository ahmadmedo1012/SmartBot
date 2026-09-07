import { defineConfig } from "@playwright/test";

/**
 * v14-E7 (تصميم D13 §4.3) — إعدادات بطارية المحاكاة، منفصلة تماماً عن
 * playwright.config.ts القائم (لا يلمس specs القائمة — testMatch يحصر
 * ملفات الشخصيات sim-p\d+ فقط).
 *
 * - workers: 1 + fullyParallel: false — حدود المعدل مشتركة الـ IP، التسلسل
 *   إلزامي (§4.5) والترتيب الأبجدي p01→p08 هو ترتيب التنفيذ.
 * - retries: 0 — بطارية أدلة: أي فشل يظهر بأمانة مع لقطة الفشل (screenshot
 *   only-on-failure + trace retain-on-failure).
 * - baseURL من البيئة: V14_SIM_BASE_URL (يفضَّله المنسّق) ثم SIM_BASE_URL/
 *   SIM_FRONT (أسماء التصميم) — السكربت يصدّر الثلاثة إلى :3200.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /sim-p\d+.*\.spec\.ts/,
  timeout: 180_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["html", { outputFolder: "e2e_artifacts/sim/html-report", open: "never" }]],
  use: {
    baseURL: process.env.V14_SIM_BASE_URL || process.env.SIM_BASE_URL || process.env.SIM_FRONT || "http://localhost:3200",
    headless: true,
    viewport: { width: 1280, height: 800 },
    locale: "ar-LY",
    timezoneId: "Africa/Tripoli",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  outputDir: "e2e_artifacts/sim/test-results",
});
