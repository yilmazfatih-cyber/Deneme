"""Metin belirteçleme (tokenization): Türkçe'ye duyarlı küçük harf, kelime ve karakter n-gramları.

Fikir: metni modele vermeden önce parçalara (belirteçlere) ayırırız. Türkçe'ye özgü üç ayar:

  1. Küçük harf Türkçe kuralıyla yapılır: "IŞIK" → "ışık", "İZMİR" → "izmir" (`lower_tr`).
  2. Kesme işaretinden sonraki ek atılır: "İstanbul'da" → "istanbul".
  3. Türkçe sondan eklemelidir: "kitap, kitabı, kitaplar, kitaplarımızdan" aynı kökün biçimleridir.
     Tam bir kök bulucu yerine iki ucuz çare sunulur: `stem_length=5` (kelimenin ilk 5 harfi)
     ya da `analyzer="char_wb"` (kelime içi karakter n-gramları). İkisi de ekleri büyük ölçüde
     etkisizleştirir.

`strip_accents=True`, "Turkce karaktersiz" yazılmış metinleri doğru yazılmışlarla aynı
belirteçlere düşürür (ç→c, ş→s…). Kim kullanır: `vectorizers.py`.
Genişletme: yeni bir çözümleyici (analyzer) için `analyze` fonksiyonuna bir dal ekleyin.
"""

from __future__ import annotations

import re
from collections.abc import Collection

from ml_temel.ortak.turkish import fold_ascii_tr, lower_tr

# Harf ve rakam dizileri; Türkçe harfler `\w` içinde olduğundan ayrıca yazmaya gerek yok.
_TOKEN = re.compile(r"[^\W_]+(?:'[^\W_]+)?")
_APOSTROPHES = str.maketrans({"’": "'", "‘": "'", "ʼ": "'", "`": "'"})

# İçerik taşımayan çok sık kelimeler. Olumsuzluk taşıyanlar ("değil", "yok", "hiç") bilerek
# listede YOK: duygu/şikâyet sınıflandırmasında anlamı onlar belirler.
TURKISH_STOP_WORDS: frozenset[str] = frozenset(
    [
        "acaba",
        "ama",
        "ancak",
        "aslında",
        "bazı",
        "belki",
        "ben",
        "beni",
        "benim",
        "bile",
        "bir",
        "biraz",
        "birkaç",
        "biz",
        "bu",
        "bunu",
        "bunun",
        "çok",
        "çünkü",
        "da",
        "daha",
        "de",
        "diye",
        "dolayı",
        "en",
        "fakat",
        "gibi",
        "göre",
        "hem",
        "hep",
        "her",
        "için",
        "ile",
        "ise",
        "kadar",
        "ki",
        "kim",
        "mı",
        "mi",
        "mu",
        "mü",
        "nasıl",
        "ne",
        "neden",
        "nerede",
        "o",
        "olan",
        "olarak",
        "onu",
        "onun",
        "onlar",
        "öyle",
        "pek",
        "sadece",
        "sanki",
        "sen",
        "siz",
        "şey",
        "şu",
        "şunu",
        "tüm",
        "ve",
        "veya",
        "ya",
        "yani",
    ]
)


def normalize_text(text: str, lowercase: bool = True, strip_accents: bool = False) -> str:
    """Kesme işaretlerini tekleştirir; istenirse Türkçe küçük harfe çevirir ve aksanları siler."""
    text = text.translate(_APOSTROPHES)
    if lowercase:
        text = lower_tr(text)
    if strip_accents:
        text = fold_ascii_tr(text)
    return text


def tokenize(
    text: str,
    *,
    lowercase: bool = True,
    strip_accents: bool = False,
    stop_words: Collection[str] | None = None,
    stem_length: int | None = None,
    min_token_length: int = 2,
) -> list[str]:
    """Metni kelime belirteçlerine ayırır: `tokenize("İstanbul'da hava ÇOK güzel")`."""
    tokens: list[str] = []
    for match in _TOKEN.finditer(normalize_text(text, lowercase, strip_accents)):
        token = match.group().split("'", 1)[0]  # kesmeden sonraki eki at
        if len(token) < min_token_length or (stop_words is not None and token in stop_words):
            continue
        tokens.append(token[:stem_length] if stem_length else token)
    return tokens


def word_ngrams(tokens: list[str], ngram_range: tuple[int, int]) -> list[str]:
    """Kelime n-gramları: (1, 2) → tek kelimeler + ardışık ikililer ("hava güzel")."""
    low, high = ngram_range
    if low == 1 and high == 1:
        return tokens
    grams: list[str] = []
    for n in range(low, high + 1):
        grams.extend(" ".join(tokens[i : i + n]) for i in range(len(tokens) - n + 1))
    return grams


def char_ngrams(tokens: list[str], ngram_range: tuple[int, int]) -> list[str]:
    """Kelime içi karakter n-gramları; kelime başı/sonu boşlukla işaretlenir (" kit", "tap ")."""
    low, high = ngram_range
    grams: list[str] = []
    for token in tokens:
        padded = f" {token} "
        for n in range(low, high + 1):
            if len(padded) <= n:
                grams.append(padded)
                continue
            grams.extend(padded[i : i + n] for i in range(len(padded) - n + 1))
    return grams


def analyze(
    text: str,
    *,
    analyzer: str = "word",
    ngram_range: tuple[int, int] = (1, 1),
    lowercase: bool = True,
    strip_accents: bool = False,
    stop_words: Collection[str] | None = None,
    stem_length: int | None = None,
) -> list[str]:
    """Bir belgeyi özellik terimlerine çevirir (vektörleyicilerin ortak giriş noktası)."""
    tokens = tokenize(
        text,
        lowercase=lowercase,
        strip_accents=strip_accents,
        stop_words=stop_words,
        stem_length=stem_length,
        min_token_length=2 if analyzer == "word" else 1,
    )
    if analyzer == "word":
        return word_ngrams(tokens, ngram_range)
    if analyzer == "char_wb":
        return char_ngrams(tokens, ngram_range)
    raise ValueError(f"analyzer 'word' ya da 'char_wb' olmalı; verilen: '{analyzer}'.")
