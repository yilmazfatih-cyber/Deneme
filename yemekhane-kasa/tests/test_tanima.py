import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

from yemekhane_kasa.ayarlar import TanimaAyari
from yemekhane_kasa.kamera import Kare
from yemekhane_kasa.menu import menu_yukle
from yemekhane_kasa.tanima import (
    YEDEK_BETA,
    ClaudeTaniyici,
    SahteTaniyici,
    cikti_semasi,
    sistem_istemi,
    yanit_coz,
    yaniti_ayristir,
)

KARE = Kare(Image.new("RGB", (1600, 1200), (180, 150, 110)), 0.0)


def test_sistem_istemi_menuyu_ve_kurallari_icerir(menu):
    metin = sistem_istemi(menu)
    assert "- kuru_fasulye | Kuru fasulye | ana_yemek | kırmızı salçalı" in metin
    assert "| yarım porsiyonu var" in metin.split("kuru_fasulye", 1)[1].split("\n", 1)[0]
    assert "izmir_kofte" in metin and "yarım porsiyonu var" not in metin.split("izmir_kofte", 1)[1].split("\n", 1)[0]
    assert "Şunları yok say, hiçbir listeye yazma: ekmek; peçete" in metin
    assert " TL" not in metin and "120" not in metin  # fiyatlar modele gitmez; fiyatı yalnız kod hesaplar


def test_cikti_semasi_yalniz_menu_kimlikleri(menu):
    sema = cikti_semasi(menu)
    kalem = sema["properties"]["kalemler"]["items"]
    assert kalem["properties"]["menu_id"]["enum"] == menu.kimlikler
    assert sema["additionalProperties"] is False and kalem["additionalProperties"] is False
    assert set(sema["required"]) == set(sema["properties"])
    assert set(kalem["required"]) == set(kalem["properties"])


def test_yaniti_ayristir():
    sonuc = yaniti_ayristir(
        {
            "tepsi_var": True,
            "kalemler": [{"menu_id": "ayran", "adet": 2, "porsiyon": "yarim", "guven": 0.8}],
            "taninmayanlar": ["  makarna ", ""],
            "not": " tabak kenarda ",
        }
    )
    assert sonuc.tepsi_var and sonuc.hata is None
    assert [(k.menu_id, k.adet, k.porsiyon, k.guven) for k in sonuc.kalemler] == [("ayran", 2, "yarim", 0.8)]
    assert sonuc.taninmayanlar == ["makarna"] and sonuc.not_ == "tabak kenarda"


def test_yaniti_ayristir_tutarsiz_ve_hatali():
    # Kalem varsa tepsi vardır
    assert yaniti_ayristir({"tepsi_var": False, "kalemler": [{"menu_id": "ayran"}]}).tepsi_var
    # Bilinmeyen porsiyon tam sayılır
    garip = yaniti_ayristir({"tepsi_var": True, "kalemler": [{"menu_id": "a", "porsiyon": "x"}]})
    assert garip.kalemler[0].porsiyon == "tam"
    assert yaniti_ayristir({"kalemler": []}).hata is not None
    assert yaniti_ayristir("metin").hata is not None


def _yanit(metin, durma="end_turn"):
    return SimpleNamespace(
        model="claude-opus-5-5",
        stop_reason=durma,
        content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=metin)],
        usage=SimpleNamespace(input_tokens=1200, output_tokens=90, cache_read_input_tokens=1500),
    )


def test_yanit_coz_durumlari():
    iyi = yanit_coz(_yanit(json.dumps({"tepsi_var": False, "kalemler": [], "taninmayanlar": [], "not": ""})))
    assert iyi.hata is None and not iyi.tepsi_var
    assert iyi.kullanim == {"input_tokens": 1200, "output_tokens": 90, "cache_read_input_tokens": 1500}
    assert "refusal" in yanit_coz(_yanit("", "refusal")).hata
    assert "max_tokens" in yanit_coz(_yanit('{"tepsi_var": tr', "max_tokens")).hata
    assert yanit_coz(_yanit("Merhaba")).hata == "yanıt JSON değil"


class _SahteIstemci:
    def __init__(self, yanit=None, hata=None):
        self.cagrilar = []
        self._yanit, self._hata = yanit, hata
        self.messages = SimpleNamespace(create=self._olustur("messages"))
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._olustur("beta")))

    def _olustur(self, yol):
        def olustur(**istek):
            self.cagrilar.append((yol, istek))
            if self._hata:
                raise self._hata
            return self._yanit

        return olustur


def test_haiku_icin_yedek_model_gonderilmez(menu):
    istemci = _SahteIstemci(_yanit(json.dumps({"tepsi_var": False, "kalemler": [], "taninmayanlar": [], "not": ""})))
    taniyici = ClaudeTaniyici(TanimaAyari(model="claude-haiku-5-5"), istemci=istemci)
    assert taniyici.tani(KARE, menu).hata is None
    yol, istek = istemci.cagrilar[0]
    assert yol == "messages" and "fallbacks" not in istek and "betas" not in istek
    # Görüntü uzun kenarı 1024'e indirilmiş JPEG
    gorsel = istek["messages"][0]["content"][0]
    assert gorsel["type"] == "image" and gorsel["source"]["media_type"] == "image/jpeg"


def test_api_hatasi_servisi_durdurmaz(menu):
    taniyici = ClaudeTaniyici(TanimaAyari(), istemci=_SahteIstemci(hata=ConnectionError("ağ yok")))
    sonuc = taniyici.tani(KARE, menu)
    assert sonuc.hata and "ağ yok" in sonuc.hata


def test_istek_menu_degismedikce_ayni_onek(menu):
    taniyici = ClaudeTaniyici(TanimaAyari(), istemci=_SahteIstemci())
    bir, iki = taniyici.istek(KARE.goruntu, menu), taniyici.istek(KARE.goruntu, menu)
    assert bir["system"] == iki["system"] and bir["output_config"] == iki["output_config"]
    assert bir["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert bir["betas"] == [YEDEK_BETA] and bir["fallbacks"] == "default"


def test_referans_fotograflari_onbellek_sinirinda(tmp_path: Path):
    (tmp_path / "ref").mkdir()
    Image.new("RGB", (900, 600), (200, 80, 40)).save(tmp_path / "ref" / "a.jpg")
    Image.new("RGB", (600, 900), (240, 230, 200)).save(tmp_path / "ref" / "b.png")
    (tmp_path / "m.yaml").write_text(
        "yemekler:\n"
        "  - {id: a, ad: A, fiyat: 10, gorsel: ref/a.jpg}\n"
        "  - {id: b, ad: B, fiyat: 10, gorsel: ref/b.png}\n"
        "  - {id: c, ad: C, fiyat: 10}\n",
        encoding="utf-8",
    )
    menu = menu_yukle(tmp_path / "m.yaml")
    icerik = ClaudeTaniyici(TanimaAyari(), istemci=_SahteIstemci()).istek(KARE.goruntu, menu)["messages"][0]["content"]
    turler = [b["type"] for b in icerik]
    assert turler == ["text", "text", "image", "text", "image", "image", "text"]
    assert icerik[4]["cache_control"] == {"type": "ephemeral"}  # son referans: önbellek sınırı
    assert "cache_control" not in icerik[5]  # tepsinin anlık karesi önbelleğe girmez


def test_sahte_taniyici(tmp_path, menu):
    foto = tmp_path / "tepsi.png"
    Image.new("RGB", (10, 10)).save(foto)
    taniyici = SahteTaniyici()
    assert not taniyici.tani(Kare(KARE.goruntu, 0, str(foto)), menu).tepsi_var  # .json yok: boş tezgâh
    foto.with_suffix(".json").write_text('{"tepsi_var": true, "kalemler": [{"menu_id": "ayran"}]}', encoding="utf-8")
    assert taniyici.tani(Kare(KARE.goruntu, 0, str(foto)), menu).kalemler[0].menu_id == "ayran"
    foto.with_suffix(".json").write_text("{bozuk", encoding="utf-8")
    assert taniyici.tani(Kare(KARE.goruntu, 0, str(foto)), menu).hata


def test_gercek_sdk_ile_istek_bicimi(menu):
    """Gerçek anthropic SDK'si yerel sahte API sunucusuna bağlanır: başlıklar, gövde ve yanıt ayrıştırma."""
    anthropic = pytest.importorskip("anthropic")
    alinan = {}

    class Isleyici(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802
            govde = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            alinan.update(yol=self.path, beta=self.headers.get("anthropic-beta"), govde=govde)
            metin = json.dumps(
                {
                    "tepsi_var": True,
                    "kalemler": [{"menu_id": "kuru_fasulye", "adet": 1, "porsiyon": "tam", "guven": 0.93}],
                    "taninmayanlar": [],
                    "not": "",
                }
            )
            cevap = json.dumps(
                {
                    "id": "msg_test",
                    "type": "message",
                    "role": "assistant",
                    "model": govde["model"],
                    "content": [
                        {"type": "thinking", "thinking": "", "signature": "imza"},
                        {"type": "text", "text": metin},
                    ],
                    "stop_reason": "end_turn",
                    "stop_sequence": None,
                    "usage": {"input_tokens": 1050, "output_tokens": 70, "cache_read_input_tokens": 1600},
                }
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(cevap)))
            self.end_headers()
            self.wfile.write(cevap)

        def log_message(self, *a):
            pass

    sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Isleyici)
    threading.Thread(target=sunucu.serve_forever, daemon=True).start()
    try:
        istemci = anthropic.Anthropic(api_key="test", base_url=f"http://127.0.0.1:{sunucu.server_port}", max_retries=0)
        sonuc = ClaudeTaniyici(TanimaAyari(), istemci=istemci).tani(KARE, menu)
    finally:
        sunucu.shutdown()
    assert sonuc.hata is None and sonuc.model == "claude-opus-5-5"
    assert [(k.menu_id, k.guven) for k in sonuc.kalemler] == [("kuru_fasulye", 0.93)]
    assert sonuc.kullanim["cache_read_input_tokens"] == 1600
    assert alinan["yol"].startswith("/v1/messages") and alinan["beta"] == YEDEK_BETA
    govde = alinan["govde"]
    assert govde["fallbacks"] == "default"
    assert govde["output_config"]["effort"] == "low"
    assert govde["output_config"]["format"]["type"] == "json_schema"
    assert govde["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "thinking" not in govde and "temperature" not in govde
