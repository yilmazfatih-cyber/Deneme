"""BM25 ve RRF'nin elle hesaplanmış örneklerle doğruluğu.

Belgeler (belirteçler):  d0 = [armut, kiraz, armut]  d1 = [kiraz, incir]  d2 = [incir, incir, incir, armut]
N = 3, ortalama uzunluk = 9 / 3 = 3, k1 = 1.5, b = 0.75. Her terim 2 belgede geçer:
    IDF = ln(1 + (3 − 2 + 0.5) / (2 + 0.5)) = ln(1.6) = 0.4700036292
Sorgu "armut":
    d0: f=2, |d|=3 → payda = 2 + 1.5·(0.25 + 0.75·3/3) = 3.5   → IDF·2·2.5/3.5   = 0.6714337560
    d2: f=1, |d|=4 → payda = 1 + 1.5·(0.25 + 0.75·4/3) = 2.875 → IDF·1·2.5/2.875 = 0.4086988080
Sorgu "kiraz incir":
    d0: kiraz f=1, |d|=3 → payda 2.5 → IDF·1                                          = 0.4700036292
    d1: kiraz ve incir f=1, |d|=2 → payda = 1 + 1.5·(0.25 + 0.5) = 2.125 → 2·IDF·2.5/2.125 = 1.1058908922
    d2: incir f=3, |d|=4 → payda = 3 + 1.875 = 4.875 → IDF·3·2.5/4.875                  = 0.7230825065
"""

import math

import pytest

from yz.rag import BM25, belirtecle, rrf_birlestir

BELGELER = ["armut kiraz armut", "kiraz incir", "incir incir incir armut"]


def test_belirtecler_beklendigi_gibi():
    assert [belirtecle(b) for b in BELGELER] == [
        ["armut", "kiraz", "armut"],
        ["kiraz", "incir"],
        ["incir", "incir", "incir", "armut"],
    ]


def test_bm25_elle_hesaplanmis_puanlar():
    bm25 = BM25(k1=1.5, b=0.75)
    bm25.ekle(BELGELER)
    assert bm25.idf("armut") == pytest.approx(math.log(1.6))
    assert bm25.puanlar("armut") == pytest.approx({0: 0.6714337560, 2: 0.4086988080})
    assert bm25.puanlar("kiraz incir") == pytest.approx(
        {0: 0.4700036292, 1: 1.1058908922, 2: 0.7230825065}
    )
    assert [i for i, _ in bm25.ara("kiraz incir", 3)] == [1, 2, 0]
    assert bm25.puanlar("muz") == {} and BM25().puanlar("armut") == {}


def test_bm25_kaba_kuvvet_formulle_ayni():
    """Rastgele küçük derlemde ters dizin sonucu, formülün doğrudan uygulamasıyla aynı olmalı."""
    import random

    rastgele = random.Random(3)
    sozluk = ["masa", "kalem", "defter", "silgi", "çanta", "kitap"]
    belgeler = [
        " ".join(rastgele.choice(sozluk) for _ in range(rastgele.randint(1, 8))) for _ in range(25)
    ]
    bm25 = BM25()
    bm25.ekle(belgeler)
    belirtecli = [belirtecle(b) for b in belgeler]
    ortalama = sum(map(len, belirtecli)) / len(belirtecli)
    sorgu = "kalem kitap kitap"

    def dogrudan(d: list[str]) -> float:
        toplam = 0.0
        for terim in belirtecle(sorgu):
            n = sum(terim in b for b in belirtecli)
            if not n or terim not in d:
                continue
            idf = math.log(1 + (len(belirtecli) - n + 0.5) / (n + 0.5))
            f = d.count(terim)
            toplam += idf * f * 2.5 / (f + 1.5 * (0.25 + 0.75 * len(d) / ortalama))
        return toplam

    puanlar = bm25.puanlar(sorgu)
    for i, d in enumerate(belirtecli):
        assert puanlar.get(i, 0.0) == pytest.approx(dogrudan(d))


def test_bm25_turkce_ekleri_eslestirir_ve_durak_kelimeleri_atar():
    bm25 = BM25()
    bm25.ekle(["Faturaların ödeme tarihi", "Kargo ve teslimat", "İADE süresi"])
    assert bm25.ara("faturanın tarihleri", 1)[0][0] == 0
    assert bm25.ara("iade", 1)[0][0] == 2  # İ/i büyük harf dönüşümü doğru
    assert bm25.puanlar("ve") == {}  # durak kelimesi
    ngram = BM25(kip="ngram")
    ngram.ekle(["teslimat süresi"])
    assert ngram.puanlar("teslimatt")  # yazım hatasına dayanıklı


def test_rrf_elle_hesaplanmis():
    sonuc = rrf_birlestir([[1, 2, 3], [3, 1]], k=60)
    assert [k for k, _ in sonuc] == [1, 3, 2]
    assert dict(sonuc) == pytest.approx({1: 1 / 61 + 1 / 62, 3: 1 / 63 + 1 / 61, 2: 1 / 62})
