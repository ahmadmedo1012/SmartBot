#! /home/ahmed/.local/bin/uv run
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "requests",
# ]
# ///
"""
Facebook Auto-Reply Bot — standalone CLI version.
Mirrors the modular engine from fb_dashboard/bot.py but uses
requests (sync) and a simpler file-based state.

Usage:  uv run auto_reply.py          # polling mode (every 10s)
        uv run auto_reply.py --once   # single run
        uv run auto_reply.py --bg     # background (nohup)
"""
import json, os, sys, time, logging, hashlib
from pathlib import Path

TOKEN = os.getenv("FACEBOOK_ACCESS_TOKEN") or ""
PAGE_ID = os.getenv("FACEBOOK_PAGE_ID") or ""
BASE_DIR = Path(__file__).parent
RULES_FILE = BASE_DIR / "facebook_automation.json"
STATE_FILE = BASE_DIR / ".replied_comments.json"
LOG_FILE = BASE_DIR / "facebook_automation.log"

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler(LOG_FILE, encoding="utf-8"), logging.StreamHandler()]
)
log = logging.getLogger("fb-bot")

# --- HTTP ---
_req = None
def _import_requests():
    global _req
    if _req is None:
        import requests as _req
    return _req

def graph_get(path, params=None):
    r = _import_requests().get(
        f"https://graph.facebook.com/v22.0/{path}",
        params={"access_token": TOKEN, **(params or {})}, timeout=15)
    if r.status_code != 200:
        log.error(f"GET err {r.status_code}: {r.text[:200]}")
        return None
    return r.json()

def graph_post(path, data=None):
    r = _import_requests().post(
        f"https://graph.facebook.com/v22.0/{path}",
        data={"access_token": TOKEN, **(data or {})}, timeout=15)
    if r.status_code != 200:
        log.error(f"POST err {r.status_code}: {r.text[:200]}")
        return None
    return r.json()

# --- State (file-based) ---
def load_state() -> set:
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return set(json.load(f))
    return set()

def save_state(state: set):
    with open(STATE_FILE, "w") as f:
        json.dump(sorted(state), f, ensure_ascii=False, indent=2)

# --- Name extraction ---
def get_commenter_name(comment: dict) -> str:
    from_data = comment.get("from", {})
    full = from_data.get("name", "") or ""
    username = from_data.get("username", "") or ""
    if full: return full
    if username: return username
    uid = from_data.get("id", "")
    return f"مستخدم{uid[-4:]}" if uid else "صديقنا"

def get_first_name(comment: dict) -> str:
    return get_commenter_name(comment).split()[0]

# --- Text Normalizer ---
_ALEF = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا"})
_TAH = str.maketrans({"ة": "ه"})
_YEH = str.maketrans({"ى": "ي", "ئ": "ي"})
_WAW = str.maketrans({"ؤ": "و"})
_DIAC = "ًٌٍَُِّْ"

def normalize_text(text: str) -> str:
    t = text.lower().strip()
    t = t.translate(_ALEF).translate(_TAH).translate(_YEH).translate(_WAW)
    for ch in _DIAC:
        t = t.replace(ch, "")
    return t

# --- Stop words ---
_STOP_WORDS = frozenset({
    "في", "من", "إلى", "على", "عن", "مع", "كان", "هذا", "هذه", "ذلك",
    "هو", "هي", "هم", "الذي", "التي", "من", "ما", "لم", "لن", "سوف",
    "قد", "لقد", "إن", "أن", "لا", "كل", "بعض", "نعم", "بلى", "ثم",
    "أو", "أم", "بل", "لأن", "حتى", "عند", "بين", "خلال", "دون", "غير",
    "مثل", "حول", "بسبب", "رغم", "قبل", "بعد", "فوق", "تحت", "فقط",
})

# --- Intent Classifier ---
_NEG = {"غش", "نصب", "خايس", "فظيع", "سيء", "رديء", "weak",
    "terrible", "scam", "زبالة", "مقرف", "disgusting", "worst",
    "horrible", "broken", "احتيال", "محتال", "fake", "fraud",
    "خسارة", "فاشل", "فشل", "failure", "cheat"}
_POS = {"جميل", "رائع", "حلو", "nice", "great", "awesome",
    "ممتاز", "excellent", "amazing", "fantastic", "مبدع", "ابداع",
    "love", "loved", "best", "wonderful"}
_Q = {"كم", "سعر", "price", "how", "what", "أين", "وين", "متى",
    "كيف", "question", "query", "سؤال", "استفسار", "help", "مساعدة"}
_CON = {"رقم", "واتساب", "whatsapp", "تواصل", "message", "contact",
    "dm", "رسالة", "ارسل", "call", "phone", "telegram"}

def classify_intent(text: str) -> str:
    words = set(text.lower().strip().split())
    if words & _NEG: return "negative"
    if words & _CON: return "contact"
    if words & _Q: return "question"
    if words & _POS: return "positive"
    return "neutral"

# --- Rule Matcher ---
class RuleMatcher:
    def __init__(self, rules: list[dict]):
        self._rules = []
        self._catch_all = None
        for r in sorted(rules, key=lambda x: x.get("priority", 999)):
            kw = r["keywords"]
            if not kw or kw == ["__catch_all__"]:
                self._catch_all = r
                continue
            norm_kw = []
            for k in kw:
                kl = k.lower().strip()
                if kl in _STOP_WORDS: continue
                norm_kw.append((kl, normalize_text(kl)))
            if norm_kw:
                r["_norm_kw"] = norm_kw
                self._rules.append(r)

    def match(self, text: str) -> dict | None:
        if not text:
            return None
        t_lower = text.lower().strip()
        t_norm = normalize_text(t_lower)
        for r in self._rules:
            for raw, norm in r.get("_norm_kw", []):
                if raw in t_lower or norm in t_norm:
                    return {"reply": r["reply"], "id": r["id"], "dm_template": r.get("dm_template", "")}
        if self._catch_all:
            return {"reply": self._catch_all["reply"], "id": self._catch_all.get("id", "__catch_all__"), "dm_template": self._catch_all.get("dm_template", "")}
        return None

# --- Template Renderer ---
def render_reply(template: str, name: str, full_name: str = "", username: str = "",
                 msg: str = "", user_id: str = "") -> str:
    mention = f"@[{user_id}]" if user_id else name
    return (template
        .replace("{name}", name)
        .replace("{full_name}", full_name or name)
        .replace("{username}", username or name)
        .replace("{message}", msg[:100])
        .replace("{mention}", mention))

# --- Dedup ---
_processing_lock: set[str] = set()
_cooldowns: dict[str, float] = {}
_cooldown_secs = 60

# --- Main pipeline ---
def get_recent_comment_details():
    cfg = json.loads(open(RULES_FILE, encoding="utf-8").read())
    max_posts = cfg["settings"].get("max_posts_to_check", 10)
    result = {}
    posts = graph_get(f"{PAGE_ID}/posts", {"limit": max_posts, "fields": "id"})
    if not posts:
        return result
    for p in posts.get("data", []):
        comments = graph_get(f"{p['id']}/comments", {
            "limit": 50, "fields": "id,message,from{name,id},created_time"
        })
        if not comments:
            continue
        for c in comments.get("data", []):
            result[c["id"]] = {
                "post_id": p["id"],
                "message": c.get("message", "").strip(),
                "from": c.get("from", {}),
            }
    return result

def run_once() -> int:
    cfg = json.loads(open(RULES_FILE, encoding="utf-8").read())
    matcher = RuleMatcher(cfg["rules"])
    replied_ids = load_state()
    replied = 0
    now = time.time()
    comments = get_recent_comment_details()

    for cid, info in comments.items():
        msg = info["message"]
        if not msg: continue
        if cid in replied_ids: continue

        h = hashlib.sha256(f"{cid}:{msg.strip()}".encode()).hexdigest()
        if h in _processing_lock: continue
        _processing_lock.add(h)

        try:
            match = matcher.match(msg)
            if not match: continue

            from_data = info.get("from", {})
            name = get_first_name(info)
            full_name = get_commenter_name(info)
            username = from_data.get("username", "") or ""
            uid = str(from_data.get("id", ""))

            # Cooldown
            if uid and uid in _cooldowns and now - _cooldowns[uid] < _cooldown_secs:
                log.debug(f"Cooldown for {name} ({uid})")
                continue
            if uid: _cooldowns[uid] = now

            intent = classify_intent(msg)
            reply_text = render_reply(match["reply"], name, full_name, username, msg, uid)
            log.info(f"Match [{match.get('id','?')}] {intent}: \"{msg[:50]}\" → {name}")

            replied_ids.add(cid)
            save_state(replied_ids)

            r = graph_post(f"{cid}/comments", {"message": reply_text})
            if r:
                replied += 1
                log.info(f"  ✓ {name}: \"{reply_text[:50]}\"")
                # Send DM if dm_template configured
                dm_template = match.get("dm_template", "")
                if dm_template and uid:
                    dm_text = render_reply(dm_template, name, full_name, username, msg, uid)
                    dm_r = graph_post(f"{PAGE_ID}/messages", {
                        "recipient": json.dumps({"id": uid}),
                        "message": json.dumps({"text": dm_text}),
                        "messaging_type": "MESSAGE_TAG",
                        "tag": "BUSINESS_EXPOSURE",
                    })
                    if dm_r:
                        log.info(f"  ✉️ DM sent to {name} ({uid})")
                    else:
                        log.warning(f"  ✉️ DM failed for {uid}")
            else:
                log.warning(f"  ✗ Failed to reply to {cid}")
        finally:
            _processing_lock.discard(h)

    if replied:
        log.info(f"→ Replied to {replied} comment(s)")
    return replied

def main():
    if "--once" in sys.argv:
        run_once()
        return
    if "--bg" in sys.argv:
        pid = os.fork()
        if pid > 0:
            print(f"Bot started in background (PID {pid})")
            sys.exit(0)
    cfg = json.loads(open(RULES_FILE, encoding="utf-8").read())
    interval = cfg["settings"].get("check_interval_seconds", 10)
    log.info(f"🤖 FB Auto-Reply Bot started — checking every {interval}s")
    run_once()
    while True:
        time.sleep(interval)
        try:
            run_once()
        except Exception as e:
            log.error(f"Loop err: {e}", exc_info=True)
            time.sleep(interval * 3)

if __name__ == "__main__":
    if not TOKEN or not PAGE_ID:
        log.error("FACEBOOK_ACCESS_TOKEN and FACEBOOK_PAGE_ID required")
        sys.exit(1)
    main()
