#!/usr/bin/env node
/**
 * v15-E8 (تصميم D13 §6.3) — تنفيذ تدوير الأسرار من داخل p14:
 * يستدعي scripts/v15_sim_rotate_secret.sh (execSync + stdio inherit —
 * السكربت نفسه ينتظر healthz ≤60s) ثم يقرأ الأسرار الجديدة من ENVFILE
 * الحي والمعلومات الموثقة (.rotation.json — بادئات فقط) من أدلة الجولة.
 *
 * الأسرار لا تُطبع أبداً في المخرجات — تُقرأ للعقود فقط (401/403/200).
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ROTATE_SCRIPT =
  process.env.SIM_ROTATE_SCRIPT ||
  path.resolve(__dirname, '../../../../scripts/v15_sim_rotate_secret.sh')

const ENVFILE = process.env.SIM_ROTATE_ENVFILE || '/tmp/v15-backend.env'

const SIM_ROOT = path.resolve(__dirname, '../../../e2e_artifacts/sim')
const RUN_FILE = path.join(SIM_ROOT, '.current-run')

export function runId(): string {
  if (!fs.existsSync(RUN_FILE)) return ''
  return fs.readFileSync(RUN_FILE, 'utf-8').trim()
}

/** قراءة الأسرار الحية من ENVFILE (SK/FK/CS ثلاثة أسطر). */
export function readBackendSecrets(): { sk: string; fk: string; cs: string } {
  const lines = fs
    .readFileSync(ENVFILE, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return { sk: lines[0] || '', fk: lines[1] || '', cs: lines[2] || '' }
}

export interface RotationInfo {
  oldSkPrefix: string
  newSkPrefix: string
  at: string
  restarted: boolean
  envFile: string
}

/** تنفيذ التدوير + إعادة الإقلاع (السكربت ينتظر healthz بنفسه). */
export function rotateSecrets(timeoutMs = 120_000): RotationInfo {
  execFileSync('bash', [ROTATE_SCRIPT], {
    stdio: 'inherit',
    timeout: timeoutMs,
    env: { ...process.env, SIM_ROTATE_ENVFILE: ENVFILE },
  })
  const run = runId()
  const file = run ? path.join(SIM_ROOT, run, '.rotation.json') : ''
  let info: any = {}
  try {
    info = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    info = {}
  }
  return {
    oldSkPrefix: String(info.oldSkPrefix || ''),
    newSkPrefix: String(info.newSkPrefix || ''),
    at: String(info.at || new Date().toISOString()),
    restarted: true,
    envFile: ENVFILE,
  }
}

/** انتظار healthz (تحقق مستدعي p14 بعد التدوير إذا لزم). */
export async function waitHealthz(apiBase: string, timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${apiBase}/healthz`)
      if (r.ok) return true
    } catch {
      /* الخلفية ما زالت تقلع */
    }
    await new Promise((res) => setTimeout(res, 1500))
  }
  return false
}
