"""Track G.3 — comparative test: facebook_engine (new) vs fb_client (old).

Both run against the SAME mocked Graph API. Parity rows assert identical
outcomes for every shared operation; capability rows assert the new
engine's additions (full pagination >25, retry on 5xx, per-tenant state).
No live Facebook call — staging-equivalent evidence, per plan isolation.
"""
from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-prod")
os.environ.setdefault("FB_ACCESS_TOKEN", "test-token")
os.environ.setdefault("FB_PAGE_ID", "1001")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DEBUG", "True")

import asyncio
import httpx
import pytest

from facebook_engine.client import GraphClient, GraphAPIError
from facebook_engine import tools


# ── mock Graph API ──────────────────────────────────────────────────────────
POSTS_PAGE1 = {"data": [{"id": f"p{i}", "message": f"post {i}"} for i in range(25)],
               "paging": {"next": "https://graph.facebook.com/v22.0/1001/posts?limit=25&after=AAA"}}
POSTS_PAGE2 = {"data": [{"id": f"p{i}", "message": f"post {i}"} for i in range(25, 37)]}
COMMENT = {"id": "c1", "message": "hello", "from": {"id": "u1", "name": "أحمد"}}


class MockTransport(httpx.MockTransport):
    calls: list[tuple[str, str]] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.startswith("/v22.0/"):
            path = path[len("/v22.0"):]  # normalize base_url prefix
        self.calls.append((request.method, path))
        if "retry" in path:
            # fail twice with 503 then succeed
            n = sum(1 for m, p in self.calls if p == path)
            if n <= 2:
                return httpx.Response(503, json={"error": {"message": "temp", "code": 2}})
            return httpx.Response(200, json={"ok": True})
        if path == "/1001/posts":
            if "after" in str(request.url):
                return httpx.Response(200, json=POSTS_PAGE2)
            return httpx.Response(200, json=POSTS_PAGE1)
        if path.endswith("/comments"):
            return httpx.Response(200, json={"data": [COMMENT]})
        if path == "/1001":
            return httpx.Response(200, json={"id": "1001", "name": "Page", "followers_count": 42, "fan_count": 42})
        if path == "/1001/feed":
            return httpx.Response(200, json={"id": "p_new"})
        if "insights" in path:
            return httpx.Response(200, json={"data": [
                {"name": "post_impressions", "values": [{"value": 100}]},
                {"name": "post_reactions_by_type_total", "values": [{"value": {"like": 5}}]},
            ]})
        return httpx.Response(400, json={"error": {"message": "unknown path", "code": 100}})


def make_client() -> GraphClient:
    transport = MockTransport(lambda req: MockTransport.handler(MockTransport, req))
    c = GraphClient(1, "tok", "1001")
    c._http = httpx.AsyncClient(base_url="https://graph.facebook.com/v22.0",
                                transport=transport, timeout=10)
    return c


def make_old_client():
    """Old client with module-global _http replaced by the same mock transport."""
    import fb_client
    old = fb_client.FBClient("tok", "1001")
    transport = MockTransport(lambda req: MockTransport.handler(MockTransport, req))
    fb_client._http = httpx.AsyncClient(base_url="https://graph.facebook.com/v22.0",
                                        transport=transport, timeout=10)
    return old


# ── parity rows (G.3 comparison table) ─────────────────────────────────────

async def test_parity_posts_first_page():
    new = make_client()
    old = make_old_client()
    new_posts = await tools.get_posts(new, limit=25)
    old_posts, _old_paging = await old.get_page_posts(limit=25)  # old returns (data, paging)
    assert [p["id"] for p in new_posts] == [p["id"] for p in old_posts]
    await new.aclose()


async def test_parity_reply_and_fan_count():
    new = make_client()
    old = make_old_client()
    r_new = await tools.reply_to_comment(new, "c1", "شكراً")
    r_old = await old.reply_to_comment("c1", "شكراً")
    assert r_new == r_old
    assert await tools.get_page_followers(new) == await old.get_page_fan_count()
    await new.aclose()


async def test_parity_publish_post():
    new = make_client()
    old = make_old_client()
    assert await tools.publish_post(new, "مرحبا") == await old.post_to_page("مرحبا")
    await new.aclose()


# ── capability rows (new engine only) ──────────────────────────────────────

async def test_full_pagination_beyond_25():
    """fb-mcp and fb_client stop at page 1 (25 items); the engine follows paging.next."""
    c = make_client()
    posts = await tools.get_posts(c, limit=25, full=True)
    assert len(posts) == 37, f"expected 37 (25+12), got {len(posts)}"
    await c.aclose()


async def test_retry_on_5xx():
    """503 twice then success — old client raises, engine retries."""
    c = make_client()
    out = await c.get("/retry-op")
    assert out == {"ok": True}
    await c.aclose()


async def test_normalized_errors():
    c = make_client()
    with pytest.raises(GraphAPIError) as ei:
        await c.get("/unknown-path")
    assert ei.value.status == 400
    assert ei.value.code == 100
    await c.aclose()


async def test_tenant_isolation_by_construction():
    """Two clients = two tenants; no shared module state (the fb-mcp flaw)."""
    a = GraphClient(1, "tok-a", "page-a")
    b = GraphClient(2, "tok-b", "page-b")
    assert a.tenant_id != b.tenant_id and a.page_id != b.page_id
    assert a._http is not b._http
    await a.aclose(); await b.aclose()


async def test_mcp_server_is_lazy_and_isolated():
    """The MCP module must not import `mcp` at package import time (app safety)."""
    import sys
    import facebook_engine
    assert "mcp.server" not in sys.modules
    # and the live app does NOT import the engine anywhere
    import subprocess
    r = subprocess.run(
        ["grep", "-rn", "facebook_engine", "--include=*.py",
         "/home/z/my-project/SmartBot/fb_dashboard/"],
        capture_output=True, text=True,
    )
    hits = [l for l in r.stdout.splitlines()
            if "facebook_engine/" not in l and "test_track_g" not in l]
    assert not hits, f"live app imports the isolated engine: {hits}"
