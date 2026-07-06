"""
Root main.py — Render starts here (uvicorn main:app).
Delegates to fb_dashboard/runner.py.
"""
import os, sys

_dash = os.path.join(os.path.dirname(__file__), "fb_dashboard")
os.chdir(_dash)
sys.path.insert(0, _dash)

from runner import app
