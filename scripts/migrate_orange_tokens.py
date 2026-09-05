#!/usr/bin/env python3
"""v4 radical plan Team 2 — semantic orange→official token migration.

Ordered rules (NOT blind find/replace — each rule maps a specific utility
semantic to its official single-source token):
  1. *-orange-foreground  → *-primary-foreground   (white-on-orange: 0.98)
  2. *-orange-muted       → *-accent               (the 15%/12% tint)
  3. <u>-orange/<alpha>   → <u>-accent-foreground/<alpha>  (tints/borders/
     rings/shadows/gradients of solid 0.55 — zero visual diff, both modes)
  4. solid bg-orange      → bg-primary             (Smart-Menu button parity:
     dark identical 0.55; light 0.40 = reference AA-compliant solid)
  5. other solid <u>-orange → <u>-accent-foreground (0.55 both modes)
  6. var(--orange)        → var(--accent-foreground)
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent / "fb_dashboard" / "frontend" / "src"

PREFIXES = ["text", "bg", "border", "ring", "shadow", "from", "to", "via", "fill", "stroke", "outline", "divide"]

def migrate(text: str) -> tuple[str, int]:
    total = 0
    # 1. *-orange-foreground → *-primary-foreground
    for p in PREFIXES:
        new = text.replace(f"{p}-orange-foreground", f"{p}-primary-foreground")
        total += text.count(f"{p}-orange-foreground")
        text = new
    # 2. *-orange-muted → *-accent
    for p in PREFIXES:
        new = text.replace(f"{p}-orange-muted", f"{p}-accent")
        total += text.count(f"{p}-orange-muted")
        text = new
    # 3. slashed tints → accent-foreground (keep the alpha suffix)
    for p in PREFIXES:
        pat = re.compile(rf"\b{p}-orange(/[\d.]+)")
        text, n = pat.subn(rf"{p}-accent-foreground\1", text)
        total += n
    # 4. solid bg-orange → bg-primary
    text, n = re.subn(r"\bbg-orange\b", "bg-primary", text)
    total += n
    # 5. other solid <u>-orange → <u>-accent-foreground
    for p in PREFIXES:
        if p == "bg":
            continue
        text, n = re.subn(rf"\b{p}-orange\b", f"{p}-accent-foreground", text)
        total += n
    # 6. var(--orange) → var(--accent-foreground)
    text, n = re.subn(r"var\(--orange\)", "var(--accent-foreground)", text)
    total += n
    return text, total

changed = 0
grand = 0
for f in sorted(ROOT.rglob("*.tsx")) + sorted(ROOT.rglob("*.ts")):
    orig = f.read_text(encoding="utf-8")
    new, n = migrate(orig)
    if n:
        f.write_text(new, encoding="utf-8")
        changed += 1
        grand += n
        print(f"  {f.relative_to(ROOT)}: {n} replacement(s)")
print(f"\nMIGRATED: {changed} files, {grand} token usages")
