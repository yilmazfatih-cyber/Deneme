"""Türkçe'ye duyarlı metin temizleme (dizinlemeden önce).

Yapılanlar: Unicode NFC; görünmez karakterler ve yumuşak tire atılır; satır sonunda bölünmüş
kelimeler birleştirilir ("bel-\\ngeler" → "belgeler", yalnız küçük harfle devam ediyorsa);
"Sayfa 3 / 10" gibi sayfa numarası satırları ve aynı satırın 3+ kez tekrarı (üst/alt bilgi)
atılır; boşluklar sadeleştirilir, paragraf (boş satır) sınırları korunur.
Kim kullanır: rag/yukleyici.py.
Genişletme: yeni bir temizlik kuralı → `metni_temizle` içine sırayla ekleyin ve
tests/test_rag_yukle.py'ye örnek yazın.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter

_GORUNMEZ = re.compile("[\u00ad\u200b\u200c\u200d\u2060\ufeff]")
_SAYFA_NO = re.compile(r"^\s*(?:sayfa\s*)?\d{1,4}\s*(?:/|-|of)?\s*\d{0,4}\s*$", re.IGNORECASE)
_BOLUNMUS = re.compile(r"(\w)-\n[ \t]*([a-zçğıöşü])")


def metni_temizle(metin: str) -> str:
    """Dizinleme için metni temizler (anlamı değiştirmeden)."""
    metin = unicodedata.normalize("NFC", metin).replace("\r\n", "\n").replace("\r", "\n")
    metin = _GORUNMEZ.sub("", metin).replace("\t", " ").replace("\u00a0", " ")
    metin = _BOLUNMUS.sub(r"\1\2", metin)
    satirlar = metin.split("\n")
    tekrar = Counter(s.strip() for s in satirlar if len(s.strip()) > 3)
    temiz: list[str] = []
    for satir in satirlar:
        duz = satir.strip()
        if _SAYFA_NO.match(duz) and duz:
            continue
        if duz and tekrar[duz] >= 3 and not duz.startswith(("#", "-", "*", "|")):
            continue  # tekrarlanan üst/alt bilgi
        temiz.append(re.sub(r" {2,}", " ", satir.rstrip()))
    return re.sub(r"\n{3,}", "\n\n", "\n".join(temiz)).strip()
