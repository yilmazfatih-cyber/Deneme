"""Sentetik kelime/satır görüntüsü üretimi.

Gerçek rik'a verisi gelene kadar modeli "harf şekillerini bilen" bir noktaya
getirmek için yazı tipleriyle (rik'a ağırlıklı) satır ve kelime görüntüleri
üretir, el yazısını taklit eden bozulmalar uygular.
"""

from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

from .alfabe import normallestir

KOK = Path(__file__).resolve().parent.parent
FONT_DIR = KOK / "fonts"
METIN_DIR = KOK / "metin"

# Yazı tipi → (tür, örnekleme ağırlığı). Rik'a ağır basar.
FONTLAR: dict[str, tuple[str, float]] = {
    "ArefRuqaa": ("rika", 4.0),
    "ArefRuqaaInk": ("rika", 3.0),
    "Rakkas": ("rika", 1.5),
    "Vibes": ("rika", 0.8),
    "Amiri": ("nesih", 1.0),
    "ScheherazadeNew": ("nesih", 1.0),
    "Lateef": ("nesih", 0.7),
    "NotoNaskhArabic": ("nesih", 1.0),
    "Harmattan": ("nesih", 0.5),
    "Katibeh": ("nesih", 0.5),
    "Mirza": ("nesih", 0.7),
    "Jomhuria": ("nesih", 0.4),
    "MarkaziText": ("nesih", 0.5),
    "NotoNastaliqUrdu": ("talik", 0.6),
    "Gulzar": ("talik", 0.6),
    "ReemKufi": ("kufi", 0.2),
    "Ruwudu": ("diger", 0.2),
}


def kelimeleri_yukle(dosyalar: list[Path] | None = None) -> list[str]:
    dosyalar = dosyalar or sorted(METIN_DIR.glob("*.txt"))
    kelimeler: list[str] = []
    for d in dosyalar:
        for satir in d.read_text(encoding="utf-8").splitlines():
            satir = satir.strip()
            if not satir or satir.startswith("#"):
                continue
            kelimeler.append(normallestir(satir))
    return sorted(set(kelimeler))


def _font_yolu(ad: str) -> Path:
    return FONT_DIR / f"{ad}.ttf"


def _agirlikli_font(rng: random.Random, sadece: str | None = None) -> str:
    adaylar = [(a, w) for a, (tur, w) in FONTLAR.items() if (sadece is None or tur == sadece) and _font_yolu(a).exists()]
    adlar, agirliklar = zip(*adaylar)
    return rng.choices(adlar, weights=agirliklar, k=1)[0]


@dataclass
class Ornek:
    goruntu: Image.Image
    metin: str
    font: str
    tur: str


def metin_ciz(metin: str, font_adi: str, punto: int, rng: random.Random, kalinlik: int = 0) -> Image.Image:
    """Metni beyaz zemine siyah çizer (raqm ile doğru şekillendirme, sağdan sola)."""
    font = ImageFont.truetype(str(_font_yolu(font_adi)), punto)
    # Ölçü için geçici tuval
    tmp = Image.new("L", (10, 10), 255)
    d = ImageDraw.Draw(tmp)
    try:
        bbox = d.textbbox((0, 0), metin, font=font, direction="rtl", language="ota")
    except Exception:
        bbox = d.textbbox((0, 0), metin, font=font)
    w = max(1, bbox[2] - bbox[0]) + 2 * punto
    h = max(1, bbox[3] - bbox[1]) + 2 * punto
    img = Image.new("L", (w, h), 255)
    d = ImageDraw.Draw(img)
    x, y = punto - bbox[0], punto - bbox[1]
    try:
        d.text((x, y), metin, font=font, fill=0, direction="rtl", language="ota", stroke_width=kalinlik, stroke_fill=0)
    except Exception:
        d.text((x, y), metin, font=font, fill=0, stroke_width=kalinlik, stroke_fill=0)
    return img


def _kirp(img: Image.Image, kenar: int = 6) -> Image.Image:
    arr = np.asarray(img)
    ys, xs = np.where(arr < 200)
    if len(xs) == 0:
        return img
    x0, x1 = max(0, xs.min() - kenar), min(arr.shape[1], xs.max() + kenar + 1)
    y0, y1 = max(0, ys.min() - kenar), min(arr.shape[0], ys.max() + kenar + 1)
    return img.crop((x0, y0, x1, y1))


def _elastik(img: Image.Image, rng: random.Random, alpha: float, sigma: float) -> Image.Image:
    """Basit elastik bozulma: düşük çözünürlüklü rastgele alan → yumuşatılmış yer değiştirme."""
    arr = np.asarray(img).astype(np.float32)
    h, w = arr.shape
    gh, gw = max(2, h // 12), max(2, w // 12)
    dx = np.asarray(Image.fromarray(((np.random.default_rng(rng.getrandbits(32)).random((gh, gw)) * 2 - 1) * 127 + 128).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32)
    dy = np.asarray(Image.fromarray(((np.random.default_rng(rng.getrandbits(32)).random((gh, gw)) * 2 - 1) * 127 + 128).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32)
    dx = (dx - 128) / 128 * alpha
    dy = (dy - 128) / 128 * alpha
    yy, xx = np.meshgrid(np.arange(h), np.arange(w), indexing="ij")
    sx = np.clip(xx + dx, 0, w - 1).astype(np.int32)
    sy = np.clip(yy + dy, 0, h - 1).astype(np.int32)
    out = arr[sy, sx]
    return Image.fromarray(out.astype(np.uint8))


def bozulma_uygula(img: Image.Image, rng: random.Random, guc: float = 1.0) -> Image.Image:
    """El yazısı ve tarama izlenimi veren rastgele bozulmalar. guc ∈ [0, 1.5]."""
    # Kalem kalınlığı
    r = rng.random()
    if r < 0.25 * guc:
        img = img.filter(ImageFilter.MinFilter(3))
    elif r < 0.45 * guc:
        img = img.filter(ImageFilter.MaxFilter(3))
    # Eğim (shear) ve döndürme
    if rng.random() < 0.8:
        sh = rng.uniform(-0.25, 0.25) * guc
        w, h = img.size
        img = img.transform((w + int(abs(sh) * h), h), Image.AFFINE, (1, sh, -sh * h if sh > 0 else 0, 0, 1, 0), fillcolor=255)
    if rng.random() < 0.8:
        img = img.rotate(rng.uniform(-4, 4) * guc, expand=True, fillcolor=255, resample=Image.BILINEAR)
    # Elastik bozulma
    if rng.random() < 0.6:
        img = _elastik(img, rng, alpha=rng.uniform(1.0, 3.5) * guc, sigma=4)
    # Bulanıklık
    if rng.random() < 0.5:
        img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 1.2) * guc))
    # Kontrast / zemin
    arr = np.asarray(img).astype(np.float32)
    zemin = rng.uniform(150, 255)
    murekkep = rng.uniform(0, 90)
    arr = murekkep + (arr / 255.0) * (zemin - murekkep)
    # Leke/doku
    if rng.random() < 0.6:
        g = np.random.default_rng(rng.getrandbits(32))
        doku = g.normal(0, rng.uniform(3, 14) * guc, arr.shape)
        arr = arr + doku
    if rng.random() < 0.3:
        g = np.random.default_rng(rng.getrandbits(32))
        h, w = arr.shape
        for _ in range(rng.randint(1, 4)):
            cx, cy, rr = g.integers(0, w), g.integers(0, h), g.integers(3, max(4, h // 2))
            yy, xx = np.ogrid[:h, :w]
            m = (xx - cx) ** 2 + (yy - cy) ** 2 < rr**2
            arr[m] = arr[m] * rng.uniform(0.6, 0.95)
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)
    if rng.random() < 0.3:
        img = ImageOps.autocontrast(img, cutoff=rng.uniform(0, 3))
    return img


def ornek_uret(
    kelimeler: list[str],
    rng: random.Random,
    satir: bool = False,
    sadece_tur: str | None = None,
    guc: float = 1.0,
) -> Ornek:
    """Tek kelime (varsayılan) ya da 2–6 kelimelik satır üret."""
    if satir:
        n = rng.randint(2, 6)
        metin = " ".join(rng.choice(kelimeler) for _ in range(n))
    else:
        metin = rng.choice(kelimeler)
        # Ara sıra rakam ya da tarih ekle
        if rng.random() < 0.08:
            metin = "".join(rng.choice("٠١٢٣٤٥٦٧٨٩") for _ in range(rng.randint(1, 4)))
        elif rng.random() < 0.04:
            metin = "سنه " + "".join(rng.choice("٠١٢٣٤٥٦٧٨٩") for _ in range(4))
    font = _agirlikli_font(rng, sadece_tur)
    tur = FONTLAR[font][0]
    punto = rng.randint(40, 72)
    img = metin_ciz(metin, font, punto, rng, kalinlik=rng.choice([0, 0, 0, 1]))
    img = _kirp(img, kenar=rng.randint(4, 14))
    img = bozulma_uygula(img, rng, guc=guc)
    return Ornek(img, metin, font, tur)


def veri_seti_uret(
    cikti: Path,
    adet: int,
    satir_orani: float = 0.3,
    tohum: int = 0,
    sadece_tur: str | None = None,
    guc: float = 1.0,
    kelime_dosyalari: list[Path] | None = None,
) -> Path:
    """`cikti/goruntuler/*.png` ve `cikti/manifest.jsonl` üretir (JSONL: {dosya, metin, kaynak, font})."""
    rng = random.Random(tohum)
    kelimeler = kelimeleri_yukle(kelime_dosyalari)
    gdir = cikti / "goruntuler"
    gdir.mkdir(parents=True, exist_ok=True)
    manifest = cikti / "manifest.jsonl"
    with manifest.open("w", encoding="utf-8") as f:
        for i in range(adet):
            o = ornek_uret(kelimeler, rng, satir=rng.random() < satir_orani, sadece_tur=sadece_tur, guc=guc)
            ad = f"s{tohum}_{i:06d}.png"
            o.goruntu.save(gdir / ad)
            f.write(json.dumps({"dosya": f"goruntuler/{ad}", "metin": o.metin, "kaynak": "sentez", "font": o.font, "tur": o.tur}, ensure_ascii=False) + "\n")
    return manifest
