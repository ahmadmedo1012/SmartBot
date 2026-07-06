#! /usr/bin/env python
"""CLI wrapper around just_facebook_mcp MCP server.
Reads creds from env (not hardcoded).
"""
import sys, os, json
import subprocess

# Try reading from settings.local.json
settings_file = os.path.expanduser("~/.claude/settings.local.json")
try:
    with open(settings_file) as f:
        s = json.load(f)
    env = s.get("mcpServers", {}).get("just_facebook_mcp", {}).get("env", {})
    os.environ.setdefault("FACEBOOK_ACCESS_TOKEN", env.get("FACEBOOK_ACCESS_TOKEN", ""))
    os.environ.setdefault("FACEBOOK_PAGE_ID", env.get("FACEBOOK_PAGE_ID", ""))
except (FileNotFoundError, json.JSONDecodeError, KeyError):
    pass

TOKEN = os.environ.get("FACEBOOK_ACCESS_TOKEN", "")
PAGE_ID = os.environ.get("FACEBOOK_PAGE_ID", "")

if not TOKEN or not PAGE_ID:
    print("FACEBOOK_ACCESS_TOKEN and FACEBOOK_PAGE_ID required", file=sys.stderr)
    sys.exit(1)

import just_facebook_mcp.server as srv

action = sys.argv[1] if len(sys.argv) > 1 else "help"

if action == "post":
    msg = sys.argv[2] if len(sys.argv) > 2 else "Test post"
    r = srv.post_to_facebook(msg)
    print(json.dumps(r, indent=2, ensure_ascii=False))
elif action == "posts":
    r = srv.get_page_posts()
    print(json.dumps(r, indent=2, ensure_ascii=False))
elif action == "comments":
    pid = sys.argv[2]
    r = srv.get_post_comments(pid)
    print(json.dumps(r, indent=2, ensure_ascii=False))
elif action == "delete_comment":
    cid = sys.argv[2]
    r = srv.delete_comment(cid)
    print(json.dumps(r, indent=2, ensure_ascii=False))
elif action == "fan_count":
    r = srv.get_page_fan_count()
    print(json.dumps(r, indent=2, ensure_ascii=False))
