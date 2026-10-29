# _archive — obsolete files, kept (nothing deleted)

Moved here on 2026-10-20 to keep the working tree clean. **Nothing in this
folder is used by the app or the engine any more, and nothing was deleted** —
restore any file by moving it back to its original location.

| File | Was at | What it was |
|---|---|---|
| `masks.py` | `inference/masks.py` | First-generation mask builder (CLIPSeg-based). Superseded by `inference/parts.py` (YOLO panel segmentation). |
| `masks_clipseg_only.py.bak` | `inference/masks_clipseg_only.py.bak` | Backup of the CLIPSeg-only mask experiment that preceded `parts.py`. |
| `inspect_masks.py` | `inference/inspect_masks.py` | Debug script that imported `masks.py` to dump/inspect masks. Archived together with the module it depended on. |
| `inspect_parts.py` | `inference/inspect_parts.py` | Debug script for inspecting detected car parts / overlays. |
| `mask_hood.png` | `inference/mask_hood.png` | Saved mask debug image (hood). |
| `mask_paint.png` | `inference/mask_paint.png` | Saved mask debug image (paint). |
| `mask_spoiler.png` | `inference/mask_spoiler.png` | Saved mask debug image (spoiler). |
| `mask_wheels.png` | `inference/mask_wheels.png` | Saved mask debug image (wheels). |
| `mask_wrap.png` | `inference/mask_wrap.png` | Saved mask debug image (wrap). |
| `parts_overlay.png` | `inference/parts_overlay.png` | Saved parts-overlay debug image. |
| `parts.py.bak_oct20` | `inference/parts.py.bak_oct20` | Backup copy of `inference/parts.py` from 2026-10-20, before that day's compositing work. |

## Still in use — NOT archived (do not move these)

`inference/parts.py`, `inference/identify.py`, `inference/server.py`,
`inference/presets.py`, `inference/demo_check.py` are the live engine.
