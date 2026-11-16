"""Gizli sınav testi (yz-parca-kaybi): parçalayıcı hiçbir kelimeyi kaybetmez; noktasız paragrafın sonu aranabilir."""

import random

from yz.rag.dizin import RagDizini
from yz.rag.parcala import belgeyi_parcala
from yz.rag.yukleyici import Belge

KALEMLER = " ".join(f"kalem{i} fiyatı {i * 10} lira" for i in range(1, 120))
FIYAT = f"# Fiyat listesi\n\n{KALEMLER} montaj ücreti 750 lira"


def _kapsanmayanlar(metin: str, hedef: int) -> set[str]:
    parcalar = belgeyi_parcala(Belge("b.md", metin), hedef_belirtec=hedef)
    birlesik = set(" ".join(p.metin for p in parcalar).split())
    govde = "\n".join(satir for satir in metin.split("\n") if not satir.startswith("#"))
    return set(govde.split()) - birlesik


def test_noktasiz_listenin_son_kalemi_son_parcada():
    parcalar = belgeyi_parcala(Belge("fiyat.md", FIYAT), hedef_belirtec=60)
    assert parcalar[-1].metin.endswith("750 lira")
    assert not _kapsanmayanlar(FIYAT, 60)


def test_rastgele_metinlerde_her_kelime_bir_parcada():
    rng = random.Random(11)
    sozcukler = [
        "fatura",
        "kargo",
        "iade",
        "ödeme",
        "teslimat",
        "ürün",
        "fiyat",
        "indirim",
        "süre",
        "gün",
    ]
    for _ in range(150):
        paragraflar = []
        for _ in range(rng.randint(1, 4)):
            uzunluk = rng.randint(5, 400)
            kelimeler = [f"{rng.choice(sozcukler)}{rng.randint(0, 999)}" for _ in range(uzunluk)]
            if rng.random() < 0.5:  # yarısı noktalı cümleler
                for konum in range(rng.randint(5, 15), len(kelimeler), rng.randint(6, 20)):
                    kelimeler[konum] += "."
            paragraflar.append(" ".join(kelimeler))
        metin = "# Başlık\n\n" + "\n\n".join(paragraflar)
        hedef = rng.choice([30, 60, 120, 220])
        assert not _kapsanmayanlar(metin, hedef), (hedef, metin[:80])


def test_dizinde_son_kalem_bulunur():
    dizin = RagDizini()
    dizin.ekle([Belge("fiyat.md", FIYAT)])
    sonuc = dizin.ara("montaj ücreti", 1, "bm25")
    assert sonuc and "montaj" in sonuc[0].parca.metin
