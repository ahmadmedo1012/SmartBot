from __future__ import annotations

"""v23 — سلوك البوت: المنشن، الرسالة عند التعليق، رد الذكاء الاصطناعي.

Contract pins (the testable half of the v23 round):

  fb_client.check_token_scopes
    - توكن صفحة: me/permissions يفشل → debug_token هو المصدر الصادق
      (التحذير الكاذب v21 كان يفترض صلاحيتين ناقصتين دائماً).
    - كلا المسارين يفشل → الجواب المحافظ القديم كما هو.

  fb_client.send_private_reply
    - الصيغة المجربة حياً: POST {page}/messages بـ recipient={comment_id}
      (حافة private_replies القديمة تفشل بـ subcode 33).

  GET/PUT /api/bot/behavior
    - الافتراضيات: منشن مفعّل، DM معطّل، AI معطّل + حالة المزود.
    - PUT: يعتم + يرجع الحالة؛ مفاتيح مجهولة/أنواع خاطئة → 422.

  ReplyPipeline (سلوك المعلق):
    - منشن: يُرسل @[uid] كبادئة، والصف المخزن نظيف (بلا التوكن).
    - منشن معطّل → بلا بادئة.
    - DM عند التعليق (مفعّل) → الرسالة الخاصة تحمل نص الرد العام،
      و recipient_id يحل معرف المعلق فيُستخدم في المنشن ويلمّ الصف.
    - DM معطّل (الافتراضي) → لا رسالة خاصة.
    - رد AI عند غياب قاعدة مطابقة + AI مفعّل؛ وبوابة خطة has_ai
      توقفه بسجل مالي.

النمط: نفس v10_world/v10_seed (قاعدة معزولة + عميل حقيقي) للنقاط،
و ReplyPipeline مباشرة مع FB وهمي للمراحل.
"""
import os
import sys
import uuid
from types import SimpleNamespace

import pytest

_FB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))
if _FB_DIR not in sys.path:
    sys.path.insert(0, _FB_DIR)

pytestmark = pytest.mark.asyncio


# ─────────────────────────────────────────────────────────────────────────────
# Fakes
# ─────────────────────────────────────────────────────────────────────────────

class FakeFB:
    """Sufficient ReplyPipeline surface + call recorder."""

    def __init__(self, page_id="123", private_reply_result=None):
        self.page_id = page_id
        self._private_reply_result = private_reply_result
        self.replies: list[tuple[str, str]] = []
        self.private_replies: list[tuple[str, str]] = []
        self.dms: list[tuple[str, str]] = []

    async def reply_to_comment(self, comment_id, message):
        self.replies.append((comment_id, message))
        return {"id": f"rc_{len(self.replies)}"}

    async def send_private_reply(self, comment_id, message):
        self.private_replies.append((comment_id, message))
        # v23 live shape: {"recipient_id": ..., "message_id": ...}
        if self._private_reply_result is not None:
            return self._private_reply_result
        return {"recipient_id": "777000111", "message_id": "m_1"}

    async def send_dm(self, user_id, message, messaging_type="RESPONSE", tag=None):
        self.dms.append((user_id, message))
        return {"message_id": "m_2"}


class FakeDedup:
    def __init__(self):
        self._seen: set[str] = set()

    async def is_dup(self, cid: str) -> bool:
        return cid in self._seen

    async def mark(self, cid: str):
        self._seen.add(cid)


class FakeCooldown:
    def is_blocked(self, uid: str) -> bool:
        return False

    def adjust_window(self, uid: str, seconds: int):
        pass


class FakeMatcher:
    """Always returns the injected triple — rules/dm plumbing is out of scope."""

    def __init__(self, template=None, dm_template=None, rule_id=1):
        self._t, self._dm, self._rid = template, dm_template, rule_id

    def match(self, text, intent=None):
        return self._t, self._dm, self._rid


def _raw_comment(cid=None, text="شنو السعر؟", from_id="999888777", from_name="علي حسن"):
    return {
        "id": cid or f"c_{uuid.uuid4().hex[:8]}",
        "message": text,
        "from": {"id": from_id, "name": from_name} if from_id else {},
        "created_time": "2026-09-10T10:00:00+0000",
    }


# ─────────────────────────────────────────────────────────────────────────────
# check_token_scopes (fb_client)
# ─────────────────────────────────────────────────────────────────────────────

_FULL = ["pages_messaging", "pages_manage_metadata", "pages_read_engagement",
         "pages_read_user_content", "pages_manage_posts", "pages_manage_engagement"]


async def test_scopes_page_token_uses_debug_token_honestly():
    from fb_client import FBClient

    class _F(FBClient):
        def __init__(self):
            super().__init__("tok", "123")
            self.calls = []

        async def _get(self, path, params=None):
            self.calls.append(path)
            if path == "me/permissions":
                return None  # page token: 400 → None
            if path == "debug_token":
                return {"data": {"scopes": list(_FULL), "type": "PAGE"}}
            raise AssertionError(f"unexpected probe {path}")

    fb = _F()
    r = await fb.check_token_scopes()
    # v23: الجذر — التوكن يملك كل الصلاحيات فيجب ألا يظهر أي تحذير
    assert r["missing"] == [], r
    assert r.get("page_token") is True
    assert "pages_read_user_content" in r["scopes"]
    assert "debug_token" in fb.calls  # المصدر الصادق جرى استشارته فعلاً


async def test_scopes_page_token_partial_missing_reported():
    from fb_client import FBClient

    class _F(FBClient):
        def __init__(self):
            super().__init__("tok", "123")

        async def _get(self, path, params=None):
            if path == "me/permissions":
                return None
            if path == "debug_token":
                # ناقصة صلاحية قراءة محتوى المستخدم — يجب أن تُذكر وحدها
                return {"data": {"scopes": [s for s in _FULL
                                             if s != "pages_read_user_content"]}}
            return None

    r = await _F().check_token_scopes()
    assert r["missing"] == ["pages_read_user_content"], r


async def test_scopes_both_probes_fail_conservative_fallback():
    from fb_client import FBClient

    class _F(FBClient):
        def __init__(self):
            super().__init__("tok", "123")

        async def _get(self, path, params=None):
            if path == "me":
                return {"id": "123"}  # = page_id → page token
            return None

    r = await _F().check_token_scopes()
    # v21 doctrine unchanged as the last resort
    assert set(r["missing"]) == {"pages_read_engagement", "pages_read_user_content"}


async def test_scopes_user_token_permissions_path_still_wins():
    from fb_client import FBClient

    class _F(FBClient):
        def __init__(self):
            super().__init__("tok", "123")

        async def _get(self, path, params=None):
            if path == "me/permissions":
                return {"data": [{"permission": "pages_messaging", "status": "granted"}]}
            raise AssertionError(f"unexpected probe {path}")

    r = await _F().check_token_scopes()
    assert "pages_messaging" in r["scopes"]
    assert "pages_messaging" not in r["missing"]
    assert "pages_manage_metadata" in r["missing"]


# ─────────────────────────────────────────────────────────────────────────────
# send_private_reply (fb_client) — the live-proven shape
# ─────────────────────────────────────────────────────────────────────────────

async def test_send_private_reply_posts_messages_edge_with_comment_recipient():
    import json as _json

    from fb_client import FBClient

    posted = {}

    class _F(FBClient):
        def __init__(self):
            super().__init__("tok", "PAGE1")

        async def _post(self, path, data=None, max_retries=3):
            posted["path"] = path
            posted["data"] = dict(data or {})
            return {"recipient_id": "R1", "message_id": "m_9"}

    fb = _F()
    r = await fb.send_private_reply("C1", "مرحباً")
    assert posted["path"] == "PAGE1/messages"
    assert _json.loads(posted["data"]["recipient"]) == {"comment_id": "C1"}
    assert _json.loads(posted["data"]["message"]) == {"text": "مرحباً"}
    assert r == {"recipient_id": "R1", "message_id": "m_9"}


async def test_send_private_reply_failure_returns_none():
    from fb_client import FBClient

    class _F(FBClient):
        def __init__(self):
            super().__init__("tok", "PAGE1")

        async def _post(self, path, data=None, max_retries=3):
            return {"_error": True, "status": 400, "body": "(#100) subcode 33"}

    assert await _F().send_private_reply("C1", "مرحباً") is None
    assert await _F().send_private_reply("", "مرحباً") is None  # empty id guard


# ─────────────────────────────────────────────────────────────────────────────
# /api/bot/behavior (API, v10_world)
# ─────────────────────────────────────────────────────────────────────────────

async def test_behavior_defaults_and_ai_status(v10_seed):
    w = v10_seed.world
    uname, tid, _ = await v10_seed.tenant_user(role="admin")
    v10_seed.auth(uname, tid)
    r = await w.client.get("/api/bot/behavior")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    d = body["data"]
    assert d["mention_in_replies"] is True      # الافتراضي: مطلب المالك
    assert d["comment_dm_enabled"] is False     # ميزة تُفعَّل عمداً
    assert d["ai_auto_reply"] is False
    assert d["ai_tone"] == ""
    assert "ai_available" in d and "ai_provider" in d
    v10_seed.logout()


async def test_behavior_put_roundtrip(v10_seed):
    w = v10_seed.world
    uname, tid, _ = await v10_seed.tenant_user(role="admin")
    v10_seed.auth(uname, tid)
    r = await w.client.put("/api/bot/behavior", json={
        "comment_dm_enabled": True, "ai_auto_reply": True, "ai_tone": "ودية"})
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["comment_dm_enabled"] is True
    assert d["ai_auto_reply"] is True
    assert d["ai_tone"] == "ودية"
    # persistence: قراءة جديدة ترى نفس الحالة (سطر BotState حقيقي)
    r2 = await w.client.get("/api/bot/behavior")
    d2 = r2.json()["data"]
    assert d2["comment_dm_enabled"] is True and d2["ai_tone"] == "ودية"
    v10_seed.logout()


async def test_behavior_put_validation(v10_seed):
    w = v10_seed.world
    uname, tid, _ = await v10_seed.tenant_user(role="admin")
    v10_seed.auth(uname, tid)
    r = await w.client.put("/api/bot/behavior", json={"nope": True})
    assert r.status_code == 422
    r = await w.client.put("/api/bot/behavior", json={"mention_in_replies": "yes"})
    assert r.status_code == 422
    r = await w.client.put("/api/bot/behavior", json={"ai_tone": "ط" * 41})
    assert r.status_code == 422
    v10_seed.logout()


async def test_behavior_requires_auth(v10_seed):
    w = v10_seed.world
    r = await w.client.get("/api/bot/behavior")
    assert r.status_code in (401, 403)


# ─────────────────────────────────────────────────────────────────────────────
# ReplyPipeline — mention / DM / AI fallback (direct, fakes)
# ─────────────────────────────────────────────────────────────────────────────

async def _mk_pipeline(world, tid, fb, plan_limits=None):
    from bot_engine.pipeline import ReplyPipeline
    return ReplyPipeline(fb, FakeDedup(), FakeCooldown(),
                         tenant_id=tid, plan_limits=plan_limits)


async def _seed_behavior(world, tid, **kv):
    from models import BotState
    async with world.sf() as db:
        for k, v in kv.items():
            row = (await db.execute(
                __import__("sqlalchemy").select(BotState).where(
                    BotState.tenant_id == tid, BotState.key == k)
            )).scalar_one_or_none()
            if row:
                row.value = v
            else:
                db.add(BotState(tenant_id=tid, key=k, value=v))
        await db.commit()


async def test_mention_prefix_sent_and_stored_clean(v10_seed):
    w = v10_seed.world
    _, tid, _ = await v10_seed.tenant_user(role="admin")
    fb = FakeFB(page_id="PAGE1")
    pipe = await _mk_pipeline(w, tid, fb)
    matcher = FakeMatcher(template="السعر 50 د.ل", rule_id=7)
    async with w.sf() as session:
        ok = await pipe.process(session, _raw_comment(from_id="999"), "p1", matcher)
    assert ok is True
    cid, sent = fb.replies[0]
    # v23: المنشن يسافر مع النص المُرسل — إشعار حقيقي للمعلق
    assert sent == "@[999] السعر 50 د.ل"
    # والصف المخزن نظيف لعرضه للمالك
    from models import Reply
    from sqlalchemy import select
    async with w.sf() as db:
        row = (await db.execute(select(Reply).where(
            Reply.tenant_id == tid, Reply.fb_comment_id == cid))).scalar_one()
    assert row.reply_text == "السعر 50 د.ل"


async def test_mention_disabled_no_prefix(v10_seed):
    w = v10_seed.world
    _, tid, _ = await v10_seed.tenant_user(role="admin")
    await _seed_behavior(w, tid, mention_in_replies="0")
    fb = FakeFB(page_id="PAGE1")
    pipe = await _mk_pipeline(w, tid, fb)
    async with w.sf() as session:
        await pipe.process(session, _raw_comment(from_id="999"), "p1",
                           FakeMatcher(template="رد", rule_id=7))
    assert fb.replies[0][1] == "رد"  # لا بادئة منشن


async def test_page_self_comment_never_replied_never_mentioned(v10_seed):
    """Stage 1 (skip own page) أصلاً: تعليق الصفحة على نفسها لا يُرد عليه —
    وبالتالي لا منشن لذات الصفحة إطلاقاً (حماية حلقة ذاتية)."""
    w = v10_seed.world
    _, tid, _ = await v10_seed.tenant_user(role="admin")
    fb = FakeFB(page_id="PAGE1")
    pipe = await _mk_pipeline(w, tid, fb)
    async with w.sf() as session:
        ok = await pipe.process(session, _raw_comment(from_id="PAGE1"), "p1",
                                FakeMatcher(template="رد", rule_id=7))
    assert ok is False
    assert fb.replies == [] and fb.private_replies == []


async def test_dm_on_comment_resolves_commenter_and_mention(v10_seed):
    """المسار الكامل: تعليق بلا معرف معلق (استطلاع) + DM مفعّل →
    الرسالة الخاصة تحمل الرد، و recipient_id يحل المعرف فيُمنشن به."""
    w = v10_seed.world
    _, tid, _ = await v10_seed.tenant_user(role="admin")
    await _seed_behavior(w, tid, comment_dm_enabled="1")
    fb = FakeFB(page_id="PAGE1")  # send_private_reply → recipient_id 777000111
    pipe = await _mk_pipeline(w, tid, fb)
    raw = _raw_comment(from_id="", from_name="")
    async with w.sf() as session:
        ok = await pipe.process(session, raw, "p1",
                                FakeMatcher(template="رد عام", rule_id=7))
    assert ok is True
    # 1) الرسالة الخاصة أُرسلت بنص الرد العام (لا dm_template للقاعدة)
    assert len(fb.private_replies) == 1
    assert fb.private_replies[0][1] == "رد عام"
    # 2) المنشن استخدم المعرف المُستأنث من recipient_id
    assert fb.replies[0][1] == "@[777000111] رد عام"
    # 3) صف التعليق التحق بمعرف المعلق (الصديق صديقنا → معرف حقيقي)
    from models import Comment as _C
    from sqlalchemy import select as _sel
    async with w.sf() as db:
        crow = (await db.execute(_sel(_C).where(
            _C.tenant_id == tid, _C.fb_comment_id == raw["id"]))).scalar_one()
    assert crow.commenter_id == "777000111"


async def test_dm_default_off_no_private_reply(v10_seed):
    w = v10_seed.world
    _, tid, _ = await v10_seed.tenant_user(role="admin")
    fb = FakeFB(page_id="PAGE1")
    pipe = await _mk_pipeline(w, tid, fb)
    async with w.sf() as session:
        await pipe.process(session, _raw_comment(from_id="999"), "p1",
                           FakeMatcher(template="رد", rule_id=7))
    assert fb.private_replies == []  # الافتراضي: الميزة معطّلة


async def test_dm_plan_gate_blocks_and_logs(v10_seed):
    from models import BotLog
    from sqlalchemy import select as _sel
    w = v10_seed.world
    _, tid, _ = await v10_seed.tenant_user(role="admin")
    await _seed_behavior(w, tid, comment_dm_enabled="1")
    fb = FakeFB(page_id="PAGE1")
    pipe = await _mk_pipeline(w, tid, fb, plan_limits={"has_dm": False,
                                                       "max_replies": None})
    async with w.sf() as session:
        await pipe.process(session, _raw_comment(from_id="999"), "p1",
                           FakeMatcher(template="رد", rule_id=7))
    assert fb.private_replies == []  # البوابة أوقفت الرسالة الخاصة
    assert fb.replies, "الرد العام لم يتأثر بالبوابة"  # الرد العام يستمر
    # money_gate_log يكتب رسالة عربية — نتحقق من وجود تحذير has_dm
    async with w.sf() as db:
        warns = (await db.execute(_sel(BotLog).where(
            BotLog.tenant_id == tid, BotLog.level == "WARN"))).scalars().all()
    assert any("الرد الخاص" in (x.message or "") for x in warns)


async def test_ai_fallback_answers_when_no_rule(v10_seed, monkeypatch):
    w = v10_seed.world
    _, tid, _ = await v10_seed.tenant_user(role="admin")
    await _seed_behavior(w, tid, ai_auto_reply="1", ai_tone="ودية")

    fake_ai = SimpleNamespace(available=True, provider_name="openai")
    calls = {}

    async def _gen(text, name, tone="", keywords=None):
        calls.update(text=text, name=name, tone=tone)
        return "رد مولّد بالذكاء الاصطناعي 👌"

    fake_ai.generate_reply = _gen
    import _services as _svc
    monkeypatch.setattr(_svc, "get_ai", lambda: fake_ai, raising=False)
    monkeypatch.setattr(_svc, "refresh_ai_from_db", _async_noop, raising=False)

    fb = FakeFB(page_id="PAGE1")
    pipe = await _mk_pipeline(w, tid, fb)
    async with w.sf() as session:
        ok = await pipe.process(session, _raw_comment(), "p1",
                                FakeMatcher(template=None, rule_id=None))
    assert ok is True
    # الرد المولّد أُرسل (مع منشن افتراضي) وصلت النبرة للمزوّد
    assert fb.replies[0][1].endswith("رد مولّد بالذكاء الاصطناعي 👌")
    assert calls["tone"] == "ودية" and calls["name"] == "علي"
    # Reply.row: rule_id=None + النص النظيف
    from models import Reply
    from sqlalchemy import select as _sel
    async with w.sf() as db:
        row = (await db.execute(_sel(Reply).where(
            Reply.tenant_id == tid,
            Reply.fb_comment_id == fb.replies[0][0]))).scalar_one()
    assert row.rule_id is None
    assert row.reply_text == "رد مولّد بالذكاء الاصطناعي 👌"


async def test_ai_fallback_off_stays_silent(v10_seed, monkeypatch):
    w = v10_seed.world
    _, tid, _ = await v10_seed.tenant_user(role="admin")  # الافتراضي: معطّل
    import _services as _svc
    monkeypatch.setattr(_svc, "get_ai", lambda: SimpleNamespace(
        available=True, provider_name="openai",
        generate_reply=_fail_gen), raising=False)
    fb = FakeFB(page_id="PAGE1")
    pipe = await _mk_pipeline(w, tid, fb)
    async with w.sf() as session:
        ok = await pipe.process(session, _raw_comment(), "p1",
                                FakeMatcher(template=None, rule_id=None))
    assert ok is False
    assert fb.replies == []


async def test_ai_fallback_unavailable_provider_silent(v10_seed, monkeypatch):
    w = v10_seed.world
    _, tid, _ = await v10_seed.tenant_user(role="admin")
    await _seed_behavior(w, tid, ai_auto_reply="1")
    import _services as _svc
    monkeypatch.setattr(_svc, "get_ai", lambda: SimpleNamespace(
        available=False, provider_name="none"), raising=False)
    fb = FakeFB(page_id="PAGE1")
    pipe = await _mk_pipeline(w, tid, fb)
    async with w.sf() as session:
        ok = await pipe.process(session, _raw_comment(), "p1",
                                FakeMatcher(template=None, rule_id=None))
    assert ok is False
    assert fb.replies == []


async def test_ai_fallback_plan_gate(v10_seed, monkeypatch):
    w = v10_seed.world
    _, tid, _ = await v10_seed.tenant_user(role="admin")
    await _seed_behavior(w, tid, ai_auto_reply="1")
    import _services as _svc
    monkeypatch.setattr(_svc, "get_ai", lambda: SimpleNamespace(
        available=True, provider_name="openai",
        generate_reply=_fail_gen), raising=False)
    fb = FakeFB(page_id="PAGE1")
    pipe = await _mk_pipeline(w, tid, fb,
                              plan_limits={"has_ai": False, "max_replies": None})
    async with w.sf() as session:
        ok = await pipe.process(session, _raw_comment(), "p1",
                                FakeMatcher(template=None, rule_id=None))
    assert ok is False
    assert fb.replies == []
    from models import BotLog
    from sqlalchemy import select as _sel
    async with w.sf() as db:
        warns = (await db.execute(_sel(BotLog).where(
            BotLog.tenant_id == tid, BotLog.level == "WARN"))).scalars().all()
    assert any("الذكاء الاصطناعي" in (x.message or "") for x in warns)


async def _fail_gen(*a, **k):  # pragma: no cover — must never be called
    raise AssertionError("AI must not be consulted when gated/disabled")


async def _async_noop():
    return None
