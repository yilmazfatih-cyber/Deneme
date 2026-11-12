"""Türkçe metin araçları: büyük/küçük harf, normalleştirme ve ön bölütleme.

Python'un ``str.lower()`` / ``str.upper()`` işlevleri Türkçede yanlış sonuç verir
(``"I".lower() == "i"``, ``"İ".lower() == "i̇"``). Bu modüldeki işlevler Türkçe kurallarını uygular.
"""

from __future__ import annotations

import re
import unicodedata

# Türk alfabesi (29 harf) + şapkalı ünlüler + yabancı kelimelerde geçen q, w, x.
TURK_ALFABESI = "abcçdefgğhıijklmnoöprsştuüvyz"
EK_HARFLER = "âîûqwx"
ALFABE_SIRASI = "aâbcçdefgğhıiîjklmnoöprsştuûüvyzqwx"
UNLULER = set("aeıioöuüâîû")
KALIN_UNLULER = set("aıouâû")
YUVARLAK_UNLULER = set("oöuüû")

_SIRA = {h: i for i, h in enumerate(ALFABE_SIRASI)}


def kucuk(s: str) -> str:
    """Türkçe küçük harfe çevirir: ``I → ı``, ``İ → i``."""
    return s.replace("I", "ı").replace("İ", "i").lower()


def buyuk(s: str) -> str:
    """Türkçe büyük harfe çevirir: ``i → İ``, ``ı → I``."""
    return s.replace("i", "İ").replace("ı", "I").upper()


def bas_buyuk(s: str) -> str:
    """Yalnızca ilk harfi Türkçe kurallarıyla büyütür."""
    return buyuk(s[:1]) + s[1:] if s else s


def baslik(s: str) -> str:
    """Her kelimenin ilk harfini büyütür; bağlaçlar küçük kalır ("Türk Dili ve Edebiyatı")."""
    kucukler = {"ve", "ile", "veya", "ya", "da", "de"}
    kelimeler = kucuk(s).split()
    return " ".join(
        k if (i > 0 and k in kucukler) else bas_buyuk(k) for i, k in enumerate(kelimeler)
    )


def sirala_anahtari(s: str) -> tuple[int, ...]:
    """Türk alfabesi sırasına göre sıralama anahtarı (ç, ğ, ı, ö, ş, ü doğru yerde)."""
    return tuple(_SIRA.get(c, 100 + ord(c)) for c in kucuk(s))


_DEGISIM = str.maketrans(
    {
        "’": "'",  # ’
        "‘": "'",  # ‘
        "ʼ": "'",  # ʼ
        "´": "'",  # ´
        "“": '"',  # “
        "”": '"',  # ”
        "„": '"',  # „
        "«": '"',  # «
        "»": '"',  # »
        "–": "-",  # –
        "—": "-",  # —
        "−": "-",  # −
        "‐": "-",
        "‑": "-",
        " ": " ",  # bölünmez boşluk
        " ": " ",
        " ": " ",
        " ": " ",
        "\t": " ",
        "​": None,  # sıfır genişlikli karakterler
        "‌": None,
        "‍": None,
        "﻿": None,
        "­": None,  # yumuşak tire
    }
)


def normallestir(metin: str) -> str:
    """Tokenizer'dan önce uygulanan normalleştirme.

    NFC, tipografik tırnak ve tireleri sadeleştirir, boşlukları toparlar. Şapkalı harfler (â, î, û)
    korunur; anlam ayırt ederler (kar / kâr, hala / hâlâ).
    """
    m = unicodedata.normalize("NFC", metin)
    m = m.replace("\r\n", "\n").replace("\r", "\n")
    m = m.replace("i̇", "i")  # yanlış küçültmeden kalan "i + üst nokta"
    m = m.replace("…", "...")
    m = m.translate(_DEGISIM)
    m = re.sub(r" {2,}", " ", m)
    m = re.sub(r" *\n *", "\n", m)
    m = re.sub(r"\n{3,}", "\n\n", m)
    return m.strip()


# Ön bölütleme birimleri: harf dizisi | tek rakam | satır sonu | boşluk | diğer tek karakter
_BIRIM = re.compile(r"(?P<kelime>[^\W\d_]+)|(?P<rakam>\d)|(?P<satir>\n)|(?P<bosluk> )|(?P<diger>.)", re.DOTALL)

KELIME, RAKAM, SATIR, DIGER, BOSLUK = "kelime", "rakam", "satir", "diger", "bosluk"


def on_bolutle(metin: str) -> list[tuple[str, str, bool]]:
    """Metni ``(tür, parça, öncesinde_boşluk_var)`` birimlerine ayırır.

    Tek boşluklar bir sonraki birime ``True`` bayrağı olarak katılır (SentencePiece'teki ▁ gibi).
    Bir boşluğu boşluk ya da satır sonu izliyorsa ayrı bir ``BOSLUK`` birimi üretilir; böylece
    normalleştirilmemiş metin de kayıpsız geri kurulabilir.
    """
    birimler: list[tuple[str, str, bool]] = []
    bekleyen = False
    for m in _BIRIM.finditer(metin):
        s, tur = m.group(), m.lastgroup
        if tur == BOSLUK:
            if bekleyen:
                birimler.append((BOSLUK, " ", False))
            bekleyen = True
            continue
        if tur == SATIR:
            if bekleyen:
                birimler.append((BOSLUK, " ", False))
            birimler.append((SATIR, s, False))
            bekleyen = False
            continue
        birimler.append((tur, s, bekleyen))
        bekleyen = False
    if bekleyen:
        birimler.append((BOSLUK, " ", False))
    return birimler


def harf_durumu(kelime: str) -> str:
    """Kelimenin büyük harf biçimi: ``"k"`` küçük, ``"B"`` İlk harf büyük, ``"BB"`` TÜMÜ BÜYÜK, ``"karisik"``.

    Yalnızca kayıpsız geri döndürülebilen durumlar ``B``/``BB`` sayılır.
    """
    k = kucuk(kelime)
    if k == kelime:
        return "k"
    if len(kelime) > 1 and buyuk(k) == kelime:
        return "BB"
    if bas_buyuk(k) == kelime:
        return "B"
    return "karisik"


def unlu_uyumu(son_unlu: str) -> tuple[str, str]:
    """Son ünlüye göre (A, I) arketiplerinin değerini verir: ``a → ("a","ı")``, ``ö → ("e","ü")``."""
    kalin = son_unlu in KALIN_UNLULER
    yuvarlak = son_unlu in YUVARLAK_UNLULER
    a = "a" if kalin else "e"
    if kalin:
        i = "u" if yuvarlak else "ı"
    else:
        i = "ü" if yuvarlak else "i"
    return a, i


def son_unlu(kelime: str) -> str | None:
    for c in reversed(kelime):
        if c in UNLULER:
            return c
    return None
