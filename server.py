import os, sys
from pathlib import Path

# Ensure we can import from fb_dashboard
_dash = Path(__file__).parent / "fb_dashboard"
os.chdir(str(_dash))
sys.path.insert(0, str(_dash))

from main import app
