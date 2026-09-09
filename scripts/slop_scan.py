#!/usr/bin/env python3
"""slop_scan.py — v16-E7 (D7-G1): ماسح slop تشخيصي — عقيدة gstack: لا يحجب أبداً.

الأصل: gstack slop-scan (قدرة G1 من تقرير v16-D7) مكيفاً على عقود SmartBot:

  A · حراس الشكل المزدوج بعد unwrapApi: ملف يستورد unwrapApi وفيه
      `Array.isArray(x.data) ?` — الخلفية تعيد ok([...]) دائماً والفك
      المركزي (قاعدة v13-3) يجعل الحارس slop يخالف عقد الشكل الواحد.
  B · الابتلاع الصامت (الخلفية): `except ...:` يليه مباشرة
      pass/continue/return None — عدّاد لكل ملف + أعلى 10 بؤر ساخنة.
  C · خرق الفك المركزي: `.data ?? []` أو `d?.data` في ملف يستورد
      unwrapApi (null-safety المشروعة بعد الفك — `d ?? []` — ليست من
      هذا الصنف؛ النمطان المذكوران فقط).

التنفيذ: os.walk + regex مُجمَّع بلا AST (ميزانية سرعة ~30 ثانية)؛ أسطر
التعليقات تُتخطى في القواعد الأمامية (توثيق نمط متقاعد ليس خرقاً).
الماسح **تشخيصي حصراً**: exit 0 دائماً — قيمته في العدّادات والاتجاه.

الاتجاه: يُقارن بآخر سطر JSONL في docs/evidence/round-metrics.jsonl (يكتبه
round_metrics.py عند إغلاق كل جولة) — سطر واحد يطبع الفرق.

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


def scan_rules(repo_root: str | Path | None = None) -> dict[str, object]:
    """القواعد الثلاث — يستوردها round_metrics.py للاشتقاق التلقائي."""
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


def _trend(metrics_path: Path, cur_dual: int, cur_swallows: int) -> str:
    prev = _last_metrics(metrics_path)
    if not prev or "dual_shape_guards" not in prev or "silent_swallows" not in prev:
        return "no previous round in the metrics file — this run establishes the baseline"
    rnd = prev.get("round", "?")
    p_dual, p_sw = prev["dual_shape_guards"], prev["silent_swallows"]

    def arrow(old: object, new: int) -> str:
        return "↓" if new < old else ("↑" if new > old else "=")

    return (
        f"vs {rnd}: dual-shape {p_dual}→{cur_dual} {arrow(p_dual, cur_dual)}"
        f" · swallows {p_sw}→{cur_swallows} {arrow(p_sw, cur_swallows)}"
    )


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

    print("slop-scan (v16-E7 · D7-G1) — DIAGNOSTIC ONLY: counts + hotspots, never gates")
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
    print(f"  trend: {_trend(Path(args.metrics), len(dual), cur_swallow)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
