from __future__ import annotations
"""AI & Agent routes: suggest, analyze, generate-reply, analyze-image, status, agent interpret, memory."""
import asyncio
import secrets
import logging
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, Query, HTTPException, Form, Body, UploadFile, File
from sqlalchemy import select, func, desc

from config import settings
from database import get_db
from routers.auth import get_current_user, require_role

from event_bus import event_bus

log = logging.getLogger("fb-api")
router = APIRouter(tags=["ai"])

STATIC_DIR = None


@router.post("/api/ai/suggest")
async def ai_suggest_replies(
    comment_text: str = Form(...), commenter_name: str = Form(""), page_context: str = Form(""),
    _=Depends(get_current_user),
):
    """Generate 3 AI-powered reply suggestions for a comment."""
    from _services import get_ai
    ai = get_ai()
    if not ai.available:
        raise HTTPException(400, "AI غير مفعل — قم بتعيين OPENAI_API_KEY أو GEMINI_API_KEY في المتغيرات")
    t0 = __import__("time").time()
    result = await ai.suggest_replies(comment_text, commenter_name, page_context)
    latency = int((__import__("time").time() - t0) * 1000)
    return {"suggestions": result.get("suggestions", []), "intent": result.get("intent", ""),
            "sentiment": result.get("sentiment", ""), "confidence": result.get("confidence", 0), "latency_ms": latency}


@router.post("/api/ai/analyze")
async def ai_analyze_tone(comment_text: str = Form(...), _=Depends(get_current_user)):
    """Analyze comment tone, sentiment, urgency."""
    from _services import get_ai
    ai = get_ai()
    if not ai.available:
        raise HTTPException(400, "AI غير مفعل")
    result = await ai.analyze_tone(comment_text)
    return result


@router.post("/api/ai/generate-reply")
async def ai_generate_reply(
    comment_text: str = Form(...), commenter_name: str = Form(""),
    tone: str = Form(""), keywords: str = Form(""), _=Depends(require_role("editor")),
):
    """Generate one auto-reply with keyword context."""
    from _services import get_ai
    ai = get_ai()
    if not ai.available:
        raise HTTPException(400, "AI غير مفعل")
    kw_list = [k.strip() for k in keywords.split(",") if k.strip()] if keywords else None
    reply = await ai.generate_reply(comment_text, commenter_name, tone, kw_list)
    return {"reply": reply or ""}


@router.post("/api/ai/analyze-image")
async def ai_analyze_image(data: dict = Body(...), _=Depends(require_role("editor"))):
    from _services import get_ai
    ai = get_ai()
    if not ai.available:
        return {"analysis": ""}
    text = data.get("text", "")
    prompt = f"حلل هذا الطلب: {text}\n\nماذا يحتوي؟ قدم وصف مختصر بالعربية"
    try:
        if ai._provider == "openai" and ai._openai_client:
            r = await ai._openai_client.chat.completions.create(
                model=ai._openai_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=100, temperature=0.3,
            )
            return {"analysis": (r.choices[0].message.content or "").strip()[:100]}
        elif ai._provider == "gemini" and ai._google_module:
            model = ai._google_module.GenerativeModel(ai._model)
            r = await model.generate_content_async(prompt)
            return {"analysis": (r.text or "").strip()[:100]}
    except Exception:
        pass
    return {"analysis": ""}


@router.get("/api/ai/status")
async def ai_status(_=Depends(get_current_user)):
    """Check AI provider status."""
    from _services import get_ai
    ai = get_ai()
    return {"available": ai.available, "provider": ai.provider_name}


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
        allowed_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
        if image.content_type not in allowed_types:
            raise HTTPException(400, f"Unsupported file type: {image.content_type}")

        img_data = await image.read()
        if len(img_data) > 10 * 1024 * 1024:
            raise HTTPException(400, "Image too large — max 10 MB")

        ext = PurePosixPath(image.filename or "photo.jpg").suffix or ".jpg"
        img_filename = f"agent_{secrets.token_hex(8)}{ext}"
        img_path = _STATIC_DIR / "uploads" / img_filename
        img_path.parent.mkdir(parents=True, exist_ok=True)
        img_path.write_bytes(img_data)
        image_url = f"/static/uploads/{img_filename}"

    try:
        result = await agent.process(text, image_url=image_url, username=current_user.username, db=db)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        log.error(f"agent.process failed: {e}\n{tb}")
        return {"action": "error", "params": {}, "response_ar": f"خطأ: {str(e)[:200]}",
                "data": {}, "success": False}

    asyncio.create_task(event_bus.emit("agent_message", {
        "role": "agent", "text": result.get("response_ar", ""),
        "action": result.get("action", "unknown"),
        "success": result.get("success", False),
    }))

    return {
        "action": result.get("action", "unknown"),
        "params": result.get("params", {}),
        "response_ar": result.get("response_ar", ""),
        "data": result.get("data", {}),
        "success": result.get("success", False),
    }


@router.get("/api/agent/memory")
async def agent_get_memory(db=Depends(get_db), current_user=Depends(get_current_user)):
    """View current agent session history + user memory."""
    import agent_memory as amem
    session = await amem.get_session(db, current_user.username)
    user = await amem.get_user_memory(db, current_user.username)
    return {"session": session[-10:], "user_memory": user}


@router.post("/api/agent/memory/clear")
async def agent_clear_memory(db=Depends(get_db), current_user=Depends(get_current_user)):
    """Reset session history (keeps user memory/preferences)."""
    import agent_memory as amem
    await amem.clear_session(db, current_user.username)
    return {"ok": True, "message": "تم مسح الذاكرة المؤقتة ✅"}
