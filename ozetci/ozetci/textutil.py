"""Türkçe'ye saygılı metin yardımcıları.

Python'un ``str.upper()`` / ``str.lower()`` çağrıları İngilizce kurallarını uygular;
``"istanbul".upper()`` -> ``"ISTANBUL"`` olur, oysa Türkçe'de ``"İSTANBUL"`` beklenir.
Bu modül ``i <-> İ`` ve ``ı <-> I`` eşlemesini doğru yapar ve PDF/OCR çıktısını temizler.
"""

from __future__ import annotations

import re
import unicodedata

_TR_UPPER = str.maketrans({"i": "İ", "ı": "I"})
_TR_LOWER = str.maketrans({"İ": "i", "I": "ı"})

# Yaygın OCR/PDF bitişik harf (ligature) ve tırnak sorunları
_LIGATURES = str.maketrans(
    {
        "ﬁ": "fi",
        "ﬂ": "fl",
        "ﬀ": "ff",
        "ﬃ": "ffi",
        "ﬄ": "ffl",
        " ": " ",  # kırılmaz boşluk
        "’": "'",
        "‘": "'",
        "“": '"',
        "”": '"',
        "­": "",  # yumuşak tire
    }
)

_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u200b-\u200d\u2060\ufeff]")
_SPACES_RE = re.compile(r"[ \t]+")
_MANY_NEWLINES_RE = re.compile(r"\n{3,}")
# "kelime-\nler" -> "kelimeler"; ama "e-\nposta", "2-\n3" gibi tek harf/rakam öneklerinde tire korunur
_HYPHEN_BREAK_RE = re.compile(r"(?<![\s\d])(\w{2,})-\n(?=[a-zçğıöşü])")
_HYPHEN_KEEP_RE = re.compile(r"(\b\w|\d)-\n(?=[\wçğıöşü])")
_FIELD_LINE_RE = re.compile(r"^[^:|]{1,40}:\s*\S")
_SENTENCE_END = ".!?…:;\"')»”"
# Bu uzunluğun altındaki satırlar (form alanı, başlık, tablo satırı) sonrakiyle birleştirilmez
_MIN_PROSE_LINE = 30

_TR_STOPWORDS = {
    "ve", "bir", "bu", "için", "ile", "de", "da", "çok", "daha", "olarak", "gibi", "ama", "en",
    "ne", "ki", "her", "mi", "mı", "mu", "mü", "var", "yok", "ben", "sen", "biz", "siz", "onlar",
    "şu", "o", "olan", "kadar", "sonra", "önce", "ise", "veya", "ya", "hem", "ancak", "fakat",
}
_EN_STOPWORDS = {
    "the", "and", "of", "to", "a", "in", "is", "it", "that", "for", "on", "with", "as", "are",
    "this", "be", "by", "or", "an", "was", "we", "you", "at", "from", "have", "has", "not",
}
_TR_CHARS = set("çğıöşüÇĞİÖŞÜ")


def tr_upper(text: str) -> str:
    """Türkçe kurallarıyla büyük harf: ``i -> İ``, ``ı -> I``."""
    return text.translate(_TR_UPPER).upper()


def tr_lower(text: str) -> str:
    """Türkçe kurallarıyla küçük harf: ``İ -> i``, ``I -> ı``."""
    return text.translate(_TR_LOWER).lower()


def tr_capitalize(text: str) -> str:
    if not text:
        return text
    return tr_upper(text[0]) + text[1:]


def clean_text(text: str) -> str:
    """Kontrol karakterlerini, bitişik harfleri ve aşırı boşlukları temizler (NFC)."""
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    text = text.translate(_LIGATURES)
    text = _CONTROL_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _SPACES_RE.sub(" ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    text = _MANY_NEWLINES_RE.sub("\n\n", text)
    return text.strip()


def reflow(text: str) -> str:
    """PDF'ten gelen sert satır sonlarını paragraf içinde birleştirir.

    Satır sonu tireleri (``kelime-\\nler``) kaldırılır; cümle sonu noktalaması olmayan
    satırlar bir sonraki satırla birleştirilir. Boş satır paragraf sınırı sayılır.
    """
    text = clean_text(text)
    text = _HYPHEN_BREAK_RE.sub(r"\1", text)
    text = _HYPHEN_KEEP_RE.sub(r"\1-", text)
    paragraphs = []
    for para in text.split("\n\n"):
        lines = [ln for ln in para.split("\n") if ln]
        if not lines:
            continue
        out: list[str] = []
        for ln in lines:
            prev = out[-1] if out else ""
            if prev and len(prev) >= _MIN_PROSE_LINE and not prev.endswith(tuple(_SENTENCE_END)) and not _looks_like_list_item(ln) and not _is_structural(prev, ln):
                out[-1] = prev + " " + ln
            else:
                out.append(ln)
        paragraphs.append("\n".join(out))
    return "\n\n".join(paragraphs)


def _is_structural(prev: str, line: str) -> bool:
    """Tablo satırı (|), Markdown başlığı (#) ya da 'Alan: değer' satırları birleştirilmez."""
    if prev.startswith(("|", "#")) or line.startswith(("|", "#")):
        return True
    return bool(_FIELD_LINE_RE.match(line))


def _looks_like_list_item(line: str) -> bool:
    return bool(re.match(r"^([-*•·▪]|\d+[.)]|[a-zA-Z][.)])\s+", line))


def detect_language(text: str) -> str:
    """Kaba dil sezimi: ``'tr'``, ``'en'`` veya ``'unknown'``.

    Türkçe'ye özgü harfler ve en sık işlev kelimeleri sayılır; harici bağımlılık yok.
    """
    if not text:
        return "unknown"
    sample = text[:20000]
    raw_words = re.findall(r"[^\W\d_]+", sample)
    if not raw_words:
        return "unknown"
    words = [tr_lower(w) for w in raw_words]
    tr_hits = sum(1 for w in words if w in _TR_STOPWORDS)
    en_hits = sum(1 for w in words if w in _EN_STOPWORDS)
    # özel adlar (Ayşe, Çankaya) dil kanıtı sayılmaz: yalnızca küçük harfle başlayan kelimeler
    lower_words = [w for w in raw_words if w[0].islower()]
    tr_char_words = sum(1 for w in lower_words if any(ch in _TR_CHARS for ch in w))
    tr_char_count = sum(1 for w in lower_words for ch in w if ch in _TR_CHARS)
    letters = sum(len(w) for w in raw_words)
    # Türkçe metinde harflerin ~%5'i, kelimelerin ~%30'u ç/ğ/ı/ö/ş/ü içerir; İngilizce metinde ~%0.
    # Uzun İngilizce yasal uyarı bile Türkçe gövdenin bu izini silemez.
    if tr_hits >= 1 and (tr_char_words / len(words) >= 0.08 or tr_char_count / max(letters, 1) >= 0.01):
        return "tr"
    score_tr = tr_hits + tr_char_words * 0.5
    score_en = en_hits
    if score_tr == 0 and score_en == 0:
        return "unknown"
    if score_tr >= score_en:
        return "tr"
    return "en"


def stopwords(lang: str) -> set[str]:
    if lang == "tr":
        return _TR_STOPWORDS
    if lang == "en":
        return _EN_STOPWORDS
    return _TR_STOPWORDS | _EN_STOPWORDS


def alpha_ratio(text: str) -> float:
    """Boşluk dışı karakterler içinde harf oranı."""
    chars = [c for c in text if not c.isspace()]
    if not chars:
        return 0.0
    return sum(1 for c in chars if c.isalpha()) / len(chars)


def alnum_ratio(text: str) -> float:
    """Boşluk dışı karakterler içinde harf+rakam oranı (OCR gerekip gerekmediğini anlamak için)."""
    chars = [c for c in text if not c.isspace()]
    if not chars:
        return 0.0
    return sum(1 for c in chars if c.isalnum()) / len(chars)


def truncate_words(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]) + " …"
