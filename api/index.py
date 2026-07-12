"""
Vercel entrypoint. Routes to fb_dashboard.runner.app.
"""
import os, sys
_dash = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fb_dashboard")
if _dash not in sys.path:
    sys.path.insert(0, _dash)
from runner import app
