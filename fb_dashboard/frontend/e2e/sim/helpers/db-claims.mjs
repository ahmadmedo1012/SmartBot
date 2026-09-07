#!/usr/bin/env node
/**
 * v14-E7 (تصميم D13 §6.2 db-claims.mjs) — ادعاءات قاعدة البيانات للبطارية
 * المحلية عبر sqlite (بيئة venv) + سجل sim-claims.json.
 *
 * الاستخدام:
 *   import { query, recordClaim, checkClaim, preflight } from './db-claims.mjs'
 * أو CLI:
 *   node e2e/sim/helpers/db-claims.mjs claim  "<SQL>" '["arg1"]'
 *   node e2e/sim/helpers/db-claims.mjs record '<JSON row>'
 *   node e2e/sim/helpers/db-claims.mjs preflight
 *
 * التنفيذ داخلياً: SIM_PYTHON (افتراضي: SmartBot/.venv إن وُجد وإلا
 * /home/z/.venv/bin/python3) على SIM_DB (افتراضي /home/z/my-project/db/v14-sim.db)
 * — الاستعلام بوسائط مُعاملة (بلا سلاسل مدمجة) والناتج JSON {rows:[…]}.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── البيئة ────────────────────────────────────────────────────────────
function resolvePython() {
  if (process.env.SIM_PYTHON) return process.env.SIM_PYTHON
  const candidates = [
    '/home/z/my-project/SmartBot/.venv/bin/python',
    '/home/z/.venv/bin/python3',
    'python3',
  ]
  for (const c of candidates.slice(0, 2)) {
    if (fs.existsSync(c)) return c
  }
  return candidates[2]
}
const PY = resolvePython()
const DB = process.env.SIM_DB || '/home/z/my-project/db/v14-sim.db'

const SIM_ROOT = path.resolve(__dirname, '../../../e2e_artifacts/sim')
const RUN_FILE = path.join(SIM_ROOT, '.current-run')

function runId() {
  if (!fs.existsSync(SIM_ROOT)) fs.mkdirSync(SIM_ROOT, { recursive: true })
  if (!fs.existsSync(RUN_FILE)) {
    fs.writeFileSync(
      RUN_FILE,
      new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19),
      'utf-8'
    )
  }
  return fs.readFileSync(RUN_FILE, 'utf-8').trim()
}

const claimsFile = () => path.join(SIM_ROOT, runId(), 'sim-claims.json')

// ── جسر sqlite عبر python (وسائط معاملات — لا دمج سلاسل) ───────────────
const PY_CODE = [
  'import sqlite3, json, sys',
  'try:',
  '    db = sqlite3.connect(sys.argv[2])',
  '    db.row_factory = sqlite3.Row',
  '    rows = [dict(r) for r in db.execute(sys.argv[1], json.loads(sys.argv[3] or "[]")).fetchall()]',
  '    db.close()',
  '    print(json.dumps({"ok": True, "rows": rows}, ensure_ascii=False, default=str))',
  'except Exception as e:',
  '    print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))',
].join('\n')

/** تنفيذ SELECT وإرجاع الصفوف — يرمي عند فشل الاتصال/الاستعلام. */
export function query(sql, args = []) {
  if (!fs.existsSync(DB)) {
    throw new Error(`SIM_DB غير موجودة: ${DB} — شغّل scripts/v14_sim_local_battery.sh أولاً`)
  }
  const out = execFileSync(PY, ['-c', PY_CODE, sql, DB, JSON.stringify(args ?? [])], {
    encoding: 'utf-8',
    timeout: 20_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  const parsed = JSON.parse(out)
  if (!parsed.ok) throw new Error(`فشل ادعاء SQL: ${parsed.error}`)
  return parsed.rows
}

/** سطر واحد أو null. */
export function queryOne(sql, args = []) {
  const rows = query(sql, args)
  return rows.length ? rows[0] : null
}

/** scalar مبسّط: القيمة الأولى لأول صف. */
export function queryScalar(sql, args = []) {
  const row = queryOne(sql, args)
  if (!row) return null
  return Object.values(row)[0]
}

// ── سجل الادعاءات (sim-claims.json — JSONL تراكمي) ─────────────────────
/**
 * تسجيل صف ادعاء (شكل التصميم §4.6):
 * {"persona","claim","query","expected","actual","ok","ts"[,"note"]}
 */
export function recordClaim(persona, claim, expected, actual, ok, extra = {}) {
  const dir = path.dirname(claimsFile())
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const row = {
    persona,
    claim,
    expected,
    actual: actual === undefined ? null : actual,
    ok: Boolean(ok),
    ts: new Date().toISOString(),
    ...extra,
  }
  fs.appendFileSync(claimsFile(), JSON.stringify(row) + '\n', 'utf-8')
  // مرآة في stdout ليظهر الادعاء في تقرير playwright مباشرة
  const mark = row.ok ? '✓' : '✗'
  console.log(`  [claim] ${mark} ${persona}/${claim} — متوقع: ${expected} | فعلي: ${actual}`)
  return row
}

/**
 * ادعاء مركّب: استعلام + مقارنة + تسجيل — يعيد ok.
 * predicate(rows) يعيد {ok, actual} أو boolean.
 */
export function checkClaim(persona, claim, sql, args, predicate, expected, extra = {}) {
  let rows = []
  let actual
  let ok = false
  let error = null
  try {
    // v14-fix: السلسلة الوصفية (مثل "POST /api/upload" أو "ls …") ليست SQL —
    // نتخطى التنفيذ ونترك الحكم للمُسند وحده (الادعاء الوصفي بلا صفوف)
    const SQLISH = /^\s*(SELECT|WITH|PRAGMA)\b/i
    if (typeof sql === 'string' && SQLISH.test(sql)) {
      rows = query(sql, args)
    }
    const res = predicate(rows)
    if (typeof res === 'boolean') {
      ok = res
      actual = rows
    } else {
      ok = Boolean(res.ok)
      actual = res.actual
    }
  } catch (e) {
    error = String(e)
  }
  return recordClaim(persona, claim, expected, error ? `خطأ: ${error}` : actual, ok, {
    query: sql,
    ...(error ? { error } : {}),
    ...extra,
  })
}

/** preflight التصميم: أسماء الجداول المتاحة (تثبيت أسماء الجداول). */
export function preflight() {
  const rows = query(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  )
  const names = rows.map((r) => r.name)
  console.log('[preflight] جداول DB:', names.join(', '))
  return names
}

// ── CLI ───────────────────────────────────────────────────────────────
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const [cmd, a, b] = process.argv.slice(2)
  try {
    if (cmd === 'claim') {
      console.log(JSON.stringify({ ok: true, rows: query(a, b ? JSON.parse(b) : []) }, null, 0))
    } else if (cmd === 'record') {
      console.log(JSON.stringify(recordClaimRow(JSON.parse(a))))
    } else if (cmd === 'preflight') {
      preflight()
    } else {
      console.error('الاستخدام: db-claims.mjs claim "<SQL>" [argsJson] | record "<JSON>" | preflight')
      process.exit(2)
    }
  } catch (e) {
    console.error(`خطأ db-claims: ${e}`)
    process.exit(1)
  }
}

function recordClaimRow(row) {
  const dir = path.dirname(claimsFile())
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(claimsFile(), JSON.stringify(row) + '\n', 'utf-8')
  return row
}
