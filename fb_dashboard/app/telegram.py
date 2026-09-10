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
from _wallet import credit_wallet, to_wallet_decimal
from config import settings
from database import AsyncSessionLocal
from fastapi import Body, HTTPException, Request
from models import (
    PaymentRequest,
    SubscriptionPayment,
    SubscriptionPlan,
    Tenant,
    User,
)
from sqlalchemy import select, update
from telegram_bot import escape_user_text

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
    if colon == -1 or not data.startswith(("pay_", "sub_")):
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
            # v22-D7 (FIX-B #2 — approval parity): the HTTP admin route
            # (routers/payments/approvals.py:150-166) pushes an in-app
            # notification to the payment owner on every decision; the
            # Telegram-button path never did — the owner got the Telegram
            # verdict but the USER only learned the outcome by re-checking
            # billing. Mirrored EXACTLY (same status values, same Arabic
            # title/body) so both approval channels now notify in-app.
            try:
                from routers.notifications import push_notification
                if new_status == "verified":
                    await push_notification(
                        db, sp.tenant_id,
                        title="تم تأكيد الدفع وتفعيل الاشتراك",
                        body=f"تمت الموافقة على دفعة بقيمة {float(sp.amount):.2f} د.ل — باقة {sp.plan_name}",
                        type_="payment", link="/dashboard/billing", user_id=sp.user_id,
                    )
                else:
                    await push_notification(
                        db, sp.tenant_id,
                        title="تم رفض طلب الدفع",
                        body=f"رُفضت دفعة بقيمة {float(sp.amount):.2f} د.ل — راجع تفاصيل الطلب أو تواصل مع الدعم",
                        type_="payment", link="/dashboard/billing", user_id=sp.user_id,
                    )
            except Exception:
                pass
            await db.commit()
            # v22-D7 (FIX-B #1): editMessageText is now parse_mode=HTML —
            # plan_name/username are user data («مميز_السعر», ``fixb_x``) and
            # must be escaped, bold via <b>…</b> (was *…* Markdown).
            msg_text = (
                f"✅ <b>تم تأكيد الاشتراك</b> #{payment_id}\n"
                f"الباقة: {escape_user_text(sp.plan_name)}\n"
                f"المستخدم: {escape_user_text((sp.extra_data or {}).get('username', '') or '')}"
            )
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
            # Credit balance — v12 E1.6 (D9):
            # 1) Decimal بدل int(float(...)): الدينار الليبي بثلاث منازل
            #    (Payments Numeric(10,3)) والاقتطاع القديم يأكل القروش.
            # 2) credit_wallet ينفّذ UPDATE ذرّيًا واحدًا على مستوى SQL بدل
            #    اقرأ→عدّل→اكتب الذي يفقد قرضًا كاملًا عند موافقتين متزامنتين؛
            #    الـ commit هنا يغطي الدفعة والقرض معًا (معاملة واحدة).
            amount = to_wallet_decimal(pr.amount)
            await credit_wallet(db, pr.tenant_id, amount)
            await db.commit()
            msg = cq.get("message", {})
            if msg.get("chat") and msg.get("message_id"):
                await runner.edit_message(msg["chat"]["id"], msg["message_id"],
                                   f"✅ <b>تم تأكيد الدفع</b> #{payment_id}\nالمبلغ: {pr.amount} د.ل\nالمستخدم: {escape_user_text(pr.username)}")
                await runner.edit_keyboard(msg["chat"]["id"], msg["message_id"])
            await runner.answer_callback(cq["id"], "✅ تم تأكيد الدفع وإضافة الرصيد")
        else:
            await db.commit()
            msg = cq.get("message", {})
            if msg.get("chat") and msg.get("message_id"):
                await runner.edit_message(msg["chat"]["id"], msg["message_id"],
                                   f"❌ <b>تم رفض الدفع</b> #{payment_id}\nالمبلغ: {pr.amount} د.ل\nالمستخدم: {escape_user_text(pr.username)}")
                await runner.edit_keyboard(msg["chat"]["id"], msg["message_id"])
            await runner.answer_callback(cq["id"], "❌ تم رفض طلب الدفع")
    return {"ok": True}


async def _run_bot_loop():
    while True:
        try:
            async with AsyncSessionLocal() as db:
                tenants = await db.execute(select(Tenant).where(Tenant.is_active == True))
            for tenant in tenants.scalars().all():
                # v24-R3 (M6 — tenant loop isolation): the try/except used to
                # wrap the WHOLE tenant loop, so one tenant's engine.cycle()
                # raise aborted every remaining tenant for that pass (a single
                # broken token = every later tenant's replies silently stop).
                # Mirrors _automation_sweep's per-tenant catch (routers/bot.py
                # §3): the failing tenant is logged WITH its id and reported;
                # the loop moves on to the next tenant.
                try:
                    fb = await get_tenant_fb_client(tenant.id)
                    if not fb:
                        continue
                    engine = get_bot_engine(fb, tenant_id=tenant.id)
                    await engine.cycle()
                except Exception as e:
                    log.exception("Bot loop error — tenant %s skipped this pass",
                                  tenant.id)
                    try:
                        from _observability import capture_exception

                        capture_exception(e)
                    except Exception:
                        pass
        except Exception as e:
            # v12-E3.5b (D12): the bot loop is the revenue path — a cycle
            # failure must reach Sentry with its traceback, not just a
            # one-line message (it could error for days while dashboards
            # stay green).
            log.exception("Bot loop error")
            try:
                from _observability import capture_exception

                capture_exception(e)
            except Exception:
                pass
        await asyncio.sleep(settings.BOT_INTERVAL_SECONDS)
