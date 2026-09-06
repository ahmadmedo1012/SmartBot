from __future__ import annotations

"""Telegram payment webhook + background bot loop (v11-A1 extraction).

``telegram_webhook`` is registered in runner.py; ``_run_bot_loop`` is the
background consumer loop started by the lifespan (app/startup.py) and
re-exported by runner for routers/bot.py's start/stop controls.

v11-A1 note on the webhook globals/callables: the canonical ``_TG_SECRET`` /
``_ALLOW_UNVERIFIED`` snapshots and the ``answer_callback`` / ``edit_message`` /
``edit_keyboard`` callables stay bound on the RUNNER module (exactly where
the monolith kept them). This function resolves them dynamically via a
deferred ``import runner`` so the historical monkeypatch contract — tests
patch ``runner._TG_SECRET`` / ``runner.answer_callback`` … — keeps working,
identical to the monolith where these were the handler's own module globals.
"""

import asyncio
import logging
from datetime import timedelta

from _services import get_bot_engine, get_tenant_fb_client
from _utils import utcnow
from config import settings
from database import AsyncSessionLocal
from fastapi import Body, HTTPException, Request
from models import (
    BotState,
    PaymentRequest,
    SubscriptionPayment,
    SubscriptionPlan,
    Tenant,
    User,
)
from sqlalchemy import select, update

log = logging.getLogger("fb-api")


async def telegram_webhook(request: Request, body: dict = Body(...)):
    """Handle Telegram callback queries for payment approve/reject."""
    import runner  # deferred — canonical secret flag + telegram callables live on runner
    # Webhook secret check — Telegram sends via x-telegram-bot-api-secret-token
    if not runner._ALLOW_UNVERIFIED:
        token = request.headers.get("x-telegram-bot-api-secret-token", "")
        if not runner._TG_SECRET:
            log.warning("TELEGRAM_WEBHOOK_SECRET not set — rejecting unverified request")
            raise HTTPException(403, "Forbidden")
        # v8-A6: constant-time compare (hmac.compare_digest) — a plain ==
        # leaks the secret byte-by-byte via timing. Mirrors the cron check.
        import hmac as _hmac
        if not _hmac.compare_digest(token.encode(), runner._TG_SECRET.encode()):
            raise HTTPException(403, "Forbidden")
    cq = (body or {}).get("callback_query")
    if not cq:
        return {"ok": True}
    data = cq.get("data", "")
    colon = data.find(":")
    if colon == -1 or not (data.startswith("pay_") or data.startswith("sub_")):
        return {"ok": True}
    action = data[:colon]
    # v11 fix (BUG found by test_v11_telegram): malformed callback payloads
    # (e.g. "pay_app:abc") hit an unguarded int() → ValueError → 500. The
    # webhook must be a graceful no-op for anything that is not a well-formed
    # payment reference — Telegram clients can send arbitrary callback data.
    try:
        payment_id = int(data[colon + 1:])
    except ValueError:
        import logging
        logging.getLogger("fb-telegram").warning(
            "callback_query with malformed payment id ignored: %r", data)
        return {"ok": True}
    from_id = cq.get("from", {}).get("id")
    # Verify admin — env TELEGRAM_ADMIN_IDS ∪ DB TelegramApprover rows (plan v3 §5.2)
    from telegram_bot import get_admin_ids
    if from_id not in (await get_admin_ids()):
        await runner.answer_callback(cq["id"], "عذراً، لا تمتلك الصلاحية", True)
        return {"ok": True}
    async with AsyncSessionLocal() as db:
        msg = cq.get("message", {})
        # Handle subscription payment (sub_ prefix)
        if data.startswith("sub_"):
            new_status = "verified" if action == "sub_app" else "cancelled"
            # v9-A8: atomic claim — UPDATE ... WHERE status='pending' RETURNING
            # (same pattern as the pay_ path below). The old read-check-write
            # (`db.get` then `if sp.status != "pending"`) let two admins (or a
            # double-tap) both pass the check and double-activate the plan.
            sub_result = await db.execute(
                update(SubscriptionPayment)
                .where(SubscriptionPayment.id == payment_id,
                       SubscriptionPayment.status == "pending")
                .values(status=new_status)
                .returning(SubscriptionPayment)
            )
            sp = sub_result.scalar_one_or_none()
            if not sp:
                await runner.answer_callback(cq["id"], "تمت معالجة هذا الطلب مسبقاً", True)
                return {"ok": True}
            if new_status == "verified":
                # Activate plan for tenant
                tenant = await db.get(Tenant, sp.tenant_id)
                if tenant:
                    plan = await db.get(SubscriptionPlan, sp.plan_id)
                    if plan:
                        tenant.plan_id = sp.plan_id
                        tenant.subscription_status = "PAID"
                        tenant.plan_start = utcnow()
                        tenant.plan_end = utcnow() + timedelta(days=plan.period_days)
                        tenant.plan = plan.name.lower()
                if sp.user_id:
                    user = await db.get(User, sp.user_id)
                    if user:
                        user.plan_id = sp.plan_id
                        user.subscription_status = "PAID"
            await db.commit()
            msg_text = f"✅ *تم تأكيد الاشتراك* #{payment_id}\nالباقة: {sp.plan_name}\nالمستخدم: {sp.extra_data.get('username','')}"
            if msg.get("chat") and msg.get("message_id"):
                await runner.edit_message(msg["chat"]["id"], msg["message_id"], msg_text)
                await runner.edit_keyboard(msg["chat"]["id"], msg["message_id"])
            await runner.answer_callback(cq["id"], "✅ تم تأكيد الاشتراك")
            return {"ok": True}

        # Legacy payment handling (pay_ prefix)
        new_status = "confirmed" if action == "pay_app" else "cancelled"
        result = await db.execute(
            update(PaymentRequest)
            .where(PaymentRequest.id == payment_id, PaymentRequest.status == "pending")
            .values(status=new_status)
            .returning(PaymentRequest)
        )
        pr = result.scalar_one_or_none()
        if not pr:
            await runner.answer_callback(cq["id"], "تمت معالجة هذا الطلب مسبقاً", True)
            msg = cq.get("message", {})
            if msg.get("chat") and msg.get("message_id"):
                await runner.edit_keyboard(msg["chat"]["id"], msg["message_id"])
            return {"ok": True}
        if action == "pay_app":
            # Credit balance
            existing = await db.execute(
                select(BotState).where(BotState.tenant_id == pr.tenant_id, BotState.key == "balance")
            )
            bs = existing.scalar_one_or_none()
            new_bal = (int(float(bs.value)) if bs and bs.value else 0) + int(float(pr.amount))
            if bs:
                bs.value = str(new_bal)
            else:
                db.add(BotState(tenant_id=pr.tenant_id, key="balance", value=str(new_bal)))
            await db.commit()
            msg = cq.get("message", {})
            if msg.get("chat") and msg.get("message_id"):
                await runner.edit_message(msg["chat"]["id"], msg["message_id"],
                                   f"✅ *تم تأكيد الدفع* #{payment_id}\nالمبلغ: {pr.amount} د.ل\nالمستخدم: {pr.username}")
                await runner.edit_keyboard(msg["chat"]["id"], msg["message_id"])
            await runner.answer_callback(cq["id"], "✅ تم تأكيد الدفع وإضافة الرصيد")
        else:
            await db.commit()
            msg = cq.get("message", {})
            if msg.get("chat") and msg.get("message_id"):
                await runner.edit_message(msg["chat"]["id"], msg["message_id"],
                                   f"❌ *تم رفض الدفع* #{payment_id}\nالمبلغ: {pr.amount} د.ل\nالمستخدم: {pr.username}")
                await runner.edit_keyboard(msg["chat"]["id"], msg["message_id"])
            await runner.answer_callback(cq["id"], "❌ تم رفض طلب الدفع")
    return {"ok": True}


async def _run_bot_loop():
    while True:
        try:
            async with AsyncSessionLocal() as db:
                tenants = await db.execute(select(Tenant).where(Tenant.is_active == True))
            for tenant in tenants.scalars().all():
                fb = await get_tenant_fb_client(tenant.id)
                if not fb:
                    continue
                engine = get_bot_engine(fb, tenant_id=tenant.id)
                await engine.cycle()
        except Exception as e:
            log.error(f"Bot loop err: {e}")
        await asyncio.sleep(settings.BOT_INTERVAL_SECONDS)
