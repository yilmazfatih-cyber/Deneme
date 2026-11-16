"""Türkçe metin yardımcılarının testleri (harf dönüşümü, cümle bölme, kök, belirteç tahmini)."""

import pytest

from yz.metin import (
    belirtec_tahmini,
    buyuk_tr,
    cumlelere_bol,
    karakter_ngramlari,
    kelimeler,
    kirp,
    kok_bul,
    kucuk_tr,
    sadelestir,
)


def test_turkce_kucuk_buyuk_harf():
    assert kucuk_tr("IŞIK İZMİR") == "ışık izmir"
    assert buyuk_tr("ışık izmir") == "IŞIK İZMİR"
    # Python'un kendi işlevleri burada yanılır; yardımcılarımızın var olma nedeni budur.
    assert "IŞIK".lower() != "ışık"
    assert "izmir".upper() != "İZMİR"


def test_ayrik_yazilmis_i_harfi_birlestirilir():
    assert kucuk_tr("I\u0307stanbul") == "istanbul"


def test_sadelestir_anahtar_eslestirir():
    assert sadelestir("Toplam Tutar") == sadelestir("toplam_tutar") == sadelestir("toplamTutar")
    assert sadelestir("ÖĞRENCİ No.") == "ogrencino"
    assert sadelestir("IŞIK") == "isik"


@pytest.mark.parametrize(
    ("metin", "beklenen"),
    [
        ("Merhaba. Nasılsın? İyiyim!", ["Merhaba.", "Nasılsın?", "İyiyim!"]),
        ("Dr. Ayşe Yılmaz geldi. Sonra gitti.", ["Dr. Ayşe Yılmaz geldi.", "Sonra gitti."]),
        ("Fiyat 3.5 lira oldu. Zam geldi.", ["Fiyat 3.5 lira oldu.", "Zam geldi."]),
        ("Sözleşmenin 3. maddesi geçerlidir. Taraflar kabul eder.", None),
        ("T.C. Ziraat Bankası açıklama yaptı. Faiz değişmedi.", None),
        (
            "A. Kaya ve B. Demir toplandı. Karar çıktı.",
            ["A. Kaya ve B. Demir toplandı.", "Karar çıktı."],
        ),
        ("Elma, armut vb. meyveler alındı. Kasada ödendi.", None),
        ("Gerçekten mi?! Evet... Sanırım öyle.", ["Gerçekten mi?!", "Evet...", "Sanırım öyle."]),
        ('"Gel." dedi. Gittim.', ['"Gel." dedi.', "Gittim."]),
        ("1. Giriş yapın. 2. Ayarları açın.", ["1. Giriş yapın.", "2. Ayarları açın."]),
        ("Tek cümle noktasız", ["Tek cümle noktasız"]),
    ],
)
def test_cumlelere_bol(metin, beklenen):
    cumleler = cumlelere_bol(metin)
    if beklenen is None:
        assert len(cumleler) == 2, cumleler
    else:
        assert cumleler == beklenen


def test_cumlelere_bol_paragraf_siniri_ve_satir_sonu():
    metin = "Birinci satır\ndevam ediyor.\n\nİkinci paragraf noktasız"
    assert cumlelere_bol(metin) == ["Birinci satır devam ediyor.", "İkinci paragraf noktasız"]
    assert cumlelere_bol("   \n\n  ") == []


@pytest.mark.parametrize(
    ("kelime", "kok"),
    [
        ("evlerimizden", "ev"),
        ("kitabı", "kitap"),
        ("kitaplar", "kitap"),
        ("faturanın", "fatur"),
        ("fatura", "fatur"),
        ("çocuğun", "çocuk"),
        ("ağacı", "ağaç"),
        ("ödemeler", "ödem"),
        ("ödeme", "ödem"),
        ("su", "su"),
        ("ev", "ev"),
    ],
)
def test_kok_bul(kelime, kok):
    assert kok_bul(kelime) == kok


def test_kok_bul_ayni_kelimenin_cekimlerini_birlestirir():
    for cekimler in (
        ["sözleşme", "sözleşmenin", "sözleşmeler", "sözleşmede", "sözleşmeyi"],
        ["müşteri", "müşteriler", "müşterinin", "müşteriye", "müşteriden"],
        ["tarih", "tarihi", "tarihinde", "tarihler"],
    ):
        kokler = {kok_bul(c) for c in cekimler}
        assert len(kokler) == 1, (cekimler, kokler)


def test_kelimeler_kesme_isareti_ve_kip():
    assert kelimeler("Ankara'nın NÜFUSU", kok="yok") == ["ankara", "nüfusu"]
    assert kelimeler("İstanbul'da IŞIKLAR", kok="yok") == ["istanbul", "ışıklar"]
    assert kelimeler("faturaların toplamı", kok="onek") == ["fatur", "topla"]
    assert kelimeler("faturaların toplamı", kok="ek") == [
        kok_bul("faturaların"),
        kok_bul("toplamı"),
    ]
    assert kelimeler("2024 yılı 3. çeyrek", kok="yok") == ["2024", "yılı", "3", "çeyrek"]
    with pytest.raises(ValueError, match="kok"):
        kelimeler("x", kok="bilinmeyen")


def test_ascii_katla():
    from yz.metin import ascii_katla

    assert ascii_katla(kucuk_tr("IŞIK Ödeme İade")) == "isik odeme iade"
    assert ascii_katla(kucuk_tr("Invoice")) == "invoice"  # kucuk_tr tek başına "ınvoice" verir


def test_karakter_ngramlari():
    assert karakter_ngramlari("ev", 3) == ["_ev", "ev_"]
    assert karakter_ngramlari("a", 3) == ["_a_"]
    assert karakter_ngramlari("Ev ev", 3) == ["_ev", "ev_", "_ev", "ev_"]


def test_belirtec_tahmini_ve_kirp():
    assert belirtec_tahmini("") == 0
    assert belirtec_tahmini("a") == 1
    uzun = "Türkçe bir cümle. " * 100
    assert len(uzun) / 4 < belirtec_tahmini(uzun) < len(uzun) / 2
    assert kirp("kısa", 10) == "kısa"
    assert kirp("uzun bir metin", 6) == "uzun …"
