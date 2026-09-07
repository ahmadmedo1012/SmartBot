#!/usr/bin/env node
/**
 * v14-E7 (تصميم D13 §6.2 db-claims.mjs) — ادعاءات قاعدة البيانات للبطارية
 * المحلية عبر sqlite (بيئة venv) + سجل sim-claims.json.
 *
 * v15-E8 (تصميم D13 §3 — محرك الادعاءات المفروضة، يغلق D7-F1/C-GATE1):
 *   checkClaim صار يرمي فوراً عند أي ادعاء أحمر غير مُدرج في قائمة السماح
 *   (e2e/sim/fixtures/sim-findings.json أو SIM_FINDINGS) — التوقيع نفسه،
 *   55+ موقع استدعاء لا تتغير:
 *     - أحمر + مُدرج            → يوسم السجل "allowlisted" + يُسطر في
 *                                 sim-findings-live.json → الاختبار يستمر
 *     - أحمر + غير مُدرج        → throw (SIM_ENFORCE_CLAIMS=0 تشخيص فقط)
 *     - أخضر + كان مُدرجاً       → يوسم "findingClosed" (كاشف الانقلاب —
 *                                 إشارة للمنسّق لحذف الإدخال)
 *     - خطأ الاستعلام نفسه      → أحمر بنفس مسار الإنفاذ (لا ابتلاع)
 *   الجديد أيضاً: exec() لتعديلات بذرية البطارية (تُنفَّذ بcommit) —
 *   البطارية تملك قاعدة v15-sim.db المحلية (بذر سقف الاستخدام لp10).
 *
 * الاستخدام:
 *   import { query, queryOne, queryScalar, exec, recordClaim, checkClaim, preflight } from './db-claims.mjs'
 * أو CLI:
 *   node e2e/sim/helpers/db-claims.mjs claim  "<SQL>" '["arg1"]'
 *   node e2e/sim/helpers/db-claims.mjs exec   "<SQL>" '["arg1"]'
 *   node e2e/sim/helpers/db-claims.mjs record '<JSON row>'
 *   node e2e/sim/helpers/db-claims.mjs preflight
 *   node e2e/sim/helpers/db-claims.mjs findings
 *
 * التنفيذ داخلياً: SIM_PYTHON (افتراضي: SmartBot/.venv إن وُجد وإلا
 * /home/z/.venv/bin/python3) على SIM_DB (افتراضي /home/z/my-project/db/v15-sim.db)
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
const DB = process.env.SIM_DB || '/home/z/my-project/db/v15-sim.db'

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
const findingsLiveFile = () => path.join(SIM_ROOT, runId(), 'sim-findings-live.json')

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

// v15-E8: صيغة التعديل (exec) — مع COMMIT صريح (بذر/تنظيف حالة البطارية)
const PY_CODE_EXEC = [
  'import sqlite3, json, sys',
  'try:',
  '    db = sqlite3.connect(sys.argv[2], isolation_level=None)',
  '    cur = db.execute(sys.argv[1], json.loads(sys.argv[3] or "[]"))',
  '    rowcount = cur.rowcount',
  '    db.commit()',
  '    db.close()',
  '    print(json.dumps({"ok": True, "rowcount": rowcount}, ensure_ascii=False))',
  'except Exception as e:',
  '    print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))',
].join('\n')

function runPy(code, sql, args) {
  if (!fs.existsSync(DB)) {
    throw new Error(`SIM_DB غير موجودة: ${DB} — شغّل scripts/v15_sim_local_battery.sh أولاً`)
  }
  const out = execFileSync(PY, ['-c', code, sql, DB, JSON.stringify(args ?? [])], {
    encoding: 'utf-8',
    timeout: 20_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  return JSON.parse(out)
}

/** تنفيذ SELECT وإرجاع الصفوف — يرمي عند فشل الاتصال/الاستعلام. */
export function query(sql, args = []) {
  const parsed = runPy(PY_CODE, sql, args)
  if (!parsed.ok) throw new Error(`فشل ادعاء SQL: ${parsed.error}`)
  return parsed.rows
}

/** v15-E8: تنفيذ تعديل (INSERT/UPDATE/DELETE) مع commit — يرمي عند الفشل. */
export function exec(sql, args = []) {
  const parsed = runPy(PY_CODE_EXEC, sql, args)
  if (!parsed.ok) throw new Error(`فشل تعديل SQL: ${parsed.error}`)
  return parsed.rowcount
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

// ── قائمة السماح (sim-findings.json — تصميم D13 §3.3) ──────────────────
const DEFAULT_FINDINGS = path.resolve(__dirname, '../fixtures/sim-findings.json')
let _allowlistCache = null

function roundLt(a, b) {
  // مقارنة جولات رقمية (v14 < v15)؛ 'prod' لا تنتهي أبداً هنا
  const na = /^v(\d+)$/.exec(String(a))
  const nb = /^v(\d+)$/.exec(String(b))
  if (!na || !nb) return false
  return Number(na[1]) < Number(nb[1])
}

function allowlist() {
  if (_allowlistCache !== null) return _allowlistCache
  const file = process.env.SIM_FINDINGS || DEFAULT_FINDINGS
  let entries = []
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
    entries = Array.isArray(raw.entries) ? raw.entries : []
  } catch {
    entries = [] // لا قائمة = صرامة كاملة (لا بوابة صامتة)
  }
  const currentRound = process.env.SIM_ROUND || 'v15'
  const live = {}
  for (const e of entries) {
    if (!e || !e.id) continue
    if (e.expires && e.expires !== 'prod' && roundLt(e.expires, currentRound)) {
      console.warn(`  [findings] إدخال منتهي الجولة (${e.id}: expires=${e.expires} < ${currentRound}) — يُعامل غير مُدرج (صرامة)`)
      continue
    }
    live[e.id] = e
  }
  _allowlistCache = live
  return live
}

function appendJsonl(file, row) {
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf-8')
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
 *
 * v15-E8 (§3.1): الإنفاذ — أحمر غير مُدرج يرمي فوراً (يفشل الاختبار
 * ويحمرّ البطارية عبر خروج playwright ≠ 0)؛ طبقة السكربت المركّبة
 * (CLAIMS_EXIT) بوابة ثانية.
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
    // §3.1(4): خطأ الاستعلام نفسه أحمر — نفس مسار الإنفاذ (لا ابتلاع)
    error = String(e)
    ok = false
  }

  const entry = allowlist()[claim]
  const enforce = (process.env.SIM_ENFORCE_CLAIMS || '1') !== '0'

  if (ok) {
    // كاشف الانقلاب (§3.3): إدخال سماح صار أخضر — إشارة فورية لحذفه
    if (entry) {
      const row = recordClaim(persona, claim, expected, error ? `خطأ: ${error}` : actual, true, {
        query: sql,
        findingClosed: true,
        findingRef: entry.finding,
        ...extra,
      })
      appendJsonl(findingsLiveFile(), {
        id: claim, persona, ts: row.ts, status: 'findingClosed',
        ref: entry.finding, action: 'احذف الإدخال من قائمة السماح — العقد صار صارماً',
      })
      console.log(`  [findings] انقلاب أخضر: «${claim}» (${entry.finding}) — يُحذف من قائمة السماح`)
      return row
    }
    return recordClaim(persona, claim, expected, error ? `خطأ: ${error}` : actual, true, {
      query: sql,
      ...extra,
    })
  }

  if (entry) {
    // §3.1(3أ): أحمر مُدرج → يوسم allowlisted ويستمر الاختبار (findings ≠ فشل)
    const row = recordClaim(persona, claim, expected, error ? `خطأ: ${error}` : actual, false, {
      query: sql,
      allowlisted: true,
      findingRef: entry.finding,
      findingReason: entry.reason,
      ...extra,
    })
    appendJsonl(findingsLiveFile(), {
      id: claim, persona, ts: row.ts, status: 'allowlisted', ref: entry.finding,
      reason: entry.reason, expires: entry.expires,
    })
    console.log(`  [findings] FINDING موثق: «${claim}» (${entry.finding}) — يستمر الاختبار`)
    return row
  }

  if (!enforce) {
    // §3.1(3ج): تشخيص فقط
    return recordClaim(persona, claim, expected, error ? `خطأ: ${error}` : actual, false, {
      query: sql,
      ...(error ? { error } : {}),
      ...extra,
    })
  }

  // §3.1(3ب): أحمر غير موثق → رمي — «البطارية خضراء» تصبح صادقة
  recordClaim(persona, claim, expected, error ? `خطأ: ${error}` : actual, false, {
    query: sql,
    ...(error ? { error } : {}),
    ...extra,
  })
  throw new Error(
    `ادعاء أحمر غير موثق: ${persona}/${claim} — متوقع: ${expected} | فعلي: ${JSON.stringify(actual)?.slice(0, 400)}` +
      (error ? ` | خطأ: ${error}` : '')
  )
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

/** v15-E8: حالة قائمة السماح (للسكربت والتشخيص). */
export function findingsStatus() {
  const live = allowlist()
  return { count: Object.keys(live).length, ids: Object.keys(live) }
}

// ── CLI ───────────────────────────────────────────────────────────────
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  const [cmd, a, b] = process.argv.slice(2)
  try {
    if (cmd === 'claim') {
      console.log(JSON.stringify({ ok: true, rows: query(a, b ? JSON.parse(b) : []) }, null, 0))
    } else if (cmd === 'exec') {
      console.log(JSON.stringify({ ok: true, rowcount: exec(a, b ? JSON.parse(b) : []) }, null, 0))
    } else if (cmd === 'record') {
      console.log(JSON.stringify(recordClaimRow(JSON.parse(a))))
    } else if (cmd === 'preflight') {
      preflight()
    } else if (cmd === 'findings') {
      console.log(JSON.stringify(findingsStatus(), null, 2))
    } else {
      console.error('الاستخدام: db-claims.mjs claim|exec "<SQL>" [argsJson] | record "<JSON>" | preflight | findings')
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
