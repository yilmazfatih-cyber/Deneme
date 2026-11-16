"""İstem yardımcıları: şablon kuralları, az-örnek seçimi, bağlam bütçesi, özetleyen bellek."""

import pytest

from yz.istem import (
    SABLONLAR,
    AzOrnekSecici,
    Ornek,
    OzetleyenBellek,
    mesaj_belirteci,
    mesajlari_sigdir,
    ornek_mesajlari,
    parcalari_sigdir,
    sablon,
)
from yz.istem.sablonlar import degiskenler
from yz.saglayici import AracCagrisi, Mesaj, Sahte


def test_iki_dilde_ayni_sablonlar_ve_degiskenler():
    """Kural: her şablon iki dilde de var ve aynı değişkenleri kullanır."""
    assert SABLONLAR["tr"].keys() == SABLONLAR["en"].keys()
    for ad in SABLONLAR["tr"]:
        assert degiskenler(SABLONLAR["tr"][ad]) == degiskenler(SABLONLAR["en"][ad]), ad


def test_sablon_doldurma_ve_hatalar():
    assert sablon("ajan_gozlem", gozlem="42") == "Gözlem: 42"
    assert sablon("ajan_gozlem", "en", gozlem="42") == "Observation: 42"
    with pytest.raises(KeyError, match="eksik değişken: gozlem"):
        sablon("ajan_gozlem")
    with pytest.raises(KeyError, match="şablon yok"):
        sablon("olmayan")
    with pytest.raises(ValueError, match="Bilinmeyen dil"):
        sablon("ajan_gozlem", "de", gozlem="x")


ORNEKLER = [
    Ornek("Kargom nerede, takip numarası çalışmıyor", "kargo"),
    Ornek("Faturamda fazla ücret var", "fatura"),
    Ornek("Ürünü iade etmek istiyorum", "iade"),
    Ornek("Ürün iadesi için ne yapmalıyım", "iade"),
    Ornek("Uygulama açılmıyor", "teknik"),
]


def test_az_ornek_secimi_benzerlik_sirasi():
    secici = AzOrnekSecici(ORNEKLER)
    secilen = secici.sec("iade etmek istediğim ürün", k=2)
    assert len(secilen) == 2 and all(o.cikti == "iade" for o in secilen)
    assert secilen[-1].girdi == "Ürünü iade etmek istiyorum"  # en benzer en sonda
    mesajlar = ornek_mesajlari(secilen)
    assert [m.rol for m in mesajlar] == ["user", "assistant", "user", "assistant"]


def test_az_ornek_cesitlilik_ve_butce():
    secici = AzOrnekSecici(ORNEKLER)
    cesitli = secici.sec("iade etmek istediğim ürün", k=2, cesitlilik=0.9)
    assert {o.cikti for o in cesitli} != {
        "iade"
    }  # neredeyse aynı iki iade örneği birlikte seçilmez
    assert (
        secici.sec("iade", k=3, belirtec_butcesi=12)
        and len(secici.sec("iade", k=3, belirtec_butcesi=12)) < 3
    )
    assert AzOrnekSecici([]).sec("x") == [] and secici.benzerlikler("iade").shape == (5,)


def test_parcalari_ve_mesajlari_sigdir():
    assert parcalari_sigdir(["a" * 26, "b" * 260, "c" * 26], butce=25) == ["a" * 26, "c" * 26]
    mesajlar = [Mesaj.sistem("kurallar"), *[Mesaj.kullanici(f"mesaj {i} " * 20) for i in range(10)]]
    sigan = mesajlari_sigdir(mesajlar, butce=150)
    assert sigan[0].rol == "system" and sigan[-1] == mesajlar[-1] and len(sigan) < len(mesajlar)
    assert mesaj_belirteci(sigan) <= 150
    uzun = mesajlari_sigdir([Mesaj.kullanici("x" * 5000)], butce=100)
    assert len(uzun) == 1 and len(uzun[0].icerik) < 5000  # tek mesaj sığmıyorsa kırpılır


def test_sigdirma_sahipsiz_arac_sonucunu_atar():
    mesajlar = [
        Mesaj.kullanici("x" * 2000),
        Mesaj.asistan("y" * 200, arac_cagrilari=[AracCagrisi(kimlik="1", ad="a")]),
        Mesaj.arac("1", "sonuç"),
        Mesaj.kullanici("son soru"),
    ]
    sigan = mesajlari_sigdir(mesajlar, butce=25)  # araç sonucu sığar, çağrısı sığmaz
    assert [m.rol for m in sigan] == ["user"] and sigan[0].icerik == "son soru"
    birlikte = mesajlari_sigdir(mesajlar[1:], butce=200)  # çağrı ve sonucu birlikte korunur
    assert [m.rol for m in birlikte] == ["assistant", "tool", "user"]


def test_ozetleyen_bellek():
    sahte = Sahte(kural=lambda istek: "Ali'nin siparişi 1234, iade istiyor.")
    bellek = OzetleyenBellek(sahte, sistem="Yardımcısın.", azami_belirtec=120, korunan_mesaj=2)
    for i in range(6):
        bellek.ekle(Mesaj.kullanici(f"Mesaj {i}: " + "ayrıntı " * 15))
    mesajlar = bellek.mesajlar()
    assert mesajlar[0].icerik == "Yardımcısın." and "1234" in mesajlar[1].icerik
    assert len(bellek.son_mesajlar) <= 3 and sahte.cagri_sayisi >= 1
    assert "ÖNCEKİ ÖZET" in sahte.istekler[-1].mesajlar[-1].icerik and bellek.kullanim.toplam > 0
