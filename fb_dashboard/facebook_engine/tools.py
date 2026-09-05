"""Tool layer — the facebook-mcp-server contract, tenant-aware.

Function names/shapes follow HagaiHen/facebook-mcp-server so MCP tool
registration is a 1:1 map, PLUS the SmartBot-only tools (conversations,
ads) the upstream never had. All functions take a GraphClient bound to
the calling tenant — multi-tenancy is enforced by construction.
"""
from __future__ import annotations

from typing import Any

from facebook_engine.client import GraphClient, GraphAPIError

__all__ = ["GraphAPIError"]


# ── posts (fb-mcp: publish_post, update_post, delete_post, get_posts,
#            schedule_post, publish_photo, get_post_permalink) ──────────────

async def publish_post(c: GraphClient, message: str, link: str | None = None) -> dict:
    data: dict[str, Any] = {"message": message}
    if link:
        data["link"] = link
    return await c.post(f"{c.page_id}/feed", data=data)


async def update_post(c: GraphClient, post_id: str, message: str) -> dict:
    return await c.post(post_id, data={"message": message})


async def delete_post(c: GraphClient, post_id: str) -> dict:
    return await c.delete(post_id)


async def get_posts(c: GraphClient, limit: int = 25, *, full: bool = False) -> list[dict]:
    """fb-mcp parity: first page. `full=True` follows ALL paging.next pages."""
    if not full:
        body = await c.get(f"{c.page_id}/posts", {"limit": limit, "fields": "id,message,created_time,permalink_url"})
        return body.get("data", [])
    out: list[dict] = []
    async for page in c.iter_pages(f"{c.page_id}/posts", {"limit": limit, "fields": "id,message,created_time,permalink_url"}):
        out.extend(page)
    return out


async def schedule_post(c: GraphClient, message: str, publish_time_iso: str) -> dict:
    from datetime import datetime
    dt = datetime.fromisoformat(publish_time_iso)
    return await c.post(f"{c.page_id}/feed", data={
        "message": message,
        "published": "false",
        "scheduled_publish_time": str(int(dt.timestamp())),
    })


async def publish_photo(c: GraphClient, image_bytes: bytes, caption: str = "",
                        filename: str = "photo.jpg") -> dict:
    return await c.post(f"{c.page_id}/photos", data={"caption": caption},
                        files={"source": (filename, image_bytes, "image/jpeg")})


async def get_post_permalink(c: GraphClient, post_id: str) -> str:
    body = await c.get(post_id, {"fields": "permalink_url"})
    return body.get("permalink_url", "")


async def get_post_insights(c: GraphClient, post_id: str) -> dict:
    """Full metric set (fb-mcp parity): impressions, engaged, clicks, reactions, shares."""
    body = await c.get(f"{post_id}/insights", {
        "metric": "post_impressions,post_impressions_unique,post_clicks,"
                  "post_reactions_by_type_total"
    })
    out: dict[str, Any] = {}
    for row in body.get("data", []):
        name = row.get("name")
        values = row.get("values", [{}])
        if name == "post_reactions_by_type_total":
            out["reactions"] = values[0].get("value", {}) if values else {}
        else:
            out[name] = values[0].get("value", 0) if values else 0
    # shares come from the post object itself
    post = await c.get(post_id, {"fields": "shares"})
    out["shares"] = (post.get("shares", {}) or {}).get("count", 0)
    return out


# ── comments (fb-mcp: reply_to_comment, delete_comment, hide_comment,
#               unhide_comment, hide_comments_bulk, get_comments, get_replies) ─

async def reply_to_comment(c: GraphClient, comment_id: str, message: str) -> dict:
    return await c.post(f"{comment_id}/comments", data={"message": message})


async def delete_comment(c: GraphClient, comment_id: str) -> dict:
    return await c.delete(comment_id)


async def hide_comment(c: GraphClient, comment_id: str, hide: bool = True) -> dict:
    return await c.post(comment_id, data={"is_hidden": "true" if hide else "false"})


async def unhide_comment(c: GraphClient, comment_id: str) -> dict:
    return await hide_comment(c, comment_id, hide=False)


async def hide_comments_bulk(c: GraphClient, comment_ids: list[str]) -> dict:
    results = {"hidden": [], "failed": []}
    for cid in comment_ids:
        try:
            await hide_comment(c, cid, True)
            results["hidden"].append(cid)
        except GraphAPIError:
            results["failed"].append(cid)
    return results


async def get_comments(c: GraphClient, post_id: str, limit: int = 25, *, full: bool = False) -> list[dict]:
    fields = "id,message,created_time,from{id,name},comment_count,permalink_url"
    if not full:
        body = await c.get(f"{post_id}/comments", {"limit": limit, "fields": fields})
        return body.get("data", [])
    out: list[dict] = []
    async for page in c.iter_pages(f"{post_id}/comments", {"limit": limit, "fields": fields}):
        out.extend(page)
    return out


async def get_replies(c: GraphClient, comment_id: str, limit: int = 25) -> list[dict]:
    body = await c.get(f"{comment_id}/comments", {"limit": limit})
    return body.get("data", [])


async def get_top_commenters(c: GraphClient, posts_limit: int = 10) -> list[dict]:
    """Aggregate most-active commenters across recent posts (fb-mcp parity)."""
    posts = await get_posts(c, limit=posts_limit)
    counts: dict[str, dict] = {}
    for p in posts:
        comments = await get_comments(c, p["id"], limit=100)
        for cm in comments:
            author = cm.get("from", {})
            aid = author.get("id", "?")
            if aid not in counts:
                counts[aid] = {"id": aid, "name": author.get("name", ""), "count": 0}
            counts[aid]["count"] += 1
    return sorted(counts.values(), key=lambda x: -x["count"])


# ── page (fb-mcp: get_page_info, get_page_followers) ────────────────────────

async def get_page_info(c: GraphClient) -> dict:
    return await c.get(c.page_id, {"fields": "id,name,category,fan_count,followers_count,link,verification_status"})


async def get_page_followers(c: GraphClient) -> int:
    body = await c.get(c.page_id, {"fields": "followers_count"})
    return int(body.get("followers_count", 0) or 0)


# ── messaging (fb-mcp: send_dm_to_user) + SmartBot conversations ───────────

async def send_dm_to_user(c: GraphClient, user_id: str, message: str) -> dict:
    return await c.post(f"{c.page_id}/messages", data={
        "recipient": f'{{"id":"{user_id}"}}',
        "message": f'{{"text":"{message}"}}',
        "messaging_type": "RESPONSE",
    })


async def get_conversations(c: GraphClient, limit: int = 25, *, full: bool = False) -> list[dict]:
    if not full:
        body = await c.get(f"{c.page_id}/conversations", {"limit": limit, "fields": "id,updated_time,participants,snippet"})
        return body.get("data", [])
    out: list[dict] = []
    async for page in c.iter_pages(f"{c.page_id}/conversations", {"limit": limit, "fields": "id,updated_time,participants,snippet"}):
        out.extend(page)
    return out


async def get_conversation_messages(c: GraphClient, conversation_id: str, limit: int = 25) -> list[dict]:
    body = await c.get(conversation_id, {"fields": f"messages.limit({limit}){{id,from,message,created_time}}"})
    return (body.get("messages", {}) or {}).get("data", [])


async def send_conversation_message(c: GraphClient, conversation_id: str, message: str) -> dict:
    return await c.post(conversation_id, {"message": message})


# ── ads (SmartBot-only — fb-mcp has nothing) ────────────────────────────────

async def get_ad_accounts(c: GraphClient, user_id: str = "me") -> list[dict]:
    body = await c.get(f"{user_id}/adaccounts", {"fields": "id,account_id,name,currency,account_status"})
    return body.get("data", [])


async def get_campaigns(c: GraphClient, ad_account_id: str, limit: int = 20) -> list[dict]:
    body = await c.get(f"act_{ad_account_id}/campaigns",
                       {"limit": limit, "fields": "id,name,objective,status,daily_budget"})
    return body.get("data", [])


async def get_ads(c: GraphClient, ad_account_id: str, limit: int = 20) -> list[dict]:
    body = await c.get(f"act_{ad_account_id}/ads", {"limit": limit, "fields": "id,name,status,creative"})
    return body.get("data", [])


# ── sentiment: SmartBot keeps its Arabic enhanced_intent (NOT fb-mcp's
#    naive English keyword list) — see fb_dashboard/enhanced_intent.py ──────
