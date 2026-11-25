"""Komut satırı: ayar dosyası hataları, ``durum``, Windows kod sayfası, doğrulama verisinin ayrı tutulması,
yazılan komutların deneyi seçen seçenekleri, argüman denetimi, ``hesapla``, DeepSeek modüllerinin bağlantısı.

Tüm veri sentetiktir; modül testleri bu süreçte açılan sahte bir yerel sunucuyla konuşur.
"""

from __future__ import annotations

import argparse
import hashlib
import http.server
import io
import json
import locale
import os
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import threading
from pathlib import Path
from types import SimpleNamespace

import pytest
from conftest import KELIME_LISTESI, TEST_AYARLARI, calisma_kur, sentetik_sorular

from turkce_model import cli, meb, tdk, veri
from turkce_model.ayarlar import ayarlari_yukle
from turkce_model.cli import _komut_eki, _tokenizer_metinleri, main
from turkce_model.egitim import egit, egitim_kilidi
from turkce_model.model import TurkceGPT
from turkce_model.veri import dogrulamaya_mi, meta_oku

try:
    import pymupdf
except ImportError:  # pragma: no cover
    pymupdf = None

pymupdf_gerekli = pytest.mark.skipif(pymupdf is None, reason="pymupdf kurulu değil")


@pytest.mark.parametrize(
    ("satir", "ipucu"),
    [
        ("konum = rope", "tırnak"),
        ("cikis_baglama = True", "küçük harfle"),
        ("dropout = 0,1", "ondalık"),
        ("boyut = 32 000", "binlik ayırıcı kullanma (32000, 32.000 değil)"),
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


def _durum(capsys, *secenekler: str) -> str:
    assert main(["durum", *secenekler]) == 0
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
    (tdk / "derlem.jsonl").write_text("", encoding="utf-8")
    eski = (tdk / "maddeler.jsonl").stat().st_mtime - 100
    for ad in ("kokler.tsv", "derlem.jsonl", "kelimeler.txt"):
        os.utime(tdk / ad, (eski, eski))
    cikti = _durum(capsys)
    assert "[~] TDK derlemi" in cikti and "yeniden: tdk-derlem" in cikti
    assert "Sıradaki adım: python -m turkce_model tdk-derlem" in cikti


def test_durum_derlem_ve_kok_sozlugunun_ikisini_de_ister(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    calisma_kur(tmp_path)
    assert main(["tdk-derlem"]) == 0
    (tmp_path / "veri" / "tdk" / "derlem.jsonl").unlink()  # kök sözlüğü duruyor, derlem yok
    capsys.readouterr()
    cikti = _durum(capsys)
    assert "[ ] TDK derlemi + kök sözlüğü" in cikti
    assert "Sıradaki adım: python -m turkce_model tdk-derlem" in cikti


def test_durum_kararlar_eksikse_egitim_yerine_kararlari_ister(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    calisma_kur(tmp_path, ayarlar=TEST_AYARLARI.replace("boyut = 32", 'boyut = "KARAR_VER"'))
    for komut in ("tdk-derlem", "tokenizer-egit", "veri-hazirla"):
        assert main([komut]) == 0
    capsys.readouterr()
    cikti = _durum(capsys)
    assert "[gomme] kararlarını doldur" in cikti and "egit --asama tdk\n" not in cikti.split("Sıradaki")[1]
    assert "Sıradaki adım: ayarlar.toml'daki [gomme] kararlarını doldur" in cikti
    # Başka bir ayar dosyasıyla çalışılıyorsa ipucu o dosyayı adlandırır.
    (tmp_path / "ayarlar.toml").rename(tmp_path / "deney2.toml")
    assert main(["durum", "--ayarlar", "deney2.toml"]) == 0
    assert "Sıradaki adım: deney2.toml'daki [gomme] kararlarını doldur" in capsys.readouterr().out


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


# --------------------------------------------------------------------------------------------
# durum: içerikle eskime, yayılma, süren / yarım / değerlendirilmemiş eğitim, başka deneyler
# --------------------------------------------------------------------------------------------


@pytest.fixture(scope="module")
def tam_calisma(tmp_path_factory) -> Path:
    """Tokenizer'ı, hazır verisi (MEB soruları dahil) ve iki aşaması da eğitilip değerlendirilmiş çalışma klasörü."""
    kok = tmp_path_factory.mktemp("tam")
    ayar = str(calisma_kur(kok))
    (kok / "veri" / "meb").mkdir(parents=True)
    meb.soru_yaz(sentetik_sorular(60), kok / "veri" / "meb" / "meb_pdf.jsonl")
    for komut in (["tdk-derlem"], ["tokenizer-egit"], ["veri-hazirla"], ["egit", "--asama", "tdk"], ["egit", "--asama", "meb"]):
        assert main([*komut, "--ayarlar", ayar, "--cihaz", "cpu"]) == 0
    return kok


def _kopya(tam_calisma: Path, hedef: Path, monkeypatch) -> Path:
    """Tam çalışma klasörünün kopyası; çalışma dizini oraya alınır. Bütün dosya zamanları sıraları korunarak
    1000 sn geriye alınır: testte yazılan ya da yeniden üretilen her dosya, eskilerden açıkça yeni olur."""
    shutil.copytree(tam_calisma, hedef)
    for yol in [hedef, *hedef.rglob("*")]:
        _kaydir(yol, -1000)
    monkeypatch.chdir(hedef)
    return hedef


def _deney(kok: Path) -> Path:
    return ayarlari_yukle(kok / "ayarlar.toml").deney_klasoru


def _kaydir(yol: Path, fark: float) -> None:
    """Dosyanın (ya da klasörün) zamanını ``fark`` saniye ileri (+) ya da geri (-) alır."""
    zaman = yol.stat().st_mtime + fark
    os.utime(yol, (zaman, zaman))


def _satir(cikti: str, ad: str) -> str:
    """``durum`` çıktısında adı ``ad`` olan adımın satırı."""
    return next(s for s in cikti.splitlines() if s.lstrip().startswith("[") and ad in s)


def _isaret(cikti: str, ad: str) -> str:
    return _satir(cikti, ad).lstrip()[:3]


def _durum_yaz(klasor: Path, **alanlar) -> dict:
    durum = json.loads((klasor / "durum.json").read_text(encoding="utf-8"))
    durum.update(alanlar)
    durum = {k: v for k, v in durum.items() if v is not ...}  # ... verilen alan silinir
    (klasor / "durum.json").write_text(json.dumps(durum), encoding="utf-8")
    return durum


MODELLER = ("Aşama 1 modeli (TDK)", "Aşama 2 modeli (MEB)")


def test_durum_bitmis_calisma_alaninda_her_adim_tamam(tam_calisma, tmp_path, monkeypatch, capsys):
    _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    cikti = _durum(capsys)
    for ad in ("TDK derlemi", "Tokenizer", "Hazır veri", *MODELLER):
        assert _isaret(cikti, ad) == "[x]", _satir(cikti, ad)
    assert "MEB soruları dahil" in _satir(cikti, "Hazır veri")
    assert "Yarıda kalan" not in cikti and "Modüller:" not in cikti
    assert "Bütün adımlar tamam. Sonuçlar için: python -m turkce_model degerlendir\n" in cikti


def test_durum_eskimeyi_zincir_boyunca_yayar_komutlar_secenekleri_tasir(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    deney = _deney(kok).name
    (kok / "ayarlar.toml").rename(kok / "deney 2.toml")  # başka bir ayar dosyası; boşluklu ad tırnaklanmalı
    _kaydir(kok / "veri" / "tdk" / "maddeler.jsonl", 100)  # tam indirmeden sonra gibi: derlem eskidi
    cikti = _durum(capsys, "--ayarlar", "deney 2.toml", "--ayar", 'gomme.konum="alibi"', "--deney", deney)
    ek = f" --ayarlar 'deney 2.toml' --ayar 'gomme.konum=\"alibi\"' --deney {deney}"
    assert "[~] TDK derlemi + kök sözlüğü" in cikti and f"girdileri sonradan değişti → yeniden: tdk-derlem{ek}" in cikti
    # Derlemden sonraki her adım da yenilenecek: tokenizer, hazır veri, iki model.
    for ad in ("Tokenizer", "Hazır veri", *MODELLER):
        assert _isaret(cikti, ad) == "[~]" and "önceki adım yenilenecek" in _satir(cikti, ad), _satir(cikti, ad)
    assert f"meb-mmlu{ek}  (isteğe bağlı" in cikti
    assert f"Sıradaki adım: python -m turkce_model tdk-derlem{ek}\n" in cikti


def test_durum_ayni_icerikle_yenilenen_zincir_modelleri_eskitmez(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    for ad in ("derlem.jsonl", "kokler.tsv"):  # derlem maddelerden eski: yeniden üretilecek
        _kaydir(kok / "veri" / "tdk" / ad, -100)
    assert "Sıradaki adım: python -m turkce_model tdk-derlem\n" in _durum(capsys)
    # Zincir yeniden çalışır; dosyalar yenilenir ama içerikleri aynıdır: modeller imzalarıyla geçerli kalır.
    for komut in ("tdk-derlem", "tokenizer-egit", "veri-hazirla"):
        assert main([komut]) == 0
    cikti = _durum(capsys)
    for ad in ("TDK derlemi", "Tokenizer", "Hazır veri", *MODELLER):
        assert _isaret(cikti, ad) == "[x]", _satir(cikti, ad)
    assert "Bütün adımlar tamam" in cikti


def test_durum_meb_modeli_kendi_verisi_degisince_eskir_tdk_modeli_eskimez(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    meb.soru_yaz(sentetik_sorular(90), kok / "veri" / "meb" / "meb_pdf.jsonl")  # yeni kitapçıklar eklendi
    cikti = _durum(capsys)
    assert "MEB soruları sonradan değişti → yeniden: veri-hazirla" in _satir(cikti, "Hazır veri")
    assert _isaret(cikti, "Aşama 1 modeli") == "[x]"  # MEB soruları TDK verisini değiştirmez
    assert "önceki adım yenilenecek" in _satir(cikti, "Aşama 2 modeli")
    assert "Sıradaki adım: python -m turkce_model veri-hazirla\n" in cikti
    assert main(["veri-hazirla"]) == 0
    cikti = _durum(capsys)
    # tdk_egitim.bin yeniden yazıldı ama içeriği aynı: TDK modeli geçerli; MEB modelinin verisi değişti.
    assert _isaret(cikti, "Aşama 1 modeli") == "[x]"
    assert "hazır veri değişti → yeniden: egit --asama meb --uzerine-yaz" in _satir(cikti, "Aşama 2 modeli")
    assert "Sıradaki adım: python -m turkce_model egit --asama meb --uzerine-yaz\n" in cikti


def test_durum_meb_modeli_basladigi_tdk_modeli_degisince_eskir(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    deney = _deney(kok)
    _durum_yaz(deney / "tdk", kosu="yeni0001")  # TDK aşaması --uzerine-yaz ile yeniden eğitilmiş gibi
    cikti = _durum(capsys)
    assert _isaret(cikti, "Aşama 1 modeli") == "[x]"
    assert "TDK modeli değişti → yeniden: egit --asama meb --uzerine-yaz" in _satir(cikti, "Aşama 2 modeli")
    _durum_yaz(deney / "meb", baslangic=None)  # --sifirdan eğitilmiş MEB modeli TDK modeline bağlı değildir
    assert _isaret(_durum(capsys), "Aşama 2 modeli") == "[x]"


def test_durum_yalniz_son_pt_olan_yarim_egitimde_de_eskimeyi_gorur(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    tdk_klasoru = _deney(kok) / "tdk"
    (tdk_klasoru / "en_iyi.pt").unlink()  # ilk değerlendirmeden önce durdurulmuş: yalnız son.pt var
    durum = _durum_yaz(tdk_klasoru, durum="durduruldu", adim=3)
    cikti = _durum(capsys)
    assert f"adım 3/{durum['toplam_adim']}, bitmedi → sürdür: egit --asama tdk --devam" in _satir(cikti, "Aşama 1 modeli")
    assert main(["tokenizer-egit", "--ayar", "tokenizer.boyut=650"]) == 0  # başka bir tokenizer
    cikti = _durum(capsys)
    assert "tokenizer değişti → yeniden: egit --asama tdk --uzerine-yaz" in _satir(cikti, "Aşama 1 modeli")
    assert "başka bir tokenizer'la hazırlanmış → yeniden: veri-hazirla" in _satir(cikti, "Hazır veri")
    assert "--devam" not in cikti
    # Eski sürümün durum.json'u (imzasız): tokenizer dosyasının zamanına bakılır.
    _durum_yaz(tdk_klasoru, tokenizer=...)
    _kaydir(tdk_klasoru / "son.pt", -100)
    cikti = _durum(capsys)
    assert "tokenizer sonradan değişti → yeniden: egit --asama tdk --uzerine-yaz" in _satir(cikti, "Aşama 1 modeli")


def test_durum_suren_egitimi_gosterir_devam_onermez(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    tdk_klasoru = _deney(kok) / "tdk"
    durum = _durum_yaz(tdk_klasoru, durum="suruyor", adim=3, zaman="2026-11-16 10:00")
    with egitim_kilidi(tdk_klasoru):  # başka bir süreç eğitiyor gibi
        cikti = _durum(capsys)
        satir = _satir(cikti, "Aşama 1 modeli")
        assert f"eğitim şu an sürüyor (adım 3/{durum['toplam_adim']}, son kayıt 2026-11-16 10:00)" in satir
        assert "--devam" not in cikti and "önceki adım yenilenecek" in _satir(cikti, "Aşama 2 modeli")
        assert "Sıradaki adım: süren eğitimin bitmesini bekle (bu deneyin TDK aşaması)" in cikti
        # Eğitim tokenizer'ı ve hazır veriyi kullanırken veri-hazirla önerilmez.
        _kaydir(kok / "ciktilar" / "veri" / "meta.json", -5000)  # girdilerinin hepsinden eski
        cikti = _durum(capsys)
        assert "Sıradaki adım: önce süren eğitimin bitmesini bekle (bu deneyin TDK aşaması tokenizer'ı ve hazır " in cikti
        assert "sonra: python -m turkce_model veri-hazirla\n" in cikti
        # MEB aşaması TDK modelinden başlar: TDK eğitimi sürerken MEB eğitimi de önerilmez.
        _kaydir(kok / "ciktilar" / "veri" / "meta.json", 5000)
        shutil.rmtree(_deney(kok) / "meb")
        cikti = _durum(capsys)
        assert "bekle (MEB aşaması TDK modelinden başlar); sonra: python -m turkce_model egit --asama meb\n" in cikti
    # Kilit kalktı ama durum.json "suruyor" kaldı: süreç öldürülmüş, kaldığı yerden sürdürülür.
    cikti = _durum(capsys)
    assert f"adım 3/{durum['toplam_adim']}, bitmedi → sürdür: egit --asama tdk --devam" in _satir(cikti, "Aşama 1 modeli")


def test_durum_degerlendirilmemis_egitimi_degerlendirmeye_yonlendirir(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    durum = _durum_yaz(_deney(kok) / "tdk", degerlendirildi=False)  # son değerlendirme yarıda kesilmiş
    cikti = _durum(capsys)
    ilerleme = f"adım {durum['adim']}/{durum['toplam_adim']}"
    assert f"{ilerleme}, değerlendirilmedi → degerlendir --asama tdk" in _satir(cikti, "Aşama 1 modeli")
    assert _isaret(cikti, "Aşama 2 modeli") == "[x]"  # model bitmiş: ona bağlı MEB modeli geçerli
    assert "Sıradaki adım: python -m turkce_model degerlendir --asama tdk\n" in cikti


def test_durum_yarida_kalan_baska_deneyleri_listeler(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    kaynak, deneyler = _deney(kok) / "tdk", kok / "ciktilar" / "deneyler"
    toplam = json.loads((kaynak / "durum.json").read_text(encoding="utf-8"))["toplam_adim"]
    for ad, alanlar in (
        ("yarim", {"durum": "durduruldu", "adim": 6}),
        ("olen", {"durum": "suruyor", "adim": 4}),  # süreç öldürülmüş: kilit yok
        ("suren", {"durum": "suruyor", "adim": 2}),  # kilit aşağıda tutuluyor
        ("bitmis", {}),
        ("eski-tok", {"durum": "durduruldu", "adim": 5, "tokenizer": "0000000000000000"}),
    ):
        shutil.copytree(kaynak, deneyler / ad / "tdk")
        _durum_yaz(deneyler / ad / "tdk", **alanlar)
    ayar = str(kok / "ayarlar.toml")
    with egitim_kilidi(deneyler / "suren" / "tdk"):
        cikti = _durum(capsys, "--ayarlar", ayar)
    bolum = cikti.split("Yarıda kalan başka deneyler:\n")[1].split("\n\n")[0].splitlines()
    assert bolum == [
        f"  eski-tok / tdk: adım 5/{toplam}; tokenizer değişti, sürdürülemez",
        f"  olen / tdk: adım 4/{toplam} → egit --asama tdk --devam --deney olen --ayarlar {ayar}",
        f"  yarim / tdk: adım 6/{toplam} → egit --asama tdk --devam --deney yarim --ayarlar {ayar}",
    ]
    # Başka deneyde süren eğitim bu deneyin bitmişliğini değiştirmez.
    assert f"Bütün adımlar tamam. Sonuçlar için: python -m turkce_model degerlendir --ayarlar {ayar}" in cikti


def test_durum_hazir_verinin_eski_bicimini_ve_ek_metni_gorur(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    meta_yolu = kok / "ciktilar" / "veri" / "meta.json"
    meta = json.loads(meta_yolu.read_text(encoding="utf-8"))
    zaman = meta_yolu.stat().st_mtime

    def meta_yaz(**alanlar) -> None:
        meta_yolu.write_text(json.dumps({**meta, **alanlar}), encoding="utf-8")
        os.utime(meta_yolu, (zaman, zaman))

    meta_yaz(surum=1)  # önceki sürümün hazırladığı veri: dosya zamanları değişmeden de eski
    cikti = _durum(capsys)
    assert "eski biçim → yeniden: veri-hazirla" in _satir(cikti, "Hazır veri")
    assert all("önceki adım yenilenecek" in _satir(cikti, ad) for ad in MODELLER)
    assert "Sıradaki adım: python -m turkce_model veri-hazirla\n" in cikti
    # Ek metin sonradan eklendi: tokenizer ve hazır veri yenilenmeli.
    meta_yaz()
    ek = kok / "veri" / "ek_metin"
    ek.mkdir()
    (ek / "ek.txt").write_text("Ek paragraf bir.\n\nEk paragraf iki.", encoding="utf-8")
    _kaydir(ek, 10)
    cikti = _durum(capsys)
    assert "girdileri sonradan değişti → yeniden: tokenizer-egit" in _satir(cikti, "Tokenizer")
    assert "derlem ya da ek metin sonradan değişti" in _satir(cikti, "Hazır veri")
    assert "Sıradaki adım: python -m turkce_model tokenizer-egit\n" in cikti
    # Ek metinle hazırlanmış veri, ek metin kaldırılınca yenilenmeli.
    shutil.rmtree(ek)
    meta_yaz(ek_paragraf=2)
    assert "veri/ek_metin kaldırılmış → yeniden: veri-hazirla" in _satir(_durum(capsys), "Hazır veri")


def test_durum_yarida_kesilen_veri_hazirlamayi_eksik_sayar(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    asil, sayac = veri.AkisYazici.ekle, {"n": 0}

    def ekle(self, metin):
        sayac["n"] += 1
        if sayac["n"] > 5:
            raise KeyboardInterrupt  # Ctrl+C: akışlar boşaltılmış, meta.json yazılmamış
        return asil(self, metin)

    monkeypatch.setattr(veri.AkisYazici, "ekle", ekle)
    assert main(["veri-hazirla"]) == 130
    monkeypatch.setattr(veri.AkisYazici, "ekle", asil)
    assert not (kok / "ciktilar" / "veri" / "meta.json").exists()
    cikti = _durum(capsys)
    assert _isaret(cikti, "Hazır veri") == "[ ]"
    assert all("önceki adım yenilenecek" in _satir(cikti, ad) for ad in MODELLER)
    assert "Sıradaki adım: python -m turkce_model veri-hazirla\n" in cikti


# --------------------------------------------------------------------------------------------
# Yazılan komutlar, argümanlar, üretim, standart girdi, indirme ve derlem
# --------------------------------------------------------------------------------------------


def test_komut_eki_deneyi_secen_secenekleri_tirnaklar(monkeypatch):
    arg = argparse.Namespace(ayarlar="deney 2.toml", ayar=["egitim.tdk.yigin=4", 'gomme.konum="rope"'], deney="d1", cihaz="cpu")
    assert _komut_eki(arg) == " --ayarlar 'deney 2.toml' --ayar egitim.tdk.yigin=4 --ayar 'gomme.konum=\"rope\"' --deney d1"
    assert _komut_eki(arg, cihaz=True).endswith(" --deney d1 --cihaz cpu")
    assert _komut_eki(argparse.Namespace(ayarlar=None, ayar=[], deney=None, cihaz="cpu")) == ""
    monkeypatch.setattr(os, "name", "nt")  # Windows: tek tırnak çalışmaz, çift tırnak kullanılır
    assert _komut_eki(arg) == ' --ayarlar "deney 2.toml" --ayar egitim.tdk.yigin=4 --ayar gomme.konum=\\"rope\\" --deney d1'


def test_egit_yazdigi_komutlar_deneyi_secen_secenekleri_tasir(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    (kok / "ayarlar.toml").rename(kok / "ikinci.toml")
    asil, sayac = TurkceGPT.forward, {"n": 0}

    def ileri(self, *a, **k):
        sonuc = asil(self, *a, **k)
        if self.training:
            sayac["n"] += 1
            if sayac["n"] == 6:  # ikinci adımın ortasında Ctrl+C (adım başına 4 mikro yığın)
                raise KeyboardInterrupt
        return sonuc

    monkeypatch.setattr(TurkceGPT, "forward", ileri)
    secenekler = ["--ayarlar", "ikinci.toml", "--ayar", "egitim.tdk.en_fazla_adim=4", "--deney", "yeni", "--cihaz", "cpu"]
    assert main(["egit", "--asama", "tdk", *secenekler]) == 130
    ek = " --ayarlar ikinci.toml --ayar egitim.tdk.en_fazla_adim=4 --deney yeni --cihaz cpu"
    cikti = capsys.readouterr().out
    assert f"Sürdürmek için: python -m turkce_model egit --asama tdk --devam{ek}\n" in cikti
    assert f"O ana kadarki en iyi modeli değerlendirmek için: python -m turkce_model degerlendir --asama tdk{ek}\n" in cikti


@pytest.mark.parametrize(
    "argv",
    [
        ["sor", "--adet", "-2"],
        ["sor", "--adet", "0"],
        ["tdk-indir", "--ornek", "-5"],
        ["tdk-indir", "--bekleme", "-1"],
        ["tdk-indir", "--bekleme", "nan"],
        ["uret", "kitap", "--uzunluk", "0"],
        ["tanimla", "kitap", "--ust-k", "-1"],
        ["uret", "kitap", "--sicaklik", "nan"],  # eskiden örneklemede izleme dökümü (olasılıkta nan)
        ["uret", "kitap", "--sicaklik", "inf"],
        ["tanimla", "kitap", "--sicaklik", "-0.5"],
        ["uret", "kitap", "--tohum", "-1"],
        ["tdk-indir", "--tohum", "-3"],
    ],
)
def test_aralik_disi_sayi_arguman_hatasi_verir(tmp_path, monkeypatch, capsys, argv):
    monkeypatch.chdir(tmp_path)
    with pytest.raises(SystemExit) as cikis:
        main(argv)
    assert cikis.value.code == 2
    assert "ya da daha büyük olmalı" in capsys.readouterr().err


@pytest.mark.parametrize(
    "argv",
    [
        ["uret", "kitap", "--tohum", str(2**64)],  # eskiden torch'un üretecinde izleme dökümü (taşma)
        ["sor", "--tohum", str(2**64)],
        ["tdk-indir", "--tohum", str(2**64)],
        ["tdk-indir", "--bekleme", "1e10"],  # eskiden time.sleep'te izleme dökümü (OverflowError)
    ],
)
def test_ust_siniri_asan_sayi_arguman_hatasi_verir(tmp_path, monkeypatch, capsys, argv):
    monkeypatch.chdir(tmp_path)
    with pytest.raises(SystemExit) as cikis:
        main(argv)
    assert cikis.value.code == 2
    assert "ya da daha küçük olmalı" in capsys.readouterr().err


def test_sinirdaki_sayilar_kabul_edilir():
    ayristir = cli.ayristirici().parse_args
    assert ayristir(["tanimla", "kitap", "--ust-k", "0"]).ust_k == 0  # 0 = sınırsız
    assert ayristir(["tdk-indir", "--bekleme", "0", "--ornek", "1"]).bekleme == 0.0
    assert ayristir(["sor", "--adet", "1"]).adet == 1
    assert ayristir(["uret", "kitap", "--sicaklik", "0"]).sicaklik == 0.0  # 0 = en olası token
    assert ayristir(["uret", "kitap", "--tohum", str(2**64 - 1)]).tohum == 2**64 - 1
    assert ayristir(["tdk-indir", "--bekleme", "3600", "--tohum", "0"]).bekleme == 3600.0
    # Çok büyük tam sayı float'a çevrilemez: denetim izleme dökümü (OverflowError) vermez.
    assert ayristir(["uret", "kitap", "--uzunluk", "1" + "0" * 400]).uzunluk == 10**400


def test_devam_ve_uzerine_yaz_birlikte_verilemez(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    with pytest.raises(SystemExit) as cikis:
        main(["egit", "--asama", "tdk", "--devam", "--uzerine-yaz"])
    assert cikis.value.code == 2 and "--uzerine-yaz" in capsys.readouterr().err


def test_degerlendir_asama_yardimi_model_ile_verilmeyecegini_soyler(capsys):
    with pytest.raises(SystemExit):
        main(["degerlendir", "--help"])
    assert "--model ile birlikte verme" in " ".join(capsys.readouterr().out.split())


def test_uret_modelin_gordugu_istemi_yazar(tam_calisma, tmp_path, monkeypatch, capsys):
    _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    ciktilar = []
    for istem in ("kitap", "kitap ", "kitap\n"):  # sondaki boşluk ve satır sonu normalleştirmede silinir
        assert main(["uret", istem, "--tohum", "3", "--uzunluk", "8", "--cihaz", "cpu"]) == 0
        ciktilar.append(capsys.readouterr().out)
    assert ciktilar[0].startswith("kitap") and ciktilar[0] == ciktilar[1] == ciktilar[2]


def test_tokenizer_dene_standart_girdiyi_once_utf8_okur(tam_calisma, tmp_path, monkeypatch, capsys):
    _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    # Windows'ta yönlendirilmiş girdi sistem kod sayfasıyla (cp1254) açılır; Not Defteri dosyası UTF-8'dir.
    monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO("Şu kitabı okudum.".encode("utf-8")), encoding="cp1254"))
    assert main(["tokenizer-dene"]) == 0
    assert "geri çözüm: 'Şu kitabı okudum.'" in capsys.readouterr().out
    # UTF-8 olmayan girdi sistemin kod sayfasıyla çözülür.
    monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO("Şu kitabı".encode("cp1254")), encoding="cp1254"))
    monkeypatch.setattr(locale, "getpreferredencoding", lambda do_setlocale=True: "cp1254")
    assert main(["tokenizer-dene"]) == 0
    assert "geri çözüm: 'Şu kitabı'" in capsys.readouterr().out


def test_tdk_indir_ctrl_c_ile_kesilince_sonucu_yazar_130_doner(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text("", encoding="utf-8")
    (tmp_path / "veri" / "tdk").mkdir(parents=True)
    (tmp_path / "veri" / "tdk" / "kelimeler.txt").write_text("kitap\nev\nokul\n", encoding="utf-8")

    class Yanit:
        status_code, headers = 200, {}

        def __init__(self, ara: str) -> None:
            self.ara = ara

        def json(self):
            return [{"madde_id": "1", "madde": self.ara, "anlamlarListe": []}]

    class Oturum:
        istek = 0

        def get(self, url, params=None, timeout=None):
            Oturum.istek += 1
            if Oturum.istek == 2:
                raise KeyboardInterrupt  # ikinci madde inerken Ctrl+C
            return Yanit(params["ara"])

    monkeypatch.setattr(tdk, "_oturum", Oturum)
    monkeypatch.setattr(tdk.time, "sleep", lambda s: None)
    assert main(["tdk-indir", "--bekleme", "0"]) == 130  # "tdk-indir && tdk-derlem" yarım indirmeyle sürmesin
    assert "Sonuç: indirildi 1" in capsys.readouterr().out


def test_tdk_derlem_kelime_listesi_yoksa_hicbir_sey_yazmaz(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    calisma_kur(tmp_path)
    (tmp_path / "veri" / "tdk" / "kelimeler.txt").unlink()
    assert main(["tdk-derlem"]) == 2
    assert "TDK kelime listesi yok" in capsys.readouterr().err
    assert not (tmp_path / "veri" / "tdk" / "derlem.jsonl").exists() and not (tmp_path / "veri" / "tdk" / "kokler.tsv").exists()


def test_tokenizer_boyutunda_binlik_ayirici_hemen_aciklanir(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    calisma_kur(tmp_path, ayarlar=TEST_AYARLARI.replace("boyut = 700", "boyut = 16.000"))
    assert main(["tdk-derlem"]) == 2  # her komut ayarları yüklerken durur; tokenizer-egit işini bitirip çökmez
    hata = capsys.readouterr().err
    assert "tokenizer.boyut pozitif bir tam sayı olmalı (şu an: 16.0); binlik ayırıcı kullanma: 16000" in hata
    assert not (tmp_path / "veri" / "tdk" / "derlem.jsonl").exists()


# --------------------------------------------------------------------------------------------
# hesapla
# --------------------------------------------------------------------------------------------


def test_hesapla_egitim_ayarlarini_iki_asama_icin_dogrular(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    calisma_kur(tmp_path)
    assert main(["hesapla", "--ayar", 'egitim.tdk.yigin="8"']) == 2
    assert "egitim.tdk.yigin pozitif bir tam sayı olmalı" in capsys.readouterr().err
    assert main(["hesapla", "--ayar", "egitim.meb.birikim=0"]) == 2
    assert "egitim.meb.birikim" in capsys.readouterr().err


@pytest.mark.parametrize(
    "argv",
    [
        ["egit", "--asama", "tdk", "--ayar", "egitim.tdk.tohum=-1"],  # eskiden numpy'de izleme dökümü
        ["egit", "--asama", "meb", "--ayar", f"egitim.meb.tohum={2**64}"],  # eskiden torch'ta taşma
        ["hesapla", "--ayar", "egitim.meb.tohum=1.5"],
        ["degerlendir", "--ayar", "egitim.tdk.tohum=true"],
    ],
)
def test_egitim_tohumu_aralik_disindaysa_turkce_hata_verir(tmp_path, monkeypatch, capsys, argv):
    # C4: egitim.<aşama>.tohum 0 … 2**63 - 1 arasında bir tam sayı olmalı; ayar dosyasında ya da --ayar ile.
    monkeypatch.chdir(tmp_path)
    calisma_kur(tmp_path)
    assert main([*argv, "--cihaz", "cpu"]) == 2
    hata = capsys.readouterr().err
    asama = argv[argv.index("--ayar") + 1].split(".")[1]
    assert "Eğitim ayarlarında sorun var" in hata
    assert f"egitim.{asama}.tohum 0 ile 9223372036854775807 arasında bir tam sayı olmalı (şu an: " in hata


def test_hesapla_iki_asamanin_bellegini_ve_adim_suresini_gosterir(tmp_path, monkeypatch, capsys):
    from turkce_model import egitim

    monkeypatch.chdir(tmp_path)
    calisma_kur(tmp_path)  # TEST ayarları: tdk yığın 4 × birikim 4, meb yığın 4
    olcum = {"cihaz": "cpu", "hassasiyet": "fp32", "token_sn": 1000.0, "adim_sn": 0.5, "yigin": 4}
    monkeypatch.setattr(egitim, "hiz_olc", lambda *a, **k: olcum)  # hiz_olc tek mikro yığını ölçer
    monkeypatch.setattr(cli, "_bellek_gb", lambda cihaz: 1e-9)  # her tahmin cihaz için "fazla" olsun
    assert main(["hesapla", "--olc", "--ayar", "egitim.meb.yigin=64"]) == 0
    cikti = capsys.readouterr().out
    assert "Aşama 2 (MEB): aktivasyon + logit" in cikti and "(yığın 64; TDK karışım yığınları tam bağlamdır)" in cikti
    assert "egitim.meb.yigin'i küçült, egitim.meb.birikim'i aynı oranda büyüt" in cikti  # büyük olan aşama 2
    assert "adım başına (yığın 4 × birikim 4) ~2.00 sn" in cikti
    assert "Eğitim sonundaki tam değerlendirme 4 pencerelik yığınlarla yapılır" in cikti
    assert main(["hesapla"]) == 0
    assert "egitim.tdk.yigin'i küçült" in capsys.readouterr().out


def test_windows_bellegi_ctypes_ile_okunur_okunamazsa_cokmez(monkeypatch):
    import ctypes

    def doldur(ref) -> int:
        ref._obj.ullTotalPhys = 16 * 10**9
        return 1

    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(ctypes, "windll", SimpleNamespace(kernel32=SimpleNamespace(GlobalMemoryStatusEx=doldur)), raising=False)
    assert cli._bellek_gb("cpu") == pytest.approx(16.0)
    monkeypatch.setattr(ctypes, "windll", SimpleNamespace(), raising=False)  # okunamadı: uyarı atlanır
    assert cli._bellek_gb("cpu") is None


# --------------------------------------------------------------------------------------------
# DeepSeek modüllerinin komut satırına bağlanması
# --------------------------------------------------------------------------------------------


class _Istekci(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):  # sessiz
        pass

    def _yaz(self, kod: int, veri_: dict) -> None:
        govde = json.dumps(veri_).encode("utf-8")
        self.send_response(kod)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(govde)))
        self.end_headers()
        self.wfile.write(govde)

    def do_GET(self):
        self._yaz(200, {"object": "list", "data": [{"id": "deepseek-ocr"}]})

    def do_POST(self):
        govde = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.istekler.append(govde)
        if self.server.hata:  # (HTTP kodu, ileti): sunucu her isteğe bu hatayı döndürür
            self._yaz(self.server.hata[0], {"error": {"message": self.server.hata[1]}})
            return
        self._yaz(200, {"choices": [{"message": {"role": "assistant", "content": self.server.cevapla(govde)}}]})


@pytest.fixture
def sunucu():
    """127.0.0.1'de sahte OpenAI uyumlu sunucu: ``.adres``, ``.istekler``, ``.cevapla`` (istek → metin), ``.hata``
    (``None`` ya da her isteğe döndürülecek ``(HTTP kodu, ileti)``)."""
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Istekci)
    s.istekler, s.cevapla, s.hata = [], lambda govde: "", None
    s.adres = f"http://127.0.0.1:{s.server_address[1]}/v1"
    threading.Thread(target=s.serve_forever, daemon=True).start()
    yield s
    s.shutdown()
    s.server_close()


def _kapali_adres() -> str:
    with socket.socket() as s:  # boş bir kapı bul, sonra kapat: orada dinleyen yok
        s.bind(("127.0.0.1", 0))
        return f"http://127.0.0.1:{s.getsockname()[1]}/v1"


def _taranmis_pdf(yol: Path, sayfa: int) -> Path:
    """Metin katmanı olmayan PDF; her sayfada başka yerde bir kare (görüntüleri farklı olsun)."""
    yol.parent.mkdir(parents=True, exist_ok=True)
    belge = pymupdf.open()
    for i in range(sayfa):
        s = belge.new_page(width=200, height=200)
        s.draw_rect(pymupdf.Rect(10 + 20 * i, 10, 25 + 20 * i, 25), color=(0, 0, 0), fill=(0, 0, 0))
    belge.save(yol)
    belge.close()
    return yol


# OCR modülünün bir kitapçıktan okuyacağı sayfa metinleri (sentetik).
KITAPCIK = [
    "(111) TARİH - 1\n\n1. Birinci sorunun kökü hangisidir?\n\nA) Bir\nB) İki\nC) Üç\nD) Dört\n\n"
    "2. İkinci sorunun kökü hangisidir?\n\nA) Beş\nB) Altı\nC) Yedi\nD) Sekiz",
    "(111) TARİH - 1\n\n3. Üçüncü sorunun kökü hangisidir?\n\nA) Dokuz\nB) On\nC) On bir\nD) On iki",
    "CEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1. A\n2. C\n3. D",
]


def test_modul_ayarlari_dosyadan_ve_ayar_seceneginden_okunur(tmp_path, monkeypatch, capsys):
    dosya = tmp_path / "ayarlar.toml"
    dosya.write_text('[moduller]\nzaman_asimi = 60\n\n[moduller.ocr]\nmodel = "deepseek-ocr"\n', encoding="utf-8")
    a = ayarlari_yukle(dosya, ["moduller.metin.model=deepseek-r1:1.5b"])  # tırnaksız ad da metin sayılır
    assert (a.moduller.zaman_asimi, a.moduller.ocr.model, a.moduller.metin.model) == (60, "deepseek-ocr", "deepseek-r1:1.5b")
    monkeypatch.chdir(tmp_path)
    for ayar, parca in (
        ("moduller.ocr.dpi=5", "moduller.ocr.dpi"),
        ("moduller.adres=localhost:11434", "http://"),
        ("moduller.ocr.modell=x", "Bilinmeyen ayar: moduller.ocr.modell"),
        ("moduller=1", "bölümdür"),
    ):
        assert main(["durum", "--ayar", ayar]) == 2
        assert parca in capsys.readouterr().err


def test_modul_komutlari_kapaliyken_nasil_acilacagini_soyler(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text("", encoding="utf-8")
    assert main(["modul-liste", "--ayar", f"moduller.adres={_kapali_adres()}"]) == 0
    cikti = capsys.readouterr().out
    assert "ocr: kapalı" in cikti and "metin: kapalı" in cikti and "Sunucu: Yerel model sunucusuna ulaşılamadı" in cikti
    for argv, parca in (
        (["modul-dene"], "Açık modül yok"),
        (["ocr", "sayfa.png"], "OCR modülü kapalı"),
        (["modul-kiyas"], "Kıyas (metin) modülü kapalı"),
    ):
        assert main(argv) == 2, argv
        hata = capsys.readouterr().err
        assert parca in hata and ("Açmak için" in hata or "açmak için" in hata) and "için: Açmak" not in hata


def test_durum_acik_modulleri_sunucuya_baglanmadan_gosterir(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    calisma_kur(tmp_path)
    assert "Modüller:" not in _durum(capsys)
    cikti = _durum(capsys, "--ayar", "moduller.ocr.model=deepseek-ocr", "--ayar", f"moduller.adres={_kapali_adres()}")
    assert "Modüller: ocr deepseek-ocr, metin kapalı (sınamak için: python -m turkce_model modul-dene --ayar " in cikti


@pymupdf_gerekli
def test_meb_pdf_ocr_modul_kapaliysa_hicbir_sey_yazmaz(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text("", encoding="utf-8")
    _taranmis_pdf(tmp_path / "veri" / "meb" / "pdf" / "kitapcik.pdf", 2)
    hedef = tmp_path / "veri" / "meb" / "meb_pdf.jsonl"
    hedef.write_text("önceki çıktı\n", encoding="utf-8")
    once = (hedef.read_bytes(), hedef.stat().st_mtime_ns)
    assert main(["meb-pdf", "--ocr"]) == 2
    assert "OCR modülü kapalı" in capsys.readouterr().err
    assert (hedef.read_bytes(), hedef.stat().st_mtime_ns) == once


def test_sor_resim_modul_kapaliysa_model_yuklemeden_durur(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text("", encoding="utf-8")
    (tmp_path / "soru.png").write_bytes(b"\x89PNG-sahte")
    monkeypatch.setattr(cli, "_model_yukle", lambda *a: pytest.fail("model yüklenmemeliydi"))
    assert main(["sor", "--resim", "soru.png"]) == 2
    assert "OCR modülü kapalı" in capsys.readouterr().err


@pymupdf_gerekli
def test_meb_pdf_ocr_metinsiz_kitapcigi_sorulara_cevirir(sunucu, tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text(
        f'[moduller]\nadres = "{sunucu.adres}"\nzaman_asimi = 10\n\n[moduller.ocr]\nmodel = "deepseek-ocr"\ndpi = 72\n',
        encoding="utf-8",
    )
    _taranmis_pdf(tmp_path / "veri" / "meb" / "pdf" / "kitapcik.pdf", len(KITAPCIK))
    sunucu.cevapla = lambda govde: KITAPCIK[len(sunucu.istekler) - 1]  # sayfalar sırayla okunur
    assert main(["meb-pdf", "--ocr"]) == 0
    sorular = meb.soru_oku(tmp_path / "veri" / "meb" / "meb_pdf.jsonl")
    assert sorted(s.soru for s in sorular) == [
        "Birinci sorunun kökü hangisidir?", "Üçüncü sorunun kökü hangisidir?", "İkinci sorunun kökü hangisidir?"
    ]
    assert {s.soru: s.cevap for s in sorular}["Üçüncü sorunun kökü hangisidir?"] == 3
    assert all(s.ek["okuma"] == "ocr" and s.ek["ocr_model"] == "deepseek-ocr" for s in sorular)
    assert len(sunucu.istekler) == len(KITAPCIK)


@pymupdf_gerekli
def test_meb_pdf_ocr_sunucu_kapaliysa_kendi_iletisiyle_durur(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text("", encoding="utf-8")
    for ad in ("a.pdf", "b.pdf"):
        _taranmis_pdf(tmp_path / "veri" / "meb" / "pdf" / ad, 1)
    secenekler = ["--ayar", f"moduller.adres={_kapali_adres()}", "--ayar", "moduller.ocr.model=deepseek-ocr"]
    assert main(["meb-pdf", "--ocr", *secenekler]) == 2
    hata = capsys.readouterr().err
    # Sunucu hatası her kitapçıkta yinelenir: dosya "okunamadı" sayılmaz, sunucunun iletisiyle durulur.
    assert "Yerel model sunucusuna ulaşılamadı" in hata and "hiçbiri okunamadı" not in hata
    assert not (tmp_path / "veri" / "meb" / "meb_pdf.jsonl").exists()


@pymupdf_gerekli
def test_meb_pdf_metinsiz_kitapcikta_ocr_komutunu_onerir(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text("", encoding="utf-8")
    _taranmis_pdf(tmp_path / "veri" / "meb" / "pdf" / "taranmis.pdf", 1)
    main(["meb-pdf"])
    assert "taranmış (resim) bir PDF olabilir. OCR ile okumak için: python -m turkce_model meb-pdf --ocr" in capsys.readouterr().out


@pymupdf_gerekli
def test_meb_pdf_klasor_ile_yazilan_ocr_komutu_ayni_klasoru_okur(sunucu, tmp_path, monkeypatch, capsys):
    # C2: meb-pdf --klasor <klasör>: taranmış kitapçık uyarısı ve OCR'sız okumanın reddi "meb-pdf --ocr" komutunu
    # --klasor ile yazar. Eskiden --klasor'suz yazardı: aynen çalıştırılınca varsayılan klasörü okur, buradan OCR ile
    # okunmuş soruları silerdi.
    monkeypatch.chdir(tmp_path)
    (tmp_path / "mod.toml").write_text(
        f'[moduller]\nadres = "{sunucu.adres}"\nzaman_asimi = 10\n\n[moduller.ocr]\nmodel = "deepseek-ocr"\ndpi = 72\n',
        encoding="utf-8",
    )
    klasor = tmp_path / "eski kitaplar"
    _taranmis_pdf(klasor / "kitapcik.pdf", len(KITAPCIK))
    okunan: dict[str, str] = {}  # sayfa görüntüsü → metin: ilk üç farklı sayfa kitapçığınkiler, sonrakiler boş

    def cevapla(govde: dict) -> str:
        sayfa = json.dumps(govde["messages"], sort_keys=True)
        if sayfa not in okunan:
            okunan[sayfa] = KITAPCIK[len(okunan)] if len(okunan) < len(KITAPCIK) else ""
        return okunan[sayfa]

    sunucu.cevapla = cevapla
    secenek = ["--ayarlar", "mod.toml", "--klasor", "eski kitaplar"]
    komut = f"python -m turkce_model meb-pdf --ocr --ayarlar mod.toml --klasor {cli._tirnak('eski kitaplar')}"
    hedef = tmp_path / "veri" / "meb" / "meb_pdf.jsonl"
    assert main(["meb-pdf", *secenek]) == 0  # OCR'sız: kitapçıkta metin yok, uyarı OCR komutunu yazar
    assert f"taranmış (resim) bir PDF olabilir. OCR ile okumak için: {komut}\n" in capsys.readouterr().out
    assert main(shlex.split(komut)[3:]) == 0  # yazılan komut aynen: aynı klasörü OCR ile okur
    assert len(meb.soru_oku(hedef)) == 3
    # Sonradan taranmış bir kitapçık daha eklendi: OCR'sız okuma reddedilir; yazılan komut OCR'lı soruları korur.
    belge = pymupdf.open()
    belge.new_page(width=200, height=200).draw_rect(pymupdf.Rect(150, 150, 170, 170), color=(0, 0, 0), fill=(0, 0, 0))
    belge.save(klasor / "yeni.pdf")
    belge.close()
    once = hedef.read_bytes()
    capsys.readouterr()
    assert main(["meb-pdf", *secenek]) == 2
    assert capsys.readouterr().err.rstrip().endswith(f"OCR ile okumak için: {komut}")
    assert hedef.read_bytes() == once
    assert main(shlex.split(komut)[3:]) == 0
    sorular = meb.soru_oku(hedef)
    assert sorted(s.ek["dosya"] for s in sorular) == ["kitapcik.pdf"] * 3 and all(s.ek["okuma"] == "ocr" for s in sorular)


def test_sor_resim_fotograftaki_soruyu_modele_sorar(tam_calisma, sunucu, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    (kok / "soru.png").write_bytes(b"\x89PNG-sahte-foto")
    sunucu.cevapla = lambda govde: "7. Aşağıdakilerden hangisi bir kitaptır?\n\nA) Kalem\nB) Defter\nC) Masal\nD) Okul"
    secenekler = ["--ayar", f"moduller.adres={sunucu.adres}", "--ayar", "moduller.ocr.model=deepseek-ocr", "--cihaz", "cpu"]
    assert main(["sor", "--resim", "soru.png", "--adet", "5", *secenekler]) == 0
    cikti = capsys.readouterr().out
    assert "Aşağıdakilerden hangisi bir kitaptır?" in cikti and "D) Okul" in cikti
    assert cikti.count("modelin seçimi") == 1 and "doğru cevap bilinmiyor" in cikti and "doğru cevap " not in cikti.replace(
        "doğru cevap bilinmiyor", ""
    )


# --------------------------------------------------------------------------------------------
# Yarıda kalan --uzerine-yaz: süreç ilk adımından önce öldürülünce (kill -9) eski eğitim kenarda kalır
# --------------------------------------------------------------------------------------------

# Gerçek bir eğitim süreci; ilk iyileştirici adımında kendini SIGKILL ile öldürür (bellek yetmeyince işletim sisteminin
# öldürmesi ya da elektrik kesilmesi gibi): eski eğitim kenara alınmış, yeni eğitim tek adım tamamlamamıştır.
_OLDUREN_EGITIM = (
    "import os, signal, sys\n"
    "import torch\n"
    "from turkce_model import cli\n"
    "def adim(self, *a, **k):\n"
    "    os.kill(os.getpid(), signal.SIGKILL)\n"
    "torch.amp.GradScaler.step = adim\n"
    "sys.exit(cli.main(sys.argv[1:]))\n"
)
sigkill_gerekli = pytest.mark.skipif(not hasattr(signal, "SIGKILL"), reason="SIGKILL yok (Windows)")


def _surec_ortami() -> dict[str, str]:
    paket_koku = str(Path(cli.__file__).resolve().parent.parent)
    yol = os.pathsep.join(filter(None, [paket_koku, os.environ.get("PYTHONPATH")]))
    return {**os.environ, "PYTHONPATH": yol, "PYTHONDONTWRITEBYTECODE": "1"}


def _oldurulen_egitim(kok: Path, *argv: str, betik: str = _OLDUREN_EGITIM) -> None:
    """``egit`` komutunu ayrı bir süreçte çalıştırır; süreç ``betik``in seçtiği anda (varsayılan: ilk adımında)
    kill -9 ile ölür."""
    surec = subprocess.run(
        [sys.executable, "-c", betik, "egit", *argv, "--cihaz", "cpu"],
        cwd=kok,
        env=_surec_ortami(),
        capture_output=True,
        text=True,
        timeout=600,
    )
    assert surec.returncode == -signal.SIGKILL, surec.stdout + surec.stderr


def _ozetler(klasor: Path) -> dict[str, str]:
    return {y.name: hashlib.sha256(y.read_bytes()).hexdigest() for y in klasor.iterdir() if y.name != "egitim.kilit"}


def _kenara_alinmis_gibi(klasor: Path) -> None:
    """kill -9 ile ölen --uzerine-yaz'ın bıraktığı dosyalar (süreç testleri gerçeğini doğrular): eski eğitim kenarda,
    yeni koşunun durum.json'u ve boş günlüğü yerinde, kontrol noktası yok."""
    for ad in ("durum.json", "gunluk.jsonl", "en_iyi.pt", "son.pt"):
        os.replace(klasor / ad, klasor / (ad + ".eski"))
    yeni = {"durum": "suruyor", "adim": 0, "toplam_adim": 99, "kosu": "yeni0001"}
    (klasor / "durum.json").write_text(json.dumps(yeni), encoding="utf-8")
    (klasor / "gunluk.jsonl").write_text("", encoding="utf-8")


def _eski_durum_yaz(klasor: Path, **alanlar) -> dict:
    yol = klasor / "durum.json.eski"
    durum = {**json.loads(yol.read_text(encoding="utf-8")), **alanlar}
    yol.write_text(json.dumps(durum), encoding="utf-8")
    return durum


@sigkill_gerekli
def test_kill9_ile_olen_uzerine_yaz_durumda_gorunur_onerilen_komut_geri_getirir(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    tdk_klasoru = _deney(kok) / "tdk"
    once = _ozetler(tdk_klasoru)
    toplam = json.loads((tdk_klasoru / "durum.json").read_text(encoding="utf-8"))["toplam_adim"]
    # --uzerine-yaz çoğu kez yeni ayarlarla denenir: yığın kayıtlı eğitimdekinden farklı (--devam'da kilitli bir ayar).
    yeni = ("--ayar", "egitim.tdk.yigin=8")
    _oldurulen_egitim(kok, "--asama", "tdk", "--uzerine-yaz", *yeni)
    dosyalar = {y.name for y in tdk_klasoru.iterdir()}
    assert {"son.pt.eski", "en_iyi.pt.eski", "durum.json.eski", "gunluk.jsonl.eski", "durum.json"} <= dosyalar
    assert not {"son.pt", "en_iyi.pt"} & dosyalar
    assert json.loads((tdk_klasoru / "durum.json").read_text(encoding="utf-8"))["durum"] == "suruyor"  # yeni koşunun

    # Eskiden: "[ ] Aşama 1 modeli (TDK)  egit --asama tdk" (model yok gibi); önerilen komut "zaten bir eğitim var" ile 2.
    cikti = _durum(capsys, *yeni)
    ek = " --ayar egitim.tdk.yigin=8"
    assert _satir(cikti, "Aşama 1 modeli").split("(TDK)")[1].strip() == (
        f"yarıda kalan --uzerine-yaz; eski eğitim kenarda: adım {toplam}/{toplam} → geri getirmek için: "
        f"egit --asama tdk --devam{ek}"
    )
    assert _isaret(cikti, "Aşama 1 modeli") == "[~]"
    assert _isaret(cikti, "Aşama 2 modeli") == "[x]"  # MEB modeli kenardaki TDK modelinden başlamıştı: eskimedi
    siradaki = f"python -m turkce_model egit --asama tdk --devam{ek}"
    assert f"Sıradaki adım: {siradaki}\n" in cikti

    # Önerilen komut aynen: eski eğitimi yerine koyar, "zaten bitmiş" der, 0 ile biter (yeni yığın ayarına rağmen).
    assert main(shlex.split(siradaki)[3:]) == 0
    cikti = capsys.readouterr().out
    assert "kenara alınmış eski eğitim geri getirildi" in cikti
    assert f"Bu eğitim zaten bitmiş (adım {toplam}/{toplam}); sürdürülecek adım yok." in cikti
    assert _ozetler(tdk_klasoru) == once  # eski model, günlük ve durum bayt bayt aynı; kenarda dosya kalmadı
    cikti = _durum(capsys, *yeni)
    assert _isaret(cikti, "Aşama 1 modeli") == "[x]" and "Bütün adımlar tamam" in cikti


@sigkill_gerekli
def test_kill9_ile_olen_uzerine_yaz_sonrasi_model_komutlari_eski_modeli_yerine_koyar(
    tam_calisma, tmp_path, monkeypatch, capsys
):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    meb_klasoru = _deney(kok) / "meb"
    once = _ozetler(meb_klasoru)
    _oldurulen_egitim(kok, "--asama", "meb", "--uzerine-yaz")
    assert not (meb_klasoru / "en_iyi.pt").exists() and (meb_klasoru / "en_iyi.pt.eski").exists()
    # Eskiden uret kenardaki MEB modelini görmez, sessizce TDK modelini kullanırdı.
    assert main(["uret", "kitap", "--uzunluk", "3", "--tohum", "0", "--cihaz", "cpu"]) == 0
    cikis = capsys.readouterr()
    assert f"Not: {meb_klasoru} içinde yarıda kalmış bir eğitim başlangıcı bulundu" in cikis.err
    assert f"(Model: {meb_klasoru / 'en_iyi.pt'}, aşama meb" in cikis.err
    assert "Not:" not in cikis.out  # üretilen metin yönlendirilince yalnız metin kalır
    assert _ozetler(meb_klasoru) == once


def test_durum_kenardaki_eski_egitime_gore_komut_onerir(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    tdk_klasoru = _deney(kok) / "tdk"
    _kenara_alinmis_gibi(tdk_klasoru)
    toplam = json.loads((tdk_klasoru / "durum.json.eski").read_text(encoding="utf-8"))["toplam_adim"]
    on = "yarıda kalan --uzerine-yaz; eski eğitim kenarda: "
    # Bitmemiş eski eğitim: --devam onu yerine koyup sürdürür; model değişecek, MEB modeli de yenilenecek.
    _eski_durum_yaz(tdk_klasoru, durum="durduruldu", adim=5)
    cikti = _durum(capsys)
    assert f"{on}adım 5/{toplam}, bitmedi → sürdür: egit --asama tdk --devam" in _satir(cikti, "Aşama 1 modeli")
    assert "önceki adım yenilenecek" in _satir(cikti, "Aşama 2 modeli")
    # Değerlendirilmemiş eski eğitim: degerlendir onu yerine koyup değerlendirir.
    _eski_durum_yaz(tdk_klasoru, durum="bitti", adim=toplam, degerlendirildi=False)
    cikti = _durum(capsys)
    assert f"{on}adım {toplam}/{toplam}, değerlendirilmedi → degerlendir --asama tdk" in _satir(cikti, "Aşama 1 modeli")
    assert "Sıradaki adım: python -m turkce_model degerlendir --asama tdk\n" in cikti
    # Eskimiş eski eğitim (başka tokenizer): --uzerine-yaz yeniden dener.
    _eski_durum_yaz(tdk_klasoru, degerlendirildi=True, tokenizer="0000000000000000")
    cikti = _durum(capsys)
    assert f"{on}tokenizer değişti → yeniden: egit --asama tdk --uzerine-yaz" in _satir(cikti, "Aşama 1 modeli")
    # Aşamayı şu an bir süreç eğitiyorsa (--uzerine-yaz ilk adımından önce) kenardakiler o sürecindir.
    with egitim_kilidi(tdk_klasoru):
        satir = _satir(_durum(capsys), "Aşama 1 modeli")
    assert "eğitim şu an sürüyor (adım 0/99" in satir and "kenarda" not in satir


def test_durum_baska_deneyde_kenarda_kalan_egitimi_listeler(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    kaynak, deneyler = _deney(kok) / "tdk", kok / "ciktilar" / "deneyler"
    toplam = json.loads((kaynak / "durum.json").read_text(encoding="utf-8"))["toplam_adim"]
    for ad in ("olmus", "eski-tok"):
        shutil.copytree(kaynak, deneyler / ad / "tdk")
        _kenara_alinmis_gibi(deneyler / ad / "tdk")
    _eski_durum_yaz(deneyler / "eski-tok" / "tdk", tokenizer="0000000000000000")
    cikti = _durum(capsys)
    bolum = cikti.split("Yarıda kalan başka deneyler:\n")[1].split("\n\n")[0].splitlines()
    assert bolum == [
        f"  eski-tok / tdk: yarıda kalan --uzerine-yaz; eski eğitim kenarda (adım {toplam}/{toplam}); tokenizer değişti",
        f"  olmus / tdk: yarıda kalan --uzerine-yaz; eski eğitim kenarda (adım {toplam}/{toplam}) → egit --asama tdk "
        "--devam --deney olmus",
    ]


# Gerçek bir eğitim süreci; yeni eğitim ilk adımını bitirip kenara alınan eski eğitimi silerken, ilk silmeden
# (son.pt.eski) hemen sonra kendini SIGKILL ile öldürür.
_SILERKEN_OLDUREN = (
    "import os, signal, sys\n"
    "from pathlib import Path\n"
    "from turkce_model import cli\n"
    "asil = Path.unlink\n"
    "def sil(self, *a, **k):\n"
    "    asil(self, *a, **k)\n"
    "    if self.name.endswith('.eski'):\n"
    "        os.kill(os.getpid(), signal.SIGKILL)\n"
    "Path.unlink = sil\n"
    "sys.exit(cli.main(sys.argv[1:]))\n"
)


@sigkill_gerekli
def test_kill9_kenardakiler_silinirken_olen_uzerine_yaz_sonrasi_onerilen_devam_calisir(
    tam_calisma, tmp_path, monkeypatch, capsys
):
    # C1: durum kenardaki bitmiş eğitim için --devam önerir; eskiden o --devam eski eğitimi geri getirip "--devam
    # verildi ama sürdürülecek eğitim yok" ile 2 dönerdi (son.pt.eski silinmişti).
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    tdk_klasoru = _deney(kok) / "tdk"
    once = _ozetler(tdk_klasoru)
    yeni = ("--ayar", "egitim.tdk.yigin=8")  # --uzerine-yaz yeni ayarlarla denendi (--devam'da kilitli bir ayar)
    _oldurulen_egitim(kok, "--asama", "tdk", "--uzerine-yaz", *yeni, betik=_SILERKEN_OLDUREN)
    dosyalar = {y.name for y in tdk_klasoru.iterdir()}
    assert {"en_iyi.pt.eski", "durum.json.eski", "gunluk.jsonl.eski", "durum.json", "gunluk.jsonl"} <= dosyalar
    assert not {"son.pt.eski", "son.pt", "en_iyi.pt"} & dosyalar  # ilk adım bitti, ilk kayıt yok; model kenarda
    siradaki = "python -m turkce_model egit --asama tdk --devam --ayar egitim.tdk.yigin=8"
    assert f"Sıradaki adım: {siradaki}\n" in _durum(capsys, *yeni)
    assert main(shlex.split(siradaki)[3:]) == 0
    cikti = capsys.readouterr().out
    assert "kenara alınmış eski eğitim geri getirildi" in cikti and "Bu eğitim zaten bitmiş" in cikti
    del once["son.pt"]
    assert _ozetler(tdk_klasoru) == once  # model, günlük ve durum bayt bayt aynı; kenarda dosya kalmadı
    cikti = _durum(capsys, *yeni)
    assert _isaret(cikti, "Aşama 1 modeli") == "[x]" and "Bütün adımlar tamam" in cikti
    assert main(["uret", "kitap", "--uzunluk", "3", "--model", str(tdk_klasoru / "en_iyi.pt"), "--cihaz", "cpu"]) == 0


# --uzerine-yaz'ın kill -9 ile ölebileceği anlar: eskiN: kenara alırken N. dosya .eski yapıldı; silN: yeni eğitim ilk
# adımını bitirdi, kenardakilerden N.'si silindi.
OLUM_ANLARI = (*(f"eski{n}" for n in range(1, 5)), *(f"sil{n}" for n in range(1, 5)))


@pytest.fixture(scope="module")
def olum_anlari(tam_calisma, tmp_path_factory) -> dict[str, Path]:
    """Bir --uzerine-yaz'ın TDK aşama klasörü her ``OLUM_ANLARI`` anında kopyalanır: süreç tam o anda kill -9 ile
    ölseydi diskte kalacak olan (kilit süreçle kalkar; kopyada kilit yok). Gerçek süreçle sil1'i yukarıdaki test sınar."""
    kok = tmp_path_factory.mktemp("anlar")
    shutil.copytree(tam_calisma, kok / "ws")
    a = ayarlari_yukle(kok / "ws" / "ayarlar.toml", ["egitim.tdk.en_fazla_adim=2"])  # anlar ilk adımda biter
    klasor = a.deney_klasoru / "tdk"
    anlar: dict[str, Path] = {}
    asil_replace, asil_unlink = os.replace, Path.unlink

    def kopyala(tur: str) -> None:
        ad = f"{tur}{sum(onceki.startswith(tur) for onceki in anlar) + 1}"
        anlar[ad] = kok / ad
        shutil.copytree(klasor, anlar[ad])

    def replace(kaynak, hedef, *a_, **k):
        asil_replace(kaynak, hedef, *a_, **k)
        if str(hedef).endswith(".eski"):
            kopyala("eski")

    def unlink(self, *a_, **k):
        asil_unlink(self, *a_, **k)
        if self.name.endswith(".eski"):
            kopyala("sil")

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(os, "replace", replace)
        mp.setattr(Path, "unlink", unlink)
        egit(a, "tdk", uzerine_yaz=True, cihaz="cpu", yaz=lambda *_: None)
    assert tuple(anlar) == OLUM_ANLARI
    return anlar


@pytest.mark.parametrize(
    ("an", "beklenen"),
    [
        *((f"eski{n}", "degerlendir") for n in range(1, 4)),  # kenara alma yarım: model yerinde, her şey tamam görünür
        ("eski4", "egit --asama tdk --devam"),  # eski eğitim bütünüyle kenarda: --devam geri getirir
        ("sil1", "egit --asama tdk --devam"),  # son.pt.eski silindi, model kenarda: eskiden bu --devam 2 ile biterdi
        *((f"sil{n}", "egit --asama tdk") for n in range(2, 5)),  # model silindi: belgelendiği gibi eski eğitim gitti
    ],
)
def test_uzerine_yaz_her_olum_aninda_durumun_onerdigi_komut_calisir(
    tam_calisma, olum_anlari, tmp_path, monkeypatch, capsys, an, beklenen
):
    # C1: --uzerine-yaz _kenara_al ya da _eskileri_sil içinde hangi anda ölürse ölsün durum'un önerdiği komut aynen
    # çalıştırılınca 0 ile biter ve aşama kullanılabilir kalır: kendi modeli değerlendirilir, kenarda dosya kalmaz.
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    klasor = _deney(kok) / "tdk"
    shutil.rmtree(klasor)
    shutil.copytree(olum_anlari[an], klasor)
    ayar = kok / "ayarlar.toml"  # model silindiyse yeniden eğitilir: kısa tutulsun (deney adı değişmez)
    ayar.write_text(ayar.read_text(encoding="utf-8").replace("en_fazla_adim = 12", "en_fazla_adim = 2"), encoding="utf-8")
    cikti = _durum(capsys)
    onerilen = next(
        s.split("python -m turkce_model ", 1)[1]
        for s in cikti.splitlines()
        if s.startswith(("Sıradaki adım: python -m turkce_model ", "Bütün adımlar tamam. Sonuçlar için: python -m"))
    )
    assert onerilen == beklenen
    assert main(shlex.split(onerilen)) == 0, onerilen
    capsys.readouterr()
    assert main(["degerlendir", "--asama", "tdk"]) == 0
    assert not list(klasor.glob("*.eski"))
    assert _isaret(_durum(capsys), "Aşama 1 modeli") == "[x]"


def test_durum_son_pt_eski_silinmis_kenardaki_egitim_icin_calisan_komut_onerir(tam_calisma, tmp_path, monkeypatch, capsys):
    # C1: kenardakiler silinirken öldürülmüş (son.pt.eski silinmiş, model kenarda). Bitmiş eğitim --devam ile modeliyle
    # geri gelir; bitmemiş eğitim son.pt'siz sürdürülemez: başka deneyler listesi artık --devam önermez (2 ile biterdi).
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    kaynak, deneyler = _deney(kok) / "tdk", kok / "ciktilar" / "deneyler"
    toplam = json.loads((kaynak / "durum.json").read_text(encoding="utf-8"))["toplam_adim"]
    for ad in ("bitmis", "yarim"):
        shutil.copytree(kaynak, deneyler / ad / "tdk")
        _kenara_alinmis_gibi(deneyler / ad / "tdk")
        (deneyler / ad / "tdk" / "son.pt.eski").unlink()
    _eski_durum_yaz(deneyler / "yarim" / "tdk", durum="durduruldu", adim=5)
    on = "yarıda kalan --uzerine-yaz; eski eğitim kenarda"
    bolum = _durum(capsys).split("Yarıda kalan başka deneyler:\n")[1].split("\n\n")[0].splitlines()
    assert bolum == [
        f"  bitmis / tdk: {on} (adım {toplam}/{toplam}) → egit --asama tdk --devam --deney bitmis",
        f"  yarim / tdk: {on} (adım 5/{toplam}); bitmedi ve son.pt yok, sürdürülemez",
    ]
    assert main(shlex.split(bolum[0].split("→ ")[1])) == 0  # listelenen komut aynen: eski eğitim modeliyle döner
    assert "Bu eğitim zaten bitmiş" in capsys.readouterr().out
    assert (deneyler / "bitmis" / "tdk" / "en_iyi.pt").exists() and not list((deneyler / "bitmis" / "tdk").glob("*.eski"))
    # Bu deneyin satırı da bitmemiş eğitime --devam değil --uzerine-yaz önerir.
    _kenara_alinmis_gibi(kaynak)
    (kaynak / "son.pt.eski").unlink()
    _eski_durum_yaz(kaynak, durum="durduruldu", adim=5)
    satir = _satir(_durum(capsys), "Aşama 1 modeli")
    assert f"{on}: adım 5/{toplam}, bitmedi ve son.pt yok → yeniden: egit --asama tdk --uzerine-yaz" in satir


# --------------------------------------------------------------------------------------------
# Hazır veri ve model iletilerinin yazdığı komutlar ayar dosyasını taşır
# --------------------------------------------------------------------------------------------


def test_hazir_veri_ve_model_iletileri_ayar_dosyasini_ve_ayarlari_tasir(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    ayar = (kok / "ayarlar.toml").read_text(encoding="utf-8")
    (kok / "ikinci.toml").write_text(ayar + '\n[yollar]\nciktilar = "ciktilar2"\n', encoding="utf-8")
    shutil.copytree(kok / "ciktilar", kok / "ciktilar2")
    meta_yolu = kok / "ciktilar2" / "veri" / "meta.json"
    meta = json.loads(meta_yolu.read_text(encoding="utf-8"))
    meta_yolu.write_text(json.dumps({**meta, "surum": 1}), encoding="utf-8")  # önceki sürümün hazırladığı veri
    ana_meta = (kok / "ciktilar" / "veri" / "meta.json").read_bytes()
    secenekler = ["--ayarlar", "ikinci.toml", "--ayar", "egitim.tdk.en_fazla_adim=2", "--deney", "x"]
    ek = " --ayarlar ikinci.toml --ayar egitim.tdk.en_fazla_adim=2 --deney x"
    komut = f"python -m turkce_model veri-hazirla{ek}"
    for argv in (["egit", "--asama", "tdk", *secenekler, "--cihaz", "cpu"], ["degerlendir", *secenekler, "--cihaz", "cpu"]):
        assert main(argv) == 2, argv
        hata = capsys.readouterr().err
        # Eskiden yalnız "veri-hazirla": aynen çalıştırılınca ana deneyin verisini hazırlardı. --cihaz veri için değil.
        assert "Hazır veri eski bir sürümle hazırlanmış" in hata and hata.rstrip().endswith(f"Yeniden çalıştır: {komut}")
    assert main(shlex.split(komut)[3:]) == 0  # yazılan komut aynen: ikinci ayar dosyasının verisi
    assert meta_oku(kok / "ciktilar2" / "veri")["surum"] == veri.VERI_SURUMU
    assert (kok / "ciktilar" / "veri" / "meta.json").read_bytes() == ana_meta
    capsys.readouterr()
    # Model iletileri de: x deneyinde model yok.
    assert main(["degerlendir", "--asama", "tdk", *secenekler]) == 2
    assert f"Önce: python -m turkce_model egit --asama tdk{ek}. Başka bir deney" in capsys.readouterr().err
    assert main(["egit", "--asama", "meb", *secenekler, "--cihaz", "cpu"]) == 2
    assert f"Önce: python -m turkce_model egit --asama tdk{ek} --cihaz cpu. Bilerek" in capsys.readouterr().err
    meta = json.loads(meta_yolu.read_text(encoding="utf-8"))
    meta_yolu.write_text(json.dumps({**meta, "tokenizer": "0000000000000000"}), encoding="utf-8")
    assert main(["egit", "--asama", "tdk", *secenekler]) == 2
    assert f"Veri başka bir tokenizer'la hazırlanmış. Yeniden çalıştır: {komut}\n" in capsys.readouterr().err
    meta_yolu.unlink()
    assert main(["degerlendir", *secenekler]) == 2
    assert f"Önce: {komut}\n" in capsys.readouterr().err
    shutil.rmtree(kok / "ciktilar2" / "tokenizer")
    for argv in (["egit", "--asama", "tdk", *secenekler], ["uret", "kitap", *secenekler], ["veri-hazirla", *secenekler]):
        assert main(argv) == 2, argv
        assert f"Önce: python -m turkce_model tokenizer-egit{ek}\n" in capsys.readouterr().err


def test_veri_komutlarinin_onkosul_iletileri_secenekleri_tasir(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    calisma_kur(tmp_path)
    (tmp_path / "ayarlar.toml").rename(tmp_path / "baska.toml")
    (tmp_path / "veri" / "tdk" / "maddeler.jsonl").unlink()
    assert main(["tdk-derlem", "--ayarlar", "baska.toml"]) == 2
    assert "Önce TDK maddelerini indir: python -m turkce_model tdk-indir --ayarlar baska.toml" in capsys.readouterr().err
    assert main(["tokenizer-egit", "--ayarlar", "baska.toml"]) == 2
    assert "Kök sözlüğü yok. Önce: python -m turkce_model tdk-derlem --ayarlar baska.toml" in capsys.readouterr().err


# --------------------------------------------------------------------------------------------
# MEB soruları: OCR ile okunan sorular, durum'un önerisi ve sırası
# --------------------------------------------------------------------------------------------


@pymupdf_gerekli
def test_ocr_ile_okunan_sorular_ocrsuz_meb_pdf_ile_silinmez_durum_ocr_onerir(sunucu, tmp_path, monkeypatch, capsys):
    from turkce_model.moduller import meb_metin

    monkeypatch.chdir(tmp_path)
    modul = f'\n[moduller]\nadres = "{sunucu.adres}"\nzaman_asimi = 10\n\n[moduller.ocr]\nmodel = "deepseek-ocr"\ndpi = 72\n'
    calisma_kur(tmp_path, ayarlar=TEST_AYARLARI + modul)
    (tmp_path / "ayarlar.toml").rename(tmp_path / "mod.toml")
    secenek, ek = ["--ayarlar", "mod.toml"], " --ayarlar mod.toml"
    assert main(["tdk-derlem", *secenek]) == 0
    pdf = tmp_path / "veri" / "meb" / "pdf"
    _taranmis_pdf(pdf / "kitapcik.pdf", len(KITAPCIK))
    sunucu.cevapla = lambda govde: KITAPCIK[len(sunucu.istekler) - 1] if len(sunucu.istekler) <= len(KITAPCIK) else ""
    assert main(["meb-pdf", "--ocr", *secenek]) == 0
    hedef = tmp_path / "veri" / "meb" / "meb_pdf.jsonl"
    rapor_yolu = hedef.with_suffix(".rapor.json")
    assert len(meb.soru_oku(hedef)) == 3 and json.loads(rapor_yolu.read_text(encoding="utf-8"))["ocr"] == "gerekirse"
    # Sonradan taranmış bir kitapçık daha eklendi: yeniden okuma OCR'la önerilir (eskiden OCR'sız "meb-pdf").
    _kaydir(_taranmis_pdf(pdf / "yeni.pdf", 1), 10)
    capsys.readouterr()
    cikti = _durum(capsys, *secenek)
    assert f"girdileri sonradan değişti → yeniden: meb-pdf --ocr{ek}" in _satir(cikti, "MEB soruları")
    assert f"Sıradaki adım: python -m turkce_model meb-pdf --ocr{ek}\n" in cikti
    # OCR'sız meb-pdf OCR ile okunmuş soruları silmez (eskiden 0 soruyla ezer, 0 ile biterdi): 2 ile durur.
    once = (hedef.read_bytes(), hedef.stat().st_mtime_ns, rapor_yolu.read_bytes())
    assert main(["meb-pdf", *secenek]) == 2
    hata = capsys.readouterr().err
    assert "Metin katmanı olmayan (taranmış) kitapçık var: kitapcik.pdf, yeni.pdf." in hata
    assert "3 soru bu kitapçıklardan OCR ile okunmuştu" in hata
    assert hata.rstrip().endswith(f"OCR ile okumak için: python -m turkce_model meb-pdf --ocr{ek}")
    assert (hedef.read_bytes(), hedef.stat().st_mtime_ns, rapor_yolu.read_bytes()) == once
    # --ocr hepsi ile okunmuşsa o kip önerilir; kipi yazmayan eski raporda sorulardan anlaşılır.
    rapor = json.loads(rapor_yolu.read_text(encoding="utf-8"))
    rapor_yolu.write_text(json.dumps({**rapor, "ocr": "hepsi"}), encoding="utf-8")
    assert f"yeniden: meb-pdf --ocr hepsi{ek}" in _satir(_durum(capsys, *secenek), "MEB soruları")
    del rapor["ocr"]
    rapor_yolu.write_text(json.dumps(rapor), encoding="utf-8")
    assert f"yeniden: meb-pdf --ocr{ek}" in _satir(_durum(capsys, *secenek), "MEB soruları")
    # Eski raporda OCR'la okunan kitapçığın metin katmanı varsa "hepsi" ile okunmuştur (gerekirse onu OCR'lamazdı).
    monkeypatch.setattr(meb_metin, "metin_katmani_var", lambda yol, *a, **k: Path(yol).name == "kitapcik.pdf")
    assert f"yeniden: meb-pdf --ocr hepsi{ek}" in _satir(_durum(capsys, *secenek), "MEB soruları")


def test_durum_meb_sorulari_yenilenecekse_once_meb_pdf_onerir(tam_calisma, tmp_path, monkeypatch, capsys):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    meb.soru_yaz(sentetik_sorular(90), kok / "veri" / "meb" / "meb_pdf.jsonl")  # hazır veriden yeni
    yeni = kok / "veri" / "meb" / "pdf" / "yeni.pdf"
    yeni.parent.mkdir()
    yeni.write_bytes(b"%PDF-1.4 sentetik")  # durum yalnız dosya zamanına bakar
    _kaydir(yeni, 10)  # meb_pdf.jsonl'den sonra eklenen kitapçık
    cikti = _durum(capsys)
    assert "girdileri sonradan değişti → yeniden: meb-pdf" in _satir(cikti, "MEB soruları")
    assert "MEB soruları sonradan değişti" in _satir(cikti, "Hazır veri")
    # Eskiden önce veri-hazirla önerilirdi; meb-pdf'ten sonra bir kez daha gerekirdi.
    assert "Sıradaki adım: python -m turkce_model meb-pdf\n" in cikti
    # Tokenizer da yenilenecekse meb-pdf yine önce gelir: tokenizer MEB eğitim sorularını da okur.
    _kaydir(kok / "veri" / "tdk" / "derlem.jsonl", 20)
    _kaydir(kok / "veri" / "tdk" / "kokler.tsv", 20)
    cikti = _durum(capsys)
    assert "yeniden: tokenizer-egit" in _satir(cikti, "Tokenizer")
    assert "Sıradaki adım: python -m turkce_model meb-pdf\n" in cikti


def _not_satirlari(cikti: str) -> list[str]:
    """meb-mmlu'nun notu ve altındaki komut satırları."""
    satirlar = cikti.splitlines()
    i = next(i for i, s in enumerate(satirlar) if s.startswith("Not: meb_pdf.jsonl bundan önce üretilmiş."))
    return satirlar[i:]


def test_meb_mmlu_notu_kopyalanacak_komutlari_kiple_ve_seceneklerle_yazar(tam_calisma, tmp_path, monkeypatch, capsys):
    # C3: TurkishMMLU meb_pdf.jsonl'den sonra indirildi. Not, yeniden çalıştırılacak komutları satır satır, OCR kipiyle
    # ve bu çağrının seçenekleriyle yazar (eskiden kipsiz, seçeneksiz yalnız adlarını sayardı: OCR ile okunmuş
    # sorularda meb-pdf reddederdi, başka ayar dosyasında yanlış veriyi hazırlardı).
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    monkeypatch.setattr(meb, "mmlu_indir", lambda yol: [])  # ağ yok: indirme hiç denenmez
    rapor = kok / "veri" / "meb" / "meb_pdf.rapor.json"
    ek = " --ayarlar ayarlar.toml --ayar egitim.meb.erken_durdurma=3"
    bas = (
        "Not: meb_pdf.jsonl bundan önce üretilmiş. TurkishMMLU ile soru kökü aynı olan PDF soruları eğitimden "
        "çıkarılsın diye bunları sırayla çalıştır:"
    )
    ayristirici = cli.ayristirici()
    for kip, secenek, komutlar in (
        ("hepsi", shlex.split(ek), [f"meb-pdf --ocr hepsi{ek}", f"veri-hazirla{ek}", f"egit --asama meb --uzerine-yaz{ek}"]),
        ("gerekirse", ["--deney", "yeni"], ["meb-pdf --ocr --deney yeni", "veri-hazirla --deney yeni"]),  # MEB modeli yok
        (None, [], ["meb-pdf", "veri-hazirla", "egit --asama meb --uzerine-yaz"]),  # OCR'sız okunmuş sorular
    ):
        rapor.write_text(json.dumps({"ocr": kip}), encoding="utf-8")
        assert main(["meb-mmlu", *secenek]) == 0
        assert _not_satirlari(capsys.readouterr().out) == [bas, *(f"  python -m turkce_model {k}" for k in komutlar)]
        for k in komutlar:
            ayristirici.parse_args(shlex.split(k))  # yazılan her satır geçerli bir komut


def test_durum_meb_pdf_ipucu_gercek_pdf_klasorunu_gosterir(tmp_path, monkeypatch, capsys):
    # C6: [yollar] veri değiştirilmişse durum'un ipucu varsayılan veri/meb/pdf'i değil gerçek klasörü söyler.
    monkeypatch.chdir(tmp_path)
    calisma_kur(tmp_path, ayarlar=TEST_AYARLARI + '\n[yollar]\nveri = "v2"\n')
    (tmp_path / "veri").rename(tmp_path / "v2")
    assert main(["tdk-derlem"]) == 0
    meb.soru_yaz(sentetik_sorular(4), tmp_path / "v2" / "meb" / "meb_pdf.jsonl")
    meb.soru_yaz(sentetik_sorular(4), tmp_path / "v2" / "meb" / "turkishmmlu.jsonl")
    _kaydir(tmp_path / "v2" / "meb" / "turkishmmlu.jsonl", 10)  # meb_pdf.jsonl'den sonra indirildi: meb-pdf yeniden
    capsys.readouterr()
    cikti = _durum(capsys)
    assert "Sıradaki adım: python -m turkce_model meb-pdf\n" in cikti
    assert f"  (önce MEB kitapçıklarını tarayıcıyla indirip {Path('v2', 'meb', 'pdf')} klasörüne koy; README, 3. adım)" in cikti


# --------------------------------------------------------------------------------------------
# Örnekleme sıcaklığı ve çıktı borusu
# --------------------------------------------------------------------------------------------


def test_cok_kucuk_sicaklik_en_olasi_tokeni_secer(tam_calisma, tmp_path, monkeypatch, capsys):
    _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    ciktilar = []
    # 1e-40 float32'de logit / sıcaklık taşar: eskiden "probability tensor contains inf/nan" izleme dökümü.
    for sicaklik in ("0", "1e-40"):
        assert main(["uret", "kitap", "--sicaklik", sicaklik, "--uzunluk", "6", "--tohum", "1", "--cihaz", "cpu"]) == 0
        ciktilar.append(capsys.readouterr().out)
    assert ciktilar[0] == ciktilar[1]


def test_boru_kapaninca_izleme_dokumu_yazilmaz(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "ayarlar.toml").write_text("", encoding="utf-8")

    def kirik_boru(arg, ayarlar):
        raise BrokenPipeError(32, "Broken pipe")

    monkeypatch.setattr(cli, "komut_durum", kirik_boru)
    assert main(["durum"]) == cli.BORU_KAPANDI == 141
    assert capsys.readouterr().err == ""


@pytest.mark.skipif(os.name == "nt", reason="Windows'ta kapanan boru BrokenPipeError yerine EINVAL verebilir")
def test_cikti_head_ile_kesilince_surec_sessizce_biter(tam_calisma, tmp_path, monkeypatch):
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    # Binlerce token satırı: borunun tamponunu aşar, okuyan taraf kapandıktan sonra da yazılır ("| head -1" gibi).
    metin = " ".join(["Kitaplarımızdan biri masalardaydı."] * 3000).encode("utf-8")
    surec = subprocess.Popen(
        [sys.executable, "-m", "turkce_model", "tokenizer-dene"],
        cwd=kok,
        env=_surec_ortami(),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    surec.stdin.write(metin)
    surec.stdin.close()
    assert surec.stdout.readline()
    surec.stdout.close()
    hata = surec.stderr.read().decode("utf-8", "replace")
    surec.stderr.close()
    assert surec.wait(timeout=300) == 141
    assert "Traceback" not in hata and "BrokenPipeError" not in hata, hata


# --------------------------------------------------------------------------------------------
# Altıncı tur: modeli olan aşamada düz egit (D1), durum'un --devam önerisi ve kayıtlı ayarlar (D2), meb-pdf --klasor'u
# (D3), meb-pdf --ocr ve sor --resim ipuçlarının ayar dosyası (D4), ek metin klasörü (D5), meb-mmlu notunun .eski
# kuralı (D6)
# --------------------------------------------------------------------------------------------


@sigkill_gerekli
def test_d1_kurtarilan_bitmis_egitimde_duz_egit_modeli_silmez(tam_calisma, tmp_path, monkeypatch, capsys):
    # D1: C1'in kurtarması: --uzerine-yaz kenardakileri silerken kill -9 ile öldü (son.pt.eski silindi); durum'un
    # önerdiği --devam bitmiş eğitimi modeliyle geri getirdi: aşamada en_iyi.pt var, son.pt yok. Eskiden düz
    # "egit --asama tdk" bunu kabul eder (çıkış 0), bitmiş modeli ilk adımdan sonra silerdi.
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    tdk_klasoru, meb_klasoru = _deney(kok) / "tdk", _deney(kok) / "meb"
    _oldurulen_egitim(kok, "--asama", "tdk", "--uzerine-yaz", betik=_SILERKEN_OLDUREN)
    siradaki = "python -m turkce_model egit --asama tdk --devam"
    assert f"Sıradaki adım: {siradaki}\n" in _durum(capsys)
    assert main(shlex.split(siradaki)[3:]) == 0
    once = _ozetler(tdk_klasoru)
    assert "en_iyi.pt" in once and "son.pt" not in once
    capsys.readouterr()
    assert main(["egit", "--asama", "tdk", "--cihaz", "cpu"]) == 2
    hata = capsys.readouterr().err
    assert f"{tdk_klasoru} içinde zaten bir eğitim var: modeli (en_iyi.pt) duruyor, son.pt'si yok. Silip baştan" in hata
    assert "--devam" not in hata  # son.pt'siz eğitim sürdürülemez: önerilmez
    assert _ozetler(tdk_klasoru) == once
    # Yer açmak için son.pt'si silinmiş bitmiş MEB eğitimi de korunur.
    (meb_klasoru / "son.pt").unlink()
    once_meb = _ozetler(meb_klasoru)
    assert main(["egit", "--asama", "meb", "--cihaz", "cpu"]) == 2
    assert "zaten bir eğitim var: modeli (en_iyi.pt) duruyor" in capsys.readouterr().err
    assert _ozetler(meb_klasoru) == once_meb and _ozetler(tdk_klasoru) == once
    cikti = _durum(capsys)
    assert all(_isaret(cikti, ad) == "[x]" for ad in MODELLER) and "Bütün adımlar tamam" in cikti


def _yarida_kalan_tdk(kok: Path, deney: str | None = None) -> dict:
    """Deneyin (verilmezse ayarlardan türeyen) TDK aşamasını --uzerine-yaz ile yeniden başlatıp 3. adımın başında Ctrl+C
    ile keser: yarıda kalan gerçek bir eğitim (son.pt adım 2). Kaydettiği durum.json'u döndürür."""
    asil, sayac = TurkceGPT.forward, {"n": 0}

    def ileri(self, *a, **k):
        sonuc = asil(self, *a, **k)
        if self.training:
            sayac["n"] += 1
            if sayac["n"] == 9:  # adım başına 4 mikro yığın: 3. adımın ilki
                raise KeyboardInterrupt
        return sonuc

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(TurkceGPT, "forward", ileri)
        assert main(["egit", "--asama", "tdk", "--uzerine-yaz", *(["--deney", deney] if deney else []), "--cihaz", "cpu"]) == 130
    klasor = (kok / "ciktilar" / "deneyler" / deney if deney else _deney(kok)) / "tdk"
    return json.loads((klasor / "durum.json").read_text(encoding="utf-8"))


def test_d2_durumun_devam_onerisi_kayitli_egitimle_celisen_ayari_tasimaz(tam_calisma, tmp_path, monkeypatch, capsys):
    # D2: yarıda kalan eğitim + "durum --ayar <kilitli bir ayarın yeni değeri>". Eskiden durum "egit --devam --ayar <yeni>"
    # önerirdi; yapıştırılınca "--devam için bu ayarlar kaydedilen eğitimle aynı olmalı" ile 2 dönerdi.
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    durum = _yarida_kalan_tdk(kok)
    assert (durum["durum"], durum["adim"], durum["kilitli"]["egitim.tdk.ogrenme_orani"]) == ("durduruldu", 2, 0.0006)
    toplam = durum["toplam_adim"]
    capsys.readouterr()
    # degerlendirme_her kilitli değil (--devam'da değişebilir): sürdürme komutunda kalır.
    yeni = ("--ayar", "egitim.tdk.ogrenme_orani=0.003", "--ayar", "egitim.tdk.degerlendirme_her=3")
    ek = " --ayar egitim.tdk.ogrenme_orani=0.003 --ayar egitim.tdk.degerlendirme_her=3"
    # Kayıtlı ayarları taşımayan eski durum.json: bugünkü gibi çağrının seçenekleriyle --devam önerilir.
    tdk_klasoru = _deney(kok) / "tdk"
    ham = (tdk_klasoru / "durum.json").read_text(encoding="utf-8")
    _durum_yaz(tdk_klasoru, kilitli=...)
    assert f"adım 2/{toplam}, bitmedi → sürdür: egit --asama tdk --devam{ek}" in _satir(_durum(capsys, *yeni), "Aşama 1")
    (tdk_klasoru / "durum.json").write_text(ham, encoding="utf-8")
    cikti = _durum(capsys, *yeni)
    assert _satir(cikti, "Aşama 1 modeli").split("(TDK)")[1].strip() == (
        f"adım 2/{toplam}, bitmedi; şimdiki ayarlar kayıtlı eğitimden farklı (egitim.tdk.ogrenme_orani) → sürdür: "
        f"egit --asama tdk --devam --ayar egitim.tdk.degerlendirme_her=3; yeni ayarlarla baştan: "
        f"egit --asama tdk --uzerine-yaz{ek}"
    )
    assert _isaret(cikti, "Aşama 1 modeli") == "[~]"
    siradaki = "python -m turkce_model egit --asama tdk --devam --ayar egitim.tdk.degerlendirme_her=3"
    assert f"Sıradaki adım: {siradaki}\n" in cikti
    assert main(shlex.split(siradaki)[3:]) == 0  # yapıştırılan komut kayıtlı ayarlarla sürdürür
    assert f"Kaldığı yerden devam: adım 2/{toplam}" in capsys.readouterr().out
    assert json.loads((tdk_klasoru / "durum.json").read_text(encoding="utf-8"))["durum"] in ("bitti", "erken_durdu")


def test_d2_ayar_dosyasindaki_ve_mimarideki_fark_devamda_kayitli_degerle_geri_alinir(tam_calisma, tmp_path, monkeypatch, capsys):
    # D2: fark ayar dosyasından geliyorsa --ayar'ı çıkarmak yetmez: --devam kayıtlı değeri --ayar ile geri verir.
    # [gomme] / [model] de kilitlidir: adı açıkça verilen bir deneyde farklı olabilirler.
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    _yarida_kalan_tdk(kok)
    _yarida_kalan_tdk(kok, "acik")
    capsys.readouterr()
    ayar = kok / "ayarlar.toml"
    metin = ayar.read_text(encoding="utf-8")
    ayar.write_text(metin.replace("[egitim.tdk]\n", "[egitim.tdk]\nogrenme_orani = 0.003\n"), encoding="utf-8")
    ayristir = cli.ayristirici().parse_args
    komutlar = []
    for secenek, devam_eki, farkli in (
        ((), " --ayar egitim.tdk.ogrenme_orani=0.0006", "egitim.tdk.ogrenme_orani"),
        (("--ayar", "egitim.tdk.ogrenme_orani=0.001"), " --ayar egitim.tdk.ogrenme_orani=0.0006", "egitim.tdk.ogrenme_orani"),
        (
            ("--ayar", "egitim.tdk.ogrenme_orani=0.0006", "--ayar", "model.dropout=0.1", "--deney", "acik"),
            " --ayar egitim.tdk.ogrenme_orani=0.0006 --deney acik",
            "model.dropout",
        ),
    ):
        ek = _komut_eki(ayristir(["durum", *secenek]))
        cikti = _durum(capsys, *secenek)
        satir = _satir(cikti, "Aşama 1 modeli")
        assert f"şimdiki ayarlar kayıtlı eğitimden farklı ({farkli}) → sürdür: egit --asama tdk --devam{devam_eki}; " in satir
        assert satir.endswith(f"yeni ayarlarla baştan: egit --asama tdk --uzerine-yaz{ek}"), satir
        assert f"Sıradaki adım: python -m turkce_model egit --asama tdk --devam{devam_eki}\n" in cikti
        komutlar.append(f"egit --asama tdk --devam{devam_eki}")
    for komut in komutlar:  # yapıştırılan her komut 0 ile biter: sürdürür ya da (ikinci kez) "zaten bitmiş" der
        assert main(shlex.split(komut)) == 0, komut
    assert capsys.readouterr().out.count("Kaldığı yerden devam: adım 2/") == 2  # iki deney de kayıtlı ayarlarla sürdü


@sigkill_gerekli
def test_d2_yeni_ayarli_uzerine_yaz_oldurulunce_devam_kayitli_ayarlarla_yazilir(tam_calisma, tmp_path, monkeypatch, capsys):
    # D2 (kenardaki eğitim): yarıda kalan eğitim, sonra yeni ayarla --uzerine-yaz ilk adımında kill -9 ile öldü; eski
    # eğitim kenarda. "durum --ayar <yeni>" eskiden "--devam --ayar <yeni>" önerirdi (2 ile biterdi).
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    durum = _yarida_kalan_tdk(kok)
    yeni = ("--ayar", "egitim.tdk.ogrenme_orani=0.003")
    _oldurulen_egitim(kok, "--asama", "tdk", "--uzerine-yaz", *yeni)
    tdk_klasoru = _deney(kok) / "tdk"
    assert (tdk_klasoru / "son.pt.eski").exists() and not (tdk_klasoru / "son.pt").exists()
    capsys.readouterr()
    cikti = _durum(capsys, *yeni)
    assert _satir(cikti, "Aşama 1 modeli").split("(TDK)")[1].strip() == (
        f"yarıda kalan --uzerine-yaz; eski eğitim kenarda: adım 2/{durum['toplam_adim']}, bitmedi; şimdiki ayarlar "
        "kayıtlı eğitimden farklı (egitim.tdk.ogrenme_orani) → sürdür: egit --asama tdk --devam; yeni ayarlarla "
        "baştan: egit --asama tdk --uzerine-yaz --ayar egitim.tdk.ogrenme_orani=0.003"
    )
    siradaki = "python -m turkce_model egit --asama tdk --devam"
    assert f"Sıradaki adım: {siradaki}\n" in cikti
    assert main(shlex.split(siradaki)[3:]) == 0
    cikti = capsys.readouterr().out
    assert "kenara alınmış eski eğitim geri getirildi" in cikti and f"Kaldığı yerden devam: adım 2/{durum['toplam_adim']}" in cikti
    assert not list(tdk_klasoru.glob("*.eski"))


def test_d2_kenara_alma_yarida_kalinca_devam_kayitli_ayarlarla_yazilir(tam_calisma, tmp_path, monkeypatch, capsys):
    # D2: yeni ayarla --uzerine-yaz kenara alırken ilk dosyadan (durum.json) hemen sonra öldü: kontrol noktaları yerinde,
    # yarıda kalan eğitimin kaydı kenarda. durum kaydı (kayıtlı ayarlarıyla) kenardan okur.
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    durum = _yarida_kalan_tdk(kok)
    tdk_klasoru = _deney(kok) / "tdk"
    os.replace(tdk_klasoru / "durum.json", tdk_klasoru / "durum.json.eski")
    capsys.readouterr()
    cikti = _durum(capsys, "--ayar", "egitim.tdk.ogrenme_orani=0.003")
    assert (
        f"adım 2/{durum['toplam_adim']}, bitmedi; şimdiki ayarlar kayıtlı eğitimden farklı (egitim.tdk.ogrenme_orani) → "
        "sürdür: egit --asama tdk --devam; yeni ayarlarla baştan:"
    ) in _satir(cikti, "Aşama 1 modeli")
    siradaki = "python -m turkce_model egit --asama tdk --devam"
    assert f"Sıradaki adım: {siradaki}\n" in cikti
    assert main(shlex.split(siradaki)[3:]) == 0
    assert f"Kaldığı yerden devam: adım 2/{durum['toplam_adim']}" in capsys.readouterr().out
    assert not list(tdk_klasoru.glob("*.eski"))


@pymupdf_gerekli
def test_d3_meb_pdf_klasoru_kaydedilir_not_ve_durum_ayni_klasoru_okutur(sunucu, tmp_path, monkeypatch, capsys):
    # D3: "meb-pdf --ocr --klasor <klasör>" klasörü raporuna yazar. Eskiden meb-mmlu'nun notu ve durum "meb-pdf --ocr"
    # yazardı: yapıştırılınca varsayılan klasörü okur, oradaki başka bir kitapçıkla --klasor'dan OCR ile okunan
    # soruların yerine başkalarını (burada hiç soru) yazar, 0 ile biterdi.
    monkeypatch.chdir(tmp_path)
    modul = f'\n[moduller]\nadres = "{sunucu.adres}"\nzaman_asimi = 10\n\n[moduller.ocr]\nmodel = "deepseek-ocr"\ndpi = 72\n'
    calisma_kur(tmp_path, ayarlar=TEST_AYARLARI + modul)
    (tmp_path / "ayarlar.toml").rename(tmp_path / "mod.toml")
    assert main(["tdk-derlem", "--ayarlar", "mod.toml"]) == 0
    klasor = tmp_path / "eski kitaplar"
    _taranmis_pdf(klasor / "kitapcik.pdf", len(KITAPCIK))
    okunan: dict[str, str] = {}  # sayfa görüntüsü → metin: ilk üç farklı sayfa kitapçığınkiler, sonrakiler boş

    def cevapla(govde: dict) -> str:
        sayfa = json.dumps(govde["messages"], sort_keys=True)
        if sayfa not in okunan:
            okunan[sayfa] = KITAPCIK[len(okunan)] if len(okunan) < len(KITAPCIK) else ""
        return okunan[sayfa]

    sunucu.cevapla = cevapla
    hedef = tmp_path / "veri" / "meb" / "meb_pdf.jsonl"
    rapor = hedef.with_suffix(".rapor.json")
    assert main(["meb-pdf", "--ocr", "--klasor", "eski kitaplar", "--ayarlar", "mod.toml"]) == 0
    assert len(meb.soru_oku(hedef)) == 3 and json.loads(rapor.read_text(encoding="utf-8"))["klasor"] == "eski kitaplar"
    _kaydir(_taranmis_pdf(tmp_path / "veri" / "meb" / "pdf" / "baska.pdf", 1), 10)  # varsayılan klasörde başka kitapçık
    ek, klasor_eki = " --ayarlar mod.toml", f" --klasor {cli._tirnak('eski kitaplar')}"
    monkeypatch.setattr(meb, "mmlu_indir", lambda yol: [])  # ağ yok: indirme hiç denenmez
    capsys.readouterr()
    assert main(["meb-mmlu", "--ayarlar", "mod.toml"]) == 0
    satirlar = _not_satirlari(capsys.readouterr().out)[1:]
    assert satirlar == [f"  python -m turkce_model meb-pdf --ocr{klasor_eki}{ek}", f"  python -m turkce_model veri-hazirla{ek}"]
    assert main(shlex.split(satirlar[0])[3:]) == 0  # yapıştırılan komut aynı klasörü okur
    sorular = meb.soru_oku(hedef)
    assert len(sorular) == 3 and all(s.ek["dosya"] == "kitapcik.pdf" and s.ek["okuma"] == "ocr" for s in sorular)
    # durum: eskime kayıtlı klasöre bakar (varsayılan klasördeki yeni kitapçık eskitmez), yeniden okuma onu okur.
    assert _isaret(_durum(capsys, "--ayarlar", "mod.toml"), "MEB soruları") == "[x]"
    _kaydir(_taranmis_pdf(klasor / "yeni.pdf", 1), 10)
    cikti = _durum(capsys, "--ayarlar", "mod.toml")
    assert f"girdileri sonradan değişti → yeniden: meb-pdf --ocr{klasor_eki}{ek}" in _satir(cikti, "MEB soruları")
    assert f"Sıradaki adım: python -m turkce_model meb-pdf --ocr{klasor_eki}{ek}\n" in cikti
    # --klasor'u yazmayan eski rapor: bugünkü gibi varsayılan klasör.
    rapor.write_text(json.dumps({"ocr": "gerekirse"}), encoding="utf-8")
    cikti = _durum(capsys, "--ayarlar", "mod.toml")
    assert f"Sıradaki adım: python -m turkce_model meb-pdf --ocr{ek}\n" in cikti


@pymupdf_gerekli
def test_d4_meb_pdf_ocr_ve_sor_resim_ipuclari_ayar_dosyasini_ve_secenekleri_anar(sunucu, tmp_path, monkeypatch, capsys):
    # D4: meb-pdf --ocr ve sor --resim modül ipuçlarını bu çağrının ayar dosyası ve seçenekleriyle yazar. Eskiden
    # --ayarlar 'ek ayar.toml' ile de "ayarlar.toml'da …" ve seçeneksiz "modul-liste" yazarlardı.
    monkeypatch.chdir(tmp_path)
    _taranmis_pdf(tmp_path / "veri" / "meb" / "pdf" / "kitapcik.pdf", 1)
    (tmp_path / "soru.png").write_bytes(b"\x89PNG-sahte-foto")
    monkeypatch.setattr(cli, "_model_yukle", lambda *a: pytest.fail("model yüklenmemeliydi"))
    ayar = tmp_path / "ek ayar.toml"
    secenek = ["--ayarlar", "ek ayar.toml", "--ayar", "egitim.meb.erken_durdurma=3", "--deney", "dd"]
    ek = f" --ayarlar {cli._tirnak('ek ayar.toml')} --ayar egitim.meb.erken_durdurma=3 --deney dd"
    modul = '\n[moduller.ocr]\nmodel = "deepseek-ocr"\ndpi = 72\n'
    for dosya, beklenen in (
        ("", "ek ayar.toml'da [moduller.ocr] model = \"deepseek-ocr\" yaz"),  # modül kapalı
        (f'[moduller]\nadres = "{_kapali_adres()}"\n{modul}', "ek ayar.toml'da [moduller] adres değerini düzelt"),
        (f'[moduller]\nadres = "{sunucu.adres}"\n{modul}', f"Sunucudaki modelleri görmek için: python -m turkce_model modul-liste{ek}"),
    ):
        ayar.write_text(dosya, encoding="utf-8")
        sunucu.hata = (404, 'model "deepseek-ocr" not found, try pulling it first')  # sunucuda model yok
        for argv in (["meb-pdf", "--ocr"], ["sor", "--resim", "soru.png"]):
            assert main([*argv, *secenek]) == 2, argv
            hata = " ".join(capsys.readouterr().err.split())
            assert beklenen in hata, (argv, hata)
    assert not (tmp_path / "veri" / "meb" / "meb_pdf.jsonl").exists()


def test_d5_ek_metin_iletileri_gercek_klasoru_gosterir(tmp_path, monkeypatch, capsys):
    # D5: [yollar] veri = "v2": veri-hazirla'nın özeti, egit'in notu ve durum'un nedeni "veri/ek_metin" değil gerçek
    # klasörü söyler (oraya konan metin okunur).
    monkeypatch.chdir(tmp_path)
    calisma_kur(tmp_path, ayarlar=TEST_AYARLARI + '\n[yollar]\nveri = "v2"\n')
    (tmp_path / "veri").rename(tmp_path / "v2")
    ek_metin = tmp_path / "v2" / "ek_metin"
    ek_metin.mkdir()
    (ek_metin / "ek.txt").write_text("\n\n".join(f"Ek paragraf {i}: kitap güzel." for i in range(5)), encoding="utf-8")
    for komut in ("tdk-derlem", "tokenizer-egit"):
        assert main([komut]) == 0
    capsys.readouterr()
    klasor = str(Path("v2", "ek_metin"))
    assert main(["veri-hazirla"]) == 0
    assert f"\n  {klasor}: 5 paragraf (" in capsys.readouterr().out
    assert main(["egit", "--asama", "tdk", "--ayar", "egitim.tdk.en_fazla_adim=1", "--cihaz", "cpu"]) == 0
    assert f"daha fazla metin: {klasor}.\n" in capsys.readouterr().out
    shutil.rmtree(ek_metin)
    assert f"{klasor} kaldırılmış → yeniden: veri-hazirla" in _satir(_durum(capsys), "Hazır veri")


def test_d6_meb_mmlu_notu_kenardaki_meb_modeli_icin_de_egit_satirini_yazar(tam_calisma, tmp_path, monkeypatch, capsys):
    # D6 (C3'ün .eski kuralı): bu deneyin MEB modeli yarıda kalan bir --uzerine-yaz yüzünden kenardaysa (*.eski) da
    # MEB modelidir; onu kullanan ilk komut yerine koyar. Not "egit --asama meb --uzerine-yaz" satırını yazar.
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    monkeypatch.setattr(meb, "mmlu_indir", lambda yol: [])  # ağ yok: indirme hiç denenmez
    meb_klasoru = _deney(kok) / "meb"
    for ad in ("durum.json", "gunluk.jsonl", "en_iyi.pt", "son.pt"):
        os.replace(meb_klasoru / ad, meb_klasoru / f"{ad}.eski")
    ek = " --ayar egitim.meb.erken_durdurma=3"
    egit_satiri = f"  python -m turkce_model egit --asama meb --uzerine-yaz{ek}"
    assert main(["meb-mmlu", *shlex.split(ek)]) == 0
    assert _not_satirlari(capsys.readouterr().out)[-1] == egit_satiri
    (meb_klasoru / "son.pt.eski").unlink()  # kenardakiler silinirken öldürülmüş: model (en_iyi.pt.eski) kalmış
    assert main(["meb-mmlu", *shlex.split(ek)]) == 0
    assert _not_satirlari(capsys.readouterr().out)[-1] == egit_satiri
    (meb_klasoru / "en_iyi.pt.eski").unlink()  # model yok: eğitilecek bir şey yok, satır yazılmaz
    assert main(["meb-mmlu", *shlex.split(ek)]) == 0
    assert not any("egit --asama meb" in s for s in _not_satirlari(capsys.readouterr().out))


# --------------------------------------------------------------------------------------------
# Yedinci tur: başka deneylerin --devam'ı ve ayar dosyası (C1), egit --asama meb'in ipucu (C2), modeli silinmiş bitmiş
# eğitimde elle --devam (C3)
# --------------------------------------------------------------------------------------------


def _baska_deneyler(cikti: str) -> list[str]:
    """``durum`` çıktısındaki "Yarıda kalan başka deneyler" satırları (yoksa boş)."""
    if "Yarıda kalan başka deneyler:\n" not in cikti:
        return []
    return cikti.split("Yarıda kalan başka deneyler:\n")[1].split("\n\n")[0].splitlines()


def _yapistir(satir: str, capsys) -> str:
    """Listedeki satırın komutunu aynen çalıştırır (0 ile bitmeli); çıktısını döndürür."""
    komut = satir.split(" → ", 1)[1]
    assert main(shlex.split(komut)) == 0, komut
    return capsys.readouterr().out


def test_c1_gomme_karari_dosyada_degisince_listedeki_devam_kayitli_degerle_calisir(tam_calisma, tmp_path, monkeypatch, capsys):
    # C1: GOMME_KARARLARI'nın iş akışı: ayarlar.toml'da bir kararı değiştir, yeniden eğit. Yeni ayarlar yeni bir deney
    # türetir; yarıda kalan eski deney "Yarıda kalan başka deneyler"de listelenir. Eskiden satırın "--devam --deney <ad>"
    # komutu yapıştırılınca "gomme.dropout: kayıtlı 0.0, şimdi 0.1" ile 2 dönerdi; adı açıkça verilen deneyde de.
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    eski = _deney(kok).name
    durumlar = {eski: _yarida_kalan_tdk(kok), "acik": _yarida_kalan_tdk(kok, "acik")}
    capsys.readouterr()
    ayar = kok / "ayarlar.toml"
    metin = ayar.read_text(encoding="utf-8")
    assert metin.count("dropout = 0.0") == 2  # önce [gomme], sonra [model]
    ayar.write_text(metin.replace("dropout = 0.0", "dropout = 0.1", 1), encoding="utf-8")  # yalnız gomme.dropout
    assert _deney(kok).name != eski
    sirali = sorted(durumlar.items())
    satirlar = _baska_deneyler(_durum(capsys))
    assert satirlar == [
        f"  {ad} / tdk: adım 2/{d['toplam_adim']}; ayar dosyası kayıtlı eğitimden farklı (gomme.dropout) → egit --asama "
        f"tdk --devam --deney {ad} --ayar gomme.dropout=0.0"
        for ad, d in sirali
    ]
    for satir, (ad, d) in zip(satirlar, sirali):
        assert f"Kaldığı yerden devam: adım 2/{d['toplam_adim']}" in _yapistir(satir, capsys)
        sonra = json.loads((kok / "ciktilar" / "deneyler" / ad / "tdk" / "durum.json").read_text(encoding="utf-8"))
        assert (sonra["kosu"], sonra["kilitli"]) == (d["kosu"], d["kilitli"])  # aynı eğitim, kayıtlı ayarlarla sürdü
        assert sonra["durum"] in ("bitti", "erken_durdu")
    assert _baska_deneyler(_durum(capsys)) == []


@sigkill_gerekli
def test_c1_egitim_ayari_dosyada_degisince_adi_verilen_ve_kenardaki_deneyin_devami_calisir(
    tam_calisma, tmp_path, monkeypatch, capsys
):
    # C1: adı açıkça verilen deneyler ve ayar dosyasında değişen [egitim.tdk] ogrenme_orani (--devam'da kilitli). "kenarda":
    # yarıda kalan eğitimi yeni dosyayla --uzerine-yaz ilk adımında kill -9 ile öldü; eski eğitim kenarda. "kenara-alma":
    # --uzerine-yaz kenara alırken ilk dosyadan (durum.json) hemen sonra öldü; kayıt kenarda, kontrol noktaları yerinde.
    # "eski-kayit": kayıtlı ayarları taşımayan önceki sürüm kaydı (karşılaştırılamaz; satır bugünkü gibi).
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    adlar = ("acik", "eski-kayit", "kenara-alma", "kenarda")
    durumlar = {ad: _yarida_kalan_tdk(kok, ad) for ad in adlar}
    toplam = durumlar["acik"]["toplam_adim"]
    deneyler = kok / "ciktilar" / "deneyler"
    _durum_yaz(deneyler / "eski-kayit" / "tdk", kilitli=...)
    capsys.readouterr()
    (kok / "ayarlar.toml").rename(kok / "deney 2.toml")
    ayar = kok / "deney 2.toml"
    secenek = ["--ayarlar", "deney 2.toml"]
    ayarlar_eki = f" --ayarlar {cli._tirnak('deney 2.toml')}"
    # Bu çağrının --ayar'ı listeye karışmaz: satırın komutu onu taşımaz, dosya kayıtlı eğitimlerle aynı.
    satirlar = _baska_deneyler(_durum(capsys, *secenek, "--ayar", "egitim.tdk.ogrenme_orani=0.003"))
    assert satirlar == [
        f"  {ad} / tdk: adım 2/{toplam} → egit --asama tdk --devam --deney {ad}{ayarlar_eki}" for ad in adlar
    ]
    ayar.write_text(ayar.read_text(encoding="utf-8").replace("[egitim.tdk]\n", "[egitim.tdk]\nogrenme_orani = 0.003\n"), encoding="utf-8")
    _oldurulen_egitim(kok, "--asama", "tdk", "--uzerine-yaz", "--deney", "kenarda", *secenek)
    assert (deneyler / "kenarda" / "tdk" / "son.pt.eski").exists() and not (deneyler / "kenarda" / "tdk" / "son.pt").exists()
    os.replace(deneyler / "kenara-alma" / "tdk" / "durum.json", deneyler / "kenara-alma" / "tdk" / "durum.json.eski")
    fark = "; ayar dosyası kayıtlı eğitimden farklı (egitim.tdk.ogrenme_orani) → egit --asama tdk --devam --deney"
    geri_al = " --ayar egitim.tdk.ogrenme_orani=0.0006"
    satirlar = _baska_deneyler(_durum(capsys, *secenek))
    assert satirlar == [
        f"  acik / tdk: adım 2/{toplam}{fark} acik{ayarlar_eki}{geri_al}",
        f"  eski-kayit / tdk: adım 2/{toplam} → egit --asama tdk --devam --deney eski-kayit{ayarlar_eki}",
        f"  kenara-alma / tdk: adım 2/{toplam}{fark} kenara-alma{ayarlar_eki}{geri_al}",
        f"  kenarda / tdk: yarıda kalan --uzerine-yaz; eski eğitim kenarda (adım 2/{toplam}){fark} kenarda{ayarlar_eki}{geri_al}",
    ]
    assert f"Kaldığı yerden devam: adım 2/{toplam}" in _yapistir(satirlar[0], capsys)
    for satir, ad in zip(satirlar[2:], adlar[2:]):  # kenardaki kayıt önce geri gelir, eğitim kayıtlı ayarlarla sürer
        cikti = _yapistir(satir, capsys)
        assert "kenara alınmış eski eğitim geri getirildi" in cikti and f"Kaldığı yerden devam: adım 2/{toplam}" in cikti
        sonra = json.loads((deneyler / ad / "tdk" / "durum.json").read_text(encoding="utf-8"))
        assert sonra["kosu"] == durumlar[ad]["kosu"] and not list((deneyler / ad).rglob("*.eski"))
    # Bitmiş eğitim kenardaysa --devam ayarları karşılaştırmadan "zaten bitmiş" der: satır --ayar eklemez.
    _oldurulen_egitim(kok, "--asama", "tdk", "--uzerine-yaz", "--deney", "acik", *secenek)
    once = _ozetler(deneyler / "acik" / "tdk")
    satirlar = _baska_deneyler(_durum(capsys, *secenek))
    assert satirlar[0] == (
        f"  acik / tdk: yarıda kalan --uzerine-yaz; eski eğitim kenarda (adım {toplam}/{toplam}) → egit --asama tdk "
        f"--devam --deney acik{ayarlar_eki}"
    )
    assert f"Bu eğitim zaten bitmiş (adım {toplam}/{toplam})" in _yapistir(satirlar[0], capsys)
    once = {ad.removesuffix(".eski"): ozet for ad, ozet in once.items() if ad.endswith(".eski")}
    assert _ozetler(deneyler / "acik" / "tdk") == once  # eski eğitim bayt bayt geri geldi


@pymupdf_gerekli
@pytest.mark.parametrize("klasor", [None, "eski kitaplar"], ids=["varsayilan", "klasor"])
def test_c2_ocr_ile_okunan_sorularda_egit_meb_ipucu_yapistirilinca_calisir(sunucu, tmp_path, monkeypatch, capsys, klasor):
    # C2: meb-pdf --ocr (--klasor'la ya da onsuz) soruları okudu, veri-hazirla çalışmadı. Eskiden egit --asama meb'in ipucu
    # kitapçıkları klasöre koyup OCR'sız meb-pdf çalıştırmayı söylerdi; yapıştırılınca OCR ile okunmuş soruları silmemek
    # için reddedilirdi (2). Eksik olan yalnız veri-hazirla. Yeniden okuma gerekiyorsa da komut aynı kip ve klasörle yazılır.
    monkeypatch.chdir(tmp_path)
    modul = f'\n[moduller]\nadres = "{sunucu.adres}"\nzaman_asimi = 10\n\n[moduller.ocr]\nmodel = "deepseek-ocr"\ndpi = 72\n'
    calisma_kur(tmp_path, ayarlar=TEST_AYARLARI + modul)
    (tmp_path / "ayarlar.toml").rename(tmp_path / "mod dosyası.toml")
    ek = f" --ayarlar {cli._tirnak('mod dosyası.toml')}"
    for komut in ("tdk-derlem", "tokenizer-egit", "veri-hazirla"):
        assert main([komut, *shlex.split(ek)]) == 0
    _taranmis_pdf((tmp_path / klasor if klasor else tmp_path / "veri" / "meb" / "pdf") / "kitapcik.pdf", len(KITAPCIK))
    okunan: dict[str, str] = {}  # sayfa görüntüsü → metin: ilk üç farklı sayfa kitapçığınkiler

    def cevapla(govde: dict) -> str:
        sayfa = json.dumps(govde["messages"], sort_keys=True)
        if sayfa not in okunan:
            okunan[sayfa] = KITAPCIK[len(okunan)] if len(okunan) < len(KITAPCIK) else ""
        return okunan[sayfa]

    sunucu.cevapla = cevapla
    klasor_secenek = ["--klasor", klasor] if klasor else []
    assert main(["meb-pdf", "--ocr", *klasor_secenek, *shlex.split(ek)]) == 0
    hedef = tmp_path / "veri" / "meb" / "meb_pdf.jsonl"
    sorular = meb.soru_oku(hedef)
    assert any(s.bolum == "egitim" for s in sorular) and any(s.bolum != "egitim" for s in sorular)
    egit_meb = ["egit", "--asama", "meb", "--sifirdan", *shlex.split(ek), "--cihaz", "cpu"]
    capsys.readouterr()
    assert main(egit_meb) == 2
    hata = " ".join(capsys.readouterr().err.split())
    assert hata == (
        f"MEB soruları okunmuş ({Path('veri', 'meb', 'meb_pdf.jsonl')}) ama eğitim verisi hazırlanmamış. Önce: "
        f"python -m turkce_model veri-hazirla{ek}"
    )
    assert main(shlex.split(hata.split("Önce: ")[1])[3:]) == 0  # yapıştırılan ipucu
    assert main(egit_meb) == 0  # MEB eğitimi artık başlar
    # Okunan soruların hiçbiri eğitim bölümünde değilse yeniden okuma gerekir: meb-pdf aynı kip ve klasörle yazılır.
    meb.soru_yaz([s for s in sorular if s.bolum != "egitim"], hedef)
    assert main(["veri-hazirla", *shlex.split(ek)]) == 0
    capsys.readouterr()
    egit_meb.append("--uzerine-yaz")
    assert main(egit_meb) == 2
    hata = " ".join(capsys.readouterr().err.split())
    okuma = "meb-pdf --ocr" + (f" --klasor {cli._tirnak(klasor)}" if klasor else "")
    yer = klasor or str(Path("veri", "meb", "pdf"))
    assert f"Önce MEB kitapçıklarını {yer} klasörüne koyup {okuma}{ek}, sonra veri-hazirla{ek} çalıştır" in hata
    for komut in hata.split("klasörüne koyup ")[1].split(" çalıştır")[0].split(", sonra "):
        assert main(shlex.split(komut)) == 0, komut  # OCR'lı sorular aynı kiple yeniden okunur (reddedilmez)
    assert sorted(s.soru for s in meb.soru_oku(hedef)) == sorted(s.soru for s in sorular)
    assert main(egit_meb) == 0


# Gerçek bir eğitim süreci; yeni eğitim ilk adımını bitirip kenara alınan eski eğitimi silerken, N. silmeden hemen sonra
# kendini SIGKILL ile öldürür (silme sırası: son.pt.eski, en_iyi.pt.eski, gunluk.jsonl.eski, durum.json.eski).
_N_SILMEDE_OLDUREN = (
    "import os, signal, sys\n"
    "from pathlib import Path\n"
    "from turkce_model import cli\n"
    "asil, sayac = Path.unlink, [0]\n"
    "def sil(self, *a, **k):\n"
    "    asil(self, *a, **k)\n"
    "    if self.name.endswith('.eski'):\n"
    "        sayac[0] += 1\n"
    "        if sayac[0] == N:\n"
    "            os.kill(os.getpid(), signal.SIGKILL)\n"
    "Path.unlink = sil\n"
    "sys.exit(cli.main(sys.argv[1:]))\n"
)


@sigkill_gerekli
@pytest.mark.parametrize("n", [2, 3], ids=["sil2", "sil3"])
def test_c3_model_silinmisken_elle_devam_zaten_bitmis_demez(tam_calisma, tmp_path, monkeypatch, capsys, n):
    # C3: --uzerine-yaz kenardakileri silerken kill -9 ile öldü; eski model de silinmiş, kenarda yalnız kaydı kalmış.
    # Elle yazılan "egit --devam" kaydı geri getirir; eskiden sonra "Bu eğitim zaten bitmiş" der, 0 ile biter ve modeli
    # olmayan bir degerlendir yazardı (yapıştırılınca "Değerlendirilecek model yok", 2).
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    tdk_klasoru = _deney(kok) / "tdk"
    _oldurulen_egitim(kok, "--asama", "tdk", "--uzerine-yaz", betik=_N_SILMEDE_OLDUREN.replace("N:", f"{n}:"))
    dosyalar = {y.name for y in tdk_klasoru.iterdir()}
    assert "durum.json.eski" in dosyalar and not {"son.pt", "en_iyi.pt", "son.pt.eski", "en_iyi.pt.eski"} & dosyalar
    capsys.readouterr()
    assert main(["egit", "--asama", "tdk", "--devam", "--cihaz", "cpu"]) == 2
    cikis = capsys.readouterr()
    assert "kenara alınmış eski eğitimden yalnız kayıt dosyaları geri getirildi" in cikis.out
    assert f"--devam verildi ama sürdürülecek eğitim yok ({tdk_klasoru / 'son.pt'})" in cikis.err
    assert "zaten bitmiş" not in cikis.out + cikis.err and "degerlendir" not in cikis.out + cikis.err
    # durum düz egit önerir; yapıştırılınca yeni eğitim başlar, sonra değerlendirme çalışır.
    siradaki = "python -m turkce_model egit --asama tdk"
    assert f"Sıradaki adım: {siradaki}\n" in _durum(capsys)
    assert main([*shlex.split(siradaki)[3:], "--cihaz", "cpu"]) == 0
    assert main(["degerlendir", "--asama", "tdk", "--cihaz", "cpu"]) == 0


def test_c5_adi_verilen_deneyde_mimari_degisince_meb_egitimi_sonraki_adimi_yazar(tam_calisma, tmp_path, monkeypatch, capsys):
    # C5: adı açıkça verilen deneyin TDK aşaması bitmiş; ayar dosyasında mimari (model.katman) değişti. durum
    # "egit --asama meb --deney <ad>" önerir; o "TDK modelinin mimarisi şimdiki ayarlardan farklı" ile 2 döner. Eskiden
    # ileti sonraki adımı yazmazdı; artık TDK'yi yeniden eğiten komutu ve öbür seçenekleri yazar.
    kok = _kopya(tam_calisma, tmp_path / "ws", monkeypatch)
    assert main(["egit", "--asama", "tdk", "--deney", "diger", "--cihaz", "cpu"]) == 0
    ayar = kok / "ayarlar.toml"
    ayar.write_text(ayar.read_text(encoding="utf-8").replace("katman = 1\n", "katman = 2\n"), encoding="utf-8")
    siradaki = "python -m turkce_model egit --asama meb --deney diger"
    assert f"Sıradaki adım: {siradaki}\n" in _durum(capsys, "--deney", "diger")
    assert main([*shlex.split(siradaki)[3:], "--cihaz", "cpu"]) == 2
    hata = capsys.readouterr().err
    yeniden = "python -m turkce_model egit --asama tdk --uzerine-yaz --deney diger --cihaz cpu"
    assert "TDK modelinin mimarisi şimdiki ayarlardan farklı:\n  • model.katman: kayıtlı 1, şimdi 2\n" in hata
    assert f"TDK modelini şimdiki ayarlarla yeniden eğitmek için (eski TDK modeli silinir): {yeniden}\n" in hata
    assert "ayarı kayıtlı değerine geri al; yeni mimariyi ayrı bir deneyde denemek için --deney <ad> ver." in hata
    assert main(shlex.split(yeniden)[3:]) == 0  # yazılan komut aynen: TDK yeni mimariyle eğitilir
    assert main([*shlex.split(siradaki)[3:], "--cihaz", "cpu"]) == 0  # MEB aşaması artık başlar


@pymupdf_gerekli
def test_c4_goreli_pdf_klasoru_baska_klasorden_calisan_komutlarda_da_bulunur(sunucu, tmp_path, monkeypatch, capsys):
    # C4: "meb-pdf --klasor kitaplar" ayar dosyasının klasöründe çalıştı. Klasör yazıldığı gibi saklanır, sonraki komutlar
    # onu kendi çalışma klasörlerine göre çözerdi: üst klasörden "--ayarlar k/mod.toml" ile çalışan durum oraya konan yeni
    # kitapçığı görmez, meb-mmlu'nun notundaki "meb-pdf --ocr --klasor kitaplar" yapıştırılınca "kitaplar içinde PDF yok"
    # ile 2 dönerdi. Artık klasör ayar dosyasının klasörüne göre saklanır; komutlar onu çalıştıkları klasöre göre yazar.
    kok = tmp_path / "k"
    kok.mkdir()
    modul = f'\n[moduller]\nadres = "{sunucu.adres}"\nzaman_asimi = 10\n\n[moduller.ocr]\nmodel = "deepseek-ocr"\ndpi = 72\n'
    calisma_kur(kok, ayarlar=TEST_AYARLARI + modul)
    (kok / "ayarlar.toml").rename(kok / "mod.toml")
    _taranmis_pdf(kok / "kitaplar" / "kitapcik.pdf", len(KITAPCIK))
    okunan: dict[str, str] = {}  # sayfa görüntüsü → metin: ilk üç farklı sayfa kitapçığınkiler, sonrakiler boş

    def cevapla(govde: dict) -> str:
        sayfa = json.dumps(govde["messages"], sort_keys=True)
        if sayfa not in okunan:
            okunan[sayfa] = KITAPCIK[len(okunan)] if len(okunan) < len(KITAPCIK) else ""
        return okunan[sayfa]

    sunucu.cevapla = cevapla
    monkeypatch.chdir(kok)
    assert main(["tdk-derlem", "--ayarlar", "mod.toml"]) == 0
    assert main(["meb-pdf", "--ocr", "--klasor", "kitaplar", "--ayarlar", "mod.toml"]) == 0
    hedef = kok / "veri" / "meb" / "meb_pdf.jsonl"
    rapor = hedef.with_suffix(".rapor.json")
    assert json.loads(rapor.read_text(encoding="utf-8"))["klasor"] == "kitaplar"  # ayar dosyasının klasörüne göre
    monkeypatch.chdir(tmp_path)  # sonraki komutlar üst klasörden
    ayar = str(Path("k", "mod.toml"))
    ek = f" --ayarlar {cli._tirnak(ayar)}"
    okuma = f"meb-pdf --ocr --klasor {cli._tirnak(str(Path('k', 'kitaplar')))}{ek}"
    assert _isaret(_durum(capsys, "--ayarlar", ayar), "MEB soruları") == "[x]"
    _kaydir(_taranmis_pdf(kok / "kitaplar" / "yeni.pdf", 1), 10)  # kayıtlı klasöre yeni kitapçık
    cikti = _durum(capsys, "--ayarlar", ayar)
    assert f"girdileri sonradan değişti → yeniden: {okuma}" in _satir(cikti, "MEB soruları")
    assert f"Sıradaki adım: python -m turkce_model {okuma}\n" in cikti
    assert main(shlex.split(okuma)) == 0  # üst klasörden yapıştırılan komut aynı kitapçıkları okur
    assert len(meb.soru_oku(hedef)) == 3 and json.loads(rapor.read_text(encoding="utf-8"))["klasor"] == "kitaplar"
    monkeypatch.setattr(meb, "mmlu_indir", lambda yol: [])  # ağ yok: indirme hiç denenmez
    capsys.readouterr()
    assert main(["meb-mmlu", "--ayarlar", ayar]) == 0
    satir = _not_satirlari(capsys.readouterr().out)[1]
    assert satir == f"  python -m turkce_model {okuma}"
    assert main(shlex.split(satir)[3:]) == 0
    # Ayar dosyasının klasörü dışındaki klasör tam yoluyla saklanır ve yazılır.
    dis = tmp_path / "dis kitaplar"
    shutil.copytree(kok / "kitaplar", dis)
    assert main(["meb-pdf", "--ocr", "--klasor", "dis kitaplar", "--ayarlar", ayar]) == 0
    assert json.loads(rapor.read_text(encoding="utf-8"))["klasor"] == str(dis.resolve())
    monkeypatch.chdir(kok)
    _kaydir(_taranmis_pdf(dis / "ucuncu.pdf", 1), 10)
    cikti = _durum(capsys, "--ayarlar", "mod.toml")
    assert f"Sıradaki adım: python -m turkce_model meb-pdf --ocr --klasor {cli._tirnak(str(dis.resolve()))} --ayarlar mod.toml\n" in cikti
    # Eski rapor: göreli klasör yazıldığı gibi saklanmıştı; ayar dosyasının klasörüne göre okunur.
    rapor.write_text(json.dumps({"ocr": "gerekirse", "klasor": "kitaplar"}), encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    _kaydir(_taranmis_pdf(kok / "kitaplar" / "dorduncu.pdf", 1), 20)
    assert f"Sıradaki adım: python -m turkce_model {okuma}\n" in _durum(capsys, "--ayarlar", ayar)
