#!/usr/bin/env python3
"""Sync the Next.js build into fb_dashboard/static/ (single-server mode).

Recreated 2026-09-05; made DETERMINISTIC 2026-09-05 (world-class round):

  * WIPES static/ first — the old no-prune behavior accumulated 262 RSC
    .txt dumps, 35 route-level index.html exports and three generations of
    hashed chunks (6.3 MB of tracked dead weight; stale assets never left).
  * Copies ONLY what the single-server mode actually serves:
      - index.html + 404.html            (SPA shell, client-side routing)
      - _next/static/**                  (hashed chunks, immutable)
      - public/**                        (fonts, icons, brand, robots, og)
      - emitted metadata files at the app root (manifest.webmanifest,
        opengraph-image, sitemap.xml) so crawlers get real artifacts
  * Route-level .html/.rsc exports are intentionally NOT copied — the SPA
    catch-all serves the shell for every route.

Run AFTER `npm run build` in fb_dashboard/frontend/, then boot:
  python -m uvicorn runner:app --app-dir fb_dashboard --port 8000
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FRONTEND = REPO / "fb_dashboard" / "frontend"
SERVER_APP = FRONTEND / ".next" / "server" / "app"
NEXT_STATIC = FRONTEND / ".next" / "static"
PUBLIC = FRONTEND / "public"
STATIC = REPO / "fb_dashboard" / "static"

ROOT_SPECIAL = {"index.html": "index.html", "_not-found.html": "404.html"}
# file-based metadata routes worth serving at the domain root — Next emits
# the actual artifact as `<name>.body` (`<name>` itself is a directory).
ROOT_META_FILES = {"manifest.webmanifest", "opengraph-image.png", "sitemap.xml"}


def main() -> int:
    if not SERVER_APP.exists():
        print("ERROR: no .next/server/app — run `npm run build` first", file=sys.stderr)
        return 1

    # 1) deterministic prune
    if STATIC.exists():
        shutil.rmtree(STATIC)
    STATIC.mkdir(parents=True)

    copied = 0

    # 2) SPA shell + metadata artifacts emitted at the app root
    for src in SERVER_APP.iterdir():
        if not src.is_file():
            continue
        if src.name in ROOT_SPECIAL:
            shutil.copy2(src, STATIC / ROOT_SPECIAL[src.name])
            copied += 1
    # file-based metadata routes: Next emits the artifact as <name>.body
    # (the plain name is a directory) — serve it at the domain root.
    for name in ROOT_META_FILES:
        body = SERVER_APP / (name + ".body")
        if body.is_file():
            shutil.copy2(body, STATIC / name)
            copied += 1

    # 3) hashed chunks
    dst_next = STATIC / "_next"
    shutil.copytree(NEXT_STATIC, dst_next)
    copied += sum(1 for _ in dst_next.rglob("*") if _.is_file())

    # 4) public assets (fonts, icons, brand, og-image, robots…)
    if PUBLIC.exists():
        for item in PUBLIC.iterdir():
            if item.is_dir():
                shutil.copytree(item, STATIC / item.name,
                                ignore=shutil.ignore_patterns("__pycache__"))
                copied += sum(1 for _ in (STATIC / item.name).rglob("*") if _.is_file())
            else:
                shutil.copy2(item, STATIC / item.name)
                copied += 1

    # 5) single-server also serves og-image from public/ if the build didn't
    #    emit it at the app root (e.g. older Next layouts)
    og_pub = PUBLIC / "og-image.png"
    if og_pub.exists() and not (STATIC / "opengraph-image").exists() \
            and not (STATIC / "opengraph-image.png").exists():
        shutil.copy2(og_pub, STATIC / "opengraph-image.png")
        copied += 1

    txt = sum(1 for _ in STATIC.rglob("*.txt"))
    html = sum(1 for _ in STATIC.rglob("*.html"))
    size_mb = sum(f.stat().st_size for f in STATIC.rglob("*") if f.is_file()) / 1e6
    print(f"synced {copied} files → {STATIC} "
          f"(html={html}, txt={txt}, {size_mb:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
