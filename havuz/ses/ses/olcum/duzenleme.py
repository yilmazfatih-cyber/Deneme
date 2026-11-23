"""Düzenleme (Levenshtein) uzaklığı ve hizalama: kaç yer değiştirme (S), silme (D), ekleme (I)?

Dinamik programlama tablosu numpy ile satır satır hesaplanır (ekleme bağımlılığı birikimli en
küçükle çözülür: d[j] = min_k≤j (a[k] + j − k)), geri izleme için tablo saklanır. Eşitlikte sıra:
eşleşme/yer değiştirme → silme → ekleme (yaygın araçlarla aynı). Uzaklık eşitlik sırasından
bağımsızdır; S/D/I dağılımı sıraya bağlıdır. Tablo sınırı: ~25 milyon hücre (~100 MB); daha uzun
metni cümlelere bölün. Kim kullanır: hata_orani.py. Testler kaba kuvvet tanımla karşılaştırır.
Genişletme: ağırlıklı maliyet gerekiyorsa `hizala`'ya maliyet parametresi ekleyin ve testini yazın.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

import numpy as np

from ses.hatalar import SinirHatasi

AZAMI_HUCRE = 25_000_000


@dataclass(frozen=True)
class Adim:
    """Hizalamanın bir adımı: tür "e" (eşleşme), "s" (yer değiştirme), "d" (silme), "i" (ekleme)."""

    tur: str
    dogru: str | None
    tahmin: str | None


@dataclass(frozen=True)
class Hizalama:
    eslesen: int
    yer_degistirme: int
    silme: int
    ekleme: int
    adimlar: list[Adim] = field(default_factory=list)

    @property
    def uzaklik(self) -> int:
        return self.yer_degistirme + self.silme + self.ekleme


def _kodla(dogru: Sequence[str], tahmin: Sequence[str]) -> tuple[np.ndarray, np.ndarray]:
    sozluk: dict[str, int] = {}
    a = np.array([sozluk.setdefault(t, len(sozluk)) for t in dogru], dtype=np.int64)
    b = np.array([sozluk.setdefault(t, len(sozluk)) for t in tahmin], dtype=np.int64)
    return a, b


def _tablo(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    n, m = len(a), len(b)
    if (n + 1) * (m + 1) > AZAMI_HUCRE:
        raise SinirHatasi(
            f"Metin hizalama için çok uzun ({n} × {m}). Cümlelere bölüp ayrı ayrı ölçün."
        )
    tablo = np.empty((n + 1, m + 1), dtype=np.int32)
    sira = np.arange(m + 1, dtype=np.int32)
    tablo[0] = sira
    for i in range(1, n + 1):
        onceki = tablo[i - 1]
        aday = np.empty(m + 1, dtype=np.int32)
        aday[0] = i
        aday[1:] = np.minimum(onceki[1:] + 1, onceki[:-1] + (b != a[i - 1]))
        tablo[i] = np.minimum.accumulate(aday - sira) + sira
    return tablo


def hizala(dogru: Sequence[str], tahmin: Sequence[str]) -> Hizalama:
    """İki dizinin (sözcük ya da karakter) hizalaması ve S/D/I sayıları."""
    a, b = _kodla(dogru, tahmin)
    tablo = _tablo(a, b)
    i, j = len(a), len(b)
    adimlar: list[Adim] = []
    sayac = {"e": 0, "s": 0, "d": 0, "i": 0}
    while i > 0 or j > 0:
        if i > 0 and j > 0 and tablo[i, j] == tablo[i - 1, j - 1] + int(a[i - 1] != b[j - 1]):
            tur = "e" if a[i - 1] == b[j - 1] else "s"
            adimlar.append(Adim(tur, dogru[i - 1], tahmin[j - 1]))
            i, j = i - 1, j - 1
        elif i > 0 and tablo[i, j] == tablo[i - 1, j] + 1:
            tur = "d"
            adimlar.append(Adim(tur, dogru[i - 1], None))
            i -= 1
        else:
            tur = "i"
            adimlar.append(Adim(tur, None, tahmin[j - 1]))
            j -= 1
        sayac[tur] += 1
    adimlar.reverse()
    return Hizalama(sayac["e"], sayac["s"], sayac["d"], sayac["i"], adimlar)


def uzaklik(dogru: Sequence[str], tahmin: Sequence[str]) -> int:
    """Yalnız uzaklık (geri izleme yok)."""
    return hizala(dogru, tahmin).uzaklik
