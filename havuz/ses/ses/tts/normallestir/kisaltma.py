"""Kısaltma, ölçü birimi ve harf adı sözlükleri + büyük harfli kısaltmanın nasıl okunacağı.

`NOKTALI`: noktalı kısaltmalar (büyük/küçük harf duyarsız): "vb." → "ve benzeri".
`BUYUK`: noktasız, yalnız tam büyük harfle yazılınca: "TL" → "Türk lirası".
`BIRIMLER`: yalnız bir sayıdan SONRA gelince açılır ("5 km" → "beş kilometre"; tek başına "m" dokunulmaz).
Değer bir demetse ikinci öğe "iyelikli bileşik mi" bilgisidir (ek uyumu: "caddesine", "lirasına").
Harf harf okuma: büyük harfli kısaltma ünlüsüzse, 2 harfliyse ya da Türkçede hece olamayacak ünsüz
öbeğiyle bitiyorsa/başlıyorsa harf adlarıyla okunur ("ABD" → "a be de", "THY" → "te he ye"); okunabiliyorsa
sözcük gibi ("NATO" → "nato", "TÜBİTAK" → "tübitak"). İstisnalar `SOZCUK_GIBI` / `HARF_HARF` kümelerinde.
Kim kullanır: kurallar.py. Genişletme: sözlüğe satır ekleyin (`# YENİ KISALTMA BURAYA`) ve
tests/test_normallestir.py'deki tabloya bir örnek yazın.
"""

from __future__ import annotations

from ses.metin import kucuk_tr

Okunus = str | tuple[str, bool]

NOKTALI: dict[str, Okunus] = {
    "vb.": "ve benzeri",
    "vs.": "vesaire",
    "vd.": "ve diğerleri",
    "dr.": "doktor",
    "prof.": "profesör",
    "doç.": "doçent",
    "av.": "avukat",
    "op.": "operatör",
    "uzm.": "uzman",
    "hz.": "hazreti",
    "no.": "numara",
    "tel.": "telefon",
    "bkz.": "bakınız",
    "örn.": "örneğin",
    "yy.": "yüzyıl",
    "cad.": ("caddesi", True),
    "sok.": ("sokağı", True),
    "sk.": ("sokağı", True),
    "mah.": ("mahallesi", True),
    "apt.": ("apartmanı", True),
    "bul.": ("bulvarı", True),
    "a.ş.": ("anonim şirketi", True),
    "ltd.": "limitet",
    "şti.": ("şirketi", True),
    "t.c.": ("Türkiye Cumhuriyeti", True),
    "sn.": "sayın",  # "5 sn" (saniye) birim kuralında, bu kuraldan ÖNCE işlenir
    # YENİ KISALTMA BURAYA
}

BUYUK: dict[str, Okunus] = {
    "TL": ("Türk lirası", True),
    "TC": ("Türkiye Cumhuriyeti", True),
    "IBAN": "iban",  # yabancı kökenli: Türkçe küçültme "ıban" verirdi
}

BIRIMLER: dict[str, str] = {
    "km": "kilometre",
    "m": "metre",
    "cm": "santimetre",
    "mm": "milimetre",
    "m²": "metrekare",
    "m2": "metrekare",
    "km²": "kilometrekare",
    "m³": "metreküp",
    "m3": "metreküp",
    "kg": "kilogram",
    "g": "gram",
    "gr": "gram",
    "mg": "miligram",
    "mcg": "mikrogram",
    "µg": "mikrogram",
    "l": "litre",
    "lt": "litre",
    "ml": "mililitre",
    "sn": "saniye",
    "dk": "dakika",
    "sa": "saat",
    "°C": "derece",
    "°": "derece",
    "kW": "kilovat",
    "kWh": "kilovatsaat",
    "W": "vat",
    "V": "volt",
    "MB": "megabayt",
    "GB": "gigabayt",
    "KB": "kilobayt",
    "TB": "terabayt",
}

HARF_ADLARI: dict[str, str] = {
    "A": "a",
    "B": "be",
    "C": "ce",
    "Ç": "çe",
    "D": "de",
    "E": "e",
    "F": "fe",
    "G": "ge",
    "Ğ": "yumuşak ge",
    "H": "he",
    "I": "ı",
    "İ": "i",
    "J": "je",
    "K": "ke",
    "L": "le",
    "M": "me",
    "N": "ne",
    "O": "o",
    "Ö": "ö",
    "P": "pe",
    "Q": "kü",
    "R": "re",
    "S": "se",
    "Ş": "şe",
    "T": "te",
    "U": "u",
    "Ü": "ü",
    "V": "ve",
    "W": "çift ve",
    "X": "iks",
    "Y": "ye",
    "Z": "ze",
}  # fmt: skip  — TDK harf adları

SOZCUK_GIBI = frozenset({"YÖK", "MEB", "AŞTİ"})
HARF_HARF = frozenset({"AB", "AVM", "AKP", "USB"})
_UNLU = set("AEIİOÖUÜ")
_SON_OBEKLER = frozenset({"RT", "RK", "RP", "RÇ", "NT", "NK", "NÇ", "LT", "LK", "LP", "ST", "ŞT", "KS", "NS", "RS"})  # fmt: skip


def okunus(deger: Okunus) -> tuple[str, bool]:
    """Sözlük değerini (okunuş, iyelikli mi) çiftine çevirir."""
    return (deger, False) if isinstance(deger, str) else deger


def noktali_bul(belirtec: str) -> Okunus | None:
    """Noktalı kısaltmayı harf büyüklüğüne bakmadan arar ("Cad." = "cad.")."""
    return NOKTALI.get(kucuk_tr(belirtec))


def okunabilir_mi(kisaltma: str) -> bool:
    """Büyük harfli kısaltma Türkçe bir sözcük gibi okunabilir mi? ("NATO" evet, "ABD" hayır)."""
    if kisaltma in SOZCUK_GIBI:
        return True
    if kisaltma in HARF_HARF or len(kisaltma) <= 2 or not any(h in _UNLU for h in kisaltma):
        return False
    unsuz_dizisi = 0
    for harf in kisaltma:
        unsuz_dizisi = 0 if harf in _UNLU else unsuz_dizisi + 1
        if unsuz_dizisi >= 3:
            return False
    if kisaltma[0] not in _UNLU and kisaltma[1] not in _UNLU:
        return False  # "DSİ": iki ünsüzle başlayan hece Türkçede yok
    son_iki = kisaltma[-2:]
    return not (son_iki[0] not in _UNLU and son_iki[1] not in _UNLU and son_iki not in _SON_OBEKLER)


def harf_harf(kisaltma: str) -> str:
    """Harf adlarıyla okur: "THY" → "te he ye"."""
    return " ".join(HARF_ADLARI.get(harf, kucuk_tr(harf)) for harf in kisaltma)


def kisaltma_oku(kisaltma: str) -> str:
    """Büyük harfli kısaltmanın okunuşu: sözcük gibi (küçük harfle) ya da harf harf."""
    return kucuk_tr(kisaltma) if okunabilir_mi(kisaltma) else harf_harf(kisaltma)
