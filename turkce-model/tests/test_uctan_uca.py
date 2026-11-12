"""Komut satırının tamamı: tdk-derlem → tokenizer → veri → aşama 1 → MEB soruları → aşama 2 → değerlendirme.

Tüm veri sentetiktir. Aşağıdaki gömme değerleri yalnız testin çalışması içindir, bir öneri değildir.
"""

import json
import random

from conftest import CUMLELER, KELIME_LISTESI, SENTETIK_MADDELER

from turkce_model import meb
from turkce_model.cli import main

TEST_AYARLARI = """
[gomme]
boyut = 32
konum = "alibi"
cikis_baglama = false
faktor_boyutu = 16
kategori_gommesi = true
bicim_paylasimi = true
olcek = false
norm = "rmsnorm"
baslatma_std = "otomatik"
dropout = 0.0

[model]
katman = 1
bas_boyutu = 16
baglam = 32
dropout = 0.0

[tokenizer]
boyut = 700
en_az_sayi = 2

[egitim.tdk]
donem = 1
en_fazla_adim = 12
yigin = 4
isinma_adimi = 2
degerlendirme_her = 6
degerlendirme_yigini = 2

[egitim.meb]
donem = 1
en_fazla_adim = 8
yigin = 4
isinma_adimi = 2
degerlendirme_her = 4
degerlendirme_yigini = 2
kayip = "cevap"
"""


def _sentetik_maddeler(n: int) -> list[dict]:
    rnd = random.Random(0)
    maddeler = list(SENTETIK_MADDELER)
    for i in range(n):
        kelime = rnd.choice(KELIME_LISTESI)
        maddeler.append(
            {
                "madde_id": f"s{i}",
                "madde": kelime,
                "anlamlarListe": [{"anlam": rnd.choice(CUMLELER), "fiil": "0", "ozelliklerListe": [{"tam_adi": "isim"}]}],
            }
        )
    return maddeler


def _sentetik_sorular(n: int) -> list[meb.Soru]:
    rnd = random.Random(1)
    dersler = ["Biyoloji", "Tarih", "Türk Dili ve Edebiyatı"]
    sorular = []
    for i in range(n):
        secenekler = [f"{rnd.choice(KELIME_LISTESI)} {rnd.choice(KELIME_LISTESI)}" for _ in range(4)]
        sorular.append(
            meb.Soru(
                kimlik=f"test:{i}",
                kaynak="meb-pdf",
                ders=rnd.choice(dersler),
                soru=f"Aşağıdakilerden hangisi {i}. soruda doğrudur?",
                secenekler=secenekler,
                cevap=rnd.randrange(4),
            )
        )
    return meb.bol(sorular)


def test_tum_boru_hatti(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text(TEST_AYARLARI, encoding="utf-8")
    tdk = tmp_path / "veri" / "tdk"
    tdk.mkdir(parents=True)
    (tdk / "kelimeler.txt").write_text("\n".join(KELIME_LISTESI), encoding="utf-8")
    with (tdk / "maddeler.jsonl").open("w", encoding="utf-8") as f:
        for m in _sentetik_maddeler(300):
            f.write(json.dumps({"ara": m["madde"], "durum": "tamam", "sonuc": [m]}, ensure_ascii=False) + "\n")

    assert main(["durum"]) == 0
    assert main(["tdk-derlem"]) == 0
    assert main(["tokenizer-egit"]) == 0
    assert main(["tokenizer-dene", "Kitaplarımızdan", "biri"]) == 0
    assert main(["veri-hazirla"]) == 0
    assert main(["hesapla"]) == 0
    assert main(["egit", "--asama", "tdk", "--cihaz", "cpu"]) == 0
    deney = tmp_path / "ciktilar" / "deneyler" / "g32-alibi-ayri-f16-kat-bicim-rmsnorm-k1"
    assert (deney / "tdk" / "en_iyi.pt").exists()

    (tmp_path / "veri" / "meb").mkdir(parents=True)
    meb.soru_yaz(_sentetik_sorular(60), tmp_path / "veri" / "meb" / "meb_pdf.jsonl")
    assert main(["veri-hazirla"]) == 0
    assert main(["egit", "--asama", "meb", "--cihaz", "cpu"]) == 0
    assert (deney / "meb" / "en_iyi.pt").exists()
    assert main(["sor", "--adet", "1", "--cihaz", "cpu"]) == 0
    assert main(["tanimla", "kitap", "--uzunluk", "5", "--tohum", "0", "--cihaz", "cpu"]) == 0

    ilerleme = (tmp_path / "ciktilar" / "ilerleme.md").read_text(encoding="utf-8")
    assert ilerleme.count("g32-alibi-ayri") == 2  # iki aşama, iki satır
    cikti = capsys.readouterr().out
    assert "MEB test" in cikti and "rastgele" in cikti


def test_kararlar_bossa_egitim_baslamaz(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text('[gomme]\nboyut = "KARAR_VER"\n', encoding="utf-8")
    assert main(["egit", "--asama", "tdk"]) == 2
    assert "gomme.konum" in capsys.readouterr().err
