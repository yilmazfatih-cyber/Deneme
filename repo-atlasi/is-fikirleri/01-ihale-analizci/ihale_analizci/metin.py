"""Türkçe metin yardımcıları.

Python'un str.lower() işlevi Türkçeyi bilmez: "I".lower() == "i" (doğrusu "ı"),
"İ".lower() ise iki karakter ("i" + birleşik nokta) döndürür. Anahtar kelime
eşleştirmesi bu yüzden kendi küçültme ve katlama işlevlerimizle yapılır.
"""

import re
import unicodedata

_ASCII_KATLA = str.maketrans("çğıöşüâîû", "cgiosuaiu")

# PDF ve Word metninde aynı işaretin farklı biçimleri: kesme ve tırnak türleri, tireler.
# Görünmez karakterler (yumuşak tire, sıfır genişlikli boşluklar, BOM) silinir; kaynakta
# bilerek kaçış dizisiyle yazılmıştır.
_ISARET_KATLA = str.maketrans(
    {
        "\u2019": "'",
        "\u2018": "'",
        "\u02bc": "'",
        "\u00b4": "'",
        "`": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u201e": '"',
        "\u00ab": '"',
        "\u00bb": '"',
        "\u2010": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2212": "-",
        "\u00ad": None,
        "\u200b": None,
        "\u200c": None,
        "\u200d": None,
        "\u2060": None,
        "\ufeff": None,
    }
)

# Uzun satırları cümlelere bölmek için: nokta/soru/ünlemden sonra büyük harf
# ya da rakamla başlayan yeni cümle. "15.12.2026" gibi tarihler boşluk
# içermediği için bölünmez.
_CUMLE_SINIRI = re.compile(r"(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9(])")

# Yazıyla sayılar (katlanmış metinde): "üç" → "uc", "on beş", "yirmi", "iki buçuk".
_BIRLER = {"bir": 1, "iki": 2, "uc": 3, "dort": 4, "bes": 5, "alti": 6, "yedi": 7, "sekiz": 8, "dokuz": 9}
_ONLAR = {
    "on": 10,
    "yirmi": 20,
    "otuz": 30,
    "kirk": 40,
    "elli": 50,
    "altmis": 60,
    "yetmis": 70,
    "seksen": 80,
    "doksan": 90,
}
_ON = "|".join(_ONLAR)
_BIR = "|".join(_BIRLER)
# Rakamla ("3", "0,5") ya da yazıyla ("on beş", "iki buçuk", "yüz") bir sayı; katlanmış metinde kullanılır.
SAYI = rf"(?:\d+(?:[.,]\d+)?|(?:(?:{_ON})(?: (?:{_BIR}))?|{_BIR}|yuz)(?: bucuk)?)\b"


def tr_kucuk(metin: str) -> str:
    """Türkçe kurallarıyla küçük harf; uzunluğu korur (I→ı, İ→i)."""
    return metin.replace("I", "ı").replace("İ", "i").lower()


def katla(metin: str) -> str:
    """Eşleştirme anahtarı: uyumluluk normalleştirmesi + Türkçe küçük harf + aksansız + tek boşluk.

    PDF'den bozuk çıkan "gecici teminat" ile "GEÇİCİ TEMİNAT" aynı anahtara düşer;
    PDF'deki bitişik "fi" harfi (U+FB01) "fi" olur, ’ (U+2019) ile ' aynı sayılır.
    """
    metin = unicodedata.normalize("NFKC", metin).translate(_ISARET_KATLA)
    metin = tr_kucuk(metin).translate(_ASCII_KATLA)
    return re.sub(r"\s+", " ", metin).strip()


def sayi_coz(ham: str) -> float | None:
    """SAYI kalıbıyla yakalanan metni sayıya çevirir: "3" → 3, "0,5" → 0.5, "on bes" → 15, "iki bucuk" → 2.5."""
    ham = ham.strip()
    if ham[:1].isdigit():
        try:
            return float(ham.replace(",", "."))
        except ValueError:
            return None
    toplam = 0.0
    for parca in ham.split():
        if parca in _ONLAR:
            toplam += _ONLAR[parca]
        elif parca in _BIRLER:
            toplam += _BIRLER[parca]
        elif parca == "yuz":
            toplam += 100
        elif parca == "bucuk":
            toplam += 0.5
        else:
            return None
    return toplam


def sayi_yaz(deger: float) -> str:
    """Türkçe ondalık virgülüyle: 2.5 → "2,5", 15.0 → "15"."""
    return f"{deger:g}".replace(".", ",")


def cumlelere_bol(satir: str, esik: int = 220) -> list[str]:
    """Kısa satırı olduğu gibi bırakır, uzun paragrafı cümlelere böler."""
    if len(satir) <= esik:
        return [satir]
    return [c for c in _CUMLE_SINIRI.split(satir) if c.strip()]


def kisalt(metin: str, sinir: int = 160) -> str:
    metin = re.sub(r"\s+", " ", metin).strip()
    return metin if len(metin) <= sinir else metin[: sinir - 1].rstrip() + "…"
