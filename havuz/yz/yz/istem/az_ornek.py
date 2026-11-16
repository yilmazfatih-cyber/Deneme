"""Benzerliğe göre az-örnek (few-shot) seçimi.

Küçük modeller örnekten çok iyi öğrenir ama bağlamları dardır: bütün örnekleri değil, soruya
en benzeyen birkaçını vermek gerekir. `AzOrnekSecici` örnekleri bir kez gömer; her soru için
kosinüs benzerliğine göre en iyi `k` örneği (isteğe bağlı çeşitlilik ve belirteç bütçesiyle) seçer.
Kim kullanır: yapili/cikar.py (isteğe bağlı `ornekler`), degerlendirme koşuları.
Genişletme: başka bir benzerlik ölçüsü → `gomme` olarak başka bir `Gomme` verin.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

from yz.metin import belirtec_tahmini
from yz.rag.gomme import Gomme, KarmaGomme
from yz.saglayici.tipler import Mesaj


@dataclass(frozen=True)
class Ornek:
    """Bir girdi → çıktı örneği."""

    girdi: str
    cikti: str


class AzOrnekSecici:
    """Soruya en benzeyen örnekleri seçer."""

    def __init__(self, ornekler: Sequence[Ornek], gomme: Gomme | None = None) -> None:
        self.ornekler = list(ornekler)
        if gomme is None:
            karma = KarmaGomme(boyut=512)
            karma.idf_ogren([o.girdi for o in self.ornekler])
            gomme = karma
        self.gomme = gomme
        self._matris = gomme.gom([o.girdi for o in self.ornekler])

    def sec(
        self,
        soru: str,
        k: int = 3,
        cesitlilik: float = 0.0,
        belirtec_butcesi: int | None = None,
    ) -> list[Ornek]:
        """En iyi `k` örnek. cesitlilik>0 ise birbirine çok benzeyen örnekler cezalandırılır (MMR).

        Dönen sıra: en benzer örnek EN SONDA (küçük modeller son gördüğünü daha çok dikkate alır).
        """
        if not self.ornekler or k <= 0:
            return []
        sorgu = self.gomme.gom([soru])[0]
        benzerlik = self._matris @ sorgu
        secilen: list[int] = []
        harcanan = 0
        adaylar = list(range(len(self.ornekler)))
        while adaylar and len(secilen) < k:

            def puan(i: int) -> float:
                ceza = max((float(self._matris[i] @ self._matris[j]) for j in secilen), default=0.0)
                return (1 - cesitlilik) * float(benzerlik[i]) - cesitlilik * ceza

            en_iyi = max(adaylar, key=lambda i: (puan(i), -i))
            adaylar.remove(en_iyi)
            maliyet = belirtec_tahmini(self.ornekler[en_iyi].girdi + self.ornekler[en_iyi].cikti)
            if belirtec_butcesi is not None and harcanan + maliyet > belirtec_butcesi:
                continue
            harcanan += maliyet
            secilen.append(en_iyi)
        return [self.ornekler[i] for i in reversed(secilen)]

    def benzerlikler(self, soru: str) -> np.ndarray:
        """Her örneğin soruya kosinüs benzerliği (ayıklama için)."""
        sonuc: np.ndarray = self._matris @ self.gomme.gom([soru])[0]
        return sonuc


def ornek_mesajlari(ornekler: Sequence[Ornek]) -> list[Mesaj]:
    """Örnekleri kullanıcı/asistan mesaj çiftlerine çevirir (sohbet geçmişine eklenir)."""
    mesajlar: list[Mesaj] = []
    for ornek in ornekler:
        mesajlar.append(Mesaj.kullanici(ornek.girdi))
        mesajlar.append(Mesaj.asistan(ornek.cikti))
    return mesajlar
