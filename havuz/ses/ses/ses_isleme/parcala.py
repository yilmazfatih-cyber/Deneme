"""Uzun sesi parçalara bölme: sessizliklerden (VAD) ya da sabit uzunlukta, örtüşmeli.

`konusma_parcalari`: konuşma bölgelerini, her parça `azami_sn`'yi aşmayacak biçimde gruplar;
sessiz aralıklar parçalara girmez (yazıya çeviricide uydurma — "hallucination" — riskini azaltır).
Tek bir konuşma bölgesi sınırdan uzunsa, sınırın son yarısındaki EN SESSİZ çerçevede kesilir
(sözcük ortasından kesme olasılığı en aza iner). Whisper 30 sn'lik pencereyle çalışır; varsayılan
28 sn bir pay bırakır. `sabit_parcalar`: sinyal bakmadan eşit uzunlukta, örtüşmeli parçalar.
Kim kullanır: stt/uzun.py. Genişletme: başka bir kesme ölçütü → yeni işlev + tests/test_parcala.py.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ses.hatalar import BicimHatasi
from ses.ses_isleme.ses import Dizi
from ses.ses_isleme.vad import ADIM_MS, Bolge, cerceve_enerjisi, konusma_bolgeleri


@dataclass(frozen=True)
class Parca:
    """Sesin bir parçası: örnek dizinleri [bas, son)."""

    bas: int
    son: int


def _en_sessiz_kesim(enerji: np.ndarray, bas: int, son: int, ornekleme: int) -> int:
    """[bas + yarım, son] aralığındaki en düşük enerjili çerçevenin örnek konumu."""
    adim = ornekleme * ADIM_MS // 1000
    ilk = (bas + (son - bas) // 2) // adim
    sonuncu = max(ilk + 1, min(len(enerji), son // adim))
    k = ilk + int(np.argmin(enerji[ilk:sonuncu]))
    return min(max(k * adim, bas + 1), son)


def _bolgeyi_bol(bas: int, son: int, azami: int, enerji: np.ndarray, ornekleme: int) -> list[Parca]:
    parcalar: list[Parca] = []
    while son - bas > azami:
        kesim = _en_sessiz_kesim(enerji, bas, bas + azami, ornekleme)
        parcalar.append(Parca(bas, kesim))
        bas = kesim
    parcalar.append(Parca(bas, son))
    return parcalar


def konusma_parcalari(
    dizi: Dizi, ornekleme: int, *, azami_sn: float = 28.0, bolgeler: list[Bolge] | None = None
) -> list[Parca]:
    """Konuşma içeren, her biri en çok `azami_sn` uzunlukta parçalar (zaman sırasıyla)."""
    if azami_sn < 1.0:
        raise BicimHatasi("Parça uzunluğu en az 1 saniye olmalı.")
    if bolgeler is None:
        bolgeler = konusma_bolgeleri(dizi, ornekleme)
    azami = int(azami_sn * ornekleme)
    enerji = cerceve_enerjisi(dizi, ornekleme)
    parcalar: list[Parca] = []
    grup: Parca | None = None
    for bolge in bolgeler:
        bas, son = int(bolge.baslangic * ornekleme), min(len(dizi), int(bolge.bitis * ornekleme))
        if grup is not None and son - grup.bas <= azami:
            grup = Parca(grup.bas, son)  # aynı parçaya sığıyor: arada kalan kısa sessizlikle birlikte
            continue
        if grup is not None:
            parcalar.append(grup)
        bolunmus = _bolgeyi_bol(bas, son, azami, enerji, ornekleme)
        parcalar.extend(bolunmus[:-1])
        grup = bolunmus[-1]
    if grup is not None:
        parcalar.append(grup)
    return parcalar


def sabit_parcalar(
    uzunluk: int, ornekleme: int, *, parca_sn: float, ortusme_sn: float = 0.0
) -> list[Parca]:
    """Eşit uzunlukta, `ortusme_sn` kadar örtüşen parçalar (son parça kısa olabilir)."""
    if parca_sn <= 0 or not 0 <= ortusme_sn < parca_sn:
        raise BicimHatasi("parca_sn > 0 ve 0 ≤ ortusme_sn < parca_sn olmalı.")
    boy = int(parca_sn * ornekleme)
    adim = boy - int(ortusme_sn * ornekleme)
    parcalar = []
    for bas in range(0, max(uzunluk, 1), adim):
        parcalar.append(Parca(bas, min(bas + boy, uzunluk)))
        if bas + boy >= uzunluk:
            break
    return parcalar if uzunluk > 0 else []
