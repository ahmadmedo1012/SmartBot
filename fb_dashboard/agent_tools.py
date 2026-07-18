from __future__ import annotations
"""
Agent Tools — all capabilities as registered tools with risk classification.
Tools are referenced by agent_brain.py for LLM orchestration.
"""
from typing import Any

# ── Risk levels ──
RISK_READ_ONLY = "read_only"
RISK_REVERSIBLE = "reversible"
RISK_IRREVERSIBLE = "irreversible"

TOOL_DEFINITIONS = [
    {
        "name": "publish_post",
        "description": "Publish a Facebook post. Content is AI-enhanced automatically before publishing.",
        "risk": RISK_REVERSIBLE,
        "auto_exec": True,
        "params": {
            "message": {"type": "string", "description": "نص المنشور (يحسّن تلقائياً)"},
            "image_url": {"type": "string", "description": "رابط الصورة (اختياري)", "optional": True},
            "scheduled_at": {"type": "string", "description": "موعد النشر المبرمج (ISO 8601)", "optional": True},
        },
    },
    {
        "name": "reply_to_comment",
        "description": "Reply to a Facebook comment. If no message given, agent writes one.",
        "risk": RISK_REVERSIBLE,
        "auto_exec": True,
        "params": {
            "comment_id": {"type": "string", "description": "معرف التعليق على فيسبوك"},
            "message": {"type": "string", "description": "نص الرد (اختياري — الوكيل يكتب رد ذكي)", "optional": True},
        },
    },
    {
        "name": "analyze_comment",
        "description": "Analyze comment sentiment, intent, urgency. Read-only.",
        "risk": RISK_READ_ONLY,
        "auto_exec": True,
        "params": {
            "comment_text": {"type": "string", "description": "نص التعليق للتحليل"},
        },
    },
    {
        "name": "enhance_content",
        "description": "Rewrite or improve text without publishing. Read-only.",
        "risk": RISK_READ_ONLY,
        "auto_exec": True,
        "params": {
            "text": {"type": "string", "description": "النص الأصلي"},
            "style": {"type": "string", "description": "النبرة المطلوبة (تسويقي، مهذب، عادي)", "optional": True},
        },
    },
    {
        "name": "image_analyze",
        "description": "Analyze an image and generate a suitable caption/description.",
        "risk": RISK_READ_ONLY,
        "auto_exec": True,
        "params": {
            "image_url": {"type": "string", "description": "رابط الصورة"},
        },
    },
    {
        "name": "create_rule",
        "description": "Create an auto-reply rule with keywords and templates.",
        "risk": RISK_REVERSIBLE,
        "auto_exec": True,
        "params": {
            "name": {"type": "string", "description": "اسم القاعدة"},
            "keywords": {"type": "array", "description": "كلمات مفتاحية للكشف", "items": {"type": "string"}},
            "reply_template": {"type": "string", "description": "نص الرد التلقائي"},
            "dm_template": {"type": "string", "description": "نص خاص (اختياري)", "optional": True},
        },
    },
    {
        "name": "toggle_bot",
        "description": "Start or stop the auto-reply bot.",
        "risk": RISK_REVERSIBLE,
        "auto_exec": True,
        "params": {
            "action": {"type": "string", "enum": ["start", "stop"], "description": "تشغيل أو إيقاف"},
        },
    },
    {
        "name": "list_stats",
        "description": "Show bot statistics and performance data. Read-only.",
        "risk": RISK_READ_ONLY,
        "auto_exec": True,
        "params": {},
    },
    {
        "name": "system",
        "description": "System commands — change interval, view settings.",
        "risk": RISK_IRREVERSIBLE,
        "auto_exec": True,
        "params": {
            "command": {"type": "string", "description": "الأمر (interval, settings, status)"},
            "args": {"type": "string", "description": "مدخلات الأمر", "optional": True},
        },
    },
]

TOOL_MAP: dict[str, dict] = {t["name"]: t for t in TOOL_DEFINITIONS}


def get_tool(name: str) -> dict | None:
    """Get tool definition by name."""
    return TOOL_MAP.get(name)


def get_tool_schema(name: str) -> dict | None:
    """Return JSON Schema for a tool's params (for jsonschema validation)."""
    t = TOOL_MAP.get(name)
    if not t:
        return None
    props = {}
    required = []
    for pn, pv in t["params"].items():
        js_type = pv.get("type", "string")
        # map agent_tools types to JSON Schema types
        schema_type = "array" if js_type == "array" else "object" if js_type == "object" else "string"
        entry = {"type": schema_type, "description": pv.get("description", "")}
        if schema_type == "array" and "items" in pv:
            entry["items"] = pv["items"]
        if pv.get("enum"):
            entry["enum"] = pv["enum"]
        props[pn] = entry
        if not pv.get("optional"):
            required.append(pn)
    return {"type": "object", "properties": props, "required": required} if required else {"type": "object", "properties": props}


def get_tools_system_prompt() -> str:
    """Render tools section for the LLM system prompt."""
    lines = ["## الأدوات المتاحة:"]
    for t in TOOL_DEFINITIONS:
        params_desc = []
        for pn, pv in t["params"].items():
            opt = " (اختياري)" if pv.get("optional") else ""
            params_desc.append(f"  - {pn}: {pv['description']}{opt}")
        lines.append(f"\n### {t['name']} ({t['risk']})")
        lines.append(f"   {t['description']}")
        lines.extend(params_desc)
    lines.append("\n⚠️ auto_exec = True لكل الأدوات — تنفيذ مباشر بدون تأكيد.")
    return "\n".join(lines)
