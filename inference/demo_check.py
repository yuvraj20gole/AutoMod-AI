import io
import os
import sys
import time
import json
import uuid
import urllib.error
import urllib.request

from PIL import Image, ImageDraw

SERVER = os.environ.get("AUTOMOD_URL", "http://127.0.0.1:8001")
MODS_FOR_ANGLE = {
    "side": [("paint", "candy_red"), ("wrap", "matte_black"), ("wheels", "gold")],
    "front_34": [("hood", "carbon_fibre"), ("paint", "candy_red"), ("wheels", "gold")],
    "front": [("hood", "carbon_fibre"), ("paint", "candy_red")],
    "rear_34": [("spoiler", "gt_wing"), ("spoiler", "roof_spoiler"), ("paint", "candy_red")],
    "rear": [("spoiler", "gt_wing"), ("spoiler", "roof_spoiler")],
}


def post(path, fields, filedata):
    boundary = uuid.uuid4().hex
    body = io.BytesIO()
    for k, v in fields.items():
        body.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    body.write(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"car.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".encode()
    )
    body.write(filedata)
    body.write(f"\r\n--{boundary}--\r\n".encode())
    req = urllib.request.Request(
        SERVER + path,
        data=body.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    return urllib.request.urlopen(req, timeout=600)


def check_server():
    """Return True if the engine server answers /health, else print why not."""
    print(f"Checking engine server at {SERVER} ...", flush=True)
    try:
        with urllib.request.urlopen(SERVER + "/health", timeout=5) as resp:
            health = json.loads(resp.read())
    except Exception as exc:
        print(f"ERROR: cannot reach the engine server at {SERVER} ({exc}).", flush=True)
        print(
            "Start it first, e.g.:  cd inference && "
            ".venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8001",
            flush=True,
        )
        print("Then wait until /health returns \"ready\": true and re-run this script.", flush=True)
        return False
    print(f"Server reachable: {health}", flush=True)
    if not health.get("ready"):
        print("ERROR: server is up but models are not ready yet. Wait and re-run.", flush=True)
        return False
    return True


def _err_text(exc):
    """Include HTTP body (e.g. Flask/FastAPI detail) in failure messages."""
    if isinstance(exc, urllib.error.HTTPError):
        try:
            body = exc.read().decode("utf-8", "replace").strip()
        except Exception:
            body = ""
        return f"HTTP {exc.code} {exc.reason}" + (f": {body}" if body else "")
    return f"{type(exc).__name__}: {exc}"


def main(folder):
    folder = os.path.abspath(folder)
    print(f"Folder: {folder}", flush=True)
    if not os.path.isdir(folder):
        print(f"ERROR: folder does not exist: {folder}", flush=True)
        sys.exit(1)
    out_dir = os.path.join(folder, "demo_check_results")
    os.makedirs(out_dir, exist_ok=True)
    files = sorted(
        f for f in os.listdir(folder)
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    )
    print(f"Photos found: {len(files)}", flush=True)
    for name in files:
        print(f"  - {name}", flush=True)
    if not files:
        print("No photos found in", folder, flush=True)
        return
    if not check_server():
        sys.exit(1)

    sheets = []
    failures = []  # (photo, edit, error text)
    for idx, name in enumerate(files, 1):
        print(f"\n[{idx}/{len(files)}] {name}", flush=True)
        path = os.path.join(folder, name)
        raw = open(path, "rb").read()
        base = os.path.splitext(name)[0]
        try:
            ident = json.loads(post("/identify", {}, raw).read())
        except Exception as exc:
            err = _err_text(exc)
            print(f"  identify: FAILED {err}", flush=True)
            failures.append((name, "identify", err))
            continue
        angle = ident["angle"]
        top = ident["candidates"][0]
        print(f"{name}: looks like {top['make']} {top['model']} ({top['score']:.0%}), angle {angle}", flush=True)
        tiles = [("original", Image.open(path).convert("RGB"))]
        for category, option in MODS_FOR_ANGLE.get(angle, []):
            t0 = time.time()
            try:
                resp = post("/edit", {"category": category, "option": option, "seed": "7"}, raw)
                img = Image.open(io.BytesIO(resp.read())).convert("RGB")
                img.save(os.path.join(out_dir, f"{base}_{category}_{option}.png"))
                tiles.append((f"{category} / {option}", img))
                print(f"  {category}/{option}: ok in {time.time() - t0:.0f}s", flush=True)
            except Exception as exc:
                err = _err_text(exc)
                print(f"  {category}/{option}: FAILED {err}", flush=True)
                failures.append((name, f"{category}/{option}", err))
        h = 420
        scaled = [(label, im.resize((max(1, round(im.width * h / im.height)), h))) for label, im in tiles]
        sheet = Image.new("RGB", (sum(i.width for _, i in scaled) + 10 * (len(scaled) + 1), h + 50), "white")
        x = 10
        d = ImageDraw.Draw(sheet)
        for label, im in scaled:
            sheet.paste(im, (x, 40))
            d.text((x, 12), label, fill="black")
            x += im.width + 10
        sheet_path = os.path.join(out_dir, f"{base}_sheet.png")
        sheet.save(sheet_path)
        sheets.append(sheet_path)
        print(f"  sheet: {sheet_path}", flush=True)
    print("\nDone. Open the *_sheet.png files in:", out_dir, flush=True)
    print(f"Sheets created: {len(sheets)}", flush=True)
    for s in sheets:
        print(f"  - {os.path.basename(s)}", flush=True)
    if failures:
        print(f"Failures: {len(failures)}", flush=True)
        for photo, edit, err in failures:
            print(f"  - {photo} [{edit}]: {err}", flush=True)
    else:
        print("Failures: none", flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python demo_check.py /path/to/folder_with_car_photos")
        sys.exit(1)
    main(sys.argv[1])
