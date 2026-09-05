#!/usr/bin/env python3
"""Sync the Next.js build into fb_dashboard/static/ (single-server mode).

Recreated 2026-09-05 from the committed static/ structure (the original was
referenced by CLAUDE.md / delivery report but never committed — this one IS,
closing the reproducibility gap).

Mapping (verified against the tracked layout):
  .next/server/app/index.html          -> static/index.html        (flat root)
  .next/server/app/_not-found.html     -> static/404.html          (special rename)
  .next/server/app/X.html              -> static/X/index.html      (nested routes)
  .next/server/app/X.rsc               -> static/X.txt             (beside the dir)
  .next/server/app/X.body              -> static/X                 (sitemap.xml, opengraph-image)
  everything else (.js .map .meta .segments .nft.json dirs)        -> skipped
  .next/static/**                      -> static/_next/static/**   (full replace)
  public/* (incl. public/static/**)    -> static/**                (icons, fonts, manifests)

Run AFTER `npm run build` in fb_dashboard/frontend/, then boot:
  python -m uvicorn runner:app --app-dir fb_dashboard --port 8000

No pruning: legacy RSC artifacts (__next.*.txt from older builds) are kept —
they are inert and the tracked tree contains them.
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

# files that land flat at static root instead of X/index.html
ROOT_SPECIAL = {"index.html": "index.html", "_not-found.html": "404.html"}


def _dst_for(src: Path) -> Path | None:
    """Map a build file to its static destination (None = skip)."""
    rel = src.relative_to(SERVER_APP)
    parts = rel.parts
    # skip inside .segments / .meta dirs and JS artifacts
    if any(p.endswith((".segments", ".meta")) for p in parts[:-1]):
        return None
    name = parts[-1]
    if name.endswith((".js", ".js.map", ".nft.json", ".meta", ".segments")):
        return None
    if name in ROOT_SPECIAL:
        return STATIC / ROOT_SPECIAL[name]
    if name == "index.html":  # root index.html handled above; route-level index unlikely
        return STATIC / "index.html"
    stem, _, ext = name.rpartition(".")
    if ext == "html":
        return STATIC / Path(*parts[:-1]) / stem / "index.html"
    if ext == "rsc":
        return STATIC / Path(*parts[:-1]) / f"{stem}.txt"
    if ext == "body":
        return STATIC / Path(*parts[:-1]) / stem
    return None  # route.js, page.js, manifests — none of them ship


def sync_server_app() -> int:
    if not SERVER_APP.exists():
        print(f"missing {SERVER_APP} — run `npm run build` first", file=sys.stderr)
        sys.exit(1)
    n = 0
    for src in SERVER_APP.rglob("*"):
        if src.is_dir():
            continue
        dst = _dst_for(src)
        if dst is None:
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists() and dst.is_dir():  # legacy conflict: dir where a file must go
            shutil.rmtree(dst)
        if dst.exists() and dst.is_file() and src.is_dir():
            dst.unlink()
        shutil.copy2(src, dst)
        n += 1
    return n


def sync_next_static() -> int:
    if not NEXT_STATIC.exists():
        print(f"missing {NEXT_STATIC}", file=sys.stderr)
        sys.exit(1)
    dst = STATIC / "_next" / "static"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(NEXT_STATIC, dst)
    return sum(1 for p in dst.rglob("*") if p.is_file())


def sync_public() -> int:
    n = 0
    for src in PUBLIC.rglob("*"):
        if src.is_dir():
            continue
        rel = src.relative_to(PUBLIC)
        dst = STATIC / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        n += 1
    return n


def main() -> None:
    print(f"syncing {SERVER_APP} -> {STATIC}")
    routes = sync_server_app()
    chunks = sync_next_static()
    public_n = sync_public()
    print(f"OK: {routes} route files, {chunks} chunk files, {public_n} public files")


if __name__ == "__main__":
    main()
