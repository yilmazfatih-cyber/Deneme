"""Trie (önek ağacı): kelimeleri harf harf saklar; önek araması ve otomatik tamamlama yapar.

Fikir:
    Kökten başlayan her yol bir öneki temsil eder; kelime bitişleri işaretlenir. Bir kelimeyi
    aramak ya da eklemek, kelimedeki harf sayısı kadar adım sürer (sözlükteki kelime sayısından
    bağımsız). Her düğüm, altından geçen kelime sayısını da tuttuğundan "bu önekle kaç kelime
    başlar" sorusu O(önek uzunluğu)'dur. Otomatik tamamlama önek düğümünün altını gezer ve
    kelimeleri ağırlığa (ör. kullanım sıklığı) göre sıralar.
    Türkçe notu: harfler Unicode kod noktası olarak saklanır; "ı" ile "i" farklı harflerdir.
    Büyük/küçük harf duyarsız arama için kelimeleri önce `lower_tr` ile küçültün.

Karmaşıklık: ekleme/arama/silme O(L) (L = kelime uzunluğu); tamamlama O(alt ağaç boyutu);
    yer O(toplam harf)
Ne zaman: önek sorguları, otomatik tamamlama, sözlük denetimi, çok desenli arama tabanı.
Ne zaman değil: yalnız tam eşleşme gerekiyorsa `set` daha hızlı ve az bellek yer.
Bağımlılık: yok
Genişletme: sıralamayı Türkçe alfabeye göre yapmak için `complete` içindeki anahtara
    `algoritma.dizgi.turkish_text.sort_key_tr` verin.

Örnek:
    >>> t = Trie()
    >>> for word, uses in [("kalem", 5), ("kale", 2), ("kalp", 9), ("masa", 1)]:
    ...     t.insert(word, uses)
    >>> t.count_prefix("kal"), "kal" in t, t.complete("kal", limit=2)
    (3, False, ['kalp', 'kalem'])
    >>> t.words_with_prefix("kale"), t.remove("kale"), t.words_with_prefix("kale")
    (['kale', 'kalem'], True, ['kalem'])
"""

from __future__ import annotations


class _Node:
    __slots__ = ("children", "passing", "weight")

    def __init__(self) -> None:
        self.children: dict[str, _Node] = {}
        self.passing = 0  # bu düğümün altında (kendisi dahil) biten kelime sayısı
        self.weight = 0  # > 0 ise burada bir kelime biter; değer onun ağırlığıdır


class Trie:
    """Ağırlıklı kelime kümesi; önek sorgusu ve otomatik tamamlama."""

    def __init__(self) -> None:
        self._root = _Node()

    def __len__(self) -> int:
        return self._root.passing

    def _walk(self, prefix: str) -> _Node | None:
        node: _Node | None = self._root
        for char in prefix:
            if node is None:
                return None
            node = node.children.get(char)
        return node

    def insert(self, word: str, weight: int = 1) -> None:
        """Kelimeyi ekler; zaten varsa ağırlığına `weight` eklenir."""
        if weight <= 0:
            raise ValueError("ağırlık pozitif olmalı")
        is_new = word not in self
        node = self._root
        if is_new:
            node.passing += 1
        for char in word:
            node = node.children.setdefault(char, _Node())
            if is_new:
                node.passing += 1
        node.weight += weight

    def __contains__(self, word: object) -> bool:
        node = self._walk(str(word))
        return node is not None and node.weight > 0

    def count_prefix(self, prefix: str) -> int:
        """Bu önekle başlayan (önekin kendisi dahil) kelime sayısı."""
        node = self._walk(prefix)
        return node.passing if node is not None else 0

    def _collect(self, prefix: str) -> list[tuple[str, int]]:
        start = self._walk(prefix)
        found: list[tuple[str, int]] = []
        stack: list[tuple[_Node, str]] = [(start, prefix)] if start is not None else []
        while stack:  # özyinelemesiz: çok uzun kelimelerde de yığın taşmaz
            node, path = stack.pop()
            if node.weight > 0:
                found.append((path, node.weight))
            stack.extend((child, path + char) for char, child in node.children.items())
        return found

    def words_with_prefix(self, prefix: str) -> list[str]:
        """Önekle başlayan tüm kelimeler, kod noktası sırasıyla."""
        return sorted(word for word, _ in self._collect(prefix))

    def complete(self, prefix: str, limit: int = 10) -> list[str]:
        """En ağır `limit` tamamlama; eşit ağırlıkta kod noktası sırası."""
        ranked = sorted(self._collect(prefix), key=lambda item: (-item[1], item[0]))
        return [word for word, _ in ranked[:limit]]

    def remove(self, word: str) -> bool:
        """Kelimeyi siler, boşalan dalları budar; kelime yoksa False döndürür."""
        if word not in self:
            return False
        path = [self._root]
        for char in word:
            path.append(path[-1].children[char])
        path[-1].weight = 0
        for node in path:
            node.passing -= 1
        for depth in range(len(word), 0, -1):  # alttan yukarı: kimsenin geçmediği düğümü sil
            if path[depth].passing == 0:
                del path[depth - 1].children[word[depth - 1]]
        return True
