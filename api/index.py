"""
Vercel entrypoint. Routes to fb_dashboard.runner.app.
"""
import os, sys
import traceback
_dash = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fb_dashboard")
if _dash not in sys.path:
    sys.path.insert(0, _dash)
try:
    from runner import app
except Exception:
    msg = "IMPORT CRASHED:\n" + traceback.format_exc()
    print(msg, flush=True)
    # Write to /tmp so logs can surface it
    with open("/tmp/vercel-import-error.txt", "w") as f:
        f.write(msg)
    raise
