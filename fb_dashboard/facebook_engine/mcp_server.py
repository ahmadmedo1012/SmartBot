"""MCP server over the facebook_engine tools (Track G.2/G.3 — ISOLATED).

Run standalone (NOT wired into the live app):

    python -m fb_dashboard.facebook_engine.mcp_server --port 8100

Transport: streamable-http (cloud-compatible; stdio is Claude-Desktop-only
and cannot live inside a serverless function). Lazy `mcp` import — the
main app never requires this module or the `mcp` package at runtime.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from facebook_engine import tools  # noqa: E402
from facebook_engine.client import GraphClient, GraphAPIError  # noqa: E402


def build_server(tenant_id: int, access_token: str, page_id: str):
    """Create the FastMCP server bound to ONE tenant (multi-tenancy by construction)."""
    try:
        from mcp.server.fastmcp import FastMCP
    except ImportError as e:  # pragma: no cover
        raise SystemExit(
            "The `mcp` package is required for the standalone MCP server only:\n"
            "  pip install mcp\n(The SmartBot app itself does NOT need it.)"
        ) from e

    mcp = FastMCP("smartbot-facebook", instructions=(
        "SmartBot Facebook tools — tenant-scoped. One server process serves "
        "one (tenant, page). Multi-tenant deployments run one server per "
        "tenant or front this with a tenant router."
    ))

    def client() -> GraphClient:
        return GraphClient(tenant_id, access_token, page_id)

    # ── posts ──
    mcp.tool()(lambda message, link=None: asyncio.run(
        tools.publish_post(client(), message, link)))  # type: ignore[misc]

    @mcp.tool()
    async def get_posts(limit: int = 25, full: bool = False) -> list[dict]:
        """List page posts; full=True follows ALL pagination pages."""
        return await tools.get_posts(client(), limit, full=full)

    @mcp.tool()
    async def get_comments(post_id: str, limit: int = 25, full: bool = False) -> list[dict]:
        """Comments on a post; full=True follows ALL pagination pages."""
        return await tools.get_comments(client(), post_id, limit, full=full)

    @mcp.tool()
    async def get_post_insights(post_id: str) -> dict:
        """Full insights: impressions, engaged, clicks, reactions by type, shares."""
        return await tools.get_post_insights(client(), post_id)

    @mcp.tool()
    async def reply_to_comment(comment_id: str, message: str) -> dict:
        return await tools.reply_to_comment(client(), comment_id, message)

    @mcp.tool()
    async def hide_comment(comment_id: str) -> dict:
        return await tools.hide_comment(client(), comment_id, True)

    @mcp.tool()
    async def unhide_comment(comment_id: str) -> dict:
        return await tools.unhide_comment(client(), comment_id)

    @mcp.tool()
    async def hide_comments_bulk(comment_ids: list[str]) -> dict:
        return await tools.hide_comments_bulk(client(), comment_ids)

    @mcp.tool()
    async def delete_comment(comment_id: str) -> dict:
        return await tools.delete_comment(client(), comment_id)

    @mcp.tool()
    async def get_top_commenters(posts_limit: int = 10) -> list[dict]:
        return await tools.get_top_commenters(client(), posts_limit)

    @mcp.tool()
    async def get_page_info() -> dict:
        return await tools.get_page_info(client())

    @mcp.tool()
    async def get_page_followers() -> int:
        return await tools.get_page_followers(client())

    @mcp.tool()
    async def send_dm_to_user(user_id: str, message: str) -> dict:
        return await tools.send_dm_to_user(client(), user_id, message)

    @mcp.tool()
    async def get_conversations(limit: int = 25) -> list[dict]:
        return await tools.get_conversations(client(), limit)

    @mcp.tool()
    async def get_conversation_messages(conversation_id: str, limit: int = 25) -> list[dict]:
        return await tools.get_conversation_messages(client(), conversation_id, limit)

    @mcp.tool()
    async def get_ad_accounts() -> list[dict]:
        return await tools.get_ad_accounts(client())

    @mcp.tool()
    async def get_campaigns(ad_account_id: str, limit: int = 20) -> list[dict]:
        return await tools.get_campaigns(client(), ad_account_id, limit)

    @mcp.tool()
    async def get_ads(ad_account_id: str, limit: int = 20) -> list[dict]:
        return await tools.get_ads(client(), ad_account_id, limit)

    return mcp


def main() -> None:
    ap = argparse.ArgumentParser(description="SmartBot tenant-scoped Facebook MCP server")
    ap.add_argument("--tenant-id", type=int, required=True)
    ap.add_argument("--access-token", default=os.getenv("FACEBOOK_ACCESS_TOKEN", ""))
    ap.add_argument("--page-id", default=os.getenv("FACEBOOK_PAGE_ID", ""))
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8100)
    args = ap.parse_args()

    mcp = build_server(args.tenant_id, args.access_token, args.page_id)
    print(f"SmartBot Facebook MCP (tenant {args.tenant_id}, page {args.page_id}) "
          f"→ http://{args.host}:{args.port}/mcp", flush=True)
    mcp.run(transport="streamable-http", host=args.host, port=args.port)


if __name__ == "__main__":
    main()
