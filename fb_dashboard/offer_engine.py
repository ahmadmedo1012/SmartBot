from __future__ import annotations
"""
Smart offer engine — selects best offer based on user context.
"""
import logging
from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger("fb-offer")


class OfferEngine:
    """
    Intelligent offer selection:
    - New users get welcome/coupon offers
    - Returning users get remaining stock/limited-time offers
    - Users who already received an offer don't get repeated
    """

    def __init__(self):
        self._delivered: dict[str, set[int]] = {}  # user_id -> set of offer_ids

    def mark_delivered(self, user_id: str, offer_id: int):
        self._delivered.setdefault(user_id, set()).add(offer_id)

    def has_received(self, user_id: str, offer_id: int) -> bool:
        return offer_id in self._delivered.get(user_id, set())

    async def get_best_offer(
        self,
        session: AsyncSession,
        user_id: str | None = None,
        intent: str = "",
        tenant_id: int = 0,
    ) -> dict | None:
        """Get the best offer for given context."""
        from models import Offer
        try:
            stmt = select(Offer).where(Offer.is_active == True)
            if tenant_id:
                stmt = stmt.where(Offer.tenant_id == tenant_id)
            result = await session.execute(stmt)
            offers = result.scalars().all()
        except Exception:
            return None

        if not offers:
            return None

        # Filter already delivered
        if user_id:
            delivered = self._delivered.get(user_id, set())
            offers = [o for o in offers if o.id not in delivered]

        if not offers:
            return None

        # Pick first active offer (simplest strategy)
        # ponytail: single-offer selection. Multi-offer A/B testing when >5 offers.
        best = offers[0]
        return {
            "id": best.id,
            "title": best.title or "",
            "code": best.code or "",
            "description": best.description or "",
        }

    def format_offer_text(self, offer: dict | None) -> str:
        if not offer:
            return ""
        tpl = f"\n\n🎁 {offer['title']}"
        if offer.get("code"):
            tpl += f" | كود الخصم: {offer['code']}"
        return tpl
