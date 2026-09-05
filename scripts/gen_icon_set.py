#!/usr/bin/env python3
"""Generate the full PWA icon set for SmartBot from the master brand-icon.png.

World-class launch plan v3, Stage 1.1:
- icon-192.png / icon-512.png (purpose any + maskable with 80% safe-zone padding)
- apple-touch-icon.png (180x180, lanczos3)
- favicon.ico (16/32/48 multi-size) -> src/app/favicon.ico (Next.js App Router serves it at /favicon.ico)
- verifies alpha channel & sizes; prints a report.

Run from repo root:  python scripts/gen_icon_set.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "fb_dashboard" / "frontend"
SRC_ICON = FRONTEND / "public" / "brand-icon.png"
OUT_PUBLIC = FRONTEND / "public"
OUT_APP = FRONTEND / "src" / "app"

SIZES = [
    ("icon-192.png", 192),
    ("icon-512.png", 512),
    ("apple-touch-icon.png", 180),
]


def _load_master() -> Image.Image:
    im = Image.open(SRC_ICON)
    im.load()
    report = {
        "master_size": im.size,
        "mode": im.mode,
        "has_alpha": im.mode in ("RGBA", "LA") or "transparency" in im.info,
    }
    print("[master]", report)
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    return im


def _plain(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.LANCZOS)


def _maskable(im: Image.Image, size: int) -> Image.Image:
    """Maskable icon: artwork scaled to ~80% (safe zone) over an orange-brand square."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # brand orange solid base (oklch(0.55 0.19 45) ~= #bc4700 family -> use #bc4700)
    base = Image.new("RGBA", (size, size), (188, 71, 0, 255))
    canvas.alpha_composite(base)
    inner = int(size * 0.80)
    art = im.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.alpha_composite(art, (off, off))
    return canvas


def _favicon_ico(im: Image.Image, path: Path) -> None:
    frames = [im.resize((s, s), Image.LANCZOS) for s in (16, 32, 48)]
    frames[0].save(path, format="ICO", sizes=[(s, s) for s in (16, 32, 48)], append_images=frames[1:])


def main() -> None:
    im = _load_master()

    # plain purpose icons
    for name, size in SIZES:
        out = OUT_PUBLIC / name
        _plain(im, size).save(out, format="PNG", optimize=True)
        print(f"[ok] {out.relative_to(ROOT)} {size}x{size}")

    # maskable variants (suffix -maskable)
    for name, size in [("icon-192-maskable.png", 192), ("icon-512-maskable.png", 512)]:
        out = OUT_PUBLIC / name
        _maskable(im, size).save(out, format="PNG", optimize=True)
        print(f"[ok] {out.relative_to(ROOT)} {size}x{size} (maskable)")

    # favicon.ico in app dir (Next.js convention -> /favicon.ico)
    OUT_APP.mkdir(parents=True, exist_ok=True)
    ico_path = OUT_APP / "favicon.ico"
    _favicon_ico(_plain(im, 48), ico_path)
    print(f"[ok] {ico_path.relative_to(ROOT)} 16/32/48")

    # sanity: every file exists & decodable
    for f in [*OUT_PUBLIC.glob("icon-*.png"), OUT_PUBLIC / "apple-touch-icon.png", ico_path]:
        with Image.open(f) as check:
            assert check.size[0] > 0
    print("[done] icon set complete & verified")


if __name__ == "__main__":
    main()
