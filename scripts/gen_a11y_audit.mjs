#!/usr/bin/env node
/**
 * v7 §3.1/§3.2 — FULL accessibility audit generator (docs/accessibility-audit-v7.md).
 *
 * Unlike the conservative CI gate (scripts/check_a11y_labels.ts, which
 * biases toward false negatives so it never cries wolf), this tool lists
 * EVERY interactive control (<button>/<Button>/<a href>) in src/ with an
 * honest per-button classification, and emits the markdown table the v7
 * plan mandates: "كان له نص مرئي؟ / احتاج aria-label؟ / أُضيف؟".
 *
 * Classification:
 *   text  = "static"  literal Arabic/Latin letters outside JSX expressions
 *         = "dynamic" only {expressions} that reference runtime text
 *         = "none"    no text at all
 *   iconOnly = text "none" AND (svg | Capitalized component | dotted .icon)
 *   accName  = aria-label | aria-labelledby | title | sr-only child
 *
 * A VIOLATION is: iconOnly && !accName. The plan's closure bar: ZERO.
 *
 * Modes:
 *   node gen_a11y_audit.mjs            → console report (violations + counts)
 *   node gen_a11y_audit.mjs --md       → emit the full markdown audit table
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd() + "/src";
const EMIT_MD = process.argv.includes("--md");
const EMIT_DYN = process.argv.includes("--dyn");

/**
 * v7 root-cause fix: REAL opening-tag end. The naive first-">" scan
 * stopped at arrow functions (onClick={() => …}) — the rest of the tag
 * leaked into "content" and masqueraded as visible text. Track brace
 * depth + quotes: a ">" inside {...} never closes the tag.
 */
function openTagEnd(src, start) {
  let i = start, depth = 0, quote = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) { if (c === quote && src[i - 1] !== "\\") quote = null; }
    else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    else if (c === ">" && depth === 0) return i;
    i++;
  }
  return -1;
}
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(e)) files.push(p);
  }
})(ROOT);

const rows = [];
const violations = [];

for (const f of files) {
  const raw = readFileSync(f, "utf8");
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(?<!:)\/\/[^\n]*/g, " ");
  const tagRe = /<(Button|button|a)\b/g;
  let m;
  while ((m = tagRe.exec(src))) {
    const start = m.index;
    const prefix = src.slice(Math.max(0, start - 80), start);
    if (/render=\{\s*$/.test(prefix)) {
      const rEnd = openTagEnd(src, m.index + m[0].length);
      if (rEnd > -1 && /\/\s*>$/.test(src.slice(m.index, rEnd + 1))) continue;
    }
    const i = openTagEnd(src, m.index + m[0].length);
    if (i === -1) continue;
    const openTag = src.slice(start, i + 1);
    // primitive definitions spreading {...props}: name flows from call sites
    if (/\{\.\.\.props\}/.test(openTag)) continue;
    if (m[1] === "a" && !/href\s*=/.test(openTag)) continue;
    const selfClosing = /\/\s*>$/.test(openTag);
    let content = "";
    if (!selfClosing) {
      const closeTag = m[1] === "a" ? "</a>" : m[1] === "Button" ? "</Button>" : "</button>";
      const cIdx = src.indexOf(closeTag, i + 1);
      if (cIdx > -1) {
        content = src.slice(i + 1, cIdx);
        tagRe.lastIndex = Math.max(tagRe.lastIndex, cIdx);
      }
    }
    const line = raw.slice(0, start).split("\n").length;
    const file = relative(process.cwd(), f);

    // accessible name carriers — BOTH static ("...") and dynamic ({...})
    // aria-label/title values count (ternaries like إظهار/إخفاء are labels).
    const ariaLabel = /aria-label\s*=\s*"([^"]*)"/.exec(openTag)?.[1] ?? null;
    const hasDynLabel = /aria-label\s*=\s*\{/.test(openTag);
    const hasTitle = /\btitle\s*=\s*("([^"]*)"|\{)/.test(openTag);
    const hasLabelledby = /aria-labelledby\s*=/.test(openTag);
    const srOnly = /sr-only/.test(content);

    // text classification — three honest tiers:
    //   static  literal letters outside braces
    //   dynamic braces holding REAL runtime text: Arabic letters or quoted
    //           strings survive tag-stripping, or a pure variable ref
    //   none    braces hold only JSX icons/logic → icon-only at runtime
    // ORDER MATTERS: strip TAGS first (attributes carry latin names), and
    // strip tags INSIDE each brace before judging its textiness — so
    // `{loading ? <span …> جاري… </span> : <span> تسجيل </span>}` is TEXT,
    // while `{show ? <EyeOff/> : <Eye/>}` (tags strip to bare identifiers)
    // is NOT.
    const noTags = content.replace(/<[^>]*>/g, " ");
    const outsideBraces = noTags.replace(/\{[^{}]*\}/g, " ");
    const hasStatic = /[A-Za-z\u0600-\u06FF]/.test(outsideBraces);
    // braces are extracted from the TAG-STRIPPED text: className={cn("…")}
    // braces vanish with their tag and must not count as visible text.
    const braceOriginals = [...noTags.matchAll(/\{([^{}]*)\}/g)].map((b) => b[1]);
    let hasRuntimeText = false;
    for (const b of braceOriginals) {
      const stripped = b.replace(/<[^<>]*>/g, " ");
      if (/[ء-ي]/.test(stripped)) { hasRuntimeText = true; break; }            // Arabic JSX text
      if (/["'`][^"'`]*[A-Za-z\u0600-\u06FF]/.test(stripped)) { hasRuntimeText = true; break; } // quoted literal
      if (!b.includes("<") && /^\(?[A-Za-z_$][\w$.]*(\[[^\]]*\])*\)?$/.test(b.trim())) { hasRuntimeText = true; break; } // {var} or {ARR[i]}
    }
    const text = hasStatic ? "static" : hasRuntimeText ? "dynamic" : "none";

    // icon presence: svg, Capitalized JSX component, or dotted .icon member
    const hasIcon = /<svg|<[A-Z][A-Za-z0-9]*[\s/>]|<\w+\.\w+[\s/>]/.test(content) || selfClosing;

    const iconOnly = text === "none" && hasIcon;
    const accName = Boolean(ariaLabel || hasDynLabel || hasTitle || hasLabelledby || srOnly);
    const isViolation = iconOnly && !accName;

    // a readable content snippet for the table
    const snippet = (selfClosing ? openTag : content)
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^\s*|\s*$/g, "")
      .slice(0, 60);

    rows.push({ file, line, kind: m[1], text, iconOnly, accName, ariaLabel, isViolation, snippet });
    if (isViolation) violations.push({ file, line, snippet: openTag.replace(/\s+/g, " ").slice(0, 150) });
  }
}

const withText = rows.filter((r) => r.text !== "none").length;
const iconOnlyLabeled = rows.filter((r) => r.iconOnly && r.accName).length;
const pct = rows.length ? Math.round((iconOnlyLabeled / Math.max(1, rows.filter((r) => r.iconOnly).length)) * 100) : 0;

if (EMIT_MD) {
  console.log("| # | الملف:السطر | النوع | كان له نص مرئي؟ | أيقونة-فقط؟ | تسمية وصول موجودة؟ | احتاج aria-label؟ | أُضيف؟ | مقتطف المحتوى |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  rows.forEach((r, n) => {
    const visible = r.text === "static" ? "نعم (نص ثابت)" : r.text === "dynamic" ? "نعم (ديناميكي)" : "لا";
    const labeled = r.accName ? (r.ariaLabel ? `\`${r.ariaLabel.slice(0, 40)}\`` : "نعم (title/sr-only)") : "لا";
    const needed = r.iconOnly && !r.accName ? "نعم ❗" : "لا";
    const added = r.iconOnly && r.accName ? "موجودة مسبقًا" : "—";
    console.log(`| ${n + 1} | ${r.file}:${r.line} | ${r.kind} | ${visible} | ${r.iconOnly ? "نعم" : "لا"} | ${labeled} | ${needed} | ${added} | ${r.snippet.replace(/\|/g, "/")} |`);
  });
}

console.log(`\n=== TOTAL interactive controls: ${rows.length} (in ${files.length} files) ===`);
console.log(`  with visible text (static or dynamic): ${withText}`);
console.log(`  icon-only: ${rows.filter((r) => r.iconOnly).length} (labeled: ${iconOnlyLabeled}, ${pct}%)`);
console.log(`  VIOLATIONS (icon-only, no accessible name): ${violations.length}`);
for (const v of violations) console.log(`  ✗ ${v.file}:${v.line}\n      ${v.snippet}`);
if (EMIT_DYN) {
  console.log(`\n=== dynamic-text controls (manual runtime review) ===`);
  for (const r of rows.filter((r) => r.text === "dynamic"))
    console.log(`  • ${r.file}:${r.line} [${r.kind}] ${r.accName ? "(+label)" : ""} ${r.snippet.slice(0, 70)}`);
}
if (violations.length > 0) process.exitCode = 1;
