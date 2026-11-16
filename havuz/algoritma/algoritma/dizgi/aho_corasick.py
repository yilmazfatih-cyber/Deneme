"""Aho-Corasick: çok sayıda deseni metinde TEK geçişte arar (yasaklı kelime süzgeci, virüs imzası).

Fikir:
    Desenler bir trie'ye konur. Her düğüme bir "hata bağı" eklenir: o düğümün temsil ettiği
    dizginin, trie'de bulunan en uzun öz soneki. Bu, KMP'nin önek fonksiyonunun çok desenli
    hâlidir. Metin harf harf gezilir; geçiş yoksa hata bağları izlenir. Her düğümde biten
    desenlerin yanı sıra hata bağı zincirindeki düğümlerde biten desenler de eşleşir; bunlar
    "çıktı bağı" (sözlük soneki bağı) ile doğrudan, boş düğümlere uğramadan toplanır.
    Hata bağları BFS ile (sığdan derine) kurulur: bir düğümün bağı ebeveyninin bağından türer.

Karmaşıklık: kurulum O(toplam desen uzunluğu · alfabe dallanması); arama O(n + eşleşme sayısı);
    yer O(toplam desen uzunluğu)
Ne zaman: binlerce desen tek metinde (küfür süzgeci, anahtar kelime vurgulama, imza tarama).
Ne zaman değil: tek desen için `kmp.py`; düzenli ifade gerekiyorsa `re`.
Bağımlılık: yok
Genişletme: büyük/küçük harf duyarsız arama için desenleri ve metni `casefold_tr` ile
    (`algoritma/dizgi/turkish_text.py`) aynı biçime getirin; uzunluk değişmiyorsa konumlar korunur.

Örnek:
    >>> ac = AhoCorasick(["he", "she", "his", "hers"])
    >>> ac.search("ushers")
    [(1, 1), (2, 0), (2, 3)]
"""

from __future__ import annotations

from collections import deque
from collections.abc import Sequence


class AhoCorasick:
    """Değişmeyen bir desen kümesi için otomat."""

    def __init__(self, patterns: Sequence[str]) -> None:
        if any(not p for p in patterns):
            raise ValueError("boş desen aranamaz")
        self._patterns = list(patterns)
        self._goto: list[dict[str, int]] = [{}]
        self._fail = [0]
        self._ends: list[list[int]] = [[]]  # bu düğümde biten desen dizinleri
        self._output = [-1]  # hata zincirinde desen biten en yakın düğüm (yoksa −1)
        for index, pattern in enumerate(self._patterns):
            node = 0
            for char in pattern:
                if char not in self._goto[node]:
                    self._goto.append({})
                    self._fail.append(0)
                    self._ends.append([])
                    self._output.append(-1)
                    self._goto[node][char] = len(self._goto) - 1
                node = self._goto[node][char]
            self._ends[node].append(index)
        self._build_links()

    def _build_links(self) -> None:
        queue = deque(self._goto[0].values())  # kökün çocuklarının hata bağı kökün kendisi
        while queue:
            node = queue.popleft()
            for char, child in self._goto[node].items():
                fallback = self._fail[node]
                while fallback and char not in self._goto[fallback]:
                    fallback = self._fail[fallback]
                candidate = self._goto[fallback].get(char, 0)
                self._fail[child] = candidate if candidate != child else 0
                link = self._fail[child]
                self._output[child] = link if self._ends[link] else self._output[link]
                queue.append(child)

    def search(self, text: str) -> list[tuple[int, int]]:
        """Tüm eşleşmeler: (başlangıç konumu, desen dizini), konum sonra desen sırasıyla."""
        found = []
        node = 0
        for i, char in enumerate(text):
            while node and char not in self._goto[node]:
                node = self._fail[node]
            node = self._goto[node].get(char, 0)
            hit = node if self._ends[node] else self._output[node]
            while hit > 0:
                for index in self._ends[hit]:
                    found.append((i - len(self._patterns[index]) + 1, index))
                hit = self._output[hit]
        return sorted(found)
