"""
Root-level main.py — Render imports this as 'main:app'.
Delegates to fb_dashboard/main.py via importlib to avoid name collision.
"""
import os, sys, importlib
from pathlib import Path

_dash = Path(__file__).resolve().parent / "fb_dashboard"
sys.path.insert(0, str(_dash))
os.chdir(str(_dash))

# Use importlib so 'import main' in fb_dashboard/*.py resolves inside fb_dashboard/
mod = importlib.import_module("main")
app = mod.app
