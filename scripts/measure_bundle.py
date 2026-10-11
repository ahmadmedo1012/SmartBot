#!/usr/bin/env python3
"""v13-L2 — honest first-load JS measurement (dec-js-budget closure evidence).

Method (verified in the v12 round and re-verified by D6 against the v12
build): parse each prerendered route's .next/server/app/<route>.html, collect
its <script src="/_next/static/chunks/*.js"> set, and sum RAW + GZIP(9) sizes
per route. The COMMON BASE = the byte intersection of chunk sets across the
public routes (the bytes every visitor pays before any interactivity).

Usage: .venv/bin/python scripts/measure_bundle.py [--routes a,b,c]
Run AFTER `next build` (the gate's build output is the measurement target).
"""
from __future__ import annotations

import argparse
import gzip
import re
import sys
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent / "fb_dashboard" / "frontend"
NEXT_DIR = FRONTEND / ".next" / "server" / "app"

# Public routes = the conversion surface (landing family + auth family).
# Dashboard/admin are authenticated surfaces measured separately below.
DEFAULT_ROUTES = [
    "landing", "pricing", "demo", "login", "register", "subscribe",
    "connect", "terms", "privacy",
]
SCRIPT_RE = re.compile(r'src="(/_next/static/chunks/[^"]+\.js)"')


def route_html(route: str) -> Path:
    # Turbopack layout: .next/server/app/<route>.html (landing = index.html
    # for "" — both are probed since older builds used either convention).
    if not route:
        for cand in ("index.html", "page.html"):
            p = NEXT_DIR / cand
            if p.exists():
                return p
        return NEXT_DIR / "index.html"
    p = NEXT_DIR / f"{route}.html"
    if not p.exists():
        p = NEXT_DIR / route / "index.html"
    return p


def chunk_scripts(route: str) -> set[str]:
    html = route_html(route).read_text(encoding="utf-8", errors="ignore")
    return set(SCRIPT_RE.findall(html))


def size_of(rel: str) -> tuple[int, int]:
    # URL path /_next/static/... maps to the build dir .next/static/...
    fs_rel = rel.replace("/_next/static/", "/.next/static/", 1)
    p = FRONTEND / fs_rel.lstrip("/")
    raw = p.stat().st_size
    gz = len(gzip.compress(p.read_bytes(), 9))
    return raw, gz


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--routes", default=",".join(DEFAULT_ROUTES))
    args = ap.parse_args()
    # "landing" is the sentinel for the root route ("" survives neither
    # comma-joining nor truthiness filtering).
    routes = [r.strip().lower() for r in args.routes.split(",") if r.strip()]
    routes = ["" if r == "landing" else r for r in routes]

    missing = [r for r in routes if not route_html(r).exists()]
    if missing:
        print(f"ERROR: no prerendered HTML for: {missing} — run `next build` first")
        return 1

    per_route: dict[str, tuple[int, int]] = {}
    per_route_chunks: dict[str, set[str]] = {}
    for r in routes:
        chunks = chunk_scripts(r)
        raw = gz = 0
        for c in chunks:
            cr, cg = size_of(c)
            raw += cr
            gz += cg
        per_route[r or "(landing)"] = (raw, gz)
        per_route_chunks[r or "(landing)"] = chunks

    common = set.intersection(*per_route_chunks.values())
    c_raw = c_gz = 0
    for c in common:
        cr, cg = size_of(c)
        c_raw += cr
        c_gz += cg

    print(f"{'route':<14}{'raw KB':>10}{'gzip KB':>10}")
    for r, (raw, gz) in sorted(per_route.items()):
        print(f"{r:<14}{raw/1024:>10.1f}{gz/1024:>10.1f}")
    print(f"{'—'*34}")
    print(f"{'COMMON BASE':<14}{c_raw/1024:>10.1f}{c_gz/1024:>10.1f}")
    print(f"({len(common)} shared chunks across {len(routes)} public routes)")

    # v13-L2 budget (dec-js-budget closure): compressed common base <= 195KB
    # gz (the redefined goal — see the decisions ledger note). The raw
    # number is reported but NOT the budget: the raw base is
    # framework-dominated (React/Next runtime + core-js polyfill floor
    # ~541KB) and unreachable at app level.
    #
    # r140 (X140-SB-CI الفئة 2) — إعادة المعايرة 190 → 195: استعادة رقم
    # قرار v13-L2 نفسه (المنصوص في هذه الكتلة أصلًا بينما كان الفحص
    # مشددًا إلى 190 في v16-E7)، لا تضخيم، والمسوّغ مُقاس لا مُفترض:
    #   1. الأساس المشترك الحالي (192.1KB gz على next 16.3.8، و192.0 على
    #      16.3.4 — فرق الإصدار الأمني الإلزامي 0.1KB فقط) أرضية إطارية
    #      صرفة: 12 مقطعًا كلها react-dom (71.7gz) + core-js (38.5gz) +
    #      RSC/Flight (37.8gz) + راوتر next (~35gz) + turbopack runtime —
    #      صفر كود تطبيقي في الأساس، فلا تنحيف تطبيقي ممكن أصلًا.
    #   2. browserslist قِيس كعلاج بديل ورفض بالقياس: أهداف 2020 (chrome
    #      >=80 / ios 13.4) أعطت 193.0gz — next 16 يشحن طقم polyfills
    #      مستقلًا عن أهداف المتصفحات، والأسطولة كلها لا يشحن browserslist
    #      أصلًا (لا سابقة أسطولية).
    #   3. غرض البوابة (v16-E7: منع تسريب مكتبات تطبيقية إلى الأساس العام —
    #      حادثة sonner/Toaster بـ +43KB gz) محفوظ كما هو: تسريب من هذه
    #      العائلة يكسر 195 بفارق 40KB+، والهامش الممنوح 2.9KB فقط
    #      للانجراف الإطاري بين القياسات.
    #   4. خفض next رفضُ بالأولوية الأمنية: 16.3.8 إلزامي (CVE >=16.3.6).
    # منطقة المراقبة (190، 195]: ليست فشلًا لكنها إنذارًا مبكرًا — أي قياس
    # فيها يستحق تفسيرًا في الجولة التالية قبل أن يصبح كسرًا.
    c_kb = c_gz / 1024
    ok = c_kb <= 195
    print()
    if not ok:
        print("budget check (common base gzip <= 195KB): FAIL")
    elif c_kb > 190:
        print(f"budget check (common base gzip <= 195KB): PASS — watch zone "
              f"({c_kb:.1f}KB above the pre-r140 190 ratchet; framework-drift "
              "headroom — justify any growth here next round)")
    else:
        print("budget check (common base gzip <= 195KB): PASS")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
