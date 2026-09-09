"""v16-E1 (BACKEND-SSRF) — إغلاق عائلة SSRF بحل DNS في الموقعين الأخيرين.

خطة v16 §1-E1 (الدليل: audit-reports/v16-D2-security.md — LEAD C): بقيت
موقعان بجلب خارجي محروس بالطبقة السريعة فقط (IP حرفي بلا حل DNS)، وشعار
PDF كان يجلبه WeasyPrint نفسه (يتبع التوجيهات فلا يعاد فحص شيء):

  1. fb_client.post_to_page_with_image — الحارس الآن
     ``assert_safe_outbound_url`` (بحل DNS) قبل أي عميل HTTP، والبايتات
     المجلوبة بسقف ``_IMAGE_MAX_BYTES`` (5MB) قبل رفعها لنقطة صور Graph
     (كانت قناة تسريب بلا سقف). كل رفض = تدهور نصي (عقد الصور القائم).
  2. شعار التقرير (reports_routes + pdf_reports_engine) — جلب مسبق محروس
     في المسار (DNS + مهلة + سقف + إعادة فحص كل قفزة توجيه) ثم تضمين
     ``data:`` URI، وقفل بنيوي: ``url_fetcher`` يرفض كل مخطط غير data: —
     فلا يستطيع العارض جلب/اتباع أي رابط بعيد مهما دخل الـHTML.

كل DNS وكل HTTP وكل الجلب خارجي مزيّف (monkeypatch) — لا شيء يخرج من
العملية. الأرقام الداخلية: 169.254.169.254 (ميتاداتا السحابة) و10.0.0.5
(RFC1918)؛ الموجب: 93.184.216.34 (عام قابل للتوجيه).
"""
from __future__ import annotations

import base64
from types import SimpleNamespace

import pytest

# ══════════════════════════════════════════════════════════════════════════
# أدوات مشتركة — تزييف DNS بنمط test_v15_concurrency.py:726-732
# ══════════════════════════════════════════════════════════════════════════


def _fake_dns(monkeypatch, ips):
    import ai_service

    async def resolve(host: str):
        return list(ips)

    monkeypatch.setattr(ai_service, "_resolve_host_ips", resolve)


def _fake_broken_dns(monkeypatch):
    import ai_service

    async def broken(host: str):
        raise OSError("NXDOMAIN")

    monkeypatch.setattr(ai_service, "_resolve_host_ips", broken)


class _RecordingHttpClient:
    """عميل HTTP زائف يسجل كل GET/POST — لإثبات «نقطة صور Graph لم تُستدع»."""

    def __init__(self, get_content: bytes = b"", get_status: int = 200):
        self.calls: list[tuple[str, str]] = []
        self._get_content = get_content
        self._get_status = get_status

    async def get(self, url):
        self.calls.append(("GET", url))
        return SimpleNamespace(status_code=self._get_status, content=self._get_content)

    async def post(self, url, data=None, files=None):
        self.calls.append(("POST", url))
        return SimpleNamespace(
            status_code=200, text="",
            json=lambda: {"id": "media_should_not_exist"},
        )


# ══════════════════════════════════════════════════════════════════════════
# §A — fb_client.post_to_page_with_image: حارس DNS + سقف 5MB
# ══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize("bad_ip", ["169.254.169.254", "10.0.0.5"])
async def test_fb_image_dns_internal_ip_degrades_to_text_post(monkeypatch, bad_ip):
    """اسم يجتاز فحص IP الحرفي ثم يحلّ داخلياً → رفض قبل أي عميل HTTP،
    ونشر نصي فقط: لا GET للصورة ولا POST لنقطة {page}/photos إطلاقاً."""
    import fb_client as fb_mod
    from fb_client import FBClient

    _fake_dns(monkeypatch, [bad_ip])
    fb = FBClient("tok", "page_ssrf")
    text_posts: list[str] = []
    http = _RecordingHttpClient()

    async def _fake_text_post(message: str):
        text_posts.append(message)
        return {"id": "txt_only"}

    async def _ensure():
        return http

    monkeypatch.setattr(fb, "post_to_page", _fake_text_post)
    monkeypatch.setattr(fb_mod, "_ensure_client", _ensure)

    result = await fb.post_to_page_with_image("منشور", "https://img.evil.ly/banner.png")
    assert result == {"id": "txt_only"}, "internal DNS must degrade to the text post"
    assert text_posts == ["منشور"], "text endpoint must be called exactly once"
    # نقطة صور Graph (ولا حتى جلب الصورة) لم تُستدعَ
    assert http.calls == [], f"no HTTP call may happen for internal DNS: {http.calls}"


async def test_fb_image_dns_failure_fails_closed_to_text_post(monkeypatch):
    """تعذر حل DNS = رفض صريح (لا نعبر نطاقاً لا نستطيع التحقق منه) → نص فقط."""
    import fb_client as fb_mod
    from fb_client import FBClient

    _fake_broken_dns(monkeypatch)
    fb = FBClient("tok", "page_nxd")
    text_posts: list[str] = []
    http = _RecordingHttpClient()

    async def _fake_text_post(message: str):
        text_posts.append(message)
        return {"id": "txt_only"}

    async def _ensure():
        return http

    monkeypatch.setattr(fb, "post_to_page", _fake_text_post)
    monkeypatch.setattr(fb_mod, "_ensure_client", _ensure)

    result = await fb.post_to_page_with_image("منشور", "https://unresolvable.example.ly/x.png")
    assert result == {"id": "txt_only"}
    assert text_posts == ["منشور"]
    assert http.calls == []


async def test_fb_image_oversized_body_degrades_to_text_post(monkeypatch):
    """جسم > 5MB (``_IMAGE_MAX_BYTES``) → تدهور نصي قبل رفع أي بايت لـGraph
    (كانت البايتات تُرفع لصفحة المهاجم بلا سقف — قناة التسريب)."""
    import fb_client as fb_mod
    from ai_service import _IMAGE_MAX_BYTES
    from fb_client import FBClient

    _fake_dns(monkeypatch, ["93.184.216.34"])  # الحارس يمر — الفحص هنا للسقف
    fb = FBClient("tok", "page_big")
    text_posts: list[str] = []
    http = _RecordingHttpClient(get_content=b"x" * (_IMAGE_MAX_BYTES + 1))

    async def _fake_text_post(message: str):
        text_posts.append(message)
        return {"id": "txt_only"}

    async def _ensure():
        return http

    monkeypatch.setattr(fb, "post_to_page", _fake_text_post)
    monkeypatch.setattr(fb_mod, "_ensure_client", _ensure)

    result = await fb.post_to_page_with_image("منشور كبير", "https://cdn.good.ly/banner.png")
    assert result == {"id": "txt_only"}, "oversized image must degrade to the text post"
    assert text_posts == ["منشور كبير"]
    # الجلب حدث (الجسم كُشف بعد التنزيل) لكن نقطة الصور لم تُستدعَ
    assert http.calls == [("GET", "https://cdn.good.ly/banner.png")], \
        f"photo upload endpoint must NOT be called for oversized body: {http.calls}"


async def test_fb_image_public_dns_full_image_path(monkeypatch):
    """الموجب: DNS عام (93.184.216.34) يجتاز الحارس → الصورة تُجلب وتُرفع
    لـ{page}/photos بنفس البايتات، والمنشور يُنشر بالمرفق (media_fbid)."""
    import json as _json

    import fb_client as fb_mod
    from fb_client import FBClient

    _fake_dns(monkeypatch, ["93.184.216.34"])
    fb = FBClient("tok", "page_ok")
    feed_posts: list[tuple[str, dict]] = []
    upload_files: dict = {}

    async def _fake_text_post(message: str):  # pragma: no cover — يجب ألا يُستدعى
        raise AssertionError("public-DNS image path must not degrade to text")

    class _UploadingClient(_RecordingHttpClient):
        async def post(self, url, data=None, files=None):
            self.calls.append(("POST", url))
            upload_files["files"] = files
            return SimpleNamespace(status_code=200, text="",
                                   json=lambda: {"id": "media_77"})

    http = _UploadingClient(get_content=b"IMG-BYTES")

    async def _ensure():
        return http

    async def _fake_feed_post(path, data=None, max_retries=3):
        feed_posts.append((path, data))
        return {"id": "feed_1"}

    monkeypatch.setattr(fb, "post_to_page", _fake_text_post)
    monkeypatch.setattr(fb, "_post", _fake_feed_post)
    monkeypatch.setattr(fb_mod, "_ensure_client", _ensure)

    result = await fb.post_to_page_with_image("منشور موجب", "https://cdn.good.ly/banner.png")
    assert result == {"id": "feed_1"}
    # GET الصورة حدث ونقطة الصور استُدعيت والرفع حمل بايتات الجلب نفسها
    assert ("GET", "https://cdn.good.ly/banner.png") in http.calls
    assert any(url.endswith("/page_ok/photos") for _, url in http.calls), http.calls
    assert upload_files["files"]["source"][1] == b"IMG-BYTES"
    # والمنشور النهائي مرفق بالوسائط
    assert feed_posts and feed_posts[0][0] == "page_ok/feed"
    assert feed_posts[0][1]["attached_media[0]"] == _json.dumps({"media_fbid": "media_77"})


async def test_fb_image_guard_uses_public_dns_pass_with_label(monkeypatch):
    """الموجب المباشر للحارس: IP عام يمر بلا استثناء (label عربية للسياق)."""
    from ai_service import assert_safe_outbound_url

    _fake_dns(monkeypatch, ["93.184.216.34"])
    await assert_safe_outbound_url("https://img.good.ly/banner.png", label="صورة المنشور")


# ══════════════════════════════════════════════════════════════════════════
# §B — شعار التقرير: جلب مسبق محروس + تضمين data: URI + 400 عربية
# ══════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize("bad_ip", ["169.254.169.254", "10.0.0.5"])
async def test_report_logo_dns_internal_ip_rejected_400(v10_seed, monkeypatch, bad_ip):
    """DNS يحلّ داخلياً → 400 «شعار التقرير مرفوض». الجلب المحروس نفسه
    مزيّف كحارس صدق: لو تغاضى المسار عن الحارس لانتهى الطلب 200 بشعار data:."""
    import ai_service

    _fake_dns(monkeypatch, [bad_ip])
    fetched: list[str] = []

    async def honest_fetch(url: str):
        fetched.append(url)
        return b"\x89PNG\r\n\x1a\nSHOULD-NEVER-EMBED"

    monkeypatch.setattr(ai_service, "_fetch_image_bytes", honest_fetch)

    uname, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="LogoSSRF")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.post("/api/reports/generate", json={
        "type": "monthly", "days": 7,
        "branding": {"logo_url": "https://logo.evil.ly/logo.png"},
    })
    assert r.status_code == 400, r.text
    assert "شعار التقرير مرفوض" in r.text
    assert fetched == [], "guarded fetch must never run for internal DNS"


async def test_report_logo_guarded_fetch_failure_rejected_400(v10_seed, monkeypatch):
    """الجلب المحروس يفشل (None: مهلة/سقف/توجيه مرفوض) → 400 نفسها —
    لا يُمرر رابط بعيد للمحرك أبداً (المحرك مزيّف كحارس صدق)."""
    import ai_service
    import pdf_reports_engine

    _fake_dns(monkeypatch, ["93.184.216.34"])

    async def failing_fetch(url: str):
        return None

    monkeypatch.setattr(ai_service, "_fetch_image_bytes", failing_fetch)

    rendered: list = []

    async def fake_monthly(self, days=30, branding=None, tenant_id=0):
        rendered.append(branding)
        return b"%PDF-should-not-reach"

    monkeypatch.setattr(pdf_reports_engine.PdfReportsEngine, "monthly_report", fake_monthly)

    uname, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="LogoFail")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.post("/api/reports/generate", json={
        "type": "monthly", "days": 7,
        "branding": {"logo_url": "https://logo.good.ly/logo.png"},
    })
    assert r.status_code == 400, r.text
    assert "شعار التقرير مرفوض" in r.text
    assert rendered == [], "engine must not render when the guarded fetch fails"


async def test_report_logo_public_dns_embedded_as_data_uri(v10_seed, monkeypatch):
    """الموجب: DNS عام + جلب محروس ناجح → المحرك يستقبل data: URI بالبايتات
    نفسها وmime المستنتجم من المحتوى — لا رابط بعيد في الـHTML إطلاقاً."""
    import ai_service
    import pdf_reports_engine

    _fake_dns(monkeypatch, ["93.184.216.34"])
    logo_png = b"\x89PNG\r\n\x1a\nLOGO-BYTES"
    fetched: list[str] = []

    async def good_fetch(url: str):
        fetched.append(url)
        return logo_png

    monkeypatch.setattr(ai_service, "_fetch_image_bytes", good_fetch)

    captured: dict = {}

    async def fake_monthly(self, days=30, branding=None, tenant_id=0):
        captured["branding"] = branding
        captured["tenant_id"] = tenant_id
        return b"%PDF-1.4-logo"

    monkeypatch.setattr(pdf_reports_engine.PdfReportsEngine, "monthly_report", fake_monthly)

    uname, tid, _uid = await v10_seed.tenant_user(role="editor", tenant_name="LogoGood")
    v10_seed.auth(uname, tid)
    r = await v10_seed.world.client.post("/api/reports/generate", json={
        "type": "monthly", "days": 30,
        "branding": {"logo_url": "https://logo.good.ly/logo.png",
                     "company_name": "شركتي"},
    })
    assert r.status_code == 200, r.text
    assert r.content == b"%PDF-1.4-logo"
    assert fetched == ["https://logo.good.ly/logo.png"]
    assert captured["tenant_id"] == tid
    logo_uri = captured["branding"].logo_url
    assert logo_uri.startswith("data:image/png;base64,"), logo_uri[:40]
    assert base64.b64decode(logo_uri.split(",", 1)[1]) == logo_png
    # لا أثر للرابط البعيد في ما وصل المحرك
    assert "https://logo.good.ly" not in logo_uri


def test_image_data_uri_mime_sniffing():
    """مساعد التضمين: mime من التوقيع السحري (PNG/JPEG/GIF/WEBP) والافتراضي
    image/png — والفك يعيد البايتات نفسها."""
    from routers.reports_routes import _image_data_uri

    cases = [
        (b"\x89PNG\r\n\x1a\nxx", "image/png"),
        (b"\xff\xd8\xff\xe0jpeg", "image/jpeg"),
        (b"GIF89a1", "image/gif"),
        (b"RIFF\x00\x00\x00\x00WEBPvp8", "image/webp"),
        (b"\x00\x01\x02unknown-bytes", "image/png"),  # الافتراضي
    ]
    for raw, mime in cases:
        uri = _image_data_uri(raw)
        assert uri.startswith(f"data:{mime};base64,"), (mime, uri[:40])
        assert base64.b64decode(uri.split(",", 1)[1]) == raw


# ══════════════════════════════════════════════════════════════════════════
# §C — قفل WeasyPrint البنيوي: url_fetcher يقبل data: فقط
# ══════════════════════════════════════════════════════════════════════════


def test_pdf_url_fetcher_refuses_every_non_data_scheme():
    """أي مخطط غير data: يُرفض بالرمي — http/https/file/ftp وغير المطلق:
    العارض لا يستطيع جلب أي شيء بعيد، حتى لو دخل الـHTML."""
    from pdf_reports_engine import _data_only_url_fetcher

    refused = [
        "https://evil.example.com/logo.png",   # https — القناة الأصلية
        "http://169.254.169.254/latest",      # http داخلي
        "file:///etc/passwd",                 # ملف محلي
        "ftp://internal.example.com/x",       # ftp
        "gopher://x",                         # مخطط غريب
        "notaurl",                            # ليس URI أصلاً
    ]
    for url in refused:
        with pytest.raises(ValueError):
            _data_only_url_fetcher(url)


def test_pdf_url_fetcher_accepts_data_uris():
    """data: URIs تُقبل: base64 وpercent-encoding بفك صحيح (نمط
    urllib.DataHandler) وmime من الترويسة — مع تخطي weasyprint إن غاب."""
    pytest.importorskip("weasyprint")
    from pdf_reports_engine import _data_only_url_fetcher

    png = b"\x89PNG\r\n\x1a\nFAKEPNG"
    uri = "data:image/png;base64," + base64.b64encode(png).decode()
    resp = _data_only_url_fetcher(uri)
    assert resp.read() == png
    assert resp.content_type == "image/png"
    assert resp.url == uri

    # percent-encoded (غير base64) — فك unquote_to_bytes
    resp2 = _data_only_url_fetcher("data:image/gif,GIF89a")
    assert resp2.read() == b"GIF89a"
    assert resp2.content_type == "image/gif"

    # بلا mediatype → الافتراضي text/plain (نفس عقد stdlib)
    resp3 = _data_only_url_fetcher("data:,hello")
    assert resp3.read() == b"hello"
    assert resp3.content_type == "text/plain"


def test_render_pins_weasyprint_to_the_data_only_fetcher(monkeypatch):
    """_render يمرر _data_only_url_fetcher لكل weasyprint.HTML — والوثيقة
    الحاملة لرابط بعيد: أول محاولة جلب ترمي (لا جلب ولا توجيه)."""
    weasyprint = pytest.importorskip("weasyprint")
    import pdf_reports_engine as eng_mod

    if not eng_mod._WEASYPRINT:  # pragma: no cover — بيئة بلا weasyprint
        pytest.skip("weasyprint not available in this environment")

    captured: dict = {}

    class _FakeHTML:
        def __init__(self, string=None, url_fetcher=None, **kwargs):
            captured["string"] = string
            captured["url_fetcher"] = url_fetcher

        def write_pdf(self, *args, **kwargs):
            return b"%PDF-1.4-locked"

    monkeypatch.setattr(weasyprint, "HTML", _FakeHTML)
    pdf = eng_mod.PdfReportsEngine()._render(
        '<html dir="rtl"><body><img src="https://evil.example.com/x.png"></body></html>')
    assert pdf == b"%PDF-1.4-locked"
    assert captured["url_fetcher"] is eng_mod._data_only_url_fetcher, \
        "every weasyprint.HTML call must be pinned to the data-only fetcher"
    # الرابط البعيد داخل الوثيقة: الرفض بنيوي عند أول محاولة
    with pytest.raises(ValueError):
        captured["url_fetcher"]("https://evil.example.com/x.png")


def test_real_render_survives_remote_img_and_renders_data_uri():
    """التكامل الحقيقي: عرض فعلي ينجو من <img> بعيد (يُتخطى، لا يُجلب) ويضمّن
    صورة data: — لا استثناء ولا طلب شبكة من العارض."""
    pytest.importorskip("weasyprint")
    from pdf_reports_engine import PdfReportsEngine

    # 1×1 PNG حقيقي (يفك عبر Pillow)
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhf"
        "DwAChwGA60e6kgAAAABJRU5ErkJggg==")
    doc = (
        '<html dir="rtl"><head><meta charset="utf-8"></head><body>'
        f'<img src="data:image/png;base64,{base64.b64encode(png).decode()}">'
        '<img src="https://evil.example.com/remote.png">'
        "<p>تقرير تجريبي</p></body></html>"
    )
    pdf = PdfReportsEngine()._render(doc)
    assert pdf[:4] == b"%PDF", "render must complete despite the refused remote img"
