#!/bin/bash
# Reads creds from .claude/settings.local.json and runs a helper script
cd /home/ahmed/Downloads/FacebookPage
SETTINGS=".claude/settings.local.json"

TOKEN=$(python3 -c "import json; print(json.load(open('$SETTINGS'))['mcpServers']['just_facebook_mcp']['env']['FACEBOOK_ACCESS_TOKEN'])")
PAGE_ID=$(python3 -c "import json; print(json.load(open('$SETTINGS'))['mcpServers']['just_facebook_mcp']['env']['FACEBOOK_PAGE_ID'])")

export FACEBOOK_ACCESS_TOKEN="$TOKEN"
export FACEBOOK_PAGE_ID="$PAGE_ID"

cd /tmp/just_facebook_mcp
.venv/bin/python -c "
import sys
sys.path.insert(0, '.')
import json, os
os.environ['FACEBOOK_ACCESS_TOKEN'] = '$TOKEN'
os.environ['FACEBOOK_PAGE_ID'] = '$PAGE_ID'
import just_facebook_mcp.server as srv

action = sys.argv[1] if len(sys.argv) > 1 else 'help'

if action == 'post':
    msg = ' '.join(sys.argv[2:]) if len(sys.argv) > 2 else 'Test'
    r = srv.post_to_facebook(msg)
    print(json.dumps(r, indent=2, ensure_ascii=False))
elif action == 'posts':
    r = srv.get_page_posts()
    print(json.dumps(r, indent=2, ensure_ascii=False))
elif action == 'comments':
    pid = sys.argv[2]
    r = srv.get_post_comments(pid)
    print(json.dumps(r, indent=2, ensure_ascii=False))
elif action == 'delete_comment':
    cid = sys.argv[2]
    r = srv.delete_comment(cid)
    print(json.dumps(r, indent=2, ensure_ascii=False))
elif action == 'fan_count':
    r = srv.get_page_fan_count()
    print(json.dumps(r, indent=2, ensure_ascii=False))
elif action == 'likes':
    pid = sys.argv[2]
    r = srv.get_number_of_likes(pid)
    print(json.dumps(r, indent=2, ensure_ascii=False))
else:
    print('Usage: bash just_facebook_mcp.sh <post|posts|comments|delete_comment|fan_count|likes> [args]')
"
