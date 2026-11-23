"""Ses düzeyi ölçümü ve normalizasyonu: tepe (dBFS), RMS (dBFS) ve LUFS (ITU-R BS.1770-4).

LUFS: K ağırlıklı (iki aşamalı süzgeç: kafa etkisi rafı + RLB yüksek geçiren) ortalama kare,
400 ms bloklar, %75 örtüşme, mutlak geçit −70 LUFS ve göreli geçit −10 LU ile "tümleşik ses
yüksekliği". Süzgeç katsayıları 48 kHz dışındaki hızlar için libebur128'in yaptığı gibi analog
parametrelerden bilineer dönüşümle üretilir; 48 kHz'de standarttaki katsayıları verir (testli).
Hız için IIR süzgeç, kırpılmış dürtü yanıtıyla FFT üzerinden uygulanır (fark < 1e-7, testli).
Tek kanal G = 1 ile ölçülür (çift-mono +3 dB düzeltmesi YOK). Tepe, örnek tepesidir (gerçek tepe
değil; ara örnekler +0,5 dB'ye kadar yüksek olabilir — tavan −1 dBFS bu payı bırakır).
Kim kullanır: tts/ (çıktı düzeyi), komutlar.py. Genişletme: yeni ölçüt → yeni işlev + testi.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from numpy.typing import NDArray

from ses.ses_isleme.ses import Dizi

SESSIZLIK_DB = -120.0
"""Sıfır sinyalin dB değeri yerine kullanılan alt sınır."""


def genlik_db(genlik: float) -> float:
    """Doğrusal genliği dBFS'e çevirir (0 → −120)."""
    return 20 * math.log10(genlik) if genlik > 1e-6 else SESSIZLIK_DB


def db_genlik(db: float) -> float:
    return float(10 ** (db / 20))


def tepe_dbfs(dizi: Dizi) -> float:
    """Örnek tepesi (dBFS)."""
    return genlik_db(float(np.max(np.abs(dizi)))) if len(dizi) else SESSIZLIK_DB


def rms_dbfs(dizi: Dizi) -> float:
    """Karesel ortalama (dBFS). Tam ölçekli sinüs −3,01 dBFS verir."""
    if len(dizi) == 0:
        return SESSIZLIK_DB
    return genlik_db(math.sqrt(float(np.mean(np.square(dizi, dtype=np.float64)))))


def k_suzgec_katsayilari(ornekleme: int) -> tuple[tuple[list[float], list[float]], ...]:
    """BS.1770 K ağırlığının iki ikinci derece aşaması: ((b, a) raf, (b, a) yüksek geçiren)."""
    f0, kazanc, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = math.tan(math.pi * f0 / ornekleme)
    vh = 10 ** (kazanc / 20)
    vb = vh**0.4996667741545416
    a0 = 1 + k / q + k * k
    raf = (
        [(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0],
        [1.0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0],
    )
    f0, q = 38.13547087602444, 0.5003270373238773
    k = math.tan(math.pi * f0 / ornekleme)
    a0 = 1 + k / q + k * k
    yuksek = ([1.0, -2.0, 1.0], [1.0, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0])
    return raf, yuksek


def _ikinci_derece(
    b: list[float], a: list[float], girdi: NDArray[np.float64]
) -> NDArray[np.float64]:
    """İkinci derece IIR süzgeç, doğrudan fark denklemi (yalnız kısa dürtü yanıtı için; düz döngü)."""
    cikti = np.zeros(len(girdi))
    x1 = x2 = y1 = y2 = 0.0
    for i, x0 in enumerate(girdi.tolist()):
        y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
        cikti[i] = y0
        x2, x1, y2, y1 = x1, x0, y1, y0
    return cikti


@lru_cache(maxsize=8)
def _k_durtu(ornekleme: int) -> NDArray[np.float64]:
    """K süzgecinin (iki aşama art arda) kırpılmış dürtü yanıtı (≥ 0,5 sn; kuyruk ihmal edilir).

    İkinci aşama birincinin yanıtına süzgeç olarak uygulanır: art arda iki süzgecin ilk n örneği
    tam olarak budur (evrişim gerekmez; O(n)).
    """
    raf, yuksek = k_suzgec_katsayilari(ornekleme)
    uzunluk = 1 << max(10, math.ceil(math.log2(ornekleme * 0.5)))
    durtu = np.zeros(uzunluk)
    durtu[0] = 1.0
    return _ikinci_derece(*yuksek, _ikinci_derece(*raf, durtu))


def k_agirlikli(dizi: Dizi, ornekleme: int) -> NDArray[np.float64]:
    """Sinyali K ağırlık süzgecinden geçirir (FFT ile, bloklu örtüştür-topla; uzunluk korunur)."""
    if len(dizi) == 0:
        return np.zeros(0)
    h = _k_durtu(ornekleme)
    blok = 1 << 18
    fft_boy = 1 << (blok + len(h) - 2).bit_length()
    h_fft = np.fft.rfft(h, fft_boy)
    sonuc = np.zeros(len(dizi) + len(h) - 1)
    for bas in range(0, len(dizi), blok):
        parca = np.asarray(dizi[bas : bas + blok], dtype=np.float64)
        evrisim = np.fft.irfft(np.fft.rfft(parca, fft_boy) * h_fft, fft_boy)
        sonuc[bas : bas + len(parca) + len(h) - 1] += evrisim[: len(parca) + len(h) - 1]
    return sonuc[: len(dizi)]


def lufs(dizi: Dizi, ornekleme: int) -> float:
    """Tümleşik ses yüksekliği (LUFS, BS.1770-4 geçitli). 400 ms'den kısa ses tek blok sayılır.

    Sessiz (her blok −70 LUFS altında) sinyalde −120 döner.
    """
    if len(dizi) == 0:
        return SESSIZLIK_DB
    kare = np.square(k_agirlikli(dizi, ornekleme))
    blok, adim = round(0.4 * ornekleme), round(0.1 * ornekleme)
    if len(kare) <= blok:
        ortalamalar = np.array([float(np.mean(kare))])
    else:
        birikim = np.concatenate([[0.0], np.cumsum(kare)])
        baslar = np.arange(0, len(kare) - blok + 1, adim)
        ortalamalar = (birikim[baslar + blok] - birikim[baslar]) / blok
    duzeyler = -0.691 + 10 * np.log10(np.maximum(ortalamalar, 1e-30))
    mutlak = ortalamalar[duzeyler > -70.0]
    if len(mutlak) == 0:
        return SESSIZLIK_DB
    goreli_esik = -0.691 + 10 * math.log10(float(np.mean(mutlak))) - 10.0
    secilen = ortalamalar[(duzeyler > -70.0) & (duzeyler > goreli_esik)]
    return -0.691 + 10 * math.log10(float(np.mean(secilen)))


@dataclass(frozen=True)
class DuzeyBilgisi:
    """Normalizasyonun ne yaptığı: ölçülen düzey, uygulanan kazanç, hedefe ulaşıldı mı."""

    olculen: float
    kazanc_db: float
    hedefe_ulasildi: bool
    tepe_dbfs: float


def _kazanc_uygula(
    dizi: Dizi, olculen: float, hedef: float, tepe_siniri_dbfs: float
) -> tuple[Dizi, DuzeyBilgisi]:
    if olculen <= SESSIZLIK_DB:  # sessizlik: büyütülecek bir şey yok
        return dizi.copy(), DuzeyBilgisi(olculen, 0.0, False, tepe_dbfs(dizi))
    kazanc = hedef - olculen
    tepe = tepe_dbfs(dizi)
    ulasildi = True
    if tepe + kazanc > tepe_siniri_dbfs:
        kazanc = tepe_siniri_dbfs - tepe  # tepe tavanı aşılmasın: kazanç kısılır (sıkıştırma yok)
        ulasildi = False
    cikti = (dizi.astype(np.float64) * db_genlik(kazanc)).astype(np.float32)
    return cikti, DuzeyBilgisi(olculen, kazanc, ulasildi, tepe + kazanc)


def lufs_normallestir(
    dizi: Dizi, ornekleme: int, hedef_lufs: float = -16.0, tepe_siniri_dbfs: float = -1.0
) -> tuple[Dizi, DuzeyBilgisi]:
    """Sesi hedef LUFS'a getirir; tepe `tepe_siniri_dbfs`'i aşacaksa kazancı kısar (bilgide yazar).

    −16 LUFS telefonda konuşma için yaygın hedeftir (podcast/mobil); yayın için −23 LUFS.
    """
    return _kazanc_uygula(dizi, lufs(dizi, ornekleme), hedef_lufs, tepe_siniri_dbfs)


def rms_normallestir(
    dizi: Dizi, hedef_dbfs: float = -20.0, tepe_siniri_dbfs: float = -1.0
) -> tuple[Dizi, DuzeyBilgisi]:
    """Sesi hedef RMS düzeyine getirir (sessiz bölümler de ortalamaya girer; LUFS'tan kabadır)."""
    return _kazanc_uygula(dizi, rms_dbfs(dizi), hedef_dbfs, tepe_siniri_dbfs)
