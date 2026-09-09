/**
 * v15-E8 (تصميم D13 §4.5) — أدوات قارئ الشاشة (p12):
 *  - axeSweep: اجتياح axe-core على مسار كامل + تقرير JSON لكل صفحة في
 *    أدلة الجولة (p12/axe-<page>.json) — 0 انتهاكات serious/critical
 *    مفروضة؛ moderate تُوثَّق ولا تفشل.
 *  - watchAriaLive: رصد إعلانات [aria-live] عبر MutationObserver (عقد
 *    v14-E4 الحي — نافذة الدفع تعلن حالتها لقارئ الشاشة).
 *  - focusInside: هل التركيز الحالي داخل عنصر (حوار) — فخ التركيز.
 *  - keyboardAdvance: تقدّم بالكيبورد فقط (Tab/Shift+Tab/Enter).
 *
 * يعتمد devDeps الجديدة @axe-core/playwright (متوفرة في package.json).
 */
import fs from 'node:fs'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

import { personaDir } from './shots'

export interface AxeSweepResult {
  page: string
  url: string
  violations: number
  serious: number
  critical: number
  moderate: number
  reportFile: string
}

/**
 * اجتياح axe كامل — يكتب التقرير JSON ويعيد ملخصاً.
 * ok للمستدعي: serious === 0 && critical === 0 (modulate موثقة فقط).
 */
export async function axeSweep(page: Page, persona: string, name: string): Promise<AxeSweepResult> {
  const results = await new AxeBuilder({ page }).analyze()
  const counts = { serious: 0, critical: 0, moderate: 0 }
  for (const v of results.violations) {
    if (v.impact === 'serious') counts.serious++
    else if (v.impact === 'critical') counts.critical++
    else if (v.impact === 'moderate') counts.moderate++
  }
  const file = path.join(personaDir(persona), `axe-${name}.json`)
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        page: name,
        url: page.url(),
        scannedAt: new Date().toISOString(),
        violationCount: results.violations.length,
        counts,
        violations: results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
          tags: v.tags?.slice(0, 4),
          /* v16-منسّق (درس p12 wizard-step0): العدد وحده لا يكفي للتشخيص —
           * كل node يُخزَّن بهدفه وhtml (أول 3) حتى تكون الانتكاسة قابلة
           * للتحديد دون إعادة تشغيل البطارية (قاعدة gstack pre-emit). */
          nodeDetails: v.nodes.slice(0, 3).map((n) => ({
            target: n.target,
            html: (n.html || '').slice(0, 300),
          })),
        })),
        passes: results.passes.length,
        incomplete: results.incomplete.length,
      },
      null,
      2
    ),
    'utf-8'
  )
  return {
    page: name,
    url: page.url(),
    violations: results.violations.length,
    serious: counts.serious,
    critical: counts.critical,
    moderate: counts.moderate,
    reportFile: file,
  }
}

/** مجموع اجتياحات الرحلة — عقد p12-axe-journeys المفروض. */
export function axeJourneyOk(sweeps: AxeSweepResult[]): boolean {
  return sweeps.length > 0 && sweeps.every((s) => s.serious === 0 && s.critical === 0)
}

/**
 * رصد إعلانات aria-live عبر MutationObserver — يُنصَّب قبل الفعل ويُقرأ
 * بعده: عناصر [aria-live] (role=status included) نصوصها تجمع هنا.
 */
export async function watchAriaLive(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const seen: string[] = []
    const record = () => {
      document.querySelectorAll('[aria-live]').forEach((el) => {
        const t = (el.textContent || '').trim()
        if (t && seen[seen.length - 1] !== t) seen.push(t)
      })
    }
    record()
    const mo = new MutationObserver(record)
    mo.observe(document.body, { childList: true, subtree: true, characterData: true })
    ;(window as any).__simAriaLive = seen
  })
  return async () => page.evaluate(() => [...((window as any).__simAriaLive || [])])
}

/** هل التركيز الحالي داخل محدد (فخ التركيز داخل الحوار)؟ */
export async function focusInside(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel: string) => {
    const root = document.querySelector(sel)
    if (!root) return false
    return root.contains(document.activeElement)
  }, selector)
}

/** عنصر التركيز الحالي (وصف للتقرير). */
export async function activeElementDesc(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || !el.tagName) return 'none'
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${
      el.getAttribute('aria-label') ? `[aria-label="${el.getAttribute('aria-label')}"]` : ''
    }`
  })
}

/**
 * تقدّم بالكيبورد فقط — بلا أي نقرة فأرة (رحلة p12 كاملة):
 * focus() برمجي على الحقل الأول (ليس نقرة) ثم keyboard.type + Tab + Enter.
 */
export async function keyboardLogin(
  page: Page,
  username: string,
  password: string
): Promise<string> {
  await page.goto('/login')
  await page.locator('#username').focus()
  await page.keyboard.type(username, { delay: 15 })
  await page.keyboard.press('Tab')
  await page.locator('input[type=password]').focus()
  await page.keyboard.type(password, { delay: 15 })
  await page.keyboard.press('Enter')
  await page.waitForURL(/dashboard|admin/, { timeout: 30_000 }).catch(() => {})
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  return page.url()
}
