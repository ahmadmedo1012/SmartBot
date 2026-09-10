"""v24-R3 — backend M-item fixes (agent: r3-backend2).

Every test pins ONE fix from docs/reports/v24-B1-backend.md (M2/M3/M4/M5/
M6/M7) or docs/reports/v24-B2-security.md (H-1, M-1, M-4), plus the
client_ip() adoption C4 left for this agent (auth.py + payments family):

  T1  client_ip() at every remaining request.client.host site — the login/
      register/subscription/payment limiter buckets and the audit rows key
      on the honest client IP behind a known proxy (XFF honored only with
      VERCEL / SMARTBOT_TRUST_XFF).
  M2  widgets top-keywords + diagnostics recent-errors limit bounded
      (1..200) — 422 on absurd values (the v12-E2.7 Query pattern).
  M3  widgets response-time / sentiment-trend days bounded (1..90).
  M4a api_cache.invalidate_on_write: REAL redis delete, no '' poison.
  M5  api_cache ↔ redis_cache single serialization (object in, object
      out; keys versioned under "apic:v2:").
  M6  _run_bot_loop per-tenant isolation — one tenant's cycle() raise no
      longer aborts the remaining tenants.
  M7  ai_service.analyze_image: expected provider failures → "" +
      last_error; unexpected exceptions PROPAGATE; Pillow decode in a
      worker thread.
  H-1 receipt uploads land OUTSIDE the public /static mount; bytes served
      only through the authenticated GET /api/payments/receipt/{id}.
  M-4 the six bounded str(e)[:n] client surfaces → generic Arabic, detail
      server-side only.
  M-1 DEBUG=true in a non-local deployment warns loudly at boot.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import io
import json
import os
import subprocess
import sys
import time
from types import SimpleNamespace

import pytest

_FB_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))
if _FB_DIR not in sys.path:
    sys.path.insert(0, _FB_DIR)


# ══════════════════════════════════════════════════════════════════════════
# T1 — client_ip() adoption (C4 handoff)
# ══════════════════════════════════════════════════════════════════════════


class _KeyRecorder:
    """Captures every rate-limit key check_rate_limit is called with."""

    def __init__(self):
        self.keys: list[str] = []

    async def __call__(self, db, key, max_attempts=10, window_seconds=60):
        self.keys.append(key)
        return True


async def test_login_throttle_bucket_uses_honest_client_ip(v10_seed, monkeypatch):
    import _rate_limit

    rec = _KeyRecorder()
    monkeypatch.setattr(_rate_limit, "check_rate_limit", rec)
    c = v10_seed.world.client
    # behind the Vercel proxy: the RIGHT-MOST (proxy-appended) XFF hop is the
    # bucket key — v24-R4 F1 hardening: the left entry is client-supplied and
    # spoofable (fresh-bucket bypass / victim-IP lockout), so it must NOT key
    # the login throttle.
    monkeypatch.setenv("VERCEL", "1")
    r = await c.post("/api/login", json={"username": "ghost", "password": "x" * 12},
                     headers={"x-forwarded-for": "93.184.216.34, 10.0.0.9"})
    assert r.status_code == 401, r.text  # user doesn't exist — throttle ran first
    assert "login:10.0.0.9" in rec.keys
    assert "login:93.184.216.34" not in rec.keys  # the spoofed left hop ignored
    # without a known proxy the header is client-spoofable → must be ignored
    rec.keys.clear()
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.delenv("SMARTBOT_TRUST_XFF", raising=False)
    await c.post("/api/login", json={"username": "ghost", "password": "x" * 12},
                 headers={"x-forwarded-for": "6.6.6.6"})
    assert rec.keys and all("6.6.6.6" not in k for k in rec.keys)


async def test_register_throttle_bucket_uses_honest_client_ip(v10_seed, monkeypatch):
    import _rate_limit

    rec = _KeyRecorder()
    monkeypatch.setattr(_rate_limit, "check_rate_limit", rec)
    monkeypatch.setenv("VERCEL", "1")
    r = await v10_seed.world.client.post(
        "/api/register", json={"username": "u1", "email": "bad", "password": "short"},
        headers={"x-forwarded-for": "93.184.216.34"})
    assert r.status_code == 400, r.text
    assert "register:93.184.216.34" in rec.keys


async def test_subscription_throttle_bucket_uses_honest_client_ip(v10_seed, monkeypatch):
    import _rate_limit

    rec = _KeyRecorder()
    monkeypatch.setattr(_rate_limit, "check_rate_limit", rec)
    ua, tid, _ = await v10_seed.tenant_user(tenant_name="IP-SUB")
    v10_seed.auth(ua, tid)
    monkeypatch.setenv("VERCEL", "1")
    r = await v10_seed.world.client.post(
        "/api/subscriptions", json={"amount": "x"},
        headers={"x-forwarded-for": "93.184.216.34"})
    assert r.status_code in (400, 422), r.text
    assert "sub:93.184.216.34" in rec.keys


async def test_payment_rate_limit_bucket_uses_honest_client_ip(monkeypatch):
    """wallet._payment_rate_limit — shared by topup/confirm/upload (10/min/IP)."""
    import _rate_limit
    from routers.payments import wallet

    rec = _KeyRecorder()
    monkeypatch.setattr(_rate_limit, "check_rate_limit", rec)
    req = SimpleNamespace(client=SimpleNamespace(host="10.9.9.9"),
                          headers={"x-forwarded-for": "93.184.216.34"})
    monkeypatch.setenv("VERCEL", "1")
    await wallet._payment_rate_limit(req, "topup")
    assert rec.keys == ["topup:93.184.216.34"]


async def test_admin_reset_password_audit_row_uses_honest_client_ip(v10_seed, monkeypatch):
    import routers.auth as auth_mod

    seen: dict = {}

    async def _capture_audit(db, action, **kw):
        seen[action] = kw.get("ip")

    monkeypatch.setattr(auth_mod, "log_audit", _capture_audit)
    admin, tid, uid = await v10_seed.tenant_user(role="admin", tenant_name="IP-AUD")
    v10_seed.auth(admin, tid)
    monkeypatch.setenv("VERCEL", "1")
    r = await v10_seed.world.client.post(
        "/api/admin/reset-password",
        json={"user_id": uid, "new_password": "pass123456"},
        headers={"x-forwarded-for": "93.184.216.34"})
    assert r.status_code == 200, r.text
    assert seen.get("reset_password") == "93.184.216.34"


# ══════════════════════════════════════════════════════════════════════════
# M6 — _run_bot_loop per-tenant isolation
# ══════════════════════════════════════════════════════════════════════════


class _LoopTenant:
    def __init__(self, tid):
        self.id = tid


class _LoopResult:
    def __init__(self, tenants):
        self._tenants = tenants

    def scalars(self):
        outer = self

        class _S:
            def all(self):
                return outer._tenants

        return _S()


class _LoopSession:
    def __init__(self, tenants):
        self._tenants = tenants

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def execute(self, stmt):
        return _LoopResult(self._tenants)


class _LoopEngine:
    def __init__(self, tid, events):
        self._tid, self._events = tid, events

    async def cycle(self):
        self._events.append(self._tid)
        if self._tid == 202:  # the poisoned tenant
            raise RuntimeError("tenant 202 graph token exploded")


async def test_bot_loop_one_failing_tenant_does_not_abort_the_rest(monkeypatch):
    """M6: the try/except wrapped the WHOLE tenant loop — tenant 202's raise
    meant tenant 303 never got a cycle that pass. Now every tenant is
    isolated; the failure is logged with the tenant id and the loop moves on."""
    import app.telegram as tg

    events: list[int] = []
    tenants = [_LoopTenant(101), _LoopTenant(202), _LoopTenant(303)]
    monkeypatch.setattr(tg, "AsyncSessionLocal", lambda: _LoopSession(tenants))

    async def _fake_fb_client(tid):
        return object()

    monkeypatch.setattr(tg, "get_tenant_fb_client", _fake_fb_client)
    monkeypatch.setattr(tg, "get_bot_engine",
                        lambda fb, tenant_id: _LoopEngine(tenant_id, events))
    monkeypatch.setattr(tg.settings, "BOT_INTERVAL_SECONDS", 0.01)

    task = asyncio.create_task(tg._run_bot_loop())
    try:
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            if 303 in events:
                break
            await asyncio.sleep(0.01)
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    assert 101 in events, "the first tenant must have cycled"
    assert events.count(202) >= 1, "the failing tenant must have been attempted"
    assert 303 in events, (
        "the tenant AFTER the failing one must still be processed — "
        f"one tenant's raise must not abort the rest (events={events})")


# ══════════════════════════════════════════════════════════════════════════
# M7 — ai_service.analyze_image honest failure + off-loop Pillow
# ══════════════════════════════════════════════════════════════════════════


def _bare_ai(provider="openai"):
    from ai_service import AIService

    ai = AIService.__new__(AIService)
    ai._provider = provider
    ai._openai_client = object() if provider == "openai" else None
    ai._google_module = object() if provider == "gemini" else None
    ai._model = "test-model"
    ai._openai_model = "test-model"
    ai.last_error = ""
    return ai


async def test_analyze_image_expected_provider_failure_is_honest_empty():
    """M7: a provider-shaped failure (transport/timeout/decode) answers "" with
    the REASON on last_error — the v23 honest-failure surface."""
    ai = _bare_ai()

    async def _boom(url, prompt):
        raise ValueError("429 quota exceeded")

    ai._openai_vision = _boom
    out = await ai.analyze_image("https://example.com/a.jpg")
    assert out == ""
    assert "429 quota" in ai.last_error


async def test_analyze_image_unexpected_exception_propagates():
    """M7: the old `except Exception` made EVERY bug look like an honest empty
    result. A non-provider exception now reaches the caller (agent_engine's
    handlers answer a generic Arabic failure)."""
    ai = _bare_ai()

    async def _bug(url, prompt):
        raise KeyError("internal defect")

    ai._openai_vision = _bug
    with pytest.raises(KeyError):
        await ai.analyze_image("https://example.com/a.jpg")


async def test_analyze_image_ssrf_rejection_still_propagates(monkeypatch):
    import ai_service

    ai = _bare_ai()

    async def _never(url, prompt):
        raise AssertionError("must not be called")

    ai._openai_vision = _never

    async def _reject(url, label="رابط الصورة"):
        raise ai_service.UnsafeImageUrlError(f"{label} مرفوض — يُسمح فقط بروابط https")

    monkeypatch.setattr(ai_service, "assert_safe_outbound_url", _reject)
    with pytest.raises(ai_service.UnsafeImageUrlError):
        await ai.analyze_image("https://inside.evil.test/a.jpg")


async def test_gemini_vision_decodes_in_thread_and_passes_pil_image(monkeypatch):
    """M7(b): the Pillow decode now runs via asyncio.to_thread — the provider
    still receives a decoded PIL image (the refactor must not change the
    contract), and a corrupt payload is an EXPECTED (OSError-family) failure."""
    import PIL.Image

    ai = _bare_ai(provider="gemini")

    img = PIL.Image.new("RGB", (40, 30), (200, 30, 30))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    data_uri = f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}"

    received: list = []

    class _FakeGenModel:
        def __init__(self, model):
            pass

        async def generate_content_async(self, parts):
            received.extend(parts)
            return SimpleNamespace(text=" صورة حمراء ")

    ai._google_module = SimpleNamespace(GenerativeModel=_FakeGenModel)
    out = await ai.analyze_image(data_uri, prompt="صف")
    assert out == "صورة حمراء"
    assert isinstance(received[1], PIL.Image.Image)
    assert received[1].size == (40, 30)

    # corrupt payload → expected family → honest "" + last_error (not a crash)
    ai2 = _bare_ai(provider="gemini")
    ai2._google_module = SimpleNamespace(GenerativeModel=_FakeGenModel)
    bad = "data:image/jpeg;base64," + base64.b64encode(b"not an image at all").decode()
    out2 = await ai2.analyze_image(bad)
    assert out2 == ""
    assert ai2.last_error, "the reason must be surfaced (v23 contract)"


# ══════════════════════════════════════════════════════════════════════════
# M2/M3 — unbounded query params (422 on absurd values)
# ══════════════════════════════════════════════════════════════════════════


async def test_widgets_top_keywords_limit_bounded(v10_seed):
    ua, tid, _ = await v10_seed.tenant_user(tenant_name="W-LIM")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client
    r = await c.get("/api/widgets/top-keywords?limit=10000000")
    assert r.status_code == 422, r.text
    r = await c.get("/api/widgets/top-keywords?limit=0")
    assert r.status_code == 422, r.text
    r = await c.get("/api/widgets/top-keywords?limit=10")
    assert r.status_code == 200, r.text


async def test_widgets_days_params_bounded(v10_seed):
    ua, tid, _ = await v10_seed.tenant_user(tenant_name="W-DAY")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client
    for path in ("/api/widgets/response-time", "/api/widgets/sentiment-trend"):
        r = await c.get(f"{path}?days=-5")
        assert r.status_code == 422, (path, r.text)
        r = await c.get(f"{path}?days=99999")
        assert r.status_code == 422, (path, r.text)
        r = await c.get(f"{path}?days=30")
        assert r.status_code == 200, (path, r.text)


async def test_diagnostics_recent_errors_limit_bounded(v10_seed):
    pa, _, _ = await v10_seed.platform_admin()
    v10_seed.auth(pa, 0)
    c = v10_seed.world.client
    r = await c.get("/api/diagnostics/recent-errors?limit=99999999")
    assert r.status_code == 422, r.text
    r = await c.get("/api/diagnostics/recent-errors?limit=0")
    assert r.status_code == 422, r.text
    r = await c.get("/api/diagnostics/recent-errors?limit=5")
    assert r.status_code == 200, r.text


# ══════════════════════════════════════════════════════════════════════════
# M4/M5 — cache layer: single serialization + real invalidation
# ══════════════════════════════════════════════════════════════════════════


class _FakeRedisLayer:
    """Mirrors redis_cache's REAL semantics exactly: set() json-encodes once,
    get() json-decodes once — backed by a dict instead of a client."""

    def __init__(self):
        self.store: dict[str, str] = {}
        self.deleted: list[str] = []

    def install(self, monkeypatch):
        import redis_cache as rc

        async def _get(key):
            raw = self.store.get(key)
            return json.loads(raw) if raw else None

        async def _set(key, value, ttl=300):
            self.store[key] = json.dumps(value, default=str)

        async def _delete(key):
            self.deleted.append(key)
            self.store.pop(key, None)

        monkeypatch.setattr(rc, "get", _get)
        monkeypatch.setattr(rc, "set", _set)
        monkeypatch.setattr(rc, "delete", _delete)
        return rc


async def test_cache_single_encoding_mixed_consumer_contract(monkeypatch):
    """M5: api_cache writes the OBJECT; a direct redis_cache.get on the same
    key returns the OBJECT (previously a doubly-encoded string — a mixed
    consumer corrupted silently)."""
    import api_cache as ac
    import redis_cache as rc

    fake = _FakeRedisLayer()
    fake.install(monkeypatch)

    calls = {"n": 0}

    async def factory():
        calls["n"] += 1
        return {"v": 1, "list": [1, 2]}

    out = await ac.get_or_compute("t:m5-key", 60, factory)
    assert out == {"v": 1, "list": [1, 2]}
    assert calls["n"] == 1

    key = ac._REDIS_PREFIX + "t:m5-key"
    assert key in fake.store, "must be written under the versioned namespace"
    # a MIXED consumer (redis_cache directly) gets the decoded OBJECT…
    assert await rc.get(key) == {"v": 1, "list": [1, 2]}
    # …and the stored payload is single-encoded JSON of that object
    assert json.loads(fake.store[key]) == {"v": 1, "list": [1, 2]}
    # api_cache reads its own write back as the object (no second decode)
    assert await ac._rcache_get("t:m5-key") == {"v": 1, "list": [1, 2]}


async def test_cache_versioned_keys_ignore_legacy_double_encoded_entries(monkeypatch):
    """M5: pre-v24 entries (double-encoded, under the BARE key) must never be
    read back — they age out via their own TTL."""
    import api_cache as ac

    fake = _FakeRedisLayer()
    fake.install(monkeypatch)
    # exactly what the OLD code wrote: json.dumps(json.dumps(obj)) at the
    # bare key, via redis_cache.set's single encode of the pre-dumped string
    fake.store["t:legacy-key"] = json.dumps(json.dumps({"v": "old"}))

    calls = {"n": 0}

    async def factory():
        calls["n"] += 1
        return {"v": "fresh"}

    out = await ac.get_or_compute("t:legacy-key", 60, factory)
    assert out == {"v": "fresh"}
    assert calls["n"] == 1, "the legacy entry must be invisible (namespace)"


async def test_invalidate_on_write_deletes_redis_and_recomputes_cleanly(monkeypatch):
    """M4: the old '' poison marker made the next read json.loads('') → 500.
    Now the entry is REALLY deleted; a subsequent read recomputes cleanly."""
    import api_cache as ac

    fake = _FakeRedisLayer()
    fake.install(monkeypatch)

    cache = ac.APICache()
    calls = {"n": 0}

    class _Req:
        """Request-like first arg → the cached() key is the PATH ("/t/m4")."""

        def __init__(self):
            self.url = SimpleNamespace(path="/t/m4")
            self.query_params = {}

    @cache.cached(ttl=60)
    async def read_endpoint(req):
        calls["n"] += 1
        return {"v": calls["n"]}

    @cache.invalidate_on_write("/t/m4")
    async def write_endpoint():
        return {"written": True}

    r1 = await read_endpoint(_Req())
    r2 = await read_endpoint(_Req())
    assert r1 == {"v": 1} and r2 == {"v": 1} and calls["n"] == 1

    key = ac._REDIS_PREFIX + "/t/m4"
    assert key in fake.store

    w = await write_endpoint()
    assert w == {"written": True}
    # the Redis copy is GONE (deleted — not an '' poison value)
    assert key not in fake.store
    assert fake.deleted == [key]
    assert all(json.loads(v) != "" for v in fake.store.values())
    # …and the next read recomputes without any decode error
    r3 = await read_endpoint(_Req())
    assert r3 == {"v": 2} and calls["n"] == 2


# ══════════════════════════════════════════════════════════════════════════
# H-1 — receipts land OUTSIDE the public /static mount
# ══════════════════════════════════════════════════════════════════════════


def _tiny_jpeg() -> bytes:
    import PIL.Image

    img = PIL.Image.new("RGB", (64, 48), (10, 120, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


async def test_receipt_upload_lands_in_private_dir_not_static(v10_seed, monkeypatch, tmp_path):
    from routers.payments import bank

    private = tmp_path / "private" / "receipts"
    monkeypatch.setattr(bank, "_UPLOAD_DIR", private)

    ua, tid, _ = await v10_seed.tenant_user(tenant_name="H1-UP")
    v10_seed.auth(ua, tid)
    c = v10_seed.world.client

    r = await c.post("/api/upload", files={"file": ("receipt.jpg", _tiny_jpeg(), "image/jpeg")})
    assert r.status_code == 200, r.text
    url = r.json()["data"]["url"]
    assert url.startswith("/static/uploads/receipts/"), (
        "the DB marker string stays stable (plans.py prefix validation + "
        f"approvals.py resolution): {url}")

    name = url.rsplit("/", 1)[-1]
    # the file lives in the PRIVATE dir…
    stored = private / name
    assert stored.is_file() and stored.read_bytes()[:2] == b"\xff\xd8"
    # …and NOT inside the mounted static tree
    from runner import STATIC_DIR

    assert not (STATIC_DIR / "uploads" / "receipts" / name).exists()
    # the public /static URL is DEAD (that is the H-1 fix itself)
    r2 = await c.get(url)
    assert r2.status_code == 404, (
        f"the receipt must no longer be world-readable through /static: {r2.status_code}")


async def test_receipt_served_only_via_authenticated_route(v10_seed, monkeypatch, tmp_path):
    from models import SubscriptionPayment
    from routers.payments import bank

    private = tmp_path / "private2" / "receipts"
    private.mkdir(parents=True)
    monkeypatch.setattr(bank, "_UPLOAD_DIR", private)

    payload = _tiny_jpeg()
    name = "deadbeef" * 3 + ".jpg"
    (private / name).write_bytes(payload)
    marker = f"/static/uploads/receipts/{name}"

    w = v10_seed.world
    owner, tid, uid = await v10_seed.tenant_user(tenant_name="H1-SRV")
    async with w.sf() as db:
        sp = SubscriptionPayment(user_id=uid, tenant_id=tid, phone="0911111111",
                                 amount=50, provider="bank", plan_id=1,
                                 plan_name="باقة", status="verified",
                                 extra_data={"receipt_url": marker})
        db.add(sp)
        await db.commit()
        sp_id = sp.id

    # anonymous → 401; the authenticated OWNER gets the bytes
    w.client.cookies.clear()
    r_anon = await w.client.get(f"/api/payments/receipt/{sp_id}")
    assert r_anon.status_code == 401, r_anon.text
    v10_seed.auth(owner, tid)
    r = await w.client.get(f"/api/payments/receipt/{sp_id}")
    assert r.status_code == 200, r.text
    assert r.content == payload
    assert r.headers["content-type"].startswith("image/jpeg")


async def test_receipt_marker_resolution_guards_and_legacy_fallback(monkeypatch, tmp_path):
    from routers.payments import bank

    modern = tmp_path / "modern"
    legacy = tmp_path / "legacy"
    modern.mkdir()
    legacy.mkdir()
    monkeypatch.setattr(bank, "_UPLOAD_DIR", modern)
    monkeypatch.setattr(bank, "_UPLOAD_DIR_LEGACY", legacy)

    # traversal / dot names are refused outright
    for bad in ("..", ".", "", "../evil", "a/b.jpg", "a\\b.jpg"):
        assert bank.resolve_receipt_path(bad) is None, bad

    # pre-v24 rows: the file still sits in the legacy (static) location — the
    # authenticated route keeps resolving it there
    (legacy / "oldreceipt.jpg").write_bytes(b"\xff\xd8legacy")
    assert bank.resolve_receipt_path("oldreceipt.jpg") == legacy / "oldreceipt.jpg"

    # the private dir wins when both exist
    (modern / "oldreceipt.jpg").write_bytes(b"\xff\xd8modern")
    assert bank.resolve_receipt_path("oldreceipt.jpg") == modern / "oldreceipt.jpg"
    assert bank.resolve_receipt_path("missing.jpg") is None


# ══════════════════════════════════════════════════════════════════════════
# B2 M-4 — bounded str(e) client surfaces → generic Arabic
# ══════════════════════════════════════════════════════════════════════════


async def test_dashboard_bundle_connection_error_is_generic(v10_seed, monkeypatch):
    import routers.dashboard_stats as ds

    async def _exploding_client(tid):
        raise RuntimeError("secret-host.internal.facebook.com page_123 token=EAAB…")

    monkeypatch.setattr(ds, "get_tenant_fb_client", _exploding_client)
    ua, tid, _ = await v10_seed.tenant_user(tenant_name="M4-DASH")
    v10_seed.auth(ua, tid)
    r = await v10_seed.world.client.get("/api/dashboard/bundle")
    assert r.status_code == 200, r.text
    body = r.json()["data"]
    assert body["connection"]["error"], "honest non-empty error state"
    assert "secret-host" not in r.text and "EAAB" not in r.text, (
        "provider exception text must stay server-side")


async def test_bot_trigger_failure_envelope_leaks_nothing(v10_seed, monkeypatch):
    import routers.bot as bot_mod

    async def broken_cycle():
        raise RuntimeError("TOPSECRET-internal-path /var/task/eng")

    monkeypatch.setattr(bot_mod, "_run_single_cycle", broken_cycle)
    pa, _, _ = await v10_seed.platform_admin()
    v10_seed.auth(pa, 0)
    r = await v10_seed.world.client.post("/api/bot/trigger")
    body = r.json()
    assert body["success"] is False
    assert "فشل تشغيل دورة البوت" in body["error"]
    assert "TOPSECRET" not in json.dumps(body, ensure_ascii=False)


async def test_telegram_test_send_failure_is_generic(v10_seed, monkeypatch):
    import telegram_bot as tb

    async def _token():
        return "123:TEST"

    async def _chat():
        return "555"

    async def _admins():
        return []

    async def _boom(chat, text):
        raise ValueError("TOPSECRET ReadTimeout api.telegram.org")

    monkeypatch.setattr(tb, "get_bot_token", _token)
    monkeypatch.setattr(tb, "get_chat_id", _chat)
    monkeypatch.setattr(tb, "get_admin_ids", _admins)
    monkeypatch.setattr(tb, "send_message", _boom)
    pa, _, _ = await v10_seed.platform_admin()
    v10_seed.auth(pa, 0)
    r = await v10_seed.world.client.post("/api/telegram/test")
    assert r.status_code == 400, r.text
    assert "TOPSECRET" not in r.text
    assert "راجع سجلات الخادم" in r.text


async def test_onboarding_webhook_failure_marker_is_generic(v10_seed, monkeypatch):
    import _services as svc

    class _FakeFBClient:
        async def subscribe_page_webhooks(self):
            raise RuntimeError("TOPSECRET graph.facebook.com 500")

    async def _fake_get_client(tid):
        return _FakeFBClient()

    monkeypatch.setattr(svc, "get_tenant_fb_client", _fake_get_client)
    ua, tid, _ = await v10_seed.tenant_user(role="admin", tenant_name="M4-ONB")
    v10_seed.auth(ua, tid)
    r = await v10_seed.world.client.post("/api/onboarding/connect-page",
                                         json={"page_id": "PG77"})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["webhook"] == {"_error": True, "body": "subscribe_failed"}
    assert "TOPSECRET" not in r.text


# ══════════════════════════════════════════════════════════════════════════
# B2 M-1 — DEBUG in a non-local deployment warns at boot
# ══════════════════════════════════════════════════════════════════════════


def _import_config_in_subprocess(extra_env: dict[str, str]) -> str:
    env = {
        "PATH": os.environ.get("PATH", ""),
        "DEBUG": "true",
        # keep the prod fail-fasts quiet (DEBUG=true already neuters them)
        "SECRET_KEY": "subprocess-secret",
        "CRON_SECRET": "subprocess-cron",
    }
    env.update(extra_env)
    proc = subprocess.run(
        [sys.executable, "-c", f"import sys; sys.path.insert(0, r'{_FB_DIR}'); import config"],
        capture_output=True, text=True, env=env, timeout=60,
    )
    return proc.stderr + proc.stdout


def test_debug_true_in_production_env_warns_loudly_once():
    err = _import_config_in_subprocess({"VERCEL_ENV": "production", "VERCEL": "1"})
    assert "DEBUG=true is active in a non-local deployment" in err
    assert "VERCEL_ENV=production" in err
    assert err.count("DEBUG=true is active") == 1, "exactly one boot warning"


def test_debug_true_without_deployment_markers_stays_quiet():
    err = _import_config_in_subprocess({})
    assert "DEBUG=true is active" not in err
