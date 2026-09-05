from __future__ import annotations
"""
Phase F (= الخطة 6) — بوابة الخروج: تنظيف المحرك

Exit-gate evidence per PLAN-REBUILD-V2.md §6:
  6.1 المحركات الأربعة الميتة تحمل علامة DEPRECATED (بلا حذف — كما تشترط الخطة)
  6.2 event_bus يميّز tenant_id (نفّذ وأُثبت في المرحلة A — يعاد إثباته هنا)
  + لا مسارات API مكررة (نفس method+path مسجلة مرتين) — فخ "الأول يسجل يفوز"
    الذي أخفى دعم/إحصاءات حقيقية خلف stubs
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import asyncio
from collections import defaultdict


def test_dead_engines_marked_deprecated():
    """الخطة 6.1: flow/pdf_reports/commerce/sequence تحمل علامة DEPRECATED دون حذف."""
    base = os.path.dirname(__file__)
    for engine in ("flow_engine.py", "pdf_reports_engine.py",
                   "commerce_engine.py", "sequence_engine.py"):
        src = open(os.path.join(base, engine), encoding="utf-8").read()
        assert "DEPRECATED" in src, f"{engine} بلا علامة DEPRECATED"
        # لم تُحذف — الكود باقٍ (الخطة: "لا تحذف — المستقبل قد يحتاجها")
        assert len(src.splitlines()) > 20, f"{engine} يبدو محذوفاً/منهاراً"


def test_alive_engines_present():
    """المحركات الحية (الخطة 6.1 ALIVE) موجودة وسليمة."""
    base = os.path.dirname(__file__)
    for engine in ("bot.py", "analytics_engine.py", "broadcast_engine.py",
                   "subscriber_engine.py", "inbox_engine.py",
                   "offer_engine.py", "team_engine.py"):
        src = open(os.path.join(base, engine), encoding="utf-8").read()
        assert "class " in src, f"{engine} لا يحتوي صنفاً — مكسور؟"
        assert "DEPRECATED" not in src, f"{engine} حي — لا يصح وسمه مهجوراً"


def test_no_duplicate_api_routes():
    """لا تسجيل مزدوج لنفس (method, path) — وإلا فالمسار الأول يظلل الباقي صامتاً."""
    os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod")
    from runner import app

    seen: dict[tuple[str, str], str] = {}
    duplicates: dict[tuple[str, str], list[str]] = defaultdict(list)
    for route in app.routes:
        methods = getattr(route, "methods", None) or set()
        path = getattr(route, "path", None)
        if not path:
            continue
        for m in sorted(methods - {"HEAD", "OPTIONS"}):
            key = (m, path)
            endpoint = getattr(route, "endpoint", None)
            name = f"{endpoint.__module__}.{endpoint.__name__}" if endpoint else "?"
            if key in seen and seen[key] != name:
                duplicates[key].extend([seen[key], name])
            else:
                seen[key] = name
    assert not duplicates, f"مسارات مكررة (الأول يسجل يفوز!): {dict(duplicates)}"


async def test_event_bus_tenant_routing():
    """الخطة 6.2: event_bus يميّز المستأجر — إعادة إثبات (الأصل في المرحلة A)."""
    from event_bus import EventBus
    bus = EventBus()
    got = []
    def cb(d, tenant_id=None):
        got.append((d, tenant_id))
    bus.subscribe("reply", cb, tenant_id=7)
    await bus.emit("reply", {"x": 1}, tenant_id=9)   # مستأجر آخر → لا تسليم
    assert got == []
    await bus.emit("reply", {"x": 2}, tenant_id=7)   # المستأجر المعني → تسليم
    assert got and got[0][1] == 7
