"""Yapılı çıkarım testleri: katmanlar, onarım döngüsü, şema yardımcıları, örnek şemaların kuralları."""

import json
from typing import Literal

import pytest
from pydantic import BaseModel, Field

from yz.hatalar import BaglantiHatasi, DesteklenmiyorHatasi, SaglayiciHatasi, YapiliCiktiHatasi
from yz.saglayici import Sahte, Yanit
from yz.yapili import Cikarici, cikar, iskelet, sema_ile_duzelt, turkce_sayi
from yz.yapili import semalar as ornek_semalar
from yz.yapili.sema_araclari import alan_listesi, hatalari_ozetle, refleri_ac
from yz.yapili.sema_modeli import json_semadan_model
from yz.yapili.semalar import Fatura, Iletisim, MesajSinifi

FATURA_JSON = '{"fatura_no": "A-1", "toplam": 25.0, "para_birimi": "TRY"}'


def test_sema_katmani_ilk_denemede_basarir_ve_bicimi_gonderir():
    sahte = Sahte([FATURA_JSON])
    sonuc = cikar(sahte, Fatura, "Fatura A-1, toplam 25 TL")
    assert sonuc.katman == "sema" and sonuc.onarim_turu == 0 and sonuc.deger is not None
    istek = sahte.istekler[0]
    assert istek.yanit_bicimi is not None and istek.yanit_bicimi.tur == "json_sema"
    assert "fatura_no (metin)" in istek.mesajlar[-1].icerik  # alan listesi istemde
    assert '"toplam": 0.0' in istek.mesajlar[-1].icerik  # örnek iskelet istemde


def test_desteklenmeyen_katmanlar_atlanir_ve_raporlanir():
    sahte = Sahte([
        DesteklenmiyorHatasi("şema yok"),
        SaglayiciHatasi("araç yok", durum_kodu=400),
        "```json\n" + FATURA_JSON + "\n```",
    ])  # fmt: skip
    sonuc = cikar(sahte, Fatura, "metin")
    assert sonuc.katman == "istem" and [d.katman for d in sonuc.denemeler] == [
        "sema",
        "arac",
        "istem",
    ]
    assert "desteklenmiyor" in sonuc.denemeler[0].hata and "kod_citi" in sonuc.notlar
    assert "BAŞARILI (katman: istem)" in sonuc.rapor()


def test_baglanti_hatasi_katman_atlatmaz():
    with pytest.raises(BaglantiHatasi):
        cikar(Sahte([BaglantiHatasi("kapalı", yeniden_denenebilir=True)]), Fatura, "metin")


def test_onarim_dongusu_hatayi_modele_geri_verir():
    sahte = Sahte(['{"fatura_no": "A-1", "para_birimi": "GBP"}', FATURA_JSON])
    sonuc = cikar(sahte, Fatura, "metin", katmanlar=["istem"])
    assert sonuc.basarili and sonuc.onarim_turu == 1
    onarim_istemi = sahte.istekler[1].mesajlar[-1].icerik
    assert "toplam: eksik alan" in onarim_istemi and "para_birimi" in onarim_istemi
    assert sahte.istekler[1].mesajlar[-2].rol == "assistant"  # modelin hatalı yanıtı geçmişte


def test_onarim_hakki_bitince_basarisiz_ve_zorla_hata_verir():
    sahte = Sahte(["düz yazı", "yine düz", "hala düz"])
    sonuc = cikar(sahte, Fatura, "metin", katmanlar=["istem"], azami_onarim=2)
    assert not sonuc.basarili and len(sonuc.denemeler) == 3
    with pytest.raises(YapiliCiktiHatasi, match="BAŞARISIZ"):
        sonuc.zorla()


def test_arac_katmani_argumanlari_dogrular_ve_hata_gozlemiyle_onarir():
    sahte = Sahte([
        Sahte.arac_yaniti("kaydet", {"kategori": "bilinmez", "aciliyet": "orta", "ozet": "x"}),
        Sahte.arac_yaniti("kaydet", {"Kategori": "İade", "aciliyet": "Yüksek", "ozet": "İade talebi"}, kimlik="c2"),
    ])  # fmt: skip
    sonuc = cikar(sahte, MesajSinifi, "Ürünü iade etmek istiyorum!", katmanlar=["arac"])
    assert sonuc.basarili and sonuc.deger == MesajSinifi(
        kategori="iade", aciliyet="yuksek", ozet="İade talebi"
    )
    assert {"anahtar_esleme", "enum_esleme"} <= set(sonuc.notlar)
    ikinci = sahte.istekler[1]
    assert (
        ikinci.arac_secimi == "kaydet"
        and ikinci.mesajlar[-1].rol == "tool"
        and ikinci.mesajlar[-1].arac_hatasi
    )


def test_arac_katmaninda_model_duz_json_yazarsa_kabul_edilir():
    sonuc = cikar(Sahte([Yanit(metin=FATURA_JSON)]), Fatura, "metin", katmanlar=["arac"])
    assert sonuc.basarili and "arac_yerine_metin" in sonuc.notlar


def test_arac_katmani_refleri_acar():
    sahte = Sahte([Sahte.arac_yaniti("kaydet", json.loads(FATURA_JSON))])
    cikar(sahte, Fatura, "metin", katmanlar=["arac"])
    parametreler = sahte.istekler[0].araclar[0].parametreler
    assert "$defs" not in parametreler and "$ref" not in json.dumps(parametreler)


def test_alan_katmani_tek_tek_sorar_ve_tipe_cevirir():
    sahte = Sahte(["Ayşe Yılmaz", "Telefon: 0532 111 22 33", "YOK", "`İzmir`."])
    sonuc = cikar(sahte, Iletisim, "Ayşe Yılmaz, İzmir, 0532 111 22 33", katmanlar=["alan"])
    assert sonuc.deger == Iletisim(
        ad_soyad="Ayşe Yılmaz", telefon="0532 111 22 33", eposta=None, sehir="İzmir"
    )
    assert sahte.cagri_sayisi == 4


def test_alan_katmani_karmasik_alani_json_olarak_ister():
    sahte = Sahte(
        [
            "A-9",
            "YOK",
            "YOK",
            "250,50",
            "TRY",
            '{"kalemler": [{"ad": "Kalem", "adet": 2, "birim_fiyat": "125,25"}]}',
        ]
    )
    sonuc = cikar(sahte, Fatura, "fatura metni", katmanlar=["alan"])
    assert sonuc.basarili and sonuc.deger is not None
    assert sonuc.deger.toplam == 250.5 and sonuc.deger.kalemler[0].birim_fiyat == 125.25


def test_bilinmeyen_katman_reddedilir():
    with pytest.raises(ValueError, match="Bilinmeyen katman"):
        Cikarici(Sahte(), Fatura, katmanlar=["sihir"])


@pytest.mark.parametrize(
    ("metin", "beklenen"),
    [("1.250,50 TL", 1250.5), ("1.250", 1250.0), ("12.5", 12.5), ("%18", 18.0), ("-3,5", -3.5),
     ("yaklaşık 1 250 TL", 1250.0), ("$1,240.00", 1240.0), ("1.234.567,8", 1234567.8), ("12,5 kg", 12.5),
     ("yok", None)],
)  # fmt: skip
def test_turkce_sayi(metin, beklenen):
    assert turkce_sayi(metin) == beklenen


def test_sema_ile_duzelt_yaygin_kusurlar():
    sema = Fatura.model_json_schema()
    deger, notlar = sema_ile_duzelt(
        {
            "fatura": {
                "Fatura No": 17,
                "Toplam": "1.020,00 TL",
                "para birimi": "eur",
                "kalemler": {"ad": "x", "adet": "2", "birim_fiyat": "5"},
            }
        },
        sema,
    )
    assert (
        deger["fatura_no"] == "17" and deger["toplam"] == 1020.0 and deger["para_birimi"] == "EUR"
    )
    assert deger["kalemler"] == [{"ad": "x", "adet": 2, "birim_fiyat": 5.0}]
    assert {
        "sarmalayici_acildi",
        "anahtar_esleme",
        "turkce_sayi",
        "enum_esleme",
        "tek_oge_liste",
        "sayi_metne",
    } <= set(notlar)
    Fatura.model_validate(deger)


def test_tarih_turkce_bicimden_isoya():
    """Gerçek deneme: Qwen2.5-0.5B tarihi "15.03.2024" yazdı ve İngilizce hata iletisiyle düzeltemedi."""
    from yz.yapili.sema_araclari import tarih_iso

    deger, notlar = sema_ile_duzelt({"tarih": "15.03.2024"}, Fatura.model_json_schema())
    assert deger["tarih"] == "2024-03-15" and "tarih_bicimi" in notlar
    assert tarih_iso("3 Ocak 2025") == "2025-01-03" and tarih_iso("31/12/2024") == "2024-12-31"
    assert tarih_iso("2024-03-15") is None and tarih_iso("45.13.2024") is None


def test_hata_iletileri_turkce_ve_eyleme_donuk():
    try:
        Fatura.model_validate(
            {"fatura_no": "1", "tarih": "dün", "toplam": "çok", "para_birimi": "GBP"}
        )
    except Exception as hata:
        ozet = hatalari_ozetle(hata)  # type: ignore[arg-type]
    assert (
        "tarih YYYY-AA-GG" in ozet
        and "yalnız sayı yazın" in ozet
        and "yalnız şunlardan biri" in ozet
    )


def test_evet_hayir_ve_bos_deger():
    class Sema(BaseModel):
        odendi: bool
        not_: str | None = None

    deger, _ = sema_ile_duzelt({"odendi": "Evet", "not_": "yok"}, Sema.model_json_schema())
    assert deger == {"odendi": True, "not_": None}


def test_alan_listesi_iskelet_ve_hata_ozeti():
    sema = Fatura.model_json_schema()
    liste = alan_listesi(sema)
    assert '- para_birimi (şunlardan biri: "TRY", "USD", "EUR"): Para birimi kodu' in liste
    assert "- tarih (tarih YYYY-AA-GG, yoksa null)" in liste
    assert "kalemler (liste: nesne {ad (metin), adet (tam sayı), birim_fiyat (sayı)})" in liste
    assert json.loads(iskelet(sema))["kalemler"] == [{"ad": "...", "adet": 0, "birim_fiyat": 0.0}]
    assert "en" not in alan_listesi(sema, dil="en") or "one of" in alan_listesi(sema, dil="en")
    try:
        Fatura.model_validate({"fatura_no": "1"})
    except Exception as hata:
        ozet = hatalari_ozetle(hata)  # type: ignore[arg-type]
    assert "- toplam: eksik alan" in ozet and "- para_birimi: eksik alan" in ozet


def test_refleri_ac_ozyinelemede_sinirli():
    class Dugum(BaseModel):
        ad: str
        cocuklar: list["Dugum"] = []

    acik = refleri_ac(Dugum.model_json_schema(), derinlik=2)
    assert "$ref" not in json.dumps(acik) and "$defs" not in acik


def test_json_semasindan_model():
    model = json_semadan_model({
        "type": "object", "title": "Kisi",
        "properties": {"ad": {"type": "string", "description": "Adı"}, "yas": {"type": ["integer", "null"]},
                       "durum": {"enum": ["aktif", "pasif"]}, "etiketler": {"type": "array", "items": {"type": "string"}},
                       "adres": {"type": "object", "properties": {"il": {"type": "string"}}, "required": ["il"]}},
        "required": ["ad", "durum"],
    })  # fmt: skip
    nesne = model.model_validate({"ad": "Ali", "durum": "aktif", "adres": {"il": "Van"}})
    assert nesne.ad == "Ali" and nesne.yas is None  # type: ignore[attr-defined]
    assert model.model_json_schema()["properties"]["ad"]["description"] == "Adı"
    with pytest.raises(Exception):  # noqa: B017
        model.model_validate({"ad": "Ali", "durum": "silinmiş"})


def test_ornek_semalar_kucuk_model_kurallarina_uyar():
    """Kural (yz/yapili/semalar.py başlığı): her alanın açıklaması var, en çok 8 alan."""
    for ad in dir(ornek_semalar):
        sinif = getattr(ornek_semalar, ad)
        if isinstance(sinif, type) and issubclass(sinif, BaseModel) and sinif is not BaseModel:
            alanlar = sinif.model_fields
            assert len(alanlar) <= 8, f"{ad}: en çok 8 alan olmalı"
            for alan_adi, alan in alanlar.items():
                assert alan.description, f"{ad}.{alan_adi}: Field(description=...) yazın"


def test_dil_ingilizce_sablonlari():
    class Sema(BaseModel):
        renk: Literal["kirmizi", "mavi"] = Field(description="Renk")

    sahte = Sahte(['{"renk": "mavi"}'])
    assert cikar(sahte, Sema, "blue car", dil="en", katmanlar=["istem"]).basarili
    assert "FIELDS:" in sahte.istekler[0].mesajlar[-1].icerik
