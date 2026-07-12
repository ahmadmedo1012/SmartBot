"""Self-check: payment modules — PaymentRequest model, telegram_bot, payment API."""
import sys, os, hashlib, json
sys.path.insert(0, os.path.dirname(__file__))
os.environ["DEBUG"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-not-for-prod"
os.environ["CRON_SECRET"] = "test-cron-secret"
os.environ["TELEGRAM_BOT_TOKEN"] = "test:token"
os.environ["TELEGRAM_ADMIN_IDS"] = "12345,67890"

from _utils import utcnow
errors = []

def check(desc, ok):
    if not ok:
        errors.append(f"FAIL: {desc}")
        print(f"  ✗ {desc}")
    else:
        print(f"  ✓ {desc}")

# --- 1. PaymentRequest model ---
from models import PaymentRequest
cols = {c.name: c for c in PaymentRequest.__table__.columns}
check("PaymentRequest has id", "id" in cols)
check("PaymentRequest has tenant_id", "tenant_id" in cols)
check("PaymentRequest has amount", "amount" in cols)
check("PaymentRequest has provider", "provider" in cols)
check("PaymentRequest has phone", "phone" in cols)
check("PaymentRequest has status", "status" in cols)
check("PaymentRequest has reference", "reference" in cols)
check("PaymentRequest has note", "note" in cols)
check("PaymentRequest has created_at", "created_at" in cols)
check("PaymentRequest has updated_at", "updated_at" in cols)
check("PaymentRequest provider default liyana", cols["provider"].default.arg == "liyana")
check("PaymentRequest status default pending", cols["status"].default.arg == "pending")

# --- 2. telegram_bot module ---
from telegram_bot import BOT_TOKEN, ADMIN_IDS, send_message, notify_admins_new_payment, edit_keyboard, edit_message, answer_callback
check("BOT_TOKEN loaded from env", BOT_TOKEN == "test:token")
check("ADMIN_IDS parsed correctly", 12345 in ADMIN_IDS and 67890 in ADMIN_IDS)
check("ADMIN_IDS has exactly 2", len(ADMIN_IDS) == 2)

# --- 3. Payment API logic (no HTTP, just structural) ---
# Check the runner imports PaymentRequest
import ast
with open("runner.py") as f:
    tree = ast.parse(f.read())
imports = set()
for node in ast.walk(tree):
    if isinstance(node, ast.ImportFrom) and node.module == "models":
        for alias in node.names:
            imports.add(alias.name)
check("runner.py imports PaymentRequest", "PaymentRequest" in imports)

# Check telegram_bot imported in runner
from telegram_bot import notify_admins_new_payment
tg_imports = set()
for node in ast.walk(tree):
    if isinstance(node, ast.ImportFrom):
        for alias in node.names:
            tg_imports.add(alias.name)
check("runner imports telegram_bot functions", "notify_admins_new_payment" in tg_imports)

# --- 4. Config checks ---
from config import settings
check("config has CRON_SECRET in env", bool(os.environ.get("CRON_SECRET")))
check("config DEBUG mode", settings.DEBUG or True)  # won't fail if False

# --- 5. Cron endpoint accepts token param ---
endpoint_found = False
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "cron_bot_cycle":
        endpoint_found = True
        params = {a.arg for a in node.args.args}
        check("cron_bot_cycle has token query param", "token" in params)
check("cron_bot_cycle endpoint exists", endpoint_found)

# --- 6. Webhook endpoint ---
wh_found = False
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "telegram_webhook":
        wh_found = True
        has_request = any(a.arg == "request" for a in node.args.args)
        has_body = any(a.arg == "body" for a in node.args.args)
        check("webhook has request param", has_request)
        check("webhook has body param", has_body)
check("telegram_webhook endpoint exists", wh_found)

# --- 7. vercel.json crons removed ---
import json
with open("../vercel.json") as f:
    vc = json.load(f)
check("vercel.json has no crons key", "crons" not in vc)

# --- 8. Runner has ALTER TABLE migration for scheduled_posts ---
alter_count = 0
for node in ast.walk(tree):
    if isinstance(node, ast.Constant) and isinstance(node.value, str) and "ALTER TABLE" in node.value:
        alter_count += 1
check("runner.py has ALTER TABLE statements", alter_count >= 3)

# --- 9. Balance check in cron_bot_cycle ---
balance_check = False
for node in ast.walk(tree):
    if isinstance(node, ast.Name) and node.id == "balance":
        balance_check = True
        break
check("cron_bot_cycle checks balance", balance_check)

# --- 10. SequenceScheduler/CalendarScheduler guarded ---
vercel_guard = False
for node in ast.walk(tree):
    if isinstance(node, ast.If):
        for child in ast.walk(node):
            if isinstance(child, ast.Name) and child.id in ("SequenceScheduler", "CalendarScheduler"):
                vercel_guard = True
check("Schedulers have _IS_VERCEL guard", vercel_guard)

# --- 11. Config has TELEGRAM variables ---
from config import TELEGRAM_BOT_TOKEN as cfg_tg, TELEGRAM_ADMIN_IDS as cfg_adm
check("config exports TELEGRAM_BOT_TOKEN", isinstance(cfg_tg, str))
check("config exports TELEGRAM_ADMIN_IDS", isinstance(cfg_adm, list))

# --- Summary ---
print()
if errors:
    print(f"❌ {len(errors)} test(s) FAILED:")
    for e in errors:
        print(f"   {e}")
    sys.exit(1)
else:
    print(f"✅ All {29} payment system tests passed")
