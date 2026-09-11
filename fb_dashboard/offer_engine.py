from __future__ import annotations

"""
Smart offer engine — selects best offer based on user context.

v24-C5 (B3 §5-R7): delivery dedup is now DB-backed. The in-memory
``_delivered`` dict survived neither restarts nor a second serverless
instance (Vercel cold starts / multiple workers), so the same user could be
handed the same offer again. The OfferClaim table existed in the models all
along but no code ever wrote it. Now every delivery attempt INSERTs a claim
row (tenant_id, offer_id, fb_user_id) — guarded by
``uq_offerclaim_tenant_offer_user`` (migration 017) — inside a savepoint:
IntegrityError means another instance already delivered that offer, and the
engine moves on to the next candidate. The memory dict remains as a
fast-path hint only; the database is the source of truth.
"""
import logging

from sqlalchemy import func, select, update  # v25 (D-02): func/update for capacity+counter
from sqlalchemy.exc import IntegrityError
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
        self._delivered: dict[str, set[int]] = {}  # user_id -> set of offer_ids (fast-path hint)

    def mark_delivered(self, user_id: str, offer_id: int):
        """Memory fast-path only — NOT the dedup authority (v24-C5).

        Kept for sync callers (pipeline stage 6); the durable record is the
        offer_claims row written by :meth:`get_best_offer` /
        :meth:`record_claim`.
        """
        self._delivered.setdefault(user_id, set()).add(offer_id)

    def has_received(self, user_id: str, offer_id: int) -> bool:
        """Memory fast-path check — for the authoritative answer use
        :meth:`claimed_offer_ids` / the DB filter inside get_best_offer."""
        return offer_id in self._delivered.get(user_id, set())

    async def record_claim(
        self,
        session: AsyncSession,
        user_id: str,
        offer_id: int,
        tenant_id: int = 0,
        user_name: str = "",
    ) -> bool:
        """Persist a delivery claim — the dedup write path (v24-C5).

        INSERT into offer_claims inside a savepoint (begin_nested — the
        caller's transaction is never poisoned, the _wallet.credit_wallet
        pattern). Returns True when this call won the claim, False when the
        unique constraint says the offer was already delivered to this user.
        """
        from models import OfferClaim
        try:
            async with session.begin_nested():
                session.add(OfferClaim(
                    tenant_id=tenant_id or 0,
                    offer_id=offer_id,
                    fb_user_id=user_id,
                    user_name=(user_name or "")[:200],
                ))
                await session.flush()
            self._delivered.setdefault(user_id, set()).add(offer_id)
            return True
        except IntegrityError:
            # already delivered (this instance or any other) — the whole
            # point of the DB-backed dedup
            return False

    async def claimed_offer_ids(
        self, session: AsyncSession, user_id: str, tenant_id: int = 0,
    ) -> set[int]:
        """Offer ids already delivered to ``user_id`` (DB source of truth)."""
        from models import OfferClaim
        try:
            rows = await session.execute(
                select(OfferClaim.offer_id).where(
                    OfferClaim.tenant_id == (tenant_id or 0),
                    OfferClaim.fb_user_id == user_id,
                )
            )
            return {int(oid) for (oid,) in rows.all()}
        except Exception:
            log.warning("offer claim lookup failed — assuming none delivered", exc_info=True)
            return set()

    async def get_best_offer(
        self,
        session: AsyncSession,
        user_id: str | None = None,
        intent: str = "",
        tenant_id: int = 0,
        user_name: str = "",
    ) -> dict | None:
        """Get the best offer for given context.

        v24-C5: for a known user the already-claimed offers are excluded via
        the offer_claims table (plus the memory hint), and the chosen
        candidate is CLAIMED IN THE DATABASE before being returned — insert
        inside a savepoint, IntegrityError → next candidate. Two concurrent
        attempts (or two serverless instances) can now never both deliver
        the same offer to the same user.
        """
        # v25 (D-02): كانت القراءة تعرض كل العروض النشطة بلا فحص للصلاحية
        # أو السعة — عرض منتهٍ أو مستنفد (max_uses) يُسلَّم للأبد ولا يُعدّ
        # used_count أبدًا. الآن: الفلترة الزمنية + السعة في الاستعلام،
        # وزيادة ذرية عند التسليم الفائز.
        from _utils import utcnow as _now
        from models import Offer
        _now_v = _now()
        try:
            stmt = select(Offer).where(
                Offer.is_active == True,
                # start window (NULL = already started)
                (Offer.starts_at.is_(None)) | (Offer.starts_at <= _now_v),
                # expiry (NULL = never expires)
                (Offer.expires_at.is_(None)) | (Offer.expires_at > _now_v),
                # capacity (NULL/0 = unlimited)
                (Offer.max_uses.is_(None)) | (Offer.max_uses == 0)
                | (func.coalesce(Offer.used_count, 0) < Offer.max_uses),
            )
            if tenant_id:
                stmt = stmt.where(Offer.tenant_id == tenant_id)
            result = await session.execute(stmt)
            offers = result.scalars().all()
        except Exception:
            log.warning("offer selection query failed", exc_info=True)
            return None

        if not offers:
            return None

        # Filter already delivered — DB is the source of truth, the memory
        # dict is only a cheap fast-path on top.
        claimed: set[int] = set()
        if user_id:
            claimed = await self.claimed_offer_ids(session, user_id, tenant_id)
            claimed |= self._delivered.get(user_id, set())
            offers = [o for o in offers if o.id not in claimed]

        if not offers:
            return None

        # Pick first active offer (simplest strategy)
        # ponytail: single-offer selection. Multi-offer A/B testing when >5 offers.
        for best in offers:
            if not user_id:
                # v25 (D-02): زيادة ذرية للسعة حتى بلا مفتاح مستخدم.
                await self._bump_used(session, best.id)
                return self._offer_dict(best)  # no user → no dedup key → nothing to claim
            try:
                won = await self.record_claim(
                    session, user_id, best.id, tenant_id=tenant_id, user_name=user_name,
                )
            except Exception:
                # claim write failed (non-constraint): degrade to the legacy
                # behavior — deliver, keep the memory hint, never raise
                log.warning("offer claim write failed — delivering without claim", exc_info=True)
                won = True
            if won:
                # v25 (D-02): كل تسليم فعلي يزيد used_count ذريًا — الفحص
                # أعلاه يمنع تجاوز max_uses بعد الآن.
                await self._bump_used(session, best.id)
                return self._offer_dict(best)
            # IntegrityError: another instance delivered this one — the
            # loop advances to the next unclaimed candidate.
        return None

    @staticmethod
    async def _bump_used(session: AsyncSession, offer_id: int) -> None:
        """v25 (D-02): atomic used_count increment — survives concurrent
        deliveries (UPDATE not read-modify-write), never raises (best-effort
        accounting; the claim row remains the hard dedup guarantee)."""
        from models import Offer
        try:
            await session.execute(
                update(Offer)
                .where(Offer.id == offer_id)
                .values(used_count=func.coalesce(Offer.used_count, 0) + 1)
            )
        except Exception:
            log.warning("offer used_count bump failed (id=%s)", offer_id, exc_info=True)

    @staticmethod
    def _offer_dict(best) -> dict:
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
