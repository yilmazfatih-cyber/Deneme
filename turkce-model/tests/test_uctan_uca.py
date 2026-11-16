"""Komut satırının tamamı: tdk-derlem → tokenizer → veri → aşama 1 → MEB soruları → aşama 2 → değerlendirme.

Tüm veri sentetiktir. Gömme değerleri (conftest.TEST_AYARLARI) yalnız testin çalışması içindir, bir öneri değildir.
"""

import json
import os

from conftest import calisma_kur, sentetik_sorular

from turkce_model import meb
from turkce_model.cli import main


def _durum(capsys) -> str:
    capsys.readouterr()
    assert main(["durum"]) == 0
    return capsys.readouterr().out


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
    cikti = _durum(capsys)
    assert "[x] Aşama 1 modeli (TDK)" in cikti and "Sıradaki adım: python -m turkce_model meb-mmlu\n" in cikti
    # Aynı deneye ikinci kez sıfırdan eğitim, açıkça istenmedikçe eskisini ezmez.
    assert main(["egit", "--asama", "tdk", "--cihaz", "cpu"]) == 2
    # Ayarı değişmiş bir --devam reddedilir.
    assert main(["egit", "--asama", "tdk", "--devam", "--deney", deney.name, "--ayar", "model.dropout=0.2"]) == 2

    # Aşama 2: MEB soruları eklenince hazır veri (yalnız MEB kısmı) yenilenir; TDK modeli geçerli kalır.
    for yol in [tmp_path, *tmp_path.rglob("*")]:  # şimdiye kadarki her şey "önceden" yapılmış olsun
        zaman = yol.stat().st_mtime - 1000
        os.utime(yol, (zaman, zaman))
    (tmp_path / "veri" / "meb").mkdir(parents=True)
    meb.soru_yaz(sentetik_sorular(60), tmp_path / "veri" / "meb" / "meb_pdf.jsonl")
    cikti = _durum(capsys)
    assert "MEB soruları sonradan değişti → yeniden: veri-hazirla" in cikti and "[x] Aşama 1 modeli (TDK)" in cikti
    assert "Sıradaki adım: python -m turkce_model veri-hazirla\n" in cikti
    assert main(["veri-hazirla"]) == 0
    cikti = _durum(capsys)
    assert "[x] Hazır veri" in cikti and "Sıradaki adım: python -m turkce_model egit --asama meb\n" in cikti
    capsys.readouterr()
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
    cikti = _durum(capsys)
    assert "[x] Aşama 2 modeli (MEB)" in cikti and "Bütün adımlar tamam" in cikti


def test_kararlar_bossa_egitim_baslamaz(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text('[gomme]\nboyut = "KARAR_VER"\n', encoding="utf-8")
    assert main(["egit", "--asama", "tdk"]) == 2
    assert "gomme.konum" in capsys.readouterr().err
