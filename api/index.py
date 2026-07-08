"""
Vercel serverless entrypoint for SmartBot FastAPI app.
"""
import os
import sys

# Ensure fb_dashboard is importable
_dash = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fb_dashboard")
if _dash not in sys.path:
    sys.path.insert(0, _dash)
    os.chdir(_dash)  # so SQLite data.db resolves relative to fb_dashboard

from runner import app
