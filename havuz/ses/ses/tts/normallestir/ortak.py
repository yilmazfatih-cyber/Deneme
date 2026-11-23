"""Normalizasyon kurallarının ortak parçaları: `Kural` kaydı, düzenli ifade parçaları, sayı okuma.

`SAYI` düzenli ifadesi Türkçe biçimi tanır: binlik nokta ("1.234.567"), ondalık virgül ("3,14"); nokta
ile yazılmış ondalık ("2.5") da tanınır ve "iki nokta beş" diye okunur (Türkçede ondalık ayırıcı
virgüldür; "2.5" çoğunlukla yabancı kaynaktan gelir). Üçlü gruplu "1.500" her zaman bin beş yüzdür.
`EK`: kesme işaretinden sonraki ek ("'de", "'ye", "'NİN"); okunuşa göre `ek.ek_uyumla` ile uyumlanır.
Kim kullanır: sayi_kurallari.py, metin_kurallari.py. Genişletme: ortak bir okuma işlevi gerekiyorsa
buraya ekleyin ve tests/test_normallestir.py'de sınayın.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from ses.metin import kucuk_tr
from ses.tts.normallestir.ek import ek_uyumla
from ses.tts.normallestir.sayi_yazi import decimal_to_words, number_to_words

SAYI = r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d+|\d+\.\d+|\d+"
EK = r"(?:'(?P<ek>[a-zçğıöşüA-ZÇĞİÖŞÜ]+))?"
SONU_SAYI_DEGIL = r"(?!\d|[.,]\d)"
RAKAMLAR = ("sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz")
AYLAR = ("", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül",
         "Ekim", "Kasım", "Aralık")  # fmt: skip


@dataclass(frozen=True)
class Kural:
    """Bir normalizasyon kuralı: ad (ayrıntı çıktısında görünür), desen ve dönüştürücü işlev."""

    ad: str
    desen: re.Pattern[str]
    isle: Callable[[re.Match[str]], str]


def rakam_rakam(rakamlar: str) -> str:
    """Rakamları tek tek okur: "007" → "sıfır sıfır yedi"."""
    return " ".join(RAKAMLAR[int(r)] for r in rakamlar if r.isdigit())


def sayi_oku(metin: str) -> str:
    """`SAYI` desenine uyan metni okur: "1.234,5" → "bin iki yüz otuz dört virgül beş"."""
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?", metin):
        metin = metin.replace(".", "")
    if "," in metin:
        return decimal_to_words(metin)
    if "." in metin:
        return decimal_to_words(metin.replace(".", ",")).replace("virgül", "nokta")
    if len(metin.lstrip("0")) > 21:
        return rakam_rakam(metin)
    return number_to_words(metin)


def ekle(okunus: str, eslesme: re.Match[str], *, iyelikli: bool = False) -> str:
    """Okunuşa, eşleşmedeki (varsa) kesme işaretli eki uyumlayarak ekler."""
    ek = eslesme.groupdict().get("ek")
    return ek_uyumla(okunus, kucuk_tr(ek), iyelikli=iyelikli) if ek else okunus
