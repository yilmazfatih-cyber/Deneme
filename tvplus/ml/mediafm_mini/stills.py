"""KEYFRAMES sözde çekimlerinin hazır kareleri (i.ytimg.com — asla youtube.com değil).

Her kare bir kez indirilir ve ml/.cache/stills/<youtubeId>/ altında tutulur; başarısızlık da kaydedilir (yeniden
denenmez). Otomatik kareler ('1' '2' '3') için aynı karenin 480×360 sürümü (`hq1.jpg` …) istenir, yoksa 120×90'lık
özgün küçük kare. 4:3 kabın içindeki 16:9 görüntünün siyah bantları kırpılır.
"""

from __future__ import annotations

import time
import urllib.error
import urllib.request
from pathlib import Path

from .paths import STILLS_DIR, USER_AGENT

GAP_SEC = 1.0
_last = [0.0]
REQUESTS = [0]


def _candidates(name: str) -> list[str]:
    return ["hqdefault"] if name == "hq" else [f"hq{name}", name]


def _fetch(url: str) -> bytes | None:
    dt = _last[0] + GAP_SEC - time.monotonic()
    if dt > 0:
        time.sleep(dt)
    _last[0] = time.monotonic()
    REQUESTS[0] += 1
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()
    except urllib.error.HTTPError:
        return None


def still_path(youtube_id: str, name: str, offline: bool = False) -> Path | None:
    d = STILLS_DIR / youtube_id
    for c in _candidates(name):
        p = d / f"{c}.jpg"
        if p.exists():
            return p
    fail = d / f"{name}.fail"
    if fail.exists() or offline:
        return None
    d.mkdir(parents=True, exist_ok=True)
    for c in _candidates(name):
        data = _fetch(f"https://i.ytimg.com/vi/{youtube_id}/{c}.jpg")
        if data:
            p = d / f"{c}.jpg"
            p.write_bytes(data)
            return p
    fail.write_text("404")
    return None


def load_still(path: Path):
    """Kareyi açar; 4:3 kaptaki üst/alt siyah bantları (16:9 içerik) kırpar."""
    import numpy as np
    from PIL import Image

    img = Image.open(path).convert("RGB")
    w, h = img.size
    if abs(w / h - 4 / 3) < 0.02:
        a = np.asarray(img.convert("L"), dtype=np.float32)
        band = int(round((h - w * 9 / 16) / 2))
        if band > 0 and a[:band].mean() < 12 and a[h - band :].mean() < 12:
            img = img.crop((0, band, w, h - band))
    return img
