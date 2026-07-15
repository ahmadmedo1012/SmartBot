from __future__ import annotations
"""Publisher Engine — Multi-platform content publishing.
Schedule and publish to Facebook, X (Twitter), LinkedIn, Instagram.
"""
import json
import logging
from datetime import datetime
from typing import Any
from sqlalchemy import select, func

from models import ScheduledPost, AnalyticsEvent, BotState

log = logging.getLogger("fb-publisher")

class XPublisher:
    """X (Twitter) API v2 publisher."""

    def __init__(self, api_key: str = "", api_secret: str = "",
                 access_token: str = "", access_secret: str = ""):
        self.api_key = api_key
        self.api_secret = api_secret
        self.access_token = access_token
        self.access_secret = access_secret

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_secret and self.access_token)

    async def publish(self, message: str, image_url: str = "") -> dict | None:
        if not self.is_configured():
            return None
        try:
            import httpx
            headers = {
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
            }
            data = {"text": message}
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    "https://api.twitter.com/2/tweets",
                    headers=headers, json=data
                )
                if r.status_code in (200, 201):
                    result = r.json()
                    return {"platform": "x", "post_id": result.get("data", {}).get("id", "")}
                log.error(f"X API error: {r.status_code} {r.text[:200]}")
        except Exception as e:
            log.error(f"X publish error: {e}")
        return None


class LinkedInPublisher:
    """LinkedIn API publisher."""

    def __init__(self, access_token: str = "", organization_id: str = ""):
        self.access_token = access_token
        self.organization_id = organization_id

    def is_configured(self) -> bool:
        return bool(self.access_token and self.organization_id)

    async def publish(self, message: str, image_url: str = "") -> dict | None:
        if not self.is_configured():
            return None
        try:
            import httpx
            headers = {
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
                "X-Restli-Protocol-Version": "2.0.0",
            }
            data = {
                "author": f"urn:li:organization:{self.organization_id}",
                "lifecycleState": "PUBLISHED",
                "specificContent": {
                    "com.linkedin.ugc.ShareContent": {
                        "shareCommentary": {"text": message},
                        "shareMediaCategory": "NONE",
                    }
                },
                "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
            }
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    "https://api.linkedin.com/v2/ugcPosts",
                    headers=headers, json=data
                )
                if r.status_code in (200, 201):
                    result = r.json()
                    return {"platform": "linkedin", "post_id": result.get("id", "")}
                log.error(f"LinkedIn API error: {r.status_code} {r.text[:200]}")
        except Exception as e:
            log.error(f"LinkedIn publish error: {e}")
        return None


class PublisherEngine:
    """Multi-platform publishing engine."""

    def __init__(self):
        self.x = XPublisher()
        self.linkedin = LinkedInPublisher()

    def load_credentials(self, db_session, tenant_id: int = 0):
        """Load stored credentials from BotState. Pass None to skip DB load."""
        if db_session is None:
            return
        rows = db_session.execute(
            select(BotState).where(BotState.tenant_id == tenant_id, BotState.key.like("publisher_%"))
        ).scalars().all()
        creds = {}
        for row in rows:
            creds[row.key] = row.value
        if creds.get("publisher_x_api_key"):
            self.x = XPublisher(
                api_key=creds.get("publisher_x_api_key", ""),
                api_secret=creds.get("publisher_x_api_secret", ""),
                access_token=creds.get("publisher_x_access_token", ""),
                access_secret=creds.get("publisher_x_access_secret", ""),
            )
        if creds.get("publisher_linkedin_access_token"):
            self.linkedin = LinkedInPublisher(
                access_token=creds.get("publisher_linkedin_access_token", ""),
                organization_id=creds.get("publisher_linkedin_organization_id", ""),
            )

    def get_status(self) -> dict:
        return {
            "facebook": {"configured": True, "platform": "Facebook"},
            "instagram": {"configured": True, "platform": "Instagram (via Facebook)"},
            "x": {"configured": self.x.is_configured(), "platform": "X"},
            "linkedin": {"configured": self.linkedin.is_configured(), "platform": "LinkedIn"},
        }

    async def publish_to_platform(self, platform: str, message: str,
                                   image_url: str = "") -> dict | None:
        if platform == "x":
            return await self.x.publish(message, image_url)
        elif platform == "linkedin":
            return await self.linkedin.publish(message, image_url)
        elif platform == "facebook":
            return None  # Caller uses FBClient.post_to_page
        return None

    def get_platform_settings_template(self, platform: str) -> list[dict]:
        templates = {
            "x": [
                {"key": "api_key", "label": "API Key", "type": "password", "hint": "من Developer Portal"},
                {"key": "api_secret", "label": "API Secret", "type": "password"},
                {"key": "access_token", "label": "Access Token", "type": "password"},
                {"key": "access_secret", "label": "Access Secret", "type": "password"},
            ],
            "linkedin": [
                {"key": "access_token", "label": "Access Token", "type": "password", "hint": "من LinkedIn Developer"},
                {"key": "organization_id", "label": "Organization ID", "type": "text"},
            ],
        }
        return templates.get(platform, [])

    async def save_credentials(self, db_session, platform: str, data: dict, tenant_id: int = 0) -> bool:
        """Save platform credentials to BotState."""
        prefix = f"publisher_{platform}"
        for key, value in data.items():
            existing = await db_session.execute(
                select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == f"{prefix}_{key}")
            )
            row = existing.scalar_one_or_none()
            if row:
                row.value = str(value)
            else:
                db_session.add(BotState(tenant_id=tenant_id, key=f"{prefix}_{key}", value=str(value)))
        await db_session.commit()
        # Reload credentials
        self.load_credentials(db_session, tenant_id=tenant_id)
        return True

    @staticmethod
    def get_platform_display_name(platform: str) -> str:
        names = {
            "facebook": "فيسبوك",
            "instagram": "إنستغرام",
            "x": "X (تويتر)",
            "linkedin": "لينكد إن",
        }
        return names.get(platform, platform)
