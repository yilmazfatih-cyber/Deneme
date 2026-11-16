"""Belgeyi arama parçalarına (chunk) böler: başlık → paragraf → cümle, örtüşmeli.

Kurallar:
    - Markdown başlıkları (#) bölüm sınırıdır; her parça başlık yolunu taşır
      ("Kurulum › Gereksinimler"). Başlık metni parçanın başına eklenir: küçük modeller ve
      BM25, bağlamı başlıktan da yakalar.
    - Paragraflar `hedef_belirtec`e kadar birleştirilir; uzun paragraf cümlelere, çok uzun
      cümle kelimelere bölünür. Bir sonraki parça öncekinin son `ortusme_cumle` cümlesiyle başlar.
Belirteç sayısı tahminidir (yz.metin.belirtec_tahmini).
Kim kullanır: rag/dizin.py.
Genişletme: başka bir bölme stratejisi → aynı imzada (`belge -> list[Parca]`) yeni işlev.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any

from yz.metin import belirtec_tahmini, cumlelere_bol
from yz.rag.yukleyici import Belge

_BASLIK = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")


@dataclass
class Parca:
    """Aranabilir bir metin parçası."""

    kimlik: str
    belge_kimligi: str
    kaynak: str
    metin: str
    baslik_yolu: str = ""
    sira: int = 0

    def goster(self) -> str:
        """Kaynak gösteriminde kullanılacak kısa ad: "dosya.md › Bölüm"."""
        return f"{self.kaynak} › {self.baslik_yolu}" if self.baslik_yolu else self.kaynak

    def sozluk(self) -> dict[str, Any]:
        return asdict(self)


def _bolumler(metin: str) -> list[tuple[str, str]]:
    """Metni (başlık yolu, bölüm metni) çiftlerine ayırır."""
    yol: list[tuple[int, str]] = []
    bolumler: list[tuple[str, str]] = []
    tampon: list[str] = []

    def bosalt() -> None:
        govde = "\n".join(tampon).strip()
        if govde:
            bolumler.append((" › ".join(b for _, b in yol), govde))
        tampon.clear()

    for satir in metin.split("\n"):
        eslesme = _BASLIK.match(satir)
        if eslesme:
            bosalt()
            seviye = len(eslesme.group(1))
            yol = [(s, b) for s, b in yol if s < seviye]
            yol.append((seviye, eslesme.group(2).strip()))
        else:
            tampon.append(satir)
    bosalt()
    return bolumler


def _kelimelerle_bol(cumle: str, hedef: int) -> list[str]:
    kelimeler = cumle.split()
    parcalar: list[str] = []
    tampon: list[str] = []
    for kelime in kelimeler:
        tampon.append(kelime)
        if belirtec_tahmini(" ".join(tampon)) >= hedef:
            parcalar.append(" ".join(tampon))
            tampon = []
    if tampon:
        parcalar.append(" ".join(tampon))
    return parcalar


def _birimler(govde: str, hedef: int) -> list[tuple[str, bool]]:
    """Bölümü (metin, paragraf_sonu_mu) birimlerine ayırır: paragraf ya da cümle."""
    birimler: list[tuple[str, bool]] = []
    for paragraf in re.split(r"\n\s*\n", govde):
        duz = " ".join(paragraf.split())
        if not duz:
            continue
        if belirtec_tahmini(duz) <= hedef:
            birimler.append((duz, True))
            continue
        cumleler = cumlelere_bol(duz)
        for i, cumle in enumerate(cumleler):
            parcalar = (
                _kelimelerle_bol(cumle, hedef) if belirtec_tahmini(cumle) > hedef else [cumle]
            )
            for j, parca in enumerate(parcalar):
                birimler.append((parca, i == len(cumleler) - 1 and j == len(parcalar) - 1))
    return birimler


def belgeyi_parcala(belge: Belge, hedef_belirtec: int = 220, ortusme_cumle: int = 1) -> list[Parca]:
    """Belgeyi parçalara böler."""
    parcalar: list[Parca] = []
    for baslik_yolu, govde in _bolumler(belge.metin):
        on_ek = f"{baslik_yolu.split(' › ')[-1]}\n" if baslik_yolu else ""
        tampon: list[str] = []
        for birim, _ in _birimler(govde, hedef_belirtec):
            aday = " ".join([*tampon, birim])
            if tampon and belirtec_tahmini(aday) > hedef_belirtec:
                parcalar.append(_parca_kur(belge, on_ek + " ".join(tampon), baslik_yolu, parcalar))
                ortusme = cumlelere_bol(" ".join(tampon))[-ortusme_cumle:] if ortusme_cumle else []
                if belirtec_tahmini(" ".join([*ortusme, birim])) > hedef_belirtec:
                    ortusme = []
                tampon = [*ortusme, birim]
            else:
                tampon.append(birim)
        if tampon:
            parcalar.append(_parca_kur(belge, on_ek + " ".join(tampon), baslik_yolu, parcalar))
    return parcalar


def _parca_kur(belge: Belge, metin: str, baslik_yolu: str, onceki: list[Parca]) -> Parca:
    sira = len(onceki)
    return Parca(
        kimlik=f"{belge.kimlik}-{sira}",
        belge_kimligi=belge.kimlik,
        kaynak=belge.kaynak,
        metin=metin.strip(),
        baslik_yolu=baslik_yolu,
        sira=sira,
    )
