"""Türkçe metin yardımcıları: doğru büyük/küçük harf, harf duyarsız eşitlik, alfabe sırası, NFC.

Fikir:
    Python'un `str.upper()`/`lower()` işlevleri yerel ayarı bilmez: "i".upper() → "I" (doğrusu
    "İ"), "I".lower() → "i" (doğrusu "ı"), "İ".lower() → "i̇" (i + birleşen nokta, İKİ kod
    noktası!).
    Burada önce Türkçeye özgü dört harf elle eşlenir, kalanı Python'a bırakılır.
    Karakter ≠ bayt: "ş" UTF-8'de 2 bayttır; "ş" ayrıca "s" + birleşen çengel (U+0327) olarak da
    yazılabilir — ekranda aynı, ama `==` ile farklıdır. Karşılaştırmadan önce NFC'ye
    normalleştirin (`normalize_nfc`). `len()` kod noktası sayar, görünen harf sayısını değil.
    Alfabetik sıra: Python dizgileri kod noktasıyla sıralar ("ç" > "z"). `sort_key_tr` Türk
    alfabesi sırasını (a b c ç d e f g ğ h ı i j k l m n o ö p r s ş t u ü v y z) uygular;
    harf duyarsızdır, eşitlikte özgün metne bakar.

Karmaşıklık: tüm işlevler O(n) (n = metin uzunluğu); yer O(n)
Ne zaman: Türkçe metinde büyük/küçük harf, arama, sıralama, tekilleştirme yapılan her yer.
Ne zaman değil: dilden bağımsız tanımlayıcılar (dosya adı, anahtar) için sade `casefold` yeter.
Bağımlılık: yok
Genişletme: Azerice de aynı i/ı kuralını kullanır; başka bir alfabe sırası için `_ALPHABET`
    benzeri bir sabit ve ona göre bir anahtar işlevi ekleyin.

Örnek:
    >>> upper_tr("istanbul ılık"), lower_tr("İSTANBUL IŞIK"), capitalize_tr("izmir")
    ('İSTANBUL ILIK', 'istanbul ışık', 'İzmir')
    >>> sorted(["çay", "zeytin", "ceviz", "ılgın", "incir"], key=sort_key_tr)
    ['ceviz', 'çay', 'ılgın', 'incir', 'zeytin']
    >>> len("şeker"), utf8_length("şeker")
    (5, 6)
    >>> decomposed = "s\\u0327eker"  # "s" + birleşen çengel: ekranda "şeker"
    >>> decomposed == "şeker", normalize_nfc(decomposed) == "şeker"
    (False, True)
"""

from __future__ import annotations

import unicodedata

_ALPHABET = "abcçdefgğhıijklmnoöprsştuüvyz"
_RANK = {letter: index for index, letter in enumerate(_ALPHABET)}
_FOREIGN_RANK = {"q": _RANK["p"] + 0.5, "w": _RANK["v"] + 0.5, "x": _RANK["v"] + 0.6}


def upper_tr(text: str) -> str:
    """Türkçe kurallarıyla büyük harf: i → İ, ı → I."""
    return text.replace("i", "İ").replace("ı", "I").upper()


def lower_tr(text: str) -> str:
    """Türkçe kurallarıyla küçük harf: I → ı, İ → i."""
    return text.replace("I", "ı").replace("İ", "i").lower()


def capitalize_tr(word: str) -> str:
    """İlk harf büyük, gerisi küçük (Türkçe kurallarıyla)."""
    return upper_tr(word[:1]) + lower_tr(word[1:])


def title_tr(text: str) -> str:
    """Her kelimenin ilk harfi büyük; boşluklar korunur."""
    return " ".join(capitalize_tr(word) for word in text.split(" "))


def normalize_nfc(text: str) -> str:
    """Birleşik biçime normalleştirir: "s" + U+0327 → "ş". Karşılaştırmadan önce kullanın."""
    return unicodedata.normalize("NFC", text)


def casefold_tr(text: str) -> str:
    """Harf duyarsız karşılaştırma anahtarı (Türkçe i/ı kuralı + NFC)."""
    return normalize_nfc(lower_tr(normalize_nfc(text))).casefold()


def equals_ignore_case_tr(a: str, b: str) -> bool:
    """İki metin, büyük/küçük harf farkı dışında aynı mı? ("İSTANBUL" == "istanbul")."""
    return casefold_tr(a) == casefold_tr(b)


def utf8_length(text: str) -> int:
    """Metnin UTF-8 bayt uzunluğu (len() ise kod noktası sayar)."""
    return len(text.encode("utf-8"))


def _rank(char: str) -> tuple[float, int]:
    """(birincil sıra, şapka işareti): şapka yalnız eşitlikte ikinci düzeyde sayılır."""
    if char in _RANK:
        return 100 + _RANK[char], 0
    if char in _FOREIGN_RANK:
        return 100 + _FOREIGN_RANK[char], 0
    base = unicodedata.normalize("NFD", char)[0]  # â → a, î → i, û → u
    if base != char and base in _RANK:
        return 100 + _RANK[base], 1  # "kâr" birincil düzeyde "kar" ile eşit, ondan hemen sonra
    if ord(char) < 100:  # boşluk, rakam, noktalama: harflerden önce, kendi sıralarıyla
        return ord(char), 0
    return 200 + ord(char), 0  # diğer her şey en sonda, kod noktası sırasıyla


def sort_key_tr(text: str) -> tuple[tuple[float, ...], tuple[int, ...], str]:
    """Türk alfabesi sırasıyla (harf duyarsız) sıralama anahtarı: `sorted(x, key=sort_key_tr)`.

    Üç düzey: (1) harfler alfabe sırasıyla, büyük/küçük ve şapka yok sayılarak; (2) şapka;
    (3) eşitlik sürerse metnin kendisi (büyük harf önce).
    """
    ranks = [_rank(char) for char in lower_tr(normalize_nfc(text))]
    return tuple(r for r, _ in ranks), tuple(accent for _, accent in ranks), text
