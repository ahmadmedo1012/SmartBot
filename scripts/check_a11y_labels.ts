/**
 * v6 §B gate (v7-upgraded) — icon-only interactive controls MUST carry
 * accessible names.
 *
 * v7 upgrade (plan §4): the v6 classifier was deliberately conservative —
 * {ternary} content counted as "text" even when every branch renders an
 * ICON (e.g. {show ? <EyeOff/> : <Eye/>}), and aria-label={dynamic} was not
 * recognized as a label. Both are now handled with the same honest rules
 * as scripts/gen_a11y_audit.mjs (the full 100% audit companion):
 *   - content text = literal letters OR braces holding Arabic/quoted text
 *     OR a pure variable ref; braces holding ONLY icons/logic = no text.
 *   - labels = aria-label="..." | aria-label={...} | aria-labelledby |
 *     title | sr-only child.
 *
 * Known non-violation pattern: <DialogPrimitive.Close render={<Button />}>…text…</DialogPrimitive.Close>
 * — the render target inherits the wrapper's children as its accessible name,
 * so a self-closing Button inside render={…} is skipped.
 *
 * Exit code 1 when any unnamed icon-only control is found.
 * Run: node scripts/check_a11y_labels.ts   (cwd = fb_dashboard/frontend)
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd() + "/src";
const files: string[] = [];
(function walk(dir: string) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.tsx$/.test(e)) files.push(p);
  }
})(ROOT);

// any letters (quoted strings, bare JSX text, variables) = potential visible text
const hasTextInExpr = (s: string) => /[A-Za-z\u0600-\u06FF]/.test(s);

/**
 * v7 root-cause fix: find the REAL end of an opening tag. The v6 loop
 * `while (src[i] !== ">")` stopped at the `>` of arrow functions inside
 * JSX attributes (onClick={() => …}) — the rest of the tag (including
 * aria-label!) leaked into "content" and was miscounted as visible text,
 * silently blinding the gate for EVERY button with an arrow-function
 * attribute. This scanner tracks brace depth and quotes: a `>` inside
 * {...} or a string never closes the tag.
 */
function openTagEnd(src: string, start: number): number {
  let i = start;
  let depth = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== "\\") quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    else if (c === ">" && depth === 0) return i;
    i++;
  }
  return -1;
}

const bad: { file: string; line: number; snippet: string }[] = [];

for (const f of files) {
  const raw = readFileSync(f, "utf8");
  // comment-aware: docs may quote JSX (e.g. "renders <Button> in its hero").
  // Newlines are PRESERVED inside block comments so reported line numbers stay true.
  // Line comments: `//` NOT preceded by ':' — https:// URLs must survive.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(?<!:)\/\/[^\n]*/g, " ");
  const tagRe = /<(Button|button|a)\b/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(src))) {
    const start = m.index;
    // skip render targets: <Something render={<Button …/>}> gets its name from the wrapper's children
    const prefix = src.slice(Math.max(0, start - 80), start);
    if (/render=\{\s*$/.test(prefix)) {
      // self-closing render target → the wrapper supplies children; skip
      const rEnd = openTagEnd(src, m.index + m[0].length);
      if (rEnd > -1 && /\/\s*>$/.test(src.slice(m.index, rEnd + 1))) continue;
    }
    const i = openTagEnd(src, m.index + m[0].length);
    if (i === -1) continue;
    const openTag = src.slice(start, i + 1);
    // primitive definitions that spread {...props} (ui/switch, ui/button):
    // their accessible name flows from CALL SITES (aria-label / htmlFor
    // label association there) — the call sites are what audits must cover.
    if (/\{\.\.\.props\}/.test(openTag)) continue;
    if (m[1] === "a" && !/href\s*=/.test(openTag)) continue; // non-interactive anchor
    if (/aria-label\s*=|aria-labelledby\s*=|\btitle\s*=/.test(openTag)) continue;
    const selfClosing = /\/\s*>$/.test(openTag);
    let content = "";
    let endIdx = -1;
    if (!selfClosing) {
      const closeTag = m[1] === "a" ? "</a>" : m[1] === "Button" ? "</Button>" : "</button>";
      const cIdx = src.indexOf(closeTag, i + 1);
      if (cIdx > -1) {
        content = src.slice(i + 1, cIdx);
        endIdx = cIdx;
      }
    }
    const srOnly = /sr-only/.test(content);
    // v7 honest text classification: braces may hold REAL text (Arabic JSX
    // text, quoted literals, pure variable refs) or ONLY icons/logic.
    // CRITICAL: extract braces from the TAG-STRIPPED content — braces inside
    // tags (className={cn("...")}) vanish with the tag and must NOT count
    // as visible text (the negative test caught this: label-less ThemeToggle
    // was passing because class strings looked like text).
    const noTagsContent = content.replace(/<[^>]*>/g, " ");
    const braceOriginals = [...noTagsContent.matchAll(/\{([^{}]*)\}/g)].map((b) => b[1]);
    let braceHasText = false;
    for (const b of braceOriginals) {
      const stripped = b.replace(/<[^<>]*>/g, " ");
      if (/[ء-ي]/.test(stripped)) { braceHasText = true; break; }
      if (/["'`][^"'`]*[A-Za-z\u0600-\u06FF]/.test(stripped)) { braceHasText = true; break; }
      if (!b.includes("<") && /^\(?[A-Za-z_$][\w$.]*\)?$/.test(b.trim())) { braceHasText = true; break; }
    }
    let text = noTagsContent;
    text = text.replace(/\{[^{}]*\}/g, (_all, inner: string) =>
      hasTextInExpr(inner) ? " TXT " : " "
    );
    text = text.replace(/\s+/g, " ").trim();
    const meaningful = text.replace(/[•·|—–\-]/g, "").trim();
    const compTags = (content.match(/<[A-Za-z][A-Za-z0-9]*/g) || []).length;
    const isIconOnly =
      !srOnly &&
      !braceHasText &&
      (selfClosing || (meaningful.length === 0 && (compTags > 0 || content.trim() === "")));
    if (isIconOnly) {
      const line = src.slice(0, start).split("\n").length;
      bad.push({
        file: relative(process.cwd(), f),
        line,
        snippet: (selfClosing ? openTag : openTag + " … " + content.replace(/\s+/g, " ").slice(0, 80))
          .replace(/\s+/g, " ")
          .slice(0, 160),
      });
    }
    if (endIdx > 0) tagRe.lastIndex = Math.max(tagRe.lastIndex, endIdx);
  }
}

console.log("=== unnamed icon-only interactive controls: " + bad.length + " ===");
for (const b of bad) console.log(`${b.file}:${b.line}\n    ${b.snippet}\n`);
if (bad.length > 0) {
  console.log("FAIL a11y gate — add a descriptive Arabic aria-label to each control above.");
  process.exit(1);
}
console.log(`PASS a11y gate — all icon-only interactive controls have accessible names (${files.length} files scanned)`);
