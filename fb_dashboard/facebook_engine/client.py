"""Async tenant-scoped Graph API client with production resilience.

What this fixes vs the two ancestors:
- vs fb_client.py  : retry/backoff, rate-limit respect, normalized errors,
                     FULL pagination (follows paging.next — old client
                     stopped at page 1 / 25 items)
- vs facebook-mcp-server: async (httpx), per-tenant instances, real error
                     handling (the upstream returns response.json() even
                     on 4xx/5xx), Arabic-aware design
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, AsyncIterator

import httpx

log = logging.getLogger("fb-engine")

GRAPH = "https://graph.facebook.com/v22.0"
_MAX_RETRIES = 3
_RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class GraphAPIError(Exception):
    """Normalized Graph API failure — carries the HTTP status + FB error payload."""

    def __init__(self, status: int, fb_error: dict | None):
        self.status = status
        self.fb_error = fb_error or {}
        self.code = self.fb_error.get("code")
        self.message = self.fb_error.get("message", f"Graph API HTTP {status}")
        super().__init__(f"[{status}/{self.code}] {self.message}")


class GraphClient:
    """One client = one tenant's page. Thread-safe, reusable, stateless between calls."""

    def __init__(self, tenant_id: int, access_token: str, page_id: str, *, timeout: float = 15.0):
        self.tenant_id = tenant_id
        self.access_token = access_token
        self.page_id = page_id
        self._http = httpx.AsyncClient(
            base_url=GRAPH,
            timeout=timeout,
            headers={"Accept": "application/json"},
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    # ── low-level with retry + rate-limit respect ──────────────────────────
    async def _request(self, method: str, path: str, *, params: dict | None = None,
                       data: dict | None = None, files=None) -> Any:
        params = dict(params or {})
        params.setdefault("access_token", self.access_token)
        backoff = 1.0
        last_exc: Exception | None = None
        for attempt in range(_MAX_RETRIES + 1):
            try:
                resp = await self._http.request(method, path, params=params, data=data, files=files)
            except httpx.HTTPError as e:  # network layer
                last_exc = e
                if attempt == _MAX_RETRIES:
                    raise GraphAPIError(0, {"message": f"network: {e}"}) from e
                await asyncio.sleep(backoff)
                backoff *= 2
                continue

            if resp.status_code in _RETRYABLE_STATUS and attempt < _MAX_RETRIES:
                # honor FB rate-limit guidance when present
                retry_after = resp.headers.get("x-business-use-case-usage") or resp.headers.get("Retry-After")
                wait = backoff
                if retry_after:
                    try:
                        import json as _json
                        wait = max(wait, float(_json.loads(retry_after).get("call_count", 0)) / 100.0)
                    except Exception:
                        pass
                log.warning("graph %s %s → %s (attempt %d), retrying in %.1fs",
                            method, path, resp.status_code, attempt + 1, wait)
                await asyncio.sleep(wait)
                backoff *= 2
                continue

            if resp.status_code >= 400:
                fb_error = None
                try:
                    body = resp.json()
                    fb_error = body.get("error") if isinstance(body, dict) else None
                except Exception:
                    pass
                raise GraphAPIError(resp.status_code, fb_error)

            if resp.status_code == 204 or not resp.content:
                return {}
            return resp.json()

        raise last_exc or GraphAPIError(0, {"message": "unreachable"})

    async def get(self, path: str, params: dict | None = None) -> Any:
        return await self._request("GET", path, params=params)

    async def post(self, path: str, data: dict | None = None, files=None) -> Any:
        return await self._request("POST", path, data=data, files=files)

    async def delete(self, path: str) -> Any:
        return await self._request("DELETE", path)

    # ── FULL pagination (the fb-mcp-server gap) ────────────────────────────
    async def iter_pages(self, path: str, params: dict | None = None,
                         *, max_items: int = 500) -> AsyncIterator[list[dict]]:
        """Yield each page of `data`; follows paging.next until exhausted."""
        from urllib.parse import urlsplit, parse_qsl

        params = dict(params or {})
        url = path
        count = 0
        while url and count < max_items:
            if url.startswith("http"):  # absolute paging.next URL
                u = urlsplit(url)
                rel = u.path
                # strip the graph version segment — base_url already carries it
                parts = rel.split("/", 2)
                if len(parts) == 3 and parts[1] == GRAPH.rsplit("/", 1)[-1]:
                    rel = "/" + parts[2]
                next_params = dict(parse_qsl(u.query))
                body = await self.get(rel, next_params)
            else:
                body = await self.get(url, params)
            data = body.get("data", []) if isinstance(body, dict) else []
            if not data:
                return
            yield data
            count += len(data)
            paging = body.get("paging", {}) if isinstance(body, dict) else {}
            nxt = paging.get("next")
            url = nxt if nxt else None
