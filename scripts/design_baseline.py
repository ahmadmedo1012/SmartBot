#!/usr/bin/env python3
"""design_baseline.py — v17-S5 (D11-G2): خط أساس تصميم قابل للتتبع عبر الجولات.

الأصل: gstack design-review/SKILL.md Phase 6 — درجات A-F مركبة بأوزان
فئات + ملف design-baseline.json لوضع الانحدار (قالب JSON من سطور
1409-1429 منقولاً إلى مصدر SmartBot الثابت: لا متصفح ولا getComputedStyle
هنا — نفس عقيدة slop_scan: os.walk + regex، تشخيصي exit 0 دائماً).

المقاييس (مسح ثابت لـ fb_dashboard/frontend/src، تجاهل *.test.*):

  البنية (structure) — صفحات dashboard التي هاجرت إلى PageHeader
      (ملفات src/app/dashboard المحتوية على PageHeader) مقابل إجمالي
      page.tsx هناك (24 اليوم) — جسر D3 §2 «بنيتا ترويسة» و D4.
  الحقول (fields) — حقول input/textarea/select الخام التي تحمل
      text-xs/text-sm (نافذة 320 حرفاً بعد وسم الفتح — heuristics
      موثقة؛ يجب أن تنخفض مع موجات S4/توحيد مكوّن Input).
  اللون (color) — to-white/bg-white الخام (خارج نطاق بوابة contrast
      — إيجاد D4 §المصيَّر ≠ الموثَّق).
  الحركة (motion) — نسبة useCountUp الموحدة بين صفحات KPI في
      dashboard (الموحدة = تستخدم useCountUp أو KpiCard الذي يغلّفها؛
      الخام = page.tsx فيه text-2xl/3xl/4xl مع font-bold/semibold
      بنفس السطر — proxy موثق).
  aiSlop — عدّاد قسم D من slop_scan.py (القواعد أ-هـ) كما هو.

الدرجات: لكل فئة نسبة 0-100 → حرف (A≥90 · B≥80 · C≥70 · D≥55 · F<55)،
والدرجة المركبة designScore بأوزان: بنية 30% · حقول 20% · لون 15% ·
حركة 15% · aiSlop 20% (مقتبسة من أوزان gstack: hierarchy/typography/
spacing 15% لكل… معدلة لخمسة مقاييس قابلة للقياس من المصدر). aiSlopScore
درجة مستقلة (خصم نقطة لكل إيجاد قسم D — aiSlop 5% في gstack لكنه
درجة عنوان بنفسه).

الأساس (ratchet): docs/evidence/design-baseline.json يُبذر عند أول تشغيل؛
التشغيلات التالية تقيس وتطبع دلتا مقابل الأساس **دون تحديثه** — إعادة
البذر المقصودة عند إغلاق الجولة (المكتّب): `--force`. الكتابة ذرّية
(tmp + os.replace) كما توصي SKILL.md. حقل detector.targetSet = بصمة
sha256 لمجموعة الملفات الممسوحة (سلوك gstack source-mode حرفياً:
تغير المجموعة = لا مقارنة عدّادات).

Usage:
  python scripts/design_baseline.py            # بذر إن لم يوجد؛ وإلا دلتا
  python scripts/design_baseline.py --force    # إعادة بذر (إغلاق جولة)
  python scripts/design_baseline.py --dry-run  # قياس وطباعة بلا كتابة
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import UTC, datetime
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPTS_DIR.parent
sys.path.insert(0, str(SCRIPTS_DIR))

import slop_scan  # noqa: E402 — نفس المجلد؛ E402 متجاهل في ruff.toml (بنية الإقحام)

DEFAULT_OUT = REPO_ROOT / "docs" / "evidence" / "design-baseline.json"
FE_SRC = REPO_ROOT / "fb_dashboard" / "frontend" / "src"

PAGEHEADER_RE = re.compile(r"\bPageHeader\b")
PAGE_TS_RE = re.compile(r"(?:^|/)page\.tsx$")
TO_WHITE_RE = re.compile(r"\bto-white\b")
BG_WHITE_RE = re.compile(r"\bbg-white\b")
COUNTUP_RE = re.compile(r"\buseCountUp\b")
KPICARD_RE = re.compile(r"<KpiCard\b")
KPI_DISPLAY_RE = re.compile(
    r"text-(?:2xl|3xl|4xl)\b[^\n]{0,200}font-(?:bold|semibold)\b"
    r"|font-(?:bold|semibold)\b[^\n]{0,200}text-(?:2xl|3xl|4xl)\b"
)
INPUT_TAG_RE = re.compile(r"<(?:input|textarea|select)\b")
# v17-fix(coordinator): the old `text-(?:xs|sm)\b` counted the CORRECT mobile
# pattern `md:text-sm` (text-base md:text-sm) as a violation because
# `text-sm` appears inside `md:text-sm`. Use a lookbehind to exclude any
# prefixed variant (md: / lg: / dark:...) and skip comment-only lines.
SMALL_TEXT_RE = re.compile(r"(?<![:\w-])text-(?:xs|sm)\b")

# نافذة البحث بعد وسم الحقل: تكفي لسمات className متعددة الأسطر دون
# الانزلاق للعنصر التالي غالباً (heuristics موثقة أعلاه).
FIELD_WINDOW = 320

WEIGHTS: dict[str, float] = {
    "structure": 0.30,
    "fields": 0.20,
    "color": 0.15,
    "motion": 0.15,
    "ai_slop": 0.20,
}
LETTER_STEPS = (90.0, 80.0, 70.0, 55.0)


def _letter(pct: float) -> str:
    if pct >= LETTER_STEPS[0]:
        return "A"
    if pct >= LETTER_STEPS[1]:
        return "B"
    if pct >= LETTER_STEPS[2]:
        return "C"
    if pct >= LETTER_STEPS[3]:
        return "D"
    return "F"


def _iter_src_files(suffixes: tuple[str, ...]) -> list[Path]:
    return slop_scan._iter_files(FE_SRC, suffixes)  # noqa: SLF001 — نفس عائلة السكربتات


def collect(repo_root: str | Path | None = None, slop_result: dict | None = None) -> dict[str, object]:
    """قياس خام كامل — نقاء القياس منفصل عن الدرجة (يعاد استخدامه بلا كتابة)."""
    root = Path(repo_root) if repo_root else REPO_ROOT
    ui = slop_result or {}
    if "ui" not in ui:
        ui = {"ui": slop_scan.scan_ui_rules(root)}
    ui_rules = dict(ui["ui"])

    dashboard_pages: list[str] = []
    pageheader_pages: list[str] = []
    raw_fields: list[str] = []
    to_white = 0
    bg_white = 0
    countup_pages: list[str] = []
    raw_kpi_pages: list[str] = []
    target_files: list[str] = []

    for path in _iter_src_files((".tsx", ".ts", ".css")):
        rel = path.relative_to(root).as_posix()
        target_files.append(rel)
        text = slop_scan._read(path)  # noqa: SLF001 — نفس عائلة السكربتات
        if text is None:
            continue
        rel_src = rel[len("fb_dashboard/frontend/src/"):]
        is_dashboard_page = bool(PAGE_TS_RE.search(rel)) and "/app/dashboard/" in rel
        if is_dashboard_page:
            dashboard_pages.append(rel_src)
            if PAGEHEADER_RE.search(text):
                pageheader_pages.append(rel_src)
            if COUNTUP_RE.search(text) or KPICARD_RE.search(text):
                countup_pages.append(rel_src)
            elif KPI_DISPLAY_RE.search(text):
                raw_kpi_pages.append(rel_src)
        if path.suffix in {".ts", ".tsx"}:
            for m in INPUT_TAG_RE.finditer(text):
                if SMALL_TEXT_RE.search(text[m.start(): m.start() + FIELD_WINDOW]):
                    raw_fields.append(f"{rel_src}:{text.count(chr(10), 0, m.start()) + 1}")
            to_white += len(TO_WHITE_RE.findall(text))
            bg_white += len(BG_WHITE_RE.findall(text))

    unified = len(countup_pages)
    raw_kpi = len(raw_kpi_pages)
    return {
        "ts_date": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "metrics": {
            "dashboard_pages": len(dashboard_pages),
            "pageheader_pages": len(pageheader_pages),
            "pageheader_list": pageheader_pages,
            "raw_small_text_fields": len(raw_fields),
            "raw_field_samples": raw_fields[:10],
            "to_white": to_white,
            "bg_white": bg_white,
            "countup_unified_pages": unified,
            "raw_kpi_pages": raw_kpi,
            "raw_kpi_list": raw_kpi_pages,
            "countup_ratio_pct": round(100.0 * unified / (unified + raw_kpi), 1) if (unified + raw_kpi) else None,
        },
        "ui": ui_rules,
        "target_set": hashlib.sha256(
            "\n".join(sorted(target_files)).encode("utf-8")
        ).hexdigest(),
    }


def grade(record: dict) -> dict[str, object]:
    """درجات الفئات + المركب — دوال نقية قابلة للاختبار (round_metrics يستوردها)."""
    m = dict(record["metrics"])
    ui = dict(record["ui"])
    structure = 100.0 * m["pageheader_pages"] / max(1, m["dashboard_pages"])
    fields = max(0.0, 100.0 - 4.0 * m["raw_small_text_fields"])
    color = max(0.0, 100.0 - 10.0 * (m["to_white"] + m["bg_white"]))
    motion = m["countup_ratio_pct"] if m["countup_ratio_pct"] is not None else 0.0
    ai_slop = max(0.0, 100.0 - ui["ui_slop_total"])
    pcts = {
        "structure": round(structure, 1),
        "fields": round(fields, 1),
        "color": round(color, 1),
        "motion": round(float(motion), 1),
        "ai_slop": round(ai_slop, 1),
    }
    composite = sum(pcts[k] * w for k, w in WEIGHTS.items())
    return {
        "categoryPcts": pcts,
        "categoryGrades": {k: _letter(v) for k, v in pcts.items()},
        "weights": WEIGHTS,
        "designScorePct": round(composite, 1),
        "designScore": _letter(composite),
        "aiSlopScore": _letter(ai_slop),
    }


def _delta_line(prev: dict, cur_g: dict) -> str:
    parts = []
    for cat, letter in cur_g["categoryGrades"].items():
        prev_letter = prev.get("categoryGrades", {}).get(cat)
        if prev_letter is None:
            continue
        mark = "=" if prev_letter == letter else f"{prev_letter}→{letter}"
        parts.append(f"{cat} {mark}")
    p_ds, c_ds = prev.get("designScore"), cur_g["designScore"]
    parts.append(f"designScore {p_ds}→{c_ds}" if p_ds else "designScore (first)")
    p_ai, c_ai = prev.get("aiSlopScore"), cur_g["aiSlopScore"]
    parts.append(f"aiSlop {p_ai}→{c_ai}" if p_ai else "aiSlop (first)")
    return " · ".join(parts)


def _write_atomic(out: Path, payload: dict) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, out)


def main() -> int:
    ap = argparse.ArgumentParser(
        description="design baseline (diagnostic — seeds a regression baseline, never gates)"
    )
    ap.add_argument("--root", default=str(REPO_ROOT), help="repo root")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="baseline JSON path")
    ap.add_argument("--force", action="store_true", help="re-seed the baseline (round close)")
    ap.add_argument("--dry-run", action="store_true", help="measure + print only (never write)")
    args = ap.parse_args()

    out = Path(args.out)
    record = collect(args.root)
    g = grade(record)
    m = dict(record["metrics"])
    ui = dict(record["ui"])
    prev: dict | None = None
    if out.is_file():
        try:
            prev = json.loads(out.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            prev = None

    print("design-baseline (v17-S5 · D11-G2) — DIAGNOSTIC: seeds a baseline, never gates")
    print(
        "  categories: "
        + " · ".join(f"{k} {g['categoryPcts'][k]} {g['categoryGrades'][k]}" for k in WEIGHTS)
    )
    print(
        f"  designScore: {g['designScore']} ({g['designScorePct']}/100)"
        f" · aiSlopScore: {g['aiSlopScore']} ({g['categoryPcts']['ai_slop']}/100 →"
        f" {ui['ui_slop_total']} D-findings)"
    )
    ratio_txt = f"{m['countup_ratio_pct']:.0f}%" if m["countup_ratio_pct"] is not None else "n/a"
    print(
        f"  metrics: PageHeader {m['pageheader_pages']}/{m['dashboard_pages']} dashboard pages"
        f" · raw small-text fields {m['raw_small_text_fields']}"
        f" · to-white/bg-white {m['to_white']}/{m['bg_white']}"
        f" · useCountUp {m['countup_unified_pages']}"
        f" unified vs {m['raw_kpi_pages']} raw KPI pages ({ratio_txt})"
    )

    if args.dry_run:
        print(f"  dry-run: nothing written (baseline: {out})")
        return 0
    if prev is None or args.force:
        payload = {
            "schemaVersion": 2,
            "date": datetime.now(UTC).strftime("%Y-%m-%d"),
            "runId": record["ts_date"],
            "mode": "source",
            "designScore": g["designScore"],
            "aiSlopScore": g["aiSlopScore"],
            "designScorePct": g["designScorePct"],
            "categoryGrades": g["categoryGrades"],
            "categoryPcts": g["categoryPcts"],
            "weights": g["weights"],
            "metrics": m,
            "detector": {
                "mode": "source",
                "engine": "slop_scan.py §D v1 (v17-S5)",
                "targetSet": record["target_set"],
                "total": ui["ui_slop_total"],
                "byRule": {k: ui[k] for k, _ in slop_scan.UI_RULE_LABELS},
            },
        }
        if prev is not None:
            payload["previous"] = {
                "runId": prev.get("runId"),
                "designScore": prev.get("designScore"),
                "aiSlopScore": prev.get("aiSlopScore"),
                "designScorePct": prev.get("designScorePct"),
            }
        _write_atomic(out, payload)
        action = "RE-SEEDED (--force — round-close snapshot)" if args.force else "SEEDED (first baseline)"
        print(f"  baseline: {action} → {out}")
    else:
        same_set = prev.get("detector", {}).get("targetSet") == record["target_set"]
        print(f"  baseline: HELD (ratchet) — {out} {prev.get('designScore')} seeded {prev.get('date')}")
        print(f"  delta vs baseline: {_delta_line(prev, g)}")
        if not same_set:
            print("  note: detector targetSet changed (files added/removed) — counts advisory, not comparable")
    return 0


if __name__ == "__main__":
    sys.exit(main())
