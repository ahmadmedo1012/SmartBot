"""
Root-level main.py — Render imports this as 'main:app'.
Changes CWD and sys.path to fb_dashboard/ then re-exports app
from the inner main module (via _app shim to avoid circular import).
"""
import os, sys
from pathlib import Path

_dash = str(Path(__file__).resolve().parent / "fb_dashboard")
os.chdir(_dash)
sys.path[:0] = [_dash]

# _app.py (inside fb_dashboard/) imports ./main properly
from _app import app
