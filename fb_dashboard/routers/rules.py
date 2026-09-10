"""Rules CRUD routes: list, create, update, delete, toggle."""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
import json
import logging

from _responses import ok
from database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from models import Message, Reply, Rule, SubscriptionPlan, User
from sqlalchemy import func, select

from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["rules"])

# v22-D3 (D3-B1): رسالة 403 العربية لحد قواعد الرد — نفس بنية حد الفريق
# (users.py _TEAM_LIMIT_MSG، سابقة v17-E-B2). N = max_rules للخطة الحالية.
_RULES_LIMIT_MSG = "حد قواعد الرد لخطتك هو {n} — رقِّ خطتك"

# v22-D3 (D3-B2): كلمات مفتاحية فارغة بعد التقسيم (مثال: " ، ، ") كانت
# تُخزَّن كقائمة [] = قاعدة catch-all ضمنية ترد على كل تعليق (محرك
# المطابقة يعتبر [] و["__catch_all__"] مطابقة شاملة). الرفض عند الحدود
# (API) — عقد الـ catch-all الصريح في المحرك يبقى لعرض مستقبلي مقصود
# (كلمة "__catch_all__" الصريحة لا تزال مقبولة كوثيقة عمد).
_KEYWORDS_REQUIRED_MSG = "الكلمات المفتاحية مطلوبة"


async def _enforce_max_rules(db, tenant_id: int) -> None:
    """v22-D3 (D3-B1) — حد قواعد الرد عند الإنشاء (كان بلا حارس إطلاقاً).

    نفس سابقة حد الفريق في users.py (v17-E-B2): القراءة عبر
    get_plan_limits (نقطة قراءة الخطة الوحيدة D2-H1: plan_id أو خطة
    Free للمستأجر بلا خطة، مع انحدار الولايات المنتهية إلى Free)، ثم
    fetch صف الخطة لقراءة max_rules. غياب صفوف الخطط = fail-open بلا
    حد (عقيدة money-core). العدّ = إجمالي قواعد المستأجر (كلها، وليس
    المفعّل فقط) — "N قواعد رد" في وعد الخطة يعني حجم كتاب القواعد
    (نفس دلالة max_team التي تعد كل المقاعد بما فيها المالك).
    """
    # استيراد محلي داخل الدالة — نفس سابقة users.py (تحاشي سلسلة استيراد
    # المحرك الثقيل عند تشغيل الوحدات).
    from bot_engine.pipeline import get_plan_limits
    limits = await get_plan_limits(db, tenant_id)
    if limits is None:
        return
    plan = await db.get(SubscriptionPlan, limits["plan_id"])
    max_rules = getattr(plan, "max_rules", None) if plan is not None else None
    if max_rules is None:
        return
    count = int(await db.scalar(
        select(func.count()).select_from(Rule).where(Rule.tenant_id == tenant_id)) or 0)
    if count >= int(max_rules):
        raise HTTPException(403, _RULES_LIMIT_MSG.format(n=int(max_rules)))


def _keywords_list(raw: str) -> list[str]:
    """v22-D3 (D3-B2) — تقسيم الكلمات + رفض القائمة الفارغة.

    " ، ، " كان يمر التحقق (الفحص القديم على السلسلة الخام) ثم يُخزَّن
    [] = catch-all ضمني يرد على كل تعليق. الآن: 400 عربية نظيفة.
    """
    kw = [k.strip() for k in raw.split(",") if k.strip()]
    if not kw:
        raise HTTPException(400, _KEYWORDS_REQUIRED_MSG)
    return kw


class RulePayload:
    """Normalized create/update payload (v19 Step 4).

    v17 Convention #1 (JSON+Form dual body) was implemented for templates
    but never ported here: /api/rules declared Form(...) ONLY, so any JSON
    client (the documented convention; a future mobile app; curl callers)
    hit a guaranteed 422 "field required" × N. The live UI today sends
    URLSearchParams (form-encoded) which worked — the gap was latent. This
    closes it with the exact templates_routes precedent.
    """

    def __init__(self, data: dict):
        self.name = str(data.get("name") or "").strip()
        self.keywords = str(data.get("keywords") or "").strip()
        self.reply_template = str(data.get("reply_template") or "").strip()
        self.description = str(data.get("description") or "")
        self.bot_type = str(data.get("bot_type") or "reply")
        self.dm_template = str(data.get("dm_template") or "")
        # v15-E3 (D1-H1) family: bad types answer 422 Arabic, never a 500
        raw_priority = data.get("priority")
        if raw_priority in (None, ""):
            self.priority: int | None = None
        else:
            try:
                self.priority = int(raw_priority)
            except (ValueError, TypeError):
                raise HTTPException(422, "قيمة غير صالحة: الأولوية يجب أن تكون رقماً") from None
        missing = [f for f, v in (("الاسم", self.name), ("الكلمات المفتاحية", self.keywords),
                                  ("نص الرد", self.reply_template)) if not v]
        if missing:
            raise HTTPException(422, "قيمة غير صالحة: الحقول المطلوبة ناقصة — " + "، ".join(missing))


async def _rule_payload(request: Request, *, require_priority: bool) -> RulePayload:
    """v19 Step 4 (v17-E-B1 precedent): accept BOTH JSON and form bodies."""
    ctype = (request.headers.get("content-type") or "").lower()
    if "application/json" in ctype:
        try:
            data = json.loads(await request.body() or b"{}")
        except json.JSONDecodeError:
            raise HTTPException(422, "قيمة غير صالحة: جسم الطلب ليس JSON صالحاً") from None
        if not isinstance(data, dict):
            raise HTTPException(422, "قيمة غير صالحة: جسم الطلب يجب أن يكون كائن JSON")
    else:
        data = {k: v for k, v in (await request.form()).items()}
    p = RulePayload(data)
    if require_priority and p.priority is None:
        p.priority = 999  # the historical Form default (create path)
    return p


async def _invalidate_engine_rules(tenant_id: int) -> None:
    """v4 §5.14 — rule edits must take effect immediately.

    The engine keeps a 120s TTL rule cache; without invalidation an edited
    rule kept firing (or stayed dead) for up to two minutes after save."""
    try:
        from _services import _bot_engines
        engine = _bot_engines.get(tenant_id)
        if engine is not None and getattr(engine, "_rule_cache", None) is not None:
            await engine._rule_cache.invalidate()
    except Exception as e:  # never fail a CRUD over cache invalidation
        log.warning(f"rule cache invalidation failed for tenant {tenant_id}: {e}")


@router.get("/api/rules")
async def list_rules(
    # v15-E3 (D8-B6): the autoreply page polls this list every 30s and the
    # query had NO bound — a tenant with a large rule book shipped every row
    # (plus per-rule reply-count GROUP BYs) on each poll. Default 50, max 200
    # (the same cap shape v14-E3 gave subscribers/broadcasts).
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db=Depends(get_db), current_user: User = Depends(get_current_user),
):
    _tid = current_user._tenant_id
    rows = await db.execute(
        select(Rule).where(Rule.tenant_id == _tid)
        .order_by(Rule.priority, Rule.id)
        .offset(offset).limit(limit)
    )
    rules = rows.scalars().all()
    counts_stmt = select(Reply.rule_id, func.count(Reply.id).label("cnt")).where(Reply.tenant_id == _tid).group_by(Reply.rule_id)
    counts = {row[0]: row[1] for row in (await db.execute(counts_stmt))}
    # v4 §5.19 — bot DM replies (messages.rule_id) join the per-rule stats;
    # before, only comment replies counted → rules looked idle while the
    # messenger bot answered everything.
    dm_counts_stmt = select(Message.rule_id, func.count(Message.id).label("cnt")).where(
        Message.tenant_id == _tid, Message.rule_id.isnot(None), Message.is_from_page == True
    ).group_by(Message.rule_id)
    for row in (await db.execute(dm_counts_stmt)):
        counts[row[0]] = counts.get(row[0], 0) + row[1]
    return ok(
        [{
        "id": r.id, "name": r.name, "keywords": r.keywords,
        "reply_template": r.reply_template,
        "dm_template": r.dm_template or "",
        "enabled": r.enabled, "description": r.description,
        "bot_type": "reply",
        "priority": getattr(r, "priority", 999),
        "replies_count": counts.get(r.id, 0),
    } for r in rules]
    )


@router.post("/api/rules")
async def create_rule(request: Request, db=Depends(get_db),
                      current_user: User = Depends(require_role("editor"))):
    p = await _rule_payload(request, require_priority=True)
    # v22-D3 (D3-B1): حد قواعد الرد قبل الإنشاء — سابقة get_plan_limits
    await _enforce_max_rules(db, current_user._tenant_id)
    # v4 §5.14 — priority is finally settable from the API/UI (was write-dead:
    # every rule defaulted to 999 and UI had no field)
    priority = max(1, min(999, p.priority or 999))
    kw_list = _keywords_list(p.keywords)
    rule = Rule(name=p.name, keywords=kw_list, reply_template=p.reply_template,
                description=p.description, dm_template=p.dm_template, priority=priority)
    rule.tenant_id = current_user._tenant_id
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    await _invalidate_engine_rules(current_user._tenant_id)
    return ok({"id": rule.id})


@router.put("/api/rules/{rule_id}")
async def update_rule(rule_id: int, request: Request, db=Depends(get_db),
                      current_user: User = Depends(require_role("editor"))):
    p = await _rule_payload(request, require_priority=False)
    rule = (await db.execute(
        select(Rule).where(Rule.id == rule_id, Rule.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "القاعدة غير موجودة")
    rule.name = p.name
    rule.keywords = _keywords_list(p.keywords)
    rule.reply_template = p.reply_template
    rule.dm_template = p.dm_template
    rule.description = p.description
    if p.priority is not None:
        rule.priority = max(1, min(999, p.priority))
    await db.commit()
    await _invalidate_engine_rules(current_user._tenant_id)
    return ok({"ok": True})


@router.delete("/api/rules/{rule_id}")
async def delete_rule(rule_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    rule = (await db.execute(
        select(Rule).where(Rule.id == rule_id, Rule.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "القاعدة غير موجودة")
    await db.delete(rule)
    await db.commit()
    await _invalidate_engine_rules(current_user._tenant_id)
    return ok({"ok": True})


@router.post("/api/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: int, db=Depends(get_db), current_user: User = Depends(require_role("editor"))):
    rule = (await db.execute(
        select(Rule).where(Rule.id == rule_id, Rule.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "القاعدة غير موجودة")
    rule.enabled = not rule.enabled
    await db.commit()
    await _invalidate_engine_rules(current_user._tenant_id)
    return ok({"enabled": rule.enabled})
