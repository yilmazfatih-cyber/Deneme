"""İndirici (sahte açıcıyla, ağsız), ayarlar (ortam değişkenleri) ve katalog şeması."""

import hashlib
import io

import pytest

from ses.ayar import ayarlari_oku, varsayilan_model_dizini
from ses.hatalar import BicimHatasi, ModelBulunamadiHatasi
from ses.indir import adres, denetle, indir
from ses.katalog import Katalog, KatalogModeli, katalogu_oku, model_klasoru
from ses.metin import bas_harf_buyuk_mu, buyuk_tr, kucuk_tr, sapkasiz


def _model(icerik: dict[str, bytes]) -> KatalogModeli:
    return KatalogModeli(
        ad="deneme", tur="stt", hf="kisi/depo", surum="a" * 40, lisans="MIT", ticari="evet",
        lisans_kaynagi="test", atif="test",
        dosyalar=[{"yol": f"alt/{ad}", "boyut": len(v), "sha256": hashlib.sha256(v).hexdigest()}
                  for ad, v in icerik.items()],
    )  # fmt: skip


class _Acici:
    def __init__(self, icerik: dict[str, bytes]) -> None:
        self.icerik = icerik
        self.istenen: list[str] = []

    def __call__(self, url: str):
        self.istenen.append(url)
        return io.BytesIO(self.icerik[url.rsplit("/", 1)[1]])


def test_indir_dogrular_ve_atlar(tmp_path):
    icerik = {"model.bin": b"x" * 3_000_000, "config.json": b"{}"}
    model, acici = _model(icerik), _Acici(icerik)
    klasor = indir(model, tmp_path, acici=acici)
    assert (klasor / "model.bin").read_bytes() == icerik["model.bin"] and (
        klasor / "KAYNAK.json"
    ).is_file()
    assert (
        acici.istenen[0]
        == "https://huggingface.co/kisi/depo/resolve/" + "a" * 40 + "/alt/model.bin"
    )
    indir(model, tmp_path, acici=acici)
    assert len(acici.istenen) == 2  # ikinci kez indirilmedi (sha256 tuttu)
    assert denetle(model, tmp_path) == []
    (klasor / "config.json").write_bytes(b"[]")
    assert denetle(model, tmp_path) == ["config.json bozuk (sha256 tutmuyor)"]


def test_ozet_tutmazsa_dosya_kalmaz(tmp_path):
    model = _model({"model.bin": b"dogru"})
    with pytest.raises(BicimHatasi, match="sağlama özeti tutmadı"):
        indir(model, tmp_path, acici=_Acici({"model.bin": b"yanls"}))
    klasor = model_klasoru(tmp_path, model)
    assert not (klasor / "model.bin").exists() and not list(klasor.glob("*.part"))
    with pytest.raises(BicimHatasi, match="beklenenden büyük"):
        indir(model, tmp_path, acici=_Acici({"model.bin": b"cok daha uzun icerik"}))


def test_adres_kacislanir():
    model = _model({"a b.json": b"1"})
    assert adres(model, model.dosyalar[0]).endswith("/alt/a%20b.json")


def test_katalog_gecerli_ve_lisanslar_dolu():
    katalog = katalogu_oku()
    assert {m.ad for m in katalog.modeller if m.tur == "stt"} >= {"tiny", "base", "small"}
    for model in katalog.modeller:
        assert model.lisans and model.atif and model.lisans_kaynagi
        if model.tur == "tts":
            assert any(d.ad == "MODEL_CARD" for d in model.dosyalar), (
                "ses MODEL_CARD'ıyla birlikte dağıtılır"
            )
    dfki = katalog.bul("tr_TR-dfki-medium", "tts")
    assert dfki.ticari == "hayir" and "NC" in dfki.lisans
    with pytest.raises(ModelBulunamadiHatasi, match="katkıcıların isteğiyle"):
        katalog.bul("tr_TR-fettah-medium", "tts")
    with pytest.raises(ModelBulunamadiHatasi, match="Bilinenler"):
        katalog.bul("large", "stt")


def test_bozuk_katalog(tmp_path, monkeypatch):
    yol = tmp_path / "k.yaml"
    yol.write_text("dogrulama_tarihi: x\nmodeller:\n  - ad: a\n    tur: stt\n", encoding="utf-8")
    monkeypatch.setenv("SES_KATALOG", str(yol))
    with pytest.raises(BicimHatasi, match="Katalog bozuk"):
        katalogu_oku()
    monkeypatch.setenv("SES_KATALOG", str(tmp_path / "yok.yaml"))
    with pytest.raises(BicimHatasi, match="SES_KATALOG"):
        katalogu_oku()
    assert isinstance(Katalog(dogrulama_tarihi="x", modeller=[]), Katalog)


def test_ayarlar_ortamdan():
    ayar = ayarlari_oku({"SES_KAPI": "9000", "SES_IZINLI_KOKENLER": "https://a.example, https://b.example",
                         "SES_SUNUCU_ANAHTARI": "gizli", "SES_STT_MODELI": "small"})  # fmt: skip
    assert ayar.kapi == 9000 and ayar.izinli_kokenler == ["https://a.example", "https://b.example"]
    assert ayar.stt_modeli == "small" and "gizli" not in repr(ayar)  # anahtar günlüğe/repr'a düşmez
    assert (
        ayarlari_oku({}).kapi == 8460 and ayarlari_oku({}).model_dizini == varsayilan_model_dizini()
    )
    assert ayarlari_oku({"SES_KAPI": "9000"}, kapi=9100).kapi == 9100
    with pytest.raises(BicimHatasi, match="kapi"):
        ayarlari_oku({"SES_KAPI": "yetmiş"})


@pytest.mark.parametrize(
    ("girdi", "kucuk", "buyuk"),
    [("IŞIK", "ışık", "IŞIK"), ("İzmir", "izmir", "İZMİR"), ("istanbul", "istanbul", "İSTANBUL"),
     ("Iğdır", "ığdır", "IĞDIR")],
)  # fmt: skip
def test_turkce_harf(girdi, kucuk, buyuk):
    assert kucuk_tr(girdi) == kucuk and buyuk_tr(girdi) == buyuk


def test_metin_yardimcilari():
    assert sapkasiz("kâr hâlâ Âdem") == "kar hala Adem"
    assert (
        bas_harf_buyuk_mu("Dünya")
        and not bas_harf_buyuk_mu("dünya")
        and not bas_harf_buyuk_mu("3.")
    )
