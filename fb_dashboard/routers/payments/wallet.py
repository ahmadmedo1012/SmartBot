"""Wallet payment routes: topup, confirm, balance, history.

v13-L4: split out of the former 594-line ``routers/payments.py`` monolith —
endpoint bodies moved VERBATIM. This module also owns the shared payment
helpers (``_payment_rate_limit`` / ``_reject_wallet_above_cap`` / wallet-cap
constants / ``_notify_admins_inline``) which ``bank.py`` and ``plans.py``
import.
"""
import asyncio
import logging

from _responses import ok
from _utils import iso_z
from config import settings
from database import AsyncSessionLocal, get_db
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from models import PaymentRequest, User
from sqlalchemy import desc, select
from telegram_bot import notify_admins_new_payment

from routers.auth import get_current_user

log = logging.getLogger("fb-api")
router = APIRouter(tags=["payments"])


# v14-E1 #3: money-approval notifications are sent INLINE (awaited BEFORE the
# payment response leaves). spawn()ed tasks die on Vercel serverless once the
# function's response is returned — the platform's payment/topup/subscription
# requests could silently never reach Telegram there. The short timeout keeps
# a degraded Telegram from holding the user's payment response hostage.
_ADMIN_NOTIFY_TIMEOUT_S = 8.0


async def _notify_admins_inline(coro, *, timeout: float = _ADMIN_NOTIFY_TIMEOUT_S) -> None:
    """Await an admin money-notification inline, capped by a short timeout.

    Delivery semantics (v14-E1, replaces spawn() for money notifications):
      - success → the send completed before the response is written;
      - timeout → the send is cancelled after ``timeout`` seconds and logged;
        the payment row is ALREADY committed at every call site, so it stays
        in the admin review queue (/api/admin/subscriptions + Telegram);
      - failure → logged (and reported to Sentry like the old spawn registry
        did via _async._log_task_exception) but never fails the request.
    """
    try:
        await asyncio.wait_for(coro, timeout=timeout)
    except TimeoutError:
        log.warning(
            "admin money notification timed out after %.1fs — row stays in the review queue",
            timeout,
        )
    except Exception as exc:  # noqa: BLE001 — external send must never break the payment
        log.error("admin money notification failed (non-fatal): %s", exc, exc_info=True)
        try:
            from _observability import capture_exception

            capture_exception(exc)
        except Exception:
            # observability must never amplify a notification failure
            pass


async def _reject_wallet_above_cap(provider: str, amount: float, db) -> None:
    """Plan §2.2 + v10-D1: amounts above the mobile-wallet cap must go via bank transfer.

    Server-side enforcement — the frontend auto-switch is UX only and can be bypassed.
    v10-D1 (S2 #1 CRITICAL, three-way drift): the cap now reads the SAME
    SystemConfig key (mobile_wallet_cap) that /api/admin/config writes and
    /api/config exports — an admin's change used to be cosmetic-only while
    the real gate stayed frozen at the env value (financial risk in both
    directions). Fallback: env MOBILE_WALLET_CAP when no/invalid DB row.
    """
    if provider not in ("liyana", "madar"):
        return
    cap = await _get_mobile_wallet_cap(db)
    if float(amount) > cap:
        raise HTTPException(
            400,
            f"المبالغ فوق {cap:g} د.ل تتطلب تحويل بنكي — اختر مزود التحويل البنكي",
        )


# Same bounds the admin setter enforces in /api/admin/config (1..10000 LYD)
# — a drifted/invalid DB row falls back to the env value instead of blocking
# or opening payments.
_WALLET_CAP_MIN, _WALLET_CAP_MAX = 1, 10000


async def _get_mobile_wallet_cap(db) -> float:
    from models import SystemConfig

    try:
        row = await db.scalar(select(SystemConfig).where(SystemConfig.key == "mobile_wallet_cap"))
        value = (row.value or "").strip() if row is not None else ""
        if value:
            cap = float(value)
            if _WALLET_CAP_MIN <= cap <= _WALLET_CAP_MAX:
                return cap
            log.warning("mobile_wallet_cap out of bounds (%r) — env fallback", value)
    except Exception:
        log.warning("wallet-cap read failed — env fallback", exc_info=True)
    return float(settings.MOBILE_WALLET_CAP)


async def _payment_rate_limit(request: Request, key: str, max_attempts: int = 10, window: int = 60) -> None:
    """Plan §7.1: rate limit every payment-adjacent POST.

    Same DB-backed limiter as /api/subscriptions; graceful degradation if
    the check itself fails (never blocks legitimate payments on limiter hiccups).
    """
    try:
        from _rate_limit import check_rate_limit
        async with AsyncSessionLocal() as rl_db:
            if not await check_rate_limit(rl_db, f"{key}:{request.client.host if request.client else 'unknown'}",
                                          max_attempts=max_attempts, window_seconds=window):
                raise HTTPException(429, "محاولات كثيرة — حاول بعد قليل")
    except HTTPException:
        raise
    except Exception:
        log.warning("payment rate-limit check failed — allowing through", exc_info=True)


@router.post("/api/payments/topup")
async def payment_topup(request: Request, body: dict = Body(...), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    await _payment_rate_limit(request, "topup")
    amount = body.get("amount", 0)
    provider = body.get("provider", "")
    phone = body.get("phone", "")
    if amount < 1 or amount > 10000:
        raise HTTPException(400, "المبلغ غير صالح (1-10000)")
    if provider not in ("liyana", "madar"):
        raise HTTPException(400, "مزود الدفع غير صالح")
    await _reject_wallet_above_cap(provider, amount, db)
    if not phone or len(phone) < 7:
        raise HTTPException(400, "رقم الهاتف غير صالح")
    pr = PaymentRequest(
        tenant_id=current_user._tenant_id,
        username=current_user.username,
        amount=amount,
        provider=provider,
        phone=phone,
        status="pending",
    )
    db.add(pr)
    await db.commit()
    await db.refresh(pr)
    # v14-E1 #3: inline (was spawn) — Vercel kills post-response tasks, so the
    # topup alert must leave BEFORE this response does (short timeout inside).
    await _notify_admins_inline(
        notify_admins_new_payment(pr.id, current_user.username, amount, provider, phone)
    )
    instructions = (
        f"حوالة إلى {provider} على الرقم {phone} بمبلغ {amount} د.ل "
        f"— بعد الإرسال، انتظر موافقة الإدارة"
    )
    return ok({"payment_id": pr.id, "instructions": instructions})


@router.post("/api/payments/confirm")
async def payment_confirm(request: Request, body: dict = Body(...), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """User submits transfer reference — marks pending for admin approval."""
    await _payment_rate_limit(request, "confirm")
    pid = body.get("payment_id", 0)
    ref = body.get("reference", "")
    if not pid or not ref:
        raise HTTPException(400, "معرف الدفع ورقم الحوالة مطلوبان")
    pr = await db.get(PaymentRequest, int(pid))
    if not pr or pr.tenant_id != current_user._tenant_id:
        raise HTTPException(404, "الدفعة غير موجودة")
    if pr.status != "pending":
        raise HTTPException(400, "الدفعة تم تأكيدها مسبقاً")
    pr.reference = ref
    pr.note = "انتظار موافقة الإدارة"
    await db.commit()
    return ok({"ok": True, "message": "تم استلام رقم الحوالة، في انتظار موافقة الإدارة"})


@router.get("/api/payments/balance")
async def payment_balance(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    # v12-E1.6/E2: the wallet read goes through the atomic _wallet helper
    # (Decimal-safe LYD math + the single read path E1 owns) — was a direct
    # BotState "balance" read with int(bs.value) (truncated qirsh + a second
    # read path racing the atomic credit).
    from _wallet import get_wallet_balance

    balance = await get_wallet_balance(db, current_user._tenant_id)
    return ok({"balance": float(balance), "currency": "LYD"})


@router.get("/api/payments/history")
async def payment_history(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
                          db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Wallet topup history — v14-E1 #2 (D10 high): bounded response.

    The query used to ship EVERY PaymentRequest row of the tenant (note /
    reference / phone per row, growing without bound — 1000 topups ≈ 200KB+
    of JSON on every billing-page open). Now: newest-first page of ``limit``
    rows (default 50, max 100) past ``offset``; the data-as-list contract the
    billing page consumes is unchanged.
    """
    rows = await db.execute(
        select(PaymentRequest)
        .where(PaymentRequest.tenant_id == current_user._tenant_id)
        .order_by(desc(PaymentRequest.created_at))
        .offset(offset)
        .limit(limit)
    )
    return ok([
        {"payment_id": r.id, "amount": float(r.amount) if r.amount is not None else 0, "provider": r.provider,
         "phone": r.phone, "reference": r.reference, "status": r.status,
         "note": r.note, "created_at": iso_z(r.created_at)}
        for r in rows.scalars().all()
    ])
