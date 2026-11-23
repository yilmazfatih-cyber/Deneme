"""Rakam içeren kalıpların okunuşu: telefon, IBAN, tarih, saat, IP, para, yüzde, birim, kesir, sayı.

Sıra önemlidir ve `KURALLAR` listesindeki sırayla uygulanır: önce en özel kalıp (telefon, tarih, saat),
en son genel sayı. Her kural yalnız rakamlı metne dokunur; çıktısı sözcüktür, sonraki kurallar onu
yeniden işlemez. Okunuş kararları (gerekçeleriyle docs/KARARLAR.md K-08):
  "23.11.2026" → "yirmi üç Kasım iki bin yirmi altı" · "14:30" ve "saat 14.30" → "on dört otuz"
  "0532 123 45 67" → "sıfır beş yüz otuz iki, yüz yirmi üç, kırk beş, altmış yedi" (virgül = kısa durak)
  "₺1.234,50" → "bin iki yüz otuz dört lira elli kuruş" · "%20'si" → "yüzde yirmisi" · "3/4" → "dörtte üç"
  "90 km/sa" → "saatte doksan kilometre" · "0123", 10+ basamak → rakam rakam · "5-10" → "beş on"
Kim kullanır: normallestirici.py. Genişletme: yeni kalıp → işlevini yazın, `KURALLAR`'da doğru yere
koyun (`# YENİ KURAL BURAYA`), tests/test_normallestir.py tablosuna örnek ekleyin.
"""

from __future__ import annotations

import re

from ses.tts.normallestir.ek import ek_uyumla
from ses.tts.normallestir.kisaltma import BIRIMLER
from ses.tts.normallestir.ortak import (
    AYLAR,
    EK,
    SAYI,
    SONU_SAYI_DEGIL,
    Kural,
    ekle,
    rakam_rakam,
    sayi_oku,
)
from ses.tts.normallestir.sayi_yazi import amount_to_words, number_to_words, ordinal_words

_AYRAC = r"[\s.-]?"


def _telefon_grubu(grup: str) -> str:
    return rakam_rakam(grup) if grup.startswith("0") else number_to_words(grup)


def _telefon(m: re.Match[str]) -> str:
    ulke = "artı doksan, " if m["ulke"] else ""
    alan = ("sıfır " if m["sifir"] else "") + number_to_words(m["alan"])
    gruplar = [_telefon_grubu(m[g]) for g in ("a", "b", "c")]
    return ulke + ", ".join([alan, *gruplar[:-1], ekle(gruplar[-1], m)])


def _cagri_merkezi(m: re.Match[str]) -> str:
    return ", ".join(["dört yüz kırk dört", _telefon_grubu(m["a"]), ekle(_telefon_grubu(m["b"]), m)])


def _iban(m: re.Match[str]) -> str:
    gruplar = [rakam_rakam(g) for g in re.findall(r"\d+", m.group(0)[2:])]
    return "te re " + ", ".join(gruplar)


def _tarih(m: re.Match[str]) -> str:
    gun, ay = int(m["g"]), int(m["a"])
    if not (1 <= gun <= 31 and 1 <= ay <= 12):
        return m.group(0)
    return f"{number_to_words(gun)} {AYLAR[ay]} " + ekle(number_to_words(m["y"]), m)


def _saat(m: re.Match[str]) -> str:
    parcalar = [number_to_words(m["s"])]
    for ad in ("d", "sn"):
        deger = m.groupdict().get(ad)
        if deger is None or (deger == "00" and ad == "d" and not m.groupdict().get("sn")):
            if m["s"] in ("0", "00") and ad == "d":
                parcalar.append("sıfır")
            continue
        parcalar.append(("sıfır " if deger.startswith("0") else "") + number_to_words(deger))
    return ekle(" ".join(parcalar), m)


def _ip(m: re.Match[str]) -> str:
    parcalar = m.group(0).split(".")
    if any(int(p) > 255 for p in parcalar):
        return m.group(0)
    return " nokta ".join(number_to_words(p) for p in parcalar)


_PARA_BIRIMI = {"₺": "TRY", "TL": "TRY", "TRY": "TRY", "$": "USD", "USD": "USD", "€": "EUR",
                "EUR": "EUR", "£": "GBP", "GBP": "GBP"}  # fmt: skip


def _para(m: re.Match[str]) -> str:
    tam, _, kesir = m["tutar"].replace(".", "").partition(",")
    kurus = int(tam) * 100 + (int(kesir.ljust(2, "0")) if kesir else 0)
    okunus = amount_to_words(kurus, currency=_PARA_BIRIMI[m["birim"]], prefix="")
    return ekle(okunus, m)


def _yuzde(m: re.Match[str]) -> str:
    return ekle("yüzde " + sayi_oku(m["sayi"]), m)


def _hiz(m: re.Match[str]) -> str:
    return ekle(f"saatte {sayi_oku(m['sayi'])} kilometre", m)


def _isaret(m: re.Match[str]) -> str:
    return {"-": "eksi ", "−": "eksi ", "+": "artı "}.get(m.groupdict().get("isaret") or "", "")


def _birim(m: re.Match[str]) -> str:
    return _isaret(m) + sayi_oku(m["sayi"]) + " " + ekle(BIRIMLER[m["birim"]], m)


def _kesir(m: re.Match[str]) -> str:
    pay, payda = int(m["pay"]), int(m["payda"])
    if 0 < pay < payda <= 100:
        return ek_uyumla(number_to_words(payda), "de") + " " + ekle(number_to_words(pay), m)
    return f"{number_to_words(pay)} bölü " + ekle(number_to_words(payda), m)


_KESIR_HARFLERI = {"½": "yarım", "¼": "çeyrek", "¾": "dörtte üç", "⅓": "üçte bir", "⅔": "üçte iki"}


# Sayıdan sonra nokta + büyük harfle başlayan bu sözcükler gelirse yine sıra sayısıdır ("2. Dünya Savaşı").
SIRA_ONCESI_BUYUK = ("Dünya", "Cadde", "Sokak", "Kat", "Sınıf", "Lig", "Bölge", "Bölüm", "Kısım", "Madde",
                     "Fıkra", "Kademe", "Derece", "Etap", "Asliye", "Ağır", "Sulh", "İcra", "Noter", "Ordu",
                     "Uluslararası", "Ulusal", "Olağan", "Olağanüstü", "Genel", "Dönem", "Murat", "Mehmet",
                     "Selim", "Mahmut", "Ahmet", "Osman", "Mustafa", "Süleyman", "Abdülhamit")  # fmt: skip
_SIRA_ARDI = r"(?=\s+(?:[a-zçğıöşü]|(?:" + "|".join(SIRA_ONCESI_BUYUK) + r")\b))"
_ROMA = {"I": 1, "V": 5, "X": 10}


def _roma_degeri(roma: str) -> int | None:
    """I, V, X ile yazılmış Roma rakamını çözer; kurallı değilse None ("IIII", "VX")."""
    toplam = 0
    for i, harf in enumerate(roma):
        deger = _ROMA[harf]
        toplam += -deger if i + 1 < len(roma) and _ROMA[roma[i + 1]] > deger else deger
    birler = ("", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX")
    yeniden = "X" * (toplam // 10) + birler[toplam % 10]
    return toplam if yeniden == roma and toplam > 0 else None


def _sira(m: re.Match[str]) -> str:
    return ekle(ordinal_words(m["sayi"]), m)


def _sira_ekli(m: re.Match[str]) -> str:
    return ordinal_words(m["sayi"]) + m["kalan"]


def _roma_sira(m: re.Match[str]) -> str:
    roma = m["roma"] or m["tek"]
    deger = _roma_degeri(roma)
    return m.group(0) if deger is None else ordinal_words(deger)


def _noktali_dizi(m: re.Match[str]) -> str:
    """Tarih, IP ya da binlik olmayan noktalı dizi ("1.2.3", "32.13.2026") → "bir nokta iki nokta üç"."""
    if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", m.group(0)):
        return m.group(0)  # binlik gruplu sayı: genel sayı kuralı okur
    return " nokta ".join(sayi_oku(p) for p in m.group(0).split("."))


def _rakam_rakam_oku(m: re.Match[str]) -> str:
    return ekle(rakam_rakam(m["rakamlar"]), m)


def _sayi(m: re.Match[str]) -> str:
    return _isaret(m) + ekle(sayi_oku(m["sayi"]), m)


_BIRIM_DESENI = "|".join(sorted(map(re.escape, BIRIMLER), key=len, reverse=True))
_TUTAR = r"(?P<tutar>\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)" + SONU_SAYI_DEGIL

KURALLAR: list[Kural] = [
    Kural("iban", re.compile(r"\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b"), _iban),
    Kural(
        "telefon",
        re.compile(
            r"(?<![\w+])(?:(?P<ulke>\+90|0090)" + _AYRAC + r")?(?P<sifir>0)?\(?(?P<alan>[2-58]\d{2})\)?"
            + _AYRAC + r"(?P<a>\d{3})" + _AYRAC + r"(?P<b>\d{2})" + _AYRAC + r"(?P<c>\d{2})(?!\d)" + EK
        ),
        _telefon,
    ),
    Kural("telefon", re.compile(r"(?<!\d)444[\s.-]?(?P<a>\d)[\s.-]?(?P<b>\d{3})(?!\d)" + EK), _cagri_merkezi),
    Kural("çarpı", re.compile(r"(?<=\d)\s?[x×X]\s?(?=\d)"), lambda m: " çarpı "),
    Kural("artı", re.compile(r"(?<=\d)\s?\+\s?(?=\d)"), lambda m: " artı "),
    Kural("eşittir", re.compile(r"(?<=\d)\s?=\s?(?=[\d-])"), lambda m: " eşittir "),
    Kural(
        "tarih",
        re.compile(r"(?<![\d.,/])(?P<g>\d{1,2})(?P<ayrac>[./-])(?P<a>\d{1,2})(?P=ayrac)(?P<y>\d{4}|\d{2})(?!\d)" + EK),
        _tarih,
    ),
    Kural("tarih", re.compile(r"(?<![\d.])(?P<y>\d{4})-(?P<a>\d{2})-(?P<g>\d{2})(?!\d)" + EK), _tarih),
    Kural(
        "saat",
        re.compile(r"(?<![\d.:])(?P<s>[01]?\d|2[0-3]):(?P<d>[0-5]\d)(?::(?P<sn>[0-5]\d))?(?![\d:])" + EK),
        _saat,
    ),
    Kural(
        "saat",
        re.compile(r"(?:(?<=saat )|(?<=Saat )|(?<=SAAT ))(?P<s>[01]?\d|2[0-3])\.(?P<d>[0-5]\d)(?![\d.])" + EK),
        _saat,
    ),
    Kural("saat", re.compile(r"(?<![\d.])(?P<s>[01]?\d|2[0-3])\.(?P<d>[0-5]\d)(?='[a-zçğıöşü])" + EK), _saat),
    Kural("ip", re.compile(r"(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d.])"), _ip),
    Kural("noktalı dizi", re.compile(r"(?<![\d.,])\d+(?:\.\d+){2,}(?!\.?\d)"), _noktali_dizi),
    Kural("para", re.compile(r"(?P<birim>[₺$€£])\s?" + _TUTAR + EK), _para),
    Kural("para", re.compile(r"(?<![\d.,])" + _TUTAR + r"\s?(?P<birim>TL|TRY|USD|EUR|GBP|[₺$€£])(?!\w)" + EK), _para),
    Kural("yüzde", re.compile(r"%\s?(?P<sayi>\d+(?:,\d+)?)" + SONU_SAYI_DEGIL + EK), _yuzde),
    Kural("yüzde", re.compile(r"(?<![\d.,])(?P<sayi>\d+(?:,\d+)?)\s?%" + EK), _yuzde),
    Kural("birim", re.compile(r"(?<![\d.,])(?P<sayi>" + SAYI + r")\s?km/(?:sa|s|h)\b" + EK), _hiz),
    Kural("birim", re.compile(r"(?<![\w.,])(?P<isaret>[-+−])?(?P<sayi>" + SAYI + r")\s?(?P<birim>" + _BIRIM_DESENI + r")(?![\w²³])" + EK), _birim),
    Kural("kesir", re.compile(r"(?<![\d/.,])(?P<pay>\d{1,3})/(?P<payda>\d{1,3})(?![\d/])" + EK), _kesir),
    Kural("kesir", re.compile("[" + "".join(_KESIR_HARFLERI) + "]"), lambda m: _KESIR_HARFLERI[m.group(0)]),
    Kural("sıra sayısı", re.compile(r"(?<![\w.,])(?P<sayi>\d{1,4})\." + _SIRA_ARDI), _sira),
    Kural("sıra sayısı", re.compile(r"(?<![\w.,])(?P<sayi>\d+)'?(?:inci|ıncı|uncu|üncü|nci|ncı|ncu|ncü)(?P<kalan>[a-zçğıöşü]*)"), _sira_ekli),
    Kural("sıra sayısı", re.compile(r"(?<![\w.])(?:(?P<roma>[IVX]{2,6})\.(?=\s+\w)|(?P<tek>[IVX])\." + _SIRA_ARDI + ")"), _roma_sira),
    Kural("rakam rakam", re.compile(r"(?<![\w.,])(?P<rakamlar>0\d+|\d{10,})" + SONU_SAYI_DEGIL + EK), _rakam_rakam_oku),
    # YENİ KURAL BURAYA (genel sayıdan önce)
    Kural("sayı", re.compile(r"(?<![\w.,])(?P<isaret>[-+−])?(?P<sayi>" + SAYI + r")(?!\d)" + EK), _sayi),
]  # fmt: skip
