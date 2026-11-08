import base64
import io
import json
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest

from moda_radar.gorsel import etiketle as et
from moda_radar.sema import Kaynak, KaynakTuru

FIXTURE = Path(__file__).parent / "fixtures" / "gorsel" / "yanit_cok_parca.json"
KAYNAK = Kaynak(tur=KaynakTuru.PODYUM, url="https://assets.vogue.com/photos/abc/1.jpg", tarama_tarihi=date(2026, 10, 2),
                sezon="SS27", marka="Ornek")  # fmt: skip


def png(boyut=(40, 60), bicim="PNG") -> bytes:
    from PIL import Image

    tampon = io.BytesIO()
    Image.new("RGB", boyut, (20, 40, 120)).save(tampon, format=bicim)
    return tampon.getvalue()


class SahteIstemci:
    """anthropic.Anthropic yerine: messages.create ve beta.messages.create isteklerini kaydeder."""

    def __init__(self, metin=None, *, hata=None, stop_reason="end_turn", model=None):
        self.istekler = []
        self.metin, self.hata, self.stop_reason, self.model = metin, hata, stop_reason, model
        self.messages = SimpleNamespace(create=self._create)
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **istek):
        self.istekler.append(istek)
        if self.hata:
            raise self.hata
        return SimpleNamespace(
            content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=self.metin)],
            stop_reason=self.stop_reason,
            model=self.model or istek["model"],
        )


def _etiketleyici(metin, **kw):
    istemci = SahteIstemci(metin, **{k: kw.pop(k) for k in ("hata", "stop_reason", "model") if k in kw})
    return et.Etiketleyici("claude-sonnet-5-5", istemci, **kw), istemci


def test_gecerli_cikti_cok_parca_cok_kayit():
    e, istemci = _etiketleyici(FIXTURE.read_text("utf-8"))
    kayitlar = e.etiketle(png(), KAYNAK, parca_onek="g1", gorsel_id="g1")
    assert [k.parca_id for k in kayitlar] == ["g1-dis", "g1-alt", "g1-aksesuar"]
    dis = kayitlar[0]
    assert (dis.siluet, dis.kumas_gorunumu, dis.kapanma, dis.kategori) == ("oversize", "deri", "fermuar", "kadin-dis")
    assert all(k.etiketleyen_model == "claude-sonnet-5-5" and not k.denetim for k in kayitlar)
    assert all(k.kaynak == KAYNAK for k in kayitlar)
    assert e.son_hata is None and e.uyari_sayisi == 0
    assert len(istemci.istekler) == 1


def test_istek_bicimi_gorsel_sema_ve_model():
    e, istemci = _etiketleyici(json.dumps({"parcalar": []}))
    bayt = png()
    assert e.etiketle(bayt, KAYNAK, "g1") == []
    istek = istemci.istekler[0]
    assert istek["model"] == "claude-sonnet-5-5"
    gorsel = istek["messages"][0]["content"][0]
    assert gorsel["type"] == "image" and gorsel["source"]["media_type"] == "image/png"
    assert base64.standard_b64decode(gorsel["source"]["data"]) == bayt
    bicim = istek["output_config"]["format"]
    assert bicim["type"] == "json_schema" and bicim["schema"] == e.sema
    assert istek["output_config"]["effort"] == "low"
    assert "tool_choice" not in istek  # zorunlu araç seçimi Sonnet/Opus 5.5'te 400 verir
    assert istek["fallbacks"] == "default" and istek["betas"] == [et.YEDEK_BETA]
    assert istek["system"][0]["cache_control"] == {"type": "ephemeral"}


def test_yedek_kapaliyken_beta_yok():
    istemci = SahteIstemci(json.dumps({"parcalar": []}))
    et.Etiketleyici("m", istemci, yedek=False).etiketle(png(), KAYNAK, "g1")
    assert "betas" not in istemci.istekler[0] and "fallbacks" not in istemci.istekler[0]


def test_sozluk_disi_deger_bilinmiyor_olur_ve_uyari_sayilir():
    parca = json.loads(FIXTURE.read_text("utf-8"))["parcalar"][1]
    parca |= {"desen": "kareli-pazen", "siluet": "balon", "renk_sayisi": "dort"}
    e, _ = _etiketleyici(json.dumps({"parcalar": [parca]}))
    sonuc = e.etiketle_ayrintili(png(), KAYNAK, "g1")
    (k,) = sonuc.kayitlar
    assert (k.desen, k.siluet, k.renk_sayisi) == ("bilinmiyor", "bilinmiyor", "tek")
    assert k.kumas_gorunumu == "keten"
    assert sonuc.uyari == 3 and e.uyari_sayisi == 3


def test_gecersiz_parca_konumu_parcayi_dusurur_eksik_eksen_bilinmiyor():
    cikti = {"parcalar": [{"parca_konumu": "bas", "kategori": "aksesuar"}, {"parca_konumu": "ust"}]}
    e, _ = _etiketleyici(json.dumps(cikti))
    (k,) = e.etiketle(png(), KAYNAK, "g1")
    assert k.parca_id == "g1-ust" and k.kategori == "bilinmiyor" and k.desen == "bilinmiyor"


def test_ayni_konumda_iki_parca_ayri_kimlik():
    p = json.loads(FIXTURE.read_text("utf-8"))["parcalar"][2]
    e, _ = _etiketleyici(json.dumps({"parcalar": [p, p]}))
    assert [k.parca_id for k in e.etiketle(png(), KAYNAK, "g1")] == ["g1-aksesuar", "g1-aksesuar-2"]


@pytest.mark.parametrize("metin", ["{bozuk", "[]", '{"parca": []}', '{"parcalar": "yok"}', "", None])
def test_bozuk_cikti_bos_liste_istisna_yok(metin, caplog):
    e, _ = _etiketleyici(metin)
    assert e.etiketle(png(), KAYNAK, "g1") == []
    assert e.son_hata and "etiketleme başarısız" in caplog.text


def test_api_hatasi_bos_liste_istisna_yok():
    e, _ = _etiketleyici(None, hata=ConnectionError("ağ yok"))
    sonuc = e.etiketle_ayrintili(png(), KAYNAK, "g1")
    assert sonuc.kayitlar == [] and "ConnectionError" in sonuc.hata


@pytest.mark.parametrize("durma", ["refusal", "max_tokens"])
def test_tamamlanmayan_yanit_kayit_uretmez(durma):
    e, _ = _etiketleyici(FIXTURE.read_text("utf-8"), stop_reason=durma)
    sonuc = e.etiketle_ayrintili(png(), KAYNAK, "g1")
    assert sonuc.kayitlar == [] and durma in sonuc.hata


def test_yedek_model_yanit_verdiyse_onu_yazar():
    e, _ = _etiketleyici(FIXTURE.read_text("utf-8"), model="claude-opus-4-8")
    assert {k.etiketleyen_model for k in e.etiketle(png(), KAYNAK, "g1")} == {"claude-opus-4-8"}


def test_istemci_yoksa_bos(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    e = et.Etiketleyici("m")
    assert e.istemci is None
    sonuc = e.etiketle_ayrintili(png(), KAYNAK, "g1")
    assert sonuc.kayitlar == [] and "istemci yok" in sonuc.hata


def test_taninmayan_gorsel_api_cagrilmaz():
    e, istemci = _etiketleyici(FIXTURE.read_text("utf-8"))
    assert e.etiketle(b"GORSEL", KAYNAK, "g1") == []
    assert istemci.istekler == [] and "çözülemedi" in e.son_hata


def test_model_kimlikleri_ortamdan(monkeypatch):
    monkeypatch.delenv("MODA_RADAR_ETIKET_MODELI", raising=False)
    monkeypatch.delenv("MODA_RADAR_DENETIM_MODELI", raising=False)
    assert et.etiket_modeli() == "claude-sonnet-5-5" and et.denetim_modeli() == "claude-opus-5-5"
    monkeypatch.setenv("MODA_RADAR_ETIKET_MODELI", "claude-haiku-5-5")
    istemci = SahteIstemci(FIXTURE.read_text("utf-8"))
    assert et.Etiketleyici(istemci=istemci).model == "claude-haiku-5-5"
    d = et.Etiketleyici(istemci=istemci, denetim=True)
    assert d.model == "claude-opus-5-5"
    assert all(k.denetim for k in d.etiketle(png(), KAYNAK, "g1"))


def test_medya_turu():
    assert et.medya_turu(b"\xff\xd8\xff\xe0gerisi") == "image/jpeg"
    assert et.medya_turu(b"\x89PNG\r\n\x1a\n" + b"\x00" * 8) == "image/png"
    assert et.medya_turu(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"
    assert et.medya_turu(b"GIF89a") is None


def test_buyuk_gorsel_1024e_kuculur_ve_jpeg_olur():
    from PIL import Image

    veri, tur = et.hazirla(png((2000, 3000)))
    assert tur == "image/jpeg"
    with Image.open(io.BytesIO(veri)) as im:
        assert im.size == (683, 1024)


def test_kucuk_desteklenen_gorsel_oldugu_gibi_gider():
    bayt = png((300, 400))
    assert et.hazirla(bayt) == (bayt, "image/png")


def test_desteklenmeyen_bicim_jpege_cevrilir():
    veri, tur = et.hazirla(png((50, 50), "GIF"))
    assert tur == "image/jpeg" and et.medya_turu(veri) == "image/jpeg"
