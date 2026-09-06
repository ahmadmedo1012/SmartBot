from __future__ import annotations

"""AI & Agent routes: suggest, analyze, generate-reply, analyze-image, status, agent interpret, memory."""
import asyncio
import logging
import os
import secrets

from _responses import fail, ok
from database import get_db
from event_bus import event_bus
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile

from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["ai"])

STATIC_DIR = None


@router.post("/api/ai/suggest")
async def ai_suggest_replies(
    comment_text: str = Form(...), commenter_name: str = Form(""), page_context: str = Form(""),
    _=Depends(get_current_user),
):
    """Generate 3 AI-powered reply suggestions for a comment."""
    from _services import get_ai, refresh_ai_from_db
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
async def ai_analyze_tone(comment_text: str = Form(...), _=Depends(get_current_user)):
    """Analyze comment tone, sentiment, urgency."""
    from _services import get_ai, refresh_ai_from_db
    await refresh_ai_from_db()  # v4 §5.20 — keys may come from /admin/settings
    ai = get_ai()
    if not ai.available:
        raise HTTPException(400, "AI غير مفعل")
    result = await ai.analyze_tone(comment_text)
    return ok(result)


@router.post("/api/ai/generate-reply")
async def ai_generate_reply(
    comment_text: str = Form(...), commenter_name: str = Form(""),
    tone: str = Form(""), keywords: str = Form(""), _=Depends(require_role("editor")),
):
    """Generate one auto-reply with keyword context."""
    from _services import get_ai, refresh_ai_from_db
    await refresh_ai_from_db()  # v4 §5.20 — keys may come from /admin/settings
    ai = get_ai()
    if not ai.available:
        raise HTTPException(400, "AI غير مفعل")
    kw_list = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else None
    reply = await ai.generate_reply(comment_text, commenter_name, tone, kw_list)
    return ok({"reply": reply or ""})


@router.post("/api/ai/analyze-image")
async def ai_analyze_image(data: dict = Body(...), _=Depends(require_role("editor"))):
    from _services import get_ai, refresh_ai_from_db
    await refresh_ai_from_db()  # v4 §5.20 — keys may come from /admin/settings
    ai = get_ai()
    if not ai.available:
        raise HTTPException(status_code=503, detail="AI provider is not available")
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
    from runner import STATIC_DIR as _STATIC_DIR
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
        img_filename = f"agent_{secrets.token_hex(8)}.jpg"
        # v8-A4: Vercel's function filesystem is READ-ONLY outside /tmp —
        # writing into STATIC_DIR 500s in production. Mirror the proven
        # payments.py pattern: embed a data-URI on serverless, write the
        # file only on a writable (local/standalone) filesystem.
        _is_vercel = bool(os.getenv("VERCEL"))
        if _is_vercel:
            import base64
            image_url = f"data:image/jpeg;base64,{base64.b64encode(payload).decode()}"
        else:
            img_path = _STATIC_DIR / "uploads" / img_filename
            img_path.parent.mkdir(parents=True, exist_ok=True)
            img_path.write_bytes(payload)
            image_url = f"/static/uploads/{img_filename}"

    try:
        # v4 §3.6 — pass the tenant so agent context counts are scoped
        result = await agent.process(text, image_url=image_url, username=current_user.username, db=db, tenant_id=current_user._tenant_id)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        log.error(f"agent.process failed: {e}\n{tb}")
        # v8-A8: envelope contract (ok/fail) + never leak internal exception
        # detail (the old str(e)[:200] reached the client verbatim).
        return fail("حدث خطأ أثناء معالجة طلب المساعد الذكي — حاول مرة أخرى")

    # v8-A2: emit scoped to THIS tenant — the old global broadcast delivered
    # the full agent reply to every authenticated SSE subscriber.
    asyncio.create_task(event_bus.emit("agent_message", {
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
    """View current agent session history + user memory."""
    import agent_memory as amem
    session = await amem.get_session(db, current_user.username)
    user = await amem.get_user_memory(db, current_user.username)
    return ok({"session": session[-10:], "user_memory": user})


@router.post("/api/agent/memory/clear")
async def agent_clear_memory(db=Depends(get_db), current_user=Depends(get_current_user)):
    """Reset session history (keeps user memory/preferences)."""
    import agent_memory as amem
    await amem.clear_session(db, current_user.username)
    return ok({"ok": True, "message": "تم مسح الذاكرة المؤقتة ✅"})
