"""Parça renkleri (görüntüden) ve sezon paleti (parça renklerinden).

Görsel saklanmaz: fonksiyonlar bayt alır, bellekte işler, hiçbir şey diske yazmaz (ADR-002).
Yüz tespiti yapılmaz; ten rengi yalnızca Lab'de kaba bir elipsle dışarı alınır (ilke 7).
"""

from __future__ import annotations

import io
import math
from collections.abc import Iterable
from typing import Literal

import numpy as np
from PIL import Image
from scipy import ndimage
from sklearn.cluster import KMeans

from moda_radar.renk import pantone, uzay
from moda_radar.sema import Lab, PaletSatiri, Yon

TOHUM = 0
EN_BUYUK_KENAR = 256
KENAR_ESIGI_DE = 10.0  # kenar rengine bu kadar yakın ve kenara bağlı pikseller arka plan
BIRLESTIRME_DE = 2.5  # bu kadar yakın k-means merkezleri tek renk sayılır
EN_AZ_PIKSEL_ORANI = 0.03
EN_AZ_PIKSEL = 150
ORNEK_SINIRI = 20_000

# Ten elipsi: Lab ton açısı h° ve kroma C* düzleminde (merkez, yarıçap) + L aralığı. Açıktan koyuya ten tonlarını
# (h≈40-80°, C≈8-50) kapsar. Kaba bir yaklaşımdır; yüz tespiti değildir. Bu aralıktaki giysiler (deve tüyü, taba,
# şeftali, bej-pembe) da dışarı alınır: bilinen sınır.
TEN_L = (20.0, 93.0)
TEN_H = (60.0, 22.0)
TEN_C = (28.0, 24.0)


class ParcaRenkleri(list):
    """`list[tuple[Lab, float]]` ile aynı davranır; ek olarak maskenin uygulanıp uygulanmadığını taşır.

    `maskesiz=True`: otomatik maskeden sonra çok az piksel kaldığı (ya da maske istenmediği) için tüm görüntü kullanıldı.
    """

    def __init__(self, ogeler: Iterable[tuple[Lab, float]] = (), *, maskesiz: bool = False, piksel: int = 0):
        super().__init__(ogeler)
        self.maskesiz = maskesiz
        self.piksel = piksel


def _goruntu_ac(goruntu: bytes) -> tuple[np.ndarray, np.ndarray | None]:
    """Bayt → (H, W, 3) uint8 RGB ve varsa saydamlık maskesi (True = görünür)."""
    with Image.open(io.BytesIO(goruntu)) as im:
        im.load()
        im.thumbnail((EN_BUYUK_KENAR, EN_BUYUK_KENAR), Image.Resampling.BILINEAR)
        alfa = None
        if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
            rgba = im.convert("RGBA")
            dizi = np.asarray(rgba)
            alfa = dizi[..., 3] >= 128
            return dizi[..., :3].copy(), alfa
        return np.asarray(im.convert("RGB")).copy(), alfa


def _kenar_maskesi(lab: np.ndarray) -> np.ndarray:
    """Arka plan maskesi (True = arka plan).

    Kenar şeridindeki piksellerin temsilci renkleri (k-means) bulunur; bu renklere ΔE < eşik olan ve kenara bağlı
    bileşenlere ait pikseller arka plan sayılır. İç bölgede arka planla aynı renkteki giysi parçaları korunur.
    """
    H, W, _ = lab.shape
    s = max(1, round(min(H, W) * 0.03))
    serit = np.zeros((H, W), dtype=bool)
    serit[:s, :] = serit[-s:, :] = True
    serit[:, :s] = serit[:, -s:] = True
    kenar = lab[serit]
    k = int(min(4, len(np.unique(np.round(kenar, 1), axis=0))))
    km = KMeans(n_clusters=k, random_state=TOHUM, n_init=3).fit(kenar)
    paylar = np.bincount(km.labels_, minlength=k) / len(kenar)
    temsilciler = km.cluster_centers_[paylar >= 0.10]
    aday = np.zeros((H, W), dtype=bool)
    for t in temsilciler:
        aday |= uzay.delta_e2000_dizi(lab, t[None, :]) < KENAR_ESIGI_DE
    etiket, _ = ndimage.label(aday)
    kenara_degen = np.unique(etiket[serit & aday])
    kenara_degen = kenara_degen[kenara_degen != 0]
    return np.isin(etiket, kenara_degen)


def _ten_maskesi(lab: np.ndarray) -> np.ndarray:
    """Ten rengi aralığı (True = ten). Lab h°-C* düzleminde elips + L aralığı."""
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    h = np.degrees(np.arctan2(b, a)) % 360
    elips = ((h - TEN_H[0]) / TEN_H[1]) ** 2 + ((C - TEN_C[0]) / TEN_C[1]) ** 2 <= 1.0
    return elips & (L >= TEN_L[0]) & (L <= TEN_L[1])


def _kumele(pikseller: np.ndarray, k: int) -> list[tuple[np.ndarray, float]]:
    """Lab pikselleri → [(merkez, pay)] (sabit tohumlu k-means, yakın merkezler birleştirilir)."""
    if len(pikseller) > ORNEK_SINIRI:
        rng = np.random.default_rng(TOHUM)
        pikseller = pikseller[rng.choice(len(pikseller), ORNEK_SINIRI, replace=False)]
    tekil = len(np.unique(np.round(pikseller, 2), axis=0))
    k = max(1, min(k, tekil))
    km = KMeans(n_clusters=k, random_state=TOHUM, n_init=4).fit(pikseller)
    paylar = np.bincount(km.labels_, minlength=k).astype(float)
    merkezler = [km.cluster_centers_[i].copy() for i in range(k)]
    # Yakın merkezleri birleştir (ağırlıklı ortalama)
    sira = sorted(range(k), key=lambda i: -paylar[i])
    kumeler: list[list] = []
    for i in sira:
        for kume in kumeler:
            if uzay.delta_e2000_dizi(merkezler[i], kume[0][None, :])[0] < BIRLESTIRME_DE:
                toplam = kume[1] + paylar[i]
                kume[0] = (kume[0] * kume[1] + merkezler[i] * paylar[i]) / toplam
                kume[1] = toplam
                break
        else:
            kumeler.append([merkezler[i], paylar[i]])
    n = sum(p for _, p in kumeler)
    return sorted(((m, p / n) for m, p in kumeler), key=lambda x: -x[1])


def parca_renkleri(goruntu: bytes, k: int = 4, maske: Literal["otomatik", "yok"] = "otomatik") -> ParcaRenkleri:
    """Görüntü baytı → pay sırasına göre [(Lab, pay)]. Paylar toplamı 1.

    `maske="otomatik"`: saydam pikseller, kenara bağlı arka plan ve ten aralığı dışarı alınır. Geriye çok az piksel
    kalırsa tüm görüntüyle kümelenir ve dönen listenin `maskesiz` özelliği True olur.
    """
    rgb, alfa = _goruntu_ac(goruntu)
    lab = uzay.rgb_dizi_to_lab(rgb)
    gorunur = alfa if alfa is not None else np.ones(lab.shape[:2], dtype=bool)
    maskesiz = maske == "yok"
    secili = gorunur
    if maske == "otomatik":
        secili = gorunur & ~_kenar_maskesi(lab) & ~_ten_maskesi(lab)
        esik = max(EN_AZ_PIKSEL, int(EN_AZ_PIKSEL_ORANI * gorunur.sum()))
        if secili.sum() < esik:
            secili, maskesiz = gorunur, True
    elif maske != "yok":
        raise ValueError("maske 'otomatik' ya da 'yok' olmalı")
    if not secili.any():  # tamamen saydam görüntü
        secili = np.ones(lab.shape[:2], dtype=bool)
        maskesiz = True
    pikseller = lab[secili]
    sonuc = [(uzay.lab_olustur(*m), float(p)) for m, p in _kumele(pikseller, k)]
    return ParcaRenkleri(sonuc, maskesiz=maskesiz, piksel=int(secili.sum()))


# --- Sezon paleti ---


def _yon_ve_fark(pay: float, onceki_pay: float | None, onceki_var: bool) -> tuple[float, Yon]:
    if not onceki_var:
        return 0.0, Yon.DUZ
    if onceki_pay is None:
        return round(pay * 100, 2), Yon.GIRIS
    fark = round((pay - onceki_pay) * 100, 2)
    if fark > 1.0:
        return fark, Yon.YUKSELIS
    if fark < -1.0:
        return fark, Yon.CIKIS
    if pay >= 0.05:
        return fark, Yon.ZIRVE
    return fark, Yon.DUZ


def sezon_paleti(
    renkler: list[tuple[Lab, float, str]],
    onceki: list[PaletSatiri] | None,
    sezon: str,
    esik_de: float = 6.0,
) -> list[PaletSatiri]:
    """Tüm parça renklerini (Lab, parça içi pay, marka) ΔE2000 < esik ile tek geçişte kümeler.

    Tek geçişli aglomeratif: renkler pay sırasıyla gezilir; en yakın küme merkezine ΔE < eşikse katılır (merkez pay
    ağırlıklı Lab ortalamasıyla güncellenir), değilse yeni küme açar. Küme payı = podyum payı (toplam pay içindeki oran).
    Önceki palet verilirse her küme ona ΔE ile eşlenir: fark puan cinsinden, yön giriş/yükseliş/zirve/çıkış/düz.
    `onceki=None` ise fark 0 ve yön 'duz' (karşılaştırma yok).
    """
    kumeler: list[dict] = []
    for lab, pay, marka in sorted(renkler, key=lambda r: -r[1]):
        if pay <= 0:
            continue
        v = uzay.lab_dizi(lab)
        en_iyi, en_iyi_de = None, math.inf
        if kumeler:
            merkezler = np.array([k["merkez"] for k in kumeler])
            de = uzay.delta_e2000_dizi(v, merkezler)
            j = int(np.argmin(de))
            en_iyi, en_iyi_de = j, float(de[j])
        if en_iyi is not None and en_iyi_de < esik_de:
            k = kumeler[en_iyi]
            k["merkez"] = (k["merkez"] * k["pay"] + v * pay) / (k["pay"] + pay)
            k["pay"] += pay
            k["markalar"].add(marka)
        else:
            kumeler.append({"merkez": v, "pay": pay, "markalar": {marka}})

    toplam = sum(k["pay"] for k in kumeler)
    if toplam <= 0:
        return []
    onceki_lab = np.array([uzay.lab_dizi(s.kume_merkezi) for s in onceki]) if onceki else None

    satirlar: list[PaletSatiri] = []
    for k in sorted(kumeler, key=lambda k: -k["pay"]):
        merkez = uzay.lab_olustur(*k["merkez"])
        pay = k["pay"] / toplam
        onceki_pay = None
        if onceki_lab is not None and len(onceki_lab):
            de = uzay.delta_e2000_dizi(uzay.lab_dizi(merkez), onceki_lab)
            j = int(np.argmin(de))
            if de[j] < esik_de:
                onceki_pay = onceki[j].podyum_payi
        fark, yon = _yon_ve_fark(pay, onceki_pay, onceki is not None)
        bir, iki = pantone.en_yakin(merkez, n=2)
        satirlar.append(
            PaletSatiri(
                sezon=sezon,
                kume_merkezi=merkez,
                hex=uzay.lab_to_hex(merkez),
                pantone=bir,
                ikinci_aday=iki,
                podyum_payi=min(1.0, max(0.0, pay)),
                onceki_sezon_farki=fark,
                yon=yon,
                marka_sayisi=len({m for m in k["markalar"] if m}),
            )
        )
    return satirlar
