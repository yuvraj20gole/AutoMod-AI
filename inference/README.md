# AutoMod AI inference engine

FastAPI service that (a) identifies a car and the photo angle from an uploaded
photo, and (b) renders a photorealistic preview of a chosen modification.

## Two edit engines (Fast + Detailed)

| Engine | Model | How it runs | Typical time | Memory rule |
|---|---|---|---|---|
| **Fast** (default) | InstructPix2Pix + panel mask composite | Loaded once in this server process | ~1–2 min | Shares an exclusive lock with Detailed |
| **Detailed** | Qwen-Image-Edit-2511 q4 via **mflux** (MLX) + Lightning LoRA | Short-lived `inference/qwen/runner.py` subprocess per job | ~3.5–4 min | Peaks ~31 GB — **never run alongside Fast** |

Only one edit runs at a time across both engines (`job_queue.engine_lock`). Detailed
loads the model, edits, post-processes (LAB colour-match + edit-region blend),
writes the PNG, and **exits** so RAM is freed. Extra jobs queue.

**Advisor chat (Ollama 3B)** must not fight Detailed for memory: chat uses
`keep_alive=60s`, and while a Detailed job is queued/running the Next.js
advisor API forces **Basic mode** (rule engine only). See root `README.md`.

### Enabling Detailed

1. Install mflux: `uv tool install mflux` (Apple Silicon).
2. Ensure the q4 cache exists under
   `~/.cache/huggingface/hub/models--mflux-community--qwen-image-edit-2511-mflux-q4`
   (first run of the runner downloads it).
3. `GET /engines` reports `detailed.ready`; Studio disables the selector with a
   short reason when it is not. Nothing extra is started by `scripts/start.sh`
   — Detailed is subprocess-only. `scripts/stop.sh` also kills leftover
   `runner.py` / `mflux-generate-qwen-edit` processes.

Locked prompts/seeds live in `inference/qwen/prompts.json`. Detailed prompts ask
to leave the plate blank; post-process also **paste-backs** original plate
pixels (`qwen/plate.py`: YOLO plate if present, else trunk-guided classical
detect; fail-safe skip) because Qwen still scribbles into the edit mask.
Bumper gloss finishes are wired with `"provisional": true` — review
`~/qwen_test/sheets_bumper/` before locking. Paint/wrap/wheels/hood entries
marked `"experimental": true` are Fast→Detailed parity ports (Studio tag;
review sheets in `~/qwen_test/sheets_parity_v3/`). Each prompts.json entry
has `"postprocess": "none"` on **every** option (raw Lanczos resize only).
Plate paste-back remains in `qwen/plate.py` but defaults **off**
(`AUTOMOD_PLATE_RESTORE=1` to enable). `runner.py` honours prompts.json.
Studio **Compare engines** runs the counterpart mod on the other engine
through the same one-job queue.

Fast edits still use InstructPix2Pix: the photo is segmented into car panels
(YOLO11, `weights/panel_best.pt`), the model edits the whole frame, and
`parts.py::composite()` pastes only the masked panels back over the original —
so backgrounds, glass, lights and wheels stay pixel-identical unless they are
the thing being edited.

## The five edits

| Category | Options (see `presets.py`) | Model | Notes |
|---|---|---|---|
| `paint` | gloss black, candy red, deep blue, emerald green, bright orange, sunshine yellow | **Base** InstructPix2Pix | Full body-panel mask incl. roof/pillars the detector misses |
| `wrap` | matte black, satin blue/purple/orange, matte green, gloss teal | **Base** InstructPix2Pix | Same body mask as paint |
| `wheels` | gloss black, gold, bronze, white rims | **Base** InstructPix2Pix | Wheel masks only |
| `hood` | matte black, carbon fibre, gloss red | **LoRA** (`weights/automod_lora_v2.pt`) | LoRA beat the base model here |
| `spoiler` | Ducktail spoiler, Lip spoiler, Ducktail (ids `gt_wing`, `roof_spoiler`, `ducktail`) | **LoRA** (`weights/automod_lora_v2.pt`) | Rear photos only (needs trunk/tail-lights); renders as a low lip/ducktail — see Limitations |

The LoRA was fine-tuned on teacher-generated pairs; overall the untouched
base model edited paint/wrap/wheels better, so only hood and spoiler use it.

Key code:

- `server.py` — FastAPI app (`/health`, `/options`, `/identify`, `/edit`),
  MPS/CUDA/CPU device selection, letterboxing, LoRA enable/disable per edit.
- `identify.py` — CLIP (`openai/clip-vit-base-patch16`) make/model candidates
  plus **automatic photo-angle detection** (`front_34`, `rear_34`, `side`, …)
  derived from which panels are visible.
- `parts.py` — panel segmentation, `build_mask()` per category (incl. the
  roof/pillar and front-corner extensions for paint/wrap), and `composite()`:
  outward-feathered alpha, clipped to the car silhouette, with a darkened
  1–2 px fringe for dark colours so light edge pixels don't halo.
- `presets.py` — instructions, guidance scales and base-vs-LoRA choice.
- `demo_check.py` — offline batch check: posts photos through the server and
  writes before/after sheets to `demo_candidates/demo_check_results/`.

## Start everything (engine + web app)

From the repo root:

```bash
npm run start:all        # scripts/start.sh — Ctrl+C stops both
bash scripts/stop.sh     # if a port (8001/3000) gets stuck
```

`start.sh` checks that `inference/.venv`, `node_modules` and `.env.local`
exist (and says exactly what is missing), starts both processes, waits until
`/health` reports `ready: true`, prints **Engine ready**, and opens
http://localhost:3000.

Engine only (Apple Silicon or CUDA):

```bash
cd inference
.venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8001
```

Use `inference/.venv/bin/python` — on this machine the system `python3` is
unreliable. First start downloads the base model (~6 GB), the LoRA/panel
weights are in `weights/`. `.env.local` at the repo root needs
`INFERENCE_URL=http://127.0.0.1:8001` (plus the Supabase keys). Optional env:
`INFERENCE_API_KEY` (must match on both sides), `INFERENCE_STEPS` (default
30), `INFERENCE_FP32=1` if MPS output looks black/noisy, `AUTOMOD_MASKING=0`
to bypass panel masking.

## Endpoints

- `GET /health` → `{"status": "ok", "device": "mps", "ready": true}`
- `GET /engines` → Fast + Detailed readiness (`ready`, `reason`, `eta`)
- `GET /options` → categories/options/model per category (Fast presets)
- `POST /identify` (multipart `image`) → make/model candidates + photo angle
- `POST /edit` (multipart `image`, `category`, `option`, `seed`) → PNG Fast
  edit (holds the shared engine lock). Headers: `X-Instruction`, `X-Model`,
  `X-Mask`, `X-Engine: fast`. Spoiler on a photo with no rear view → HTTP 422.
- `POST /jobs` (multipart `image`, `engine=detailed`, `part` or
  `category`+`option`, optional `seed`) → `{id, status: queued}` — worker
  runs `qwen/runner.py` (15 min timeout).
- `GET /jobs/{id}` → status snapshot; `GET /jobs/{id}/result` → PNG when done.

## Known limitations

- **Coupe rear and side angle detection** is unreliable: the angle rules were
  tuned on sedans (they expect two doors per side), so coupes/sports cars
  (Mustang, M4, 911) can be misclassified, and coupe rear spoiler edits can
  422 when no trunk/tail-light is detected.
- **White-to-black wraps** can keep a faint 1–2 px light line at a few mask
  edges (e.g. A-pillar against the windshield) where the model's own edited
  edge is bright; the silhouette clip + dark fringe removed the halo proper,
  but that last edge row is model content, not compositing.
- **Spoiler renders as a lip**, not a tall wing — the LoRA renders a
  subtle boot lip even for the Ducktail spoiler option, which is why the
  options are named for what they actually look like.
- **Speed:** expect roughly 1–2 minutes per edit end-to-end on an Apple GPU
  (MPS, 30 steps); the model loads once at server start.
- Angle/segmentation quality bounds everything: if the panel detector misses
  a panel, the mask (and therefore the edit) misses it too.

## Demo cars

The **Toyota Corolla Altis** (silver, front 3/4 / rear 3/4 / side in
`demo_final/` and `demo_candidates/`) is the main demo car; the white Hyundai
Verna is the secondary one. Regenerate the demo sheets with the server
running: `.venv/bin/python demo_check.py`.
