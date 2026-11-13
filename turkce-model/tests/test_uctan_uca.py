"""Komut satırının tamamı: tdk-derlem → tokenizer → veri → aşama 1 → MEB soruları → aşama 2 → değerlendirme.

Tüm veri sentetiktir. Gömme değerleri (conftest.TEST_AYARLARI) yalnız testin çalışması içindir, bir öneri değildir.
"""

import json

from conftest import calisma_kur, sentetik_sorular

from turkce_model import meb
from turkce_model.cli import main


def test_tum_boru_hatti(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    calisma_kur(tmp_path)

    assert main(["durum"]) == 0
    assert main(["tdk-derlem"]) == 0
    assert main(["tokenizer-egit"]) == 0
    assert main(["tokenizer-dene", "Kitaplarımızdan", "biri"]) == 0
    assert main(["veri-hazirla"]) == 0
    assert main(["hesapla"]) == 0
    assert main(["egit", "--asama", "tdk", "--cihaz", "cpu"]) == 0
    deneyler = list((tmp_path / "ciktilar" / "deneyler").iterdir())
    assert len(deneyler) == 1 and deneyler[0].name.startswith("g32-alibi-ayri-f16-kat-bicim-rmsnorm-soto-d0-k1-m")
    deney = deneyler[0]
    assert (deney / "tdk" / "en_iyi.pt").exists()
    # Aynı deneye ikinci kez sıfırdan eğitim, açıkça istenmedikçe eskisini ezmez.
    assert main(["egit", "--asama", "tdk", "--cihaz", "cpu"]) == 2
    # Ayarı değişmiş bir --devam reddedilir.
    assert main(["egit", "--asama", "tdk", "--devam", "--deney", deney.name, "--ayar", "model.dropout=0.2"]) == 2

    (tmp_path / "veri" / "meb").mkdir(parents=True)
    meb.soru_yaz(sentetik_sorular(60), tmp_path / "veri" / "meb" / "meb_pdf.jsonl")
    assert main(["veri-hazirla"]) == 0
    assert main(["egit", "--asama", "meb", "--cihaz", "cpu"]) == 0
    assert (deney / "meb" / "en_iyi.pt").exists()
    assert main(["sor", "--adet", "1", "--cihaz", "cpu"]) == 0
    assert main(["tanimla", "kitap", "--uzunluk", "5", "--tohum", "0", "--cihaz", "cpu"]) == 0

    assert main(["degerlendir", "--cihaz", "cpu"]) == 0  # --asama verilmezse MEB modeli değerlendirilir
    kayitlar = [json.loads(s) for s in (tmp_path / "ciktilar" / "ilerleme.jsonl").read_text(encoding="utf-8").splitlines()]
    assert [k["asama"] for k in kayitlar] == ["tdk", "meb", "meb"]
    ilerleme = (tmp_path / "ciktilar" / "ilerleme.md").read_text(encoding="utf-8")
    assert ilerleme.count(deney.name) == 3  # iki aşama + elle değerlendirme
    cikti = capsys.readouterr().out
    assert "MEB test" in cikti and "rastgele" in cikti


def test_kararlar_bossa_egitim_baslamaz(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text('[gomme]\nboyut = "KARAR_VER"\n', encoding="utf-8")
    assert main(["egit", "--asama", "tdk"]) == 2
    assert "gomme.konum" in capsys.readouterr().err
