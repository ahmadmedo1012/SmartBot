"""Facebook MCP Engine — tenant-aware async Graph API layer (Track G).

Isolation contract (latest_plan.md §Track G.1):
- NOTHING in the live app imports this package yet. `fb_client.py` stays
  untouched until the comparative tests (test_track_g_engine.py) and a
  staging deployment prove parity.
- Every function is tenant-aware BY CONSTRUCTION: a GraphClient instance
  is bound to ONE (tenant_id, encrypted-token, page_id) triple — no
  module-level globals, no shared state.
- Covers the facebook-mcp-server tool contract (~34 tools) PLUS the
  SmartBot gaps it never had: conversations, ads, full pagination.
"""
from facebook_engine.client import GraphClient, GraphAPIError
from facebook_engine import tools

__all__ = ["GraphClient", "GraphAPIError", "tools"]
