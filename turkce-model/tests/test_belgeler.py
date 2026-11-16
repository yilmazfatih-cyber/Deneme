"""Belgeler (README.md, GOMME_KARARLARI.md, ayarlar.toml yorumları) kodla tutarlı mı?

Belgede söz edilen komutlar ayrıştırılabilmeli, listeler kodun listeleriyle aynı olmalı, iletilerin andığı bölümler
belgede bulunmalı. Metin satır sonlarından bağımsız karşılaştırılır.
"""

from __future__ import annotations

import re
import shlex
import sys
from dataclasses import fields
from pathlib import Path

import numpy as np
import pytest

from turkce_model import cli
from turkce_model.ayarlar import Ayarlar, EgitimAyarlari, ayarlari_yukle
from turkce_model.degerlendirme import ilerleme_ekle
from turkce_model.egitim import KILITLI_EGITIM_ALANLARI
from turkce_model.metin import binlik
from turkce_model.moduller.ayar import VARSAYILAN_ADRES, ModulAyarlari, moduller_uygula
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
