"""v11-A6 — S1 backlog #2: بوابة انحدار HMAC للتجارة (Shopify webhook).

commerce_engine.py كان 0% تغطية و commerce_routes.py 44% — لا اختبار واحد
للتحقق من التوقيع. هذه البوابة تثبّت عقد الأمان:

  [x] verify_webhook (HMAC-SHA256 عبر x-shopify-hmac-sha256):
        - توقيع صحيح (محسوب على البايتات الخام نفسها) → مقبول ويعالج.
        - توقيع خاطئ → 401 «Invalid HMAC signature».
        - توقيع غائب → 401.
        - توقيع صحيح لجسم آخر → 401 (سلامة الجسم: التوقيع يحمي البايتات).
        - بلا webhook_secret مضبوط (متجر غير مربوط) → 401 (لا تحقق أعمى).
  [x] الإعادة (replay): نفس الجسم الموقّع مرتين → استجابتان متطابقتان
        وبلا أي أثر جانبي في القاعدة — المعالج stateless بتصميمه (بناء
        سياق فقط)، فالإعادة آمنة رغم غياب nonce/timestamp في تصميم Shopify.
  [x] المواضيع: orders/create (نص عربي «طلب جديد»)، carts/update («سلة
        مهملة» + عدد المنتجات)، orders/updated («تم الشحن»/«تم التحديث»).
  [x] الحالة والإعداد: GET /api/commerce/status (غير مربوط → missing
        عربية)، POST /api/commerce/shopify/configure (أدمن منصة فقط،
        access_token يُخزَّن مشفرًا Fernet لا نصًا صريحًا)، وجلب
        المنتجات/الطلبات عبر httpx مُحاكى بالكامل (بلا شبكة حقيقية).

Hermetic: httpx.AsyncClient مُحاكى عند جلب المنتجات/الطلبات؛ التوقيع
محسوب محليًا بنفس خوارزمية المحرك.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sys

import pytest
from sqlalchemy import select

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))

WEBHOOK_SECRET = "shpss_v11_commerce_secret"


@pytest.fixture(scope="module")
async def wh_client():
    """عميل HTTP على التطبيق الحقيقي — نفس وصفة anon_client في
    test_v10_auth_negative (الجداول على محرك قاعدة الاختبار المشتركة)."""
    from database import engine as db_engine
    from models import Base
    from runner import app

    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    import httpx
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url="http://test") as ac:
        yield ac




def _sign(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    """نفس حساب المحرك: HMAC-SHA256(base64) على البايتات الخام."""
    digest = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


@pytest.fixture
def shopify_configured(monkeypatch):
    """محرك التجارة بمتجر موقّع بسر ويبهوك معروف (بدون شبكة)."""
    import _services
    from commerce_engine import ShopifyIntegration

    monkeypatch.setattr(_services.commerce_engine, "shopify",
                        ShopifyIntegration(store_domain="store-v11.myshopify.com",
                                           access_token="shpat_v11",
                                           webhook_secret=WEBHOOK_SECRET))


async def _post_webhook(client, topic: str, payload: dict, signature: str | None):
    """إرسال ويبهوك ببايتات محسوبة يدويًا حتى يطابق التوقيع الجسم حرفيًا."""
    raw = json.dumps(payload).encode()
    headers = {"content-type": "application/json"}
    if signature is not None:
        headers["x-shopify-hmac-sha256"] = signature
    return await client.post(f"/api/commerce/shopify/webhook/{topic}",
                             content=raw, headers=headers)


ORDER_PAYLOAD = {
    "id": 9011, "orderNumber": 1001, "totalPrice": "149.50",
    "customer": {"id": 55, "firstName": "سارة", "lastName": "العبيدي",
                 "email": "sara@test.ly"},
    "lineItems": [{"title": "حقيبة جلدية"}, {"title": "حزام"}],
}


# ── بوابة التوقيع ───────────────────────────────────────────────────────────


async def test_webhook_valid_signature_accepted(wh_client, shopify_configured):
    """توقيع صحيح على الجسم الخام → 200 وسياق shopify_order_created بالنص
    العربي وخطوط المنتجات."""
    raw = json.dumps(ORDER_PAYLOAD).encode()
    r = await _post_webhook(wh_client, "orders/create", ORDER_PAYLOAD, _sign(raw))
    assert r.status_code == 200, r.text
    ctx = r.json()["data"]
    assert ctx["trigger_type"] == "shopify_order_created"
    assert ctx["platform"] == "shopify"
    assert "طلب جديد #1001" in ctx["text"], ctx["text"]
    assert ctx["line_items"] == ["حقيبة جلدية", "حزام"]
    assert ctx["email"] == "sara@test.ly"
    assert ctx["order_id"] == "9011"


async def test_webhook_invalid_signature_rejected(wh_client, shopify_configured):
    """توقيع مشوه → 401 «Invalid HMAC signature» ولا معالجة."""
    r = await _post_webhook(wh_client, "orders/create", ORDER_PAYLOAD,
                            "dGFtcGVyZWQtd3Jvbmctc2lnbmF0dXJl")
    assert r.status_code == 401, r.text
    assert r.json()["detail"] == "Invalid HMAC signature", r.text


async def test_webhook_missing_signature_rejected(wh_client, shopify_configured):
    """بلا ترويسة x-shopify-hmac-sha256 → 401 (وليس قبولًا صامتًا)."""
    r = await _post_webhook(wh_client, "orders/create", ORDER_PAYLOAD, None)
    assert r.status_code == 401, r.text


async def test_webhook_signature_of_other_body_rejected(wh_client, shopify_configured):
    """توقيع صحيح لكن لجسم آخر → 401: التوقيع مرتبط بالبايتات (tamper)."""
    signed = _sign(json.dumps(ORDER_PAYLOAD).encode())
    tampered = dict(ORDER_PAYLOAD)
    tampered["totalPrice"] = "0.00"
    r = await _post_webhook(wh_client, "orders/create", tampered, signed)
    assert r.status_code == 401, r.text


async def test_webhook_unconfigured_store_rejects_everything(wh_client):
    """متجر غير مربوط (بلا webhook_secret): كل نداء → 401 — لا يوجد مسار
    يقبل ويبهوك بلا سر (فرع 503 لا يُوصل إليه لأن shopify يُنشأ دائمًا)."""
    payload = {"id": 1}
    raw = json.dumps(payload).encode()
    r = await _post_webhook(wh_client, "orders/create", payload, _sign(raw))
    assert r.status_code == 401, r.text


async def test_webhook_replay_is_side_effect_free(wh_client, shopify_configured):
    """الإعادة: نفس الجسم الموقّع مرتين → استجابتان متطابقتان 200 وبلا أي
    كتابة في القاعدة (المعالج يبني سياقًا فقط — replay آمن بالتصميم)."""
    # v11: قاعدة العملية المشتركة قد تحمل صفوف broadcasts من ملفات
    # اختبار سابقة (عزل الملفات على الحالة العامة، لا على بياناتها) —
    # لذا العقد الصحيح هو «لا صفوف جديدة» (دلتا = 0)، لا «الجدول فارغ».
    import database
    from models import Broadcast
    async with database.AsyncSessionLocal() as db:
        before = len((await db.execute(select(Broadcast))).scalars().all())

    raw = json.dumps(ORDER_PAYLOAD).encode()
    sig = _sign(raw)
    r1 = await _post_webhook(wh_client, "orders/create", ORDER_PAYLOAD, sig)
    r2 = await _post_webhook(wh_client, "orders/create", ORDER_PAYLOAD, sig)
    assert r1.status_code == r2.status_code == 200, (r1.text, r2.text)
    # نفس سياق العمل تمامًا — «timestamp» فقط يتجدد (وقت المعالجة لا الجسم)
    ctx1, ctx2 = dict(r1.json()["data"]), dict(r2.json()["data"])
    ctx1.pop("timestamp"), ctx2.pop("timestamp")
    assert ctx1 == ctx2, (ctx1, ctx2)

    async with database.AsyncSessionLocal() as db:
        after = len((await db.execute(select(Broadcast))).scalars().all())
        assert after == before, (before, after)


# ── المواضيع ────────────────────────────────────────────────────────────────


async def test_webhook_carts_update_topic(wh_client, shopify_configured):
    """carts/update → سياق سلة مهملة بالنص العربي وعدد المنتجات."""
    payload = {"id": "cart9", "email": "mona@test.ly", "totalPrice": "75.00",
               "lineItems": [{"title": "a"}, {"title": "b"}, {"title": "c"}]}
    raw = json.dumps(payload).encode()
    r = await _post_webhook(wh_client, "carts/update", payload, _sign(raw))
    assert r.status_code == 200, r.text
    ctx = r.json()["data"]
    assert ctx["trigger_type"] == "shopify_abandoned_cart"
    assert ctx["item_count"] == 3
    assert "سلة مهملة" in ctx["text"] and "3 منتج" in ctx["text"], ctx["text"]


async def test_webhook_orders_updated_fulfillment_states(wh_client, shopify_configured):
    """orders/updated: مع fulfillments → «تم الشحن»، وبدونها → «تم التحديث»."""
    shipped = {"id": 5, "orderNumber": 1002, "fulfillments": [{"id": 1}]}
    raw = json.dumps(shipped).encode()
    r = await _post_webhook(wh_client, "orders/updated", shipped, _sign(raw))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["fulfillment_status"] == "تم الشحن"

    plain = {"id": 6, "orderNumber": 1003}
    raw = json.dumps(plain).encode()
    r = await _post_webhook(wh_client, "orders/updated", plain, _sign(raw))
    assert r.status_code == 200, r.text
    assert r.json()["data"]["fulfillment_status"] == "تم التحديث"


# ── الحالة + الإعداد + الجلب (Hermetic httpx) ───────────────────────────────


async def test_commerce_status_unconfigured_arabic_hint(v10_seed):
    """GET /api/commerce/status (موثّق): غير مربوط → configured=false وmissing
    برسالة عربية (لا سر يُكلَّم)."""
    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    r = await v10_seed.world.client.get("/api/commerce/status")
    assert r.status_code == 200, r.text
    data = r.json()["data"]["shopify"]
    assert data["configured"] is False
    assert data["missing"] == ["ربط متجر Shopify من الإعدادات"], data


async def test_commerce_status_requires_auth(wh_client):
    """مسار الحالة محمي: بلا كوكي → 401."""
    r = await wh_client.get("/api/commerce/status")
    assert r.status_code == 401, r.text


async def test_commerce_products_and_orders_unconfigured_empty(wh_client):
    """متجر غير مربوط: products/orders يعيدان قوائم فارغة — بلا أي نداء
    شبكي (العودة المبكرة قبل httpx)."""
    from _services import commerce_engine

    assert await commerce_engine.shopify.get_products(10) == []
    assert await commerce_engine.shopify.get_orders(10) == []


class _FakeAsyncClient:
    """httpx.AsyncClient مزيّف: يسجل النداءات ويعيد استجابة JSON جاهزة."""

    last_calls: list[tuple] = []
    response_json: dict = {}
    status_code: int = 200

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, headers=None, params=None):
        type(self).last_calls.append((url, headers, params))
        import types
        return types.SimpleNamespace(status_code=type(self).status_code,
                                     is_success=type(self).status_code < 400,
                                     json=lambda: type(self).response_json)


async def test_configure_saves_encrypted_token_and_fetches_products(v10_seed, monkeypatch):
    """POST /api/commerce/shopify/configure (أدمن المنصة): access_token يُخزَّن
    مشفرًا (لا نص صريح) ويعاد فكّه صحيحًا؛ ثم جلب المنتجات عبر httpx مُحاكى
    يمرر X-Shopify-Access-Token ويربط الحقول (id/title/image/price)."""
    import httpx
    from _crypto import decrypt_token
    from models import BotState

    _FakeAsyncClient.last_calls = []
    _FakeAsyncClient.response_json = {"products": [{
        "id": 11, "title": "حقيبة سفر",
        "images": [{"src": "https://cdn.example/p.jpg"}],
        "variants": [{"price": "199.00"}],
    }]}
    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)

    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    c = v10_seed.world.client

    r = await c.post("/api/commerce/shopify/configure", json={
        "store_domain": "store-v11.myshopify.com",
        "access_token": "shpat_secret_token_v11",
        "webhook_secret": WEBHOOK_SECRET,
    })
    assert r.status_code == 200, r.text
    assert r.json()["data"] == {"ok": True, "store": "store-v11.myshopify.com"}

    async with v10_seed.world.sf() as db:
        rows = {row.key: row for row in (await db.execute(
            select(BotState).where(BotState.key.like("shopify_%")))).scalars()}
        assert rows["shopify_store_domain"].value == "store-v11.myshopify.com"
        stored = rows["shopify_access_token"].value
        assert stored != "shpat_secret_token_v11", "access_token stored in PLAINTEXT"
        assert decrypt_token(stored) == "shpat_secret_token_v11"

    products = await _fetch_products_as(c)
    assert products == [{"id": 11, "title": "حقيبة سفر",
                         "image": "https://cdn.example/p.jpg", "price": "199.00"}]
    url, headers, params = _FakeAsyncClient.last_calls[0]
    assert url == "https://store-v11.myshopify.com/admin/api/2024-01/products.json"
    assert headers["X-Shopify-Access-Token"] == "shpat_secret_token_v11"
    assert params["fields"] == "id,title,images,variants"


async def _fetch_products_as(client) -> list[dict]:
    r = await client.get("/api/commerce/shopify/products?limit=5")
    assert r.status_code == 200, r.text
    return r.json()["data"]["products"]


async def test_configure_forbidden_for_tenant_admin(v10_seed):
    """أدمن مستأجر (tenant≠0) لا يضبط متجر المنصة → 403 قبل أي كتابة."""
    uname, _tid, _uid = await v10_seed.tenant_user(role="admin", tenant_name="C-403")
    await v10_seed.login(uname)
    r = await v10_seed.world.client.post("/api/commerce/shopify/configure", json={
        "store_domain": "evil.myshopify.com"})
    assert r.status_code == 403, r.text


async def test_orders_fetch_via_mocked_httpx(v10_seed, monkeypatch):
    """جلب الطلبات عبر httpx مُحاكى: مسار orders.json مع limit/status، وحدّ
    الخطأ (500) يعيد [] ولا يرفع."""
    import httpx

    _FakeAsyncClient.last_calls = []
    _FakeAsyncClient.response_json = {"orders": [{"id": 77, "total_price": "20.00"}]}
    _FakeAsyncClient.status_code = 200
    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)

    uname, _tid, _uid = await v10_seed.platform_admin()
    await v10_seed.login(uname)
    from _services import commerce_engine
    from commerce_engine import ShopifyIntegration

    monkeypatch.setattr(commerce_engine, "shopify",
                        ShopifyIntegration(store_domain="s.myshopify.com",
                                           access_token="tok",
                                           webhook_secret=WEBHOOK_SECRET))
    orders = await commerce_engine.shopify.get_orders(limit=3, status="closed")
    assert orders == [{"id": 77, "total_price": "20.00"}]
    url, headers, _params = _FakeAsyncClient.last_calls[0]
    assert url.endswith("/admin/api/2024-01/orders.json")
    assert headers["X-Shopify-Access-Token"] == "tok"

    # فشل بعيد: 500 → قائمة فارغة (لا استثناء يهرب)
    _FakeAsyncClient.status_code = 500
    assert await commerce_engine.shopify.get_orders(limit=3) == []
    _FakeAsyncClient.status_code = 200
