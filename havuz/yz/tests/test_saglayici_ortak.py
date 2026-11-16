"""Sağlayıcı katmanının ortak parçaları: Sahte, önbellek, günlük, maliyet, yeniden deneme, ayarlar."""

import json
import random

import pytest

from yz.ayar import ModelFiyati, ayarlari_yukle
from yz.hatalar import AyarHatasi, SaglayiciHatasi
from yz.saglayici import (
    DiskOnbellek,
    FiyatTablosu,
    IstekGunlugu,
    Kullanim,
    KullanimSayaci,
    Mesaj,
    Sahte,
    Yanit,
    YenidenDenemeAyari,
    saglayici_olustur,
)
from yz.saglayici.dusunce import DusunceAyirici, dusunce_ayir
from yz.saglayici.tipler import mesajlari_coz, yanit_bicimi_coz
from yz.saglayici.yeniden_dene import bekleme_suresi, yeniden_dene
from yz.yapili.semalar import Iletisim


def test_sahte_betik_sirasi_istisna_ve_bitis():
    sahte = Sahte(
        [
            "bir",
            Yanit(metin="iki"),
            lambda istek: f"üç:{len(istek.mesajlar)}",
            SaglayiciHatasi("dört"),
        ]
    )
    assert sahte.sohbet("a").metin == "bir"
    assert sahte.sohbet("a").metin == "iki"
    assert sahte.sohbet([Mesaj.sistem("s"), Mesaj.kullanici("a")]).metin == "üç:2"
    with pytest.raises(SaglayiciHatasi, match="dört"):
        sahte.sohbet("a")
    with pytest.raises(SaglayiciHatasi, match="betiği bitti"):
        sahte.sohbet("a")
    assert sahte.cagri_sayisi == 5


def test_sahte_arac_yaniti_ve_akis():
    yanit = Sahte([Sahte.arac_yaniti("hesapla", {"ifade": "1+1"})]).sohbet("x")
    assert yanit.bitis_nedeni == "arac" and yanit.arac_cagrilari[0].ad == "hesapla"
    parcalar = list(Sahte(["akış metni burada"], parca_boyu=5).sohbet("x", akis=True))
    assert "".join(p.metin for p in parcalar) == "akış metni burada"
    assert parcalar[-1].son is not None and parcalar[-1].son.metin == "akış metni burada"


def test_mesaj_girdisi_bicimleri():
    mesajlar = mesajlari_coz(
        [{"role": "system", "content": "s"}, {"rol": "user", "icerik": "a"}, "b"]
    )
    assert [m.rol for m in mesajlar] == ["system", "user", "user"]
    with pytest.raises(ValueError, match="En az bir mesaj"):
        mesajlari_coz([])


def test_yanit_bicimi_coz():
    assert yanit_bicimi_coz("json").tur == "json"  # type: ignore[union-attr]
    bicim = yanit_bicimi_coz(Iletisim)
    assert bicim is not None and bicim.ad == "Iletisim" and "ad_soyad" in bicim.sema["properties"]  # type: ignore[index]
    with pytest.raises(ValueError):
        yanit_bicimi_coz("xml")


def test_kullanim_saglayici_bildirmezse_tahmin_edilir():
    yanit = Sahte([Yanit(metin="kısa yanıt")]).sohbet("uzunca bir soru metni")
    assert yanit.kullanim.toplam > 0  # Sahte kendi sayar
    from yz.saglayici.taban import kullanim_tahmini

    istek = Sahte().istek_kur("merhaba dünya")
    tahmin = kullanim_tahmini(istek, Yanit(metin="selam"))
    assert tahmin.tahmini and tahmin.girdi_belirteci > 0 and tahmin.cikti_belirteci > 0


def test_onbellek_isabet_iska_ve_sicaklik(tmp_path):
    onbellek = DiskOnbellek(tmp_path / "ob")
    sahte = Sahte(["ilk", "ikinci", "üçüncü"], onbellek=onbellek)
    assert sahte.sohbet("soru").metin == "ilk"
    tekrar = sahte.sohbet("soru")
    assert tekrar.metin == "ilk" and tekrar.kullanim.onbellekten  # modele gidilmedi
    assert sahte.cagri_sayisi == 1 and onbellek.isabet == 1
    assert sahte.sohbet("soru", sicaklik=0.7).metin == "ikinci"  # rastgele istek önbelleğe alınmaz
    assert sahte.sohbet("soru", sicaklik=0.7).metin == "üçüncü"
    assert sahte.sayac.onbellek_isabeti == 1


def test_onbellek_bozuk_dosyayi_iska_sayar(tmp_path):
    onbellek = DiskOnbellek(tmp_path)
    onbellek.koy("ab" * 32, Yanit(metin="x"))
    (tmp_path / "ab" / f"{'ab' * 32}.json").write_text("{bozuk", encoding="utf-8")
    assert onbellek.al("ab" * 32) is None
    assert onbellek.temizle() == 1


def test_gunluk_kisisel_veri_ve_sir_yazmaz(tmp_path):
    gunluk = IstekGunlugu(tmp_path / "g.jsonl", saat=lambda: 1.0)
    sahte = Sahte(["IBAN'ınız TR33 0006 1005 1978 6457 8413 26 kaydedildi."], gunluk=gunluk)
    sahte.sohbet("TCKN 10000000146, api_key=sk-abcdefghijklmnop1234, e-posta ali@ornek.com")
    satir = (tmp_path / "g.jsonl").read_text(encoding="utf-8")
    for gizli in ("10000000146", "sk-abcdefghijklmnop1234", "ali@ornek.com", "1978 6457"):
        assert gizli not in satir
    kayit = json.loads(satir)
    assert kayit["zaman"] == 1.0 and "[TCKN_1]" in kayit["mesajlar"][0]["icerik"]


def test_gunluk_hata_kaydi(tmp_path):
    gunluk = IstekGunlugu(tmp_path / "g.jsonl")
    with pytest.raises(SaglayiciHatasi):
        Sahte([SaglayiciHatasi("çöktü")], gunluk=gunluk).sohbet("x")
    assert "çöktü" in json.loads((tmp_path / "g.jsonl").read_text(encoding="utf-8"))["hata"]


def test_fiyat_tablosu_ve_sayac():
    tablo = FiyatTablosu(
        fiyatlar={
            "qwen*": ModelFiyati(girdi=1.0, cikti=2.0),
            "qwen-ozel": ModelFiyati(girdi=10, cikti=10),
        }
    )
    kullanim = Kullanim(girdi_belirteci=1_000_000, cikti_belirteci=500_000)
    assert tablo.maliyet("qwen2.5", kullanim) == pytest.approx(2.0)
    assert tablo.maliyet("qwen-ozel", kullanim) == pytest.approx(15.0)  # tam ad kalıptan önce
    assert tablo.maliyet("bilinmeyen", kullanim) is None
    assert tablo.maliyet("qwen2.5", Kullanim(girdi_belirteci=5, onbellekten=True)) == 0.0
    sayac = KullanimSayaci()
    sayac.ekle(kullanim, 2.0)
    sayac.ekle(Kullanim(girdi_belirteci=1), None)
    assert (
        sayac.cagri == 2 and sayac.maliyeti_bilinmeyen_cagri == 1 and "bilinmiyor" in sayac.ozet()
    )


def test_maliyet_saglayicida_birikir():
    tablo = FiyatTablosu(fiyatlar={"sahte-model": ModelFiyati(girdi=1_000_000, cikti=0)})
    sahte = Sahte(["a"], fiyatlar=tablo)
    sahte.sohbet("bir iki üç")
    assert sahte.sayac.maliyet == pytest.approx(sahte.sayac.girdi_belirteci)


def test_yeniden_dene_ustel_ve_retry_after():
    ayar = YenidenDenemeAyari(
        azami_deneme=4, taban_sn=1.0, carpan=2.0, titresim=0.0, azami_bekleme_sn=5.0
    )
    rastgele = random.Random(0)
    assert [bekleme_suresi(i, ayar, rastgele) for i in (1, 2, 3, 4)] == [1.0, 2.0, 4.0, 5.0]
    beklemeler: list[float] = []
    hatalar = iter(
        [
            SaglayiciHatasi("a", yeniden_denenebilir=True, bekleme_sn=3.0),
            SaglayiciHatasi("b", yeniden_denenebilir=True),
        ]
    )

    def islem() -> str:
        hata = next(hatalar, None)
        if hata:
            raise hata
        return "tamam"

    assert yeniden_dene(islem, ayar, uyu=beklemeler.append) == "tamam"
    assert beklemeler == [3.0, 2.0]
    with pytest.raises(SaglayiciHatasi, match="kalıcı"):
        yeniden_dene(
            lambda: (_ for _ in ()).throw(SaglayiciHatasi("kalıcı")), ayar, uyu=beklemeler.append
        )


def test_dusunce_ayirici_parcali_etiket():
    ayirici = DusunceAyirici()
    cikti = [
        ayirici.besle(p)
        for p in ["Ön", "<th", "ink>gizli", " düşünce</thi", "nk>\n\nGörünen", " metin"]
    ]
    metin = "".join(m for m, _ in cikti) + ayirici.bitir()[0]
    dusunce = "".join(d for _, d in cikti)
    assert metin == "ÖnGörünen metin" and dusunce == "gizli düşünce"
    assert dusunce_ayir("<think>yarım kaldı") == ("", "yarım kaldı")
    assert dusunce_ayir("düz metin") == ("düz metin", "")


def test_ayarlar_dosya_ve_ortam(tmp_path):
    dosya = tmp_path / "yz.yaml"
    dosya.write_text(
        "varsayilan: yerel\nsaglayicilar:\n  yerel:\n    taban_url: http://localhost:11434\n    model: m1\n"
        "fiyatlar:\n  m1: {girdi: 0.1, cikti: 0.2}\n",
        encoding="utf-8",
    )
    ayarlar = ayarlari_yukle(dosya, ortam={})
    ad, profil = ayarlar.profil()
    assert ad == "yerel" and profil.model == "m1" and ayarlar.fiyatlar["m1"].cikti == 0.2
    sag = saglayici_olustur(ayarlar, ortam={})
    assert sag.kimlik.endswith(":m1") and "localhost:11434/v1" in sag.kimlik
    ortamli = ayarlari_yukle(
        dosya, ortam={"YZ_TABAN_URL": "http://h:1/v1", "YZ_MODEL": "m2", "YZ_API_ANAHTARI": "k"}
    )
    assert ortamli.varsayilan == "ortam" and ortamli.profil()[1].model == "m2"


def test_ayar_hatalari_yol_gosterir(tmp_path):
    with pytest.raises(AyarHatasi, match="Hiç sağlayıcı yapılandırılmamış"):
        ayarlari_yukle(ortam={}).profil()
    bozuk = tmp_path / "yz.yaml"
    bozuk.write_text("saglayicilar:\n  a:\n    bilinmeyen_alan: 1\n", encoding="utf-8")
    with pytest.raises(AyarHatasi, match="bilinmeyen_alan"):
        ayarlari_yukle(bozuk, ortam={})
    bozuk.write_text("saglayicilar:\n  a:\n    tur: uzaylı\n    model: x\n", encoding="utf-8")
    with pytest.raises(AyarHatasi, match="Bilinmeyen sağlayıcı türü"):
        saglayici_olustur(ayarlari_yukle(bozuk, ortam={}), "a", ortam={})
    with pytest.raises(AyarHatasi, match="profili yok"):
        ayarlari_yukle(bozuk, ortam={}).profil("yok")
    assert ayarlari_yukle(ortam={}).profil("sahte")[1].tur == "sahte"
