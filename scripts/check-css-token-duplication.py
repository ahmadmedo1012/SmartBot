#!/usr/bin/env python3
"""v4 radical plan §1.3 — CSS token duplication gate.

Fails (exit 1) when any custom property is defined more than the allowed
maximum in globals.css. Root cause this guards against: --font-heading was
defined TWICE (Readex-first in @theme, Cairo-first later in :root) — the
later definition silently overrode the fix, which is exactly why the
"fonts don't match Smart-Menu" complaint survived three repair rounds.

Allowed per-token maximums (default 2 = one dark + one light definition):
  - tokens under @theme blocks: 1 (the single source; Tailwind emits them)
  - font tokens: 1 anywhere (fonts have no dark/light variants)

Usage: python scripts/check-css-token-duplication.py [--css PATH]
Exit codes: 0 = clean, 1 = duplication found.
"""
from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSS = ROOT / "fb_dashboard" / "frontend" / "src" / "app" / "globals.css"

VAR_RE = re.compile(r"^\s*(--[\w-]+)\s*:", re.MULTILINE)
FONT_TOKENS = {"--font-sans", "--font-mono", "--font-arabic", "--font-heading", "--font-naskh"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--css", type=Path, default=DEFAULT_CSS)
    args = ap.parse_args()
    css_path: Path = args.css
    if not css_path.exists():
        print(f"FAIL: {css_path} not found")
        return 1

    text = css_path.read_text(encoding="utf-8")

    # Mask comments (preserve length so positions stay aligned) — otherwise
    # prose like "@theme inline inlines..." inside /* */ matches as a block.
    masked = list(text)
    in_block = False
    in_line = False
    for i, ch in enumerate(text):
        if not in_block and not in_line and text.startswith("/*", i):
            in_block = True
            masked[i] = masked[i + 1] = " "
            continue
        if not in_block and not in_line and text.startswith("//", i):
            in_line = True
            masked[i] = masked[i + 1] = " "
            continue
        if in_block and text.startswith("*/", i):
            in_block = False
            masked[i] = masked[i + 1] = " "
            continue
        if in_line and ch == "\n":
            in_line = False
            continue
        if in_block or in_line:
            masked[i] = " " if ch != "\n" else "\n"
    masked_text = "".join(masked)

    # Locate @theme blocks — tokens defined there are the canonical source.
    theme_spans: list[tuple[int, int]] = []
    for m in re.finditer(r"@theme[^{]*\{", masked_text):
        depth = 1
        start = m.end()
        i = start
        while i < len(masked_text) and depth:
            if masked_text[i] == "{":
                depth += 1
            elif masked_text[i] == "}":
                depth -= 1
            i += 1
        theme_spans.append((m.start(), i))

    def in_theme(pos: int) -> bool:
        return any(a <= pos <= b for a, b in theme_spans)

    defs: dict[str, list[tuple[int, bool]]] = defaultdict(list)
    for m in VAR_RE.finditer(text):
        name = m.group(1)
        defs[name].append((m.start(), in_theme(m.start())))

    errors: list[str] = []
    for name, sites in sorted(defs.items()):
        n_theme = sum(1 for _, t in sites if t)
        n_plain = len(sites) - n_theme
        if name in FONT_TOKENS:
            # Fonts: EXACTLY ONE definition in the whole file (no dark/light
            # variants exist) — the --font-heading bug this script exists for.
            if len(sites) > 1:
                errors.append(
                    f"{name}: {len(sites)} definitions (fonts allow exactly 1) "
                    f"at lines {[text[:p].count(chr(10)) + 1 for p, _ in sites]}"
                )
        else:
            # Generic tokens: max one canonical @theme definition + one per
            # theme block (:root dark / .light) = 3; a 4th means a duplicate
            # hand-written override.
            if n_theme > 1:
                errors.append(
                    f"{name}: {n_theme} @theme definitions (allowed 1) "
                    f"at lines {[text[:p].count(chr(10)) + 1 for p, t in sites if t]}"
                )
            if n_plain > 2:
                errors.append(
                    f"{name}: {n_plain} hand-written definitions (allowed 2: dark+light) "
                    f"at lines {[text[:p].count(chr(10)) + 1 for p, t in sites if not t]}"
                )

    # Forbidden tokens (v4 §1.2): the orange alias family must stay deleted.
    for forbidden in ("--orange:", "--orange-foreground:", "--orange-muted:", "--gradient-orange:"):
        if forbidden in text:
            errors.append(f"forbidden token present: {forbidden[:-1]}")

    if errors:
        print(f"FAIL: {len(errors)} token duplication issue(s) in {css_path.name}:")
        for e in errors:
            print(f"  - {e}")
        return 1
    n = len(defs)
    print(f"OK: {n} unique custom properties, no duplicates, no forbidden tokens")
    return 0


if __name__ == "__main__":
    sys.exit(main())
