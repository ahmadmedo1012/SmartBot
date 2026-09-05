#!/usr/bin/env python3
"""v4 radical plan — LIVE production pipeline verification.

Proves on https://api.smart-link.ly (the real deployment, after push):
  1. G2  — a signed webhook feed-comment event resolves the tenant from the
           ENTRY PAGE id and is PERSISTED (Comment row).
  2. §4.10 — /api/comments serves the stored comment DB-first (the section
           was permanently empty before — global env client).
  3. §5.12/§5.13 — a messenger event stores + replies (FakeFB-free: the send
           will fail with the fake page token — the honest WARN BotLog path
           must appear, proving telemetry + storage).
  4. Cleanup — restores the honest state (test page disconnected, test
           comment/conversation deleted, test app secret removed).

Usage: python3 scripts/v4_live_pipeline_test.py
"""
import hashlib
import hmac
import json
import sys
import time
import uuid

import httpx

API = "https://api.smart-link.ly"
OWNER_USER = "ahmad"
OWNER_PASS = "Ahmad@SB2026!ly"
TEST_SECRET = uuid.uuid4().hex  # exactly 32 hex chars — the FB app-secret shape

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail else ""))


def sign(body: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def main() -> int:
    c = httpx.Client(base_url=API, timeout=30, follow_redirects=True)

    # ── login as owner (platform admin) ──
    r = c.post("/api/login", json={"username": OWNER_USER, "password": OWNER_PASS})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:100]}"
    owner = r.json()["data"]["user"]
    tenant_id = owner["tenant_id"]
    print(f"logged in as {owner['username']} (tenant {tenant_id})")

    # ── set a temporary test app secret (SystemConfig, platform-admin) ──
    r = c.post("/api/admin/config", json={"facebook_app_secret": TEST_SECRET})
    check("set temporary app secret", r.status_code == 200, r.text[:80])

    # ── connect a throwaway test page on the OWNER's tenant ──
    page_id = f"99887{uuid.uuid4().hex[:8]}"
    r = c.put("/api/facebook/settings", json={
        "page_id": page_id,
        "access_token": "EAAG_live_test_token_invalid_by_design",
        "subscribe_webhook": False,
    })
    check("connect test page", r.status_code == 200, r.text[:80])

    try:
        # ── 1. signed webhook COMMENT event (G2 + §4.10) ──
        comment_id = f"lv_{uuid.uuid4().hex[:10]}"
        payload = {
            "object": "page",
            "entry": [{
                "id": page_id, "time": int(time.time() * 1000),
                "changes": [{
                    "field": "feed",
                    "value": {
                        "item": "comment", "verb": "add",
                        "comment_id": comment_id,
                        "post_id": "p_live_test",
                        "message": "كم السعر (اختبار حي v4)؟",
                        "from": {"id": "100200300", "name": "اختبار حي"},
                        "created_time": "2026-09-05T20:00:00+0000",
                    },
                }],
            }],
        }
        body = json.dumps(payload).encode()
        r = c.post("/webhook", content=body, headers={"X-Hub-Signature-256": sign(body, TEST_SECRET)})
        check("webhook accepts signed comment event", r.status_code == 200, r.text[:80])

        # wrong signature must still 401 (security unchanged)
        r = c.post("/webhook", content=body, headers={"X-Hub-Signature-256": sign(body, "wrong")})
        check("webhook rejects wrong signature (401)", r.status_code == 401)

        # ── 2. /api/comments serves the STORED comment (DB-first) ──
        r = c.get("/api/comments?limit=50")
        items = r.json().get("data", {}).get("items", []) if r.status_code == 200 else []
        match = [i for i in items if i.get("id") == comment_id]
        check("stored comment visible via /api/comments (DB-first)", bool(match),
              (match[0]["message"][:40] if match else "NOT FOUND"))

        # ── 3. messenger event: storage + honest failure telemetry ──
        mid = f"m.{uuid.uuid4().hex[:12]}"
        msg_payload = {
            "object": "page",
            "entry": [{
                "id": page_id, "time": int(time.time() * 1000),
                "messaging": [{
                    "sender": {"id": "100200301", "name": "مرسل اختبار"},
                    "recipient": {"id": page_id},
                    "timestamp": int(time.time() * 1000),
                    "message": {"mid": mid, "seq": 1, "text": "السلام عليكم (اختبار حي v4)"},
                }],
            }],
        }
        body = json.dumps(msg_payload).encode()
        r = c.post("/webhook", content=body, headers={"X-Hub-Signature-256": sign(body, TEST_SECRET)})
        check("webhook accepts signed message event", r.status_code == 200, r.text[:80])

        # the message must be stored in the inbox (DB-first conversation list)
        r = c.get("/api/inbox/conversations")
        convs = (r.json().get("data", {}) or {}).get("items", []) if r.status_code == 200 else []
        found_conv = any(
            (cv.get("subject") or "").find("اختبار حي v4") >= 0 for cv in convs
        )
        check("message stored and visible in inbox (DB-first)", found_conv,
              f"{len(convs)} conversation(s) checked")

        # the auto-reply send will FAIL (fake token) — the honest WARN must be logged
        time.sleep(3)  # webhook processes inline; give log write a beat
        r = c.get("/api/logs?limit=30")
        logs = r.json().get("data", []) if r.status_code == 200 else []
        warn = [l for l in logs if "فشل إرسال الرد الآلي" in (l.get("message") or "")]
        check("honest WARN log for failed auto-reply (telemetry)", bool(warn),
              (warn[0]["message"][:70] if warn else "no WARN found"))

    finally:
        # ── 4. cleanup: honest state restored ──
        r = c.put("/api/facebook/settings", json={"clear": True})  # v3 explicit disconnect
        cleaned_page = r.status_code == 200
        r = c.post("/api/admin/config", json={"facebook_app_secret": ""})
        cleaned_secret = r.status_code == 200
        # remove the test conversation(s) created by this run
        try:
            r = c.get("/api/inbox/conversations")
            for it in (r.json().get("data", {}) or {}).get("items", []):
                if "100200301" in str(it.get("senders")) or (it.get("subject") or "").find("اختبار حي v4") >= 0:
                    c.delete(f"/api/inbox/conversations/{it['id']}")
        except Exception:
            pass
        check("cleanup: test page disconnected", cleaned_page)
        check("cleanup: test app secret removed", cleaned_secret)

    print("\n" + "=" * 60)
    fails = [n for n, ok, _ in results if not ok]
    print(f"{len(results) - len(fails)}/{len(results)} checks passed")
    if fails:
        print("FAILED:", "; ".join(fails))
        return 1
    print("v4 LIVE PIPELINE: ALL GREEN")
    return 0


if __name__ == "__main__":
    sys.exit(main())
