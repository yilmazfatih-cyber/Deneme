"""Belgeler (README.md, GOMME_KARARLARI.md, ayarlar.toml yorumları) kodla tutarlı mı?

Belgede söz edilen komutlar ayrıştırılabilmeli, listeler kodun listeleriyle aynı olmalı, iletilerin andığı bölümler
belgede bulunmalı. Belgenin anlattığı davranışlar (kenardaki eski eğitimin geri gelmesi, OCR'sız okumanın reddi,
modül iletileri) kodda da öyle olmalı. Metin satır sonlarından bağımsız karşılaştırılır.
"""

from __future__ import annotations

import argparse
import inspect
import json
import re
import shlex
import struct
import sys
from dataclasses import fields
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from turkce_model import cli, egitim, meb
from turkce_model.ayarlar import Ayarlar, AyarHatasi, EgitimAyarlari, ayarlari_yukle
from turkce_model.degerlendirme import ilerleme_ekle
from turkce_model.egitim import KILITLI_EGITIM_ALANLARI
from turkce_model.metin import binlik
from turkce_model.moduller import kiyas, komutlar, meb_metin, ocr
from turkce_model.moduller.ayar import VARSAYILAN_ADRES, MetinAyarlari, ModulAyarlari, OcrAyarlari, moduller_uygula
from turkce_model.moduller.istemci import ModulHatasi, yerel_adres_mi
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
    assert "`--ayar`'ları taşımaz" in bolum  # başka deneylerin satırı yalnız --ayarlar ve --deney taşır


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
        ("Kenarda kalmış eski eğitimler de burada listelenir.", "/ {asama}: yarıda kalan --uzerine-yaz; eski eğitim kenarda"),
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


def _taranmis_pdf(yol: Path) -> Path:
    """Metin katmanı olmayan tek sayfalık PDF (yalnız bir dikdörtgen)."""
    pymupdf = pytest.importorskip("pymupdf")
    yol.parent.mkdir(parents=True, exist_ok=True)
    belge = pymupdf.open()
    sayfa = belge.new_page(width=200, height=200)
    sayfa.draw_rect(pymupdf.Rect(10, 10, 30, 30), color=(0, 0, 0), fill=(0, 0, 0))
    belge.save(yol)
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


def test_kiyas_onbellegi_ve_kesik_cevaplar_belgelendigi_gibi():
    bolum = _duz(_bolum(README, "Kıyas modülü"))
    assert "Şık her çalıştırmada saklanan ham cevaptan yeniden çıkarılır." in bolum
    assert 'secim = cevap_cikar(str(kayit.get("cevap", ""))' in inspect.getsource(kiyas.kiyasla)
    assert "Önbellek anahtarı model adını da içerir: bu sürümden önce saklanan cevaplar bir kez yeniden sorulur." in bolum
    s = meb.Soru(kimlik="mmlu:x:1", kaynak="turkishmmlu", ders="Tarih", soru="Hangisi?", secenekler=["A", "B"], cevap=0)
    assert kiyas._soru_anahtari(s, MetinAyarlari(model="a")) != kiyas._soru_anahtari(s, MetinAyarlari(model="b"))
    varsayilan = MetinAyarlari().en_fazla_token
    assert f"Cevabı `[moduller.metin] en_fazla_token`'da (varsayılan {varsayilan}) kesildiği için şıkkı" in bolum
    assert "en_fazla_token ({ayar.en_fazla_token}) sınırında kesildi (model çoğu kez" in inspect.getsource(komutlar.komut_modul_kiyas)
