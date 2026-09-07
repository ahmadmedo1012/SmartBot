import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loginViaUI, loadPersonaUsername } from '../e2e/sim/helpers/session'
import { exec, queryScalar } from '../e2e/sim/helpers/db-claims.mjs'

const uname = loadPersonaUsername('p02')
const password = 'Sim#P02pass'

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    baseURL: 'http://localhost:3200',
    viewport: { width: 1280, height: 800 },
    locale: 'ar-LY',
    timezoneId: 'Africa/Tripoli',
  })
  const page = await ctx.newPage()
  const tid = Number(queryScalar('SELECT tenant_id FROM users WHERE username=?', [uname]) || 0)
  exec('UPDATE tenants SET onboarding_completed=0 WHERE id=?', [tid])
  await loginViaUI(page, uname!, password)
  await page.goto('/dashboard')
  const wiz = page.locator('[aria-labelledby="onboarding-step-title"]').first()
  await wiz.waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(1000)
  await page.locator('button:has-text("التالي")').first().click()
  await page.waitForTimeout(1500)
  const results = await new AxeBuilder({ page }).analyze()
  console.log('STEP1 violations:', results.violations.length)
  for (const v of results.violations) {
    console.log('==', v.impact, v.id, '-', v.help)
    console.log(JSON.stringify(v.nodes.map((n) => ({ html: n.html.slice(0, 180) })), null, 1).slice(0, 900))
  }
  exec('UPDATE tenants SET onboarding_completed=1 WHERE id=?', [tid])
  await browser.close()
}
run().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1) })
