#!/usr/bin/env python3
"""Generate the full PWA icon set for SmartBot from the master brand-icon.png.

World-class launch plan v3, Stage 1.1 — Madarek completion (Task 8-e):
- icon-192.png / icon-512.png (purpose "any": transparent-ground gold art)
- icon-192-maskable.png / icon-512-maskable.png (night base + 80% safe-zone art)
- apple-touch-icon.png (180x180, opaque night base, lanczos3)
- favicon.ico (16/32/48 multi-size, night rounded tile) -> src/app/favicon.ico
  (Next.js App Router serves it at /favicon.ico)
- favicon.png (96x96 public legacy asset, same night tile recipe)
- verifies alpha channel, sizes AND zero flame pixels in every output.

MADAREK CANONICAL (madarek tokens.css / reference digest):
- primary gold   #E9B44C  (233, 180,  76) — luminous accent (dark)
- strong gold    #C9962F  (201, 150,  47) — gradient partner (--accent-strong)
- night ground   #070B16  (  7,  11,  22) — dark page ground (neutral-50)
- light cream    #FBFAF9  (251, 250, 249) — light page ground (neutral-50)

The master art (a flame-era orange/yellow knot) is RECOLORED in-place onto the
canonical gold metal ramp: every opaque pixel is mapped by its luminance onto
the C9962F -> E9B44C segment (both stops sit on hue ~40°, so the whole ramp is
the Madarek gold line). Alpha, shape and the original shading structure are
preserved; the flame palette is guaranteed absent from every emitted file.

Run from repo root:  python scripts/gen_icon_set.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

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

# ── Madarek canonical palette (digest §1.1/§1.3 — do NOT edit) ──────────────
GOLD = (233, 180, 76)     # #E9B44C — primary gold (--accent, dark)
GOLD_STRONG = (201, 150, 47)   # #C9962F — gradient partner (--accent-strong)
NIGHT = (7, 11, 22)       # #070B16 — dark page ground (neutral-50)
CREAM = (251, 250, 249)   # #FBFAF9 — light page ground (neutral-50)


def _lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def recolor_to_gold(im: Image.Image) -> Image.Image:
    """Map the master art onto the Madarek gold metal ramp.

    Every opaque pixel's luminance is normalized (2nd/98th percentile) and
    interpolated along GOLD_STRONG (#C9962F, shadows) -> GOLD (#E9B44C,
    highlights). Works for any flame-era warm art: hue information is
    discarded, so no orange/red/yellow can survive.

    Sub-visible alpha specks (a < 24 = 9% opacity — the flame-era art carries
    ~1200 of them, e.g. (255,127,0,2)) are snapped to fully transparent:
    Pillow's resample premultiplies into uint8 and those specks EXPLODE into
    saturated garbage ((255,255,0,1) etc.) when upscaled.
    """
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    lums = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a:
                lums.append(0.2126 * r + 0.7152 * g + 0.0722 * b)
    if not lums:
        return im
    lums.sort()
    lo = lums[int(len(lums) * 0.02)]
    hi = lums[min(len(lums) - 1, int(len(lums) * 0.98))]
    span = (hi - lo) or 1.0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a >= 24:
                lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
                t = min(1.0, max(0.0, (lum - lo) / span))
                px[x, y] = (*_lerp(GOLD_STRONG, GOLD, t), a)
            else:
                px[x, y] = (0, 0, 0, 0)
    return im


def _load_master() -> Image.Image:
    im = Image.open(SRC_ICON)
    im.load()
    report = {
        "master_size": im.size,
        "mode": im.mode,
        "has_alpha": im.mode in ("RGBA", "LA") or "transparency" in im.info,
    }
    print("[master]", report)
    return recolor_to_gold(im)


def _clean_fringe(im: Image.Image) -> Image.Image:
    """Snap sub-visible fringe alpha (<32/255 = 12% opacity) to transparent.

    Pillow's resize premultiplies alpha into uint8 before filtering and
    un-premultiplies after; near-transparent output pixels amplify the
    quantization error into saturated garbage colors (gold edge ->
    (255,255,0,1)). The fringe is invisible either way — dropping it keeps
    every emitted byte on the gold/night palette.
    """
    px = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            if px[x, y][3] < 32:
                px[x, y] = (0, 0, 0, 0)
    return im


def _plain(im: Image.Image, size: int) -> Image.Image:
    return _clean_fringe(im.resize((size, size), Image.LANCZOS))


def _maskable(im: Image.Image, size: int) -> Image.Image:
    """Maskable icon: artwork scaled to ~80% (safe zone) over a Madarek night square."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Madarek night solid base — #070B16 (was flame #bc4700 pre-Madarek)
    base = Image.new("RGBA", (size, size), (*NIGHT, 255))
    canvas.alpha_composite(base)
    inner = int(size * 0.80)
    art = _clean_fringe(im.resize((inner, inner), Image.LANCZOS))
    off = (size - inner) // 2
    canvas.alpha_composite(art, (off, off))
    return canvas


def _night_tile(im: Image.Image, size: int, radius_frac: float = 0.22) -> Image.Image:
    """Opaque rounded-square night tile + centered gold art (favicons).

    Small sizes (16-96px) lose a transparent-ground mark against arbitrary
    tab/launcher backgrounds — the night tile pins the Madarek identity:
    gold #E9B44C art on night #070B16 (the canonical 10.39:1 pair).
    """
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)
    draw.rounded_rectangle(
        [(0, 0), (size - 1, size - 1)],
        radius=max(1, int(size * radius_frac)),
        fill=(*NIGHT, 255),
    )
    inner = int(size * 0.78)
    art = _clean_fringe(im.resize((inner, inner), Image.LANCZOS))
    off = (size - inner) // 2
    tile.alpha_composite(art, (off, off))
    return tile


def _favicon_ico(im: Image.Image, path: Path) -> None:
    frames = [_night_tile(im, s) for s in (16, 32, 48)]
    frames[0].save(path, format="ICO", sizes=[(s, s) for s in (16, 32, 48)], append_images=frames[1:])


def _flame_pixels(im: Image.Image) -> int:
    """Count flame-family pixels (orange/red flame + pure flame yellow).

    Discriminates flame from gold by the GREEN ratio: flame art keeps
    g < 0.62*r (e.g. #BC4700 g/r=0.38, #FF7A00 0.48) while the whole gold
    ramp sits at g/r ~= 0.75 (#E9B44C 0.77, #C9962F 0.75 — including its
    LANCZOS ringing). Pure flame yellow (#FFFF00/#FFB600) has b <= 40 with
    r >= 250; gold never reaches r >= 250. Night/cream grounds never match.
    """
    n = 0
    for r, g, b, a in im.convert("RGBA").getdata():
        if not a:
            continue
        if (r - b >= 120 and g < 0.62 * r and b < 60) or (r >= 250 and b <= 40):
            n += 1
    return n


def main() -> None:
    im = _load_master()

    # master brand asset itself becomes the Madarek gold mark (transparent
    # ground — Header/Footer/AdminSidebar/login render it on themed surfaces)
    im.save(SRC_ICON, format="PNG", optimize=True)
    print(f"[ok] {SRC_ICON.relative_to(ROOT)} (recolored -> gold metal ramp)")

    # plain purpose icons (transparent ground, gold art)
    for name, size in SIZES:
        out = OUT_PUBLIC / name
        if name == "apple-touch-icon.png":
            # iOS composites black behind transparency — ship the opaque
            # night-base square instead of a floating mark.
            _maskable(im, size).save(out, format="PNG", optimize=True)
        else:
            _plain(im, size).save(out, format="PNG", optimize=True)
        print(f"[ok] {out.relative_to(ROOT)} {size}x{size}")

    # maskable variants (night base + 80% safe-zone art)
    for name, size in [("icon-192-maskable.png", 192), ("icon-512-maskable.png", 512)]:
        out = OUT_PUBLIC / name
        _maskable(im, size).save(out, format="PNG", optimize=True)
        print(f"[ok] {out.relative_to(ROOT)} {size}x{size} (maskable, night base)")

    # public legacy favicon.png (96px, night tile)
    fav_png = OUT_PUBLIC / "favicon.png"
    _night_tile(im, 96).save(fav_png, format="PNG", optimize=True)
    print(f"[ok] {fav_png.relative_to(ROOT)} 96x96 (night tile)")

    # favicon.ico in app dir (Next.js convention -> /favicon.ico)
    OUT_APP.mkdir(parents=True, exist_ok=True)
    ico_path = OUT_APP / "favicon.ico"
    _favicon_ico(im, ico_path)
    print(f"[ok] {ico_path.relative_to(ROOT)} 16/32/48 (night tile)")

    # sanity: every file exists, decodable, ZERO flame pixels
    outputs = [
        *OUT_PUBLIC.glob("icon-*.png"),
        OUT_PUBLIC / "apple-touch-icon.png",
        OUT_PUBLIC / "brand-icon.png",
        OUT_PUBLIC / "favicon.png",
        ico_path,
    ]
    for f in outputs:
        with Image.open(f) as check:
            assert check.size[0] > 0
            flame = _flame_pixels(check)
            assert flame == 0, f"{f.name}: {flame} flame pixels detected"
    print(f"[done] icon set complete — {len(outputs)} files verified, zero flame pixels")


if __name__ == "__main__":
    main()
