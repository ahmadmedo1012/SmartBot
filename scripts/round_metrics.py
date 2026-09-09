#!/usr/bin/env python3
"""round_metrics.py — v16-E7 (D7-G3): سطر JSONL واحد يلخص مقاييس الجولة.

الأصل: gstack round-metrics (قدرة G3) — يجعل انحرافات الجولات مرئية
تلقائياً (فئة تدقيق D3/2026-09-09). المخرج: إلحاق سطر واحد بـ
docs/evidence/round-metrics.jsonl عند كل استدعاء:

  {round, ts, pytest_total, coverage_pct, allowlist_entries,
   dual_shape_guards, silent_swallows, battery_red_claims,
   ui_transition_all, ui_bounce_easing, ui_multicolor_glow,
   ui_bare_rounded, ui_emoji_icons, ui_slop_total,
   design_score, ai_slop_score, design_score_pct}

القيم: من وسيطات CLI، وما غاب يُشتق تلقائياً:
  · allowlist_entries  — طول entries في قائمة سماح البطارية
                        (fb_dashboard/frontend/e2e/sim/fixtures/sim-findings.json
                        — المسار المختصر e2e/... مقبول احتياطاً)
  · dual_shape_guards / silent_swallows — القاعدتان A وB من slop_scan
    (استيراد مباشر من نفس المجلد — لا subprocess)
  · ui_* / ui_slop_total — قسم D من slop_scan (v17-S5 · D11-G1:
    قواعد slop الواجهة الخمس) — هذه الحقول يقارنها slop_scan
    كاتجاه في الجولة التالية.
  · design_score / ai_slop_score / design_score_pct — مشتقة رخيصة من
    design_baseline.py (v17-S5 · D11-G2) بنفس نتيجة المسح (collect
    يعيد استخدام slop_result — لا مسح مزدوج). غاب السكربت الشقيق
    أو فشل = null (لا يكسر إغلاق الجولة).
pytest_total / coverage_pct / battery_red_claims أرقام موثقة من تشغيل
الجولة (لا يُشغَّل الجناح من هنا) — تُمرَّر كوسائط أو تبقى null.

سلامة الدليل: رفض تسجيل جولة مسجلة سلفاً إلا مع --force (منع التكرار).
--dry-run يطبع السطر دون كتابة؛ --out لمسار بديل (اختبار).

لا يُشغَّل داخل gate_all.sh — المنسّق وحده يشغّله عند إغلاق الجولة.

Usage:
  python scripts/round_metrics.py --round v16 [--pytest-total N] [--coverage F]
      [--allowlist-entries N] [--dual-shape N] [--silent-swallows N]
      [--battery-red N] [--ui-slop N] [--design-score F] [--ai-slop-score F]
      [--dry-run] [--force] [--out PATH]
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

try:  # v17-S5: الحقول التصميمية رخيصة — وفشل استيراد السكربت الشقيق لا يكسر الجولة
    import design_baseline  # noqa: E402 — نفس المجلد
except Exception:  # pragma: no cover — حماية عقيدة البوابة فقط
    design_baseline = None  # type: ignore[assignment]

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
    ap.add_argument("--ui-slop", type=int, default=None, help="total §D UI-slop findings (default: slop_scan section D)")
    ap.add_argument("--design-score", default=None, help="design letter A-F (default: derived from design_baseline.py)")
    ap.add_argument("--ai-slop-score", default=None, help="aiSlop letter A-F (default: derived from design_baseline.py)")
    ap.add_argument("--dry-run", action="store_true", help="print the line; do not append")
    ap.add_argument("--force", action="store_true", help="re-record an already-recorded round")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help=f"JSONL path (default: {DEFAULT_OUT})")
    args = ap.parse_args()

    rnd = args.round or default_round()
    out_path = Path(args.out)

    allowlist = args.allowlist_entries if args.allowlist_entries is not None else count_allowlist()

    # v17-S5: مسح واحد لكل شيء — القاعدتان A/B + قسم D + مقاييس الأساس
    # التصميمي تشترك في نتيجة scan_rules نفسها (design_baseline.collect
    # يعيد استخدامها عبر slop_result — لا مسح مزدوج)؛ الوسائط اليدوية
    # تبقى تجاوزات صريحة فقط.
    res = slop_scan.scan_rules(REPO_ROOT)
    ui = dict(res["ui"])  # type: ignore[arg-type]
    dual = args.dual_shape if args.dual_shape is not None else len(res["dual_shape"])  # type: ignore[arg-type]
    swallows = (
        args.silent_swallows
        if args.silent_swallows is not None
        else int(res["silent_swallows"])  # type: ignore[arg-type]
    )
    ui_slop_total = args.ui_slop if args.ui_slop is not None else int(ui["ui_slop_total"])

    design_score: str | None = args.design_score
    ai_slop_score: str | None = args.ai_slop_score
    design_pct: float | None = None
    if (design_score is None or ai_slop_score is None) and design_baseline is not None:
        try:
            graded = design_baseline.grade(design_baseline.collect(REPO_ROOT, slop_result=res))  # type: ignore[union-attr]
            design_score = design_score if design_score is not None else str(graded["designScore"])
            ai_slop_score = ai_slop_score if ai_slop_score is not None else str(graded["aiSlopScore"])
            design_pct = float(graded["designScorePct"])
        except Exception:  # pragma: no cover — تشخيصي: الفشل لا يمنع إغلاق الجولة
            design_pct = None

    record = {
        "round": rnd,
        "ts": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pytest_total": args.pytest_total,
        "coverage_pct": round(args.coverage, 2) if args.coverage is not None else None,
        "allowlist_entries": allowlist,
        "dual_shape_guards": dual,
        "silent_swallows": swallows,
        "battery_red_claims": args.battery_red,
        # v17-S5 (D11-G1): عدادات قسم D — يقارنها slop_scan كاتجاه الجولة القادمة
        "ui_transition_all": int(ui["transition_all"]),  # type: ignore[call-overload]
        "ui_bounce_easing": int(ui["bounce_easing"]),  # type: ignore[call-overload]
        "ui_multicolor_glow": int(ui["multicolor_glow"]),  # type: ignore[call-overload]
        "ui_bare_rounded": int(ui["bare_rounded"]),  # type: ignore[call-overload]
        "ui_emoji_icons": int(ui["emoji_icons"]),  # type: ignore[call-overload]
        "ui_slop_total": ui_slop_total,
        # v17-S5 (D11-G2): درجات خط أساس التصميم (رخيصة — من نفس المسح)
        "design_score": design_score,
        "ai_slop_score": ai_slop_score,
        "design_score_pct": design_pct,
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
