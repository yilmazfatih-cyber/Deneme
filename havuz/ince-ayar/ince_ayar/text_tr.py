"""Türkçe'ye duyarlı metin yardımcıları: büyük/küçük harf, eşleştirme için sadeleştirme.

Kim kullanır: ölçütler (tam eşleşme, ROUGE-L), yineleme ayıklama, dil sezgisi, etiket işleme.
Python'un `str.lower()` / `str.upper()` çağrıları Türkçe'de yanlıştır ("I".lower() == "i",
"İ".lower() iki karakter üretir). Bu yüzden paketin başka hiçbir yerinde bu çağrılar kullanılmaz;
`tests/test_rules.py` bunu denetler. ASCII tanımlayıcılar (uzantı, lisans kodu) için `lower_ascii`.

Genişletme: yeni bir sadeleştirme adımı gerekiyorsa `fold_for_match` içine ekleyin ve
`tests/test_text_tr.py` dosyasına örnek yazın.
"""

from __future__ import annotations

import re
import unicodedata

_WHITESPACE = re.compile(r"\s+")
_NOT_WORD = re.compile(r"[^\w\s]", re.UNICODE)
# Aksan katlama: "şeker" ile "seker" yineleme ayıklamada aynı sayılır.
_ASCII_FOLD = str.maketrans("çğıöşüâîû", "cgiosuaiu")


def lower_tr(text: str) -> str:
    """Türkçe küçük harf: I → ı, İ → i."""
    return text.replace("I", "ı").replace("İ", "i").lower()


def upper_tr(text: str) -> str:
    """Türkçe büyük harf: i → İ, ı → I."""
    return text.replace("i", "İ").replace("ı", "I").upper()


def lower_ascii(text: str) -> str:
    """Yalnız ASCII tanımlayıcılar için (dosya uzantısı, lisans kodu, rol adı)."""
    return text.lower()


def collapse_spaces(text: str) -> str:
    """Art arda boşlukları tek boşluğa indirir, uçları kırpar."""
    return _WHITESPACE.sub(" ", text).strip()


def normalize_for_metric(text: str) -> str:
    """Ölçüt karşılaştırması için: NFC + Türkçe küçük harf + noktalama silme + boşluk sadeleştirme."""
    text = unicodedata.normalize("NFC", text)
    text = lower_tr(text)
    text = _NOT_WORD.sub(" ", text)
    return collapse_spaces(text)


def fold_for_match(text: str) -> str:
    """Yineleme ayıklama için saldırgan sadeleştirme.

    `normalize_for_metric` adımlarına ek olarak noktalı/noktasız i ayrımını ve Türkçe aksanları
    kaldırır; böylece "İSTANBUL", "Istanbul" ve "istanbul" aynı anahtara düşer. Yanlış birleştirme
    yalnız iki örneği aynı tarafa koyar; sızıntıya yol açmaz.
    """
    text = unicodedata.normalize("NFKC", text)
    text = lower_tr(text).translate(_ASCII_FOLD)
    text = _NOT_WORD.sub(" ", text)
    return collapse_spaces(text)


def words(text: str) -> list[str]:
    """Ölçütler için sözcüklere ayırır (sadeleştirilmiş metin üzerinde)."""
    normalized = normalize_for_metric(text)
    return normalized.split(" ") if normalized else []
