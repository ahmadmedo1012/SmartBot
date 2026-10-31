# SmartBot Maestro E2E — README (P38 Phase L)

## What's here

| Flow | File | Journey |
|---|---|---|
| Merchant | `merchant-journey.yaml` | Login → dashboard KPIs → conversations inbox → thread open (attachment rendering) → logout |

Selectors are grounded in the real screen labels at commit `0208f543`
(source lines cited in the YAML header). The thread step asserts the
P38 attachment rendering surfaces (image labels / «رد آلي» / «الصفحة»
markers) instead of empty bubbles.

## Running (real device/emulator required — not runnable in the sandbox)

```bash
adb install smartbot-preview.apk
export QA_USER=...          # QA account (NOT a live customer page owner)
export QA_PASSWORD=...
maestro test maestro/
```

## Honest blocker + safety rules

Same sandbox limitation as P35 (no emulator/KVM/adb/USB, no macOS):
flows are **authored but not executed** here.

Safety: the QA account must own a **test** Facebook page (never a page
with real customers — no real replies/broadcasts during QA). The flow
is read-only (no reply submissions).
