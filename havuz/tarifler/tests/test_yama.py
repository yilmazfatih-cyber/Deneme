"""Yama üretme/uygulama: gidiş-dönüş, kaymış satırlar, tutmayan bağlam, satır sonu olmayan dosya.

Başvuru: aynı farkın `difflib` ile üretilip kendi uygulayıcımızla geri kurulması (gidiş-dönüş) ve elle
yazılmış küçük örnekler. Genişletme: yeni bir yama durumu → bir gidiş-dönüş örneği ekleyin.
"""

from __future__ import annotations

import random

import pytest

from tarifcik.yama import YamaHatasi, yama_uret, yama_uygula

ESKI = "".join(f"satır {i}\n" for i in range(1, 41))


def degistir(metin: str) -> str:
    satirlar = metin.splitlines(keepends=True)
    satirlar[4] = "değişti 5\n"
    satirlar.insert(20, "eklendi\n")
    del satirlar[30]
    satirlar.append("son\n")
    return "".join(satirlar)


def test_gidis_donus() -> None:
    yeni = degistir(ESKI)
    yama = yama_uret(ESKI, yeni, "a.txt")
    assert yama.startswith("--- a/a.txt\n+++ b/a.txt\n")
    assert yama_uygula(ESKI, yama) == yeni


def test_rastgele_gidis_donus_belirlenimci() -> None:
    uretec = random.Random(7)
    for _ in range(50):
        satirlar = [f"s{uretec.randrange(8)}\n" for _ in range(uretec.randrange(0, 30))]
        eski = "".join(satirlar)
        for _ in range(uretec.randrange(1, 4)):
            konum = uretec.randrange(len(satirlar) + 1)
            if satirlar and uretec.random() < 0.5:
                satirlar.pop(min(konum, len(satirlar) - 1))
            else:
                satirlar.insert(konum, f"yeni{uretec.randrange(100)}\n")
        yeni = "".join(satirlar)
        if eski != yeni:
            assert yama_uygula(eski, yama_uret(eski, yeni, "x")) == yeni


def test_satirlar_kaysa_da_uygulanir() -> None:
    yeni = degistir(ESKI)
    yama = yama_uret(ESKI, yeni, "a.txt")
    onune_eklenmis = "başlık 1\nbaşlık 2\n" + ESKI
    assert yama_uygula(onune_eklenmis, yama) == "başlık 1\nbaşlık 2\n" + yeni


def test_tutmayan_baglam_yol_gosteren_hata_verir() -> None:
    yama = yama_uret(ESKI, degistir(ESKI), "a.txt")
    bozuk = ESKI.replace("satır 5\n", "başka 5\n")
    with pytest.raises(YamaHatasi, match=r"parça uygulanamadı.*yakala"):
        yama_uygula(bozuk, yama, "a.txt")


def test_son_satirda_satir_sonu_olmayan_dosya() -> None:
    eski = "bir\niki\nüç"
    yeni = "bir\nİKİ\nüç\ndört"
    yama = yama_uret(eski, yeni, "b.txt")
    assert "\\ No newline at end of file" in yama
    assert yama_uygula(eski, yama) == yeni


def test_bos_dosyaya_ekleme() -> None:
    assert yama_uygula("", yama_uret("", "a\nb\n", "c.txt")) == "a\nb\n"


def test_tanınmayan_satir_reddedilir() -> None:
    with pytest.raises(YamaHatasi, match="tanınmıyor"):
        yama_uygula("a\n", "--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n?a\n")
    with pytest.raises(YamaHatasi, match="parçası"):
        yama_uygula("a\n", "--- a/x\n+++ b/x\n")
