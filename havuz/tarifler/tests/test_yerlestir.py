"""dosyalar/ yerleştirme ve yakalama: yeni dosya, yama, ek klasör, yanlış kök, çalışma kopyasından geri alma.

Sahte havuz (conftest.sahte_havuz) kullanılır; gerçek temellere dokunulmaz.
Genişletme: yerleştirme kuralı değişirse önce burada beklenen davranışı yazın.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from tarifcik.yama import yama_uret
from tarifcik.yerlestir import atlanir_mi, dosyalari_yerlestir, hedef_yolu, yakala
from tarifcik.yollar import TarifHatasi, tarif_oku
from tests.conftest import tarif_yaz


def kur(sahte_havuz: Path, tmp_path: Path) -> tuple[Path, Path]:
    tarif = tarif_yaz(tmp_path / "deneme-tarifi", ["ornek"], ["ek"])
    dosyalar = tarif / "dosyalar"
    (dosyalar / "ornek" / "src").mkdir(parents=True)
    (dosyalar / "ornek" / "src" / "yeni.ts").write_text("yeni\n", encoding="utf-8")
    eski = (sahte_havuz / "ornek" / "src" / "app.ts").read_text(encoding="utf-8")
    (dosyalar / "ornek" / "src" / "app.ts.patch").write_text(
        yama_uret(eski, eski.replace("satir 2", "SATIR 2"), "src/app.ts"), encoding="utf-8"
    )
    (dosyalar / "ek").mkdir()
    (dosyalar / "ek" / "not.md").write_text("not\n", encoding="utf-8")
    proje = tmp_path / "proje"
    shutil.copytree(sahte_havuz / "ornek", proje / "ornek")
    return tarif, proje


def test_yeni_dosya_yama_ve_ek_klasor_yerlesir(sahte_havuz: Path, tmp_path: Path) -> None:
    klasor, proje = kur(sahte_havuz, tmp_path)
    yapilan = dosyalari_yerlestir(tarif_oku(klasor), proje)
    assert "yama: ornek/src/app.ts" in yapilan
    assert (proje / "ornek" / "src" / "yeni.ts").read_text(encoding="utf-8") == "yeni\n"
    assert "SATIR 2" in (proje / "ornek" / "src" / "app.ts").read_text(encoding="utf-8")
    assert (proje / "ek" / "not.md").exists()
    # havuzdaki asıl dosya değişmedi
    assert "SATIR 2" not in (sahte_havuz / "ornek" / "src" / "app.ts").read_text(encoding="utf-8")


def test_iki_kez_uygulama_reddedilir(sahte_havuz: Path, tmp_path: Path) -> None:
    klasor, proje = kur(sahte_havuz, tmp_path)
    dosyalari_yerlestir(tarif_oku(klasor), proje)
    with pytest.raises(TarifHatasi, match="zaten var"):
        dosyalari_yerlestir(tarif_oku(klasor), proje)


def test_bilinmeyen_kok_reddedilir(sahte_havuz: Path, tmp_path: Path) -> None:
    klasor, proje = kur(sahte_havuz, tmp_path)
    (klasor / "dosyalar" / "baska").mkdir()
    (klasor / "dosyalar" / "baska" / "x.txt").write_text("x\n", encoding="utf-8")
    with pytest.raises(TarifHatasi, match=r"tarif\.json'da yok"):
        dosyalari_yerlestir(tarif_oku(klasor), proje)


def test_yakala_gidis_donus(sahte_havuz: Path, tmp_path: Path) -> None:
    klasor, proje = kur(sahte_havuz, tmp_path)
    tarif = tarif_oku(klasor)
    dosyalari_yerlestir(tarif, proje)
    beklenen = {p.relative_to(tarif.dosyalar) for p in tarif.dosyalar.rglob("*") if p.is_file()}
    # üretilen çıktılar yakalanmaz
    (proje / "ornek" / "node_modules").mkdir()
    (proje / "ornek" / "node_modules" / "x.js").write_text("x", encoding="utf-8")
    (proje / "ornek" / "ciktilar").mkdir()
    (proje / "ornek" / "ciktilar" / "model.txt").write_text("m", encoding="utf-8")
    (proje / "ornek" / "gecici.tmp").write_text("t", encoding="utf-8")
    yazilan = {Path(yol) for yol in yakala(tarif, proje)}
    assert yazilan == beklenen


def test_yakala_silinen_dosyayi_reddeder(sahte_havuz: Path, tmp_path: Path) -> None:
    klasor, proje = kur(sahte_havuz, tmp_path)
    (proje / "ornek" / "README.md").unlink()
    with pytest.raises(TarifHatasi, match="silinmiş"):
        yakala(tarif_oku(klasor), proje)


def test_yardimcilar() -> None:
    assert hedef_yolu(Path("a/b.ts.patch")) == Path("a/b.ts")
    assert hedef_yolu(Path("a/b.ts")) == Path("a/b.ts")
    assert atlanir_mi(Path("web/node_modules/x"))
    assert atlanir_mi(Path("api/.env"))
    assert atlanir_mi(Path("api/.env.local"))
    assert not atlanir_mi(Path("api/.env.example"))
    assert not atlanir_mi(Path("api/src/app.ts"))
