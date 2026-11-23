"""Enerji tabanlı konuşma bölütleme (VAD): sesin hangi aralıklarında konuşma (ya da ses) var?

Yöntem: 30 ms pencere, 10 ms adımla çerçeve enerjisi (dBFS). Gürültü tabanı = enerjinin 300 ms'lik
kayan ortalamasının en küçüğü (sesin %10'undan azı sessiz olsa da doğru çıkar). Giriş eşiği =
taban + `esik_db`, ama en yüksek çerçevelerin (95. yüzdelik) 6 dB altını geçemez — duraksız konuşmada
taban yanlış tahmin edilse bile ses "boş" sayılmaz (parçalamada konuşma düşmesin); en altta
`mutlak_esik_dbfs`. Çıkış eşiği 3 dB aşağıda (histerezis). Sonra kısa boşluklar birleştirilir, çok
kısa parçalar (tıkırtı) atılır, her bölgeye pay eklenir. Yalnız enerjiye bakar: müzik, öksürük ve
durağan yüksek gürültü de "konuşma" sayılır; gürültülü ortamda kısık konuşma kaçabilir (README Sınırlar).
Kim kullanır: parcala.py (uzun sesi böler), sessizlik.py, komutlar.py.
Genişletme: daha iyi bir VAD (ör. Silero) gerekiyorsa aynı imzalı (`konusma_bolgeleri`) yeni bir
işlev yazıp parcala.py'ye parametre olarak verin; testleri tests/test_vad.py'yi örnek alarak yazın.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from ses.ses_isleme.ses import Dizi

ADIM_MS = 10


@dataclass(frozen=True)
class Bolge:
    """Konuşma bölgesi (saniye)."""

    baslangic: float
    bitis: float

    @property
    def sure(self) -> float:
        return self.bitis - self.baslangic


def cerceve_enerjisi(
    dizi: Dizi, ornekleme: int, pencere_ms: int = 30, adim_ms: int = ADIM_MS
) -> NDArray[np.float64]:
    """Her adımdaki çerçevenin enerjisi (dBFS); k'inci çerçeve k·adım anında başlar."""
    pencere = max(1, ornekleme * pencere_ms // 1000)
    adim = max(1, ornekleme * adim_ms // 1000)
    if len(dizi) == 0:
        return np.zeros(0)
    kare = np.concatenate([[0.0], np.cumsum(np.square(dizi, dtype=np.float64))])
    baslar = np.arange(0, len(dizi), adim)
    sonlar = np.minimum(baslar + pencere, len(dizi))
    ortalama = (kare[sonlar] - kare[baslar]) / np.maximum(sonlar - baslar, 1)
    return 10 * np.log10(np.maximum(ortalama, 1e-12))


def gurultu_tabani(enerji: NDArray[np.float64], pencere_cerceve: int = 30) -> float:
    """Gürültü tabanı (dBFS): enerjinin `pencere_cerceve` çerçevelik kayan ortalamasının en küçüğü."""
    guc = np.power(10.0, enerji / 10)
    if len(guc) <= pencere_cerceve:
        return float(enerji.min())
    birikim = np.concatenate([[0.0], np.cumsum(guc)])
    ortalama = (birikim[pencere_cerceve:] - birikim[:-pencere_cerceve]) / pencere_cerceve
    return float(10 * np.log10(max(float(ortalama.min()), 1e-12)))


def _ham_bolgeler(enerji: NDArray[np.float64], giris: float, cikis: float) -> list[list[int]]:
    """Histerezisli eşikle [başlangıç, bitiş) çerçeve aralıkları."""
    bolgeler: list[list[int]] = []
    icinde = False
    for k, deger in enumerate(enerji):
        if not icinde and deger > giris:
            bolgeler.append([k, k + 1])
            icinde = True
        elif icinde and deger > cikis:
            bolgeler[-1][1] = k + 1
        else:
            icinde = False
    return bolgeler


def konusma_bolgeleri(
    dizi: Dizi,
    ornekleme: int,
    *,
    esik_db: float = 12.0,
    mutlak_esik_dbfs: float = -50.0,
    en_kisa_konusma_ms: int = 100,
    en_kisa_sessizlik_ms: int = 300,
    pay_ms: int = 100,
) -> list[Bolge]:
    """Konuşma (ses etkinliği) bölgeleri; sessiz ya da çok kısık sinyalde boş liste."""
    enerji = cerceve_enerjisi(dizi, ornekleme)
    if len(enerji) == 0:
        return []
    giris = max(min(gurultu_tabani(enerji) + esik_db, float(np.percentile(enerji, 95)) - 6.0),
                mutlak_esik_dbfs)  # fmt: skip
    ham = _ham_bolgeler(enerji, giris, giris - 3.0)
    birlesik: list[list[int]] = []
    for bas, son in ham:  # kısa sessizlikleri doldur
        if birlesik and (bas - birlesik[-1][1]) * ADIM_MS < en_kisa_sessizlik_ms:
            birlesik[-1][1] = son
        else:
            birlesik.append([bas, son])
    sure = len(dizi) / ornekleme
    pay = pay_ms / 1000
    sonuc: list[Bolge] = []
    for bas, son in birlesik:
        if (son - bas) * ADIM_MS < en_kisa_konusma_ms:
            continue  # tıkırtı
        bolge = Bolge(max(0.0, bas * ADIM_MS / 1000 - pay), min(sure, son * ADIM_MS / 1000 + pay))
        if sonuc and bolge.baslangic <= sonuc[-1].bitis:
            sonuc[-1] = Bolge(sonuc[-1].baslangic, bolge.bitis)
        else:
            sonuc.append(bolge)
    return sonuc
