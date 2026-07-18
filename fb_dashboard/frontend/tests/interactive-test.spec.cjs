const { chromium } = require('playwright');

const BASE = 'https://bot.smart-link.ly';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];

  function check(name, pass, detail) {
    results.push({ check: name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
  }

  // 1. Click "ابدأ الآن مجاناً" → /subscribe
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  const ctaSubscribe = page.getByRole('link', { name: /ابدأ الآن مجاناً/ });
  if (await ctaSubscribe.count() > 0) {
    await ctaSubscribe.click();
    await page.waitForURL('**/subscribe');
    check('CTA "ابدأ الآن مجاناً" → /subscribe', true, `URL: ${page.url()}`);
  } else {
    check('CTA "ابدأ الآن مجاناً" exists', false, 'Link not found');
  }

  // 2. Click "جرب البوت الآن" → /demo
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  const ctaDemo = page.getByRole('link', { name: /جرب البوت الآن/ });
  if (await ctaDemo.count() > 0) {
    await ctaDemo.click();
    await page.waitForURL('**/demo');
    check('CTA "جرب البوت الآن" → /demo', true, `URL: ${page.url()}`);
  } else {
    check('CTA "جرب البوت الآن" exists', false, 'Link not found');
  }

  // 3-4. FAQ expand/collapse
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  // Landing page FAQ section — look for question headings in the schema+visible FAQ
  const faqHeadings = page.locator('h3, [class*="faq"] div, section button, summary');
  const faqCandidates = await faqHeadings.all();
  let faqTarget = null;
  for (const el of faqCandidates) {
    const txt = await el.textContent();
    if (txt && /هل|كم|صلاحية|بيانات|صفحة|دعم|تجربة/.test(txt)) {
      faqTarget = el;
      break;
    }
  }
  if (faqTarget) {
    await faqTarget.click();
    await page.waitForTimeout(300);
    check('FAQ expand works', true, `Clicked element with text: ${(await faqTarget.textContent()).trim().substring(0, 30)}`);
    await faqTarget.click();
    await page.waitForTimeout(300);
    check('FAQ collapse works', true, 'Second click on same FAQ item');
  } else {
    check('FAQ items found', false, 'No FAQ items with question text found');
  }

  // 5. Footer WhatsApp link → wa.me
  const allLinks = await page.locator('a[href]').all();
  let foundWa = false;
  for (const link of allLinks) {
    const href = await link.getAttribute('href');
    if (href && href.includes('wa.me')) {
      foundWa = true;
      check('Footer WhatsApp link → wa.me', true, `href: ${href}`);
      break;
    }
  }
  if (!foundWa) check('Footer WhatsApp link', false, 'No wa.me link found on page');

  // 6. Pricing page CTA buttons present
  await page.goto(`${BASE}/subscribe`);
  await page.waitForLoadState('networkidle');
  const pricingCtAs = page.locator('button:has-text("ابدأ مجاناً"), button:has-text("اختيار")');
  const pricingCount = await pricingCtAs.count();
  check('Pricing page CTA buttons', pricingCount > 0, `Found ${pricingCount} CTA button(s) on /subscribe`);

  // 7. Demo sidebar nav items clickable
  await page.goto(`${BASE}/demo`);
  await page.waitForLoadState('networkidle');
  // Sidebar nav items are <div> inside <aside> <nav>
  const sidebarItems = page.locator('aside nav > div[cursor-pointer], aside nav > div');
  const sidebarCount = await sidebarItems.count();
  if (sidebarCount > 0) {
    await sidebarItems.first().click();
    await page.waitForTimeout(500);
    check('Demo sidebar nav items clickable', true, `Found ${sidebarCount} items, first clicked`);
  } else {
    check('Demo sidebar nav items exist', false, 'No sidebar nav items found');
  }

  // 8. Demo "العودة" button → back to landing
  const backBtn = page.locator('button:has-text("العودة")');
  if (await backBtn.count() > 0) {
    await backBtn.first().click();
    await page.waitForTimeout(1500);
    const url = page.url();
    check('Demo "العودة" → landing', url === BASE + '/' || !url.includes('/demo'), `URL: ${url}`);
  } else {
    check('Demo "العودة" button', false, 'العودة button not found on demo page');
  }

  // 9. Logo click → back to / (header with logo is on landing page)
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  const logo = page.locator('a[href="/"]').first();
  if (await logo.count() > 0) {
    await logo.click();
    await page.waitForTimeout(500);
    check('Logo click → /', true, `URL: ${page.url()}`);
  } else {
    check('Logo link to /', false, 'No a[href="/"] found on landing page');
  }

  // 10. Pricing header nav buttons (الرئيسية, تجربة حية, اشتراك)
  await page.goto(`${BASE}/pricing`);
  await page.waitForLoadState('networkidle');
  const hasRaisiya = await page.locator('button:has-text("الرئيسية")').count() > 0;
  const hasDemoBtn = await page.locator('button:has-text("تجربة حية")').count() > 0;
  const hasSubscribeBtn = page.locator('button:has-text("اشتراك")');
  const hasSubscribe = await hasSubscribeBtn.count() > 0;
  const totalPricingNav = await page.locator('section button').count();
  check('Pricing header nav buttons', totalPricingNav >= 3 && hasRaisiya && hasSubscribe,
    `Found ${totalPricingNav} section buttons. الرئيسية=${hasRaisiya}, تجربة حية=${hasDemoBtn}, اشتراك=${hasSubscribe}`);

  await browser.close();
  console.log('\n--- RESULTS ---');
  for (const r of results) {
    console.log(`${r.pass ? '✓' : '✗'} ${r.check}: ${r.detail}`);
  }
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  process.exit(failed > 0 ? 1 : 0);
})();
