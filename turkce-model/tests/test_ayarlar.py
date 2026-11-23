from pathlib import Path

import pytest

from turkce_model.ayarlar import (
    GOMME_KARARLARI,
    KARAR_VER,
    Ayarlar,
    AyarHatasi,
    ayarlari_yukle,
    eksik_karar_mesaji,
    gomme_uyarilari,
)

PROJE = Path(__file__).resolve().parents[1]


def test_depodaki_ayarlarda_gomme_kararlari_bos():
    ayarlar = ayarlari_yukle(PROJE / "ayarlar.toml")
    assert ayarlar.gomme.eksikler() == [ad for ad, _, _ in GOMME_KARARLARI]
    assert all(getattr(ayarlar.gomme, ad) == KARAR_VER for ad, _, _ in GOMME_KARARLARI)


def test_eksik_karar_mesaji_her_karari_anlatir():
    mesaj = eksik_karar_mesaji([ad for ad, _, _ in GOMME_KARARLARI])
    for ad, _, _ in GOMME_KARARLARI:
        assert f"gomme.{ad}" in mesaj
    assert "GOMME_KARARLARI.md" in mesaj


def test_gecersiz_kilma_degerleri():
    ayarlar = ayarlari_yukle(
        PROJE / "ayarlar.toml",
        ["gomme.boyut=384", "gomme.konum=rope", 'gomme.norm="rmsnorm"', "gomme.cikis_baglama=true", "egitim.tdk.ogrenme_orani=1e-3", "model.katman=4"],
    )
    assert ayarlar.gomme.boyut == 384 and ayarlar.gomme.konum == "rope" and ayarlar.gomme.norm == "rmsnorm"
    assert ayarlar.gomme.cikis_baglama is True
    assert ayarlar.tdk.ogrenme_orani == 1e-3 and ayarlar.meb.ogrenme_orani != 1e-3
    assert ayarlar.model.katman == 4
    assert ayarlar.kok == PROJE


def test_bilinmeyen_alan_hata():
    with pytest.raises(AyarHatasi, match="Bilinmeyen ayar"):
        ayarlari_yukle(None, ["gomme.renk=mavi"])
    with pytest.raises(AyarHatasi, match="Bilinmeyen"):
        ayarlari_yukle(None, ["egitim.baska.adim=3"])


def test_deney_adi_kararlardan_turetilir():
    ayarlar = ayarlari_yukle(
        None,
        [
            "gomme.boyut=256", "gomme.konum=alibi", "gomme.cikis_baglama=false", "gomme.faktor_boyutu=64",
            "gomme.kategori_gommesi=true", "gomme.bicim_paylasimi=true", "gomme.olcek=false", "gomme.norm=yok",
            "gomme.baslatma_std=otomatik", "gomme.dropout=0.1", "model.katman=4",
        ],
    )
    assert ayarlar.deney_adi.startswith("g256-alibi-ayri-f64-kat-bicim-soto-d0.1-k4-m")
    assert ayarlar.gomme.std() == pytest.approx(256**-0.5)


TAM = [
    "gomme.boyut=256", "gomme.konum=sinus", "gomme.cikis_baglama=true", "gomme.faktor_boyutu=0",
    "gomme.kategori_gommesi=false", "gomme.bicim_paylasimi=false", "gomme.olcek=false", "gomme.norm=yok",
    "gomme.baslatma_std=0.02", "gomme.dropout=0.0",
]


def test_her_karar_ve_model_ayari_deney_adini_degistirir():
    temel = ayarlari_yukle(None, TAM).deney_adi
    for degisim in ("gomme.baslatma_std=0.01", "gomme.dropout=0.1", "model.dropout=0.2", "model.baglam=256", "model.mlp=gelu"):
        assert ayarlari_yukle(None, [*TAM, degisim]).deney_adi != temel, degisim


def test_uyarilar():
    uyarilar = gomme_uyarilari(ayarlari_yukle(None, TAM).gomme)
    assert any("Sinüs" in u and "~35 kat" in u for u in uyarilar)  # 1 / (0,02 · √2) ≈ 35
    # Konum ya da kategori eklenirken √d, norm sonrasında da token/konum oranını belirler: "etkisiz" denmemeli.
    sinus = gomme_uyarilari(ayarlari_yukle(None, [*TAM, "gomme.olcek=true", "gomme.norm=layernorm"]).gomme)
    assert not any("etkisiz" in u for u in sinus) and any("oranını" in u for u in sinus)
    rope = gomme_uyarilari(ayarlari_yukle(None, [*TAM, "gomme.konum=rope", "gomme.olcek=true", "gomme.norm=layernorm"]).gomme)
    assert any("etkisiz" in u for u in rope)
    assert gomme_uyarilari(ayarlari_yukle(None, [*TAM, "gomme.dropout=yuksek"]).gomme) == []  # geçersizse uyarı yok


def test_model_ve_egitim_ayarlari_dogrulanir():
    from turkce_model.ayarlar import egitimi_dogrula, gommeyi_dogrula

    for degisim, parca in (
        ("model.bas_boyutu=0", "model.bas_boyutu"),
        ("model.katman=0", "model.katman"),
        ("model.norm=rms", "model.norm"),
        ("model.mlp=relu", "model.mlp"),
        ("model.bas_boyutu=32.0", "model.bas_boyutu"),
    ):
        ayarlar = ayarlari_yukle(None, [*TAM, degisim])
        with pytest.raises(AyarHatasi, match=parca):
            gommeyi_dogrula(ayarlar.gomme, ayarlar.model)
    ayarlar = ayarlari_yukle(None, [*TAM, "gomme.boyut=32"])
    with pytest.raises(AyarHatasi, match="örn. 64"):  # boyut < bas_boyutu: aynı değeri iki kez önermesin
        gommeyi_dogrula(ayarlar.gomme, ayarlar.model)
    for degisim in ("egitim.tdk.hassasiyet=float32", "egitim.tdk.kayip=hepsi", "egitim.tdk.yigin=0"):
        with pytest.raises(AyarHatasi):
            egitimi_dogrula(ayarlari_yukle(None, [degisim]).tdk, "tdk")


@pytest.mark.parametrize("deger", ["-1", str(2**63), str(2**64), "1.5", "true", '"7"'])
@pytest.mark.parametrize("asama", ["tdk", "meb"])
def test_egitim_tohumu_dogrulanir(asama, deger):
    # C4: tohum torch'a ve numpy'ye gider; aralık dışı değer eskiden eğitimde izleme dökümüyle çökerdi.
    from turkce_model.ayarlar import EN_BUYUK_EGITIM_TOHUMU, egitimi_dogrula

    ayarlar = ayarlari_yukle(None, [f"egitim.{asama}.tohum={deger}"])
    with pytest.raises(AyarHatasi, match=rf"Eğitim ayarlarında sorun var:\n  • egitim\.{asama}\.tohum 0 ile {EN_BUYUK_EGITIM_TOHUMU} "):
        egitimi_dogrula(getattr(ayarlar, asama), asama)
    for sinir in (0, EN_BUYUK_EGITIM_TOHUMU):  # sınırdaki değerler geçerli
        egitimi_dogrula(getattr(ayarlari_yukle(None, [f"egitim.{asama}.tohum={sinir}"]), asama), asama)


def test_kod_varsayilanlari_depodaki_ayar_dosyasiyla_ayni():
    """ayarlar.toml'suz çalışan kod (ör. testler, --ayarlar'sız betikler) depodaki dosyayla aynı ayarları kullanır."""
    dosya, kod = ayarlari_yukle(PROJE / "ayarlar.toml"), Ayarlar()
    for bolum in ("model", "tokenizer", "tdk", "meb", "yollar", "moduller"):
        assert getattr(dosya, bolum) == getattr(kod, bolum), bolum
    # Aşama 2'deki TDK karışım yığınları tam bağlamdır: bellek aşama 1'i geçmesin; adım başına yine 16 dizi.
    assert kod.meb.yigin <= kod.tdk.yigin and kod.meb.yigin * kod.meb.birikim == 16
    assert not kod.moduller.ocr.model and not kod.moduller.metin.model  # modüller varsayılan olarak kapalı


def test_tokenizer_ve_yol_ayarlari_yuklenirken_dogrulanir(tmp_path):
    dosya = tmp_path / "ayarlar.toml"
    dosya.write_text("[tokenizer]\nboyut = 16.000\n", encoding="utf-8")  # geçerli TOML: 16.0
    with pytest.raises(AyarHatasi, match=r"tokenizer\.boyut .*\(şu an: 16\.0\); binlik ayırıcı kullanma: 16000"):
        ayarlari_yukle(dosya)
    for degisim, parca in (
        ("tokenizer.boyut=0", "tokenizer.boyut"),
        ("tokenizer.parca_orani=1.5", "tokenizer.parca_orani"),
        ("tokenizer.en_az_sayi=-1", "tokenizer.en_az_sayi"),
        ("tokenizer.em_turu=1.5", "tokenizer.em_turu"),
        ("tokenizer.harf_cezasi=-1", "tokenizer.harf_cezasi"),
        ('tokenizer.parca_cezasi="x"', "tokenizer.parca_cezasi"),
        ('yollar.veri=""', "yollar.veri"),
        ("yollar.ciktilar=5", "yollar.ciktilar"),
    ):
        with pytest.raises(AyarHatasi, match=parca):
            ayarlari_yukle(None, [degisim])
    for degisim in ("tokenizer.parca_orani=0", "tokenizer.parca_orani=1", "tokenizer.em_turu=0", "yollar.veri=/tmp/veri"):
        ayarlari_yukle(None, [degisim])  # sınırdaki değerler geçerli


def test_baglama_ve_olcek_uyarisi_baslatma_icin_deger_onermez():
    uyarilar = gomme_uyarilari(ayarlari_yukle(None, [*TAM, "gomme.olcek=true"]).gomme)  # bağlı, normsuz
    uyari = next(u for u in uyarilar if "cikis_baglama=true" in u)
    assert "GOMME_KARARLARI.md §7 ve §9" in uyari
    assert "ör." not in uyari and "otomatik" not in uyari and "0.0" not in uyari
