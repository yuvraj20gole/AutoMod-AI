import io
import json
import os
import tempfile
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from peft import LoraConfig, set_peft_model_state_dict
from PIL import Image
from diffusers import StableDiffusionInstructPix2PixPipeline

from presets import PRESETS, build_instruction
from parts import NoRearView, PartsSegmenter, build_mask, composite
from identify import CarIdentifier
from job_queue import queue as job_queue
from qwen.availability import detailed_status
from qwen.prompts_map import part_for_mod

BASE_MODEL = "timbrooks/instruct-pix2pix"
LORA_PATH = os.path.join(os.path.dirname(__file__), "weights", "automod_lora_v2.pt")
API_KEY = os.environ.get("INFERENCE_API_KEY", "")
RES = 512
STEPS = int(os.environ.get("INFERENCE_STEPS", "30"))
IMAGE_GUIDANCE = 1.5
TEXT_GUIDANCE = 7.5
OUT_LONG_SIDE = 1024
MASKING = os.environ.get("AUTOMOD_MASKING", "1") == "1"
MIN_MASK_COVERAGE = 0.003

if torch.cuda.is_available():
    DEVICE, DTYPE = "cuda", torch.float16
elif torch.backends.mps.is_available():
    DEVICE, DTYPE = "mps", torch.float16
else:
    DEVICE, DTYPE = "cpu", torch.float32

if os.environ.get("INFERENCE_FP32") == "1":
    DTYPE = torch.float32

state = {}
lock = threading.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    pipe = StableDiffusionInstructPix2PixPipeline.from_pretrained(
        BASE_MODEL, torch_dtype=DTYPE, safety_checker=None
    ).to(DEVICE)
    pipe.set_progress_bar_config(disable=True)
    unet = pipe.unet
    unet.add_adapter(
        LoraConfig(
            r=4,
            lora_alpha=4,
            init_lora_weights=True,
            target_modules=["to_q", "to_k", "to_v", "to_out.0"],
        )
    )
    sd = torch.load(LORA_PATH, map_location="cpu")
    set_peft_model_state_dict(unet, sd)
    for p in unet.parameters():
        p.data = p.data.to(DTYPE)
    unet.to(DEVICE)
    state["pipe"] = pipe
    if MASKING:
        try:
            state["seg"] = PartsSegmenter()
        except Exception as exc:
            print("masking disabled, segmenter failed to load:", exc)
    try:
        state["ident"] = CarIdentifier()
    except Exception as exc:
        import traceback
        traceback.print_exc()
        state["ident_error"] = f"{type(exc).__name__}: {exc}"
        print("car identification disabled, CLIP failed to load:", exc)
    job_queue.start()
    yield
    state.clear()


app = FastAPI(title="AutoMod AI inference", lifespan=lifespan)


def letterbox(img: Image.Image):
    img = img.convert("RGB")
    w, h = img.size
    scale = RES / max(w, h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    small = img.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (RES, RES), (128, 128, 128))
    left, top = (RES - nw) // 2, (RES - nh) // 2
    canvas.paste(small, (left, top))
    return canvas, (left, top, left + nw, top + nh), (w, h)


def unbox(result: Image.Image, box, orig_size):
    cropped = result.crop(box)
    w, h = orig_size
    scale = OUT_LONG_SIDE / max(w, h)
    out_size = (max(1, round(w * scale)), max(1, round(h * scale)))
    return cropped.resize(out_size, Image.Resampling.LANCZOS)


@app.get("/health")
def health():
    d = detailed_status()
    return {
        "status": "ok",
        "device": DEVICE,
        "ready": "pipe" in state,
        "engines": {
            "fast": {"ready": "pipe" in state},
            "detailed": {"ready": d["ready"], "reason": d.get("reason")},
        },
    }


@app.get("/engines")
def engines():
    d = detailed_status()
    return {
        "fast": {
            "id": "fast",
            "label": "Fast",
            "ready": "pipe" in state,
            "reason": None if "pipe" in state else "InstructPix2Pix model still loading",
            "eta": "about 1–2 min",
        },
        "detailed": {
            "id": "detailed",
            "label": "Detailed",
            "ready": d["ready"],
            "reason": d.get("reason"),
            "eta": "about 4 min",
            "parts": sorted(json.loads((Path(__file__).parent / "qwen" / "prompts.json").read_text())),
        },
    }


@app.post("/identify")
async def identify(
    image: UploadFile = File(...),
    x_api_key: str = Header(default=""),
):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="bad api key")
    if "ident" not in state:
        raise HTTPException(status_code=503, detail="identifier not available: " + state.get("ident_error", "not loaded"))
    try:
        img = Image.open(io.BytesIO(await image.read()))
    except Exception:
        raise HTTPException(status_code=400, detail="invalid image")
    with lock:
        candidates = state["ident"].identify(img)
        parts = None
        if "seg" in state:
            try:
                parts = state["seg"].parts(img.convert("RGB"))
            except Exception as exc:
                print("angle parts check failed:", exc)
        angle = state["ident"].angle(parts)
    return {"candidates": candidates, "angle": angle}


@app.get("/options")
def options():
    return {
        key: {"label": p["label"], "options": p["options"], "model": p["model"]}
        for key, p in PRESETS.items()
    }


@app.post("/edit")
async def edit(
    image: UploadFile = File(...),
    category: str = Form(...),
    option: str = Form(...),
    seed: int = Form(0),
    x_api_key: str = Header(default=""),
):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="bad api key")
    if "pipe" not in state:
        raise HTTPException(status_code=503, detail="model loading")
    if category not in PRESETS or option not in PRESETS[category]["options"]:
        raise HTTPException(status_code=400, detail="unknown category or option")
    try:
        src = Image.open(io.BytesIO(await image.read()))
    except Exception:
        raise HTTPException(status_code=400, detail="invalid image")

    square, box, orig = letterbox(src)
    instruction = build_instruction(category, option)
    mask = None
    if "seg" in state:
        try:
            mask = build_mask(state["seg"], category, square.crop(box))
        except NoRearView:
            raise HTTPException(
                status_code=422,
                detail="This edit needs a photo that shows the back of the car (trunk or tail lights).",
            )
        except Exception as exc:
            print("masking failed, returning unmasked edit:", exc)
            mask = None
    use_lora = PRESETS[category]["model"] == "lora"
    pipe = state["pipe"]
    gen = torch.Generator(device="cpu").manual_seed(seed)

    # Share the engine lock with Detailed so both never run together.
    with job_queue.engine_lock:
        with lock:
            if use_lora:
                pipe.unet.enable_adapters()
            else:
                pipe.unet.disable_adapters()
            try:
                result = pipe(
                    instruction,
                    image=square,
                    num_inference_steps=STEPS,
                    image_guidance_scale=PRESETS[category].get("image_guidance", IMAGE_GUIDANCE),
                    guidance_scale=TEXT_GUIDANCE,
                    generator=gen,
                ).images[0]
            finally:
                pipe.unet.enable_adapters()

    out = unbox(result, box, orig)
    mask_note = "off"
    if mask is not None and mask.mean() >= MIN_MASK_COVERAGE:
        base = src.convert("RGB").resize(out.size, Image.Resampling.LANCZOS)
        out = composite(base, out, mask)
        mask_note = "applied"
    elif "seg" in state:
        mask_note = "fallback"
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={
            "X-Instruction": instruction,
            "X-Model": "lora-v2" if use_lora else "baseline",
            "X-Mask": mask_note,
            "X-Engine": "fast",
        },
    )


@app.post("/jobs")
async def create_job(
    image: UploadFile = File(...),
    engine: str = Form("detailed"),
    part: str = Form(None),
    category: str = Form(None),
    option: str = Form(None),
    seed: int = Form(None),
    job_id: str = Form(None),
    x_api_key: str = Header(default=""),
):
    """Enqueue a Detailed (or future async Fast) edit. One job at a time globally."""
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="bad api key")
    if engine != "detailed":
        raise HTTPException(status_code=400, detail="only engine=detailed is supported on /jobs; use POST /edit for fast")
    status = detailed_status()
    if not status["ready"]:
        raise HTTPException(status_code=503, detail=status.get("reason") or "Detailed engine unavailable")

    resolved_part = part
    if not resolved_part:
        if not category or not option:
            raise HTTPException(status_code=400, detail="part or category+option required")
        resolved_part = part_for_mod(category, option)
        if not resolved_part:
            raise HTTPException(status_code=400, detail=f"no Detailed prompt for {category}/{option}")

    try:
        raw = await image.read()
        Image.open(io.BytesIO(raw)).verify()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid image")

    job_dir = Path(tempfile.gettempdir()) / "automod_jobs"
    job_dir.mkdir(parents=True, exist_ok=True)
    jid = job_id or None
    # Write input before enqueue so the worker can open it.
    import uuid as _uuid

    jid = jid or str(_uuid.uuid4())
    in_path = job_dir / f"{jid}_in.png"
    in_path.write_bytes(raw)

    job = job_queue.enqueue_detailed(
        input_path=in_path,
        part=resolved_part,
        seed=seed,
        job_id=jid,
    )
    return {"id": job.id, "status": job.status.value, "engine": "detailed", "part": resolved_part}


@app.get("/jobs/{job_id}")
def get_job(job_id: str, x_api_key: str = Header(default="")):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="bad api key")
    snap = job_queue.snapshot(job_id)
    if not snap:
        raise HTTPException(status_code=404, detail="job not found")
    return snap


@app.get("/jobs/{job_id}/result")
def get_job_result(job_id: str, x_api_key: str = Header(default="")):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="bad api key")
    job = job_queue.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if job.status.value != "done" or not job.result_bytes:
        raise HTTPException(status_code=409, detail=f"job not ready ({job.status.value})")
    return Response(
        content=job.result_bytes,
        media_type="image/png",
        headers={"X-Engine": "detailed", "X-Part": job.part or ""},
    )
