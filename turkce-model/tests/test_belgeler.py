"""Belgeler (README.md, GOMME_KARARLARI.md, ayarlar.toml yorumları) kodla tutarlı mı?

Belgede söz edilen komutlar ayrıştırılabilmeli, listeler kodun listeleriyle aynı olmalı, iletilerin andığı bölümler
belgede bulunmalı. Belgenin anlattığı davranışlar (kenardaki eski eğitimin geri gelmesi, OCR'sız okumanın reddi,
modül iletileri) kodda da öyle olmalı. Metin satır sonlarından bağımsız karşılaştırılır. Ağa çıkılmaz: indirme ve
sunucu istekleri sahtedir; bütün veriler sentetiktir.
"""

from __future__ import annotations

import argparse
import contextlib
import inspect
import io
import json
import os
import re
import shlex
import shutil
import struct
import sys
from dataclasses import fields, replace
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from conftest import TEST_AYARLARI, calisma_kur

from turkce_model import cli, egitim, meb
from turkce_model.ayarlar import (
    EN_BUYUK_EGITIM_TOHUMU,
    Ayarlar,
    AyarHatasi,
    EgitimAyarlari,
    ayarlari_yukle,
    egitimi_dogrula,
)
from turkce_model.degerlendirme import ilerleme_ekle
from turkce_model.egitim import KILITLI_EGITIM_ALANLARI
from turkce_model.metin import binlik, buyuk
from turkce_model.moduller import kiyas, komutlar, meb_metin, ocr
from turkce_model.moduller.ayar import (
    EN_BUYUK_ZAMAN_ASIMI,
    VARSAYILAN_ADRES,
    MetinAyarlari,
    ModulAyarlari,
    OcrAyarlari,
    moduller_uygula,
)
from turkce_model.moduller.istemci import ModulHatasi, YerelSunucu, yerel_adres_mi
from turkce_model.model import TurkceGPT
from turkce_model.veri import AkisVeri

if sys.version_info >= (3, 11):
    import tomllib
else:  # pragma: no cover
    import tomli as tomllib

PROJE = Path(__file__).resolve().parents[1]
README = (PROJE / "README.md").read_text(encoding="utf-8")
GOMME = (PROJE / "GOMME_KARARLARI.md").read_text(encoding="utf-8")
AYAR_DOSYASI = (PROJE / "ayarlar.toml").read_text(encoding="utf-8")
TERS_BOLU = chr(92)


def _duz(metin: str) -> str:
    """Satır sonları ve girinti tek boşluk olur: belgede satırın nereden bölündüğü önemsizdir."""
    return " ".join(metin.split())


def _bolum(metin: str, baslik: str) -> str:
    """``baslik`` ile başlayan Markdown bölümü (aynı ya da üst düzeydeki sonraki başlığa kadar)."""
    m = re.search(rf"^(#+) {re.escape(baslik)}.*$", metin, re.MULTILINE)
    assert m, f"bölüm yok: {baslik}"
    duzey = len(m.group(1))
    son = re.compile(rf"^#{{1,{duzey}}} ", re.MULTILINE)
    sonraki = son.search(metin, m.end())
    return metin[m.end() : sonraki.start() if sonraki else len(metin)]


def _yorum(metin: str) -> str:
    """TOML yorumlarının devam satırları birleşir: "… sırasındaki\n    # doğrulama …" → "… sırasındaki doğrulama …"."""
    return _duz(re.sub(r"\n\s*#\s*", " ", metin))


def _basliklar(metin: str) -> list[str]:
    return re.findall(r"^#+ (.+)$", metin, re.MULTILINE)


# ---- komutlar ve bölüm göndermeleri ---------------------------------------------------------------


def _belgedeki_komutlar() -> list[str]:
    komutlar = []
    for metin in (README, GOMME, AYAR_DOSYASI):
        for m in re.finditer(r"python -m turkce_model ([^`\n]*)", metin):
            komut = re.split(r"\s{2,}|#", m.group(1))[0].strip()  # açıklama ve yorum kısmı atılır
            komutlar.append(komut)
    return komutlar


def test_belgedeki_her_komut_ayristirilir():
    komutlar = _belgedeki_komutlar()
    assert len(komutlar) > 25
    ayristirici = cli.ayristirici()
    for komut in komutlar:
        try:
            ayristirici.parse_args(shlex.split(komut))
        except SystemExit:  # argparse geçersiz komut/seçenekte çıkar
            pytest.fail(f"belgedeki komut ayrıştırılamadı: python -m turkce_model {komut}")


def test_iletilerin_andigi_bolumler_belgelerde_var():
    """Kod "README, 'X'" ya da "README'deki 'X' bölümü" diyorsa README'de X başlığı, GOMME §N diyorsa N. başlık olmalı."""
    kaynak = "\n".join(p.read_text(encoding="utf-8") for p in sorted((PROJE / "turkce_model").rglob("*.py")))
    readme_basliklari = _basliklar(README)
    anilan = set(re.findall(r"README, '([^']+)'", kaynak)) | set(re.findall(r"README'deki '([^']+)'", kaynak))
    assert {"DeepSeek modülleri", "Daha ileri gitmek", "MEB soruları", "Kurulum"} <= anilan
    for ad in anilan:
        assert any(ad in b for b in readme_basliklari), f"README'de '{ad}' bölümü yok"
    for no in set(re.findall(r"README, (\d+)\. adım", kaynak)):
        assert any(b.startswith(f"{no}. ") for b in readme_basliklari), f"README'de {no}. adım yok"
    gomme_basliklari = _basliklar(GOMME)
    for no in set(re.findall(r"GOMME_KARARLARI\.md §(\d+)", kaynak)) | set(re.findall(r"§\d+ ve §(\d+)", kaynak)):
        assert any(b.startswith(f"{no}. ") for b in gomme_basliklari), f"GOMME_KARARLARI.md'de §{no} yok"
    if "Önce bağlam" in kaynak:
        assert any(b.startswith("Önce bağlam") for b in gomme_basliklari)
    # ayarlar.toml'un [moduller] yorumu da README bölümünü anar.
    assert 'README: "DeepSeek modülleri"' in AYAR_DOSYASI


# ---- D1: Windows'ta yazılan kaçış dizileri --------------------------------------------------------


def test_kacis_dizisi_ornegi_gercek_ciktiyla_ayni():
    # main() stdout'u errors="backslashreplace" ile yeniden yapılandırır; cp1254'te yazılamayan işaretler böyle çıkar.
    ornekler = ["▁".encode("cp1254", "backslashreplace").decode(), "→".encode("cp1254", "backslashreplace").decode()]
    assert ornekler == [TERS_BOLU + "u2581", TERS_BOLU + "u2192"]
    assert all(f"`{o}`" in README for o in ornekler)
    assert "kaçış dizisi (`▁`)" not in README  # eski örnek işaretin kendisini gösteriyordu


# ---- yığın × birikim takası -------------------------------------------------------------------------


def test_yigin_birikim_takasi_belgede_kesin_anlatilir(tmp_path):
    assert "sonuç değişmez" not in _duz(README) and "sonuç değişmez" not in _yorum(AYAR_DOSYASI)
    assert "eğitim sırasındaki doğrulama kümesi de aynı kalır; aşama 1 aynı pencerelerden öğrenir" in _duz(README)
    assert "adım başına dizi sayısı ve eğitim sırasındaki doğrulama kümesi aynı kalır" in _yorum(AYAR_DOSYASI)
    # "Aşama 1 aynı pencerelerden öğrenir": eğitim pencereleri yığın bölünmesinden bağımsız sırayla çekilir.
    yol = tmp_path / "akis.bin"
    np.arange(5000, dtype=np.uint16).tofile(yol)
    akis = AkisVeri(yol, 32000)

    def pencereler(yigin: int, birikim: int) -> list[int]:
        uretec = np.random.default_rng(3)
        return [int(x[0]) for _ in range(birikim) for x in akis.yigin(yigin, 16, uretec)[0]]

    assert pencereler(8, 2) == pencereler(2, 8) == pencereler(1, 16) == pencereler(16, 1)


def test_asama2_varsayilan_yigini_belgede_kodla_ayni():
    meb = Ayarlar().meb
    assert f"Aşama 2'nin varsayılanı yığın {meb.yigin}, birikim {meb.birikim}'dir (adım başına {meb.yigin * meb.birikim} dizi)" in _duz(README)
    assert f"Varsayılan yığın {meb.yigin} × birikim {meb.birikim}, yani adım başına {meb.yigin * meb.birikim} dizi" in _duz(README)
    dosya = tomllib.loads(AYAR_DOSYASI)["egitim"]["meb"]
    assert (dosya["yigin"], dosya["birikim"]) == (meb.yigin, meb.birikim)
    assert f"adım başına yigin × birikim = {meb.yigin * meb.birikim} dizi" in AYAR_DOSYASI


# ---- --devam kuralları ------------------------------------------------------------------------------


def _kod_listesi(metin: str, baslangic: str, son: str) -> list[str]:
    duz = _duz(metin)
    i = duz.index(baslangic)
    return re.findall(r"`([a-z_]+)`", duz[i : duz.index(son, i)])


def test_devam_kurallari_kodun_kilitli_alanlariyla_ayni():
    kilitli = _kod_listesi(README, "Kayıttakiyle aynı olmalı:", ").")
    serbest = _kod_listesi(README, "Değişebilir (bir notla):", ".")
    assert set(kilitli) == set(KILITLI_EGITIM_ALANLARI) and len(kilitli) == len(KILITLI_EGITIM_ALANLARI)
    tum = {f.name for f in fields(EgitimAyarlari)}
    assert set(serbest) == tum - set(KILITLI_EGITIM_ALANLARI)
    assert "degerlendirme_yigini" in kilitli
    duz = _duz(README)
    for cumle in (
        "Tokenizer ve hazır veri de değişmemiş olmalı. Kontrol noktası onların içerik imzalarını tutar",
        "Sürdürülecek kontrol noktası yoksa `--devam` hata verir, yeni bir eğitim başlatmaz.",
        "`--devam` ile `--uzerine-yaz` birlikte verilemez.",
        "Aynı deneyin aynı aşaması eğitilirken ikinci bir `egit` reddedilir.",
        "yeni eğitim ilk adımını tamamlayınca silinir",
        "Ctrl+C bir adımın ortasına gelse de sürdürülen eğitim o adımı aynı yığınlarla yeniden yapar",
    ):
        assert cumle in duz, cumle
    assert "degerlendirme_yigini = 20 # eğitim sırasındaki doğrulama: bu × birikim yığın; --devam'da değiştirilemez" in AYAR_DOSYASI


# ---- durum, ilerleme, hesapla -----------------------------------------------------------------------


def test_durum_bolumu_kodun_iletilerini_anar():
    bolum = _duz(_bolum(README, "Adım adım"))
    kaynak = (PROJE / "turkce_model" / "cli.py").read_text(encoding="utf-8")
    for alinti, koddaki in (  # README'nin alıntısı ve cli.py'de aynı iletiyi üreten parça
        ("önceki adım yenilenecek", "önceki adım yenilenecek"),
        ("eğitim şu an sürüyor (adım X/Y, son kayıt …)", 'eğitim şu an sürüyor ({ilerleme}, son kayıt'),
        ("değerlendirilmedi → degerlendir --asama …", 'değerlendirilmedi → {komut}'),
        ("Yarıda kalan başka deneyler", "Yarıda kalan başka deneyler:"),
        ("sürdürülemez", "sürdürülemez"),
        ("eski biçim", '"eski biçim"'),
    ):
        assert alinti in bolum, alinti
        assert koddaki in kaynak, koddaki
    assert 'komut = f"degerlendir --asama {asama}"' in kaynak
    assert "`--ayarlar`, `--ayar` ve `--deney` seçeneklerini tekrarlar" in bolum
    # Başka deneylerin satırı --ayarlar ve --deney taşır; durum'un --ayar'ı yerine kayıtlı değerleri (aşağıda, C1).
    assert "Bu komut `--deney` ve `--ayarlar`'ı taşır, `durum`'a verdiğin `--ayar`'ları taşımaz." in bolum


def test_ilerleme_notlari_ve_sayi_bicimi_belgelenir(tmp_path):
    kayit = {
        "deney": "d", "asama": "meb", "adim": 1, "durduruldu": True, "ek_paragraf": 12,
        "meb_secenek": {"4": 30, "5": 7}, "parametre": 823616, "parametre_gomme_disi": 5_380_000,
    }
    md = ilerleme_ekle(tmp_path, kayit).read_text(encoding="utf-8")
    satir = next(s for s in md.splitlines() if s.startswith("| ") and "| meb |" in s)
    notlar = [n.strip() for n in satir.rstrip(" |").split("|")[-1].split(",")]
    assert len(notlar) == 4  # durduruldu, ek paragraf, 5 şıklı, eski ölçüm (kayıtta "olcum" yok)
    bolum = _duz(_bolum(README, "7. Nereye kadar gittin?"))
    for not_ in notlar:
        assert f"`{re.sub(r'[0-9]+(?! şıklı)', 'N', not_)}`" in bolum, not_
    assert "823 616" in satir and "5.38 M" in satir and binlik(823616) == "823 616"
    assert "binlik ayırıcı boşluk, ondalık ayırıcı noktadır (`823 616`, `3.719`)" in bolum
    yukseltme = bolum[bolum.index("Eski bir sürümden güncellediysen") :]
    sira = [yukseltme.index(f"{i}. `{k}`:") for i, k in enumerate(("tokenizer-egit", "veri-hazirla", "degerlendir"), 1)]
    assert sira == sorted(sira)


def test_hesapla_bolumu_ciktisiyla_tutarli():
    bolum = _duz(_bolum(README, "5. Gömme kararları"))
    kaynak = (PROJE / "turkce_model" / "cli.py").read_text(encoding="utf-8")
    assert "Aşama 1 ve aşama 2 için ayrı bellek tahmini" in bolum and "Aşama 2 (MEB): aktivasyon + logit" in kaynak
    assert "Eğitim sonundaki tam değerlendirmenin yığını" in bolum and "Eğitim sonundaki tam değerlendirme" in kaynak
    assert "bir eğitim adımının süresini" in bolum and "adım başına " in kaynak and "× birikim" in kaynak
    assert "%70" in bolum and "0.7 * toplam_bellek" in kaynak


# ---- ek metin -----------------------------------------------------------------------------------------


def test_ek_metin_deneyi_ayri_ciktilar_klasoruyle_anlatilir():
    bolum = _bolum(README, "Daha ileri gitmek")
    duz = _duz(bolum)
    assert "--deney adıyla" not in duz  # yeni bir deney adı ortak tokenizer'ı korumaz
    assert "`ciktilar/deneyler` altındaki bütün modeller" in duz and "`[yollar] ciktilar`" in duz
    komutlar = re.findall(r"python -m turkce_model (.+)", bolum)
    assert [k.split()[0] for k in komutlar] == ["tokenizer-egit", "veri-hazirla", "egit"]
    assert all(k.rstrip().endswith("--ayarlar ek.toml") for k in komutlar)
    assert "--uzerine-yaz" not in " ".join(komutlar)
    # Önerilen ayar dosyası gerçekten ayrı bir ciktilar klasörü seçer.
    ek = AYAR_DOSYASI.replace('ciktilar = "ciktilar"', 'ciktilar = "ciktilar_ek"')
    assert ek != AYAR_DOSYASI
    assert tomllib.loads(ek)["yollar"]["ciktilar"] == "ciktilar_ek"


# ---- GOMME_KARARLARI tarafsızlık düzeltmeleri ----------------------------------------------------


def test_gomme_metinleri_tarafsiz():
    duz = _duz(GOMME)
    assert "genelde yardım eder" not in duz and "yararsızsa öyle kalır" not in duz
    assert "Press & Wolf 2017 dil modellemede bağlamayla daha düşük şaşkınlık bildirdi; bu veride etkisi bir deney sorusudur." in duz
    assert (
        "Vektörler sıfırdan başlar, yani başta modeli hiç değiştirmez. AdamW onları gradyan gürültüsüyle de biraz "
        "oynatır; yararsız olsalar bile tam sıfırda kalmazlar ve büyüklükleri yararlılığın ölçüsü değildir. Etkisini "
        "BPC ile karşılaştır."
    ) in duz


# ---- DeepSeek modülleri bölümü --------------------------------------------------------------------


def test_modul_bolumu_yerinde_ve_ayarlarla_tutarli():
    basliklar = _basliklar(README)
    modul = basliklar.index("DeepSeek modülleri (isteğe bağlı)")
    assert modul < basliklar.index("Veri, haklar ve gizlilik")
    assert "`turkce_model/moduller/`" in README and "İsteğe bağlı DeepSeek modülleri" in README.split("```")[0]
    bolum = _bolum(README, "DeepSeek modülleri")
    # Bölümdeki TOML örnekleri [moduller] olarak geçerli ayarlardır.
    ornekler = re.findall(r"```toml\n(.*?)```", bolum, re.DOTALL)
    assert len(ornekler) >= 2
    for ornek in ornekler:
        ham = tomllib.loads(ornek)["moduller"]
        moduller_uygula(ModulAyarlari(), ham)
    assert f"| Ollama    | `{VARSAYILAN_ADRES}` | varsayılan" in bolum
    duz = _duz(bolum)
    assert "`[moduller] uzak_sunucu = true`" in duz and "Gerçek bir DeepSeek modeli bu projenin geliştirildiği ortamda çalıştırılmadı" in duz
    assert "--ayar moduller.ocr.model=deepseek-ocr" in duz


def test_depodaki_ayar_dosyasindaki_modul_ayarlari_varsayilan():
    assert ayarlari_yukle(PROJE / "ayarlar.toml").moduller == ModulAyarlari()
    assert ayarlari_yukle(PROJE / "ayarlar.toml", ["moduller.ocr.model=deepseek-ocr"]).moduller.ocr.model == "deepseek-ocr"


# ---- yarıda kalan --uzerine-yaz: kenardaki eski eğitim ---------------------------------------------


def _kaynak(*parcalar: str) -> str:
    return (PROJE / "turkce_model" / Path(*parcalar)).read_text(encoding="utf-8")


def test_kenardaki_eski_egitim_belgelendigi_gibi_geri_gelir(tmp_path):
    bolum = _duz(_bolum(README, "6. Eğitim"))
    durum = _duz(_bolum(README, "Adım adım"))
    kaynak = _kaynak("cli.py")
    assert "yeni eğitim ilk adımını tamamlayınca silinir" in bolum
    assert "Ctrl+C'de ya da Python içindeki bir hatada (ör. ekran kartının belleği yetmedi) hemen." in bolum
    assert "o aşamada `egit`, `degerlendir`, `uret`, `tanimla`, `sor`; TDK modeli için `egit --asama meb`" in bolum
    # Listedeki komutlar kenardakini gerçekten yerine koyar: uret, tanimla ve sor modeli _model_yukle ile yükler.
    for komut in (cli.komut_uret, cli.komut_tanimla, cli.komut_sor):
        assert "_model_yukle(" in inspect.getsource(komut)
    model_yukle = inspect.getsource(cli._model_yukle)  # deneyin modeli (önce MEB, yoksa TDK) ve --model ile verilen
    assert "kenardakini_geri_getir(klasor, _hata_yaz)" in model_yukle and "kenardakini_geri_getir(yol.parent" in model_yukle
    assert "kenardakini_geri_getir(" in inspect.getsource(egitim.degerlendir)
    egit_kaynagi = inspect.getsource(egitim._egit)
    assert "_yarim_uzerine_yazmayi_toparla(klasor)" in egit_kaynagi and "kenardakini_geri_getir(kaynak.parent" in egit_kaynagi
    # durum'un satırları README'deki alıntılarla aynı.
    for alinti, koddaki in (
        ("yarıda kalan --uzerine-yaz; eski eğitim kenarda: …", '"yarıda kalan --uzerine-yaz; eski eğitim kenarda: "'),
        ("geri getirmek için: egit --asama … --devam", "→ geri getirmek için: {komut} --devam{ek}"),
        ("Kenarda kalmış eski eğitimler de burada listelenir", "/ {asama}: yarıda kalan --uzerine-yaz; eski eğitim kenarda"),
    ):
        assert alinti in durum, alinti
        assert koddaki in kaynak, koddaki
    assert '"eski eğitim kenarda"' in bolum
    # Geri getirilen bitmiş eğitimde --devam ayarları karşılaştırmadan "zaten bitmiş" der; komut 0 ile çıkar.
    assert '"Bu eğitim zaten bitmiş" der, değerlendirme komutunu yazar ve 0 koduyla çıkar' in bolum
    assert "Bu eğitim zaten bitmiş (" in _kaynak("egitim.py") and '{"zaten_bitti": True' in _kaynak("egitim.py")
    assert 'return 130 if sonuc.get("durduruldu") else 0' in inspect.getsource(cli.komut_egit)
    # "Olduğu gibi geri gelir": kenardaki dosyalar bayt bayt yerine konur ve bir not yazılır.
    klasor = tmp_path / "tdk"
    klasor.mkdir()
    adlar = ("durum.json", "gunluk.jsonl", "en_iyi.pt", "son.pt")
    for ad in adlar:
        (klasor / f"{ad}.eski").write_bytes(f"eski {ad}".encode())
    notlar: list[str] = []
    assert egitim.kenardakini_geri_getir(klasor, notlar.append)
    assert {ad: (klasor / ad).read_bytes() for ad in adlar} == {ad: f"eski {ad}".encode() for ad in adlar}
    assert not list(klasor.glob("*.eski"))
    assert notlar == [f"Not: {klasor} içinde yarıda kalmış bir eğitim başlangıcı bulundu; kenara alınmış eski eğitim geri getirildi."]


# ---- yazılan komutlar ayar dosyasını taşır --------------------------------------------------------


def test_onkosul_iletilerindeki_komutlar_ayar_dosyasini_tasir(tmp_path):
    bolum = _duz(_bolum(README, "6. Eğitim"))
    assert "komutu `--ayarlar`, `--ayar` ve `--deney` ile yazar; veri komutlarına `--cihaz` eklenmez" in bolum
    arg = argparse.Namespace(ayarlar="deney 2.toml", ayar=["egitim.tdk.yigin=4"], deney="d", cihaz="cpu")
    ek = cli._komut_eki(arg)
    assert ek == f" --ayarlar {cli._tirnak('deney 2.toml')} --ayar egitim.tdk.yigin=4 --deney d"
    assert cli._komut_eki(arg, cihaz=True) == ek + " --cihaz cpu"
    assert "veri_komut_eki=_komut_eki(arg)" in inspect.getsource(cli.komut_egit)  # egit'in veri komutları --cihaz'sız
    ayarlar = Ayarlar(kok=tmp_path)
    with pytest.raises(AyarHatasi) as hata:
        egitim.tokenizer_yukle(ayarlar, ek)
    assert str(hata.value).endswith(f"Önce: python -m turkce_model tokenizer-egit{ek}")
    with pytest.raises(AyarHatasi) as hata:
        egitim.hazir_veri(ayarlar, None, ek)
    assert str(hata.value).endswith(f"Önce: python -m turkce_model veri-hazirla{ek}")
    kaynak = _kaynak("egitim.py")
    assert "Veri başka bir tokenizer'la hazırlanmış. Yeniden çalıştır: {komut}" in kaynak


def test_boru_kapaninca_cikis_kodu_belgelenir():
    kurulum = _duz(_bolum(README, "Kurulum"))
    assert f"izleme dökümü yazmaz, {cli.BORU_KAPANDI} koduyla çıkar ve işin kalanını yapmaz" in kurulum
    assert cli.BORU_KAPANDI == 128 + 13  # SIGPIPE ile biten bir süreç gibi
    assert "except BrokenPipeError" in inspect.getsource(cli.main)


# ---- MEB soruları: OCR kipi, OCR'sız okumanın reddi, durum'un sırası ------------------------------


def _taranmis_pdf(yol: Path, sayfa_sayisi: int = 1, **kaydet) -> Path:
    """Metin katmanı olmayan PDF: her sayfada yalnız bir dikdörtgen. ``kaydet``: ``pymupdf`` kaydetme seçenekleri
    (ör. parola)."""
    pymupdf = pytest.importorskip("pymupdf")
    yol.parent.mkdir(parents=True, exist_ok=True)
    belge = pymupdf.open()
    for i in range(sayfa_sayisi):
        sayfa = belge.new_page(width=200, height=200)
        sayfa.draw_rect(pymupdf.Rect(10 + 20 * i, 10, 30 + 20 * i, 30), color=(0, 0, 0), fill=(0, 0, 0))
    belge.save(yol, **kaydet)
    belge.close()
    return yol


def test_durum_meb_pdfi_ocr_kipiyle_ve_once_onerir(tmp_path):
    bolum = _duz(_bolum(README, "3. MEB soruları"))
    durum = _duz(_bolum(README, "Adım adım"))
    kaynak = _kaynak("cli.py")
    assert "sorular OCR ile okunduysa aynı kiple: `meb-pdf --ocr` ya da `meb-pdf --ocr hepsi`" in bolum
    hedef = tmp_path / "meb_pdf.jsonl"
    hedef.write_text("", encoding="utf-8")
    for kip in ("gerekirse", "hepsi", None):  # meb-pdf kipini raporuna yazar; durum onu okur
        hedef.with_suffix(".rapor.json").write_text(json.dumps({"ocr": kip}), encoding="utf-8")
        assert meb.ocr_kipi(hedef) == kip
    assert 'rapor["ocr"] = arg.ocr' in inspect.getsource(cli.komut_meb_pdf)
    assert 'komut = "meb-pdf --ocr" + (" hepsi" if kip == "hepsi" else "")' in kaynak
    # Sıra: var olan MEB soruları yeniden okunacaksa meb-pdf, onları okuyan tokenizer-egit ve veri-hazirla'dan önce.
    assert "Var olan MEB soruları yeniden okunacaksa `meb-pdf` tokenizer'dan ve hazır veriden önce önerilir" in durum
    assert re.search(r"adaylar = \[[^\]]*\*meb_once, tokenizer, hazir", kaynak)
    assert "meb_pdf.jsonl" in inspect.getsource(cli._tokenizer_metinleri)
    assert "meb_pdf.jsonl" in inspect.getsource(cli.komut_veri_hazirla)


def test_ocrsuz_meb_pdf_ocr_ile_okunmus_sorulari_silmez(tmp_path, capsys):
    bolum = _duz(_bolum(README, "3. MEB soruları"))
    assert "`meb_pdf.jsonl`'i yazmaz, 2 koduyla çıkar ve `meb-pdf --ocr` komutunu yazar" in bolum
    _taranmis_pdf(tmp_path / "veri" / "meb" / "pdf" / "a.pdf")
    hedef = tmp_path / "veri" / "meb" / "meb_pdf.jsonl"
    soru = meb.Soru(
        kimlik="pdf:a.pdf:111:tarih-1:1", kaynak="meb-pdf", ders="Tarih - 1", soru="Hangisi bir başkenttir?",
        secenekler=["Ankara", "Deniz", "Hava", "Uzay"], cevap=0, bolum="egitim", ek={"okuma": "ocr", "dosya": "a.pdf"},
    )
    meb.soru_yaz([soru], hedef)
    once = hedef.read_bytes()
    ayar = tmp_path / "ayarlar.toml"
    ayar.write_text(AYAR_DOSYASI, encoding="utf-8")
    assert cli.main(["meb-pdf", "--ayarlar", str(ayar)]) == 2
    hata = capsys.readouterr().err.strip()
    assert hata.endswith(f"OCR ile okumak için: python -m turkce_model meb-pdf --ocr --ayarlar {cli._tirnak(str(ayar))}")
    assert "OCR'sız okuma onları siler. Dosya yazılmadı." in hata
    assert hedef.read_bytes() == once and not hedef.with_suffix(".rapor.json").exists()


def test_ders_adi_roma_rakamli_duzeyiyle_belgelendigi_gibi():
    from turkce_model.metin import baslik

    bolum = _duz(_bolum(README, "3. MEB soruları"))
    m = re.search(
        r'Ders adını başlıktan düzeyiyle alır \("\((\d{3})\) ([^"]+)" → "([^"]+)"\); ad her soru isteminde geçer '
        r'\(`([^`]+)`\)\. Önceki sürüm Roma rakamlı düzeyi bozuyordu \("([^"]+)"\): öyle okunmuş kitapçıklar için '
        r"`meb-pdf`'i ilk okumadaki seçeneklerle, sonra `veri-hazirla`'yı yeniden çalıştır\.",
        bolum,
    )
    assert m
    kod, ders_basligi, ad, istem_satiri, eski_ad = m.groups()
    # PDF ve OCR yolu adı aynı kuralla kurar; OCR metninden okunan sorunun dersi ve istemindeki satır README'deki gibi.
    assert meb._ders_adi(ders_basligi) == ad
    sayfalar = [
        f"({kod}) {ders_basligi}\n\n{_ocr_sorusu(1)}\n\n{_ocr_sorusu(2)}",
        f"CEVAP ANAHTARI\n\n({kod}) {ders_basligi}\n\n1. A\n2. B",
    ]
    sorular, _ = meb_metin.metinden_ayristir(sayfalar, "k.pdf", yaz=lambda _: None)
    assert [s.ders for s in sorular] == [ad, ad]
    assert meb.istem(sorular[0]).splitlines()[0] == istem_satiri
    # Önceki sürüm düzeyi adla birlikte başlık harfine çeviriyordu ("II" → "Iı").
    assert baslik(ders_basligi) == eski_ad


# ---- ilerleme tablosundaki kıyas satırı ------------------------------------------------------------


def test_kiyas_satiri_belgelendigi_bicimde_ve_eski_olcum_notsuz(tmp_path):
    bolum = _duz(_bolum(README, "7. Nereye kadar gittin?"))
    ornek = re.search(r"Doğrulukları `([^`]+)` biçimindedir", bolum)
    assert ornek and "Kıyas satırları bu notu almaz." in bolum
    # "olcum" alanı olmayan (önceki sürümün yazdığı) kıyas satırı da "eski ölçüm" notunu almaz.
    kayit = {"deney": "modül: m", "asama": "kıyas", "kiyas": True, "mmlu": {"n": 10, "dogruluk_uretim": 0.3, "rastgele": 0.25}}
    satir = next(s for s in ilerleme_ekle(tmp_path, kayit).read_text(encoding="utf-8").splitlines() if "| kıyas |" in s)
    assert ornek.group(1) in satir and "eski ölçüm" not in satir


# ---- DeepSeek modülleri: adres, OCR, sor --resim, kıyas --------------------------------------------


def test_modul_adresi_belgelendigi_gibi_denetlenir():
    bolum = _duz(_bolum(README, "Modülleri kurmak"))
    assert (
        "Ayrıştırılamayan bir adres (kapanmamış `[`, sayı olmayan ya da aralık dışı kapı, boşluklu sunucu adı) ayarlar "
        "okunurken reddedilir."
    ) in bolum
    for adres in ("http://[::1/v1", "http://localhost:abc/v1", "http://localhost:99999/v1", "http://local host:11434/v1"):
        with pytest.raises(AyarHatasi, match="geçerli bir adres değil"):
            ayarlari_yukle(PROJE / "ayarlar.toml", [f"moduller.adres={adres}"])
    ornek = re.search(r"kullanıcı bilgisi taşıyan adres de \(`([^`]+)`\)", bolum)
    assert ornek and not yerel_adres_mi(ornek.group(1)) and yerel_adres_mi(ornek.group(1).replace("ad@", ""))
    istemci = _kaynak("moduller", "istemci.py")
    assert "allow_redirects=False" in istemci and "Veri dışarı gitmesin diye yönlendirme izlenmez" in istemci
    assert "Sunucunun yönlendirmeleri izlenmez: sunucu isteği başka bir adrese yönlendirirse komut durur" in bolum
    assert "Sunucunun yönlendirmeleri izlenmez." in _duz(_bolum(README, "Veri, haklar ve gizlilik"))


class _SahteOcrSunucusu:
    """``OcrModulu``'nün kullandığı tek yöntem: hep aynı metni ve bitiş nedenini döndürür, istekleri sayar."""

    def __init__(self, metin: str, bitis: str = "stop") -> None:
        self.metin, self.bitis, self.son_bitis, self.istek = metin, bitis, None, 0

    def gorselden_metin(self, *_, **__) -> str:
        self.istek += 1
        self.son_bitis = self.bitis
        return self.metin


def test_ocr_onbellegi_ve_kesik_cikti_belgelendigi_gibi(tmp_path):
    bolum = _duz(_bolum(README, "OCR modülü"))
    varsayilan = OcrAyarlari().en_fazla_token
    assert f"`[moduller.ocr] en_fazla_token`'da (varsayılan {varsayilan})" in bolum
    assert f'"çıktı en_fazla_token ({varsayilan}) sınırında kesildi"' in bolum
    assert "çıktı en_fazla_token ({self.ayar.en_fazla_token}) sınırında kesildi" in _kaynak("moduller", "ocr.py")
    assert f"`{ocr.KESIK_ISARETI}`" in bolum and "Boş çıktı saklanmaz; sonraki çalıştırma o sayfayı yeniden sorar." in bolum
    bos = _SahteOcrSunucusu("")
    modul = ocr.OcrModulu(bos, OcrAyarlari(model="m"), tmp_path / "bos")
    modul.ham_oku(b"sayfa")
    modul.ham_oku(b"sayfa")
    assert bos.istek == 2 and not (tmp_path / "bos").exists()
    kesik = _SahteOcrSunucusu("1. Soru hangisidir?\nA) Bir\nB) İ", "length")
    modul = ocr.OcrModulu(kesik, OcrAyarlari(model="m"), tmp_path / "kesik")
    modul.ham_oku(b"sayfa")
    ham, onbellekten = modul.ham_oku(b"sayfa")
    assert onbellekten and kesik.istek == 1 and ham.rstrip().endswith(ocr.KESIK_ISARETI)


def _ocr_sorusu(no: int) -> str:
    return f"{no}. {no}. sorunun kökü hangisidir?\n\n" + "\n".join(f"{h}) {s}" for h, s in zip("ABCD", ("Bir", "İki", "Üç", "Dört")))


def test_ocr_metninden_soru_cikarma_belgelendigi_gibi():
    bolum = _duz(_bolum(README, "OCR modülü"))
    assert (
        "(yan yana sütunlar karışmış olabilir) o dersin bütün soruları elenir. Ders başlığının altında hiç cevap "
        "okunamazsa da öyle. İki durumda da uyarı dersin adını yazar."
    ) in bolum
    # Yan yana basılmış anahtar: TARİH'in başlığı altında cevap yok, COĞRAFYA'nın 1-3. soruları iki harfle okunur.
    sayfalar = [
        "(111) TARİH - 1\n\n" + "\n\n".join(_ocr_sorusu(n) for n in range(1, 7)),
        "(222) COĞRAFYA - 1\n\n" + "\n\n".join(_ocr_sorusu(n) for n in range(1, 4)),
        "CEVAP ANAHTARI\n\n(111) TARİH - 1\n(222) COĞRAFYA - 1\n\n1 / A / 1 / D\n2 / B / 2 / C\n3 / C / 3 / B\n"
        "4 / D\n5 / A\n6 / B",
    ]
    mesajlar: list[str] = []
    sorular, _ = meb_metin.metinden_ayristir(sayfalar, "k.pdf", yaz=mesajlar.append)
    assert not sorular
    uyarilar = [m for m in mesajlar if m.startswith("  Uyarı: cevap anahtarında") and "cevapsız sayıldı: " in m]
    assert any("(yan yana sütunlar karışmış olabilir)" in m and m.endswith(": (222) COĞRAFYA - 1") for m in uyarilar)
    assert any("ders başlığının altında cevap okunamadı" in m and m.endswith(": (111) TARİH - 1") for m in uyarilar)
    # Kesik sayfa: son sorusu şekilli sorular gibi elenir, öncekiler ve sonraki sayfanın kalanı tutulur.
    assert "O sayfanın son sorusu şekilli sorular gibi elenir; sonraki sayfanın ilk sorusu da elenebilir." in bolum
    sayfalar = [
        "(333) FELSEFE - 1\n\n" + _ocr_sorusu(1) + "\n\n" + _ocr_sorusu(2) + "\n\n3. Kesilen soru hangisidir?\n\nA) Bir\nB) İ"
        + "\n\n" + ocr.KESIK_ISARETI,
        _ocr_sorusu(4) + "\n\n" + _ocr_sorusu(5),
        "CEVAP ANAHTARI\n\n(333) FELSEFE - 1\n\n1. A\n2. B\n3. C\n4. D\n5. A",
    ]
    sorular, rapor = meb_metin.metinden_ayristir(sayfalar, "k.pdf", yaz=lambda _: None)
    tutulan = {str(s.ek["soru_no"]) for s in sorular}
    assert {"1", "2", "5"} <= tutulan and "3" not in tutulan and rapor["elenen"].get("gorsel_gerekli", 0) >= 1


def _bmp(genislik: int = 2, yukseklik: int = 2) -> bytes:
    """En küçük 24 bitlik BMP (her satır 4 bayta tamamlanır)."""
    satir = b"\x00\x00\xff" * genislik
    satir += b"\x00" * (-len(satir) % 4)
    govde = satir * yukseklik
    return (
        b"BM" + struct.pack("<IHHI", 54 + len(govde), 0, 0, 54)
        + struct.pack("<IiiHHIIiiII", 40, genislik, yukseklik, 1, 24, 0, len(govde), 2835, 2835, 0, 0) + govde
    )


def test_ocr_komutunun_girdileri_belgelendigi_gibi(tmp_path):
    bolum = _duz(_bolum(README, "OCR modülü"))
    turler = re.search(r"\*\*`ocr`\*\* bir PDF'i ya da görüntüyü \(([^)]*)\)", bolum)
    assert turler and "`.bmp` ve `.gif` gönderilmeden önce PNG'ye çevrilir" in turler.group(1)
    assert set(re.findall(r"`(\.[a-z]+)`", turler.group(1))) == set(ocr.GORSEL_TURLERI)
    pytest.importorskip("pymupdf")
    yol = tmp_path / "resim.bmp"
    yol.write_bytes(_bmp())
    veri, tur = ocr.gorsel_oku(yol)
    assert tur == "image/png" and veri.startswith(b"\x89PNG")
    assert "Aynı adlı girdiler ayrı dosyalara yazılır (`IMG_0001.txt`, `IMG_0001-2.txt`)." in bolum
    assert 'ad = f"{yol.stem}-{n}"' in inspect.getsource(komutlar.komut_ocr)


@pytest.mark.parametrize(
    ("metin", "ileti"),
    [
        pytest.param(
            "1. Birinci soru hangisidir?\nA) Bir\nB) İki\n\n2. İkinci soru hangisidir?\nA) Üç\nB) Dört",
            "Görüntüde birden çok soru var; fotoğrafı tek soruyu içerecek biçimde kırp.",
            id="iki-soru",
        ),
        pytest.param(
            "5. Soru hangisidir?\nA) Bir\nB) İ\n\n" + ocr.KESIK_ISARETI,
            "OCR çıktısı [moduller.ocr] en_fazla_token sınırında kesildi; soru eksik okunmuş olabilir. Değeri büyüt ya da "
            "fotoğrafı tek soruyu içerecek biçimde kırp.",
            id="kesik",
        ),
    ],
)
def test_sor_resim_belgelenen_durumlarda_durur(monkeypatch, metin, ileti):
    bolum = _duz(_bolum(README, "OCR modülü"))
    assert (
        "Fotoğrafta birden çok soru varsa (iki \"A)\" satırı) ya da OCR çıktısı `en_fazla_token`'da kesildiyse komut "
        "durur ve fotoğrafı tek soruyu içerecek biçimde kırpmanı söyler."
    ) in bolum
    sahte = SimpleNamespace(ayar=OcrAyarlari(model="m"), dosya_oku=lambda *_: [metin])
    monkeypatch.setattr(ocr, "ocr_modulu", lambda _: sahte)
    with pytest.raises(ModulHatasi) as hata:
        komutlar.resimden_soru("soru.png", None)
    assert str(hata.value) == ileti
    # Fotoğraf model yüklenmeden önce okunur.
    kaynak = inspect.getsource(cli.komut_sor)
    assert kaynak.index("resimden_soru(arg.resim") < kaynak.index("_model_yukle(")


def test_kiyas_onbellegi_ve_kesik_cevaplar_belgelendigi_gibi(tmp_path):
    bolum = _duz(_bolum(README, "Kıyas modülü"))
    # Saklanan "cevap" sunucunun içeriği değil, düşünme bloğu ayıklanmış metindir: belge "ham" demez.
    assert "(cevap metni ve çıkarılan şık)" in bolum and "ham cevap" not in bolum
    assert "Şık her çalıştırmada saklanan cevaptan yeniden çıkarılır." in bolum
    assert 'secim = cevap_cikar(str(kayit.get("cevap", ""))' in inspect.getsource(kiyas.kiyasla)
    assert "return dusunmeyi_ayikla(ham)" in inspect.getsource(YerelSunucu.sohbet)
    assert "Önbellek anahtarı model adını da içerir: bu sürümden önce saklanan cevaplar bir kez yeniden sorulur." in bolum
    # Düşünme bloğu atılır: düşüncedeki "Cevap B" harf sayılmaz, saklanmaz; ondan sonra cevap yoksa soru cevapsızdır.
    assert "Düşünme bloğu (`<think>…</think>`) cevaptan atılır; ondan sonra cevap yazılmamışsa soru cevapsız sayılır." in bolum
    soru = meb.Soru(kimlik="mmlu:x:2", kaynak="turkishmmlu", ders="Coğrafya", soru="Başkent hangisidir?",
                    secenekler=["İzmir", "Ankara", "Bursa", "Konya"], cevap=1)
    for ad, icerik, saklanan, beklenen in (  # beklenen: (cevapsız, doğruluk)
        ("bos", "<think>Cevap B olabilir mi?</think>", "", (1, 0.0)),
        ("sablon-bos", "Cevap B olabilir mi?</think>\n", "", (1, 0.0)),  # şablonun açtığı düşünme kapanmış, cevap yok
        ("cevapli", "<think>Cevap A olabilir mi?</think>\nB", "B", (0, 1.0)),
    ):
        sonuc = kiyas.kiyasla(_sohbet_sunucusu(icerik, "stop"), MetinAyarlari(model="m"), [soru], tmp_path / ad, yaz=lambda _: None)
        assert (sonuc["cevapsiz"], sonuc["dogruluk_uretim"]) == beklenen, ad
        kayit = json.loads((tmp_path / ad / f"{kiyas._dosya_adi('m')}.jsonl").read_text(encoding="utf-8"))
        assert (kayit["cevap"], kayit["secim"]) == (saklanan, None if beklenen[0] else 1), ad
    s = meb.Soru(kimlik="mmlu:x:1", kaynak="turkishmmlu", ders="Tarih", soru="Hangisi?", secenekler=["A", "B"], cevap=0)
    assert kiyas._soru_anahtari(s, MetinAyarlari(model="a")) != kiyas._soru_anahtari(s, MetinAyarlari(model="b"))
    varsayilan = MetinAyarlari().en_fazla_token
    assert f"Cevabı `[moduller.metin] en_fazla_token`'da (varsayılan {varsayilan}) kesilen soru" in bolum
    assert "en_fazla_token ({ayar.en_fazla_token}) sınırında kesildi (model çoğu kez" in inspect.getsource(komutlar.komut_modul_kiyas)


# ---- kenardakiler silinirken ölen --uzerine-yaz; yeniden eğitilen aşamanın modeli -------------------------


def _asama_dosyalari(klasor: Path) -> dict[str, bytes]:
    return {p.name: p.read_bytes() for p in sorted(klasor.iterdir()) if p.is_file()}


def test_kenardakiler_silinirken_olen_uzerine_yaz_belgelendigi_gibi(tmp_path, monkeypatch, capsys):
    bolum = _duz(_bolum(README, "6. Eğitim"))
    assert (
        "Süreç eski dosyaları silerken öldürülürse model (`en_iyi.pt.eski`) `son.pt.eski`'den sonra silindiği için "
        'kalabilir; `durum` onu da "eski eğitim kenarda" diye gösterir. Bitmiş eski eğitimi `egit --devam` modeliyle '
        "geri getirir; bitmemiş olanın `son.pt`'si silinmiştir, sürdürülemez."
    ) in bolum
    assert "geri getirdiği eğitim bitmişse `--devam` ayarları karşılaştırmaz: `son.pt`'si silinmiş olsa da" in bolum
    # Silme sırası: son.pt.eski modelden (en_iyi.pt.eski) önce gider.
    klasor = tmp_path / "tdk"
    klasor.mkdir()
    for ad in ("durum.json", "gunluk.jsonl", "en_iyi.pt", "son.pt"):
        (klasor / f"{ad}.eski").write_bytes(f"eski {ad}".encode())
    silinenler: list[str] = []
    asil_sil = Path.unlink
    with monkeypatch.context() as m:
        m.setattr(Path, "unlink", lambda yol, *a, **k: (silinenler.append(yol.name), asil_sil(yol, *a, **k))[1])
        egitim._eskileri_sil(klasor)
    assert silinenler.index("son.pt.eski") < silinenler.index("en_iyi.pt.eski")
    # İlk silmeden sonra öldürülmüş: model, durum ve günlük kenarda; yeni koşunun yarım durum/günlük dosyaları canlı.
    for ad in ("durum.json", "gunluk.jsonl", "en_iyi.pt"):
        (klasor / f"{ad}.eski").write_bytes(f"eski {ad}".encode())
    (klasor / "durum.json").write_text('{"durum": "suruyor", "adim": 1}', encoding="utf-8")
    (klasor / "gunluk.jsonl").write_text("{}\n", encoding="utf-8")
    assert egitim._yarim_uzerine_yazmayi_toparla(klasor)
    assert _asama_dosyalari(klasor) == {ad: f"eski {ad}".encode() for ad in ("durum.json", "en_iyi.pt", "gunluk.jsonl")}
    # Geri gelen bitmiş eğitimin son.pt'si yok: --devam "zaten bitmiş" kararını son.pt'ye bakmadan verir.
    kaynak = inspect.getsource(egitim._egit)
    assert kaynak.index("if devam and geri_getirildi:") < kaynak.index("if devam and not son_yol.exists():")
    # durum, başka bir deneyin son.pt'si silinmiş bitmemiş eski eğitimine --devam önermez.
    durum = _duz(_bolum(README, "Adım adım"))
    assert (
        "Kenarda kalmış eski eğitimler de burada listelenir; bitmemiş ve `son.pt`'si silinmiş olan \"sürdürülemez\" "
        "notunu alır"
    ) in durum
    ayar = tmp_path / "ayarlar.toml"
    ayar.write_text(TEST_AYARLARI, encoding="utf-8")
    diger = tmp_path / "ciktilar" / "deneyler" / "diger" / "tdk"
    diger.mkdir(parents=True)
    (diger / "en_iyi.pt.eski").write_bytes(b"eski model")
    (diger / "durum.json.eski").write_text(json.dumps({"durum": "suruyor", "adim": 8, "toplam_adim": 12}), encoding="utf-8")
    (diger / "durum.json").write_text(json.dumps({"durum": "suruyor", "adim": 1, "toplam_adim": 12}), encoding="utf-8")
    satir = "  diger / tdk: yarıda kalan --uzerine-yaz; eski eğitim kenarda (adım 8/12)"
    assert cli.main(["durum", "--ayarlar", str(ayar)]) == 0
    assert f"{satir}; bitmedi ve son.pt yok, sürdürülemez" in capsys.readouterr().out.splitlines()
    (diger / "son.pt.eski").write_bytes(b"eski son")  # son.pt kenardaysa sürdürülebilir
    assert cli.main(["durum", "--ayarlar", str(ayar)]) == 0
    devam = f"{satir} → egit --asama tdk --devam --deney diger --ayarlar {cli._tirnak(str(ayar))}"
    assert devam in capsys.readouterr().out.splitlines()


def test_yeniden_egitilen_asamanin_modelini_isteyen_komut_bunu_soyler(tmp_path, tok, capsys):
    bolum = _duz(_bolum(README, "6. Eğitim"))
    assert (
        "Aşamayı başka bir süreç eğitirken `.eski` dosyalarına dokunulmaz; o aşamanın modelini isteyen komut (`--model` "
        "ile verilen `en_iyi.pt` ya da `son.pt` de) aşamanın yeniden eğitildiğini söyleyip 2 koduyla çıkar."
    ) in bolum
    ayar = tmp_path / "ayarlar.toml"
    ayar.write_text(TEST_AYARLARI, encoding="utf-8")
    ayarlar = ayarlari_yukle(ayar)
    tok.kaydet(egitim.tokenizer_klasoru(ayarlar))
    klasor = ayarlar.deney_klasoru / "tdk"
    klasor.mkdir(parents=True)
    for ad in ("durum.json", "en_iyi.pt", "son.pt"):
        (klasor / f"{ad}.eski").write_bytes(b"eski")
    with egitim.egitim_kilidi(klasor):  # başka bir süreç bu aşamayı --uzerine-yaz ile eğitiyor: kilit tutuluyor
        kenarda = _asama_dosyalari(klasor)
        for argv in (
            ["uret", "kitap"],
            ["uret", "kitap", "--model", str(klasor / "en_iyi.pt")],
            ["tanimla", "kitap", "--model", str(klasor / "son.pt")],
        ):
            assert cli.main([*argv, "--ayarlar", str(ayar), "--cihaz", "cpu"]) == 2, argv
            hata = capsys.readouterr().err
            assert f"{klasor} şu an başka bir süreçte --uzerine-yaz ile yeniden eğitiliyor" in hata, argv
            assert "Model dosyası yok" not in hata, argv
        assert _asama_dosyalari(klasor) == kenarda  # kenardakiler süren eğitimindir: yerinde kalır
    # degerlendir --model de varsayılan yoldaki gibi sorar.
    assert "yeniden_egitiliyor_notu(yol.parent)" in inspect.getsource(egitim.degerlendir)


# ---- MEB soruları: --klasor'lu ipuçları, meb-mmlu notu; tohum ----------------------------------------------


def test_taranmis_pdf_uyarisi_ve_reddi_ayni_klasoru_okutur(tmp_path, capsys):
    bolum = _duz(_bolum(README, "3. MEB soruları"))
    assert "İki durumda da yazılan komut çağrının `--klasor`, `--ayarlar`, `--ayar` ve `--deney` seçeneklerini taşır." in bolum
    klasor = _taranmis_pdf(tmp_path / "eski kitaplar" / "a.pdf").parent
    hedef = tmp_path / "veri" / "meb" / "meb_pdf.jsonl"
    soru = meb.Soru(
        kimlik="pdf:b.pdf:111:tarih-1:1", kaynak="meb-pdf", ders="Tarih - 1", soru="Hangisi bir başkenttir?",
        secenekler=["Ankara", "Deniz", "Hava", "Uzay"], cevap=0, bolum="egitim", ek={"dosya": "b.pdf"},
    )
    meb.soru_yaz([soru], hedef)
    once = hedef.read_bytes()
    ayar = tmp_path / "ayarlar.toml"
    ayar.write_text(AYAR_DOSYASI, encoding="utf-8")
    argv = ["meb-pdf", "--klasor", str(klasor), "--ayarlar", str(ayar), "--ayar", "moduller.ocr.dpi=200", "--deney", "d"]
    assert cli.main(argv) == 2  # hiç soru bulunamadı: önceki çıktı silinmesin diye durur
    cikti = capsys.readouterr()
    uyari, ret = cikti.out.strip().splitlines()[-1], cikti.err.strip().splitlines()[-1]
    assert "taranmış (resim) bir PDF olabilir" in uyari and hedef.read_bytes() == once
    for satir in (uyari, ret):  # yapıştırılan komut aynı klasörü aynı ayarlarla OCR ile okur
        yeni = cli.ayristirici().parse_args(shlex.split(satir.split("OCR ile okumak için: python -m turkce_model ")[1]))
        assert (yeni.komut, yeni.ocr, yeni.klasor, yeni.ayarlar, yeni.ayar, yeni.deney) == (
            "meb-pdf", "gerekirse", str(klasor), str(ayar), ["moduller.ocr.dpi=200"], "d"
        )


def test_meb_mmlu_notu_komutlari_sirayla_yazar(tmp_path, monkeypatch, capsys):
    bolum = _duz(_bolum(README, "3. MEB soruları"))
    assert (
        "`meb-mmlu` bu durumda bu komutları OCR kipiyle ve çağrının `--ayarlar`, `--ayar`, `--deney` seçenekleriyle "
        "sırayla yazar."
    ) in bolum
    monkeypatch.setattr(meb, "mmlu_indir", lambda yol, yaz=print: [])  # ağa çıkılmaz
    ayar = tmp_path / "ek ayar.toml"
    ayar.write_text(AYAR_DOSYASI, encoding="utf-8")
    hedef = tmp_path / "veri" / "meb" / "meb_pdf.jsonl"
    hedef.parent.mkdir(parents=True)
    hedef.write_text("", encoding="utf-8")
    model = tmp_path / "ciktilar" / "deneyler" / "d" / "meb" / "en_iyi.pt"
    model.parent.mkdir(parents=True)
    model.write_bytes(b"")
    for kip, deney, beklenen in (
        ("hepsi", "d", ["meb-pdf --ocr hepsi", "veri-hazirla", "egit --asama meb --uzerine-yaz"]),
        ("gerekirse", "yok", ["meb-pdf --ocr", "veri-hazirla"]),  # bu deneyde MEB modeli yok
        (None, "d", ["meb-pdf", "veri-hazirla", "egit --asama meb --uzerine-yaz"]),
    ):
        hedef.with_suffix(".rapor.json").write_text(json.dumps({"ocr": kip}), encoding="utf-8")
        argv = ["meb-mmlu", "--ayarlar", str(ayar), "--ayar", "moduller.ocr.dpi=200", "--deney", deney]
        assert cli.main(argv) == 0
        ek = cli._komut_eki(cli.ayristirici().parse_args(argv))
        satirlar = capsys.readouterr().out.splitlines()
        i = next(i for i, s in enumerate(satirlar) if s.startswith("Not: meb_pdf.jsonl bundan önce üretilmiş."))
        assert satirlar[i + 1 :] == [f"  python -m turkce_model {k}{ek}" for k in beklenen], kip


def test_egitim_tohumunun_araligi_belgelendigi_gibi(tmp_path, capsys):
    bolum = _duz(_bolum(README, "5. Gömme kararları"))
    assert "`tohum` 0 ile 2⁶³ − 1 arasında bir tam sayı olmalıdır" in bolum
    assert EN_BUYUK_EGITIM_TOHUMU == 2**63 - 1
    for deger in (0, 2**63 - 1):
        egitimi_dogrula(replace(Ayarlar().tdk, tohum=deger), "tdk")
    for deger in (-1, 2**63, 1.5, True, "7"):
        with pytest.raises(AyarHatasi, match=r"egitim\.meb\.tohum 0 ile 9223372036854775807 arasında bir tam sayı"):
            egitimi_dogrula(replace(Ayarlar().meb, tohum=deger), "meb")
    ayar = tmp_path / "ayarlar.toml"
    ayar.write_text(TEST_AYARLARI, encoding="utf-8")
    assert cli.main(["hesapla", "--ayarlar", str(ayar), "--ayar", "egitim.meb.tohum=-1"]) == 2  # iki aşamayı denetler
    assert "egitim.meb.tohum 0 ile 9223372036854775807 arasında bir tam sayı olmalı (şu an: -1)" in capsys.readouterr().err


# ---- DeepSeek modülleri: iletilerdeki ayar dosyası, açılamayan PDF, kapanış satırı, sor --resim, kıyas -----


def _yanit(kod: int, veri: dict) -> SimpleNamespace:
    """``requests`` cevabının istemcinin kullandığı kısmı."""
    return SimpleNamespace(status_code=kod, json=lambda: veri, text=json.dumps(veri), headers={})


def test_modul_iletileri_ayar_dosyasini_ve_secenekleri_anar(tmp_path, monkeypatch, capsys):
    requests = pytest.importorskip("requests")
    bolum = _duz(_bolum(README, "Modülleri kurmak"))
    assert (
        "`modul-liste`, `modul-dene`, `modul-kiyas`, `ocr`, `meb-pdf --ocr` ve `sor --resim` komutlarının iletileri ayar "
        "dosyası olarak `--ayarlar` ile verdiğin dosyanın adını anar; yazdıkları komutlar (ör. `modul-liste`) çağrının "
        "`--ayarlar`, `--ayar` ve `--deney` seçeneklerini taşır."
    ) in bolum
    ayar = tmp_path / "ek ayar.toml"
    ayar.write_text(AYAR_DOSYASI, encoding="utf-8")  # modüller kapalı
    _taranmis_pdf(tmp_path / "veri" / "meb" / "pdf" / "a.pdf")  # meb-pdf --ocr'ın modele okutacağı kitapçık
    foto = tmp_path / "soru.png"
    foto.write_bytes(b"\x89PNG-sahte-foto")
    ocr_okuyanlar = (["meb-pdf", "--ocr"], ["sor", "--resim", str(foto)])  # ikisi de sunucuya sayfa/foto gönderir
    for argv, rol in (
        (["modul-dene"], "ocr"), (["modul-kiyas"], "metin"), (["ocr", "sayfa.png"], "ocr"), *((a, "ocr") for a in ocr_okuyanlar)
    ):
        assert cli.main([*argv, "--ayarlar", str(ayar)]) == 2, argv
        assert f"ek ayar.toml'da [moduller.{rol}] model = " in capsys.readouterr().err, argv
    # Sunucu "model yok" der: ipucundaki modul-liste komutu çağrının seçeneklerini taşır.
    yok = _yanit(404, {"error": {"message": "model 'deepseek-r1:1.5b' not found"}})
    monkeypatch.setattr(requests.Session, "request", lambda *_, **__: yok)
    for argv in (
        ["modul-dene", "metin", "--ayar", "moduller.metin.model=deepseek-r1:1.5b"],
        *([*a, "--ayar", "moduller.ocr.model=deepseek-ocr"] for a in ocr_okuyanlar),
    ):
        argv = [*argv, "--ayarlar", str(ayar), "--deney", "d"]
        assert cli.main(argv) == 2, argv
        ek = cli._komut_eki(cli.ayristirici().parse_args(argv))
        hata = capsys.readouterr().err.strip()
        assert hata.endswith(f"Sunucudaki modelleri görmek için: python -m turkce_model modul-liste{ek}"), argv

    def ulasilamaz(*_, **__):
        raise requests.exceptions.ConnectionError("bağlantı reddedildi")

    monkeypatch.setattr(requests.Session, "request", ulasilamaz)
    assert cli.main(["modul-liste", "--ayarlar", str(ayar)]) == 0  # modul-liste sunucunun durumunu yazar, durmaz
    assert "Başka bir sunucu kullanıyorsan ek ayar.toml'da [moduller] adres değerini düzelt." in capsys.readouterr().out
    for argv in ocr_okuyanlar:
        assert cli.main([*argv, "--ayarlar", str(ayar), "--ayar", "moduller.ocr.model=deepseek-ocr"]) == 2, argv
        assert "ek ayar.toml'da [moduller] adres değerini düzelt" in _duz(capsys.readouterr().err), argv
    assert not (tmp_path / "veri" / "meb" / "meb_pdf.jsonl").exists()  # meb-pdf --ocr hiçbir şey yazmadan durdu


class _SiraliOcrSunucusu:
    """``OcrModulu``'nün kullandığı tek yöntem: görüntü istekleri sırayla ``sayfalar``ı alır."""

    def __init__(self, sayfalar: list[str]) -> None:
        self.sayfalar, self.istek, self.son_bitis = sayfalar, 0, "stop"

    def gorselden_metin(self, *_, **__) -> str:
        self.istek += 1
        return self.sayfalar[(self.istek - 1) % len(self.sayfalar)]


class _SayfaOcrSunucusu:
    """``OcrModulu``'nün kullandığı tek yöntem: her farklı sayfa görüntüsü ilk görüldüğü sırayla ``sayfalar``'dan birini
    alır; aynı görüntü hep aynı metni (yeniden okuma aynı soruları bulur)."""

    def __init__(self, sayfalar: list[str]) -> None:
        self.sayfalar, self.okunan, self.son_bitis = sayfalar, {}, "stop"

    def gorselden_metin(self, _model, _istem, gorsel: bytes, *_, **__) -> str:
        if gorsel not in self.okunan:
            self.okunan[gorsel] = self.sayfalar[len(self.okunan) % len(self.sayfalar)]
        return self.okunan[gorsel]


def test_ocr_acilamayan_pdfi_atlar_sunucu_hatasinda_durur(tmp_path):
    pymupdf = pytest.importorskip("pymupdf")
    bolum = _duz(_bolum(README, "OCR modülü"))
    assert (
        "Sunucuya ulaşılamazsa, model yoksa ya da modül kapalıysa `meb-pdf --ocr` kendi iletisiyle durur ve "
        "`meb_pdf.jsonl`'e dokunmaz. Açılamayan bir PDF (bozuk, boş ya da parolalı) ise `--ocr hepsi` ile de atlanır ve "
        'özet satırında "okunamadı" diye sayılır; öbür kitapçıklar okunur.'
    ) in bolum
    klasor = tmp_path / "pdf"
    _taranmis_pdf(klasor / "iyi.pdf", 2)
    (klasor / "bozuk.pdf").write_bytes(b"bozuk")
    (klasor / "bos.pdf").write_bytes(b"")
    _taranmis_pdf(klasor / "parolali.pdf", encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="gizli", owner_pw="sahip")
    sunucu = _SiraliOcrSunucusu(
        ["(111) TARİH - 1\n\n" + _ocr_sorusu(1) + "\n\n" + _ocr_sorusu(2), "CEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1. A\n2. B"]
    )
    ayristirici = meb_metin.ocr_ayristirici(ocr.OcrModulu(sunucu, OcrAyarlari(model="m"), None), "hepsi")
    hedef = tmp_path / "meb_pdf.jsonl"
    satirlar: list[str] = []
    rapor = meb.pdf_klasoru_ayristir(klasor, hedef, yaz=satirlar.append, ayristirici=ayristirici)
    hatalar = {ad: r["hata"].split(":")[0] for ad, r in rapor["dosyalar"].items() if "hata" in r}
    assert hatalar == dict.fromkeys(("bos.pdf", "bozuk.pdf", "parolali.pdf"), "PdfOkunamadi")
    assert (rapor["yazilan"], sunucu.istek) == (2, 2)  # açılamayan dosya için sunucuya istek gitmez
    assert any(s.startswith("4 PDF (3 okunamadı): 2 soru bulundu, 2 tutuldu") for s in satirlar)
    # Sunucu ya da model hatası her dosyada yinelenir: okuma durur, önceki çıktıya dokunulmaz.
    once = hedef.read_bytes()

    def sunucu_kapali(*_, **__):
        raise ModulHatasi("Yerel model sunucusuna ulaşılamadı (http://localhost:11434/v1).")

    with pytest.raises(ModulHatasi, match="ulaşılamadı"):
        meb.pdf_klasoru_ayristir(klasor, hedef, yaz=lambda _: None, ayristirici=sunucu_kapali)
    assert hedef.read_bytes() == once


def _ocr_ayikla(*sayfalar: str) -> dict[int, meb.Soru]:
    sorular, _ = meb_metin.metinden_ayristir(list(sayfalar), "k.pdf", yaz=lambda _: None)
    return {int(s.ek["soru_no"]): s for s in sorular}


def test_ocr_kapanis_satiri_belgelendigi_gibi():
    bolum = _duz(_bolum(README, "OCR modülü"))
    m = re.search(r"Testin sonundaki kapanış satırı \((.*?) gibi\) son seçeneğe eklenmez\.", bolum)
    ornekler = re.findall(r'"([^"]+)"', m.group(1)) if m else []
    assert len(ornekler) == 3 and "," in ornekler[-1]  # sonuncusu virgülle bağlanmış iki kapanış cümlesi
    anahtar = "CEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1. A\n2. B"
    for son in ornekler:
        sorular = _ocr_ayikla("(111) TARİH - 1\n\n" + _ocr_sorusu(1) + "\n\n" + _ocr_sorusu(2) + "\n\n" + son, anahtar)
        assert [s.secenekler for s in sorular.values()] == [["Bir", "İki", "Üç", "Dört"]] * 2, son
    # Satırın tamamı kapanış değilse; büyük harfle yazılmamışsa kökte ve ortak metinde metin olarak kalır.
    assert '"Sınav bitti, sonuçlar…" gibi bir satır metin olarak kalır.' in bolum
    assert (
        'Büyük harfle yazılmamış kapanış cümlesi soru kökünde ve ortak metinde ("2 - 3. soruları … cevaplayınız.") de '
        "metin olarak kalır. Seçeneğin hemen altında, sayfa başında ya da boş satırsız metinde yazılmışsa ardından aynı "
        "dersin başka sorusunun gelip gelmediğine bakılır: gelmiyorsa (dersin ya da kitapçığın sonu) kapanıştır, "
        "geliyorsa seçeneğin devamıdır"
    ) in bolum
    karisik = [o for o in ornekler if not meb._buyuk_harfli(o)]
    assert len(karisik) == 2
    duygular = ["Sevinç", "Korku", "Öfke", "Şaşkınlık"]
    for satir in karisik:
        for ayrac in ("\n", "\n\n"):  # kökün satırları bitişik ya da boş satırla ayrılmış (paragraf başı)
            kok = ["Öğretmen sınavın sonunda öğrencilere şöyle dedi:", satir, "Bu cümlede hangi duygu vardır?"]
            sorular = _ocr_ayikla(
                "(111) TARİH - 1\n\n" + _ocr_sorusu(1) + "\n\n2. " + ayrac.join(kok) + "\n\n"
                + "\n".join(f"{h}) {s}" for h, s in zip("ABCD", duygular)) + "\n\n" + _ocr_sorusu(3),
                "CEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1. A\n2. B\n3. C",
            )
            assert (" ".join(sorular[2].soru.split()), sorular[2].secenekler) == (" ".join(kok), duygular), (satir, ayrac)
    for satir in ("Sınav bitti, sonuçlar bir hafta sonra açıklandı.", *karisik):
        # İkinci parça: cümle paragraf başında ve parçada seçenek işareti ("A)") geçiyor; yine kapanış sayılmaz.
        for ilk, ayrac in (("Ayşe bütün dönem düzenli çalıştı.", "\n"), ("Ayşe testte hep A) şıkkını işaretledi.", "\n\n")):
            parca = [ilk, satir, "Ayşe ödül kazandı."]
            sorular = _ocr_ayikla(
                "(111) TARİH - 1\n\n" + _ocr_sorusu(1) + "\n\n2 - 3. soruları aşağıdaki metne göre cevaplayınız.\n\n"
                + ayrac.join(parca) + "\n\n" + _ocr_sorusu(2) + "\n\n" + _ocr_sorusu(3),
                "CEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1. A\n2. B\n3. C",
            )
            assert all(" ".join(parca) in " ".join(sorular[n].soru.split()) for n in (2, 3)), (satir, ilk)
    # Seçeneğin hemen altında (boş satır bırakmadan), metinde boş satır olsa da olmasa da: ardından dersin başka sorusu
    # gelmiyorsa kapanıştır. Kitapçığın sonu (anahtardan önce) ve dersin sonu (başka bir dersin başlığından önce).
    buyuk_harfli = buyuk(karisik[0])
    assert not meb._SINAV_SONU.match(buyuk_harfli)  # PDF yolunun büyük harfli kuralı ("TEST BİTTİ.") kapatmasın
    cografya = "(222) COĞRAFYA - 1\n\n" + _ocr_sorusu(1)
    iki_ders = "CEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1. A\n2. B\n\n(222) COĞRAFYA - 1\n\n1. C"
    for son in (*ornekler, buyuk_harfli):
        for bosluklu in (True, False):
            for ders_sonu in (False, True):
                tarih = "(111) TARİH - 1\n\n" + _ocr_sorusu(1) + "\n\n" + _ocr_sorusu(2) + "\n" + son
                sayfalar = [tarih, cografya, iki_ders] if ders_sonu else [tarih, anahtar]
                if not bosluklu:
                    sayfalar = [s.replace("\n\n", "\n") for s in sayfalar]
                sorular, _ = meb_metin.metinden_ayristir(sayfalar, "k.pdf", yaz=lambda _: None)  # iki dersin 1. sorusu var
                assert [s.secenekler[-1] for s in sorular] == ["Dört"] * (2 + ders_sonu), (son, bosluklu, ders_sonu)
    # Ardından dersin başka sorusu geliyorsa seçeneğin devamıdır: README'nin örneği sayfa sonunda ve sonraki sayfanın
    # başında, aynı sayfada (seçeneğin hemen altında) ve boş satırsız metinde. Kitapçığın sonunda aynı satır kapanıştır.
    m = re.search(r'seçeneğin devamıdır \(sayfa sonunda "… (\w+)", sonraki sayfanın başında "(\w+)"\)', bolum)
    assert m and meb_metin._SINAV_SONU_OCR.match(m.group(2))  # örnekteki devam satırı tek başına bir kapanış sözüdür
    uzun = ["Moral bozuldu", "Savaş uzadı", "Halk küstü", f"Ordunun ardından gelen {m.group(1)}"]
    soru2 = "2. Bu zaferin sonucu hangisidir?\n\n" + "\n".join(f"{h}) {s}" for h, s in zip("ABCD", uzun))
    ilk = "(111) TARİH - 1\n\n" + _ocr_sorusu(1) + "\n\n" + soru2
    anahtar3 = "CEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1. A\n2. B\n3. C"
    devam = f"{uzun[-1]} {m.group(2)}"
    for ad, sayfalar, son_secenek in (
        ("sayfa-asan", [ilk + "\n\n2", f"{m.group(2)}\n\n{_ocr_sorusu(3)}\n\n3", anahtar3], devam),
        ("ayni-sayfa", [f"{ilk}\n{m.group(2)}\n\n{_ocr_sorusu(3)}", anahtar3], devam),
        ("bos-satirsiz", [f"{ilk}\n{m.group(2)}\n{_ocr_sorusu(3)}".replace("\n\n", "\n"), anahtar3.replace("\n\n", "\n")], devam),
        ("kitapcik-sonu", [f"{ilk}\n{m.group(2)}", anahtar], uzun[-1]),
    ):
        sorular = _ocr_ayikla(*sayfalar)
        assert sorular[2].secenekler[-1] == son_secenek, ad
        assert all(s.secenekler == ["Bir", "İki", "Üç", "Dört"] for n, s in sorular.items() if n != 2), ad


def test_zaman_asimi_ust_siniri_belgelendigi_gibi():
    bolum = _duz(_bolum(README, "OCR modülü"))
    assert "En çok 604800 sn (bir hafta) verilebilir; daha büyük değer ayarlar okunurken reddedilir." in bolum
    assert EN_BUYUK_ZAMAN_ASIMI == 604800 == 7 * 24 * 3600
    yuklu = ayarlari_yukle(PROJE / "ayarlar.toml", ["moduller.zaman_asimi=604800"])
    assert yuklu.moduller.zaman_asimi == 604800
    for deger in ("604801", "1e10"):
        with pytest.raises(AyarHatasi, match=r"en çok 604800 \(bir hafta\)"):
            ayarlari_yukle(PROJE / "ayarlar.toml", [f"moduller.zaman_asimi={deger}"])


_FOTO_SORUSU = "Aşağıdakilerden hangisi bir başkenttir?\nA) İzmir\nB) Ankara\nC) Bursa\nD) Konya"


@pytest.mark.parametrize(
    "metin",
    [
        pytest.param("AÇIK ÖĞRETİM LİSESİ\n(111) TARİH - 1\n12\n7) " + _FOTO_SORUSU + "\n\n8) Hangisi?", id="baslik-7)"),
        pytest.param("C) Murat\nD) Selim\n\n7. " + _FOTO_SORUSU + "\n\n8) Hangisi?", id="onceki-secenekler-7."),
        pytest.param("7) " + _FOTO_SORUSU + "\n\n8. Hangisi?", id="7)-sonra-8."),
    ],
)
def test_sor_resim_soru_numarasi_ve_sayfa_basligi_belgelendigi_gibi(monkeypatch, metin):
    bolum = _duz(_bolum(README, "OCR modülü"))
    assert (
        'Soru numarası "7." ya da "7)" olabilir. Numaradan önce yalnız büyük harfli sayfa başlığı ve sayfa numarası ya '
        'da önceki sorunun seçenekleri varsa bu satırlar okunmaz; seçeneklerden sonra başlayan soru ("8. …" ya da '
        '"8) …") son seçeneğe eklenmez.'
    ) in bolum
    sahte = SimpleNamespace(ayar=OcrAyarlari(model="m"), dosya_oku=lambda *_: [metin])
    monkeypatch.setattr(ocr, "ocr_modulu", lambda *_, **__: sahte)
    soru = komutlar.resimden_soru("soru.png", None)
    assert (soru.soru, soru.secenekler) == ("Aşağıdakilerden hangisi bir başkenttir?", ["İzmir", "Ankara", "Bursa", "Konya"])
    # Yalnız büyük harfli başlık atlanır: karışık harfli satır kökte kalır.
    assert meb_metin.tek_soru("Açık Öğretim Lisesi\n\n7) " + _FOTO_SORUSU).soru.startswith("Açık Öğretim Lisesi")


_FOTO_ONCULLER = "\n1) Ankara\n2) Bursa\nA) Yalnız 1\nB) Yalnız 2\nC) 1 ve 2\nD) Hiçbiri"
_FOTO_ONCULLU_KOK = "Aşağıdakilerden hangileri bir başkenttir? 1) Ankara 2) Bursa"


@pytest.mark.parametrize(
    ("metin", "kok"),
    [
        # Önceki seçeneklerden sonra numarasız kök ve öncüller: aradaki sayfa numarası ya da büyük harfli başlık okunmaz.
        pytest.param("C) Murat\nD) Selim\n12\nAşağıdakilerden hangileri bir başkenttir?" + _FOTO_ONCULLER,
                     _FOTO_ONCULLU_KOK, id="oncullu-kok-sayfa-numarasi"),
        pytest.param("C) Murat\nD) Selim\nAÇIK ÖĞRETİM LİSESİ\nAşağıdakilerden hangileri bir başkenttir?" + _FOTO_ONCULLER,
                     _FOTO_ONCULLU_KOK, id="oncullu-kok-baslik"),
        # Önceki seçeneklerle numara arasında yalnız sayfa numarası: okunmaz, numara sorunun numarasıdır ve atılır (kök
        # sonraki numarayla sürer: "19. yüzyılda").
        pytest.param("C) Murat\nD) Selim\n12\n18. Aşağıdakilerden hangisi\n19. yüzyılda kurulmuş bir başkenttir?\n"
                     + _FOTO_SORUSU.split("\n", 1)[1], "Aşağıdakilerden hangisi 19. yüzyılda kurulmuş bir başkenttir?",
                     id="sayfa-numarasi-ve-sayiyla-suren-kok"),
    ],
)
def test_sor_resim_onceki_seceneklerden_sonraki_kok_belgelendigi_gibi(metin, kok):
    bolum = _duz(_bolum(README, "OCR modülü"))
    assert "Numaradan önce yalnız büyük harfli sayfa başlığı ve sayfa numarası ya da önceki sorunun seçenekleri varsa bu satırlar okunmaz" in bolum
    assert (
        'Önceki sorunun seçeneklerinden sonra numarasız kök ve "1) …", "2) …" öncülleri gelirse soru kökle başlar; '
        "aradaki büyük harfli sayfa başlığı ve sayfa numarası okunmaz."
    ) in bolum
    soru = meb_metin.tek_soru(metin)
    assert soru.soru == kok
    assert soru.secenekler == (["Yalnız 1", "Yalnız 2", "1 ve 2", "Hiçbiri"] if "1) Ankara" in metin else ["İzmir", "Ankara", "Bursa", "Konya"])


def _sohbet_sunucusu(icerik: str, bitis: str, istekler: list | None = None) -> YerelSunucu:
    """Gerçek ``YerelSunucu``; oturumu her isteğe aynı cevabı döndürür (ağa çıkılmaz). ``istekler`` verilirse her
    isteğin gövdesi ona eklenir."""
    veri = {"choices": [{"message": {"role": "assistant", "content": icerik}, "finish_reason": bitis}]}

    def istek(*_, **kw):
        if istekler is not None:
            istekler.append(kw.get("json"))
        return _yanit(200, veri)

    return YerelSunucu("http://127.0.0.1:9/v1", oturum=SimpleNamespace(request=istek))


def test_kiyas_olumsuz_harf_ve_dusunurken_kesilen_cevap_belgelendigi_gibi(tmp_path, monkeypatch, capsys):
    bolum = _duz(_bolum(README, "Kıyas modülü"))
    m = re.search(r'Olumsuzlanan harf \((.*?)\) cevap sayılmaz; başka bir harf onaylanmışsa o alınır \("(.+?)" → ([A-E])\)\.', bolum)
    assert m
    olumsuzlar = re.findall(r'"([^"]+)"', m.group(1))
    assert len(olumsuzlar) == 2 and all(kiyas.cevap_cikar(o, 4) is None for o in olumsuzlar)
    assert kiyas.cevap_cikar(m.group(2), 4) == "ABCD".index(m.group(3))
    # Düşünürken kesilen cevap (kapanan </think> yok) cevapsızdır; şablon düşünmeyi açtıysa içerikte <think> da yoktur.
    assert (
        "kesilen soru, cevapta kapanan bir düşünme bloğu (`</think>`) yoksa cevapsız sayılır: model düşünürken "
        "kesilmiştir, metindeki harf cevap değildir. Sunucunun sohbet şablonu düşünmeyi kendisi açtığında (cevapta "
        "`<think>` görünmez) da böyledir."
    ) in bolum
    sorular = [
        meb.Soru(kimlik=f"mmlu:x:{i}", kaynak="turkishmmlu", ders="Coğrafya", soru=f"{i}. Başkent hangisidir?",
                 secenekler=["İzmir", "Ankara", "Bursa", "Konya"], cevap=1)
        for i in range(3)
    ]
    ayar = MetinAyarlari(model="m")
    for ad, icerik, bitis, beklenen in (  # (cevapsız, kesik, doğruluk)
        ("sablon", "Soruyu düşünüyorum. Cevap B olabilir mi?", "length", (3, 3, 0.0)),
        ("etiketli", "<think>Soruyu düşünüyorum. Cevap B olabilir mi?", "length", (3, 3, 0.0)),
        ("bitmis", "Cevap B olabilir mi?</think>B", "length", (0, 0, 1.0)),
        ("tam", "B", "stop", (0, 0, 1.0)),
    ):
        sonuc = kiyas.kiyasla(_sohbet_sunucusu(icerik, bitis), ayar, sorular, tmp_path / ad, yaz=lambda _: None)
        assert (sonuc["cevapsiz"], sonuc["kesik"], sonuc["dogruluk_uretim"]) == beklenen, ad
    # Önbellekten yeniden okunurken de aynı kural (yeni istek gitmez).
    istekler: list = []
    sonuc = kiyas.kiyasla(_sohbet_sunucusu("A", "stop", istekler), ayar, sorular, tmp_path / "sablon", yaz=lambda _: None)
    assert (sonuc["cevapsiz"], sonuc["kesik"], len(istekler)) == (3, 3, 0)
    # Bu bilgiyi tutmayan eski kayıt: kesikse metni düşüncenin kendisi olabilir ("Cevap B olabilir mi?"), soru yeniden
    # sorulur ve yeni kayıt onun yerini alır; kesik değilse eskisi gibi okunur.
    assert (
        "Düşünmenin kapanıp kapanmadığını tutmayan eski bir önbellek kaydı kesikse soru yeniden sorulur; kesik değilse "
        "kayıt eskisi gibi okunur."
    ) in bolum
    eski = tmp_path / "eski" / f"{kiyas._dosya_adi('m')}.jsonl"
    eski.parent.mkdir()
    kayitlar = [
        {"anahtar": kiyas._soru_anahtari(s, ayar), "kimlik": s.kimlik, "cevap": "Cevap B olabilir mi?", "kesik": kesik}
        for s, kesik in zip(sorular[:2], (True, False))
    ]
    eski.write_text("".join(json.dumps(k, ensure_ascii=False) + "\n" for k in kayitlar), encoding="utf-8")
    sunucu = _sohbet_sunucusu("A", "stop", istekler)
    sonuc = kiyas.kiyasla(sunucu, ayar, sorular[:2], eski.parent, yaz=lambda _: None)
    # Yalnız kesik kaydın sorusu soruldu (yeni cevap A, yanlış); kesik olmayanın B'si okundu: doğruluk 1/2.
    assert (len(istekler), sonuc["cevapsiz"], sonuc["dogruluk_uretim"]) == (1, 0, 0.5)
    yeni = json.loads(eski.read_text(encoding="utf-8").splitlines()[-1])
    assert (yeni["kimlik"], yeni["cevap"], yeni["kesik"], yeni["dusunme_kapandi"]) == (sorular[0].kimlik, "A", False, False)
    sonuc = kiyas.kiyasla(sunucu, ayar, sorular[:2], eski.parent, yaz=lambda _: None)
    assert (len(istekler), sonuc["dogruluk_uretim"]) == (1, 0.5)  # ikinci çalıştırmada istek gitmez
    # modul-dene metin de aynı kuralla sınar; --adet eksi olamaz (0 = hepsi).
    assert "`modul-dene metin` de aynı kuralla sınar" in bolum
    monkeypatch.setattr(komutlar, "_sunucu", lambda *_: _sohbet_sunucusu("Soruyu düşünüyorum. Cevap B olabilir mi?", "length"))
    assert cli.main(["modul-dene", "metin", "--ayarlar", str(PROJE / "ayarlar.toml"), "--ayar", "moduller.metin.model=m"]) == 1
    assert "Sonuç: cevaptan şık harfi çıkarılamadı." in capsys.readouterr().out
    with pytest.raises(SystemExit):
        cli.ayristirici().parse_args(["modul-kiyas", "--adet", "-5"])


def test_ocr_metni_pdf_yolunun_elemelerinden_gecer():
    bolum = _duz(_bolum(README, "OCR modülü"))
    assert "PDF ayrıştırıcısının aynı kurallarından geçer: ders başlığı → soru → seçenek, cevap anahtarı, elemeler." in bolum
    assert "yabancı dil derslerini" in _duz(_bolum(README, "3. MEB soruları"))
    # Kısa kitapçık: dil satırı sarılmış başlığın ikinci satırı ve anahtar başlıkları yineler; ders yine yabancı dildir.

    def ders(baslik: str, sayfa_no: int) -> list[str]:
        ilk = "1. OTURUM\n\n" + baslik + "\n\n" + "\n\n".join(_ocr_sorusu(n) for n in range(1, 4))
        ikinci = "1. OTURUM\n\n" + "\n\n".join(_ocr_sorusu(n) for n in range(4, 7))
        return [f"{ilk}\n\n{sayfa_no}", f"{ikinci}\n\n{sayfa_no + 1}"]

    almanca = "(183) SEÇMELİ İKİNCİ YABANCI DİL\nALMANCA - 1"
    anahtar = "CEVAP ANAHTARI\n\n" + "\n\n".join(
        f"{b}\n\n" + "\n".join(f"{n}. A" for n in range(1, 7)) for b in (almanca, "(111) TARİH - 1")
    )
    sayfalar = ["AÇIK ÖĞRETİM LİSESİ\n\n1. OTURUM", *ders(almanca, 2), *ders("(111) TARİH - 1", 4), anahtar]
    sorular, rapor = meb_metin.metinden_ayristir(sayfalar, "k.pdf", yaz=lambda _: None)
    assert {s.ders for s in sorular} == {"Tarih - 1"} and rapor["elenen"] == {"yabanci_dil": 6}
    # Bütün soruları belirsiz ders: ders bulunur, soruları elenir; "soruları bulunamayan dersler" uyarısı çıkmaz.
    assert "Hangi satırın soru başı olduğu ayırt edilemezse komşu sorular elenir." in bolum
    sayfa = (
        "(111) TARİH - 1\n1. Aşağıdakilerden hangisi bir meyvedir?\nA) Elma\nB) Masa\nC) Kalem\nD) Ağacın\n"
        "2. dalındaki olgun yemiş\n2. Hangisi bir renktir?\nA) Mavi\nB) Kapı\nC) Defter\nD) Silgi"
    )
    mesajlar: list[str] = []
    sorular, _ = meb_metin.metinden_ayristir([sayfa, "CEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1. A\n2. A"], "k.pdf", yaz=mesajlar.append)
    assert not sorular and mesajlar == ["k.pdf: 1 ders, 2 soru bulundu, 0 tutuldu (elenen: secenek_eksik 2)"]


_OCR_KAPAK = "AÇIK ÖĞRETİM LİSESİ\n\n1. OTURUM\n\nAdayların dikkatine: süre 90 dakikadır."


def _basligi_yinelenen_kitapcik(*basliklar: str) -> tuple[list[meb.Soru], dict]:
    """Kapak; sonra her sayfanın başında sırayla ``basliklar`` (dersin ilk başlığı ve sonraki sayfalardaki okunuşları),
    sayfa başına iki soru (son seçenek "Dört") ve sayfa numarası; anahtarda ilk başlık ve bütün soruların cevabı."""
    sayfalar = [_OCR_KAPAK]
    for p, baslik in enumerate(basliklar):
        sorular = "\n\n".join(_ocr_sorusu(n) for n in (2 * p + 1, 2 * p + 2))
        sayfalar.append(f"1. OTURUM\n\n{baslik}\n\n{sorular}\n\n{p + 2}")
    cevaplar = "\n".join(f"{n}. A" for n in range(1, 2 * len(basliklar) + 1))
    sayfalar.append(f"CEVAP ANAHTARI\n\n{basliklar[0]}\n\n{cevaplar}")
    return meb_metin.metinden_ayristir(sayfalar, "k.pdf", yaz=lambda _: None)


def _ayni_ders_mi(*basliklar: str) -> bool:
    """Yinelenen başlıklar ilk başlığın dersi sayılıp atıldı mı? Bütün sorular tek derste, temiz seçenekle tutulur;
    yeni ders sayılan başlığın soruları (anahtarda bölümü yok) kaybolur, başlığa katılmayan satır seçeneğe yapışır."""
    sorular, rapor = _basligi_yinelenen_kitapcik(*basliklar)
    temiz = all(s.secenekler == ["Bir", "İki", "Üç", "Dört"] for s in sorular) and len({s.ders for s in sorular}) == 1
    return rapor["tutulan"] == 2 * len(basliklar) and temiz


def test_ocr_yinelenen_ders_basligi_belgelendigi_gibi():
    bolum = _duz(_bolum(README, "OCR modülü"))
    for cumle in (
        "Sayfa başında yinelenen ders başlığı atılır. Başlık, ilk satırı dersin ilk başlığındakiyle aynıysa ya da kodu "
        "aynı ve devam satırlarıyla birlikte okunan adı ona yakınsa yinelenmiş sayılır: OCR'ın harf ya da rakam farkı",
        "başka satır bölmesi ya da tek satırda okunmuş sarılı başlık. I/İ gibi harf işareti, boşluk ve noktalama farkı "
        "hiç sayılmaz.",
        "sayfaya taşan seçenek, öncül, yönerge ve parça atılmaz.",
    ):
        assert cumle in bolum, cumle
    # Düzeyi okunamamış başlık sayfa başında yinelenir: yalnız başlık atılır, altına taşan seçenekler, öncüller, yönerge
    # ve parça kalır.
    onculler = ["Yalnız I", "I ve II", "II ve III", "I, II ve III"]
    parca = "2 - 3. SORULARI AŞAĞIDAKİ METNE GÖRE CEVAPLAYINIZ.\n\nAyşe bütün dönem düzenli çalıştı."
    for baslik in ("(111) TARİH", "(111) TARİH - I"):
        for son, tasan, beklenen in (
            ("2. Bir sayının üç katı kaçtır?\n\nA) 30\nB) 31", "C) 32\nD) 33", ("Bir sayının üç katı kaçtır?", ["30", "31", "32", "33"])),
            ("2. Hangileri bir il merkezidir?\nI. MANİSA", "II. AYDIN\nIII. KONYA\n\n" + "\n".join(
                f"{h}) {s}" for h, s in zip("ABCD", onculler)), ("Hangileri bir il merkezidir? I. MANİSA II. AYDIN III. KONYA", onculler)),
            ("", f"{parca}\n\n2. Ayşe ne yaptı?\n\n" + "\n".join(f"{h}) {s}" for h, s in zip("ABCD", ("Çalıştı", "Uyudu", "Gezdi", "Oynadı"))),
             (f"{' '.join(parca.split())} Ayşe ne yaptı?", ["Çalıştı", "Uyudu", "Gezdi", "Oynadı"])),
        ):
            sorular = _ocr_ayikla(
                _OCR_KAPAK,
                f"1. OTURUM\n\n{baslik}\n\n{_ocr_sorusu(1)}\n\n{son}\n\n2",
                f"1. OTURUM\n\n{baslik}\n\n{tasan}\n\n{_ocr_sorusu(3)}\n\n3",
                f"CEVAP ANAHTARI\n\n{baslik}\n\n1. A\n2. B\n3. C",
            )
            assert (" ".join(sorular[2].soru.split()), sorular[2].secenekler) == beklenen, (baslik, son)
            assert sorular[1].secenekler == sorular[3].secenekler == ["Bir", "İki", "Üç", "Dört"], (baslik, son)
    # Sarılmış başlığın devamı sonraki sayfalarda I/İ, boşluk ve noktalama farkıyla, OCR'ın harf ya da rakam farkıyla
    # ("- 7", "HAYAT1"), başka satır bölmesiyle ya da tek satırda okunmuş: yine başlıkla atılır, önceki sayfanın son
    # seçeneğine eklenmez; dersin bütün soruları tutulur.
    sarili = "(532) SEÇMELİ\nPEYGAMBERİMİZİN HAYATI - 2"
    for sonraki in (
        "(532) SEÇMELİ\nPEYGAMBERIMIZIN  HAYATI. - 2",
        "(532) SEÇMELİ\nPEYGAMBERİMİZİN HAYATI - 7",
        "(532) SEÇMELİ\nPEYGAMBERİMİZİN HAYAT1 - 2",
        "(532) SEÇMELİ\nPEYGAMBERİMİZİN\nHAYATI - 2",
        "(532) SEÇMELİ PEYGAMBERİMİZİN HAYATI - 2",
    ):
        assert _ayni_ders_mi(sarili, sonraki, sonraki), sonraki
    assert _ayni_ders_mi("(532) SEÇMELİ PEYGAMBERİMİZİN HAYATI - 2", sarili, sarili)
    # I/İ, boşluk ve noktalama farkı hiç sayılmaz: kısa adda dört fark (sınır iki) yine aynı derstir; düzeysiz sarılı
    # başlıkta da.
    assert _ayni_ders_mi("(111) TARİH - 1", "(111) TARIH-1.", "(111) TARIH-1.")
    duzeysiz = "(532) SEÇMELİ\nPEYGAMBERİMİZİN HAYATI"
    assert _ayni_ders_mi(duzeysiz, "(532) SEÇMELİ\nPEYGAMBERIMIZIN  HAYATI.", duzeysiz)
    # Yakınlığın sınırı README'deki gibi: adın (I/İ, boşluk ve noktalamasız) beşte biri, kısa adda iki harf. Sınırdaki
    # fark aynı derstir, bir fazlası yeni ders (soruları kaybolur).
    m = re.search(r"\(adın (\w+) birine, kısa adda (\w+) kadar\)", bolum)
    assert m
    bolen, en_az = {"dörtte": 4, "beşte": 5, "altıda": 6}[m.group(1)], {"bire": 1, "ikiye": 2, "üçe": 3}[m.group(2)]
    for kod, ad, duzey in (("111", "TARİH", "1"), ("532", "SEÇMELİ PEYGAMBERİMİZİN HAYATI", "2")):
        sinir = max(en_az, len(meb_metin._devam_anahtari(f"{ad}{duzey}")) // bolen)
        for fark, beklenen in ((sinir, True), (sinir + 1, False)):
            okunan = f"({kod}) {'X' * fark}{ad[fark:]} - {duzey}"  # baştaki harfler başka okunmuş
            assert _ayni_ders_mi(f"({kod}) {ad} - {duzey}", okunan, okunan) is beklenen, (ad, fark)
    # İlk satırı farklı başlıktan sonra sorular 1'den başlıyorsa yeni derstir; sürüyorsa yinelenen başlıktır.
    m = re.search(r'İlk satırı farklı başlıktan sonra sorular 1\'den başlıyorsa başlık yeni bir dersindir \("([^"]+)" ardından "([^"]+)"\)\.', bolum)
    assert m
    ilk, ikinci = m.groups()
    for no, dersler in ((1, ["Tarih - 1", "Tarih - 1", "Tarih - 2"]), (3, ["Tarih - 1"] * 3)):
        anahtar = f"CEVAP ANAHTARI\n\n{ilk}\n\n1. A\n2. B" + (f"\n\n{ikinci}\n\n1. C" if no == 1 else "\n3. C")
        sayfalar = [f"{ilk}\n\n{_ocr_sorusu(1)}\n\n{_ocr_sorusu(2)}\n\n2", f"{ikinci}\n\n{_ocr_sorusu(no)}\n\n3", anahtar]
        sorular, rapor = meb_metin.metinden_ayristir(sayfalar, "k.pdf", yaz=lambda _: None)
        assert [s.ders for s in sorular] == dersler and rapor["elenen"] == {}, no
    # Başlığın altında birden çok sonraki sayfada yinelenen üst bilgi de atılır (düzeysiz başlıkta devam sanılırdı).
    m = re.search(r'birden çok sayfada yinelenen üst bilgi \("([^"]+)"\) de atılır', bolum)
    assert m
    assert _ayni_ders_mi(duzeysiz, f"{duzeysiz}\n{m.group(1)}", f"{duzeysiz}\n{m.group(1)}", duzeysiz)


# ---- durum'un değişen ayarla sürdürme komutu, modeli olan aşama, meb-pdf --klasor, ek metin klasörü ---------------


@pytest.fixture(scope="module")
def yarim_calisma(tmp_path_factory) -> SimpleNamespace:
    """Tokenizer'ı ve hazır verisi olan (MEB sorusu yok) çalışma klasörü; TDK aşaması 3. adımın başında Ctrl+C ile
    kesilmiş (``son.pt`` adım 2). ``[yollar] veri = "v2"``, ``v2/ek_metin``'de altı paragraf var. ``kok``: klasör,
    ``cikti``: komutların (``veri-hazirla``, ``egit``) yazdıkları."""
    kok = tmp_path_factory.mktemp("yarim")
    calisma_kur(kok, ayarlar=TEST_AYARLARI + '\n[yollar]\nveri = "v2"\n')
    (kok / "veri").rename(kok / "v2")
    (kok / "v2" / "ek_metin").mkdir()
    paragraflar = [f"Ek paragraf {i}: kitap güzel, deniz büyük." for i in range(6)]
    (kok / "v2" / "ek_metin" / "ek.txt").write_text("\n\n".join(paragraflar), encoding="utf-8")
    asil, sayac = TurkceGPT.forward, {"n": 0}

    def ileri(self, *a, **k):
        sonuc = asil(self, *a, **k)
        if self.training:
            sayac["n"] += 1
            if sayac["n"] == 9:  # adım başına 4 mikro yığın: 3. adımın ilki
                raise KeyboardInterrupt
        return sonuc

    cikti = io.StringIO()
    with pytest.MonkeyPatch.context() as mp, contextlib.redirect_stdout(cikti), contextlib.redirect_stderr(cikti):
        mp.chdir(kok)
        for komut in ("tdk-derlem", "tokenizer-egit", "veri-hazirla"):
            assert cli.main([komut]) == 0, komut
        mp.setattr(TurkceGPT, "forward", ileri)
        assert cli.main(["egit", "--asama", "tdk", "--cihaz", "cpu"]) == 130
    return SimpleNamespace(kok=kok, cikti=cikti.getvalue())


def _calisma_kopyasi(yarim_calisma: SimpleNamespace, tmp_path: Path, monkeypatch) -> Path:
    """``yarim_calisma``'nın kopyası; çalışma dizini oraya alınır."""
    kok = tmp_path / "ws"
    shutil.copytree(yarim_calisma.kok, kok)
    monkeypatch.chdir(kok)
    return kok


def _ileri_al(yol: Path, saniye: float = 10) -> Path:
    """Dosyanın zamanını ileri alır: sonradan eklenmiş, girdiyi eskitmiş olsun."""
    zaman = yol.stat().st_mtime + saniye
    os.utime(yol, (zaman, zaman))
    return yol


def test_modeli_olan_asama_uzerine_yazsiz_yeniden_egitilmez(yarim_calisma, tmp_path, monkeypatch, capsys):
    bolum = _duz(_bolum(README, "6. Eğitim"))
    assert (
        "Aynı deneyi baştan eğitmek için `--uzerine-yaz` gerekir; `son.pt`'si silinip yalnız modeli (`en_iyi.pt`) "
        "kalmış eğitimde de."
    ) in bolum
    kok = _calisma_kopyasi(yarim_calisma, tmp_path, monkeypatch)
    klasor = ayarlari_yukle(kok / "ayarlar.toml").deney_klasoru / "tdk"
    assert cli.main(["egit", "--asama", "tdk", "--devam", "--cihaz", "cpu"]) == 0  # eğitim biter
    for son_pt in (True, False):  # son.pt'si duran ve yer açmak için silinmiş bitmiş eğitim
        if not son_pt:
            (klasor / "son.pt").unlink()
        once = _asama_dosyalari(klasor)
        assert "en_iyi.pt" in once and ("son.pt" in once) is son_pt
        capsys.readouterr()
        assert cli.main(["egit", "--asama", "tdk", "--cihaz", "cpu"]) == 2, son_pt
        assert f"{klasor} içinde zaten bir eğitim var" in capsys.readouterr().err, son_pt
        assert _asama_dosyalari(klasor) == once, son_pt  # model bayt bayt aynı, hiçbir dosya kenara alınmadı


def test_modeli_de_silinmis_kenardaki_egitimi_devam_surdurmez(yarim_calisma, tmp_path, monkeypatch, capsys):
    bolum = _duz(_bolum(README, "6. Eğitim"))
    assert (
        'Eski model de silinmiş, yalnız kayıtları geri gelmişse "sürdürülecek eğitim yok" der ve 2 koduyla çıkar; yeni '
        "eğitimi `--devam`'sız `egit` başlatır, `durum` da onu önerir."
    ) in bolum
    kok = _calisma_kopyasi(yarim_calisma, tmp_path, monkeypatch)
    klasor = ayarlari_yukle(kok / "ayarlar.toml").deney_klasoru / "tdk"
    assert cli.main(["egit", "--asama", "tdk", "--devam", "--cihaz", "cpu"]) == 0  # eğitim biter
    eski_kosu = json.loads((klasor / "durum.json").read_text(encoding="utf-8"))["kosu"]
    # Bitmiş eğitimi --uzerine-yaz kenara aldı; yeni eğitim ilk adımını bitirdi, kenardakileri silerken öldü: son.pt.eski
    # ve model (en_iyi.pt.eski) silinmiş, kayıtlar kenarda, yeni koşunun yarım kaydı yerinde (sıra: egitim._eskileri_sil).
    for ad in ("durum.json", "gunluk.jsonl", "en_iyi.pt", "son.pt"):
        os.replace(klasor / ad, klasor / f"{ad}.eski")
    yeni = {"durum": "suruyor", "adim": 1, "toplam_adim": 12, "kosu": "yeni0001"}
    (klasor / "durum.json").write_text(json.dumps(yeni), encoding="utf-8")
    (klasor / "gunluk.jsonl").write_text("", encoding="utf-8")
    for ad in ("son.pt.eski", "en_iyi.pt.eski"):
        (klasor / ad).unlink()
    capsys.readouterr()
    assert cli.main(["durum"]) == 0
    siradaki = capsys.readouterr().out.split("Sıradaki adım: ", 1)[1].splitlines()[0]
    assert siradaki == "python -m turkce_model egit --asama tdk"
    # Elle yazılan --devam kayıtları geri getirir, "zaten bitmiş" demez (değerlendirilecek model yok), 2 ile çıkar.
    assert cli.main(["egit", "--asama", "tdk", "--devam", "--cihaz", "cpu"]) == 2
    cikis = capsys.readouterr()
    assert "yalnız kayıt dosyaları geri getirildi" in cikis.out
    assert f"--devam verildi ama sürdürülecek eğitim yok ({klasor / 'son.pt'})" in cikis.err
    assert "zaten bitmiş" not in cikis.out + cikis.err and "degerlendir" not in cikis.out + cikis.err
    assert cli.main([*shlex.split(siradaki)[3:], "--cihaz", "cpu"]) == 0  # durum'un önerdiği düz egit yeni eğitimi başlatır
    sonra = json.loads((klasor / "durum.json").read_text(encoding="utf-8"))
    assert (klasor / "en_iyi.pt").exists() and sonra["kosu"] not in (eski_kosu, "yeni0001")


def test_durum_degisen_ayarla_surdurme_komutunu_kayitli_ayarlarla_yazar(yarim_calisma, tmp_path, monkeypatch, capsys):
    bolum = _duz(_bolum(README, "Adım adım"))
    for cumle in (
        "Yarıda kalan eğitimin `--devam`'da değişemeyen ayarlarından (6. adım) biri şimdi farklıysa satır \"şimdiki "
        "ayarlar kayıtlı eğitimden farklı (…)\" der ve iki komut yazar: kayıtlı ayarlarla sürdüren `--devam` ve yeni "
        "ayarlarla baştan başlayan `--uzerine-yaz`.",
        "Fark ayar dosyasından geliyorsa `--devam`'a `--ayar <alan>=<kayıtlı değer>` eklenir.",
        "Önceki sürümün yarıda bıraktığı eğitimde bu karşılaştırma yapılmaz.",
        "seçeneklerini tekrarlar; yalnız kayıtlı eğitimle çelişen `--ayar` sürdürme komutuna yazılmaz.",
    ):
        assert cumle in bolum, cumle
    assert "şimdiki ayarlar kayıtlı eğitimden farklı (" in _kaynak("cli.py")
    kok = _calisma_kopyasi(yarim_calisma, tmp_path, monkeypatch)
    ayar = kok / "ayarlar.toml"
    klasor = ayarlari_yukle(ayar).deney_klasoru / "tdk"
    kayit = json.loads((klasor / "durum.json").read_text(encoding="utf-8"))
    # Karşılaştırılanlar 6. adımın "Kayıttakiyle aynı olmalı" listesidir: [gomme], [model] ve kilitli eğitim ayarları.
    kilitli = kayit["kilitli"]
    assert {a.split(".")[0] for a in kilitli} == {"gomme", "model", "egitim"}
    assert {a.split(".")[2] for a in kilitli if a.startswith("egitim.")} == set(KILITLI_EGITIM_ALANLARI)
    toplam, kayitli_oran = kayit["toplam_adim"], kilitli["egitim.tdk.ogrenme_orani"]
    yeni = ("--ayar", "egitim.tdk.ogrenme_orani=0.003")
    ek = " " + " ".join(yeni)

    def durum_(*secenek: str) -> tuple[str, str]:
        """(TDK modeli satırının notu, "Sıradaki adım"ın komutu)"""
        assert cli.main(["durum", *secenek]) == 0
        cikti = capsys.readouterr().out
        satir = next(s for s in cikti.splitlines() if "Aşama 1 modeli (TDK)" in s)
        return satir.split("(TDK)", 1)[1].strip(), cikti.split("Sıradaki adım: ", 1)[1].splitlines()[0]

    # Önceki sürümün yazdığı durum.json ("kilitli" yok): karşılaştırılmaz, --devam çağrının --ayar'ını taşır.
    ham = (klasor / "durum.json").read_text(encoding="utf-8")
    (klasor / "durum.json").write_text(json.dumps({k: v for k, v in kayit.items() if k != "kilitli"}), encoding="utf-8")
    assert durum_(*yeni)[0] == f"adım 2/{toplam}, bitmedi → sürdür: egit --asama tdk --devam{ek}"
    (klasor / "durum.json").write_text(ham, encoding="utf-8")
    # Fark ayar dosyasından geliyor: --devam kayıtlı değeri --ayar ile geri verir.
    asil = ayar.read_text(encoding="utf-8")
    ayar.write_text(asil.replace("[egitim.tdk]\n", "[egitim.tdk]\nogrenme_orani = 0.003\n"), encoding="utf-8")
    satir, siradaki = durum_()
    geri = f" --ayar egitim.tdk.ogrenme_orani={kayitli_oran}"
    assert f"→ sürdür: egit --asama tdk --devam{geri}; yeni ayarlarla baştan: egit --asama tdk --uzerine-yaz" in satir
    assert siradaki == f"python -m turkce_model egit --asama tdk --devam{geri}"
    assert ayarlari_yukle(ayar, [geri.split()[1]]).tdk.ogrenme_orani == kayitli_oran
    ayar.write_text(asil, encoding="utf-8")
    # Fark --ayar'dan geliyor: çelişen --ayar sürdürme komutuna yazılmaz, baştan başlatan komutta kalır.
    satir, siradaki = durum_(*yeni)
    assert satir == (
        f"adım 2/{toplam}, bitmedi; şimdiki ayarlar kayıtlı eğitimden farklı (egitim.tdk.ogrenme_orani) → sürdür: "
        f"egit --asama tdk --devam; yeni ayarlarla baştan: egit --asama tdk --uzerine-yaz{ek}"
    )
    assert siradaki == "python -m turkce_model egit --asama tdk --devam"
    # Yapıştırılan sürdürme komutu reddedilmez: eğitim kayıtlı ayarlarla kaldığı yerden sürer.
    assert cli.main([*shlex.split(siradaki)[3:], "--cihaz", "cpu"]) == 0
    assert f"Kaldığı yerden devam: adım 2/{toplam}" in capsys.readouterr().out


def test_baska_deneyin_devami_ayar_dosyasi_degisince_kayitli_degerleri_tasir(yarim_calisma, tmp_path, monkeypatch, capsys):
    bolum = _duz(_bolum(README, "Adım adım"))
    for cumle in (
        "Bitmemiş eğitimin `--devam`'da değişemeyen ayarlarından (6. adım) biri ayar dosyasında kayıtlı olandan farklıysa "
        'satır "ayar dosyası kayıtlı eğitimden farklı (…)" der ve komuta her fark için `--ayar <alan>=<kayıtlı değer>` '
        "ekler. Bu, ör. bir gömme kararını dosyada değiştirdiğinde ya da deneyi böyle bir ayarı `--ayar` ile vererek "
        "başlattığında olur.",
        "Önceki sürümün yarıda bıraktığı eğitimde bu karşılaştırma yapılmaz. Tokenizer'ı ya da hazır verisi değişmiş",
    ):
        assert cumle in bolum, cumle
    # README'nin örneği --devam'da değişebilen bir ayardır (6. adım): karşılaştırılmaz, satırın komutu onu taşımaz.
    m = re.search(r"Deneyi değişebilen bir ayarla \(ör\. `([a-z_]+)`\) başlattıysan o `--ayar`'ı kendin ekle\.", bolum)
    assert m and m.group(1) in _kod_listesi(README, "Değişebilir (bir notla):", ".")
    assert m.group(1) not in KILITLI_EGITIM_ALANLARI
    kok = _calisma_kopyasi(yarim_calisma, tmp_path, monkeypatch)
    ayar = kok / "ayarlar.toml"
    eski = ayarlari_yukle(ayar).deney_klasoru
    durum_yolu = eski / "tdk" / "durum.json"
    toplam = json.loads(durum_yolu.read_text(encoding="utf-8"))["toplam_adim"]
    # GOMME_KARARLARI'nın iş akışı: bir gömme kararını dosyada değiştir (dropout önce [gomme]'de geçer). Yeni ayarlar yeni
    # bir deney türetir; yarıda kalan eski deney "Yarıda kalan başka deneyler"de kayıtlı değeriyle listelenir.
    ayar.write_text(ayar.read_text(encoding="utf-8").replace("dropout = 0.0", "dropout = 0.1", 1), encoding="utf-8")
    assert ayarlari_yukle(ayar).gomme.dropout == 0.1 and ayarlari_yukle(ayar).deney_klasoru != eski
    satir = (
        f"  {eski.name} / tdk: adım 2/{toplam}; ayar dosyası kayıtlı eğitimden farklı (gomme.dropout) → egit --asama tdk "
        f"--devam --deney {eski.name} --ayar gomme.dropout=0.0"
    )

    def baska_deneyler(*secenek: str) -> list[str]:
        assert cli.main(["durum", *secenek]) == 0
        return capsys.readouterr().out.split("Yarıda kalan başka deneyler:\n")[1].split("\n\n")[0].splitlines()

    capsys.readouterr()
    assert baska_deneyler() == [satir]
    assert baska_deneyler("--ayar", "egitim.tdk.ogrenme_orani=0.003") == [satir]  # durum'un --ayar'ı satıra girmez
    # Kayıtlı ayarları taşımayan önceki sürüm kaydı karşılaştırılmaz: satır --ayar eklemez.
    ham = durum_yolu.read_text(encoding="utf-8")
    durum_yolu.write_text(json.dumps({k: v for k, v in json.loads(ham).items() if k != "kilitli"}), encoding="utf-8")
    assert baska_deneyler() == [f"  {eski.name} / tdk: adım 2/{toplam} → egit --asama tdk --devam --deney {eski.name}"]
    durum_yolu.write_text(ham, encoding="utf-8")
    # Yapıştırılan komut reddedilmez: eğitim kayıtlı ayarlarla kaldığı yerden sürer.
    assert cli.main([*shlex.split(satir.split(" → ", 1)[1]), "--cihaz", "cpu"]) == 0
    assert f"Kaldığı yerden devam: adım 2/{toplam}" in capsys.readouterr().out


def test_meb_pdf_klasoru_hatirlanir_yazilan_komutlar_onu_okutur(yarim_calisma, tmp_path, monkeypatch, capsys):
    bolum = _duz(_bolum(README, "3. MEB soruları"))
    assert (
        "Kitapçıkları `meb-pdf --klasor <klasör>` ile okuduysan bu klasör hatırlanır: `durum` yeni kitapçıkları orada "
        "arar; `meb-mmlu`, `durum` ve `egit --asama meb`'in yazdığı `meb-pdf` komutu `--klasor <klasör>`'ü taşır."
    ) in bolum
    kok = _calisma_kopyasi(yarim_calisma, tmp_path, monkeypatch)
    klasor = "eski kitaplar"
    _taranmis_pdf(kok / klasor / "a.pdf", 2)
    sunucu = _SayfaOcrSunucusu(  # a.pdf'in iki sayfası; sonra eklenen tek sayfalık kitapçık soruları anahtarsız okur
        ["(111) TARİH - 1\n\n" + _ocr_sorusu(1) + "\n\n" + _ocr_sorusu(2), "CEVAP ANAHTARI\n\n(111) TARİH - 1\n\n1. A\n2. B"]
    )
    monkeypatch.setattr(  # OCR modülü: sahte sunucuyla, ağa çıkılmaz
        komutlar, "meb_ayristirici",
        lambda ayarlar, kip, arg=None: meb_metin.ocr_ayristirici(ocr.OcrModulu(sunucu, OcrAyarlari(model="m"), None), kip),
    )
    monkeypatch.setattr(meb, "mmlu_indir", lambda yol, yaz=print: [])  # ağa çıkılmaz
    assert cli.main(["meb-pdf", "--ocr", "--klasor", klasor]) == 0
    hedef = kok / "v2" / "meb" / "meb_pdf.jsonl"
    assert len(meb.soru_oku(hedef)) == 2
    assert json.loads(hedef.with_suffix(".rapor.json").read_text(encoding="utf-8"))["klasor"] == klasor
    okuma = f"meb-pdf --ocr --klasor {cli._tirnak(klasor)}"
    capsys.readouterr()
    assert cli.main(["meb-mmlu"]) == 0
    satirlar = capsys.readouterr().out.splitlines()
    i = next(i for i, s in enumerate(satirlar) if s.startswith("Not: meb_pdf.jsonl bundan önce üretilmiş."))
    assert satirlar[i + 1] == f"  python -m turkce_model {okuma}"

    def meb_satiri() -> tuple[str, str]:
        assert cli.main(["durum"]) == 0
        cikti = capsys.readouterr().out
        return next(s.strip() for s in cikti.splitlines() if "MEB soruları" in s), cikti

    # Varsayılan klasöre konan kitapçık soruları eskitmez; hatırlanan klasöre konan eskitir, yeniden okuma orayı okur.
    _ileri_al(_taranmis_pdf(kok / "v2" / "meb" / "pdf" / "baska.pdf"))
    assert meb_satiri()[0].startswith("[x]")
    _ileri_al(_taranmis_pdf(kok / klasor / "yeni.pdf"))
    satir, cikti = meb_satiri()
    assert satir.startswith("[~]") and satir.endswith(f"→ yeniden: {okuma}"), satir
    assert f"Sıradaki adım: python -m turkce_model {okuma}\n" in cikti
    # Klasör ayar dosyasının klasörüne göre saklanır; üst klasörden --ayarlar ile çalışan durum onu oradan göre yazar ve
    # yapıştırılan komut aynı kitapçıkları okur.
    assert "Klasör ayar dosyasının klasörüne göre saklanır; komutlar onu çalıştıkları klasöre göre (dışındaysa tam yoluyla) yazar." in bolum
    assert "başka bir klasörden `--ayarlar` ile çalışan komut da aynı kitapçıkları okur." in bolum
    monkeypatch.chdir(kok.parent)
    ayar = str(Path(kok.name, "ayarlar.toml"))
    disaridan = f"meb-pdf --ocr --klasor {cli._tirnak(str(Path(kok.name, klasor)))} --ayarlar {cli._tirnak(ayar)}"
    assert cli.main(["durum", "--ayarlar", ayar]) == 0
    assert f"Sıradaki adım: python -m turkce_model {disaridan}\n" in capsys.readouterr().out
    assert cli.main(shlex.split(disaridan)) == 0
    assert len(meb.soru_oku(hedef)) == 2 and "yeni.pdf" in capsys.readouterr().out
    assert json.loads(hedef.with_suffix(".rapor.json").read_text(encoding="utf-8"))["klasor"] == klasor  # yazıldığı gibi değil
    monkeypatch.chdir(kok)
    # egit --asama meb, MEB eğitim verisi hazırlanmamışken: eğitim sorusu okunmuşsa yalnız veri-hazirla'yı yazar.
    assert (
        "MEB eğitim verisi hazırlanmamışsa `egit --asama meb` durur ve sıradaki komutu yazar: `meb_pdf.jsonl`'de eğitim "
        "sorusu varsa yalnız `veri-hazirla`'yı, yoksa `meb-pdf`'i (sorular OCR ile okunduysa aynı kiple), sonra "
        "`veri-hazirla`'yı."
    ) in bolum
    assert any(s.bolum == "egitim" for s in meb.soru_oku(hedef))
    assert cli.main(["egit", "--asama", "meb", "--cihaz", "cpu"]) == 2
    hata = _duz(capsys.readouterr().err)
    assert hata.endswith("Önce: python -m turkce_model veri-hazirla") and "meb-pdf" not in hata
    assert cli.main(shlex.split(hata.split("Önce: ")[1])[3:]) == 0  # yapıştırılan ipucu
    # Eğitim sorusu yoksa: kitapçıkları okuyan meb-pdf aynı kip ve klasörle, sonra veri-hazirla; meb-pdf yapıştırılınca
    # OCR ile okunmuş soruları silmemek için reddedilmez.
    meb.soru_yaz([s for s in meb.soru_oku(hedef) if s.bolum != "egitim"], hedef)
    assert cli.main(["veri-hazirla"]) == 0
    capsys.readouterr()
    assert cli.main(["egit", "--asama", "meb", "--cihaz", "cpu"]) == 2
    hata = _duz(capsys.readouterr().err)
    assert f"Önce MEB kitapçıklarını {klasor} klasörüne koyup {okuma}, sonra veri-hazirla çalıştır" in hata
    assert cli.main(shlex.split(okuma)) == 0
    assert any(s.bolum == "egitim" for s in meb.soru_oku(hedef))


def test_ek_metin_klasoru_iletilerde_gercek_klasordur(yarim_calisma, tmp_path, monkeypatch, capsys):
    bolum = _duz(_bolum(README, "Daha ileri gitmek"))
    assert "`[yollar] veri` değiştiyse klasör onun altındaki `ek_metin`'dir; iletiler de onu yazar." in bolum
    klasor = str(Path("v2", "ek_metin"))  # çalışma klasörüne göre
    # veri-hazirla'nın özeti ve egit'in notu (çalışma klasörü kurulurken yazıldı)
    assert f"\n  {klasor}: 6 paragraf (" in yarim_calisma.cikti
    assert f"daha fazla metin: {klasor}.\n" in yarim_calisma.cikti
    assert "veri/ek_metin" not in yarim_calisma.cikti
    kok = _calisma_kopyasi(yarim_calisma, tmp_path, monkeypatch)
    sahte = SimpleNamespace(ayar=OcrAyarlari(model="m"), dosya_oku=lambda *_: ["Okunan metin."])
    monkeypatch.setattr(ocr, "ocr_modulu", lambda *_, **__: sahte)
    assert cli.main(["ocr", "sayfa.png"]) == 0
    assert f".txt dosyasını {klasor} klasörüne kopyala" in capsys.readouterr().out
    assert (kok / "v2" / "ocr" / "sayfa.txt").read_text(encoding="utf-8") == "Okunan metin.\n"
    shutil.rmtree(kok / "v2" / "ek_metin")  # hazır veri ek metinle hazırlanmıştı: eskir
    assert cli.main(["durum"]) == 0
    assert f"{klasor} kaldırılmış → yeniden: veri-hazirla" in capsys.readouterr().out
