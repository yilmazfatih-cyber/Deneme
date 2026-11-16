"""Komut satırı: ayar dosyası hataları, ``durum``, Windows kod sayfası, doğrulama verisinin ayrı tutulması,
yazılan komutların deneyi seçen seçenekleri, argüman denetimi, ``hesapla``, DeepSeek modüllerinin bağlantısı.

Tüm veri sentetiktir; modül testleri bu süreçte açılan sahte bir yerel sunucuyla konuşur.
"""

from __future__ import annotations

import argparse
import http.server
import io
import json
import locale
import os
import shutil
import socket
import sys
import threading
from pathlib import Path
from types import SimpleNamespace

import pytest
from conftest import KELIME_LISTESI, TEST_AYARLARI, calisma_kur, sentetik_sorular

from turkce_model import cli, meb, tdk, veri
from turkce_model.ayarlar import ayarlari_yukle
from turkce_model.cli import _komut_eki, _tokenizer_metinleri, main
from turkce_model.egitim import egitim_kilidi
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
    ],
)
def test_aralik_disi_sayi_arguman_hatasi_verir(tmp_path, monkeypatch, capsys, argv):
    monkeypatch.chdir(tmp_path)
    with pytest.raises(SystemExit) as cikis:
        main(argv)
    assert cikis.value.code == 2
    assert "ya da daha büyük olmalı" in capsys.readouterr().err


def test_sinirdaki_sayilar_kabul_edilir():
    ayristir = cli.ayristirici().parse_args
    assert ayristir(["tanimla", "kitap", "--ust-k", "0"]).ust_k == 0  # 0 = sınırsız
    assert ayristir(["tdk-indir", "--bekleme", "0", "--ornek", "1"]).bekleme == 0.0
    assert ayristir(["sor", "--adet", "1"]).adet == 1


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
        self._yaz(200, {"choices": [{"message": {"role": "assistant", "content": self.server.cevapla(govde)}}]})


@pytest.fixture
def sunucu():
    """127.0.0.1'de sahte OpenAI uyumlu sunucu: ``.adres``, ``.istekler``, ``.cevapla`` (istek → metin)."""
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Istekci)
    s.istekler, s.cevapla = [], lambda govde: ""
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
    assert "ocr: kapalı" in cikti and "metin: kapalı" in cikti and "Sunucu: ulaşılamadı" in cikti
    for argv, parca in (
        (["modul-dene"], "Açık modül yok"),
        (["ocr", "sayfa.png"], "OCR modülü kapalı"),
        (["modul-kiyas"], "Kıyas (metin) modülü kapalı"),
    ):
        assert main(argv) == 2, argv
        hata = capsys.readouterr().err
        assert parca in hata and "Açmak için" in hata


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
