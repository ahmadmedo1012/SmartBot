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
    traceback.print_exc()
    # Re-raise so Vercel reports FUNCTION_INVOCATION_FAILED
    raise
