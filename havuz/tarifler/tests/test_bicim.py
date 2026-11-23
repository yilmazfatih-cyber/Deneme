"""Biçim kuralları: (1) depodaki GERÇEK tarifler bütün kurallara uyar; (2) her kural gerçekten yakalar.

(1) kırmızıysa iletideki düzeltmeyi yapın. Bir yama "havuzun bugünkü hâline uygulanmıyor" diyorsa bir
temel değişmiştir: tarifi `python tarif.py kur` ile kurup değişikliği elle yeniden yapın ve
`python tarif.py yakala <tarif> <klasör>` ile dosyalar/'ı yenileyin (AGENTS.md → "Tarifi güncelle").
Genişletme: yeni kural için önce burada "yakalıyor mu" testini yazın.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tarifcik import bicim
from tarifcik.yama import yama_uret
from tarifcik.yollar import tarifleri_bul
from tests.conftest import tarif_yaz

TAM_README = "# T\n\n" + "".join(f"## {bolum}\n\nmetin\n\n" for bolum in bicim.ZORUNLU_BOLUMLER)


def test_depodaki_tarifler_kurallara_uyar() -> None:
    assert bicim.tum_sorunlar() == []


def test_en_az_bes_tarif_var_ve_hepsi_listede() -> None:
    adlar = {tarif.ad for tarif in tarifleri_bul()}
    zorunlu = {
        "belgeye-soru-uygulamasi",
        "site-iletisim-formu-api",
        "kendi-modelinle-sohbet",
        "csvden-tahmin-servisi",
        "tek-sunucuda-yayin",
    }
    assert zorunlu <= adlar


def hazir_tarif(tmp_path: Path, sahte_havuz: Path) -> Path:
    klasor = tarif_yaz(tmp_path / "ornek-tarif", ["ornek"])
    (klasor / "README.md").write_text(TAM_README, encoding="utf-8")
    (klasor / "dosyalar" / "ornek").mkdir(parents=True)
    (klasor / "dosyalar" / "ornek" / "yeni.txt").write_text("yeni\n", encoding="utf-8")
    return klasor


def test_saglam_ornek_tarifte_sorun_yok(tmp_path: Path, sahte_havuz: Path) -> None:
    assert bicim.tarif_sorunlari(hazir_tarif(tmp_path, sahte_havuz)) == []


def test_eksik_dosya_ve_bolum_yakalanir(tmp_path: Path, sahte_havuz: Path) -> None:
    klasor = hazir_tarif(tmp_path, sahte_havuz)
    (klasor / "dogrula.py").unlink()
    (klasor / "README.md").write_text(
        TAM_README.replace("## Sınırlar", "## Başka"), encoding="utf-8"
    )
    sorunlar = bicim.tarif_sorunlari(klasor)
    assert any("dogrula.py eksik" in s for s in sorunlar)
    assert any("'## Sınırlar' bölümü yok" in s for s in sorunlar)


def test_yanlis_tarif_json_yakalanir(tmp_path: Path, sahte_havuz: Path) -> None:
    klasor = hazir_tarif(tmp_path, sahte_havuz)
    veri = json.loads((klasor / "tarif.json").read_text(encoding="utf-8"))
    veri["zorluk"] = "çok zor"
    (klasor / "tarif.json").write_text(json.dumps(veri), encoding="utf-8")
    assert any("zorluk" in s for s in bicim.tarif_sorunlari(klasor))
    veri["zorluk"], veri["temeller"] = "orta", ["olmayan"]
    (klasor / "tarif.json").write_text(json.dumps(veri), encoding="utf-8")
    assert any("'olmayan' havuzda bir temel değil" in s for s in bicim.tarif_sorunlari(klasor))


def test_var_olan_dosyanin_tam_hali_reddedilir(tmp_path: Path, sahte_havuz: Path) -> None:
    klasor = hazir_tarif(tmp_path, sahte_havuz)
    (klasor / "dosyalar" / "ornek" / "README.md").write_text("tam dosya\n", encoding="utf-8")
    assert any("yama (.patch)" in s for s in bicim.tarif_sorunlari(klasor))


def test_eskimis_yama_yakalanir(tmp_path: Path, sahte_havuz: Path) -> None:
    klasor = hazir_tarif(tmp_path, sahte_havuz)
    asil = sahte_havuz / "ornek" / "src" / "app.ts"
    eski = asil.read_text(encoding="utf-8")
    yama = yama_uret(eski, eski.replace("satir 2", "değişti"), "src/app.ts")
    (klasor / "dosyalar" / "ornek" / "src").mkdir()
    (klasor / "dosyalar" / "ornek" / "src" / "app.ts.patch").write_text(yama, encoding="utf-8")
    assert bicim.tarif_sorunlari(klasor) == []
    asil.write_text(eski.replace("satir 2", "temel güncellendi"), encoding="utf-8")
    assert any("bugünkü hâline uygulanmıyor" in s for s in bicim.tarif_sorunlari(klasor))


def test_bilinmeyen_kok_ve_sir_dosyasi_yakalanir(tmp_path: Path, sahte_havuz: Path) -> None:
    klasor = hazir_tarif(tmp_path, sahte_havuz)
    (klasor / "dosyalar" / "rastgele").mkdir()
    (klasor / "dosyalar" / "rastgele" / "x.txt").write_text("x\n", encoding="utf-8")
    (klasor / "dosyalar" / "ornek" / ".env").write_text("ANAHTAR=gizli\n", encoding="utf-8")
    sorunlar = bicim.tarif_sorunlari(klasor)
    assert any("ilk klasör" in s for s in sorunlar)
    assert any("atlanır" in s for s in sorunlar)


@pytest.mark.parametrize("kod", [0x200B, 0x00A0, 0xFEFF, 0x202E, 0x0301])
def test_gorunmez_karakter_yakalanir(tmp_path: Path, kod: int) -> None:
    (tmp_path / "a.md").write_text(f"görünür{chr(kod)}metin\n", encoding="utf-8")
    (tmp_path / "b.md").write_text("Türkçe: çğıöşü İ ı — sorun yok\n", encoding="utf-8")
    sorunlar = bicim.gorunmez_sorunlari(tmp_path)
    assert len(sorunlar) == 1
    assert sorunlar[0].startswith("a.md:1:")
