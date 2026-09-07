"""Admin subscription approvals: list + resolve (verify/cancel) + protected receipt.

v13-L4: split out of the former 594-line ``routers/payments.py`` monolith —
endpoint bodies moved VERBATIM.
v14-E1 (plan §E1): C-SEC1 — the HTTP resolve path is now PLATFORM-ADMIN ONLY
(a self-registered tenant admin could previously approve their own pending
payment → paid plan with no money); the admin list no longer ships raw
receipt payloads (multi-hundred-KB base64 data-URIs on Vercel) and a new
authenticated GET /api/payments/receipt/{id} serves the receipt bytes.
"""
import base64
import logging
import mimetypes
import os
from datetime import timedelta
from pathlib import Path

from _responses import ok
from _utils import iso_z, utcnow
from database import get_db
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response
from models import SubscriptionPayment, SubscriptionPlan, Tenant, User
from sqlalchemy import desc, select, update

from routers.auth import get_current_user, is_platform_admin, require_platform_admin, require_role
from routers.payments.wallet import _as_int

log = logging.getLogger("fb-api")
router = APIRouter(tags=["payments"])


def _receipt_view(sp: SubscriptionPayment) -> dict:
    """v14-E1 #4 (D10 high): the admin JSON must NOT carry receipt payloads.

    Vercel uploads land as multi-hundred-KB ``data:image/...;base64`` URIs in
    ``extra_data.receipt_url`` — shipping them inside the list response made
    a 20-pending queue a multi-megabyte JSON on the reviewer's mobile data
    (and the admin UI never rendered them anyway). The raw value is replaced
    with a ``receipt_present`` flag + the authenticated ``receipt_api`` link;
    the bytes are served by GET /api/payments/receipt/{id} below. All other
    metadata keys (username, sender info, upgrade flag) survive untouched.
    """
    extra = dict(sp.extra_data or {})
    receipt = extra.pop("receipt_url", None)
    extra["receipt_present"] = bool(receipt)
    if receipt:
        extra["receipt_api"] = f"/api/payments/receipt/{sp.id}"
    return extra


@router.get("/api/admin/subscriptions")
async def admin_list_subscriptions(status: str = Query("pending"), page: int = Query(1, ge=1), db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    """Admin: list subscription payments with filtering.

    v14-fix (تناسق C-SEC1): الحسم صار حكراً على مسؤول المنصة — لكن القائمة
    كانت تظل مقيدة بمستأجر الطالب: أدمن المنصة (tenant 0) يرى طابوراً فارغاً
    دائماً رغم أنه الوحيد القادر على الحسم! مسؤول المنصة يرى مدفوعات كل
    المستأجرين؛ أدمن المستأجر يظل مقيداً بمساحته."""
    q = select(SubscriptionPayment)
    if not is_platform_admin(current_user):
        q = q.where(SubscriptionPayment.tenant_id == current_user._tenant_id)
    if status != "all":
        q = q.where(SubscriptionPayment.status == status)
    q = q.order_by(desc(SubscriptionPayment.created_at)).offset((page - 1) * 20).limit(20)
    rows = await db.execute(q)
    result = []
    for sp in rows.scalars().all():
        username = (sp.extra_data or {}).get("username", f"user_{sp.user_id}")
        result.append({
            "id": sp.id, "user_id": sp.user_id, "username": username,
            "tenant_id": sp.tenant_id,
            "phone": sp.phone, "amount": float(sp.amount), "provider": sp.provider,
            "plan_id": sp.plan_id, "plan": sp.plan_name, "status": sp.status,
            "metadata": _receipt_view(sp),
            "created_at": iso_z(sp.created_at),
        })
    return ok(result)


@router.post("/api/admin/subscriptions")
async def admin_resolve_subscription(body: dict = Body(...), db=Depends(get_db), current_user: User = Depends(require_platform_admin)):
    """Platform admin: approve or reject a subscription payment.

    SECURITY v14-E1 (C-SEC1, D8-C1 — was CRITICAL): the old tenant-scoped
    gate meant any SELF-REGISTERED user (every signup is the admin of their
    own tenant) could create a pending payment and then resolve it
    themselves — a paid plan with zero money. Money resolution is a
    PLATFORM-level decision; the parallel Telegram approval flow already
    restricts to platform approvers (TELEGRAM_ADMIN_IDS ∪
    TelegramApprover), and the HTTP flow now requires the same authority
    via ``require_platform_admin``. Tenant admins get 403; the tenant-scope
    clause in the claim is gone with it (platform admins resolve any
    tenant's row — delegated platform admins included).
    """
    payment_id = body.get("id", 0)
    decision = body.get("status", "")
    if decision not in ("verified", "cancelled"):
        raise HTTPException(400, "القرار يجب أن يكون verified أو cancelled")
    # v15-E3 (D1-H1): was int(payment_id or 0) — a non-numeric id was a raw
    # 500 (plus a critical alert) on a reviewer typo; now a clean 422 Arabic.
    payment_id = _as_int(payment_id or 0, "معرف الدفعة")
    # v9-A8: atomic claim — UPDATE ... WHERE status='pending' RETURNING
    # (generalized from the telegram pay_ path). Two admins clicking approve
    # at once: only the first UPDATE matches; the loser gets a clean 400
    # instead of double-activating the tenant plan.
    result = await db.execute(
        update(SubscriptionPayment)
        .where(SubscriptionPayment.id == payment_id,
               SubscriptionPayment.status == "pending")
        .values(status=decision)
        .returning(SubscriptionPayment)
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise HTTPException(400, "الدفعة غير موجودة أو تمت معالجتها")
    if decision == "verified":
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
                user.subscription_status = "PAID"
    else:
        if sp.user_id:
            user = await db.get(User, sp.user_id)
            if user:
                user.subscription_status = "REJECTED"
    # In-app notification (plan §4.2 — payment alerts)
    try:
        from routers.notifications import push_notification
        if decision == "verified":
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
    return ok({"ok": True, "status": decision})


# ── v14-E1 #4: protected receipt download ─────────────────────────────────────
# Receipts leave the ok() JSON envelope and answer as raw image bytes through
# this authenticated route — the same documented exception class as the PDF
# report endpoint (routers/reports_routes.py): a binary download is machine
# contract, never an ok()/fail() payload.
_RECEIPT_FETCH_TIMEOUT_S = 8.0  # cap the guarded remote fetch so review never hangs
_RECEIPT_MAX_REMOTE_BYTES = 10 * 1024 * 1024


async def _fetch_remote_receipt(url: str) -> bytes | None:
    """Guarded remote receipt fetch: https-only (checked by the caller), no
    redirect following (a redirect could bounce to a private host), size-capped,
    short-timeout. Returns None on any failure — callers answer a clean 404."""
    import asyncio

    import httpx

    async def _get() -> bytes | None:
        async with httpx.AsyncClient(follow_redirects=False, timeout=10.0) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return None
            if len(r.content) > _RECEIPT_MAX_REMOTE_BYTES:
                log.warning("remote receipt exceeded %d bytes — refused", _RECEIPT_MAX_REMOTE_BYTES)
                return None
            return r.content

    try:
        return await asyncio.wait_for(_get(), timeout=_RECEIPT_FETCH_TIMEOUT_S)
    except Exception:
        log.warning("receipt remote fetch failed", exc_info=True)
        return None


@router.get("/api/payments/receipt/{payment_id}")
async def get_payment_receipt(payment_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Serve one payment's receipt image — owner, same-tenant admin, or platform admin.

    v14-E1 (D10 high + D8-L4): receipts used to ride the admin list JSON
    (base64 data-URIs on Vercel) and, on disk deployments, were reachable
    only through the PUBLIC /static mount. They now answer exclusively via
    this authenticated, tenant-scoped route:
      - ``data:image/...``                    → decoded bytes (Vercel storage form)
      - ``/static/uploads/receipts/<name>``   → file bytes (basename-ed: a stored
        traversal payload cannot escape the receipts directory)
      - ``https://...``                       → guarded remote fetch (v10-A8 SSRF
        guard, no redirects, size cap, short timeout)
    Missing payment / cross-tenant / receiptless → uniform 404 (no existence
    oracle — mirrors the /api/subscriptions/status contract).
    """
    sp = await db.get(SubscriptionPayment, payment_id)
    allowed = bool(
        sp is not None
        and (
            sp.user_id == current_user.id
            or sp.tenant_id == (current_user._tenant_id or 0)
            or is_platform_admin(current_user)
        )
    )
    if not sp or not allowed:
        raise HTTPException(404, "الدفعة غير موجودة")
    receipt = str((sp.extra_data or {}).get("receipt_url") or "")
    if not receipt:
        raise HTTPException(404, "لا يوجد إيصال لهذه الدفعة")

    if receipt.startswith("data:image/"):
        header, _, b64 = receipt.partition(",")
        mime = header[len("data:"):].split(";", 1)[0] or "image/jpeg"
        try:
            payload = base64.b64decode(b64, validate=False)
        except Exception:
            raise HTTPException(400, "تعذر فك ترميز الإيصال") from None
        if not payload:
            raise HTTPException(404, "لا يوجد إيصال لهذه الدفعة")
        return Response(content=payload, media_type=mime)

    if receipt.startswith("/static/uploads/receipts/"):
        from routers.payments.bank import _UPLOAD_DIR

        name = os.path.basename(receipt)  # strips any traversal characters
        path = Path(_UPLOAD_DIR) / name
        if name in (".", "..") or not path.is_file():
            raise HTTPException(404, "لا يوجد إيصال لهذه الدفعة")
        return FileResponse(path, media_type=(mimetypes.guess_type(name)[0] or "image/jpeg"))

    if receipt.startswith("https://"):
        from ai_service import UnsafeImageUrlError, _assert_safe_image_url

        try:
            _assert_safe_image_url(receipt)
        except UnsafeImageUrlError:
            raise HTTPException(400, "رابط الإيصال مرفوض") from None
        payload = await _fetch_remote_receipt(receipt)
        if payload is None:
            raise HTTPException(404, "تعذر جلب الإيصال الخارجي")
        return Response(content=payload, media_type="image/jpeg")

    # Legacy rows with anything else stored (http://, junk) → clean refusal
    raise HTTPException(404, "لا يوجد إيصال لهذه الدفعة")
