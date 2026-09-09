#!/usr/bin/env python3
"""slop_scan.py — v17-S5 (D11-G1): ماسح slop تشخيصي — عقيدة gstack: لا يحجب أبداً.

الأصل: gstack slop-scan (قدرة G1 من تقرير v16-D7) مكيفاً على عقود SmartBot،
مضافاً إليه قسم D (v17-S5 · قدرة G1 من تقرير v17-D11) من
review/design-checklist.md فئة 1 (AI Slop — البنود القابلة للكشف بـ grep):

  A · حراس الشكل المزدوج بعد unwrapApi: ملف يستورد unwrapApi وفيه
      `Array.isArray(x.data) ?` — الخلفية تعيد ok([...]) دائماً والفك
      المركزي (قاعدة v13-3) يجعل الحارس slop يخالف عقد الشكل الواحد.
  B · الابتلاع الصامت (الخلفية): `except ...:` يليه مباشرة
      pass/continue/return None — عدّاد لكل ملف + أعلى 10 بؤر ساخنة.
  C · خرق الفك المركزي: `.data ?? []` أو `d?.data` في ملف يستورد
      unwrapApi (null-safety المشروعة بعد الفك — `d ?? []` — ليست من
      هذا الصنف؛ النمطان المذكوران فقط).
  D · slop الواجهة (v17-S5 — تشخيصي لا يحجب، على fb_dashboard/frontend/src
      فقط، تجاهل *.test.*): أول خمس قواعد قابلة للترجمة الآلية من فئات
      1-4 في design-checklist:
      أ) transition-all [layout-transition] في tsx/ts.
      ب) easing مصطناعي [bounce-easing]: cubic-bezier بنقطة y > 1
         (overshoot) أو animate-bounce/ease-bounce/animation:*bounce*.
      ج) glow متعدد الألوان [dark-glow]: shadow-[..] أو box-shadow
         بطبقتين ملونتين+ في كلاس/إعلان واحد.
      د) rounded عارية بلا مقاس في tsx/ts (مقابل rounded-lg+).
      هـ) أيقونات إيموجي في نص JSX (✅💡✓✗✨🚀🎉⚡🔥❌⭐ — توثيق نمط
          متقاعد في تعليق ليس خرقاً: أسطر التعليقات تُتخطى).

التنفيذ: os.walk + regex مُجمَّع بلا AST (ميزانية سرعة ~30 ثانية)؛ أسطر
التعليقات تُتخطى في القواعد الأمامية (توثيق نمط متقاعد ليس خرقاً).
الماسح **تشخيصي حصراً**: exit 0 دائماً — قيمته في العدّادات والاتجاه.

الاتجاه: يُقارن بآخر سطر JSONL في docs/evidence/round-metrics.jsonl (يكتبه
round_metrics.py عند إغلاق كل جولة — يسجل الآن حقول ui_* لقسم D) — سطر
واحد يطبع الفرق لكل قاعدة (أ)…(هـ) عند توفرها في السجل السابق.

Usage: python scripts/slop_scan.py [--root REPO_ROOT] [--metrics JSONL_PATH]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
METRICS_JSONL = REPO_ROOT / "docs" / "evidence" / "round-metrics.jsonl"

# ماسح سريع: يتخطى أدوات البناء/المخرجات؛ الملف الضخم يُتخطى (فشل مفتوح
# مقصود — تشخيصي لا يحجب، بخلاف عقيدة secret_scan الفاشلة مغلقاً).
SKIP_DIRS = frozenset({".next", "node_modules", "static", "coverage", ".turbo", "__pycache__"})
MAX_FILE_BYTES = 2 * 1024 * 1024

RULE_A_RE = re.compile(r"Array\.isArray\(\s*\w+\.data\s*\)\s*\?")
RULE_B_RE = re.compile(r"except[^\n:]*:\s*\n[ \t]*(?:pass|continue|return[ \t]+None)\b")
RULE_C_RE = re.compile(r"\.data\s*\?\?\s*\[\]|\bd\?\.data\b")
UNWRAP_RE = re.compile(r"\bunwrapApi\b")
COMMENT_RE = re.compile(r"[ \t]*(?://|/\*|\*|#)")
TEST_NAME_RE = re.compile(r"(?:^|/)test_[^/]*\.py$|\.test\.[^./]+$|_test\.py$")

# ── قسم D (v17-S5 · D11-G1): قواعد slop الواجهة — تشخيصية، لا تحجب ──────
UI_TS_SUFFIXES = (".tsx", ".ts")
UI_ALL_SUFFIXES = (".tsx", ".ts", ".css")
UI_RULE_LABELS = (
    ("transition_all", "[أ] transition-all (tsx/ts)"),
    ("bounce_easing", "[ب] bounce/overshoot easing"),
    ("multicolor_glow", "[ج] multi-color layered glow"),
    ("bare_rounded", "[د] bare `rounded` (vs lg+)"),
    ("emoji_icons", "[هـ] emoji icons in JSX text"),
)
RULE_D1_RE = re.compile(r"\btransition-all\b")
RULE_D2_BOUNCE_RE = re.compile(
    r"\b(?:animate-bounce|ease-bounce)\b"
    r"|animation(?:-name)?\s*:\s*[^;\n]*\bbounce\b"
)
RULE_D2_CUBIC_RE = re.compile(r"cubic-bezier\(\s*([^)]*)\)")
RULE_D3_SHADOW_CLASS_RE = re.compile(r"(?:drop-)?shadow-\[([^\]]+)\]")
RULE_D3_BOX_RE = re.compile(r"box-shadow:\s*([^;}\n]+)")
RULE_D4_RE = re.compile(r"\brounded\b(?![-\w])")
RULE_D5_RE = re.compile(
    "[\u2705\u2713\u2717\U0001F4A1\u2728\U0001F680\U0001F389"
    "\u26A1\U0001F525\u274C\u2B50]"
)
COLOR_TOKEN_RE = re.compile(
    r"rgba?\(|hsla?\(|oklch\(|#[0-9a-fA-F]{3,8}\b|color-mix\("
)
UI_LINE_COMMENT_START_RE = re.compile(r"^(?://|/\*|\*|\{/\*)")
UI_INLINE_COMMENT_RE = re.compile(r"(?<!:)//")  # '//' وليس '://' داخل نص


def _iter_files(root: Path, suffixes: tuple[str, ...], skip_dirs: tuple[str, ...] = ()) -> list[Path]:
    """os.walk مرتب — بلا AST وبلا git (سرعة المسح ضمن الميزانية)."""
    found: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and d not in skip_dirs)
        for name in sorted(filenames):
            if name.endswith(suffixes) and not TEST_NAME_RE.search(f"{dirpath}/{name}".replace("\\", "/")):
                found.append(Path(dirpath) / name)
    return found


def _read(path: Path) -> str | None:
    try:
        if path.stat().st_size > MAX_FILE_BYTES:
            return None
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None


def _match_lines(text: str, pattern: re.Pattern[str], skip_comments: bool) -> list[int]:
    """أرقام أسطر المطابقات؛ أسطر التعليقات تُتخطى (قاعدة أمامية)."""
    lines: list[int] = []
    for m in pattern.finditer(text):
        if skip_comments:
            line_start = text.rfind("\n", 0, m.start()) + 1
            if COMMENT_RE.match(text, line_start):
                continue
        lines.append(text.count("\n", 0, m.start()) + 1)
    return lines


def _ui_comment_mask(lines: list[str]) -> list[bool]:
    """قناع أسطر التعليقات لقسم D (JS/TS/CSS).

    أبسط مما يبدو ويكفي الغرض: آلة حالة لكتل ``/* ... */`` متعددة الأسطر
    (السطر الذي يفتح ويغلق في السطر نفسه لا يشعل الحالة)، + بدايات
    الأسطر (// · /* · * · {/* JSX)، + التعليق الذيلي ``//`` في نهاية السطر
    (يفحص في :func:`_ui_hits` وليس هنا — هذا القناع للسطر كاملاً).
    السطر الذي يغلق كتلة (``*/ ...``) يُحسب تعليقاً بالكامل (تبسيط
    مقصود: كود بعد ``*/`` في السطر نفسه نادر في الشجرة).
    """
    mask: list[bool] = []
    in_block = False
    for line in lines:
        stripped = line.lstrip()
        is_comment = in_block or bool(UI_LINE_COMMENT_START_RE.match(stripped))
        opens = line.find("/*")
        closes = line.find("*/")
        if in_block:
            if closes != -1:
                in_block = False
        elif opens != -1 and (closes == -1 or closes < opens):
            in_block = True
        mask.append(is_comment)
    return mask


def _ui_hits(
    text: str,
    lines: list[str],
    mask: list[bool],
    pattern: re.Pattern[str],
) -> list[int]:
    """أرقام أسطر مطابقات قسم D بعد قناع التعليقات (بداية + كتل + ذيل //)."""
    out: list[int] = []
    for m in pattern.finditer(text):
        ln = text.count("\n", 0, m.start())
        if ln >= len(mask) or mask[ln]:
            continue
        col = m.start() - (text.rfind("\n", 0, m.start()) + 1)
        prefix = lines[ln][:col]
        if "/*" in prefix or UI_INLINE_COMMENT_RE.search(prefix):
            continue
        out.append(ln + 1)
    return out


def _bezier_overshoot(params: str) -> bool:
    """cubic-bezier بنقطة y > 1 = overshoot/bounce (قاعدة gstack)."""
    nums: list[float] = []
    for tok in params.split(","):
        try:
            nums.append(float(tok.strip()))
        except ValueError:
            return False
    return len(nums) == 4 and (nums[1] > 1 or nums[3] > 1)


def _glow_layered(value: str) -> bool:
    """ظل بطبقتين ملونتين+ في قيمة/كلاس واحد (glow مُبالغ)."""
    return "," in value and len(COLOR_TOKEN_RE.findall(value)) >= 2


def _pos_ok(text: str, lines: list[str], mask: list[bool], pos: int) -> bool:
    """هل الموضع داخل كود فعلي (ليس سطر تعليق ولا بعد /* أو // في سطره)؟"""
    ln = text.count("\n", 0, pos)
    if ln >= len(mask) or mask[ln]:
        return False
    col = pos - (text.rfind("\n", 0, pos) + 1)
    prefix = lines[ln][:col]
    return "/*" not in prefix and not UI_INLINE_COMMENT_RE.search(prefix)


def scan_ui_rules(repo_root: str | Path | None = None) -> dict[str, object]:
    """قسم D — قواعد slop الواجهة (تشخيصي؛ يستورده design_baseline وround_metrics)."""
    root = Path(repo_root) if repo_root else REPO_ROOT
    fe_root = root / "fb_dashboard" / "frontend" / "src"
    hits: dict[str, list[str]] = {key: [] for key, _ in UI_RULE_LABELS}
    target_files: list[str] = []
    files_scanned = 0
    for path in _iter_files(fe_root, UI_ALL_SUFFIXES):
        rel = path.relative_to(root).as_posix()
        target_files.append(rel)
        text = _read(path)
        if text is None:
            continue
        files_scanned += 1
        lines = text.split("\n")
        mask = _ui_comment_mask(lines)
        is_ts = path.suffix in {".ts", ".tsx"}
        if is_ts:
            for ln in _ui_hits(text, lines, mask, RULE_D1_RE):
                hits["transition_all"].append(f"{rel}:{ln}")
        for ln in _ui_hits(text, lines, mask, RULE_D2_BOUNCE_RE):
            hits["bounce_easing"].append(f"{rel}:{ln}")
        for m in RULE_D2_CUBIC_RE.finditer(text):
            if _pos_ok(text, lines, mask, m.start()) and _bezier_overshoot(m.group(1)):
                hits["bounce_easing"].append(f"{rel}:{text.count(chr(10), 0, m.start()) + 1}")
        for regex in (RULE_D3_SHADOW_CLASS_RE, RULE_D3_BOX_RE):
            for m in regex.finditer(text):
                if _pos_ok(text, lines, mask, m.start()) and _glow_layered(m.group(1)):
                    hits["multicolor_glow"].append(f"{rel}:{text.count(chr(10), 0, m.start()) + 1}")
        if is_ts:
            for ln in _ui_hits(text, lines, mask, RULE_D4_RE):
                hits["bare_rounded"].append(f"{rel}:{ln}")
            for ln in _ui_hits(text, lines, mask, RULE_D5_RE):
                hits["emoji_icons"].append(f"{rel}:{ln}")

    top: dict[str, list[tuple[str, int]]] = {}
    for key, found in hits.items():
        per_file: dict[str, int] = {}
        for h in found:
            fname = h.rsplit(":", 1)[0]
            per_file[fname] = per_file.get(fname, 0) + 1
        top[key] = sorted(per_file.items(), key=lambda kv: (-kv[1], kv[0]))[:5]
    return {
        **{key: len(hits[key]) for key, _ in UI_RULE_LABELS},
        "ui_slop_total": sum(len(v) for v in hits.values()),
        "ui_samples": {key: hits[key][:10] for key, _ in UI_RULE_LABELS},
        "ui_top_files": top,
        "ui_files_scanned": files_scanned,
        "ui_target_files": target_files,
    }


def scan_rules(repo_root: str | Path | None = None) -> dict[str, object]:
    """القواعد A-D — يستوردها round_metrics.py وdesign_baseline.py للاشتقاق التلقائي."""
    root = Path(repo_root) if repo_root else REPO_ROOT
    fe_root = root / "fb_dashboard" / "frontend" / "src"
    be_root = root / "fb_dashboard"

    # القاعدتان A وC: ملفات الواجهة التي تستورد unwrapApi (تجاهل *.test.*)
    dual_shape: list[str] = []
    unwrap_violations: list[str] = []
    fe_scanned = 0
    for path in _iter_files(fe_root, (".ts", ".tsx")):
        text = _read(path)
        if text is None or not UNWRAP_RE.search(text):
            continue
        fe_scanned += 1
        rel = path.relative_to(root).as_posix()
        for ln in _match_lines(text, RULE_A_RE, True):
            dual_shape.append(f"{rel}:{ln}")
        for ln in _match_lines(text, RULE_C_RE, True):
            unwrap_violations.append(f"{rel}:{ln}")

    # القاعدة B: بايثون الخلفية (تجاهل الاختبارات/migrations/static/frontend)
    swallows: dict[str, int] = {}
    swallow_lines: dict[str, list[int]] = {}
    be_scanned = 0
    for path in _iter_files(be_root, (".py",), skip_dirs=("frontend", "migrations", "static")):
        text = _read(path)
        if text is None:
            continue
        be_scanned += 1
        hits = _match_lines(text, RULE_B_RE, True)
        if hits:
            rel = path.relative_to(root).as_posix()
            swallows[rel] = len(hits)
            swallow_lines[rel] = hits[:3]

    top = sorted(swallows.items(), key=lambda kv: (-kv[1], kv[0]))[:10]
    return {
        "dual_shape": dual_shape,
        "unwrap_violations": unwrap_violations,
        "silent_swallows": sum(swallows.values()),
        "swallow_files": len(swallows),
        "swallow_top": top,
        "swallow_lines": swallow_lines,
        "frontend_files": fe_scanned,
        "backend_files": be_scanned,
        # v17-S5 (D11-G1): قسم D كاملاً — المفاتيح المسطحة (ui_*) هي التي
        # يسجلها round_metrics.py في JSONL فيقارنها هذا الماسح كاتجاه.
        "ui": scan_ui_rules(root),
    }


def _last_metrics(path: Path) -> dict[str, object] | None:
    try:
        lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    except OSError:
        return None
    for line in reversed(lines):
        try:
            obj = json.loads(line)
        except ValueError:
            continue
        if isinstance(obj, dict):
            return obj
    return None


def _trend(metrics_path: Path, cur_dual: int, cur_swallows: int, ui: dict[str, object] | None = None) -> str:
    prev = _last_metrics(metrics_path)
    if not prev or "dual_shape_guards" not in prev or "silent_swallows" not in prev:
        return "no previous round in the metrics file — this run establishes the baseline"
    rnd = prev.get("round", "?")
    p_dual, p_sw = prev["dual_shape_guards"], prev["silent_swallows"]
    parts = [
        f"vs {rnd}: dual-shape {p_dual}→{cur_dual} {_arrow(p_dual, cur_dual)}",
        f"swallows {p_sw}→{cur_swallows} {_arrow(p_sw, cur_swallows)}",
    ]
    if ui is not None:
        cur_total = int(ui.get("ui_slop_total", 0))  # type: ignore[arg-type]
        p_total = prev.get("ui_slop_total")
        if p_total is None:
            parts.append(f"ui-slop {cur_total} (first measurement — no previous ui baseline)")
        else:
            parts.append(f"ui-slop {p_total}→{cur_total} {_arrow(p_total, cur_total)}")
    return " · ".join(parts)


def _arrow(old: object, new: int) -> str:
    return "↓" if new < old else ("↑" if new > old else "=")


def main() -> int:
    ap = argparse.ArgumentParser(description="SmartBot slop scanner (diagnostic — exit 0 by doctrine)")
    ap.add_argument("--root", default=str(REPO_ROOT), help="repo root (default: this checkout)")
    ap.add_argument("--metrics", default=str(METRICS_JSONL), help="round-metrics.jsonl path for the trend hint")
    args = ap.parse_args()

    res = scan_rules(args.root)
    dual = list(res["dual_shape"])  # type: ignore[arg-type]
    viol = list(res["unwrap_violations"])  # type: ignore[arg-type]
    top = list(res["swallow_top"])  # type: ignore[arg-type]
    lines_map = dict(res["swallow_lines"])  # type: ignore[arg-type]
    cur_swallow = int(res["silent_swallows"])  # type: ignore[arg-type]
    ui = dict(res["ui"])  # type: ignore[arg-type]
    prev = _last_metrics(Path(args.metrics))

    print("slop-scan (v17-S5 · D11-G1) — DIAGNOSTIC ONLY: counts + hotspots, never gates")
    print(f"  [A] dual-shape guards after unwrapApi : {len(dual)}  (unwrapApi files: {res['frontend_files']})")
    for hit in dual[:10]:
        print(f"      · {hit}")
    print(
        f"  [B] silent swallows (except→pass/continue/return None): {cur_swallow}"
        f" across {res['swallow_files']} files  (backend files: {res['backend_files']})"
    )
    for fname, count in top:
        sample = lines_map.get(fname, [])
        where = f" (e.g. lines {', '.join(str(x) for x in sample)})" if sample else ""
        print(f"      · {fname} ×{count}{where}")
    print(f"  [C] centralized-unwrap violations (.data ?? [] / d?.data): {len(viol)}")
    for hit in viol[:10]:
        print(f"      · {hit}")

    # ── قسم D (v17-S5): slop الواجهة — عدد + اتجاه لكل قاعدة ───────────
    samples = dict(ui["ui_samples"])  # type: ignore[arg-type]
    ui_top = dict(ui["ui_top_files"])  # type: ignore[arg-type]
    print(
        "  [D] UI slop (design-checklist f1 — tsx/ts/css, comments skipped):"
        f" total {ui['ui_slop_total']} across {ui['ui_files_scanned']} files"
    )
    for key, label in UI_RULE_LABELS:
        count = int(ui[key])  # type: ignore[call-overload]
        trend = ""
        if prev is not None and ("ui_" + key) in prev:
            trend = f"  {_arrow(prev['ui_' + key], count)}"  # type: ignore[call-overload]
        top_files = ui_top.get(key) or []  # type: ignore[call-overload]
        hot = f"  · top: {', '.join(f'{f}×{c}' for f, c in top_files[:3])}" if top_files else ""
        print(f"      {label} : {count}{trend}{hot}")
        for hit in samples.get(key, [])[:6]:  # type: ignore[call-overload]
            print(f"          · {hit}")
    print(f"  trend: {_trend(Path(args.metrics), len(dual), cur_swallow, ui)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
