"""Ölçüm öncesi metin normalizasyonu: iki metin "yazım" yüzünden değil "söz" yüzünden ayrışsın.

Adımlar: (isteğe bağlı) sayıları yazıya çevirme — seslendirme normalizasyonuyla aynı kurallar
("23.11.2026" → "yirmi üç kasım iki bin yirmi altı", "%20" → "yüzde yirmi"); Türkçe küçük harf
(İ → i, I → ı); şapkalar düzlenir (kâr → kar); kesme işareti silinip ek birleştirilir
("Ankara'ya" → "ankaraya"); öteki noktalama boşluğa döner; boşluklar teklenir.
Neden sayı seçeneği: model "23 Kasım" yazar, doğru metin "23.11.2026" der; ikisi de aynı sözdür.
Kim kullanır: hata_orani.py, degerlendir.py. Genişletme: yeni bir eşdeğerlik (ör. "ğ" yutulması)
gerekiyorsa buraya bir adım ve tests/test_olcum.py'ye örnek ekleyin.
"""

from __future__ import annotations

import re

from ses.metin import kucuk_tr, sapkasiz
from ses.tts.normallestir.metin_kurallari import on_temizlik
from ses.tts.normallestir.normallestirici import normallestir


def olcum_icin(metin: str, *, sayilari_yaz: bool = False) -> str:
    """Karşılaştırma için sade metin: küçük harf, noktalamasız, tek boşluklu."""
    metin = on_temizlik(metin)
    if sayilari_yaz:
        metin = normallestir(metin)
    metin = sapkasiz(kucuk_tr(metin))
    metin = re.sub(r"(?<=\w)'(?=\w)", "", metin)
    metin = re.sub(r"[^\w\s]|_", " ", metin)
    return " ".join(metin.split())


def sozcukler(metin: str, *, sayilari_yaz: bool = False) -> list[str]:
    return olcum_icin(metin, sayilari_yaz=sayilari_yaz).split()


def karakterler(metin: str, *, sayilari_yaz: bool = False) -> list[str]:
    """Karakter dizisi; sözcük arası boşluk da bir karakter sayılır (CER'e girer)."""
    return list(olcum_icin(metin, sayilari_yaz=sayilari_yaz))
