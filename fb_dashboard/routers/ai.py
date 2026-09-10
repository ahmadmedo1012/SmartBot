from __future__ import annotations

"""AI & Agent routes: suggest, analyze, generate-reply, analyze-image, status, agent interpret, memory."""
import logging
import os

from _async import spawn  # v9-A11: GC-safe background tasks
from _responses import fail, ok
from database import get_db
from event_bus import event_bus
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from models import User

from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["ai"])

STATIC_DIR = None

# v24-C4 (H2 — AI cost abuse): /api/ai/suggest + /api/ai/analyze were open to
# the VIEWER role with no per-user limit — a viewer (or any compromised
# session) could drive unlimited paid LLM calls; only the global per-IP
# 30-mutations/60s middleware cap applied. Both fixes follow the house
# precedents: require_role("editor") (like /api/ai/generate-reply) and the
# change-password per-user DB-backed limiter (auth.py) — 30/day/user/tenant,
# env-tunable ops knob like SMARTBOT_MUTATE_RATE_LIMIT. DB-backed (not
# in-memory) because Vercel runs multiple instances.
_AI_DAILY_MAX = int(os.getenv("SMARTBOT_AI_DAILY_LIMIT", "30"))
_AI_DAILY_WINDOW_S = 86400


async def _ai_daily_budget(db, current_user: User) -> None:
    """v24-C4 (H2): raise 429 once the user's daily AI-call budget is spent.

    Keyed per (tenant, user) — NOT per-IP (the abuser here owns the session).
    Runs BEFORE any provider call so a capped user costs nothing; like the
    change-password precedent, the limiter commits the request session, which
    is safe because AI endpoints stage no writes before this point."""
    from _rate_limit import check_rate_limit
    if not await check_rate_limit(
        db, f"ai:{current_user._tenant_id}:{current_user.id}",
        max_attempts=_AI_DAILY_MAX, window_seconds=_AI_DAILY_WINDOW_S,
    ):
        raise HTTPException(
            429, f"تم الوصول إلى الحد اليومي لطلبات الذكاء الاصطناعي ({_AI_DAILY_MAX}) — حاول غداً")


@router.post("/api/ai/suggest")
async def ai_suggest_replies(
    comment_text: str = Form(...), commenter_name: str = Form(""), page_context: str = Form(""),
    db=Depends(get_db), current_user: User = Depends(require_role("editor")),
):
    """Generate 3 AI-powered reply suggestions for a comment."""
    from _services import get_ai, refresh_ai_from_db
    await _ai_daily_budget(db, current_user)  # v24-C4 (H2)
    await refresh_ai_from_db()  # v4 §5.20 — keys may come from /admin/settings
    ai = get_ai()
    if not ai.available:
        raise HTTPException(400, "AI غير مفعل — قم بتعيين OPENAI_API_KEY أو GEMINI_API_KEY في المتغيرات")
    t0 = __import__("time").time()
    result = await ai.suggest_replies(comment_text, commenter_name, page_context)
    latency = int((__import__("time").time() - t0) * 1000)
    return ok(
        {"suggestions": result.get("suggestions", []), "intent": result.get("intent", ""),
            "sentiment": result.get("sentiment", ""), "confidence": result.get("confidence", 0), "latency_ms": latency}
    )


@router.post("/api/ai/analyze")
async def ai_analyze_tone(comment_text: str = Form(...), db=Depends(get_db),
                          current_user: User = Depends(require_role("editor"))):
    """Analyze comment tone, sentiment, urgency."""
    from _services import get_ai, refresh_ai_from_db
    await _ai_daily_budget(db, current_user)  # v24-C4 (H2)
    await refresh_ai_from_db()  # v4 §5.20 — keys may come from /admin/settings
    ai = get_ai()
    if not ai.available:
        raise HTTPException(400, "AI غير مفعل")
    result = await ai.analyze_tone(comment_text)
    return ok(result)


@router.post("/api/ai/generate-reply")
async def ai_generate_reply(
    comment_text: str = Form(...), commenter_name: str = Form(""),
    tone: str = Form(""), keywords: str = Form(""), db=Depends(get_db),
    current_user: User = Depends(require_role("editor")),
):
    """Generate one auto-reply with keyword context.

    v23: an empty reply now carries the WHY (ai.last_error) — the silent
    empty-string answer was exactly the owner's «AI doesn't work and I
    can't tell why» complaint (403 region / quota / model errors were all
    indistinguishable)."""
    from _services import get_ai, refresh_ai_from_db
    await _ai_daily_budget(db, current_user)  # v24-C4 (H2): same budget as its siblings
    await refresh_ai_from_db()  # v4 §5.20 — keys may come from /admin/settings
    ai = get_ai()
    if not ai.available:
        raise HTTPException(400, "AI غير مفعل")
    kw_list = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else None
    reply = await ai.generate_reply(comment_text, commenter_name, tone, kw_list)
    out = {"reply": reply or ""}
    if not reply:
        out["error"] = ai.last_error or "المزوّد لم يرجع رداً"
    return ok(out)


@router.post("/api/ai/analyze-image")
async def ai_analyze_image(data: dict = Body(...), db=Depends(get_db),
                           current_user: User = Depends(require_role("editor"))):
    from _services import get_ai, refresh_ai_from_db
    await _ai_daily_budget(db, current_user)  # v24-C4 (H2): same budget as its siblings
    await refresh_ai_from_db()  # v4 §5.20 — keys may come from /admin/settings
    ai = get_ai()
    if not ai.available:
        raise HTTPException(status_code=503, detail="خدمة الذكاء الاصطناعي غير متاحة حالياً")
    text = data.get("text", "")
    prompt = f"حلل هذا الطلب: {text}\n\nماذا يحتوي؟ قدم وصف مختصر بالعربية"
    try:
        if ai._provider == "openai" and ai._openai_client:
            r = await ai._openai_client.chat.completions.create(
                model=ai._openai_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=100, temperature=0.3,
            )
            return ok({"analysis": (r.choices[0].message.content or "").strip()[:100]})
        elif ai._provider == "gemini" and ai._google_module:
            model = ai._google_module.GenerativeModel(ai._model)
            r = await model.generate_content_async(prompt)
            return ok({"analysis": (r.text or "").strip()[:100]})
    except Exception:
        pass
    return ok({"analysis": ""})


@router.get("/api/ai/status")
async def ai_status(_=Depends(get_current_user)):
    """Check AI provider status."""
    from _services import get_ai, refresh_ai_from_db
    await refresh_ai_from_db()  # v4 §5.20 — keys may come from /admin/settings
    ai = get_ai()
    return ok({"available": ai.available, "provider": ai.provider_name})


@router.post("/api/agent/interpret")
async def agent_interpret(
    text: str = Form(...),
    image: UploadFile | None = File(None),
    has_image: str = Form(""),
    db=Depends(get_db),
    current_user=Depends(require_role("editor")),
):
    """AI Agent: interpret Arabic command, auto-execute via brain+tools+memory."""
    from agent_engine import get_agent

    # v24-R4 F5: the 5th AI surface joins its siblings' budget (editor gate
    # was already here; the daily cap was not — a viewer-turned-editor or a
    # script could run unbounded paid LLM calls through the agent path).
    await _ai_daily_budget(db, current_user)
    agent = get_agent()

    image_url = ""
    if image and has_image == "true":
        # SECURITY (2026-09-05): re-encode with Pillow and use a FIXED .jpg
        # extension — the old code trusted the client content-type and the
        # user-controlled filename extension, so "photo.png" + evil.html payload
        # wrote an HTML file into the PUBLIC /static mount (stored XSS).
        ctype = (image.content_type or "").lower()
        if ctype not in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
            raise HTTPException(400, "صيغة الصورة غير مدعومة")
        img_data = await image.read()
        if len(img_data) > 10 * 1024 * 1024:
            raise HTTPException(400, "حجم الصورة يتجاوز 10 ميغابايت")
        try:
            import io

            from PIL import Image
            img = Image.open(io.BytesIO(img_data))
            img.load()
            img = img.convert("RGB")
            if max(img.size) > 1600:
                img.thumbnail((1600, 1600))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85)
            payload = buf.getvalue()
        except Exception:
            raise HTTPException(400, "الملف ليس صورة صالحة") from None
        # v24-R3 follow-up (B2 H-1 + functional bug): the image_url consumers
        # are (a) ai_service.analyze_image — which accepts ONLY https:// URLs
        # or data: URIs (v14-E1 #7 removed local-file support as an LLM-
        # controllable disclosure path), and (b) publisher engines that never
        # attach the image. The old non-Vercel branch wrote the JPEG into the
        # PUBLIC /static mount and set a RELATIVE /static/uploads/… URL —
        # which analyze_image REFUSES, so agent image analysis silently never
        # ran on single-server deployments, while the bytes sat world-
        # readable. One uniform behavior closes both: data-URI everywhere.
        # No disk write, no public exposure, works on every deployment.
        import base64
        image_url = f"data:image/jpeg;base64,{base64.b64encode(payload).decode()}"

    try:
        # v4 §3.6 — pass the tenant so agent context counts are scoped.
        # v10-A2 — pass the CALLER's role so the engine's tool gate can
        # refuse platform-level actions (stop platform bot, publish via the
        # platform token) for non-admin callers (HIGH#4).
        result = await agent.process(text, image_url=image_url, username=current_user.username,
                                     db=db, tenant_id=current_user._tenant_id,
                                     role=current_user.role)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        log.error(f"agent.process failed: {e}\n{tb}", exc_info=True)
        # v8-A8: envelope contract (ok/fail) + never leak internal exception
        # detail (the old str(e)[:200] reached the client verbatim).
        return fail("حدث خطأ أثناء معالجة طلب المساعد الذكي — حاول مرة أخرى")

    # v8-A2: emit scoped to THIS tenant — the old global broadcast delivered
    # the full agent reply to every authenticated SSE subscriber.
    spawn(event_bus.emit("agent_message", {
        "role": "agent", "text": result.get("response_ar", ""),
        "action": result.get("action", "unknown"),
        "success": result.get("success", False),
    }, tenant_id=current_user._tenant_id))

    return ok({
        "action": result.get("action", "unknown"),
        "params": result.get("params", {}),
        "response_ar": result.get("response_ar", ""),
        "data": result.get("data", {}),
    })


@router.get("/api/agent/memory")
async def agent_get_memory(db=Depends(get_db), current_user=Depends(get_current_user)):
    """View current agent session history + user memory (v9-A4: tenant-scoped keys)."""
    import agent_memory as amem
    tid = current_user._tenant_id
    session = await amem.get_session(db, current_user.username, tid)
    user = await amem.get_user_memory(db, current_user.username, tid)
    return ok({"session": session[-10:], "user_memory": user})


@router.post("/api/agent/memory/clear")
async def agent_clear_memory(db=Depends(get_db), current_user=Depends(get_current_user)):
    """Reset session history (keeps user memory/preferences) — tenant-scoped (v9-A4)."""
    import agent_memory as amem
    await amem.clear_session(db, current_user.username, current_user._tenant_id)
    return ok({"ok": True, "message": "تم مسح الذاكرة المؤقتة ✅"})
