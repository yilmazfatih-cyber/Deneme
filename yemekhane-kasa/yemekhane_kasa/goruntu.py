"""Görüntü yardımcıları: tepsi bölgesini kırpma, değişim imzası ve API'ye gidecek JPEG.

İmza, bölgenin 48×36 gri küçültmesidir (her hücre ~yüzlerce pikselin ortalaması: sensör gürültüsü bastırılır).
İki imza "değişen hücre payı" ile karşılaştırılır; ortalama parlaklık önce çıkarılır, böylece ışığın genel olarak
artıp azalması tepsi değişimi sanılmaz, küçük bir tatlı kâsesinin eklenmesi ise yakalanır.
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageDraw

IMZA_BOYUTU = (48, 36)

Bolge = tuple[float, float, float, float]


def bolge_kutusu(boyut: tuple[int, int], bolge: Bolge) -> tuple[int, int, int, int]:
    gen, yuk = boyut
    x, y, w, h = bolge
    sol = min(max(round(x * gen), 0), gen - 1)
    ust = min(max(round(y * yuk), 0), yuk - 1)
    sag = min(max(round((x + w) * gen), sol + 1), gen)
    alt = min(max(round((y + h) * yuk), ust + 1), yuk)
    return sol, ust, sag, alt


def bolge_kirp(goruntu: Image.Image, bolge: Bolge | None) -> Image.Image:
    if bolge is None:
        return goruntu
    return goruntu.crop(bolge_kutusu(goruntu.size, bolge))


def bolge_ciz(goruntu: Image.Image, bolge: Bolge | None) -> Image.Image:
    """Kalibrasyon önizlemesi: bölgeyi kırmızı çerçeveyle işaretlenmiş kopya."""
    kopya = goruntu.convert("RGB")
    if bolge is not None:
        kalinlik = max(2, round(min(kopya.size) / 200))
        ImageDraw.Draw(kopya).rectangle(bolge_kutusu(kopya.size, bolge), outline=(230, 30, 30), width=kalinlik)
    return kopya


def imza_cikar(goruntu: Image.Image) -> np.ndarray:
    gri = goruntu.convert("L").resize(IMZA_BOYUTU, Image.Resampling.BOX)
    return np.asarray(gri, dtype=np.float32)


def fark_orani(a: np.ndarray, b: np.ndarray, hucre_esigi: float = 18.0) -> float:
    """İki imza arasında, ortalama parlaklık farkı çıkarıldıktan sonra `hucre_esigi`ni aşan hücrelerin payı (0–1)."""
    if a.shape != b.shape:
        return 1.0
    fark = np.abs((a - a.mean()) - (b - b.mean()))
    return float(np.count_nonzero(fark > hucre_esigi)) / fark.size


def jpeg(goruntu: Image.Image, uzun_kenar: int, kalite: int = 85) -> bytes:
    """Uzun kenarı `uzun_kenar`ı aşmayacak biçimde küçültülmüş JPEG baytları (büyütme yapılmaz)."""
    kopya = goruntu.convert("RGB")
    if max(kopya.size) > uzun_kenar:
        kopya.thumbnail((uzun_kenar, uzun_kenar), Image.Resampling.LANCZOS)
    tampon = io.BytesIO()
    kopya.save(tampon, format="JPEG", quality=kalite, optimize=True)
    return tampon.getvalue()
