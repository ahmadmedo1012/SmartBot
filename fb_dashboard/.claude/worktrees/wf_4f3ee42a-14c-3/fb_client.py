import asyncio
import json
import httpx
import logging
from typing import Any

log = logging.getLogger("fb-client")

API_BASE = "https://graph.facebook.com/v22.0"
_http: httpx.AsyncClient | None = None


class FBClient:
    def __init__(self, token: str, page_id: str):
        self.token = token
        self.page_id = page_id

    async def _get(self, path: str, params: dict = None) -> dict | None:
        global _http
        if _http is None:
            _http = httpx.AsyncClient(timeout=15)
        p = {"access_token": self.token, **(params or {})}
        r = await _http.get(f"{API_BASE}/{path}", params=p)
        if r.status_code != 200:
            log.error(f"GET err {r.status_code}: {r.text[:200]}")
            return None
        return r.json()

    async def _post(self, path: str, data: dict = None) -> dict | None:
        global _http
        if _http is None:
            _http = httpx.AsyncClient(timeout=15)
        d = {"access_token": self.token, **(data or {})}
        last_err = None
        for attempt in range(2):  # ponytail: 2 retries; exponential backoff for higher throughput needs
            try:
                r = await _http.post(f"{API_BASE}/{path}", data=d)
                if r.status_code == 200:
                    return r.json()
                # 4xx = unrecoverable (bad token, bad perms), don't retry
                if 400 <= r.status_code < 500:
                    log.error(f"POST {r.status_code} on {path}: {r.text[:200]}")
                    return None
                last_err = f"POST {r.status_code}: {r.text[:200]}"
                log.warning(f"Retryable POST err: {last_err}")
                await asyncio.sleep(1)
            except Exception as e:
                last_err = str(e)
                log.warning(f"Retryable POST exception: {e}")
                await asyncio.sleep(1)
        log.error(f"POST failed after retries: {last_err}")
        return None

    async def get_page_posts(self, limit: int = 10, after: str = None) -> tuple[list, dict | None]:
        params = {
            "limit": limit,
            "fields": "id,message,created_time,likes.summary(true),shares,comments.summary(true)",
        }
        if after:
            params["after"] = after
        r = await self._get(f"{self.page_id}/posts", params)
        return (r or {}).get("data", []), (r or {}).get("paging")

    async def get_post_comments(self, post_id: str, limit: int = 50) -> list:
        r = await self._get(f"{post_id}/comments", {
            "limit": limit,
            # ponytail: username deprecated in v2.0+, removed to avoid 400 error
            "fields": "id,message,from{name,id},created_time,message_tags",
        })
        return (r or {}).get("data", [])

    async def get_recent_comments(self, limit: int = 50) -> list:
        """Get recent comments across all page posts."""
        posts, _ = await self.get_page_posts(10)
        all_comments = []
        for p in posts:
            comments = await self.get_post_comments(p["id"], limit // max(len(posts), 1))
            for c in comments:
                c["_post_id"] = p["id"]  # tag post_id for tracking
            all_comments.extend(comments)
        return all_comments

    async def reply_to_comment(self, comment_id: str, message: str) -> dict | None:
        return await self._post(f"{comment_id}/comments", {"message": message})

    async def post_to_page(self, message: str) -> dict | None:
        return await self._post(f"{self.page_id}/feed", {"message": message})

    async def delete_comment(self, comment_id: str) -> dict | None:
        return await self._post(f"{comment_id}", {"method": "delete"})

    async def get_page_fan_count(self) -> int:
        r = await self._get(f"{self.page_id}", {"fields": "fan_count"})
        return (r or {}).get("fan_count", 0)

    async def delete_post(self, post_id: str) -> dict | None:
        return await self._post(f"{post_id}", {"method": "delete"})

    async def get_post_detail(self, post_id: str) -> dict | None:
        fields = "id,message,created_time,permalink_url,comments.limit(10){id,message,from{name,id},created_time}"
        return await self._get(f"{post_id}", {"fields": fields})

    async def get_conversations(self, limit: int = 25) -> list:
        r = await self._get(f"{self.page_id}/conversations", {
            "limit": limit, "fields": "id,link,message_count,unread_count,senders,updated_time,subject"
        })
        return (r or {}).get("data", [])

    async def get_conversation_messages(self, conversation_id: str, limit: int = 50) -> list:
        r = await self._get(f"{conversation_id}/messages", {
            "limit": limit, "fields": "id,message,from{name,id},created_time"
        })
        return (r or {}).get("data", [])

    async def get_post_insights(self, post_id: str) -> dict:
        r = await self._get(f"{post_id}/insights", {
            "metric": "impressions,reach,engaged_users"
        })
        return r or {}

    async def get_ad_accounts(self) -> list:
        """Get ad accounts the user has access to."""
        r = await self._get("me/adaccounts", {"fields": "id,name,account_status,currency,amount_spent,balance"})
        return (r or {}).get("data", [])

    async def get_campaigns(self, ad_account_id: str, limit: int = 20) -> list:
        """Get campaigns for an ad account."""
        fields = "id,name,status,objective,created_time,adsets{name,status,daily_budget,lifetime_budget,start_time,end_time}"
        r = await self._get(f"act_{ad_account_id}/campaigns", {
            "limit": limit, "fields": fields,
        })
        return (r or {}).get("data", [])

    async def get_ads(self, ad_account_id: str, limit: int = 20) -> list:
        """Get ads/creatives for an ad account."""
        fields = "id,name,status,adset_id,campaign_id,creative{id,title,body,image_url,object_story_spec},insights{impressions,clicks,spend,ctr,cpc}"
        r = await self._get(f"act_{ad_account_id}/ads", {"limit": limit, "fields": fields})
        return (r or {}).get("data", [])

    def get_commenter_name(self, comment: dict) -> str:
        """Extract best available name with fallback chain: name -> username -> id."""
        from_data = comment.get("from", {})
        full = from_data.get("name", "") or ""
        username = from_data.get("username", "") or ""

        if full:
            return full
        if username:
            return username
        uid = from_data.get("id", "")
        if uid:
            return f"مستخدم{uid[-4:]}"
        return "صديقنا"

    def get_first_name(self, comment: dict) -> str:
        """Extract first name with fallback chain."""
        return self.get_commenter_name(comment).split()[0]

    def get_full_name(self, comment: dict) -> str:
        """Get full name or best available identifier."""
        return self.get_commenter_name(comment)

    def get_commenter_id(self, comment: dict) -> str:
        """Get commenter's Facebook user ID."""
        return str(comment.get("from", {}).get("id", ""))

    async def send_private_reply(self, comment_id: str, message: str) -> dict | None:
        """Send private reply to a comment via POST /{comment_id}/private_replies.
        Works for ANY commenter — no prior Messenger conversation needed.
        Requires read_page_mailboxes permission."""
        return await self._post(f"{comment_id}/private_replies", {
            "message": message,
        })

    async def send_dm(self, user_id: str, message: str) -> dict | None:
        """Send a private message via Facebook Messenger.
        NOTE: Requires pages_messaging permission on the Page Access Token.
        Contact: generate token at https://developers.facebook.com/tools/accesstoken
        with pages_messaging and pages_manage_engagement scopes."""
        if not user_id or user_id == "None":
            return None
        return await self._post(f"{self.page_id}/messages", {
            "recipient": json.dumps({"id": user_id}),
            "message": json.dumps({"text": message}),
            "messaging_type": "MESSAGE_TAG", "tag": "CUSTOMER_FEEDBACK",
        })

    async def close(self):
        global _http
        if _http:
            await _http.aclose()
            _http = None
