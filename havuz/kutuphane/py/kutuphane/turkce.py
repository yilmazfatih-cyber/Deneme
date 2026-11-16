"""turkce — Türkçe metin işlemleri: büyük/küçük harf, başlık biçimi, ASCII'ye indirgeme, arama anahtarı,
kısa ad (slug), Türk alfabesine göre sıralama, heceleme ve ünlü uyumu yardımcıları.

Neden var: `"i".upper()` → "I", `"I".lower()` → "i" ve `"İ".lower()` → "i" + U+0307 (iki karakter!) Türkçe için
YANLIŞTIR; `sorted()` ise ç/ğ/ı/ö/ş/ü harflerini z'den sonraya atar. Buradaki işlevler `locale` ayarına bağlı
DEĞİLDİR; her makinede ve TypeScript eşinde aynı sonucu verir.

Kullanım:
    upper_tr("istanbul")                         # "İSTANBUL"
    lower_tr("IŞIK")                             # "ışık"
    title_case_tr("İSTANBUL VE ANKARA")          # "İstanbul ve Ankara"
    sorted(["zil", "çay", "cam"], key=sort_key_tr)   # ["cam", "çay", "zil"]
    normalize_for_search("ŞİŞLİ") == normalize_for_search("sisli")   # True
    slugify("Çağrı Merkezi – İletişim")          # "cagri-merkezi-iletisim"
    syllabify("merhaba")                         # ["mer", "ha", "ba"]

Sınırlar: Sıralama yalnız Latin/Türk harflerini alfabe sırasına koyar; başka yazılar kod noktası sırasıyla sona
gider. Heceleme yazıma bakar (TDK kuralı: iki ünlü arasındaki son ünsüz sonraki heceye geçer); birleşik sözcükleri
("ilkokul" → il-ko-kul) da bu kurala göre böler. Ünlü uyumu yardımcıları "saat, rol, Kemal" gibi ince okunan
istisnaları bilmez (ek getirmek için `ek` modülünü kullanın).

Genişletme: Yeni bir harf eşlemesi `_FOLD_MAP`'e, yeni küçük sözcük `_SMALL_WORDS`'e eklenir. Her yeni işlev için
`vektorler/turkce.json` dosyasına örnek ekleyin; aynı örnek TypeScript eşini de sınar.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable, Sequence
from typing import Literal, TypeVar

__all__ = [
    "ascii_fold",
    "capitalize_tr",
    "compare_tr",
    "count_syllables",
    "ends_with_voiceless",
    "ends_with_vowel",
    "equals_ignore_case_tr",
    "harmony_four_way",
    "harmony_two_way",
    "has_vowel_harmony",
    "hyphenate",
    "is_vowel",
    "last_vowel",
    "lower_tr",
    "normalize_for_search",
    "slugify",
    "sort_key_tr",
    "sort_tr",
    "syllabify",
    "title_case_tr",
    "upper_tr",
]

T = TypeVar("T")

_LOWER_ALPHABET = "abcçdefgğhıijklmnoöpqrsştuüvwxyz"
_UPPER_ALPHABET = "ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZ"
_VOWELS = "aeıioöuüâîû"
_FRONT_VOWELS = "eiöüî"
_VOICELESS = "çfhkpsşt"
_PUNCTUATION = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"
# Boşluk sayılan karakterler (JS `\s` ile Python `isspace` farklı olduğundan liste açık yazıldı).
_SPACES = (
    " \t\n\r\x0b\x0c\xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008"
    "\u2009\u200a\u2028\u2029\u202f\u205f\u3000"
)
_APOSTROPHES = "'\u2019"
_COMBINING_MARKS = re.compile("[\u0300-\u036f]")
# "i" + birleşik nokta (U+0307): `"İ".lower()` çıktısı; tek bir "i" sayılır.
_DOTTED_I_ARTIFACT = "i\u0307"

# TDK: başlıklarda özel ada dâhil olmayan bu sözcükler küçük yazılır.
_SMALL_WORDS = frozenset(
    {"ve", "ile", "ya", "veya", "yahut", "ki", "da", "de", "mı", "mi", "mu", "mü"}
)

_FOLD_MAP = {
    "ç": "c", "Ç": "C", "ğ": "g", "Ğ": "G", "ı": "i", "İ": "I", "ö": "o", "Ö": "O",
    "ş": "s", "Ş": "S", "ü": "u", "Ü": "U", "ß": "ss", "æ": "ae", "Æ": "AE", "œ": "oe",
    "Œ": "OE", "ø": "o", "Ø": "O", "đ": "d", "Đ": "D", "ł": "l", "Ł": "L",
    "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2013": "-", "\u2014": "-",
    "\u2026": "...", "\xa0": " ",
}  # fmt: skip


# ---------------------------------------------------------------------------------------------
# Büyük / küçük harf
# ---------------------------------------------------------------------------------------------


def upper_tr(text: str) -> str:
    """Türkçe kuralla büyük harfe çevirir: i → İ, ı → I."""
    prepared = text.replace(_DOTTED_I_ARTIFACT, "İ").replace("i", "İ").replace("ı", "I")
    return prepared.upper()  # harf: i/ı önce elle çevrildi


def lower_tr(text: str) -> str:
    """Türkçe kuralla küçük harfe çevirir: İ → i, I → ı. "i + birleşik nokta" artığını da temizler."""
    prepared = text.replace("I\u0307", "i").replace("İ", "i").replace("I", "ı")
    return prepared.lower().replace(_DOTTED_I_ARTIFACT, "i")  # harf: İ/I önce elle çevrildi


def capitalize_tr(text: str) -> str:
    """Yalnız ilk harfi büyütür, gerisine dokunmaz: "istanbul" → "İstanbul", "iPhone" → "İPhone"."""
    if text == "":
        return ""
    first = _DOTTED_I_ARTIFACT if text.startswith(_DOTTED_I_ARTIFACT) else text[0]
    return upper_tr(first) + text[len(first) :]


def _is_word_char(ch: str) -> bool:
    return ch != "" and (ch.isalnum() or unicodedata.category(ch).startswith("M"))


def title_case_tr(text: str, *, small_words: bool = True) -> str:
    """Başlık biçimi: her sözcüğün ilk harfi büyük, gerisi küçük.

    Kesme işaretinden sonrası küçük kalır ("ANKARA'DA" → "Ankara'da"). `small_words=True` (varsayılan) iken
    "ve, ile, de, mi…" küçük yazılır (ilk sözcük hariç).
    """
    out: list[str] = []
    word_index = 0
    i = 0
    n = len(text)
    while i < n:
        if not _is_word_char(text[i]):
            out.append(text[i])
            i += 1
            continue
        j = i
        while j < n:
            joins_next = text[j] in _APOSTROPHES and j + 1 < n and _is_word_char(text[j + 1])
            if not _is_word_char(text[j]) and not joins_next:
                break
            j += 1
        word = lower_tr(text[i:j])
        keep_small = small_words and word_index > 0 and word in _SMALL_WORDS
        out.append(word if keep_small else capitalize_tr(word))
        word_index += 1
        i = j
    return "".join(out)


def equals_ignore_case_tr(a: str, b: str) -> bool:
    """Büyük/küçük harf ayrımı yapmadan (Türkçe kuralla) eşitlik: "İSTANBUL" ile "istanbul" eşittir."""
    return lower_tr(unicodedata.normalize("NFC", a)) == lower_tr(unicodedata.normalize("NFC", b))


# ---------------------------------------------------------------------------------------------
# ASCII'ye indirgeme, arama anahtarı, kısa ad
# ---------------------------------------------------------------------------------------------


def ascii_fold(text: str) -> str:
    """Türkçe ve Latin işaretli harfleri ASCII karşılığına indirger: "Çağrı" → "Cagri"."""
    out: list[str] = []
    for ch in unicodedata.normalize("NFC", text):
        mapped = _FOLD_MAP.get(ch)
        if mapped is not None:
            out.append(mapped)
        elif ord(ch) < 0x80:
            out.append(ch)
        else:
            stripped = _COMBINING_MARKS.sub("", unicodedata.normalize("NFD", ch))
            out.append(stripped if stripped.isascii() else ch)
    return "".join(out)


def normalize_for_search(text: str) -> str:
    """Arama/karşılaştırma anahtarı: büyük-küçük harf, işaret (ç/c, ş/s…) ve İ/ı farkını yok eder.

    "ISPARTA", "ısparta", "İsparta" → "isparta". Boşlukları da sadeleştirir. Aramada iki tarafı da bu
    işlevden geçirin.
    """
    out: list[str] = []
    pending_space = False
    for ch in ascii_fold(lower_tr(unicodedata.normalize("NFC", text))):
        if ch in _SPACES:
            pending_space = bool(out)
        else:
            if pending_space:
                out.append(" ")
            out.append(ch)
            pending_space = False
    return "".join(out)


def slugify(text: str, *, separator: str = "-", max_length: int | None = None) -> str:
    """URL/dosya adı için kısa ad: "Çağrı Merkezi – İletişim" → "cagri-merkezi-iletisim"."""
    words = [w for w in re.split("[^a-z0-9]+", normalize_for_search(text).replace("'", "")) if w]
    slug = separator.join(words)
    if max_length is not None and len(slug) > max_length:
        cut = slug[:max_length]
        cuts_word = separator != "" and not slug.startswith(separator, max_length)
        last_separator = cut.rfind(separator)
        slug = cut[:last_separator] if cuts_word and last_separator > 0 else cut
        while separator != "" and slug.endswith(separator):
            slug = slug[: -len(separator)]
    return slug


# ---------------------------------------------------------------------------------------------
# Türk alfabesine göre sıralama
# ---------------------------------------------------------------------------------------------


def _collation_element(ch: str) -> tuple[str, str, str]:
    lower = _LOWER_ALPHABET.find(ch)
    if lower != -1:
        return (chr(0x41 + lower), "0", "0")
    upper = _UPPER_ALPHABET.find(ch)
    if upper != -1:
        return (chr(0x41 + upper), "0", "1")
    if "0" <= ch <= "9":
        return (ch, "0", "0")
    if ch in _SPACES:
        return ("\x01", "0", "0")
    punctuation = _PUNCTUATION.find(ch)
    if punctuation != -1:
        return (chr(0x02 + punctuation), "0", "0")
    code = ord(ch)
    if code < 0x20 or code == 0x7F:
        return ("", "", "")
    if ch == "ß":
        return (_collation_element("s")[0] * 2, "11", "00")
    base = unicodedata.normalize("NFD", ch)[0]
    if base != ch and (base in _LOWER_ALPHABET or base in _UPPER_ALPHABET):
        primary, _, tertiary = _collation_element(base)
        return (primary, "1", tertiary)  # şapkalı/aksanlı harf: temel harfle aynı yerde
    return (ch, "0", "0")


def sort_key_tr(text: str, *, numeric: bool = False) -> str:
    """Türk alfabesi sırasını veren anahtar: `sorted(adlar, key=sort_key_tr)`.

    Sıra: boşluk/noktalama < rakam < harf (a b c ç d … z) < öteki yazılar; eşitlikte şapkasız önce, sonra
    küçük harf önce. `numeric=True` → "Sokak 2" < "Sokak 10".
    """
    chars = unicodedata.normalize("NFC", text)
    primary: list[str] = []
    secondary: list[str] = []
    tertiary: list[str] = []
    i = 0
    while i < len(chars):
        ch = chars[i]
        if numeric and "0" <= ch <= "9":
            j = i
            while j < len(chars) and "0" <= chars[j] <= "9":
                j += 1
            digits = chars[i:j].lstrip("0") or "0"
            primary.append(chr(0x30 + min(len(digits), 16)) + digits)
            secondary.append("0")
            tertiary.append("0")
            i = j
            continue
        p, s, t = _collation_element(ch)
        primary.append(p)
        secondary.append(s)
        tertiary.append(t)
        i += 1
    return "".join(primary) + "\x00" + "".join(secondary) + "\x00" + "".join(tertiary)


def compare_tr(a: str, b: str, *, numeric: bool = False) -> int:
    """İki metni Türk alfabesine göre karşılaştırır: -1, 0 ya da 1 döner."""
    key_a = (sort_key_tr(a, numeric=numeric), a)
    key_b = (sort_key_tr(b, numeric=numeric), b)
    return 0 if key_a == key_b else (-1 if key_a < key_b else 1)


def sort_tr(
    items: Sequence[T], *, by: Callable[[T], str] | None = None, numeric: bool = False
) -> list[T]:
    """Yeni bir liste döndürerek Türkçe sıralar. Nesnelerde alan seçimi: `sort_tr(kisiler, by=lambda k: k.ad)`."""

    def key(item: T) -> tuple[str, str]:
        text = by(item) if by is not None else str(item)
        return (sort_key_tr(text, numeric=numeric), text)

    return sorted(items, key=key)


# ---------------------------------------------------------------------------------------------
# Heceleme
# ---------------------------------------------------------------------------------------------


def is_vowel(ch: str) -> bool:
    """Tek bir harf ünlü mü? (a e ı i o ö u ü ve şapkalıları; büyük harf de olur)"""
    return ch != "" and lower_tr(ch) in _VOWELS


def syllabify(word: str) -> list[str]:
    """Bir sözcüğü hecelerine ayırır: "merhaba" → ["mer", "ha", "ba"], "saat" → ["sa", "at"].

    Kesme işareti bulunduğu hecede kalır: "Ankara'ya" → ["An", "ka", "ra'", "ya"].
    """
    chars = unicodedata.normalize("NFC", word)
    if not chars:
        return []
    vowel_at = [index for index, ch in enumerate(chars) if is_vowel(ch)]
    starts = [0]
    for v in range(1, len(vowel_at)):
        position = vowel_at[v]
        previous_vowel = vowel_at[v - 1]
        k = position - 1
        while k > previous_vowel and chars[k] in _APOSTROPHES:
            k -= 1
        # Öndeki ünsüz bu heceye geçer; ünlü ünlüye bitişikse tam arada bölünür.
        starts.append(k if k > previous_vowel else position)
    ends = [*starts[1:], len(chars)]
    return [chars[start:end] for start, end in zip(starts, ends, strict=True)]


def hyphenate(text: str, separator: str = "-") -> str:
    """Metindeki her sözcüğü heceleyip araya ayırıcı koyar: "merhaba dünya" → "mer-ha-ba dün-ya"."""
    parts = re.split("([ \t\n\r]+)", text)
    return "".join(
        part if re.fullmatch("[ \t\n\r]*", part) else separator.join(syllabify(part))
        for part in parts
    )


def count_syllables(word: str) -> int:
    """Hece sayısı (ünlü sayısı). Ünlüsüz ama dolu bir sözcük 1 hece sayılır."""
    return len(syllabify(word))


# ---------------------------------------------------------------------------------------------
# Ünlü uyumu yardımcıları
# ---------------------------------------------------------------------------------------------


def _letters(word: str) -> list[str]:
    return [ch for ch in lower_tr(unicodedata.normalize("NFC", word)) if ch.isalpha()]


def last_vowel(word: str) -> str | None:
    """Sözcüğün son ünlüsü (küçük harf, şapkasız); ünlü yoksa `None`."""
    for ch in reversed(_letters(word)):
        if ch in _VOWELS:
            return {"â": "a", "î": "i", "û": "u"}.get(ch, ch)
    return None


def harmony_two_way(word: str) -> Literal["e", "a"]:
    """İki biçimli ekler (-ler/-lar, -de/-da) için ünlü: son ünlü ince ise "e", kalın ise "a"."""
    vowel = last_vowel(word)
    return "e" if vowel is None or vowel in _FRONT_VOWELS else "a"


def harmony_four_way(word: str) -> Literal["i", "ı", "u", "ü"]:
    """Dört biçimli ekler (-i/-ı/-u/-ü) için ünlü. Ünlü yoksa "i"."""
    vowel = last_vowel(word)
    if vowel in ("a", "ı"):
        return "ı"
    if vowel in ("o", "u"):
        return "u"
    if vowel in ("ö", "ü"):
        return "ü"
    return "i"


def ends_with_vowel(word: str) -> bool:
    """Sözcük ünlüyle mi bitiyor?"""
    letters = _letters(word)
    return bool(letters) and is_vowel(letters[-1])


def ends_with_voiceless(word: str) -> bool:
    """Sözcük sert (ötümsüz) ünsüzle mi bitiyor? (f, s, t, k, ç, ş, h, p — "fıstıkçı şahap")"""
    letters = _letters(word)
    return bool(letters) and letters[-1] in _VOICELESS


def has_vowel_harmony(word: str) -> bool:
    """Büyük ünlü uyumu: bütün ünlüler ya ince ya kalın mı? ("kitap" → False, "okul" → True)"""
    vowels = [ch for ch in _letters(word) if ch in _VOWELS]
    front = sum(1 for ch in vowels if ch in _FRONT_VOWELS)
    return front in (0, len(vowels))
