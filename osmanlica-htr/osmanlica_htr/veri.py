"""Görüntü ön işleme, manifest okuma ve PyTorch veri kümesi.

Manifest biçimi (JSONL, her satır bir örnek):
  {"dosya": "goruntuler/x.png", "metin": "...", "kaynak": "sentez|etiket", ...}
Dosya yolu manifestin bulunduğu klasöre görelidir.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps
from torch.utils.data import Dataset

from .alfabe import Alfabe, normallestir

YUKSEKLIK = 64
EN_GENIS = 1600


def on_isle(img: Image.Image, yukseklik: int = YUKSEKLIK) -> np.ndarray:
    """Gri, mürekkep koyu, yükseklik sabit, en boy oranı korunur. Çıkış float32 (H, W) ∈ [0,1], 1 = mürekkep."""
    g = ImageOps.exif_transpose(img).convert("L")
    arr = np.asarray(g).astype(np.float32)
    # Koyu zeminli taramaları çevir
    if arr.mean() < 110:
        arr = 255 - arr
    g = Image.fromarray(arr.astype(np.uint8))
    w, h = g.size
    yeni_w = max(8, min(EN_GENIS, int(round(w * yukseklik / max(1, h)))))
    g = g.resize((yeni_w, yukseklik), Image.BILINEAR)
    arr = np.asarray(g).astype(np.float32) / 255.0
    # Basit kontrast germe
    lo, hi = np.percentile(arr, 2), np.percentile(arr, 98)
    if hi - lo > 1e-3:
        arr = np.clip((arr - lo) / (hi - lo), 0, 1)
    return 1.0 - arr  # mürekkep = 1


def manifest_oku(yol: Path) -> list[dict]:
    yol = Path(yol)
    kayitlar = []
    with yol.open(encoding="utf-8") as f:
        for satir in f:
            satir = satir.strip()
            if not satir:
                continue
            k = json.loads(satir)
            k["_yol"] = (yol.parent / k["dosya"]).resolve()
            k["metin"] = normallestir(k["metin"])
            kayitlar.append(k)
    return kayitlar


class SatirVeriSeti(Dataset):
    def __init__(self, kayitlar: list[dict], alfabe: Alfabe, egitim: bool = True, yukseklik: int = YUKSEKLIK):
        self.kayitlar = [k for k in kayitlar if k["metin"]]
        self.alfabe = alfabe
        self.egitim = egitim
        self.yukseklik = yukseklik

    def __len__(self):
        return len(self.kayitlar)

    def __getitem__(self, i):
        k = self.kayitlar[i]
        img = Image.open(k["_yol"])
        if self.egitim:
            img = self._artir(img)
        arr = on_isle(img, self.yukseklik)
        hedef = self.alfabe.kodla(k["metin"])
        # CTC: T >= hedef uzunluğu olmalı; gerekirse genişlet
        gerekli = (len(hedef) + 2) * 4 * 2
        if arr.shape[1] < gerekli:
            img2 = Image.fromarray(((1 - arr) * 255).astype(np.uint8)).resize((gerekli, self.yukseklik), Image.BILINEAR)
            arr = 1.0 - np.asarray(img2).astype(np.float32) / 255.0
        return torch.from_numpy(arr)[None], torch.tensor(hedef, dtype=torch.long), k["metin"]

    @staticmethod
    def _artir(img: Image.Image) -> Image.Image:
        """Gerçek örnekler için hafif artırma (eğitimde)."""
        from PIL import ImageFilter

        r = random.random()
        if r < 0.5:
            img = img.rotate(random.uniform(-2.5, 2.5), expand=True, fillcolor=255 if img.mode == "L" else None, resample=Image.BILINEAR)
        if random.random() < 0.3:
            img = img.filter(ImageFilter.GaussianBlur(random.uniform(0.2, 0.9)))
        if random.random() < 0.3:
            w, h = img.size
            s = random.uniform(0.85, 1.15)
            img = img.resize((max(8, int(w * s)), h), Image.BILINEAR)
        return img


def toplayici(parca):
    goruntuler, hedefler, metinler = zip(*parca)
    B = len(goruntuler)
    W = max(g.shape[2] for g in goruntuler)
    W = ((W + 3) // 4) * 4
    x = torch.zeros(B, 1, goruntuler[0].shape[1], W)
    girdi_uz = torch.zeros(B, dtype=torch.long)
    for i, g in enumerate(goruntuler):
        x[i, :, :, : g.shape[2]] = g
        girdi_uz[i] = g.shape[2] // 4
    hedef_uz = torch.tensor([len(h) for h in hedefler], dtype=torch.long)
    y = torch.cat(hedefler) if hedefler else torch.zeros(0, dtype=torch.long)
    return x, y, girdi_uz, hedef_uz, list(metinler)


def kec_cer(tahmin: str, gercek: str) -> tuple[int, int]:
    """Levenshtein uzaklığı ve gerçek uzunluk (CER = toplam uzaklık / toplam uzunluk)."""
    a, b = tahmin, gercek
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1], len(b)
