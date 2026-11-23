"""Türkçe metni seslendirmeye hazırlar: rakam, tarih, saat, para, yüzde, kısaltma… → okunuş.

Kullanım:
    normallestir("23.11.2026'da saat 14:30'da ₺1.234,50 ödendi.")
    → "yirmi üç Kasım iki bin yirmi altıda saat on dört otuzda bin iki yüz otuz dört lira elli kuruş ödendi."
    metin, degisiklikler = normallestir_ayrintili(...)   # hangi kural neyi değiştirdi (CLI: normallestir)
Sıra: ön temizlik → sayı kuralları (sayi_kurallari.KURALLAR) → metin kuralları → son temizlik.
Çıktı Piper'a (espeak-ng) gider; espeak'in kendi rakam okuması tarih, para, telefon ve eklerde yanlış
yapabildiği için rakam bırakılmaz. Kim kullanır: tts/seslendirici.py, olcum/normallestir.py, cli.
Genişletme: kural eklemek için sayi_kurallari.py ya da metin_kurallari.py (AGENTS.md tarifi).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ses.hatalar import SinirHatasi
from ses.tts.normallestir import metin_kurallari, sayi_kurallari
from ses.tts.normallestir.ortak import Kural

AZAMI_KARAKTER = 100_000
TUM_KURALLAR: list[Kural] = [*sayi_kurallari.KURALLAR, *metin_kurallari.KURALLAR]


@dataclass(frozen=True)
class Degisiklik:
    """Bir kuralın yaptığı değişiklik (ayrıntı çıktısı ve testler için)."""

    kural: str
    once: str
    sonra: str


def normallestir_ayrintili(metin: str) -> tuple[str, list[Degisiklik]]:
    """Metni normalleştirir; uygulanan her değişikliği de döndürür."""
    if len(metin) > AZAMI_KARAKTER:
        raise SinirHatasi(f"Metin çok uzun ({len(metin)} karakter; sınır {AZAMI_KARAKTER}). Bölün.")
    metin = metin_kurallari.on_temizlik(metin)
    degisiklikler: list[Degisiklik] = []
    for kural in TUM_KURALLAR:

        def degistir(eslesme: re.Match[str], kural: Kural = kural) -> str:
            sonuc = kural.isle(eslesme)
            if sonuc != eslesme.group(0):
                degisiklikler.append(Degisiklik(kural.ad, eslesme.group(0), sonuc.strip()))
            return sonuc

        metin = kural.desen.sub(degistir, metin)
    return metin_kurallari.son_temizlik(metin), degisiklikler


def normallestir(metin: str) -> str:
    """Metni seslendirmeye hazır okunuşa çevirir (ayrıntısız)."""
    return normallestir_ayrintili(metin)[0]
