"""Yeniden sıralama (reranking) örnekleri — `RagDizini(yeniden_siralayici=...)` kancası için.

Kanca imzası: `(sorgu, adaylar) -> adaylar` (yeni sırayla). İki örnek:
    sozcuk_ortusmesi_siralayici  ucuz: sorgudaki sayı ve özel adları içeren adayları öne alır.
    ModelSiralayici              pahalı: her aday için modele 0–10 ilgililik puanı sordurur
                                 (aday başına bir model çağrısı; küçük k ile kullanın).
Kim kullanır: rag/dizin.py (kanca), cli/sunucu yapılandırması.
Genişletme: yeni sıralayıcı → aynı imzada bir işlev ya da `__call__`'lı sınıf yazın.
"""

from __future__ import annotations

import re

from yz.metin import kucuk_tr
from yz.rag.dizin import AramaSonucu
from yz.saglayici.taban import Saglayici
from yz.saglayici.tipler import Mesaj

_SAYI = re.compile(r"\d+(?:[.,]\d+)*")
_OZEL_AD = re.compile(r"\b[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}")


def sozcuk_ortusmesi_siralayici(sorgu: str, adaylar: list[AramaSonucu]) -> list[AramaSonucu]:
    """Sorgudaki sayıları ve büyük harfli adları içeren adayları (kararlı biçimde) öne alır."""
    isaretler = {kucuk_tr(s) for s in _SAYI.findall(sorgu) + _OZEL_AD.findall(sorgu)}
    if not isaretler:
        return adaylar

    def anahtar(sira_aday: tuple[int, AramaSonucu]) -> tuple[int, int]:
        sira, aday = sira_aday
        metin = kucuk_tr(aday.parca.metin)
        return (-sum(1 for i in isaretler if i in metin), sira)

    return [aday for _, aday in sorted(enumerate(adaylar), key=anahtar)]


class ModelSiralayici:
    """Modelden her aday için 0–10 ilgililik puanı ister ve buna göre sıralar."""

    def __init__(self, saglayici: Saglayici, azami_aday: int = 8) -> None:
        self.saglayici = saglayici
        self.azami_aday = azami_aday

    def puanla(self, sorgu: str, metin: str) -> float:
        istem = (
            f"SORU: {sorgu}\n\nPARÇA:\n{metin[:1500]}\n\n"
            "Bu parça soruyu yanıtlamaya ne kadar yarar? 0 (hiç) ile 10 (tam yanıt) arasında "
            "yalnızca bir tam sayı yaz."
        )
        yanit = self.saglayici.sohbet([Mesaj.kullanici(istem)], azami_belirtec=4)
        eslesme = re.search(r"\d+", yanit.metin)
        return min(10.0, float(eslesme.group())) if eslesme else 0.0

    def __call__(self, sorgu: str, adaylar: list[AramaSonucu]) -> list[AramaSonucu]:
        ust = adaylar[: self.azami_aday]
        puanli = [(self.puanla(sorgu, a.parca.metin), -i, a) for i, a in enumerate(ust)]
        puanli.sort(key=lambda ucu: (ucu[0], ucu[1]), reverse=True)
        for puan, _, aday in puanli:
            aday.notlar.append(f"model puanı {puan:g}")
        return [a for _, _, a in puanli] + adaylar[self.azami_aday :]
