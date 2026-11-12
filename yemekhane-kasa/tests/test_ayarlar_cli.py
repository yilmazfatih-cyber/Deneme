import json
import shutil

import pytest
from PIL import Image

from tests.conftest import ORNEK_MENU, PROJE
from yemekhane_kasa.ayarlar import AyarHatasi, ayarlari_yukle
from yemekhane_kasa.cli import main
from yemekhane_kasa.kamera import KameraHatasi, KlasorKaynagi, OpenCvKamera, gizle, kaynak_olustur


def test_ornek_ayar_dosyasi_gecerli():
    ayarlar = ayarlari_yukle(PROJE / "ayarlar.ornek.yaml")
    assert ayarlar.temel == PROJE
    assert ayarlar.yol(ayarlar.menu) == ORNEK_MENU
    assert 3.0 <= ayarlar.kamera.cekim_araligi_sn <= 4.0
    assert ayarlar.tanima.model == "claude-opus-5-5" and ayarlar.tanima.efor == "low"


def test_ortam_degiskeni_ve_hatalar(tmp_path, monkeypatch):
    yol = tmp_path / "a.yaml"
    yol.write_text(
        "kamera: {kaynak: 'rtsp://admin:${KAMERA_PAROLA}@10.0.0.5/s1'}\n"
        "pos: {tur: http, adres: 'http://10.0.0.9/siparis', basliklar: {Authorization: 'Bearer ${POS_ANAHTARI}'}}\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("KAMERA_PAROLA", "gizli")
    monkeypatch.delenv("POS_ANAHTARI", raising=False)
    with pytest.raises(AyarHatasi, match="POS_ANAHTARI"):
        ayarlari_yukle(yol)
    monkeypatch.setenv("POS_ANAHTARI", "abc")
    ayarlar = ayarlari_yukle(yol)
    assert ayarlar.kamera.kaynak == "rtsp://admin:gizli@10.0.0.5/s1"
    assert ayarlar.pos.basliklar == {"Authorization": "Bearer abc"}
    assert gizle(ayarlar.kamera.kaynak) == "rtsp://***@10.0.0.5/s1"


@pytest.mark.parametrize(
    ("metin", "ileti"),
    [
        ("pos: {tur: http}", "pos.adres gerekli"),
        ("kamera: {bolge: [0.5, 0.5, 0.6, 0.2]}", "taşıyor"),
        ("kamera: {cekim_araligi_sn: 0.2}", "cekim_araligi_sn"),
        ("tanima: {efor: cok}", "tanima.efor"),
        ("kamra: {kaynak: 0}", "kamra"),
        ("- liste", "anahtar: değer"),
    ],
)
def test_gecersiz_ayarlar(tmp_path, metin, ileti):
    yol = tmp_path / "a.yaml"
    yol.write_text(metin, encoding="utf-8")
    with pytest.raises(AyarHatasi, match=ileti):
        ayarlari_yukle(yol)


def test_kaynak_secimi(tmp_path):
    (tmp_path / "kareler").mkdir()
    ayarlar = ayarlari_yukle(_ayar_yaz(tmp_path, "kamera: {kaynak: kareler}"))
    assert isinstance(kaynak_olustur(ayarlar.kamera, tmp_path), KlasorKaynagi)
    for kaynak in ("0", "rtsp://10.0.0.5/s1"):
        ayarlar = ayarlari_yukle(_ayar_yaz(tmp_path, f"kamera: {{kaynak: '{kaynak}'}}"))
        assert isinstance(kaynak_olustur(ayarlar.kamera, tmp_path), OpenCvKamera)
    ayarlar = ayarlari_yukle(_ayar_yaz(tmp_path, "kamera: {kaynak: yok-klasor}"))
    with pytest.raises(KameraHatasi, match="bulunamadı"):
        kaynak_olustur(ayarlar.kamera, tmp_path)


def test_klasor_kaynagi_slayt_gibi(tmp_path):
    for i, renk in enumerate([(0, 0, 0), (255, 255, 255)]):
        Image.new("RGB", (8, 8), renk).save(tmp_path / f"{i}.png")
    an = [100.0]
    kaynak = KlasorKaynagi(tmp_path, 2.0, saat=lambda: an[0])
    kaynak.ac()
    assert kaynak.son_kare().kaynak.endswith("0.png")
    an[0] = 102.5
    assert kaynak.son_kare().kaynak.endswith("1.png")
    an[0] = 104.1
    assert kaynak.son_kare() is None and kaynak.bitti


def _ayar_yaz(klasor, metin):
    yol = klasor / "ayarlar.yaml"
    yol.write_text(metin, encoding="utf-8")
    return yol


def test_cli_menu_dogrula(capsys):
    assert main(["menu-dogrula", str(ORNEK_MENU)]) == 0
    cikti = capsys.readouterr().out
    assert "geçerli — Öğle yemeği, 12 yemek" in cikti and "120,00 TL" in cikti and "fiks menü" in cikti


def test_cli_ayar_dosyasi_yoksa_yol_gosterir(tmp_path, capsys, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert main(["calistir"]) == 2
    assert "cp ayarlar.ornek.yaml ayarlar.yaml" in capsys.readouterr().err


def test_cli_dene_sahte_taniyiciyla(tmp_path, capsys):
    shutil.copy(ORNEK_MENU, tmp_path / "menu.yaml")
    _ayar_yaz(tmp_path, "menu: menu.yaml\ntanima: {tur: sahte}\npos: {tur: klasor, klasor: cikis}\n")
    foto = tmp_path / "tepsi.jpg"
    Image.new("RGB", (640, 480), (200, 180, 150)).save(foto)
    foto.with_suffix(".json").write_text(
        json.dumps(
            {
                "tepsi_var": True,
                "kalemler": [
                    {"menu_id": "ezogelin_corbasi", "adet": 1, "porsiyon": "tam", "guven": 0.9},
                    {"menu_id": "tavuk_sote", "adet": 1, "porsiyon": "yarim", "guven": 0.8},
                    {"menu_id": "bulgur_pilavi", "adet": 1, "porsiyon": "tam", "guven": 0.9},
                ],
                "taninmayanlar": [],
                "not": "",
            }
        ),
        encoding="utf-8",
    )
    assert main(["dene", str(foto), "--ayarlar", str(tmp_path / "ayarlar.yaml"), "--gonder", "--json"]) == 0
    cikti = capsys.readouterr().out
    # Yarım tavuk sote fiks menüye girmez: 60 + 95 + 50 = 205 TL
    assert "Tavuk sote (yarım)" in cikti and "205,00 TL" in cikti and "POS: gönderildi" in cikti
    assert len(list((tmp_path / "cikis").glob("DENE-*.json"))) == 1


def test_cli_demo_hizli(capsys):
    assert main(["demo", "--hizli"]) == 0
    cikti = capsys.readouterr().out
    assert cikti.count("YENİ SİPARİŞ") == 2 and "Denetim kayıtları:" in cikti
    kayit = cikti.split("Denetim kayıtları:")[1].strip()
    shutil.rmtree(kayit.rsplit("/kayitlar", 1)[0], ignore_errors=True)
