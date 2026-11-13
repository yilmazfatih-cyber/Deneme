"""Komut satırı: ayar dosyası hataları, ``durum``, Windows kod sayfası, doğrulama verisinin ayrı tutulması."""

from __future__ import annotations

import io
import json
import os
import sys

import pytest
from conftest import KELIME_LISTESI, calisma_kur

from turkce_model.cli import _tokenizer_metinleri, main
from turkce_model.ayarlar import ayarlari_yukle
from turkce_model.veri import dogrulamaya_mi, meta_oku


@pytest.mark.parametrize(
    ("satir", "ipucu"),
    [
        ("konum = rope", "tırnak"),
        ("cikis_baglama = True", "küçük harfle"),
        ("dropout = 0,1", "ondalık"),
    ],
)
def test_toml_yazim_hatasi_turkce_ipucu_verir(tmp_path, monkeypatch, capsys, satir, ipucu):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text(f"[gomme]\n{satir}\n", encoding="utf-8")
    assert main(["durum"]) == 2
    hata = capsys.readouterr().err
    assert "ayarlar.toml okunamadı" in hata and ipucu in hata


def test_toml_bom_okunur_ansi_kodlama_aciklanir(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_bytes('﻿[gomme]\nkonum = "rope"\n'.encode("utf-8"))  # Not Defteri BOM'u
    assert ayarlari_yukle(tmp_path / "ayarlar.toml").gomme.konum == "rope"
    (tmp_path / "ayarlar.toml").write_bytes('[gomme]\nnorm = "yok"  # ılık\n'.encode("cp1254"))
    assert main(["durum"]) == 2
    assert "UTF-8" in capsys.readouterr().err


@pytest.mark.parametrize("ayar", ["gomme=5", "egitim=5", "egitim.tdk=5", "tokenizer=x"])
def test_bolum_yerine_deger_verilirse_aciklamali_hata(tmp_path, monkeypatch, capsys, ayar):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text("", encoding="utf-8")
    assert main(["durum", "--ayar", ayar]) == 2
    assert "bölümdür" in capsys.readouterr().err


def test_ayar_dosyasi_yoksa_yanlis_klasorde_calismaz(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    assert main(["durum"]) == 2
    assert "ayarlar.toml bulunamadı" in capsys.readouterr().err
    assert not (tmp_path / "veri").exists()


def _durum(capsys) -> str:
    assert main(["durum"]) == 0
    return capsys.readouterr().out


def test_durum_yarim_indirmeyi_ve_eskimis_adimi_gosterir(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    calisma_kur(tmp_path, madde=0)
    tdk = tmp_path / "veri" / "tdk"
    (tdk / "kelimeler.txt").write_text("kitap\nev\nokul", encoding="utf-8")
    satirlar = [{"ara": k, "durum": "tamam", "sonuc": []} for k in ("kitap", "ev")]
    (tdk / "maddeler.jsonl").write_text("".join(json.dumps(s) + "\n" for s in satirlar), encoding="utf-8")
    cikti = _durum(capsys)
    assert "2/3 madde" in cikti
    assert "Sıradaki adım: python -m turkce_model tdk-derlem" in cikti

    # Derlem, maddelerden önce üretilmiş (ör. örneklemden sonra tam indirme): yeniden üretilmeli.
    (tdk / "kokler.tsv").write_text("kok\tana\ttur\n", encoding="utf-8")
    eski = (tdk / "maddeler.jsonl").stat().st_mtime - 100
    os.utime(tdk / "kokler.tsv", (eski, eski))
    cikti = _durum(capsys)
    assert "[~] TDK derlemi" in cikti and "yeniden: tdk-derlem" in cikti
    assert "Sıradaki adım: python -m turkce_model tdk-derlem" in cikti


def test_durum_kararlar_eksikse_egitim_yerine_kararlari_ister(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    calisma_kur(tmp_path, ayarlar='[gomme]\nboyut = "KARAR_VER"\n')
    assert main(["tdk-derlem"]) == 0
    (tmp_path / "ciktilar" / "tokenizer").mkdir(parents=True)
    (tmp_path / "ciktilar" / "tokenizer" / "sozcukler.tsv").write_text("", encoding="utf-8")
    (tmp_path / "ciktilar" / "veri").mkdir(parents=True)
    (tmp_path / "ciktilar" / "veri" / "meta.json").write_text("{}", encoding="utf-8")
    capsys.readouterr()
    cikti = _durum(capsys)
    assert "[gomme] kararlarını doldur" in cikti and "egit --asama tdk\n" not in cikti.split("Sıradaki")[1]


def test_windows_kod_sayfasinda_cikti_cokmez(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text("", encoding="utf-8")
    tampon = io.BytesIO()
    cikis = io.TextIOWrapper(tampon, encoding="cp1254")  # Windows'ta dosyaya yönlendirilmiş çıktı gibi
    monkeypatch.setattr(sys, "stdout", cikis)
    assert main(["durum"]) == 0
    cikis.flush()
    metin = tampon.getvalue().decode("cp1254")
    assert "\\u2192" in metin  # "→" kaçış dizisi olarak yazıldı
    assert "Gömme kararları" in metin  # Türkçe harfler olduğu gibi


def test_dogrulama_metinleri_tokenizer_egitimine_ve_tdk_dogrulamasina_karismaz(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    ayar = calisma_kur(tmp_path)
    assert main(["tdk-derlem"]) == 0
    ek = tmp_path / "veri" / "ek_metin"
    ek.mkdir(parents=True)
    paragraflar = [f"Ek paragraf {i}: {KELIME_LISTESI[i % len(KELIME_LISTESI)]} güzel." for i in range(400)]
    (ek / "ek.txt").write_text("\n\n".join(paragraflar), encoding="utf-8")
    dogrulamada = [p for i, p in enumerate(paragraflar) if dogrulamaya_mi(f"ek:ek.txt:{i}")]
    assert dogrulamada  # 400 paragrafın ~%1'i

    ayarlar = ayarlari_yukle(ayar)
    metinler = list(_tokenizer_metinleri(ayarlar))
    derlem = [json.loads(s) for s in (tmp_path / "veri" / "tdk" / "derlem.jsonl").read_text(encoding="utf-8").splitlines()]
    egitim_belgesi = sum(1 for d in derlem if d["bolum"] == "egitim")
    assert len(metinler) == egitim_belgesi + len(paragraflar) - len(dogrulamada)
    assert not set(dogrulamada) & set(metinler)

    assert main(["tokenizer-egit"]) == 0
    (ek / "ek.txt").rename(tmp_path / "ek.txt")  # önce ek metin olmadan hazırla
    assert main(["veri-hazirla"]) == 0
    once = meta_oku(tmp_path / "ciktilar" / "veri")
    (tmp_path / "ek.txt").rename(ek / "ek.txt")
    assert main(["veri-hazirla"]) == 0
    sonra = meta_oku(tmp_path / "ciktilar" / "veri")
    assert sonra["tdk_dogrulama"] == once["tdk_dogrulama"]  # TDK doğrulaması ek metinle değişmez
    assert sonra["ek_dogrulama"]["belge"] == len(dogrulamada)
    assert sonra["ek_paragraf"] == len(paragraflar)
    assert (tmp_path / "ciktilar" / "veri" / "ek_dogrulama.bin").exists()
