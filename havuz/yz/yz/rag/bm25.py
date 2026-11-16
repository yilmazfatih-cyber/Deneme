"""Sıfırdan BM25 (Okapi) sözcük araması — Türkçe'ye uyarlanmış belirteçleme ile.

Puan(d, q) = Σ_t IDF(t) · f(t,d)·(k1+1) / (f(t,d) + k1·(1 − b + b·|d|/ortalama|d|))
IDF(t)     = ln(1 + (N − n(t) + 0.5) / (n(t) + 0.5))          (her zaman pozitif; Lucene biçimi)
Belirteçleme: Türkçe küçük harf → durak kelimeleri at → ek kırp ("faturanın" → "fatur").
`belirtecleyici="ngram"` seçilirse karakter 4-gramları kullanılır (yazım hatalarına dayanıklı).
Kim kullanır: rag/dizin.py (karma aramanın sözcük ayağı).
Genişletme: durak kelimesi → `DURAK_KELIMELERI`; başka belirteçleyici → `belirtecle` içine dal.
Doğruluk: tests/test_rag_bm25.py elle hesaplanmış örnekle karşılaştırır.
"""

from __future__ import annotations

import heapq
import math
from collections import Counter, defaultdict
from collections.abc import Sequence

from yz.metin import ascii_katla, karakter_ngramlari, kelimeler, kok_bul

DURAK_KELIMELERI = frozenset(
    [
        "ve",
        "ile",
        "bir",
        "bu",
        "şu",
        "o",
        "de",
        "da",
        "ki",
        "mi",
        "mı",
        "mu",
        "mü",
        "için",
        "gibi",
        "ne",
        "çok",
        "daha",
        "en",
        "ya",
        "veya",
        "ama",
        "fakat",
        "her",
        "olarak",
        "olan",
        "olup",
        "ise",
        "bunu",
        "şunu",
        "onu",
        "bunun",
        "şunun",
        "onun",
        "ben",
        "sen",
        "biz",
        "siz",
        "onlar",
        "hem",
        "ancak",
        "yani",
        "diye",
        "kadar",
        "sonra",
        "önce",
        "göre",
        "karşı",
        "ayrıca",
        "nasıl",
        "neden",
        "niçin",
        "hangi",
        "kim",
        "var",
        "yok",
        "değil",
        "evet",
        "hayır",
        "tüm",
        "bütün",
        "bazı",
        "birçok",
        "çünkü",
        "eğer",
        "the",
        "a",
        "an",
        "of",
        "to",
        "in",
        "and",
        "or",
        "is",
    ]
)


def belirtecle(metin: str, kip: str = "kok") -> list[str]:
    """Metni BM25 belirteçlerine böler. kip: "kok" (ek kırpma) ya da "ngram" (karakter 4-gram)."""
    if kip == "ngram":
        return karakter_ngramlari(metin, 4)
    if kip != "kok":
        raise ValueError(f'belirteçleme kipi "kok" ya da "ngram" olmalı; gelen: {kip!r}')
    return [
        ascii_katla(kok_bul(k)) for k in kelimeler(metin, kok="yok") if k not in DURAK_KELIMELERI
    ]


class BM25:
    """Artımlı (belge eklenebilir) BM25 dizini. Belgeler eklenme sırasıyla 0'dan numaralanır."""

    def __init__(self, k1: float = 1.5, b: float = 0.75, kip: str = "kok") -> None:
        self.k1 = k1
        self.b = b
        self.kip = kip
        self._sikliklar: list[Counter[str]] = []
        self._uzunluklar: list[int] = []
        self._ters: dict[str, list[int]] = defaultdict(list)  # belirteç → belge numaraları

    def __len__(self) -> int:
        return len(self._uzunluklar)

    def ekle(self, metinler: Sequence[str]) -> None:
        for metin in metinler:
            sayac = Counter(belirtecle(metin, self.kip))
            numara = len(self._uzunluklar)
            self._sikliklar.append(sayac)
            self._uzunluklar.append(sum(sayac.values()))
            for belirtec in sayac:
                self._ters[belirtec].append(numara)

    def idf(self, belirtec: str) -> float:
        n = len(self._ters.get(belirtec, ()))
        return math.log(1.0 + (len(self) - n + 0.5) / (n + 0.5))

    def puanlar(self, sorgu: str) -> dict[int, float]:
        """Sorgu belirteçlerinden en az birini içeren her belgenin puanı."""
        if not self._uzunluklar:
            return {}
        ortalama = sum(self._uzunluklar) / len(self._uzunluklar) or 1.0
        sonuc: dict[int, float] = defaultdict(float)
        for belirtec, sorgu_adedi in Counter(belirtecle(sorgu, self.kip)).items():
            belgeler = self._ters.get(belirtec)
            if not belgeler:
                continue
            idf = self.idf(belirtec)
            for numara in belgeler:
                f = self._sikliklar[numara][belirtec]
                payda = f + self.k1 * (1 - self.b + self.b * self._uzunluklar[numara] / ortalama)
                sonuc[numara] += sorgu_adedi * idf * f * (self.k1 + 1) / payda
        return dict(sonuc)

    def ara(self, sorgu: str, k: int = 10) -> list[tuple[int, float]]:
        """En yüksek puanlı `k` belge: [(belge numarası, puan), …] (puan azalan)."""
        puanlar = self.puanlar(sorgu)
        return heapq.nlargest(k, puanlar.items(), key=lambda ikili: (ikili[1], -ikili[0]))
