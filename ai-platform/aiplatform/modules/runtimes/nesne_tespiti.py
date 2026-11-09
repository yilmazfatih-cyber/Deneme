"""N18 Nesne Tespiti — RF-DETR (COCO sınıfları); `count` belirli sınıfı sayar (stok, araç, palet...)."""

from __future__ import annotations

import asyncio
import io

from ...runtimes import model_dir
from ...runtimes.lazy import LazyModel
from ..base import register
from ._common import BaseRuntime, ModuleError, RunContext, get_file, has_package, not_ready, note, require

MODEL_ID = "rf-detr"
TR_NAMES = {
    "kişi": "person",
    "insan": "person",
    "araba": "car",
    "otomobil": "car",
    "kamyon": "truck",
    "otobüs": "bus",
    "motosiklet": "motorcycle",
    "bisiklet": "bicycle",
    "şişe": "bottle",
    "sandalye": "chair",
    "laptop": "laptop",
    "dizüstü": "laptop",
    "telefon": "cell phone",
    "kitap": "book",
    "saat": "clock",
    "bardak": "cup",
    "koli": "suitcase",
    "valiz": "suitcase",
    "masa": "dining table",
    "tv": "tv",
    "televizyon": "tv",
}


def _load():  # pragma: no cover - rfdetr yok
    from rfdetr import RFDETRBase

    d = model_dir(MODEL_ID)
    weights = sorted(d.rglob("*.pth")) if d else []
    return RFDETRBase(pretrain_weights=str(weights[0])) if weights else RFDETRBase()


_MODEL = LazyModel(_load, "rf-detr")


def _class_names() -> dict:  # pragma: no cover
    try:
        from rfdetr.util.coco_classes import COCO_CLASSES

        return dict(COCO_CLASSES)
    except Exception:
        return {}


def detect(image: bytes, threshold: float) -> list[dict]:  # pragma: no cover - rfdetr yok
    from PIL import Image

    img = Image.open(io.BytesIO(image)).convert("RGB")
    det = _MODEL.get().predict(img, threshold=threshold)
    names = _class_names()
    out = []
    for box, cid, conf in zip(det.xyxy.tolist(), det.class_id.tolist(), det.confidence.tolist()):
        out.append(
            {
                "class_id": int(cid),
                "class_name": names.get(int(cid), str(cid)),
                "confidence": round(float(conf), 4),
                "box": [round(float(v), 1) for v in box],
            }
        )
    return out


def _norm_class(c: str) -> str:
    c = str(c).strip()
    low = c.replace("İ", "i").replace("I", "ı").lower()
    return TR_NAMES.get(low, low)


@register("nesne-tespiti")
class NesneTespiti(BaseRuntime):
    requires = ("rfdetr",)

    async def do_detect(self, payload: dict, ctx: RunContext) -> dict:
        image = get_file(payload, ctx, "image")
        if not has_package("rfdetr"):
            raise not_ready("rfdetr", "nesne-tespiti")
        dets = await asyncio.to_thread(detect, image, float(payload.get("threshold", 0.5)))
        classes = {_norm_class(c) for c in payload.get("classes") or []}
        if classes:
            dets = [d for d in dets if d["class_name"].lower() in classes]
        note(ctx, model=MODEL_ID)
        return {"detections": dets, "count": len(dets)}

    async def do_count(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "class_name")
        if not isinstance(payload["class_name"], str):
            raise ModuleError("'class_name' metin olmalı")
        res = await self.do_detect({**payload, "classes": [payload["class_name"]]}, ctx)
        return {
            "class_name": _norm_class(payload["class_name"]),
            "count": res["count"],
            "detections": res["detections"],
        }
