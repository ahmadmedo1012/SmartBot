"""
Vercel entrypoint. Routes to fb_dashboard.runner.app.
"""
import os, sys
import logging
_dash = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fb_dashboard")
if _dash not in sys.path:
    sys.path.insert(0, _dash)
# ponytail: CWD not changed — all paths in runner.py use __file__-relative or env-configured
from runner import app
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("vercel-entry")
log.info("SmartBot Vercel entry loaded")
