import io
import json
import threading
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from yemekhane_kasa.fiyat import Kalem, fiyatlandir
from yemekhane_kasa.pos import HttpPos, KlasorPos, KonsolPos, anahtar, fis_metni, kapanis_mesaji, mesaj_olustur
from yemekhane_kasa.pos_simulator import PosSimulator
from yemekhane_kasa.takip import Siparis

T = datetime(2026, 11, 12, 12, 30, 5).astimezone()


@pytest.fixture
def siparis(menu):
    kalemler = [Kalem("mercimek_corbasi"), Kalem("kuru_fasulye"), Kalem("pirinc_pilavi", 1, "yarim"), Kalem("ayran")]
    return Siparis("20261112-123005-001", 1, "yeni", T, fiyatlandir(menu, kalemler, taninmayanlar=["makarna"]))


@pytest.fixture
def simulator():
    sunucu = PosSimulator(("127.0.0.1", 0), sessiz=True)
    threading.Thread(target=sunucu.serve_forever, daemon=True).start()
    yield sunucu
    sunucu.shutdown()
    sunucu.server_close()


def test_mesaj_sozlesmesi(siparis):
    mesaj = mesaj_olustur(siparis, "kasa-2", "/kayit/x.jpg")
    assert mesaj["sema"] == "yemekhane-kasa/siparis@1"
    assert (mesaj["islem"], mesaj["siparis_no"], mesaj["revizyon"], mesaj["kasa"]) == (
        "yeni",
        "20261112-123005-001",
        1,
        "kasa-2",
    )
    assert [(k["menu_id"], k["porsiyon"], k["tutar_kurus"], k["plu"]) for k in mesaj["kalemler"]] == [
        ("mercimek_corbasi", "tam", 6000, "1001"),
        ("kuru_fasulye", "tam", 12000, "2001"),
        ("pirinc_pilavi", "yarim", 3500, "3001"),
        ("ayran", "tam", 2500, "6001"),
    ]
    # Yarım porsiyon fiks menüye girmez: tam pilav yok, set uygulanmaz
    assert mesaj["indirimler"] == [] and mesaj["toplam_kurus"] == 24000
    assert mesaj["toplam_metin"] == "240,00 TL"
    assert mesaj["kontrol_gerekli"] and mesaj["kontrol_nedenleri"] == ["Menüde bulunamadı: makarna"]
    assert mesaj["zaman"] == T.isoformat(timespec="seconds")
    json.dumps(mesaj)  # JSON'a çevrilebilir


def test_anahtar_ve_fis(siparis):
    mesaj = mesaj_olustur(siparis, "kasa-1")
    assert anahtar(mesaj) == "20261112-123005-001/1"
    assert anahtar(kapanis_mesaji(siparis, "kasa-1", "z")) == "20261112-123005-001/1/kapandi"
    fis = fis_metni(mesaj)
    assert "YENİ SİPARİŞ" in fis and "Pirinç pilavı (yarım)" in fis and "240,00 TL" in fis
    assert "! KONTROL: Menüde bulunamadı: makarna" in fis
    assert fis_metni(kapanis_mesaji(siparis, "kasa-1", "z")).startswith("=== TEPSİ AYRILDI")


def test_http_pos_simulatore_gonderir_tekrari_ve_revizyonu_isler(siparis, simulator):
    pos = HttpPos(f"http://127.0.0.1:{simulator.server_port}/siparis", {"Authorization": "Bearer x"})
    ilk = mesaj_olustur(siparis, "kasa-1")
    assert pos.gonder(ilk).basarili
    assert pos.gonder(ilk).basarili  # aynı anahtar: alıcı yok sayar, yine başarılı
    guncel = dict(ilk, islem="guncelle", revizyon=2, toplam_kurus=1)
    assert pos.gonder(guncel).basarili
    assert pos.gonder(ilk).basarili  # eski revizyon geç gelse de yenisinin yerine geçmez
    assert simulator.tekrar_sayisi == 2
    assert [m["revizyon"] for m in simulator.alinanlar] == [1, 2]
    assert simulator.siparisler[ilk["siparis_no"]]["revizyon"] == 2
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
        f"http://127.0.0.1:{simulator.server_port}/"
    ) as yanit:
        assert json.load(yanit)["siparisler"][0]["toplam_kurus"] == 1


class _KodDonen(BaseHTTPRequestHandler):
    kodlar: list[int] = []
    gelen = 0

    def do_POST(self):  # noqa: N802
        type(self).gelen += 1
        self.rfile.read(int(self.headers["Content-Length"]))
        kod = type(self).kodlar.pop(0)
        self.send_response(kod)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"{}")

    def log_message(self, *a):
        pass


@pytest.mark.parametrize(
    ("kodlar", "basarili", "gelen"),
    [([503, 429, 200], True, 3), ([500, 500, 500], False, 3), ([400], False, 1), ([201], True, 1)],
)
def test_http_pos_yeniden_deneme(siparis, kodlar, basarili, gelen):
    _KodDonen.kodlar, _KodDonen.gelen = list(kodlar), 0
    sunucu = ThreadingHTTPServer(("127.0.0.1", 0), _KodDonen)
    threading.Thread(target=sunucu.serve_forever, daemon=True).start()
    try:
        bekleme = []
        pos = HttpPos(f"http://127.0.0.1:{sunucu.server_port}/", deneme_sayisi=3, uyku=bekleme.append)
        sonuc = pos.gonder(mesaj_olustur(siparis, "kasa-1"))
    finally:
        sunucu.shutdown()
        sunucu.server_close()
    assert sonuc.basarili is basarili and _KodDonen.gelen == gelen
    assert bekleme == [0.2, 0.4][: gelen - 1]  # üstel bekleme; 4xx'te yeniden deneme yok


def test_http_pos_ulasilamaz(siparis):
    bekleme = []
    pos = HttpPos("http://127.0.0.1:9/siparis", zaman_asimi_sn=0.5, deneme_sayisi=2, uyku=bekleme.append)
    sonuc = pos.gonder(mesaj_olustur(siparis, "kasa-1"))
    assert not sonuc.basarili and sonuc.deneme == 2 and bekleme == [0.2]


def test_klasor_ve_konsol_pos(siparis, tmp_path):
    mesaj = mesaj_olustur(siparis, "kasa-1")
    assert KlasorPos(tmp_path / "cikis").gonder(mesaj).basarili
    assert KlasorPos(tmp_path / "cikis").gonder(kapanis_mesaji(siparis, "kasa-1", "z")).basarili
    dosyalar = sorted(p.name for p in (tmp_path / "cikis").iterdir())
    assert dosyalar == ["20261112-123005-001-r1-kapandi.json", "20261112-123005-001-r1.json"]
    assert json.loads((tmp_path / "cikis" / dosyalar[1]).read_text(encoding="utf-8")) == mesaj

    akis = io.StringIO()
    assert KonsolPos(akis).gonder(mesaj).basarili
    assert "240,00 TL" in akis.getvalue()
