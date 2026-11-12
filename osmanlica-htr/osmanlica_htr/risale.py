"""Risale-i Nur el yazmaları için yardımcılar: EPUB metnini okuma sırasıyla ayrıştırma, kelime akışı,
iki sayfalık açılımları bölme ve sayfa→metin konumu tahmini.

Bilinen metin Latin harfli çeviriyazıdır (RNK-EPUB). Arapça alıntılar EPUB'da Arap harfiyle durur ve
el yazmasında da öyledir; kelime akışında olduğu gibi korunur.
"""

from __future__ import annotations

import html
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path, PurePosixPath

import numpy as np
from PIL import Image

BLOK = re.compile(r"<(p|h[1-6]|div|li|br|tr)\b[^>]*>", re.I)


def epub_paragraflar(yol: Path) -> list[str]:
    """EPUB'u omurga (spine) sırasıyla okuyup paragraf listesi döndürür."""
    z = zipfile.ZipFile(yol)
    kap = ET.fromstring(z.read("META-INF/container.xml"))
    opf_yol = next(e.get("full-path") for e in kap.iter() if e.tag.endswith("rootfile"))
    opf = ET.fromstring(z.read(opf_yol))
    ns = {"o": re.sub(r"\{(.*)\}.*", r"\1", opf.tag)}
    kok = PurePosixPath(opf_yol).parent
    manifest = {i.get("id"): i.get("href") for i in opf.iter(f"{{{ns['o']}}}item")}
    sira = [manifest[r.get("idref")] for r in opf.iter(f"{{{ns['o']}}}itemref") if r.get("idref") in manifest]
    paragraflar: list[str] = []
    for href in sira:
        ad = str(kok / href) if str(kok) != "." else href
        ad = ad.split("#")[0]
        try:
            t = z.read(ad).decode("utf-8", "ignore")
        except KeyError:
            continue
        t = re.sub(r"(?is)<(script|style|head)\b.*?</\1>", " ", t)
        t = BLOK.sub("\n", t)
        t = re.sub(r"<[^>]+>", " ", t)
        t = html.unescape(t)
        for satir in t.split("\n"):
            s = " ".join(satir.split())
            if s:
                paragraflar.append(s)
    return paragraflar


def kelime_akisi(paragraflar: list[str]) -> tuple[list[str], list[int]]:
    """Paragraflardan kelime akışı ve her paragrafın ilk kelime indeksi."""
    kelimeler: list[str] = []
    baslar: list[int] = []
    for p in paragraflar:
        baslar.append(len(kelimeler))
        kelimeler.extend(p.split())
    return kelimeler, baslar


def arama_bicimi(s: str) -> str:
    """Arama için sadeleştirme: Türkçe küçük harf, şapka ve noktalama atılır."""
    s = s.replace("I", "ı").replace("İ", "i").lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^\w؀-ۿ]+", "", s)


def bolum_bul(paragraflar: list[str], baslik_desenleri: list[str], baslangic: int = 0) -> int | None:
    """Başlık desenine (regex) uyan ilk kısa paragrafın indeksini döndürür."""
    for i in range(baslangic, len(paragraflar)):
        p = paragraflar[i]
        if len(p) < 80 and any(re.search(d, p, re.I) for d in baslik_desenleri):
            return i
    return None


def acilimi_bol(img: Image.Image, oran_min: float = 1.15) -> list[Image.Image]:
    """İki sayfalık açılımı cilt yerinden böler; okuma sırası: sağ sayfa, sonra sol.

    Cilt yeri: ortadaki %40'lık bölgede, mürekkep izdüşümünün en uzun "boş koridorunun" ortası. Cilt gölgesi ve
    sayfa kenarı gibi uzun ince dikey çizgiler önce mürekkep maskesinden çıkarılır.
    Genişlik/yükseklik oranı `oran_min`'den küçükse tek sayfa kabul edilir.
    """
    from scipy import ndimage

    from .bolut import sauvola

    w, h = img.size
    if w / h < oran_min:
        return [img]
    k = max(1, int(round(w / 1500)))
    g = np.asarray(img.convert("L").resize((max(1, w // k), max(1, h // k))), dtype=np.float32)
    H2, W2 = g.shape
    m = sauvola(g, pencere=max(15, (min(g.shape) // 40) | 1))
    etiket, n = ndimage.label(m)
    for i, sl in enumerate(ndimage.find_objects(etiket), 1):
        if sl is None:
            continue
        hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if hh > 0.3 * H2 and ww < 0.03 * W2:
            parca = m[sl]
            parca[etiket[sl] == i] = False
    prof = m[int(0.05 * H2) : int(0.95 * H2)].sum(0).astype(np.float64)
    sm = ndimage.uniform_filter1d(prof, size=max(5, W2 // 60))
    a0, b0 = int(W2 * 0.3), int(W2 * 0.7)
    seg = sm[a0:b0]
    esik = seg.min() + 0.08 * (seg.max() - seg.min())
    dusuk = seg <= esik
    en_iyi, i = (0, 1), 0
    while i < len(dusuk):
        if dusuk[i]:
            j = i
            while j < len(dusuk) and dusuk[j]:
                j += 1
            if j - i > en_iyi[1] - en_iyi[0]:
                en_iyi = (i, j)
            i = j
        else:
            i += 1
    x = (a0 + (en_iyi[0] + en_iyi[1]) // 2) * k
    return [img.crop((x, 0, w, h)), img.crop((0, 0, x, h))]
