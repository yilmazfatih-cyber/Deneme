"""Yeniden örnekleme (ör. 44,1 kHz → 16 kHz): Kaiser pencereli sinc süzgeçle çok fazlı (polyphase) FIR.

Yöntem: oran sadeleştirilir (L/M, ör. 22050→16000 = 320/441). Sinyal kavramsal olarak L kat
sıfır eklenerek büyütülür, alçak geçiren süzgeçten geçirilir, M kat seyreltilir; çok fazlı biçimde
yalnız gereken çarpımlar yapılır. Süzgeç: geçirme bandı alt Nyquist'in %90'ına kadar (dalgalanma
≤ 0,001 dB), durdurma bandı alt Nyquist'ten itibaren ≥ 80 dB bastırma (Kaiser β = 7,86). Böylece
katlanma (aliasing) geçirme bandına hiç düşmez. Süzgeç gecikmesi telafi edilir: çıktı girdiyle
zamanda hizalıdır. Kalite testleri: tests/test_yeniden_ornekle.py (SNR, bastırma, kaba kuvvet).
Kim kullanır: hazirla.py (STT girdisi 16 kHz), tts/ (perde kaydırma, çıktı hızı).
Genişletme: farklı kalite/hız dengesi için `ZAYIFLATMA_DB` ve `GECIS` değiştirilir; testler
eşikleri bu değerlere göre denetler.
"""

from __future__ import annotations

import math
from functools import lru_cache

import numpy as np
from numpy.typing import NDArray

from ses.hatalar import BicimHatasi
from ses.ses_isleme.ses import Dizi

ZAYIFLATMA_DB = 80.0
"""Durdurma bandında en az bastırma (dB)."""
GECIS = 0.10
"""Geçiş bandı genişliği, alt Nyquist frekansının oranı olarak (geçirme kenarı 0,90 · Nyquist)."""
_BLOK = 16384  # bir seferde hesaplanan çıktı örneği (bellek ≈ _BLOK × dal uzunluğu × 4 bayt)
_AZAMI_ORAN = 10_000


def oran(kaynak: int, hedef: int) -> tuple[int, int]:
    """Sadeleştirilmiş (L, M): hedef/kaynak = L/M. 22050→16000 → (320, 441)."""
    if kaynak <= 0 or hedef <= 0:
        raise BicimHatasi("Örnekleme hızları pozitif olmalı.")
    ortak = math.gcd(kaynak, hedef)
    return hedef // ortak, kaynak // ortak


def suzgec_tasarla(yukari: int, asagi: int) -> NDArray[np.float64]:
    """Büyütülmüş hızda alçak geçiren Kaiser-sinc süzgeç (tek uzunluklu, toplamı `yukari`)."""
    nyquist = 0.5 / max(yukari, asagi)  # alt Nyquist, büyütülmüş hıza göre (devir/örnek)
    kesim = (1.0 - GECIS / 2) * nyquist
    gecis = GECIS * nyquist
    beta = 0.1102 * (ZAYIFLATMA_DB - 8.7)
    uzunluk = math.ceil((ZAYIFLATMA_DB - 7.95) / (2.285 * 2 * math.pi * gecis)) + 1
    uzunluk += 1 - uzunluk % 2  # tek olsun: tam ortası olan simetrik süzgeç, tamsayı gecikme
    yari = (uzunluk - 1) // 2
    konum = np.arange(uzunluk, dtype=np.float64) - yari
    katsayi = 2 * kesim * np.sinc(2 * kesim * konum) * np.kaiser(uzunluk, beta)
    return katsayi * (yukari / katsayi.sum())


@lru_cache(maxsize=8)
def _banka(yukari: int, asagi: int) -> tuple[NDArray[np.float32], int]:
    """Süzgeci fazlara böler: banka[p, i] = h[p + i·L]. Gecikme (yarı uzunluk) ile döner."""
    katsayi = suzgec_tasarla(yukari, asagi)
    yari = (len(katsayi) - 1) // 2
    dal = math.ceil(len(katsayi) / yukari)
    dolgu = np.zeros(dal * yukari, dtype=np.float64)
    dolgu[: len(katsayi)] = katsayi
    return dolgu.reshape(dal, yukari).T.astype(np.float32).copy(), yari


def cikti_uzunlugu(girdi: int, kaynak: int, hedef: int) -> int:
    """Yeniden örneklenmiş dizinin uzunluğu: ⌈girdi · hedef / kaynak⌉."""
    yukari, asagi = oran(kaynak, hedef)
    return -(-girdi * yukari // asagi)


def yeniden_ornekle(dizi: Dizi, kaynak: int, hedef: int) -> Dizi:
    """Tek kanallı float32 diziyi `kaynak` Hz'den `hedef` Hz'e çevirir (zamanda hizalı).

    Çıktının i'inci örneği, girdideki i·kaynak/hedef anına karşılık gelir; uzunluk
    `cikti_uzunlugu(...)`. Kenarlarda sinyal sıfırla sürdürülmüş sayılır.
    """
    girdi = np.asarray(dizi, dtype=np.float32)
    if girdi.ndim != 1:
        raise BicimHatasi("yeniden_ornekle tek kanallı (1 boyutlu) dizi bekler; önce mono() alın.")
    if kaynak == hedef or len(girdi) == 0:
        return girdi.copy()
    yukari, asagi = oran(kaynak, hedef)
    if max(yukari, asagi) > _AZAMI_ORAN:
        raise BicimHatasi(
            f"{kaynak} Hz → {hedef} Hz oranı çok karmaşık. Önce ffmpeg ile yaygın bir hıza çevirin."
        )
    banka, gecikme = _banka(yukari, asagi)
    dal = banka.shape[1]
    dolgulu = np.concatenate(
        [np.zeros(dal, np.float32), girdi, np.zeros(2 * dal + 2, np.float32)]
    )
    toplam = cikti_uzunlugu(len(girdi), kaynak, hedef)
    cikti = np.empty(toplam, dtype=np.float32)
    geri = np.arange(dal, dtype=np.int64)
    for bas in range(0, toplam, _BLOK):
        n = np.arange(bas, min(bas + _BLOK, toplam), dtype=np.int64)
        an = n * asagi + gecikme  # büyütülmüş hızdaki konum
        faz, sira = an % yukari, an // yukari
        pencere = dolgulu[(sira + dal)[:, None] - geri[None, :]]
        cikti[bas : bas + len(n)] = np.einsum("ij,ij->i", pencere, banka[faz])
    return cikti
