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


# ── v15-E3 (D1-H1): client-typed inputs → 422 Arabic, never a raw 500 ───────
# The payments family used to run raw conversions on request-body values
# (``int(pid)`` / ``amount < 1`` with a string amount) — a client sending
# "50" instead of 50 got an unhandled 500 AND a CRITICAL Sentry/Telegram
# alert for what is a plain client typo. These helpers answer the documented
# 422 «قيمة غير صالحة» (same family as the Pydantic validation_handler).


def _as_float(value, field: str) -> float:
    """Strictly convert a money value → 422 Arabic on a non-numeric input."""
    if isinstance(value, bool):  # bool is an int subclass — reject explicitly
        raise HTTPException(422, f"قيمة غير صالحة: {field} يجب أن يكون رقماً")
    try:
        return float(value)
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(422, f"قيمة غير صالحة: {field} يجب أن يكون رقماً") from None


def _as_int(value, field: str) -> int:
    """Strictly convert an id → 422 Arabic on a non-integer input.

    Floats that are whole numbers (``5.0``) pass; "5abc" / "5.5" / lists 422.
    """
    if isinstance(value, bool):
        raise HTTPException(422, f"قيمة غير صالحة: {field} يجب أن يكون رقماً صحيحاً")
    try:
        as_float = float(value)
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(422, f"قيمة غير صالحة: {field} يجب أن يكون رقماً صحيحاً") from None
    if as_float != int(as_float):
        raise HTTPException(422, f"قيمة غير صالحة: {field} يجب أن يكون رقماً صحيحاً")
    return int(as_float)


# v14-E1 #3: money-approval notifications are sent INLINE (awaited BEFORE the
# payment response leaves). spawn()ed tasks die on Vercel serverless once the
# function's response is returned — the platform's payment/topup/subscription
# requests could silently never reach Telegram there. The short timeout keeps
# a degraded Telegram from holding the user's payment response hostage.
_ADMIN_NOTIFY_TIMEOUT_S = 8.0


def _coro_kind(coro) -> str:
    """v18-1-d: greppable label for an admin-notify coroutine's log line.

    Derived from the coroutine function name — notify_admins_new_subscription
    → "subscription", notify_admins_new_payment → "payment",
    notify_admins_support_ticket → "support". Unknown/monkeypatched coroutines
    fall back to their own function name (or "notify").
    """
    name = getattr(coro, "__name__", "") or ""
    if "subscription" in name:
        return "subscription"
    if "payment" in name:
        return "payment"
    if "support" in name or "ticket" in name:
        return "support"
    return name or "notify"


async def _notify_admins_inline(coro, *, timeout: float = _ADMIN_NOTIFY_TIMEOUT_S) -> None:
    """Await an admin money-notification inline, capped by a short timeout.

    Delivery semantics (v14-E1, replaces spawn() for money notifications):
      - success → the send completed before the response is written;
      - timeout → the send is cancelled after ``timeout`` seconds and logged;
        the payment row is ALREADY committed at every call site, so it stays
        in the admin review queue (/api/admin/subscriptions + Telegram);
      - failure → logged (and reported to Sentry like the old spawn registry
        did via _async._log_task_exception) but never fails the request.

    v18-1-d (متانة إشعارات تليجرام): when the coroutine returns the notify_*
    summary dict (telegram_bot._notify_admins), its verdict is logged as ONE
    greppable line — exactly what live Vercel-log diagnosis greps for:
      "telegram subscription notify: sent=1 failed=0 recipients=1"
      "telegram payment notify: SKIPPED — no config (payment_id=15)"
    """
    kind = _coro_kind(coro)
    try:
        result = await asyncio.wait_for(coro, timeout=timeout)
    except TimeoutError:
        log.warning(
            "telegram %s notify: TIMEOUT after %.1fs — row stays in the review queue",
            kind, timeout,
        )
        return  # cancelled mid-send — no result dict exists to log
    except Exception as exc:  # noqa: BLE001 — external send must never break the payment
        log.error("admin money notification failed (non-fatal): %s", exc, exc_info=True)
        try:
            from _observability import capture_exception

            capture_exception(exc)
        except Exception:
            # observability must never amplify a notification failure
            pass
        return
    if isinstance(result, dict) and "sent" in result:
        # v18-1-d observability contract (telegram_bot._notify_admins)
        if result.get("skipped_no_config"):
            log.warning("telegram %s notify: SKIPPED — no config (payment_id=%s)",
                        kind, result.get("payment_id", "unknown"))
        else:
            log.info("telegram %s notify: sent=%s failed=%s recipients=%s",
                     kind, result.get("sent", 0), result.get("failed", 0),
                     result.get("recipients", 0))


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
    # v19 Step 1 — DEVIATION NOTE (documented in the round report): the v19
    # plan prescribed an active-subscription guard HERE, reading topup as
    # «the point where subscription payment requests are created». It is
    # not: approving a PaymentRequest CREDITS THE WALLET (app/telegram.py →
    # credit_wallet) — subscriptions activate exclusively through
    # SubscriptionPayment (POST /api/subscriptions), which now carries the
    # guard. Blocking topup for PAID/TRIAL tenants would break the pinned
    # wallet-cap contract (tests/test_v10_security.py D1: a PAID tenant
    # tops up 149 ≤ cap → 200) and strip paying customers of the
    # wallet-credit flow. The duplicate-SUBSCRIPTION complaint is fixed at
    # its real entry point; this endpoint stays wallet-only.
    # v15-E3 (D1-H1): raw ``amount < 1`` with a string amount was a TypeError
    # → 500 + critical alert for a client typo. Now: 422 «قيمة غير صالحة».
    amount = _as_float(body.get("amount", 0), "المبلغ")
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
    # v15-E3 (D1-H1): ``int(pid)`` on a non-numeric payment_id was a raw 500;
    # now a clean 422 Arabic (a client typo must never page anyone).
    pid = _as_int(body.get("payment_id", 0) or 0, "معرف الدفع")
    ref = body.get("reference", "")
    if not pid or not ref:
        raise HTTPException(400, "معرف الدفع ورقم الحوالة مطلوبان")
    pr = await db.get(PaymentRequest, pid)
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
    """Payment history — v14-E1 #2 (D10 high): bounded response.

    The query used to ship EVERY PaymentRequest row of the tenant (note /
    reference / phone per row, growing without bound — 1000 topups ≈ 200KB+
    of JSON on every billing-page open). Now: newest-first page of ``limit``
    rows (default 50, max 100) past ``offset``; the data-as-list contract the
    billing page consumes is unchanged.

    v15-coordinator (p10-t11 بطارية حية): فواتير الاشتراك كانت غائبة عن
    صفحة الفواتير — مسار الدفع الأساسي (POST /api/subscriptions) يكتب في
    ``subscription_payments`` بينما هذه القائمة كانت تقرأ ``payment_requests``
    (شحنات المحفظة) فقط: المستخدم يدفع ولا يرى الفاتورة أبداً (مرساة
    ``length>200`` الضعيفة أخفتها جولتين). الدمج الآن: الجدولان معاً،
    الأحدث أولاً، مع ``kind`` للتمييز — وحدود v14-E1 محفوظة.
    """
    from models import SubscriptionPayment
    tid = current_user._tenant_id
    pr_rows = (await db.execute(
        select(PaymentRequest)
        .where(PaymentRequest.tenant_id == tid)
        .order_by(desc(PaymentRequest.created_at))
        .offset(offset).limit(limit)
    )).scalars().all()
    sp_rows = (await db.execute(
        select(SubscriptionPayment)
        .where(SubscriptionPayment.tenant_id == tid)
        .order_by(desc(SubscriptionPayment.created_at))
        .offset(offset).limit(limit)
    )).scalars().all()
    items = [
        {"payment_id": r.id, "kind": "topup", "amount": float(r.amount) if r.amount is not None else 0,
         "provider": r.provider, "phone": r.phone, "reference": r.reference, "status": r.status,
         "note": r.note, "created_at": iso_z(r.created_at)}
        for r in pr_rows
    ] + [
        # v15: معرّف مسبوق بـs لتمييزه عن معرفات payment_requests (المفتاح في
        # الواجهة نصي) — note = اسم الخطة (لقطة وقت الدفع)
        {"payment_id": f"s{r.id}", "kind": "subscription", "amount": float(r.amount) if r.amount is not None else 0,
         "provider": r.provider, "phone": r.phone, "reference": None, "status": r.status,
         "note": r.plan_name, "created_at": iso_z(r.created_at)}
        for r in sp_rows
    ]
    items.sort(key=lambda x: x["created_at"] or "", reverse=True)
    return ok(items[:limit])
