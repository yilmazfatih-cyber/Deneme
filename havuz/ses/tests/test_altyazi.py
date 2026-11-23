"""Altyazı biçimleri: SRT/WebVTT altın örnekleri, gidiş-dönüş, zaman biçimi, bölme ve örtüşme."""

import pytest

from ses.hatalar import BicimHatasi
from ses.stt.altyazi import (
    Ipucu,
    ipuclarina_bol,
    satirlara_bol,
    srt_coz,
    srt_uret,
    vtt_coz,
    vtt_uret,
    zaman_srt,
    zaman_vtt,
)
from ses.stt.tipler import Bolut, Kelime


@pytest.mark.parametrize(
    ("saniye", "srt", "vtt"),
    [(0, "00:00:00,000", "00:00:00.000"), (3723.5, "01:02:03,500", "01:02:03.500"),
     (59.9996, "00:01:00,000", "00:01:00.000"), (0.0004, "00:00:00,000", "00:00:00.000"),
     (360000.001, "100:00:00,001", "100:00:00.001"), (-1, "00:00:00,000", "00:00:00.000")],
)  # fmt: skip
def test_zaman_bicimi(saniye, srt, vtt):
    assert zaman_srt(saniye) == srt and zaman_vtt(saniye) == vtt


def test_srt_altin_ornek():
    ipuclari = [Ipucu(1.0, 3.5, "Merhaba dünya."), Ipucu(4.0, 6.25, "İkinci satır\nüçüncü")]
    assert srt_uret(ipuclari) == (
        "1\n00:00:01,000 --> 00:00:03,500\nMerhaba dünya.\n\n"
        "2\n00:00:04,000 --> 00:00:06,250\nİkinci satır\nüçüncü\n"
    )


def test_vtt_altin_ornek_ve_kacis():
    ipuclari = [Ipucu(0.5, 2.0, "a < b & c --> d")]
    assert vtt_uret(ipuclari) == "WEBVTT\n\n00:00:00.500 --> 00:00:02.000\na &lt; b &amp; c --&gt; d\n"
    assert vtt_uret([]) == "WEBVTT\n\n" and srt_uret([]) == ""


def test_bos_satir_bicimi_bozamaz():
    assert "\n\n" not in srt_uret([Ipucu(0, 1, "a\n\n\nb")]).split("\n", 2)[2]
    assert "-->" not in srt_uret([Ipucu(0, 1, "x --> y")]).split("\n", 2)[2]


def test_gidis_donus():
    ipuclari = [Ipucu(0.0, 1.234, "Bir"), Ipucu(1.5, 3.0, "İki & üç\n<dört>"), Ipucu(3600.001, 3601.5, "Ç")]
    assert srt_coz(srt_uret(ipuclari)) == ipuclari
    assert vtt_coz(vtt_uret(ipuclari)) == ipuclari


def test_vtt_ayrintilari_okunur():
    metin = (
        "\ufeffWEBVTT - başlık\n\nNOTE bir not\n\nkimlik-1\n00:00:01.000 --> 00:00:02.000 align:start\n"
        "Merhaba\n\n00:02.000 --> 00:03.000\nkısa zaman biçimi okunmaz\n"
    )
    assert vtt_coz(metin) == [Ipucu(1.0, 2.0, "Merhaba")]
    with pytest.raises(BicimHatasi, match="WEBVTT"):
        vtt_coz("1\n00:00:01,000 --> 00:00:02,000\nx\n")


def test_satirlara_bol_dengeli():
    assert satirlara_bol("kısa metin") == ["kısa metin"]
    satirlar = satirlara_bol("bu cümle iki satıra bölünecek kadar uzun bir türkçe cümledir", 42)
    assert len(satirlar) == 2 and all(len(s) <= 42 for s in satirlar)
    assert abs(len(satirlar[0]) - len(satirlar[1])) <= 10


def _kelimeli(metin, bas=0.0, adim=0.5):
    sozcukler = metin.split()
    kelimeler = [Kelime(baslangic=bas + i * adim, bitis=bas + (i + 1) * adim, metin=" " + s)
                 for i, s in enumerate(sozcukler)]  # fmt: skip
    return Bolut(baslangic=bas, bitis=bas + len(sozcukler) * adim, metin=" " + metin, kelimeler=kelimeler)


def test_sozcuk_zamanlariyla_bolme_sinirlara_uyar():
    metin = " ".join(f"sözcük{i}" for i in range(40))
    ipuclari = ipuclarina_bol([_kelimeli(metin)], azami_karakter=30, azami_satir=2, azami_sure=5.0)
    assert len(ipuclari) > 3
    for ipucu in ipuclari:
        satirlar = ipucu.metin.split("\n")
        assert len(satirlar) <= 2 and all(len(s) <= 30 for s in satirlar)
        assert ipucu.bitis - ipucu.baslangic <= 5.0 + 1e-9
    assert " ".join(i.metin.replace("\n", " ") for i in ipuclari) == metin


def test_cumle_sonunda_bolunur():
    ipuclari = ipuclarina_bol([_kelimeli("Bugün hava çok güzel ve sıcak. Yarın yağmur var.")])
    assert ipuclari[0].metin.replace("\n", " ") == "Bugün hava çok güzel ve sıcak."


def test_ortusme_yok_ve_en_kisa_sure():
    bolutler = [Bolut(baslangic=0.0, bitis=0.2, metin="Evet."), Bolut(baslangic=0.5, bitis=0.6, metin="Hayır."),
                Bolut(baslangic=5.0, bitis=5.1, metin="Tamam.")]  # fmt: skip
    ipuclari = ipuclarina_bol(bolutler, en_kisa_sure=0.7)
    assert ipuclari[0].bitis == 0.5  # sonrakini ezmez
    assert ipuclari[2].bitis == pytest.approx(5.7)  # en kısa görünme süresi
    for once, sonra in zip(ipuclari, ipuclari[1:], strict=False):
        assert once.bitis <= sonra.baslangic


def test_sozcuk_zamani_yoksa_orantili():
    bolut = Bolut(baslangic=10.0, bitis=20.0, metin="a " * 30 + "b " * 30)
    ipuclari = ipuclarina_bol([bolut], azami_karakter=20, azami_satir=1)
    assert ipuclari[0].baslangic == 10.0 and ipuclari[-1].bitis == pytest.approx(20.0)
    assert all(len(i.metin) <= 20 for i in ipuclari)


def test_gecersiz_ayar():
    with pytest.raises(BicimHatasi):
        ipuclarina_bol([], azami_karakter=5)
