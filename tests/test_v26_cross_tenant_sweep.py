"""v26 — التدقيق العدائي عبر المستأجرين (API-level IDOR sweep).

الفلسفة: User A (tenant A) يحاول الوصول لكل مورد أنشأه User B (tenant B)
عبر مسارات الـID المُتحقق بها مباشرة (GET/PUT/POST/DELETE). كل محاولة
يجب أن تُرفض (404/403) — أي 200 مع بيانات = تسريب عبر المستأجرين (P0).

يغطي: broadcasts · calendar · crm customers · messages (conversations) ·
inbox conversations/tags · offers · comments/replies · rules ·
scheduled-posts · sequences + steps + subscribe · subscribers · tags ·
templates · flows · report schedules · alerts.
"""
from __future__ import annotations

import uuid

import pytest

from tests.conftest import V10_TEST_PASSWORD

# ══════════════════════════════════════════════════════════════════
# عالم HTTP معزول (نفس وصفة v25)
# ══════════════════════════════════════════════════════════════════

async def _make_world():
    """عالم HTTP على محرك التطبيق نفسه (نمط v22) — بلا استبدال get_db
    لأن بعض المسارات تستخدم AsyncSessionLocal مباشرة (inbox.py) ولا
    يصلها الاستبدال؛ وحدة قاعدة واحدة تضمن اتساق البذور والطلبات."""
    import _rate_limit as _rl

    async def _allow(db, key, max_attempts=10, window_seconds=60):
        return True

    mp = pytest.MonkeyPatch()
    mp.setattr(_rl, "check_rate_limit", _allow)
    from database import AsyncSessionLocal
    from database import engine as app_engine
    from models import Base
    from runner import app

    async with app_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    from httpx import ASGITransport, AsyncClient
    client = AsyncClient(transport=ASGITransport(app=app), base_url="http://t")
    return app, AsyncSessionLocal, client, app_engine, mp


@pytest.fixture
async def world():
    app, sf, client, engine, mp = await _make_world()
    try:
        yield type("W", (), {"app": app, "sf": sf, "client": client,
                             "engine": engine})()
    finally:
        mp.undo()
        await client.aclose()


async def _login(client, username: str) -> str:
    r = await client.post("/api/login", json={"username": username,
                                              "password": V10_TEST_PASSWORD})
    assert r.status_code == 200, f"login {username}: {r.status_code} {r.text[:200]}"
    return r.cookies["token"]


def _h(token: str) -> dict:
    # CSRF double-submit: tests bypass via cookies header token pair
    return {"Cookie": f"token={token}", "X-CSRF-Token": "x", "X-CSRF-Cookie": "token"}


async def _seed_two_tenants(sf):
    """مستأجران A/B، لكلٍ مالك admin + توكن جاهز عبر /api/login."""
    from _hash import hash_password
    from models import Tenant, User

    tag = uuid.uuid4().hex[:6]
    ids = {}
    async with sf() as db:
        for label in ("a", "b"):
            t = Tenant(name=f"T-{label}-{tag}", subscription_status="PAID",
                       is_active=True)
            db.add(t)
            await db.flush()
            u = User(username=f"own_{label}_{tag}",
                     email=f"own_{label}_{tag}@v26.ly",
                     password_hash=hash_password(V10_TEST_PASSWORD),
                     tenant_id=t.id, role="admin")
            db.add(u)
            ids[label] = {"tenant": t.id, "user": u.id,
                          "username": u.username}
        await db.commit()
    return ids, tag


# ══════════════════════════════════════════════════════════════════
# أداة التحقق المركزية — لا تسريب عبر المستأجرين
# ══════════════════════════════════════════════════════════════════

async def _assert_blocked(client, token_b: str, method: str, path: str,
                           *, json_body=None, data=None,
                           ctx: str = "") -> None:
    """طلب بمستخدم B على مورد مستأجر A — يجب 404/403، ممنوع 200."""
    headers = _h(token_b)
    kwargs = {"headers": headers}
    if json_body is not None:
        kwargs["json"] = json_body
    if data is not None:
        kwargs["data"] = data
    r = await client.request(method, path, **kwargs)
    # التسريب الحقيقي = نجاح يعلن ok:true (كتابة/قراءة عبر المستأجرين).
    # أي 4xx = رفض. 200 مع ok:false (عقد sequence soft-reject بعد إصلاح
    # B-01) = رفض داخلي بلا كتابة — مقبول بشرط ألا يعلن نجاحًا.
    if r.status_code == 200:
        body = r.json()
        soft_rejected = (body.get("success") is True
                         and isinstance(body.get("data"), dict)
                         and body["data"].get("ok") is False)
        assert soft_rejected, (
            f"IDOR LEAK [{ctx}] {method} {path} → 200 with real data: "
            f"{r.text[:300]}")
        return
    assert r.status_code >= 400, (
        f"IDOR LEAK [{ctx}] {method} {path} → {r.status_code} "
        f"(expected rejection 4xx): {r.text[:300]}")
    assert r.status_code < 500, (
        f"UNHANDLED-500 [{ctx}] {method} {path} → {r.status_code}: "
        f"{r.text[:300]}")


# ══════════════════════════════════════════════════════════════════
# البذور — مورد لكل نوع تحت إدارة مستأجر A
# ══════════════════════════════════════════════════════════════════

async def _seed_resources(sf, ids, tag):
    """ينشئ موردًا واحدًا من كل نوع يعود لمستأجر A. يرجع قاموس المسارات."""
    from datetime import UTC, datetime, timedelta

    from models import (
        Broadcast,
        Comment,
        Conversation,
        Customer,
        Flow,
        Offer,
        Post,
        ReplyTemplate,
        ReportSchedule,
        Rule,
        ScheduledPost,
        Sequence,
        SequenceStep,
        Subscriber,
        SupportTicket,
        Tag,
    )
    R = {}
    now = datetime.now(UTC)
    async with sf() as db:
        ta = ids["a"]["tenant"]

        bc = Broadcast(tenant_id=ta, name=f"bc-{tag}",
                       message_template="hi", status="draft")
        db.add(bc)
        await db.flush()
        R["broadcast"] = bc.id

        cal = ScheduledPost(tenant_id=ta, message=f"cal-{tag}",
                            scheduled_at=now + timedelta(days=1),
                            status="draft")
        db.add(cal)
        await db.flush()
        R["calendar"] = cal.id

        cust = Customer(tenant_id=ta, fb_user_id=f"cu-{tag}",
                        name=f"c-{tag}", email=f"c-{tag}@x.ly")
        db.add(cust)
        await db.flush()
        R["customer"] = cust.id

        off = Offer(tenant_id=ta, title=f"o-{tag}", description="offer",
                    is_active=True)
        db.add(off)
        await db.flush()
        R["offer"] = off.id

        rule = Rule(tenant_id=ta, name=f"r-{tag}", keywords=[f"kw-{tag}"],
                    reply_template="ok", enabled=True)
        db.add(rule)
        await db.flush()
        R["rule"] = rule.id

        sp = ScheduledPost(tenant_id=ta, message=f"sp-{tag}",
                           scheduled_at=now + timedelta(days=1),
                           status="pending")
        db.add(sp)
        await db.flush()
        R["scheduled"] = sp.id

        seq = Sequence(tenant_id=ta, name=f"s-{tag}", status="active")
        db.add(seq)
        await db.flush()
        step = SequenceStep(sequence_id=seq.id, step_order=1,
                            message_template="step1", delay_days=1)
        db.add(step)
        await db.flush()
        R["sequence"] = seq.id
        R["sequence_step"] = step.id

        sub = Subscriber(tenant_id=ta, fb_user_id=f"fb-{tag}",
                         name="A-sub")
        db.add(sub)
        await db.flush()
        R["subscriber"] = sub.id

        tag_ = Tag(tenant_id=ta, name=f"tg-{tag}")
        db.add(tag_)
        await db.flush()
        R["tag"] = tag_.id

        tmpl = ReplyTemplate(tenant_id=ta, name=f"tm-{tag}",
                             text="template body")
        db.add(tmpl)
        await db.flush()
        R["template"] = tmpl.id

        flow = Flow(tenant_id=ta, name=f"f-{tag}", status="active")
        db.add(flow)
        await db.flush()
        R["flow"] = flow.id

        conv = Conversation(tenant_id=ta, fb_conversation_id=f"conv-{tag}",
                            fb_user_id=f"fb-{tag}", user_name="A-conv")
        db.add(conv)
        await db.flush()
        R["conversation"] = conv.id

        post = Post(tenant_id=ta, fb_post_id=f"p-{tag}", message="post")
        db.add(post)
        await db.flush()
        R["post"] = post.fb_post_id

        com = Comment(tenant_id=ta, fb_comment_id=f"cm-{tag}",
                      fb_post_id=post.fb_post_id, commenter_id=f"fb-{tag}",
                      comment_text="hello")
        db.add(com)
        await db.flush()
        R["comment"] = com.fb_comment_id

        rs = ReportSchedule(tenant_id=ta, report_type="weekly")
        db.add(rs)
        await db.flush()
        R["report_schedule"] = rs.id

        tk = SupportTicket(tenant_id=ta, subject=f"tk-{tag}",
                           body="help", user_id=ids["a"]["user"])
        db.add(tk)
        await db.flush()
        R["ticket"] = tk.id

        await db.commit()
    return R


# ══════════════════════════════════════════════════════════════════
# الاجتياح العدائي
# ══════════════════════════════════════════════════════════════════

async def test_cross_tenant_sweep_all_id_routes(world):
    """B يضرب كل مسارات ID لموارد A — كلها يجب أن تُرفض."""
    sf, client = world.sf, world.client
    ids, tag = await _seed_two_tenants(sf)
    R = await _seed_resources(sf, ids, tag)
    token_b = await _login(client, ids["b"]["username"])

    async def blocked(method, path, ctx, json_body=None, data=None):
        await _assert_blocked(client, token_b, method, path,
                              json_body=json_body, data=data, ctx=ctx)

    # — القوائم والتفاصيل —
    await blocked("GET", f"/api/broadcasts/{R['broadcast']}", "broadcast GET")
    await blocked("PUT", f"/api/broadcasts/{R['broadcast']}",
                  "broadcast PUT", json_body={"name": "hacked",
                                              "message_template": "x"})
    await blocked("POST", f"/api/broadcasts/{R['broadcast']}/send",
                  "broadcast SEND")
    await blocked("POST", f"/api/broadcasts/{R['broadcast']}/cancel",
                  "broadcast CANCEL")

    await blocked("PUT", f"/api/calendar/{R['calendar']}", "calendar PUT",
                  json_body={"title": "hacked", "content": "x"})
    await blocked("DELETE", f"/api/calendar/{R['calendar']}",
                  "calendar DELETE")
    await blocked("POST", f"/api/calendar/{R['calendar']}/publish",
                  "calendar PUBLISH")

    await blocked("PUT", f"/api/crm/customers/{R['customer']}",
                  "crm PUT", json_body={"name": "hacked"})

    await blocked("GET", f"/api/messages/{R['conversation']}",
                  "messages GET")
    await blocked("POST", f"/api/messages/{R['conversation']}",
                  "messages SEND", json_body={"message": "leak"})

    await blocked("GET", f"/api/inbox/conversations/{R['conversation']}",
                  "inbox GET")
    await blocked("POST", f"/api/inbox/conversations/{R['conversation']}/read",
                  "inbox READ")
    await blocked("POST", f"/api/inbox/conversations/{R['conversation']}/tags",
                  "inbox TAG", json_body={"tag_id": R["tag"]})
    await blocked("DELETE", f"/api/inbox/conversations/{R['conversation']}",
                  "inbox DELETE")

    await blocked("POST", f"/api/offers/{R['offer']}/deliver",
                  "offer DELIVER")
    await blocked("DELETE", f"/api/offers/{R['offer']}", "offer DELETE")

    await blocked("POST", f"/api/comments/{R['comment']}/hide",
                  "comment HIDE")
    await blocked("DELETE", f"/api/comments/{R['comment']}",
                  "comment DELETE")
    await blocked("POST", f"/api/replies/{R['comment']}/reply",
                  "comment REPLY", data={"message": "hi"})

    await blocked("PUT", f"/api/rules/{R['rule']}", "rule PUT",
                  json_body={"name": "hacked", "reply_text": "x"})
    await blocked("DELETE", f"/api/rules/{R['rule']}", "rule DELETE")
    await blocked("POST", f"/api/rules/{R['rule']}/toggle", "rule TOGGLE")

    await blocked("POST", f"/api/scheduled-posts/{R['scheduled']}/cancel",
                  "scheduled CANCEL")
    await blocked("DELETE", f"/api/scheduled-posts/{R['scheduled']}",
                  "scheduled DELETE")

    await blocked("GET", f"/api/sequences/{R['sequence']}", "seq GET")
    await blocked("PUT", f"/api/sequences/{R['sequence']}", "seq PUT",
                  json_body={"name": "hacked"})
    await blocked("DELETE", f"/api/sequences/{R['sequence']}",
                  "seq DELETE")
    await blocked("POST", f"/api/sequences/{R['sequence']}/pause",
                  "seq PAUSE")
    await blocked("PUT", f"/api/sequences/steps/{R['sequence_step']}",
                  "seq step PUT", json_body={"content": "hacked"})
    await blocked("DELETE", f"/api/sequences/steps/{R['sequence_step']}",
                  "seq step DELETE")
    await blocked("POST",
                  f"/api/sequences/{R['sequence']}/subscribe/{R['subscriber']}",
                  "seq SUBSCRIBE")
    await blocked("POST",
                  f"/api/sequences/{R['sequence']}/unsubscribe/{R['subscriber']}",
                  "seq UNSUBSCRIBE")

    await blocked("GET", f"/api/subscribers/{R['subscriber']}",
                  "subscriber GET")
    await blocked("POST", f"/api/subscribers/{R['subscriber']}/tags",
                  "subscriber TAG", json_body={"tag_id": R["tag"]})
    await blocked("DELETE",
                  f"/api/subscribers/{R['subscriber']}/tags/{R['tag']}",
                  "subscriber UNTAG")

    await blocked("DELETE", f"/api/tags/{R['tag']}", "tag DELETE")

    await blocked("PUT", f"/api/templates/{R['template']}",
                  "template PUT", json_body={"name": "hacked",
                                             "content": "x"})
    await blocked("DELETE", f"/api/templates/{R['template']}",
                  "template DELETE")

    await blocked("GET", f"/api/flows/{R['flow']}", "flow GET")
    await blocked("PUT", f"/api/flows/{R['flow']}", "flow PUT",
                  json_body={"name": "hacked"})
    await blocked("POST", f"/api/flows/{R['flow']}/activate", "flow ACTIVATE")
    await blocked("DELETE", f"/api/flows/{R['flow']}", "flow DELETE")

    await blocked("DELETE", f"/api/reports/schedules/{R['report_schedule']}",
                  "report schedule DELETE")

    await blocked("GET", f"/api/posts/{R['post']}", "post GET")
    await blocked("DELETE", f"/api/posts/{R['post']}", "post DELETE")

    # — تذاكر الدعم (مسارات المستخدم العادي) —
    await blocked("GET", f"/api/support/tickets/{R['ticket']}/replies",
                  "ticket replies GET")


async def test_cross_tenant_privilege_escalation(world):
    """viewer مستأجر B لا يستطيع: إنشاء مستخدم/ترقية دور/إدارة مستأجرين."""
    from _hash import hash_password
    from models import User

    sf, client = world.sf, world.client
    ids, tag = await _seed_two_tenants(sf)
    async with sf() as db:
        v = User(username=f"vie_{tag}", email=f"vie_{tag}@v26.ly",
                 password_hash=hash_password(V10_TEST_PASSWORD),
                 tenant_id=ids["b"]["tenant"], role="viewer")
        db.add(v)
        await db.commit()
        viewer_name = v.username

    token_viewer = await _login(client, viewer_name)

    # viewer → PUT/DELETE على مستخدم آخر (بما فيه المالك)
    r = await client.put(f"/api/users/{ids['b']['user']}",
                         headers=_h(token_viewer),
                         json={"role": "admin"})
    assert r.status_code in (401, 403, 404), (
        f"PRIV-ESC: viewer PUT /api/users → {r.status_code}: {r.text[:200]}")

    r = await client.delete(f"/api/users/{ids['b']['user']}",
                            headers=_h(token_viewer))
    assert r.status_code in (401, 403, 404), (
        f"PRIV-ESC: viewer DELETE /api/users → {r.status_code}")

    # viewer → إعدادات المدير العامة
    r = await client.get("/api/admin/config", headers=_h(token_viewer))
    assert r.status_code in (401, 403, 404), (
        f"PRIV-ESC: viewer GET /api/admin/config → {r.status_code}")

    # viewer → مستخدمو المنصة
    r = await client.get("/api/admin/platform/users",
                         headers=_h(token_viewer))
    assert r.status_code in (401, 403, 404), (
        f"PRIV-ESC: viewer GET platform/users → {r.status_code}")

    # admin مستأجر B → حذف مستأجر A نفسه (admin_routes tenant delete)
    token_b = await _login(client, ids["b"]["username"])
    r = await client.delete(f"/api/admin/tenants/{ids['a']['tenant']}",
                            headers=_h(token_b))
    assert r.status_code in (401, 403, 404), (
        f"PRIV-ESC: tenant-admin DELETE other tenant → {r.status_code}")


async def test_token_tenant_claims_cannot_be_forged(world):
    """توكن موقّع بمطالبات معدلة يرفض — ولا يمكن انتحال مستأجر آخر."""
    from routers.auth import make_token  # نفس مسار التوقيع

    sf, client = world.sf, world.client
    ids, tag = await _seed_two_tenants(sf)

    # توكن لمستخدم B لكن مع ادعاء tid لمستأجر A (توقيع سليم — لكن هل
    # يُصدَّق الادعاء أو يُقرأ من قاعدة البيانات؟)
    token_forged = make_token(ids["b"]["username"],
                              tenant_id=ids["a"]["tenant"])
    r = await client.get("/api/auth/me", headers=_h(token_forged))
    if r.status_code == 200:
        # مسموح فقط إذا كان tenant_id مأخوذًا من DB لا من الادعاء
        data = r.json().get("data", {})
        reported = data.get("tenant_id") if isinstance(data, dict) else None
        assert reported == ids["b"]["tenant"], (
            f"FORGED CLAIM honored: claimed tenant A, server reports {reported}")
    else:
        assert r.status_code in (401, 403)
