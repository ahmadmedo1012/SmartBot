"""Shim: re-export app from main module after path setup (avoids circular import)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.chdir(os.path.dirname(os.path.abspath(__file__)))
from main import app
