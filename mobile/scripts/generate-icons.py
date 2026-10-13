#!/usr/bin/env python3
"""Generate SmartBot mobile raster brand assets — Phase 6 «Circuit Petrol»
identity (P6-2-e3), mobile twin of the Circuit Petrol design system
(fb_dashboard globals.css series #071A21).

Outputs (EXACT sizes/formats/paths of the retired Madarek set — zero app.json
or import changes anywhere):
  - icon.png                     1024x1024 RGBA — petrol #071A21 full-bleed
                                                ground + teal robot-head glyph.
  - splash-icon.png              1024x1024 RGBA — glyph on TRANSPARENT bg
                                                (expo-splash-screen paints the
                                                #071A21 ground — app.json pin).
  - android-icon-foreground.png  1024x1024 RGBA — glyph only, transparent,
                                                inside the adaptive safe zone.
  - android-icon-background.png  1024x1024 RGBA — solid petrol #071A21
                                                (app.json pins the same hex).
  - android-icon-monochrome.png  1024x1024 RGBA — white glyph silhouette.
  - brand-icon.png               160x160   RGBA — rounded petrol plate (22%
                                                radius) + glyph — the MOBILE
                                                mark; deliberately not a copy
                                                of the web brand-icon.png.
  - favicon.png                  128x128   RGBA — same plate recipe at 128.

The mark: a teal #17C3A4 robot-head glyph (rounded head + ear studs +
antenna) with petrol eye slots and mouth, a lime #C6F24E LED on the antenna
(the reserved AI signal), and a short circuit trace (teal line, lime end
node) beneath — the RobotMark/CircuitTrace motif as a static raster.
Replaces the retired Madarek night+gold pixels (night #070B16 / void
#05070F / gold #E9B44C family — banned).

Pure Pillow, geometry-only (no system font) — bit-reproducible anywhere.

Usage: python3 scripts/generate-icons.py
"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "images")
os.makedirs(OUT, exist_ok=True)

# ── Circuit Petrol palette — literal theme.ts (SSOT) values ──────────────────
GROUND   = (7, 26, 33, 255)     # #071A21 — background dark / splash+adaptive pin
TEAL     = (23, 195, 164, 255)  # #17C3A4 — primary (the machine's voice)
LIME     = (198, 242, 78, 255)  # #C6F24E — reserved AI/automation LED
HAIRLINE = (29, 68, 80, 255)    # #1D4450 — border ring on the plates
WHITE    = (255, 255, 255, 255) # monochrome layer

# ── the glyph: 512-unit space, drawn at SS× scale then LANCZOS-down ─────────
SS = 2  # supersampling factor


def _u(v, s):
    return v * s / 512.0


def _capsule(draw, x0, y0, x1, y1, width, fill):
    """Line with round caps (the web stroke-linecap=round twin)."""
    r = width / 2.0
    draw.line([(x0, y0), (x1, y1)], fill=fill, width=int(round(width)))
    for (cx, cy) in [(x0, y0), (x1, y1)]:
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)


def _new_mask(s):
    return Image.new("L", (s, s), 0)


def glyph_masks(s):
    """Per-color masks of the robot-head mark at s×s (512-unit geometry).

    head  — teal: antenna stem + ear studs + head shell, with the eye slots
            and mouth CUT OUT (they show whatever is behind: petrol ground
            on the icon/splash/adaptive, page bg under brand plates).
    led   — lime: the antenna LED (reserved AI signal).
    trace — teal circuit line + start node under the chin.
    node  — lime trace end node.
    """
    head, led, trace, node = (_new_mask(s) for _ in range(4))

    d = ImageDraw.Draw(head)
    # antenna stem
    _capsule(d, _u(256, s), _u(60, s), _u(256, s), _u(106, s), _u(15, s), 255)
    # ear studs (electrical plugs)
    d.rounded_rectangle([_u(24, s), _u(196, s), _u(62, s), _u(264, s)],
                        radius=_u(19, s), fill=255)
    d.rounded_rectangle([_u(450, s), _u(196, s), _u(488, s), _u(264, s)],
                        radius=_u(19, s), fill=255)
    # head shell
    d.rounded_rectangle([_u(92, s), _u(96, s), _u(420, s), _u(344, s)],
                        radius=_u(82, s), fill=255)
    # eye slots + mouth — cut out of the shell
    d.rounded_rectangle([_u(172, s), _u(168, s), _u(224, s), _u(260, s)],
                        radius=_u(26, s), fill=0)
    d.rounded_rectangle([_u(288, s), _u(168, s), _u(340, s), _u(260, s)],
                        radius=_u(26, s), fill=0)
    d.rounded_rectangle([_u(206, s), _u(288, s), _u(306, s), _u(312, s)],
                        radius=_u(12, s), fill=0)

    d = ImageDraw.Draw(led)
    d.ellipse([_u(228, s), _u(14, s), _u(284, s), _u(70, s)], fill=255)

    d = ImageDraw.Draw(trace)
    _capsule(d, _u(150, s), _u(420, s), _u(352, s), _u(420, s), _u(10, s), 255)
    d.ellipse([_u(138, s), _u(408, s), _u(162, s), _u(432, s)], fill=255)

    d = ImageDraw.Draw(node)
    d.ellipse([_u(342, s), _u(400, s), _u(382, s), _u(440, s)], fill=255)

    return head, led, trace, node


def _colorize(mask, color):
    img = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    img.paste(Image.new("RGBA", mask.size, color), (0, 0), mask)
    return img


def glyph(size, head=TEAL, led=LIME, trace=None, node=None):
    """The full robot-head mark composited on a transparent size×size canvas.

    Pass head=WHITE, led=WHITE, trace=WHITE, node=WHITE for the monochrome
    silhouette (single-channel shape).
    """
    if trace is None:
        trace = head
    if node is None:
        node = led
    s = size * SS
    mh, ml, mt, mn = glyph_masks(s)
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    out.alpha_composite(_colorize(mt, trace))
    out.alpha_composite(_colorize(mn, node))
    out.alpha_composite(_colorize(mh, head))
    out.alpha_composite(_colorize(ml, led))
    return out.resize((size, size), Image.LANCZOS)


def plate(size, ratio=0.22):
    """Rounded petrol plate (radius = 22% — the .qr-corner law) with a
    hairline ring, on a transparent canvas."""
    s = size * SS
    r = s * ratio
    ring = 0.028 * s  # hairline ring thickness
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([ring / 2, ring / 2, s - ring / 2, s - ring / 2],
                        radius=r, fill=GROUND, outline=HAIRLINE,
                        width=max(1, int(round(ring))))
    return img.resize((size, size), Image.LANCZOS)


def _paste_center(canvas, sprite):
    off = (canvas.size[0] - sprite.size[0]) // 2
    canvas.alpha_composite(sprite, (off, off))
    return canvas


def build_all():
    assets = {}

    # 1. icon.png — petrol full-bleed ground + glyph (corners opaque petrol).
    icon = Image.new("RGBA", (1024, 1024), GROUND)
    assets["icon.png"] = _paste_center(icon, glyph(800))

    # 2. splash-icon.png — 1024 canvas, glyph 760 on transparent
    #    (expo-splash-screen paints the #071A21 ground — app.json pin).
    assets["splash-icon.png"] = _paste_center(Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)), glyph(760))

    # 3. android-icon-foreground.png — glyph only on the 1024 canvas,
    #    inside the adaptive safe zone (inner ~66%): 430px.
    assets["android-icon-foreground.png"] = _paste_center(Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)), glyph(430))

    # 4. android-icon-background.png — solid petrol (app.json pins the hex).
    assets["android-icon-background.png"] = Image.new("RGBA", (1024, 1024), GROUND)

    # 5. android-icon-monochrome.png — white silhouette on the 1024 canvas,
    #    safe-zone layout mirroring the foreground.
    assets["android-icon-monochrome.png"] = _paste_center(
        Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)),
        glyph(430, WHITE, WHITE, WHITE, WHITE))

    # 6. brand-icon.png — 160px rounded petrol plate + 65% glyph (the MOBILE
    #    mark; the web one is a separate asset owned by the web identity).
    brand = plate(160)
    assets["brand-icon.png"] = _paste_center(brand, glyph(104))

    # 7. favicon.png — same recipe at 128.
    fav = plate(128)
    assets["favicon.png"] = _paste_center(fav, glyph(84))

    for name, img in assets.items():
        img.save(os.path.join(OUT, name))
    return assets


# ── pixel-true verification (the brief's gate) ──────────────────────────────
BANNED = {
    "Madarek night #070B16": lambda r, g, b: abs(r - 7) <= 1 and abs(g - 11) <= 1 and abs(b - 22) <= 1,
    "Madarek void  #05070F": lambda r, g, b: abs(r - 5) <= 1 and abs(g - 7) <= 1 and abs(b - 15) <= 1,
    "Madarek gold family":   lambda r, g, b: 225 <= r <= 245 and 168 <= g <= 192 and 60 <= b <= 96,
}

EXPECTED = {  # name -> size (mode pinned below — all RGBA)
    "icon.png": 1024,
    "splash-icon.png": 1024,
    "android-icon-foreground.png": 1024,
    "android-icon-background.png": 1024,
    "android-icon-monochrome.png": 1024,
    "brand-icon.png": 160,
    "favicon.png": 128,
}

# sample points: corner ×2 · head-mid (teal) · right-eye slot (ground/transparent)
# · antenna LED (lime) · trace end node (lime) — coords mapped from the
# 512-unit glyph geometry through each asset's offset/scale.
SAMPLES = {
    "icon.png": [(2, 2), (1021, 1021), (512, 456), (603, 446), (512, 178), (677, 768)],
    "splash-icon.png": [(2, 2), (1021, 1021), (512, 458), (598, 450), (512, 194), (669, 755)],
    "android-icon-foreground.png": [(2, 2), (1021, 1021), (512, 482), (561, 477), (512, 332), (601, 650)],
    "android-icon-background.png": [(2, 2), (1021, 1021), (512, 512), (256, 256)],
    "android-icon-monochrome.png": [(2, 2), (1021, 1021), (512, 482), (512, 332)],
    "brand-icon.png": [(2, 2), (80, 12), (80, 73), (92, 71), (80, 37)],
    "favicon.png": [(2, 2), (64, 8), (64, 58), (73, 57), (64, 29)],
}


def verify(assets):
    print("pixel verification — sizes/modes, corner/center/LED samples, banned-hex scan:")
    total_bad = 0
    for name, img in assets.items():
        # sizes/modes EXACT
        assert img.size[0] == EXPECTED[name] and img.size[1] == EXPECTED[name], \
            f"{name}: size {img.size} != {EXPECTED[name]}x{EXPECTED[name]}"
        assert img.mode == "RGBA", f"{name}: mode {img.mode} != RGBA"

        # banned pixel scan — EVERY pixel of every asset
        rgb = img.convert("RGB")
        px = rgb.load()
        w, h = img.size
        bad = {k: 0 for k in BANNED}
        for y in range(h):
            for x in range(w):
                r, g, b = px[x, y]
                for k, hit in BANNED.items():
                    if hit(r, g, b):
                        bad[k] += 1
        total_bad += sum(bad.values())
        assert not any(bad.values()), f"{name}: banned pixels found {bad}"

        samples = [img.getpixel((x, y)) for (x, y) in SAMPLES[name]]
        print(f"  {name:34s} {img.size}  samples={samples}  banned=0")

    assert total_bad == 0
    print("✓ pixel-true: petrol #071A21 grounds, teal glyph, lime LED — zero #070B16/#05070F/gold pixels")


def main():
    assets = build_all()
    print("Wrote 7 assets to", os.path.abspath(OUT))
    verify(assets)


if __name__ == "__main__":
    main()
