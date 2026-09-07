/**
 * v14-E7 (تصميم D13 §6.2 shots) — لقطات منظّمة لكل خطوة محورية.
 *
 * المسار الموحّد: e2e_artifacts/sim/<RUN>/<persona>/<name>.png (fullPage).
 * <RUN> طابع زمني واحد مشترك بين كل ملفات المواصفات: Playwright قد
 * يعيد تشغيل worker (درس R8 — الوحدات تُستورد من جديد) لذا يُخزَّن RUN
 * على القرص في e2e_artifacts/sim/.current-run ويُقرأ من كل مساعد.
 * السكربت v14_sim_local_battery.sh يكتب الملف قبل التشغيل ليضمن مجلداً
 * واحداً لكل جولة كاملة.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SIM_ROOT = path.resolve(__dirname, '../../../e2e_artifacts/sim')
const RUN_FILE = path.join(SIM_ROOT, '.current-run')

function ensureDir(dir: string): string {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** RUN id مشترك (يُقرأ من القرص؛ يُنشأ عند أول استدعاء إن غاب). */
export function runId(): string {
  ensureDir(SIM_ROOT)
  if (!fs.existsSync(RUN_FILE)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    fs.writeFileSync(RUN_FILE, stamp, 'utf-8')
  }
  return fs.readFileSync(RUN_FILE, 'utf-8').trim()
}

/** مجلد أدلة الجولة الحالية. */
export function runDir(): string {
  return ensureDir(path.join(SIM_ROOT, runId()))
}

/** مجلد أدلة شخصية بعينها. */
export function personaDir(persona: string): string {
  return ensureDir(path.join(runDir(), persona))
}

/** مسار ملف HAR للشخصية (يُمرَّر لـ recordHar عند إنشاء السياق). */
export function harPath(persona: string): string {
  return path.join(personaDir(persona), `${persona}.har`)
}

import type { Page } from '@playwright/test'

/** لقطة كاملة الصفحة باسم موحّد NN-step-NN-… — الدليل الأساسي لكل خطوة. */
export async function shot(page: Page, persona: string, name: string): Promise<void> {
  const file = path.join(personaDir(persona), `${name}.png`)
  try {
    await page.screenshot({ path: file, fullPage: true })
  } catch {
    // صفحة قُطعت أثناء التنقل — لقطة viewport بدل الفشل الصلب
    await page.screenshot({ path: file, fullPage: false }).catch(() => {})
  }
}

/** لقطة لعنصر معيّن (حوار الدفع مثلاً) عند الحاجة لدليل مركّز. */
export async function shotElement(
  page: Page,
  persona: string,
  name: string,
  selector: string
): Promise<void> {
  const file = path.join(personaDir(persona), `${name}.png`)
  const el = page.locator(selector).first()
  try {
    await el.screenshot({ path: file })
  } catch {
    await shot(page, persona, name)
  }
}
