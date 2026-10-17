# SmartBot — The Vessel · المَركَب (Phase 19 Art Direction)

## The decision record

The Phase 18 "Obelisk Attendant" was REJECTED by the owner (crude
stacked-primitives read, protruding face slab, pedestal + landing-pad
rings dominating the composition, floating panels competing with the
headline). Phase 19 §2.2 required three genuinely different shape
directions rendered as viewport previews, then one prompt decision.

- **Direction A — The Vessel** (sculptural intelligence companion):
  one continuous lathe-turned porcelain volume, recessed smoked-glass
  lens, one cyan arc eye, single swept pauldron. **SELECTED.**
- Direction B — The Gimbal (precision mechanical, capsule stack):
  rejected — reads "smart-home gadget / toy", generic mascot class.
- Direction C — The Seed (abstract hovering ovoid): rejected —
  identity crisis ("river stone"), no face anchor, no presence.

Evidence: concept board renders (3 canvases, one light rig) +
independent VLM evaluation (A = silhouette weight + mysterious
sophistication; B = 6/10 craft, toy risk; C = 5/10, unfinished read)
+ coordinator judgment. Both agreed on A.

## The character (silhouette of record)

- **One continuous turned body**: foot flare → waist draw-in → chest
  swell → shoulder taper → neck (single `LatheGeometry`, 96 segments).
- **The head**: a cranial dome continuing the body's curvature across
  ONE designed articulation seam (graphite collar) — engineered joint,
  never a disconnected box.
- **The face**: a recessed smoked-glass lens SET INTO the dome's front
  (elliptical, graphite bezel) — never a protruding slab.
- **The eye**: ONE thin luminous cyan arc (TorusGeometry, ~153° sweep,
  downward-open calm gaze) + a soft additive glow halo riding the
  lens's front surface. Expression = intensity + breathing + beat hue.
  **NEVER two dot eyes, NEVER a rectangular face border** (the
  ChainGPT identity laws).
- **Asymmetry**: ONE swept graphite pauldron hugging the inline-start
  shoulder + the dome's resting z-lean (~2°).
- **The chest core**: a quiet porthole (housing + dim ring) —
  subordinate to the face.
- **Materials**: warm porcelain `#E7E5E0` (clearcoat 1.0 — bone-china
  read), graphite metal `#1E2026`, smoked glass `#05070B`. The PMREM
  RoomEnvironment (intensity 0.34) provides the believable reflections
  the rejected matte-plastic character never had.
- **The eye z-law**: any emissive face element must clear the lens
  front surface (z-front 0.245 > 0.224). An emissive buried inside an
  opaque mesh never renders — pixel-proof, not VLM-assumed (the P18
  lesson, repeated and caught in P19 by pixel scan).

## The stage

No pedestal. No landing-pad rings. No grid hairlines. No dust. No
mirrored reflection. The vessel stands on a soft radial contact
shadow in the near-black void (`#050506`); the CSS floor glow is the
light spill. **The vessel IS the scene's principal light source** (the
pale figure on the near-black void).

## The registers (unchanged law)

- Cyan `#56E2F2` = the machine's voice (rest, replies).
- Violet `#9380FF` = the AI register (classify beats — the eye + core
  warm violet).
- Amber `#FF9A69` = the human/handoff register (the body tips forward,
  the registers warm).

## The light rig

Neutral warm key (2.35, +x/+y/+z), cool cyan rim (1.9, −x), warm amber
kicker (0.85, +x low), quiet ambient fill, white face glow, cyan floor
bounce (the grounding half). ACES filmic, exposure 1.14, DPR ≤ 2.

## Aliveness

1. Pointer: head ±22°/±10° (critically damped, fine-pointer only).
2. Idle: breathing bob ±1.3%, the arc's luminous breath ±16%, the
   head's slow wander + resting z-lean.
3. Scenario (heroBus): inbound → head turns toward the console + the
   arc brightens/widens; classify → violet warmth; reply → a fast scan
   shimmer; handoff → forward body tip + amber warmth.

## Composition (the framing contracts)

- Desktop (≥1025px): asymmetric — the vessel owns the inline-end band
  (`--sb-x: 0.85`), the display lockup owns inline-start, the demo
  console rides the reading-start upper band. ONE integrated demo
  panel (the standalone SYSTEM status micro-panel is RETIRED — §2.4).
- Mobile (≤1024px): the vessel's BUST close-up in a 41svh stage —
  `--sb-fig: 1.63 / --sb-floor: 1.6` (visible window ≈ [0.52, 1.38]
  world units: head + lens + upper chest; feet cropped by design).
- Tablet (641–1024px): grid composition — copy top, figure + centered
  console in the middle band, foot bottom.
- Fresh visitors get the DARK stage by default; the light "porcelain
  day" twin repaints the whole scene (materials + fog + shadow) via
  the MutationObserver palette bridge.
