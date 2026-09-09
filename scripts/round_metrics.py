#!/usr/bin/env python3
"""round_metrics.py — v16-E7 (D7-G3): سطر JSONL واحد يلخص مقاييس الجولة.

الأصل: gstack round-metrics (قدرة G3) — يجعل انحرافات الجولات مرئية
تلقائياً (فئة تدقيق D3/2026-09-09). المخرج: إلحاق سطر واحد بـ
docs/evidence/round-metrics.jsonl عند كل استدعاء:

  {round, ts, pytest_total, coverage_pct, allowlist_entries,
   dual_shape_guards, silent_swallows, battery_red_claims}

القيم: من وسيطات CLI، وما غاب يُشتق تلقائياً:
  · allowlist_entries  — طول entries في قائمة سماح البطارية
                        (fb_dashboard/frontend/e2e/sim/fixtures/sim-findings.json
                        — المسار المختصر e2e/... مقبول احتياطاً)
  · dual_shape_guards / silent_swallows — القاعدتان A وB من slop_scan
    (استيراد مباشر من نفس المجلد — لا subprocess)
pytest_total / coverage_pct / battery_red_claims أرقام موثقة من تشغيل
الجولة (لا يُشغَّل الجناح من هنا) — تُمرَّر كوسائط أو تبقى null.

سلامة الدليل: رفض تسجيل جولة مسجلة سلفاً إلا مع --force (منع التكرار).
--dry-run يطبع السطر دون كتابة؛ --out لمسار بديل (اختبار).

لا يُشغَّل داخل gate_all.sh — المنسّق وحده يشغّله عند إغلاق الجولة.

Usage:
  python scripts/round_metrics.py --round v16 [--pytest-total N] [--coverage F]
      [--allowlist-entries N] [--dual-shape N] [--silent-swallows N]
      [--battery-red N] [--dry-run] [--force] [--out PATH]
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))

import slop_scan  # noqa: E402 — نفس المجلد؛ E402 متجاهل في ruff.toml (بنية الإقحام)

ROUND_ENV = SCRIPTS_DIR / "round.env"
DEFAULT_OUT = REPO_ROOT / "docs" / "evidence" / "round-metrics.jsonl"
ALLOWLIST_CANDIDATES = (
    REPO_ROOT / "fb_dashboard" / "frontend" / "e2e" / "sim" / "fixtures" / "sim-findings.json",
    REPO_ROOT / "e2e" / "sim" / "fixtures" / "sim-findings.json",
)


def default_round() -> str:
    """ROUND من scripts/round.env (fallback v16 — نفس سقف gate_all.sh)."""
    try:
        for line in ROUND_ENV.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped.startswith("ROUND=") and not stripped.startswith("#"):
                return stripped.split("=", 1)[1].strip() or "v16"
    except OSError:
        pass
    return "v16"


def count_allowlist() -> int | None:
    """عدد إدخالات قائمة السماح من sim-findings.json (null إن غاب)."""
    for path in ALLOWLIST_CANDIDATES:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        entries = data.get("entries") if isinstance(data, dict) else None
        if isinstance(entries, list):
            return len(entries)
    return None


def _recorded_rounds(out_path: Path) -> list[str]:
    try:
        raw_lines = out_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    rounds: list[str] = []
    for raw in raw_lines:
        if not raw.strip():
            continue
        try:
            obj = json.loads(raw)
        except ValueError:
            continue
        if isinstance(obj, dict) and obj.get("round"):
            rounds.append(str(obj["round"]))
    return rounds


def main() -> int:
    ap = argparse.ArgumentParser(description="append ONE round-metrics JSONL line per invocation")
    ap.add_argument("--round", default=None, help=f"round id (default: {default_round()} from scripts/round.env)")
    ap.add_argument("--pytest-total", type=int, default=None, help="pytest passed count (documented run)")
    ap.add_argument("--coverage", type=float, default=None, help="coverage percent, e.g. 61.77")
    ap.add_argument("--allowlist-entries", type=int, default=None, help="default: len(entries) of sim-findings.json")
    ap.add_argument("--dual-shape", type=int, default=None, help="default: slop_scan rule A count")
    ap.add_argument("--silent-swallows", type=int, default=None, help="default: slop_scan rule B count")
    ap.add_argument("--battery-red", type=int, default=None, help="red claims allowlisted in the battery")
    ap.add_argument("--dry-run", action="store_true", help="print the line; do not append")
    ap.add_argument("--force", action="store_true", help="re-record an already-recorded round")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help=f"JSONL path (default: {DEFAULT_OUT})")
    args = ap.parse_args()

    rnd = args.round or default_round()
    out_path = Path(args.out)

    allowlist = args.allowlist_entries if args.allowlist_entries is not None else count_allowlist()
    if args.dual_shape is not None and args.silent_swallows is not None:
        dual, swallows = args.dual_shape, args.silent_swallows
    else:
        res = slop_scan.scan_rules(REPO_ROOT)
        dual = args.dual_shape if args.dual_shape is not None else len(res["dual_shape"])
        swallows = args.silent_swallows if args.silent_swallows is not None else int(res["silent_swallows"])

    record = {
        "round": rnd,
        "ts": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pytest_total": args.pytest_total,
        "coverage_pct": round(args.coverage, 2) if args.coverage is not None else None,
        "allowlist_entries": allowlist,
        "dual_shape_guards": dual,
        "silent_swallows": swallows,
        "battery_red_claims": args.battery_red,
    }
    line = json.dumps(record, ensure_ascii=False)

    if rnd in _recorded_rounds(out_path) and not args.force:
        msg = f"ERROR: round '{rnd}' already recorded in {out_path} — pass --force to re-record"
        if args.dry_run:
            print(f"[dry-run] {msg}\n[dry-run] line: {line}")
            return 1
        print(msg, file=sys.stderr)
        return 1

    if args.dry_run:
        print(f"[dry-run] would append to {out_path}:\n{line}")
        return 0

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")
    print(f"appended 1 line to {out_path}:\n{line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
