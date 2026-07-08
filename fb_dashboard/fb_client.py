"""
Enhanced FB Client — exponential backoff retry, connection pooling.
"""
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

    async def _get_client(self) -> httpx.AsyncClient:
        global _http
        if _http is None:
            limits = httpx.Limits(max_keepalive_connections=10, max_connections=20, keepalive_expiry=30)
            _http = httpx.AsyncClient(timeout=15, limits=limits)
        return _http

    async def _get(self, path: str, params: dict = None) -> dict | None:
        client = await self._get_client()
        p = {"access_token": self.token, **(params or {})}
        try:
            r = await client.get(f"{API_BASE}/{path}", params=p)
            if r.status_code != 200:
                log.error(f"GET err {r.status_code}: {r.text[:200]}")
                return None
            return r.json()
        except httpx.TimeoutException:
            log.error(f"GET timeout: {path}")
            return None
        except Exception as e:
            log.error(f"GET err: {e}")
            return None

    async def _post(self, path: str, data: dict = None, max_retries: int = 3) -> dict | None:
        client = await self._get_client()
        d = {"access_token": self.token, **(data or {})}
        last_err = None
        for attempt in range(max_retries):
            try:
                r = await client.post(f"{API_BASE}/{path}", data=d)
                if r.status_code == 200:
                    return r.json()
                if 400 <= r.status_code < 500:
                    log.error(f"POST {r.status_code} on {path}: {r.text[:200]}")
                    return None
                last_err = f"POST {r.status_code}: {r.text[:200]}"
                log.warning(f"Retryable POST err (attempt {attempt+1}): {last_err}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1.5 ** attempt)  # 1.0, 1.5, 2.25s
            except httpx.TimeoutException:
                last_err = "timeout"
                log.warning(f"POST timeout (attempt {attempt+1}): {path}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1.5 ** attempt)
            except Exception as e:
                last_err = str(e)
                log.warning(f"POST exception (attempt {attempt+1}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1.5 ** attempt)
        log.error(f"POST failed after {max_retries} retries: {last_err}")
        return None

    async def get_page_posts(self, limit: int = 10, after: str = None) -> tuple[list, dict | None]:
        params = {"limit": limit, "fields": "id,message,created_time,likes.summary(true),shares,comments.summary(true)"}
        if after:
            params["after"] = after
        r = await self._get(f"{self.page_id}/posts", params)
        return (r or {}).get("data", []), (r or {}).get("paging")

    async def get_post_comments(self, post_id: str, limit: int = 50) -> list:
        r = await self._get(f"{post_id}/comments", {
            "limit": limit,
            "fields": "id,message,from{name,id},created_time,message_tags",
        })
        return (r or {}).get("data", [])

    async def reply_to_comment(self, comment_id: str, message: str) -> dict | None:
        return await self._post(f"{comment_id}/comments", {"message": message})

    async def send_private_reply(self, comment_id: str, message: str) -> dict | None:
        return await self._post(f"{comment_id}/private_replies", {"message": message})

    async def send_dm(self, user_id: str, message: str) -> dict | None:
        if not user_id or user_id == "None":
            return None
        return await self._post(f"{self.page_id}/messages", {
            "recipient": json.dumps({"id": user_id}),
            "message": json.dumps({"text": message}),
            "messaging_type": "RESPONSE",
        })

    async def get_page_fan_count(self) -> int:
        r = await self._get(f"{self.page_id}", {"fields": "fan_count"})
        return (r or {}).get("fan_count", 0)

    async def close(self):
        global _http
        if _http:
            await _http.aclose()
            _http = None

    def get_commenter_name(self, comment: dict) -> str:
        from_data = comment.get("from", {})
        full = from_data.get("name", "") or ""
        username = from_data.get("username", "") or ""
        if full: return full
        if username: return username
        uid = from_data.get("id", "")
        return f"مستخدم{uid[-4:]}" if uid else "صديقنا"
