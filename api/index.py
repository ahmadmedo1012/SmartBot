"""
Vercel entrypoint. Routes to fb_dashboard.runner.app.
"""
import os
import sys

_dash = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fb_dashboard")
if _dash not in sys.path:
    sys.path.insert(0, _dash)

# Vercel's FastAPI adapter imports `app` FROM THIS MODULE — the function's
# public export. The bare `from runner import app` was removed by a ruff
# F401 auto-fix (v5 §2) which treated it as an unused import and silently
# broke every API deployment for hours (old code kept serving; the build
# did not flag it). The explicit `as app` re-export form is the pattern
# ruff respects as intentional — and a test now guards it (v5 §9).
from runner import app as app  # noqa: F401
