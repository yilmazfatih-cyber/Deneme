"""Rakamsız kalıpların okunuşu: kısaltmalar, büyük harfli kısaltmalar, simgeler; ön ve son temizlik.

Bu kurallar sayı kurallarından SONRA çalışır (ör. "5 sn" birim kuralında "beş saniye" olur; ancak
tek başına "Sn." burada "sayın" olur). Noktalı kısaltma cümle sonundaysa ("elma, armut vs.") nokta
korunur ki cümle sınırı kaybolmasın. Kim kullanır: normallestirici.py.
Genişletme: sözlük → kisaltma.py; yeni simge → `_SIMGELER`; yeni kural → `KURALLAR`'a ekleyin
(`# YENİ KURAL BURAYA`) ve tests/test_normallestir.py tablosuna örnek yazın.
"""

from __future__ import annotations

import re
import unicodedata

from ses.metin import kucuk_tr
from ses.tts.normallestir.kisaltma import (
    BUYUK,
    NOKTALI,
    kisaltma_oku,
    noktali_bul,
    okunus,
)
from ses.tts.normallestir.ortak import EK, Kural, ekle

_CUMLE_SONU_OLABILIR = frozenset({"vb.", "vs.", "vd."})
_SIMGELER = {"&": " ve ", "@": " et "}
_ON_TEMIZLIK = str.maketrans({
    chr(0x2019): "'", chr(0x2018): "'", chr(0x02BC): "'", "`": "'", chr(0x00B4): "'",  # kesme işaretleri
    chr(0x201C): '"', chr(0x201D): '"', chr(0x201E): '"', chr(0x00AB): '"', chr(0x00BB): '"',  # tırnaklar
    chr(0x2013): "-", chr(0x2014): "-", chr(0x2212): "-", chr(0x2026): "...",  # tireler, üç nokta
    chr(0x00A0): " ", chr(0x202F): " ", chr(0x2009): " ",  # bölünmez ve ince boşluklar
    chr(0x200B): "", chr(0xFEFF): "",  # sıfır genişlikli boşluk, BOM
})  # fmt: skip


def on_temizlik(metin: str) -> str:
    """Unicode birleştirme (NFC), tırnak/kesme/tire birliği, görünmez boşlukların atılması."""
    return unicodedata.normalize("NFC", metin).translate(_ON_TEMIZLIK).replace("\r\n", "\n")


def son_temizlik(metin: str) -> str:
    """Sözcük arası tireyi boşluğa çevirir, fazla boşlukları ve noktalama önündeki boşluğu siler."""
    metin = re.sub(r"(?<=\w)-(?=\w)", " ", metin)
    metin = re.sub(r"[ \t]+", " ", metin)
    metin = re.sub(r" +([,.;:!?])", r"\1", metin)
    return "\n".join(satir.strip() for satir in metin.split("\n")).strip()


def _noktali(m: re.Match[str]) -> str:
    deger = noktali_bul(m["k"])
    if deger is None:
        return m.group(0)
    metin, iyelikli = okunus(deger)
    sonuc = ekle(metin, m, iyelikli=iyelikli)
    if kucuk_tr(m["k"]) in _CUMLE_SONU_OLABILIR and m["son"] is not None and not m["ek"]:
        sonuc += "."
    return sonuc


def _buyuk(m: re.Match[str]) -> str:
    metin, iyelikli = okunus(BUYUK[m["k"]])
    return ekle(metin, m, iyelikli=iyelikli)


def _kisaltma(m: re.Match[str]) -> str:
    return ekle(kisaltma_oku(m["k"]), m)


_NOKTALI_DESEN = "|".join(re.escape(k) for k in sorted(NOKTALI, key=len, reverse=True))
_BUYUK_DESEN = "|".join(re.escape(k) for k in sorted(BUYUK, key=len, reverse=True))

KURALLAR: list[Kural] = [
    Kural(
        "kısaltma",
        # büyük/küçük harf duyarsızlığı yalnız kısaltmanın kendisinde: (?i:...)
        re.compile(r"(?<![\w.])(?P<k>(?i:" + _NOKTALI_DESEN + "))" + EK + r"(?=(?P<son>\s*$|\s+[A-ZÇĞİÖŞÜ]))?"),
        _noktali,
    ),
    Kural("kısaltma", re.compile(r"(?<![\w'])(?P<k>" + _BUYUK_DESEN + r")(?![\w])" + EK), _buyuk),
    Kural("büyük harfli kısaltma", re.compile(r"(?<![\w'])(?P<k>[A-ZÇĞİÖŞÜ]{2,})(?![\w])" + EK), _kisaltma),
    Kural("simge", re.compile("[" + "".join(map(re.escape, _SIMGELER)) + "]"), lambda m: _SIMGELER[m.group(0)]),
    # YENİ KURAL BURAYA
]  # fmt: skip
