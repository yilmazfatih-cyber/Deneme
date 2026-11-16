"""Koruma katmanı testleri: sağlama algoritmaları, maskeleme/geri açma, süzgeçler, izin listesi."""

import random

import pytest
from pydantic import BaseModel

from yz.guvenlik import (
    AracIzinListesi,
    MaskeOturumu,
    gunluk_icin_maskele,
    iban_gecerli,
    kisisel_veri_bul,
    luhn_gecerli,
    maskele,
    maskeyi_ac,
    sema_suzgeci,
    suzgecleri_uygula,
    tckn_gecerli,
    telefon_gecerli,
    uzunluk_suzgeci,
    vkn_gecerli,
    yasakli_kalip_suzgeci,
)

GECERLI_TCKN = "10000000146"
GECERLI_VKN = "9815061622"
GECERLI_IBAN = "TR33 0006 1005 1978 6457 8413 26"
GECERLI_KART = "4111 1111 1111 1111"


def test_tckn_saglama():
    assert tckn_gecerli(GECERLI_TCKN)
    assert not tckn_gecerli("10000000147")  # son basamak bozuk
    assert not tckn_gecerli("10000000156")  # 10. basamak bozuk
    assert not tckn_gecerli("00000000000")  # ilk rakam 0 olamaz
    assert not tckn_gecerli("1000000014")  # 10 rakam
    assert not tckn_gecerli("1000000014a")


def _vkn_bagimsiz(s: str) -> bool:
    """VKN algoritmasının farklı yazılmış ikinci gerçeklemesi (karşılaştırma için)."""
    toplam = 0
    for i, harf in enumerate(s[:9]):
        p = (int(harf) + 10 - (i + 1)) % 10
        toplam += 9 if p == 9 else (p * pow(2, 10 - (i + 1))) % 9
    return str((10 - toplam % 10) % 10) == s[9]


def test_vkn_saglama_bagimsiz_gerceklemeyle_ayni():
    assert vkn_gecerli(GECERLI_VKN)
    assert not vkn_gecerli("9815061623")
    assert not vkn_gecerli("0000000000")
    rastgele = random.Random(7)
    for _ in range(2000):
        aday = "".join(str(rastgele.randint(0, 9)) for _ in range(10))
        if aday != "0000000000":
            assert vkn_gecerli(aday) == _vkn_bagimsiz(aday), aday


def test_iban_mod97():
    assert iban_gecerli(GECERLI_IBAN)
    assert iban_gecerli("tr330006100519786457841326")  # küçük harf ve boşluksuz
    assert iban_gecerli("GB82 WEST 1234 5698 7654 32")
    assert iban_gecerli("DE89370400440532013000")
    assert not iban_gecerli("TR33 0006 1005 1978 6457 8413 27")
    assert not iban_gecerli("TR33 0006 1005 1978 6457 8413")  # TR 26 karakter olmalı
    assert not iban_gecerli("merhaba")


def test_luhn_ve_telefon():
    assert luhn_gecerli(GECERLI_KART)
    assert luhn_gecerli("5555-5555-5555-4444")
    assert not luhn_gecerli("4111 1111 1111 1112")
    assert not luhn_gecerli("0000 0000 0000 0000")
    assert not luhn_gecerli("411111")
    for numara in ["0532 123 45 67", "+90 532 123 45 67", "00905321234567", "(212) 555 12 34"]:
        assert telefon_gecerli(numara), numara
    assert not telefon_gecerli("0132 123 45 67")  # alan kodu 1 ile başlamaz
    assert not telefon_gecerli("532 123 45")


def test_maskele_butun_turler_ve_geri_ac():
    metin = (
        f"Kimlik {GECERLI_TCKN}, vergi no {GECERLI_VKN}, hesap {GECERLI_IBAN}, kart {GECERLI_KART}, "
        "cep 0532 123 45 67, e-posta ayse.yilmaz@ornek.com.tr"
    )
    maskeli, oturum = maskele(metin)
    for gizli in (GECERLI_TCKN, GECERLI_VKN, "0006 1005", "4111", "532 123", "ayse.yilmaz"):
        assert gizli not in maskeli
    for etiket in ("[TCKN_1]", "[VKN_1]", "[IBAN_1]", "[KART_1]", "[TELEFON_1]", "[EPOSTA_1]"):
        assert etiket in maskeli
    assert maskeyi_ac(maskeli, oturum) == metin


def test_gecersiz_numaralar_maskelenmez():
    metin = "Sipariş 10000000147, takip 1234567891, sayı 4111 1111 1111 1112"
    assert maskele(metin)[0] == metin
    assert kisisel_veri_bul("12 Mart 2024 tarihinde 3.500 TL") == []


def test_ayni_deger_ayni_yer_tutucu_ve_oturum_surer():
    oturum = MaskeOturumu()
    ilk, _ = maskele(f"{GECERLI_TCKN} ve yine {GECERLI_TCKN}", oturum)
    assert ilk == "[TCKN_1] ve yine [TCKN_1]"
    ikinci, _ = maskele("Yeni kişi 0532 123 45 67, eski 05321234567", oturum)
    assert ikinci == "Yeni kişi [TELEFON_1], eski [TELEFON_1]"  # yazım farklı, numara aynı
    assert not oturum.bos


def test_maskeyi_ac_modelin_bozdugu_yer_tutucuyu_tanir():
    _, oturum = maskele(f"{GECERLI_TCKN} {GECERLI_IBAN}")
    yanit = "Sayın [tckn 1], [IBAN-1] hesabınız ve [BILINMEYEN_3] için işlem yapıldı."
    acik = maskeyi_ac(yanit, oturum)
    assert GECERLI_TCKN in acik and GECERLI_IBAN in acik
    assert "[BILINMEYEN_3]" in acik


def test_sirlar_maskelenir():
    metin = (
        "Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345 ve anahtar sk-proj_ABCDEFGH12345678 "
        'ayrıca parola: "CokGizli123" token=hf_abcdefghijklmnopqrstuv'
    )
    temiz = gunluk_icin_maskele(metin)
    for gizli in (
        "abcdefghijklmnopqrstuvwxyz012345",
        "sk-proj_ABCDEFGH12345678",
        "CokGizli123",
        "hf_abc",
    ):
        assert gizli not in temiz
    assert "[SIR_1]" in temiz


def test_tur_secimi():
    metin = f"{GECERLI_TCKN} ayse@ornek.com"
    assert maskele(metin, turler={"EPOSTA"})[0] == f"{GECERLI_TCKN} [EPOSTA_1]"
    with pytest.raises(ValueError, match="Bilinmeyen tür"):
        maskele(metin, turler={"PLAKA"})


class _Sema(BaseModel):
    ad: str
    yas: int


def test_suzgecler():
    assert suzgecleri_uygula("kısa", [uzunluk_suzgeci(10)]).gecti
    sonuc = suzgecleri_uygula("çok uzun bir yanıt", [uzunluk_suzgeci(5)])
    assert not sonuc.gecti and "çok uzun" in sonuc.ihlaller[0]
    yasak = yasakli_kalip_suzgeci(["iade garantisi", "ışık hızı"])
    assert not suzgecleri_uygula("Size İADE GARANTİSİ veriyoruz", [yasak]).gecti  # İ/i eşleşir
    assert not suzgecleri_uygula("IŞIK HIZI ile", [yasak]).gecti  # I/ı eşleşir
    assert suzgecleri_uygula("Sorun yok", [yasak]).gecti
    kalip = yasakli_kalip_suzgeci([r"\b\d{11}\b"], duzenli_ifade=True)
    assert not suzgecleri_uygula("no: 12345678901", [kalip]).gecti
    sema = sema_suzgeci(_Sema)
    assert suzgecleri_uygula('{"ad": "Ali", "yas": 3}', [sema]).gecti
    assert "yas" in suzgecleri_uygula('{"ad": "Ali"}', [sema]).ihlaller[0]
    assert "JSON" in suzgecleri_uygula("düz yazı", [sema]).ihlaller[0]
    hepsi = suzgecleri_uygula("iade garantisi" * 5, [uzunluk_suzgeci(5), yasak, sema])
    assert len(hepsi.ihlaller) == 3


def test_arac_izin_listesi():
    serbest = AracIzinListesi()
    assert serbest.izinli_mi("hesapla")
    kisitli = AracIzinListesi.yalniz({"hesapla", "simdi"})
    assert kisitli.izinli_mi("hesapla") and not kisitli.izinli_mi("dosya_oku")
    assert "hesapla" in kisitli.neden("dosya_oku")
    yasakli = AracIzinListesi(yasakli=frozenset({"sql_sorgula"}))
    assert not yasakli.izinli_mi("sql_sorgula") and yasakli.izinli_mi("hesapla")
