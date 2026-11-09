from kap_karar.sinif import baz_puan, siniflandir, yuzdeler


def test_tcmb_metni():
    s = siniflandir("TCMB, PPK toplantısında politika faizini 100 baz puan indirerek yüzde 37'den yüzde 36'ya çekti. Karar beklentilerle uyumlu.")
    assert s.tur == "tcmb_faiz_karari"
    assert s.parametreler["degisim_bp"] == -100
    assert s.parametreler["yeni_faiz"] == 36


def test_bedelsiz_metni():
    s = siniflandir("Çıkarılmış sermayenin Sermaye Düzeltmesi Olumlu Farkları hesabından karşılanmak üzere %200 oranında bedelsiz artırılmasına karar verilmiştir.")
    assert s.tur == "bedelsiz_sermaye_artirimi"
    assert s.parametreler["oran"] == 200


def test_sozlesme_metni():
    s = siniflandir("ASELS NATO üyesi bir ülkeye 410 milyon dolar tutarında ihracat sözleşmesi imzaladı.")
    assert s.tur == "yeni_sozlesme"
    assert s.parametreler["karsi_taraf"] == "ihracat"
    assert s.parametreler["tutar"] == 410_000_000


def test_kredi_notu_duragana():
    s = siniflandir("Fitch, Türkiye'nin BB- notunu teyit etti; görünümü pozitiften durağana çevirdi.")
    assert s.tur == "kredi_notu_ulke"
    assert s.parametreler["eylem"] == "gorunum_negatif"


def test_yardimcilar():
    assert yuzdeler("yüzde 2,58 arttı, %29,77 oldu") == [2.58, 29.77]
    assert baz_puan("faizi 150 baz puan indirdi") == -150
    assert baz_puan("faizi sabit tuttu") == 0


def test_bilinmeyen_metin():
    import pytest
    with pytest.raises(ValueError):
        siniflandir("bugün hava güzel")


def test_kisaltma_kucuk_harf():
    s = siniflandir("MSCI Türkiye endeks değişikliklerini dondurdu")
    assert s.tur == "endeks_saglayici_karari"
    assert s.parametreler["eylem"] == "askiya_alma"


def test_tarife():
    s = siniflandir("Karşılıklı tarifeler yürürlüğe girdi; Türkiye %15 orana tabi tutuldu")
    assert s.tur == "kuresel_ticaret"
    assert s.parametreler["yon"] == "tirmanma" and s.parametreler["turkiye_orani"] == 15
