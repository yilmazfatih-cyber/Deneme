"""Eğitilmiş modelle kelime/satır görüntülerinden A/B/C seçenekleri üretme."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
from PIL import Image

from .kodcoz import secenekler
from .model import model_yukle
from .veri import on_isle


class Tahminci:
    def __init__(self, model_yolu: Path, cihaz: str = "cpu"):
        self.model_yolu = Path(model_yolu)
        self.cihaz = cihaz
        self._mtime = None
        self._yukle()

    def _yukle(self):
        self.model, self.alfabe, self.meta = model_yukle(self.model_yolu, self.cihaz)
        self._mtime = self.model_yolu.stat().st_mtime

    def yenile(self) -> bool:
        """Model dosyası değiştiyse yeniden yükle (etiketleme sırasında yeni eğitim bitince)."""
        if self.model_yolu.exists() and self.model_yolu.stat().st_mtime != self._mtime:
            self._yukle()
            return True
        return False

    @torch.no_grad()
    def logp(self, img: Image.Image) -> np.ndarray:
        arr = on_isle(img, self.model.yukseklik)
        if arr.shape[1] < 16:
            arr = np.pad(arr, ((0, 0), (0, 16 - arr.shape[1])))
        W = ((arr.shape[1] + 3) // 4) * 4
        x = torch.zeros(1, 1, arr.shape[0], W)
        x[0, 0, :, : arr.shape[1]] = torch.from_numpy(arr)
        return self.model(x.to(self.cihaz))[:, 0].cpu().numpy()

    def secenekler(self, img: Image.Image, adet: int = 3) -> list[tuple[str, float]]:
        return secenekler(self.logp(img), self.alfabe, adet=adet)

    def oku(self, img: Image.Image) -> str:
        return self.secenekler(img, adet=1)[0][0]


def kelime_kutulari(logp: np.ndarray, alfabe, genislik: int, yukseklik_oran: float = 1.0) -> list[tuple[int, int, str]]:
    """CTC açgözlü yolundaki boşluk sembollerinden kelime sınırları çıkarır.

    Döndürür: [(x0, x1, kelime)] görüntü piksel koordinatlarında, sağdan sola okuma sırasında.
    Model satırı sağdan sola okur ama görüntü sütunları soldan sağa işlenir; CTC zaman ekseni = görüntü x ekseni.
    """
    T = logp.shape[0]
    yol = logp.argmax(-1)
    bosluk_idx = alfabe.kodla(" ")
    bosluk_idx = bosluk_idx[0] if bosluk_idx else -1
    olcek = genislik / max(1, T)
    harfler: list[tuple[int, int]] = []  # (t, sembol)
    onceki = -1
    for t, s in enumerate(yol.tolist()):
        if s != onceki and s != alfabe.blank:
            harfler.append((t, s))
        onceki = s
    kelimeler: list[tuple[int, int, str]] = []
    mevcut: list[tuple[int, int]] = []

    def kapat():
        if mevcut:
            t0 = mevcut[0][0]
            t1 = mevcut[-1][0] + 1
            kelimeler.append((int(t0 * olcek), int(min(genislik, (t1 + 1) * olcek)), alfabe.coz([s for _, s in mevcut])))

    for t, s in harfler:
        if s == bosluk_idx:
            kapat()
            mevcut = []
        else:
            mevcut.append((t, s))
    kapat()
    # Görüntüde metin sağdan sola aktığı için x büyükten küçüğe okuma sırasıdır
    kelimeler.sort(key=lambda k: -k[0])
    return kelimeler
