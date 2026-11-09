from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from ithalat_ajani.cli import main
from ithalat_ajani.depo import baglan

from .conftest import aday_sozluk

ORNEK = Path(__file__).resolve().parents[1] / "ornekler" / "ornek-adaylar.json"


@pytest.fixture
def klasor(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    return tmp_path


def _tarama(an: str, adaylar: list[dict], kategoriler: list[str] | None = None) -> dict:
    tarama = {"an": an}
    if kategoriler:
        tarama["kategoriler"] = kategoriler
    return {"tarama": tarama, "adaylar": adaylar}


def test_ornek_dosya_degerlendirilir(klasor, capsys):
    shutil.copy(ORNEK, klasor / "adaylar.json")
    assert main(["degerlendir", "adaylar.json", "--kur", "50.18", "--ozet-dosyasi", "ozet.txt"]) == 0
    raporlar = list((klasor / "raporlar").glob("tarama-*.md"))
    assert len(raporlar) == 1
    metin = raporlar[0].read_text(encoding="utf-8")
    assert "## Uygun ürünler" in metin and "Desenli twill eşarp" in metin
    assert "## İndirimdekiler ve fiyatı düşenler" in metin and "süreli fırsat" in metin
    assert "Basic pamuklu tişört" in metin.split("## Elenenler")[1]
    ozet = (klasor / "ozet.txt").read_text(encoding="utf-8")
    assert "kat" in ozet and "İndirimde/fiyatı düşen" in ozet
    db = baglan(klasor / "veri" / "ithalat.db")
    assert db.execute("SELECT COUNT(*) FROM olcumler").fetchone()[0] == 3
    assert db.execute("SELECT uygun_sayisi FROM taramalar").fetchone()[0] == 2


def test_fiyati_dusen_ikinci_taramada_gorunur(klasor, capsys):
    ilk = aday_sozluk(alibaba={"fiyat_usd": 2.4})
    (klasor / "a.json").write_text(json.dumps(_tarama("2026-11-01T10:00:00+03:00", [ilk])), encoding="utf-8")
    assert main(["degerlendir", "a.json", "--kur", "50"]) == 0
    ikinci = aday_sozluk(alibaba={"fiyat_usd": 2.0})
    (klasor / "b.json").write_text(json.dumps(_tarama("2026-11-08T10:00:00+03:00", [ikinci])), encoding="utf-8")
    assert main(["degerlendir", "b.json", "--kur", "50"]) == 0
    rapor = (klasor / "raporlar" / "tarama-20261108-1000.md").read_text(encoding="utf-8")
    bolum = rapor.split("## İndirimdekiler ve fiyatı düşenler")[1]
    assert "önceki taramaya göre %17 ucuz" in bolum and "2,40 $ → 2,00 $" in bolum
    assert "önce kat" in rapor
    assert "fiyatı düşen 1 ürün" in capsys.readouterr().out


def test_hesapla(klasor, capsys):
    kod = main([
        "hesapla", "--kategori", "esarp-sal", "--fiyat-usd", "2", "--agirlik-kg", "0.07",
        "--tr-fiyat", "900", "--tr-fiyat", "1000", "--tr-fiyat", "1100", "--kur", "50",
    ])  # fmt: skip
    cikti = capsys.readouterr().out
    assert kod == 0 and "Birim maliyet" in cikti and "UYGUN" in cikti


def test_hesapla_bilinmeyen_kategori(klasor, capsys):
    assert main(["hesapla", "--kategori", "yok", "--fiyat-usd", "2", "--tr-fiyat", "900", "--kur", "50"]) == 2


def test_siradaki_kategoriler_doner_ve_mevsime_bakar(klasor, capsys):
    assert main(["kategoriler", "--siradaki", "3", "--ay", "11"]) == 0
    ilk = capsys.readouterr().out.split()
    assert ilk == ["esarp-sal", "taki-bijuteri", "sac-aksesuari"]
    adaylar = [aday_sozluk(urun=k, kategori="esarp-sal", alibaba={"url": f"https://example.com/{k}"}) for k in ilk]
    (klasor / "a.json").write_text(json.dumps(_tarama("2026-11-09T10:00:00+03:00", adaylar, ilk)), encoding="utf-8")
    assert main(["degerlendir", "a.json", "--kur", "50"]) == 0
    capsys.readouterr()
    assert main(["kategoriler", "--siradaki", "3", "--ay", "11"]) == 0
    ikinci = capsys.readouterr().out.split()
    assert not set(ikinci) & set(ilk)
    assert main(["kategoriler", "--siradaki", "30", "--ay", "11"]) == 0
    hepsi = capsys.readouterr().out.split()
    assert hepsi.index("mayo-bikini") > hepsi.index("ayakkabi-terlik")  # kışın yazlık en sona


def test_gecmis_json(klasor, capsys):
    shutil.copy(ORNEK, klasor / "adaylar.json")
    main(["degerlendir", "adaylar.json", "--kur", "50.18"])
    capsys.readouterr()
    assert main(["gecmis", "--json", "--durum", "UYGUN", "UYGUN-DOGRULA"]) == 0
    satirlar = json.loads(capsys.readouterr().out)
    assert {s["durum"] for s in satirlar} <= {"UYGUN", "UYGUN-DOGRULA"} and len(satirlar) == 2


def test_bozuk_dosya(klasor, capsys):
    (klasor / "bozuk.json").write_text("{", encoding="utf-8")
    assert main(["degerlendir", "bozuk.json", "--kur", "50"]) == 2
    (klasor / "bos.json").write_text('{"tarama": {}}', encoding="utf-8")
    assert main(["degerlendir", "bos.json", "--kur", "50"]) == 2


def test_ayar_dosyasi_okunur(klasor, capsys):
    (klasor / "ayarlar.toml").write_text("[esikler]\nhedef_kat = 1.2\nyakin_kat = 1.1\n", encoding="utf-8")
    assert main(["hesapla", "--kategori", "tisort", "--fiyat-usd", "3", "--tr-fiyat", "450", "--kur", "50"]) == 0
    assert "UYGUN" in capsys.readouterr().out
    (klasor / "ayarlar.toml").write_text("[esikler]\nyok = 1\n", encoding="utf-8")
    assert main(["kategoriler"]) == 2


def test_zaman_turkiye_saatine_cevrilir(klasor, capsys):
    (klasor / "a.json").write_text(json.dumps(_tarama("2026-11-09T12:00:00+00:00", [aday_sozluk()])), encoding="utf-8")
    assert main(["degerlendir", "a.json", "--kur", "50"]) == 0
    assert (klasor / "raporlar" / "tarama-20261109-1500.md").exists()
    db = baglan(klasor / "veri" / "ithalat.db")
    assert db.execute("SELECT an FROM taramalar").fetchone()["an"] == "2026-11-09T15:00:00+03:00"


def test_takip_listesi_min_kat(klasor, capsys):
    shutil.copy(ORNEK, klasor / "adaylar.json")
    main(["degerlendir", "adaylar.json", "--kur", "50.18"])
    capsys.readouterr()
    assert main(["gecmis", "--json", "--min-kat", "2"]) == 0
    takip = json.loads(capsys.readouterr().out)
    assert {s["urun"] for s in takip} == {"Desenli twill eşarp 90x90", "Çelik zincir kolye (altın kaplama)"}
