"""Komut satırı testleri: Türkçe yardım ve hatalar, yardımın torch yüklememesi, komutların uçtan uca
çalışması (ornek-veri, kopya-bul --tasi, sizinti, temizle, hazirla, modeller, tahmin/degerlendir, arama)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from goruntu.cli import main, translate_error
from goruntu.commands import COMMANDS
from goruntu.synthetic import scene_image
from tests.conftest import ROOT
from tests.test_metadata import SECRETS, marked_jpeg


@pytest.mark.parametrize("command", sorted(COMMANDS))
def test_her_komutun_turkce_yardimi(command: str, capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as stopped:
        main([command, "--yardim"])
    assert stopped.value.code == 0
    assert "kullanım:" in capsys.readouterr().out


def test_yardim_agir_kutuphane_yuklemez() -> None:
    code = (
        "import sys\nfrom goruntu.cli import build_parser\nbuild_parser()\n"
        "print(sorted(m for m in ('torch', 'timm', 'transformers', 'onnxruntime') if m in sys.modules))"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        cwd=ROOT,
        check=True,
        timeout=60,
    )
    assert result.stdout.strip() == "[]"


def test_argparse_hatalari_turkce(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as stopped:
        main(["egit", "--hazir", "boyle-bir-ayar-yok"])
    assert stopped.value.code == 2
    error = capsys.readouterr().err
    assert "geçersiz seçim" in error and "--yardim" in error
    assert translate_error("unrecognized arguments: --x") == "tanınmayan seçenekler: --x"


def test_kullanici_hatasi_kod_1(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["egit"]) == 1
    assert capsys.readouterr().err.startswith("HATA: Yapılandırma verin")


def test_ornek_veri_ve_kopyalari_tasi(tmp_path: Path) -> None:
    data, moved = tmp_path / "veri", tmp_path / "kopyalar"
    assert (
        main(["ornek-veri", str(data), "--sinif-basi", "6", "--boyut", "48", "--kopya-orani", "1"])
        == 0
    )
    before = sorted(data.rglob("*.jpg"))
    report = tmp_path / "kopya.json"
    assert main(["kopya-bul", str(data), "--tasi", str(moved), "--json", str(report)]) == 0
    groups = json.loads(report.read_text(encoding="utf-8"))["gruplar"]
    log = json.loads((moved / "tasima_kaydi.json").read_text(encoding="utf-8"))
    assert len(log) == sum(len(group) - 1 for group in groups) >= 18
    for group in groups:
        assert Path(group[0]["yol"]).is_file()  # her gruptan en iyisi yerinde
        assert group[0]["genislik"] >= group[-1]["genislik"]
    assert len(before) == len(list(data.rglob("*.jpg"))) + len(log)  # hiçbir dosya silinmedi


def test_sizinti_cikis_kodu(tmp_path: Path) -> None:
    rng = np.random.default_rng(4)
    for folder in ("egitim", "sinama"):
        (tmp_path / folder).mkdir()
    for number in range(5):
        scene_image(rng).save(tmp_path / "egitim" / f"{number}.png")
        scene_image(rng).save(tmp_path / "sinama" / f"{number}.png")
    args = ["sizinti", "--egitim", str(tmp_path / "egitim"), "--sinama", str(tmp_path / "sinama")]
    assert main(args) == 0
    leaked = (tmp_path / "egitim" / "2.png").read_bytes()
    (tmp_path / "sinama" / "sizan.png").write_bytes(leaked)
    assert main(args) == 1


def test_temizle_ve_hazirla(tmp_path: Path) -> None:
    source = tmp_path / "kaynak"
    (source / "alt").mkdir(parents=True)
    (source / "alt" / "foto.jpg").write_bytes(marked_jpeg())
    (source / "bozuk.jpg").write_bytes(b"bozuk")
    assert main(["temizle", str(source), "--cikti", str(tmp_path / "temiz")]) == 0
    cleaned = (tmp_path / "temiz" / "alt" / "foto.jpg").read_bytes()
    assert all(secret not in cleaned for secret in SECRETS)
    report = json.loads((tmp_path / "temiz" / "temizlik_raporu.json").read_text(encoding="utf-8"))
    assert report["ozet"] == report["ozet"] | {"gps_bulunan": 1, "reddedilen": 1, "islenen": 1}
    out = tmp_path / "hazir"
    assert main(["hazirla", str(source), str(out), "--boyut", "32", "--kucuk-resim", "16"]) == 0
    assert (out / "alt" / "foto.webp").is_file() and (out / "alt" / "foto_kucuk.webp").is_file()
    assert main(["hazirla", str(source), str(source / "icerde")]) == 1  # kaynağın içine yazmaz
    assert main(["temizle", str(source)]) == 1  # nereye yazılacağı söylenmeli


def test_modeller(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["modeller", "--gorev", "gomme"]) == 0
    out = capsys.readouterr().out
    assert "siglip2" in out and "mobilenetv3" not in out


def test_degerlendir_pytorch_ve_onnx_ayni(
    trained_model: Path, onnx_bundle: Path, tmp_path: Path
) -> None:
    del onnx_bundle
    first, second = tmp_path / "pt.json", tmp_path / "onnx.json"
    assert main(["degerlendir", "--model", str(trained_model), "--json", str(first)]) == 0
    assert (
        main(["degerlendir", "--model", str(trained_model), "--onnx", "--json", str(second)]) == 0
    )
    torch_result = json.loads(first.read_text(encoding="utf-8"))
    onnx_result = json.loads(second.read_text(encoding="utf-8"))
    assert torch_result["karisiklik_matrisi"] == onnx_result["karisiklik_matrisi"]
    assert torch_result["dogruluk"] == onnx_result["dogruluk"]


def test_degerlendir_hazir_ayrimda_yalniz_test(trained_model: Path, tmp_path: Path) -> None:
    from goruntu.synthetic import write_shape_dataset

    write_shape_dataset(tmp_path / "egitim", per_class=5, seed=1, size=40)
    write_shape_dataset(tmp_path / "test", per_class=2, seed=2, size=40)
    output = tmp_path / "sonuc.json"
    assert (
        main(
            [
                "degerlendir",
                "--model",
                str(trained_model),
                "--veri",
                str(tmp_path),
                "--json",
                str(output),
            ]
        )
        == 0
    )
    assert json.loads(output.read_text(encoding="utf-8"))["ornek_sayisi"] == 6


def test_tahmin_klasor_ve_bozuk_dosya(
    trained_model: Path, onnx_bundle: Path, shape_dataset: Path, tmp_path: Path
) -> None:
    (tmp_path / "bozuk.jpg").write_bytes(b"x")
    output = tmp_path / "tahmin.json"
    args = [
        "tahmin",
        "--model",
        str(onnx_bundle / "model.onnx"),
        str(shape_dataset / "kare"),
        str(tmp_path / "bozuk.jpg"),
        "--json",
        str(output),
    ]
    assert main(args) == 0
    rows = json.loads(output.read_text(encoding="utf-8"))
    assert rows[-1]["hata"] and all("etiket" in row for row in rows[:-1])
    assert len(rows[0]["ilk"]) == 3


def test_arama_komutlari_histogramla(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    data = tmp_path / "veri"
    main(["ornek-veri", str(data), "--sinif-basi", "4", "--boyut", "48", "--kopya-orani", "0"])
    assert (
        main(["indeksle", str(data), "--dizin", str(tmp_path / "dizin"), "--model", "histogram"])
        == 0
    )
    query = sorted((data / "kare").glob("*.jpg"))[0]
    result = tmp_path / "benzer.json"
    assert (
        main(["benzer", str(query), "--dizin", str(tmp_path / "dizin"), "--json", str(result)]) == 0
    )
    rows = json.loads(result.read_text(encoding="utf-8"))
    assert len(rows) == 5 and all(row["yol"] != str(query) for row in rows)  # sorgunun kendisi yok
    assert main(["ara", "mavi kare", "--dizin", str(tmp_path / "dizin")]) == 1
    assert "metinle arama" in capsys.readouterr().err
    assert main(["arama-olc", str(data), "--model", "histogram"]) == 0
    assert "recall@1" in capsys.readouterr().out
    assert main(["indeksle", str(data), "--dizin", str(tmp_path / "dizin"), "--model", "clip"]) == 1
