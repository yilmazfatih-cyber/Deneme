"""`sor` ve `yatirim` komutları: modüller yokken çalışma (importlib yedeği), taksonomi dışı değer hatası."""

import json
from pathlib import Path

import pytest

from moda_radar.__main__ import main
from moda_radar.yatirim import kaynaklar

SOR = [
    "sor",
    "--segment",
    "orta",
    "--kategori",
    "kadin-ust",
    "--renk",
    "#2E5A88",
    "--desen",
    "duz",
    "--siluet",
    "oversize",
    "--kumas",
    "keten",
    "--hedef-fiyat",
    "899",
    "--maliyet",
    "380",
    "--rakip",
    "2",
    "--sezon",
    "SS27",
    "--bugun",
    "2026-11-08",
]


@pytest.fixture
def bos_veri(tmp_path, monkeypatch):
    """Sinyal klasörü boş, DB yok."""
    (tmp_path / "sinyal").mkdir()
    return ["--sinyaller", str(tmp_path / "sinyal"), "--db", str(tmp_path / "yok.db")]


@pytest.fixture
def moduller_yok(monkeypatch):
    monkeypatch.setattr(kaynaklar, "modul", lambda ad: None)


def test_sor_moduller_yokken_calisir(moduller_yok, bos_veri, capsys):
    assert main(SOR + bos_veri) == 0
    md = capsys.readouterr().out
    assert "Tahmin modülü yok" in md
    assert "Renk modülü yok" in md
    assert "| Trend ivmesi | 0,50" in md
    assert "**Karar: BEKLE**" in md  # sinyal yok → BEKLE
    assert "%57,7" in md
    assert md.rstrip().endswith("> Yatırım tavsiyesi değildir; karar satın almacınındır.")


def test_sor_tcx_kodu_modulsuz_tablodan_hex(moduller_yok, bos_veri, capsys):
    argv = SOR.copy()
    argv[argv.index("#2E5A88")] = "19-4052 tcx"
    assert main(argv + bos_veri + ["--json"]) == 0
    veri = json.loads(capsys.readouterr().out)
    assert veri["kart"]["urun"]["renk_tcx"] == "19-4052 TCX"
    assert veri["kart"]["urun"]["renk_hex"].startswith("#")
    assert veri["kart"]["uyari"] == "Yatırım tavsiyesi değildir; karar satın almacınındır."
    assert set(veri["kart"]["boyutlar"]) >= {"trend_ivmesi", "segment_uyumu", "zamanlama", "marj_yuzde", "stok_riski"}


def test_sor_moduller_varken_calisir(bos_veri, capsys):
    """Gerçek modüllerle (varsa) de çalışır; tahmin modülü hata verirse bile kart düşer."""
    assert main(SOR + bos_veri) == 0
    assert "Yatırım tavsiyesi değildir" in capsys.readouterr().out


def test_sor_sinyal_klasoru_dogrudan(moduller_yok, tmp_path, capsys):
    klasor = tmp_path / "s"
    klasor.mkdir()
    kayit = {
        "nitelik_ekseni": "siluet",
        "nitelik_degeri": "oversize",
        "podyum_payi": 0.2,
        "marka_sayisi": 10,
        "kaynak_turu": "rapor",
        "kaynak_url": "https://x.invalid",
        "kaynak_tarihi": "2026-10-01",
    }
    (klasor / "SS27.json").write_text(json.dumps({"sezon": "SS27", "sinyaller": [kayit]}))
    (klasor / "ORNEK.json").write_text(json.dumps({"sezon": "SS27", "ornek": True, "sinyaller": [kayit, kayit]}))
    assert len(kaynaklar.sinyal_klasoru_oku(klasor)) == 1
    assert main(SOR + ["--sinyaller", str(klasor), "--db", str(tmp_path / "yok.db")]) == 0
    assert "Sinyal kaydı bulunamadı" not in capsys.readouterr().out


@pytest.mark.parametrize(
    "bayrak,deger,oneri",
    [
        ("--siluet", "oversiz", "oversize"),
        ("--kumas", "ketan", "keten"),
        ("--desen", "cicek", "cicekli"),
        ("--segment", "premiun", "premium"),
        ("--kategori", "kadin-üst", "kadin-ust"),
    ],
)
def test_sor_taksonomi_disi_deger_hata(bayrak, deger, oneri, bos_veri, capsys):
    argv = SOR.copy()
    argv[argv.index(bayrak) + 1] = deger
    assert main(argv + bos_veri) == 2
    hata = capsys.readouterr().err
    assert "En yakın" in hata and oneri in hata


def test_sor_gecersiz_renk(bos_veri, capsys):
    argv = SOR.copy()
    argv[argv.index("#2E5A88")] = "lacivert"
    assert main(argv + bos_veri) == 2
    assert "Renk tanınmadı" in capsys.readouterr().err


def test_yatirim_komutu_dosya_yazar(moduller_yok, tmp_path, capsys):
    klasor = tmp_path / "s"
    klasor.mkdir()
    kayitlar = [
        {
            "nitelik_ekseni": "renk",
            "nitelik_degeri": kod,
            "podyum_payi": 0.05,
            "marka_sayisi": 5,
            "kaynak_turu": "gorsel",
            "kaynak_url": "https://x.invalid",
            "kaynak_tarihi": "2026-03-01",
        }
        for kod in ("19-4052 TCX", "17-1564 TCX", "11-4201 TCX")
    ]
    (klasor / "SS26.json").write_text(json.dumps({"sezon": "SS26", "sinyaller": kayitlar}))
    cikti = tmp_path / "out"
    argv = [
        "yatirim",
        "--sezon",
        "SS27",
        "--segment",
        "orta",
        "--kategori",
        "kadin-ust",
        "--ilk",
        "2",
        "--sinyaller",
        str(klasor),
        "--db",
        str(tmp_path / "yok.db"),
        "--cikti",
        str(cikti),
        "--bugun",
        "2026-11-08",
    ]
    assert main(argv) == 0
    md = (cikti / "SS27" / "yatirim-orta.md").read_text("utf-8")
    veri = json.loads(Path(cikti / "SS27" / "yatirim-orta.json").read_text("utf-8"))
    assert len(veri["kartlar"]) == 2
    assert md.count("Yatırım tavsiyesi değildir") >= 3  # rapor başı, sonu ve her kart
    assert "## Çıkış uyarısı" in md
