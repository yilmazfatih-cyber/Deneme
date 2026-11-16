"""Getirme (retrieval) değerlendirmesi: recall@k ve MRR.

Soru kümesi: her soru için ilgili kaynaklar (dosya adı ya da parça kimliği) verilir.
    recall@k : ilgili kaynaklardan kaçı ilk k sonuç içinde (soru başına oran, ortalaması)
    MRR      : ilk ilgili sonucun sırasının tersi (1/sıra), soru başına; bulunamazsa 0
JSONL biçimi (satır başına): {"soru": "...", "ilgili": ["iade.md", "fatura.md"]}
Kim kullanır: cli.py (`sor --getirme-olc`), tests/test_rag.py; arama kipi seçmek için kullanın
(karma / bm25 / vektor hangisi sizin belgelerinizde daha iyi?).
Genişletme: yeni ölçü (ör. nDCG) → `getirme_olc` içine ekleyin.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from yz.hatalar import VeriHatasi
from yz.rag.dizin import AramaKipi, AramaSonucu, RagDizini


@dataclass(frozen=True)
class GetirmeSorusu:
    soru: str
    ilgili: frozenset[str]  # kaynak adları ya da parça kimlikleri


@dataclass
class GetirmeOlcumu:
    k: int
    recall: float
    mrr: float
    soru_sayisi: int
    ayrinti: list[dict[str, object]] = field(default_factory=list)

    def ozet(self) -> str:
        return (
            f"recall@{self.k} = {self.recall:.3f}, MRR = {self.mrr:.3f} ({self.soru_sayisi} soru)"
        )


def _eslesir(sonuc: AramaSonucu, ilgili: frozenset[str]) -> str | None:
    for anahtar in (sonuc.parca.kimlik, sonuc.parca.kaynak):
        if anahtar in ilgili:
            return anahtar
    return None


def getirme_olc(
    dizin: RagDizini, sorular: list[GetirmeSorusu], k: int = 4, kip: AramaKipi = "karma"
) -> GetirmeOlcumu:
    if not sorular:
        raise VeriHatasi("Getirme ölçümü için en az bir soru gerekli.")
    toplam_recall = 0.0
    toplam_mrr = 0.0
    ayrinti: list[dict[str, object]] = []
    for soru in sorular:
        sonuclar = dizin.ara(soru.soru, k, kip)
        bulunan: set[str] = set()
        ilk_sira = 0
        for sira, sonuc in enumerate(sonuclar, start=1):
            anahtar = _eslesir(sonuc, soru.ilgili)
            if anahtar is not None:
                bulunan.add(anahtar)
                ilk_sira = ilk_sira or sira
        recall = len(bulunan) / len(soru.ilgili) if soru.ilgili else 0.0
        mrr = 1.0 / ilk_sira if ilk_sira else 0.0
        toplam_recall += recall
        toplam_mrr += mrr
        ayrinti.append(
            {"soru": soru.soru, "recall": recall, "mrr": mrr, "ilk_sira": ilk_sira or None}
        )
    n = len(sorular)
    return GetirmeOlcumu(k, toplam_recall / n, toplam_mrr / n, n, ayrinti)


def sorulari_yukle(yol: str | Path) -> list[GetirmeSorusu]:
    sorular: list[GetirmeSorusu] = []
    for no, satir in enumerate(Path(yol).read_text(encoding="utf-8").splitlines(), start=1):
        if not satir.strip():
            continue
        try:
            veri = json.loads(satir)
            sorular.append(GetirmeSorusu(str(veri["soru"]), frozenset(map(str, veri["ilgili"]))))
        except (ValueError, KeyError, TypeError) as hata:
            raise VeriHatasi(
                f'{yol}:{no}: satır {{"soru": ..., "ilgili": [...]}} biçiminde olmalı ({hata}).'
            ) from hata
    return sorular
