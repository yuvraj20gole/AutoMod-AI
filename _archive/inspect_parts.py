import sys

import numpy as np
from huggingface_hub import hf_hub_download
from PIL import Image
from ultralytics import YOLO

path = sys.argv[1]
model = YOLO(hf_hub_download("shanexf/car-panel-yolo11s-seg-scratch", "panel_best.pt"))
res = model.predict(path, conf=0.25, retina_masks=True, agnostic_nms=True, verbose=False)[0]
res.save("parts_overlay.png")
print("found parts:")
if res.masks is not None:
    for c, s, m in zip(res.boxes.cls.tolist(), res.boxes.conf.tolist(), res.masks.data.cpu().numpy()):
        print("  %-16s conf %.2f  area %.1f%%" % (res.names[int(c)], s, 100 * m.mean()))
print("saved parts_overlay.png")
