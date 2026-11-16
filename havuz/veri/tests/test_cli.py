"""Komut satırı: her komut süreç içinde çalıştırılır (ağ gerektirenler sahte getiriciyle)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from verihavuzu.cli import commands_net
from verihavuzu.cli.main import main
from verihavuzu.files import read_csv, read_jsonl
from verihavuzu.hat.fetch import FetchConfig, Fetcher, Response


def run(*argv: str | Path) -> int:
    return main([str(a) for a in argv])


def test_help_is_turkish(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit):
        run("--help")
    out = capsys.readouterr().out
    assert out.startswith("kullanım: ") and "seçenekler:" in out and "bu yardımı gösterir" in out
    with pytest.raises(SystemExit) as error:
        run("uret")
    assert error.value.code == 2
    assert "şu bağımsız değişkenler gerekli" in capsys.readouterr().err


def test_generate_validate_profile_and_report(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert (
        run(
            "uret",
            "kisiler",
            "--adet",
            "40",
            "--tohum",
            "3",
            "--cikti",
            tmp_path / "k.csv",
            "--sema",
        )
        == 0
    )
    assert "UYDURMADIR" in capsys.readouterr().out
    assert run("dogrula", tmp_path / "k.csv", "--sema", tmp_path / "kisiler.sema.json") == 0
    rows = read_csv(tmp_path / "k.csv")
    rows[4]["tckn"] = "12345678901"
    from verihavuzu.files import write_csv

    write_csv(tmp_path / "bozuk.csv", rows)
    code = run(
        "dogrula",
        tmp_path / "bozuk.csv",
        "--sema",
        tmp_path / "kisiler.sema.json",
        "--rapor",
        tmp_path / "r.md",
        "--json",
        tmp_path / "r.json",
    )
    assert code == 1
    assert "geçerli bir T.C. kimlik" in (tmp_path / "r.md").read_text(encoding="utf-8")
    assert "12345678901" not in (tmp_path / "r.md").read_text(encoding="utf-8")  # maskeli
    assert (
        json.loads((tmp_path / "r.json").read_text(encoding="utf-8"))["sema"]["toplam_sorun"] == 1
    )
    assert run("profil", tmp_path / "k.csv", "--json", tmp_path / "p.json") == 0
    profile = json.loads((tmp_path / "p.json").read_text(encoding="utf-8"))
    assert {c["sutun"]: c["tur"] for c in profile["sutunlar"]}["tckn"] == "kod"
    assert run("sozluk", tmp_path / "kisiler.sema.json") == 0
    assert "| `tckn` |" in capsys.readouterr().out


def test_multi_table_jsonl_excel_and_checks(tmp_path: Path) -> None:
    folder = tmp_path / "shop"
    assert (
        run("uret", "eticaret", "--adet", "30", "--cikti", folder, "--bicim", "jsonl", "--sema")
        == 0
    )
    assert (
        run("dogrula", folder / "siparisler.jsonl", "--sema", folder / "siparisler.sema.json") == 0
    )
    checks = tmp_path / "denetim.json"
    checks.write_text(
        json.dumps(
            {
                "denetimler": [
                    {
                        "tur": "yabanci_anahtar",
                        "sutun": "musteri_id",
                        "hedef_dosya": "shop/musteriler.jsonl",
                        "hedef_sutun": "musteri_id",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    assert run("dogrula", folder / "siparisler.jsonl", "--denetim", checks) == 0
    assert (
        run("uret", "faturalar", "--adet", "10", "--cikti", tmp_path / "f", "--excel-tr", "--sema")
        == 0
    )
    raw = (tmp_path / "f" / "faturalar.csv").read_bytes()
    assert raw.startswith(b"\xef\xbb\xbf") and b";" in raw.split(b"\r\n")[0]
    assert (
        run(
            "dogrula",
            tmp_path / "f" / "faturalar.csv",
            "--sema",
            tmp_path / "f" / "faturalar.sema.json",
        )
        == 0
    )
    assert run("uret", "kisiler", "--cikti", tmp_path / "x.csv", "--tablo", "yok") == 1


def test_dirty_clean_split_drift_and_mask(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    out = tmp_path / "kirli"
    assert (
        run("uret", "faturalar", "--adet", "20", "--tablo", "faturalar", "--kirli", "--cikti", out)
        == 0
    )
    assert {p.name for p in out.iterdir()} == {
        "faturalar.temiz.csv",
        "faturalar.kirli.csv",
        "faturalar.bozulmalar.jsonl",
    }
    assert (
        run(
            "temizle",
            out / "faturalar.kirli.csv",
            "--cikti",
            tmp_path / "temiz.csv",
            "--degisiklikler",
            tmp_path / "degisiklik.jsonl",
            "--yineleme-sutunlari",
            "alici_ad_soyad",
            "siparis_id",
        )
        == 0
    )
    assert len(read_csv(tmp_path / "temiz.csv")) <= len(read_csv(out / "faturalar.kirli.csv"))
    assert read_jsonl(tmp_path / "degisiklik.jsonl")
    assert run("uret", "churn", "--adet", "400", "--cikti", tmp_path / "c.csv") == 0
    assert (
        run(
            "ayir",
            tmp_path / "c.csv",
            "--yontem",
            "katmanli",
            "--sutun",
            "churn",
            "--cikti",
            tmp_path / "ayrim",
        )
        == 0
    )
    assert len(read_csv(tmp_path / "ayrim" / "test.csv")) == 80
    assert (
        run(
            "kayma",
            tmp_path / "ayrim" / "egitim.csv",
            tmp_path / "ayrim" / "test.csv",
            "--sutun",
            "kidem_ay",
            "--json",
            tmp_path / "kayma.json",
        )
        == 0
    )
    assert (
        run("uret", "kisiler", "--adet", "15", "--cikti", tmp_path / "k.jsonl", "--bicim", "jsonl")
        == 0
    )
    assert run("maskele", tmp_path / "k.jsonl", "--cikti", tmp_path / "m.jsonl") == 0
    masked = read_jsonl(tmp_path / "m.jsonl")
    assert all("•" in row["tckn"] for row in masked)
    assert run("maskele", tmp_path / "k.jsonl", "--yontem", "takma_ad") == 1  # anahtar yok
    monkeypatch.setenv("VERIHAVUZU_TAKMA_AD_ANAHTARI", "deneme-anahtari-en-az-16")
    assert (
        run(
            "maskele", tmp_path / "k.jsonl", "--yontem", "takma_ad", "--cikti", tmp_path / "t.jsonl"
        )
        == 0
    )
    assert read_jsonl(tmp_path / "t.jsonl")[0]["tckn"].startswith("[TCKN-")


def test_catalog_and_pipeline_commands(capsys: pytest.CaptureFixture[str]) -> None:
    assert run("katalog", "ara", "iris") == 0
    assert "scikit-learn/iris" in capsys.readouterr().out
    assert run("katalog", "ara", "olmayan-bir-sey") == 1
    assert run("katalog", "dogrula", "--cevrimdisi") == 0
    assert run("hat", "listele") == 0
    assert "tcmb_kurlari" in capsys.readouterr().out


def test_download_command_with_fake_network(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    tree_url = "https://huggingface.co/api/datasets/scikit-learn/iris/tree/main?recursive=1"
    file_url = "https://huggingface.co/datasets/scikit-learn/iris/resolve/main/Iris.csv"
    body = b"Id,Species\n1,setosa\n2,setosa\n3,virginica\n"
    routes = {
        tree_url: Response(
            tree_url,
            200,
            {},
            json.dumps([{"type": "file", "path": "Iris.csv", "size": len(body)}]).encode(),
        ),
        file_url: Response(file_url, 200, {}, body),
    }

    class Fake:
        def send(self, url: str, headers: dict[str, str], timeout: float) -> Response:
            return routes.get(url, Response(url, 404, {}, b""))

    def fake_fetcher(min_interval: float = 1.0) -> Fetcher:
        return Fetcher(
            FetchConfig(min_interval=0.0, respect_robots=False), Fake(), sleep=lambda s: None
        )

    monkeypatch.setattr(commands_net, "_fetcher", fake_fetcher)
    assert run("indir", "scikit-learn/iris", "--ornek", "2", "--cikti", tmp_path) == 0
    rows = read_jsonl(tmp_path / "scikit-learn-iris" / "ornek.jsonl")
    assert rows == [{"Id": "1", "Species": "setosa"}, {"Id": "2", "Species": "setosa"}]


def test_parquet_output(tmp_path: Path) -> None:
    duckdb = pytest.importorskip("duckdb")
    assert run("uret", "kisiler", "--adet", "25", "--bicim", "parquet", "--cikti", tmp_path) == 0
    connection = duckdb.connect()
    count = connection.execute(
        "SELECT count(*) FROM read_parquet(?)", [str(tmp_path / "kisiler.parquet")]
    ).fetchone()
    connection.close()
    assert count == (25,)
