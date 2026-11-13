"""ffmpeg yardımcıları: belirli anlardan kare almak ve bir ses parçasını 48 kHz mono PCM olarak çözmek."""

from __future__ import annotations

import io
import subprocess
from pathlib import Path

import numpy as np

FFMPEG = "ffmpeg"


def grab_frame(video: Path, t: float):
    """`t` saniyedeki kare (PIL görüntüsü); alınamazsa None. Hızlı arama (-ss girdiden önce) kullanılır."""
    from PIL import Image

    cmd = [FFMPEG, "-v", "error", "-ss", f"{max(t, 0):.3f}", "-i", str(video), "-frames:v", "1",
           "-f", "image2pipe", "-vcodec", "png", "-"]
    r = subprocess.run(cmd, capture_output=True, check=False)
    if r.returncode != 0 or not r.stdout:
        return None
    return Image.open(io.BytesIO(r.stdout)).convert("RGB")


def decode_audio(media: Path, out: Path, rate: int = 48000) -> np.ndarray | None:
    """Ses akışının tamamını mono float32 PCM olarak bir kez çözer ve diske yazar (sonra bellek eşlemeli okunur)."""
    if not out.exists():
        tmp = out.with_suffix(".part")
        cmd = [FFMPEG, "-v", "error", "-i", str(media), "-vn", "-ac", "1", "-ar", str(rate), "-f", "f32le", str(tmp), "-y"]
        r = subprocess.run(cmd, capture_output=True, check=False)
        if r.returncode != 0 or not tmp.exists() or tmp.stat().st_size == 0:
            tmp.unlink(missing_ok=True)
            return None
        tmp.rename(out)
    return np.memmap(out, dtype=np.float32, mode="r")


def frame_times(start: float, end: float, n: int = 3) -> list[float]:
    """Çekimin içinden eşit aralıklı `n` an (uçlardan uzak: kesimin hemen yanındaki kare karışık olabilir)."""
    d = max(end - start, 0.0)
    return [start + d * (k + 1) / (n + 1) for k in range(n)]
