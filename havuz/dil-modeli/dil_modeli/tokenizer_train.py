"""Bayt düzeyi BPE eğitimi: saf Python (varsayılan) ve `tokenizers` ile hızlı yol.

Algoritma: (1) metni ön-bölüp her parçanın kaç kez geçtiğini say, (2) en sık komşu çifti
birleştir, (3) yalnız o çifti içeren parçalarda sayımları artımlı güncelle, (4) sözlük dolana
dek yinele. En sık çift bir öncelik kuyruğundan gelir; eskimiş kayıtlar tembel düzeltilir.
Eşitlik bozma kuralı HF `BpeTrainer` ile aynıdır (küçük kimlikli çift önce), bu yüzden iki yol
aynı sözlüğü üretir (tests/test_tokenizer_train.py).

Genişletme: Çok büyük derlemlerde (yüzlerce MB) `fast=True` kullanın; saf Python yolu her
farklı parçayı bellekte tutar.
"""

from __future__ import annotations

import heapq
import json
from collections import Counter
from collections.abc import Callable, Iterable, Mapping, Sequence

from .bytelevel import BYTE_TO_CHAR, pretokenize, sanitize, to_bytelevel
from .tokenizer import DEFAULT_SPECIAL_TOKENS, BPETokenizer

_SHIFT = 22  # çift anahtarı: (sol << _SHIFT) | sağ ; 4 milyon belirtece kadar
_MASK = (1 << _SHIFT) - 1

Progress = Callable[[int, int], None]


def count_words(texts: Iterable[str]) -> Counter[str]:
    """Derlemi ön-bölüp parça sıklıklarını sayar (akışla; metnin tümü bellekte tutulmaz)."""
    counter: Counter[str] = Counter()
    for text in texts:
        counter.update(pretokenize(sanitize(text)))
    return counter


def train_bpe(
    texts: Iterable[str],
    vocab_size: int,
    *,
    special_tokens: Sequence[str] = DEFAULT_SPECIAL_TOKENS,
    min_frequency: int = 2,
    fast: bool = False,
    progress: Progress | None = None,
) -> BPETokenizer:
    """Metinlerden tokenizer eğitir. `fast=True` aynı işi `tokenizers` kütüphanesine yaptırır."""
    if fast:
        return _train_with_tokenizers(texts, vocab_size, special_tokens, min_frequency)
    return train_from_counts(
        count_words(texts),
        vocab_size,
        special_tokens=special_tokens,
        min_frequency=min_frequency,
        progress=progress,
    )


def train_from_counts(
    word_counts: Mapping[str, int],
    vocab_size: int,
    *,
    special_tokens: Sequence[str] = DEFAULT_SPECIAL_TOKENS,
    min_frequency: int = 2,
    progress: Progress | None = None,
) -> BPETokenizer:
    """Parça sıklıklarından BPE birleştirmelerini öğrenir."""
    tokens = [*special_tokens, *sorted(BYTE_TO_CHAR)]
    vocab = {token: i for i, token in enumerate(tokens)}
    if len(vocab) != len(tokens):
        raise ValueError("Özel belirteç adları birbirinden ve bayt belirteçlerinden farklı olmalı.")
    if not len(tokens) <= vocab_size <= _MASK:
        raise ValueError(
            f"Sözlük boyutu en az {len(tokens)} olmalı ({len(special_tokens)} özel belirteç + 256 "
            f"bayt); istenen: {vocab_size}."
        )
    words = [[vocab[ch] for ch in to_bytelevel(word)] for word in word_counts]
    freqs = list(word_counts.values())
    counts, where = _count_pairs(words, freqs)
    heap = [(-count, key) for key, count in counts.items()]
    heapq.heapify(heap)

    merges: list[tuple[str, str]] = []
    special = frozenset(special_tokens)
    base = len(tokens)
    floor = max(1, min_frequency)
    while len(tokens) < vocab_size and heap:
        negative, key = heapq.heappop(heap)
        count = counts.get(key, 0)
        if count != -negative:  # eskimiş kayıt: güncel sayımla yeniden sıraya koy
            if count > 0:
                heapq.heappush(heap, (-count, key))
            continue
        if count < floor:
            break
        left, right = key >> _SHIFT, key & _MASK
        merged = tokens[left] + tokens[right]
        if merged in special:  # derlemdeki "<|son|>" yazısı özel belirtecin kimliğini üretemesin
            continue
        new_id = vocab.get(merged)
        if new_id is None:  # aynı yazı başka bir çiftten daha önce oluşmuşsa kimliği yeniden kullan
            new_id = len(tokens)
            tokens.append(merged)
            vocab[merged] = new_id
        merges.append((tokens[left], tokens[right]))
        for changed in _merge_pair(words, freqs, counts, where, key, new_id):
            heapq.heappush(heap, (-counts[changed], changed))
        if progress is not None and len(merges) % 200 == 0:
            progress(len(tokens) - base, vocab_size - base)
    return BPETokenizer(vocab, merges, special_tokens)


def _count_pairs(
    words: list[list[int]], freqs: list[int]
) -> tuple[dict[int, int], dict[int, list[int]]]:
    """Başlangıç sayımı: her komşu çift kaç kez geçiyor ve hangi parçalarda bulunuyor."""
    counts: dict[int, int] = {}
    where: dict[int, list[int]] = {}
    for index, symbols in enumerate(words):
        freq = freqs[index]
        for i in range(len(symbols) - 1):
            key = (symbols[i] << _SHIFT) | symbols[i + 1]
            counts[key] = counts.get(key, 0) + freq
            holders = where.get(key)
            if holders is None:
                where[key] = [index]
            elif holders[-1] != index:
                holders.append(index)
    return counts, where


def _merge_pair(
    words: list[list[int]],
    freqs: list[int],
    counts: dict[int, int],
    where: dict[int, list[int]],
    key: int,
    new_id: int,
) -> list[int]:
    """`key` çiftini geçtiği her parçada birleştirir; sayımı artan çiftleri döndürür.

    Sayımlar yalnız birleşmenin sol ve sağ komşusunda değişir; parçanın tümü yeniden sayılmaz.
    """
    left, right = key >> _SHIFT, key & _MASK
    delta: dict[int, int] = {}
    for index in where.pop(key, ()):
        old = words[index]
        size = len(old)
        new: list[int] = []
        freq = freqs[index]
        i = 0
        while i < size:
            symbol = old[i]
            if symbol != left or i + 1 >= size or old[i + 1] != right:
                new.append(symbol)
                i += 1
                continue
            gone = [key]
            born: list[int] = []
            if new:  # sol komşu: (önceki, sol) gider, (önceki, yeni) gelir
                gone.append((new[-1] << _SHIFT) | left)
                born.append((new[-1] << _SHIFT) | new_id)
            if i + 2 < size:  # sağ komşu: (sağ, sonraki) gider, (yeni, sonraki) gelir
                gone.append((right << _SHIFT) | old[i + 2])
                born.append((new_id << _SHIFT) | old[i + 2])
            for pair in gone:
                delta[pair] = delta.get(pair, 0) - freq
            for pair in born:
                delta[pair] = delta.get(pair, 0) + freq
                holders = where.get(pair)
                if holders is None:
                    where[pair] = [index]
                elif holders[-1] != index:
                    holders.append(index)
            new.append(new_id)
            i += 2
        words[index] = new

    increased: list[int] = []
    for pair, change in delta.items():
        if change == 0:
            continue
        count = counts.get(pair, 0) + change
        if count > 0:
            counts[pair] = count
            if change > 0:
                increased.append(pair)
        else:  # hiçbir parçada kalmadı
            counts.pop(pair, None)
            where.pop(pair, None)
    return increased


def _train_with_tokenizers(
    texts: Iterable[str], vocab_size: int, special_tokens: Sequence[str], min_frequency: int
) -> BPETokenizer:
    """Hızlı yol: Rust ile yazılmış `tokenizers` eğitir, sonuç bizim biçimimize okunur."""
    try:
        from tokenizers import Tokenizer, decoders, models, pre_tokenizers, trainers
    except ImportError:
        raise RuntimeError(
            "Hızlı tokenizer eğitimi için `tokenizers` paketi gerekli: "
            'pip install -e ".[hf]" çalıştırın ya da --hizli seçeneğini kaldırın.'
        ) from None
    tokenizer = Tokenizer(models.BPE())
    tokenizer.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False, use_regex=True)
    tokenizer.decoder = decoders.ByteLevel()
    trainer = trainers.BpeTrainer(
        vocab_size=vocab_size,
        min_frequency=min_frequency,
        special_tokens=list(special_tokens),
        initial_alphabet=pre_tokenizers.ByteLevel.alphabet(),
        show_progress=False,
    )
    tokenizer.train_from_iterator((sanitize(text) for text in texts), trainer)
    data = json.loads(tokenizer.to_str())
    special = frozenset(special_tokens)
    data["model"]["merges"] = [  # özel belirteç yazısını üreten ya da kullanan birleştirmeleri at
        [a, b] for a, b in data["model"]["merges"] if not {a, b, a + b} & special
    ]
    return BPETokenizer.from_json(data)
