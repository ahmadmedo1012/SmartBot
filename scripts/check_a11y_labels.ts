/**
 * v6 §B gate — icon-only interactive controls MUST carry accessible names.
 *
 * Scans every .tsx under src/ for <Button>/<button>/<a href> whose visible
 * content is only icons (no text) and which lack aria-label/aria-labelledby.
 * Conservative by design: any letters inside JSX expressions (variables,
 * conditional text) count as text → biases toward false negatives so the CI
 * gate never cries wolf; manual audits cover the residue.
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

const bad: { file: string; line: number; snippet: string }[] = [];

for (const f of files) {
  const src = readFileSync(f, "utf8");
  const tagRe = /<(Button|button|a)\b/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(src))) {
    const start = m.index;
    // skip render targets: <Something render={<Button …/>}> gets its name from the wrapper's children
    const prefix = src.slice(Math.max(0, start - 80), start);
    if (/render=\{\s*$/.test(prefix)) {
      // self-closing render target → the wrapper supplies children; skip
      let i = m.index + m[0].length;
      while (i < src.length && src[i] !== ">") i++;
      if (/\/\s*>$/.test(src.slice(start, i + 1))) continue;
    }
    let i = m.index + m[0].length;
    while (i < src.length && src[i] !== ">") i++;
    const openTag = src.slice(start, i + 1);
    if (m[1] === "a" && !/href\s*=/.test(openTag)) continue; // non-interactive anchor
    if (/aria-label\s*=|aria-labelledby\s*=/.test(openTag)) continue;
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
    let text = content.replace(/<[^>]*>/g, " ");
    text = text.replace(/\{([^{}]*)\}/g, (_all, inner: string) =>
      hasTextInExpr(inner) ? " TXT " : " "
    );
    text = text.replace(/\s+/g, " ").trim();
    const meaningful = text.replace(/[•·|—–\-]/g, "").trim();
    const compTags = (content.match(/<[A-Za-z][A-Za-z0-9]*/g) || []).length;
    const isIconOnly =
      !srOnly &&
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
