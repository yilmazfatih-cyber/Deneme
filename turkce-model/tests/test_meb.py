"""turkce_model.meb testleri.

PDF testleri gerçek MEB sorusu kullanmaz: pymupdf ile AÖL kitapçığı düzeninde (kapak + üç sütunlu soru
sayfaları + cevap anahtarı) yapay kitapçıklar üretilir; bütün soru metinleri bu dosyada uydurulmuştur. Ağ
erişimi yoktur: ``requests.get`` sahte bir işlevle değiştirilir.

PDF testleri Türkçe harfleri çizebilen bir TTF yazı tipi ister; bulunamazsa atlanır. CI'da atlanmasınlar diye
``MEB_PDF_TESTLERI_ZORUNLU=1`` verilirse yazı tipi yokluğu test hatasıdır.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

import pytest

from turkce_model import meb
from turkce_model.meb import HARFLER, Soru

try:  # pymupdf isteğe bağlıdır ("pdf" eki): yoksa yalnızca PDF testleri atlanır
    import pymupdf
except ImportError:  # pragma: no cover
    pymupdf = None

# --------------------------------------------------------------------------------------------
# Yapay kitapçık
# --------------------------------------------------------------------------------------------

_YAZI_TIPI_ADAYLARI = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    "/usr/share/fonts/noto/NotoSans-Regular.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "C:/Windows/Fonts/arial.ttf",
)
_KALIN_YAZI_TIPI_ADAYLARI = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    "/usr/share/fonts/noto/NotoSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
)


def _yazi_tipi(adaylar: tuple[str, ...] = _YAZI_TIPI_ADAYLARI) -> str | None:
    """Türkçe harfleri (ş, ğ, ı, İ) çizebilen bir TTF; pymupdf'nin yerleşik "helv" yazı tipi çizemez."""
    if pymupdf is None:
        return None
    for yol in adaylar:
        if Path(yol).exists():
            try:
                f = pymupdf.Font(fontfile=yol)
            except Exception:
                continue
            if all(f.has_glyph(ord(c)) for c in "şğıİöüçŞĞÖÜÇâ“”•"):
                return yol
    return None


YAZI_TIPI = _yazi_tipi()
KALIN_YAZI_TIPI = _yazi_tipi(_KALIN_YAZI_TIPI_ADAYLARI) if YAZI_TIPI else None
_ATLAMA_NEDENI = (
    "pymupdf kurulu değil (pip install -e '.[pdf]')"
    if pymupdf is None
    else "Türkçe harfleri destekleyen bir TTF yazı tipi (ör. DejaVuSans) bulunamadı"
)
pdf_gerekli = pytest.mark.skipif(YAZI_TIPI is None, reason=_ATLAMA_NEDENI)
kalin_gerekli = pytest.mark.skipif(
    KALIN_YAZI_TIPI is None, reason="Türkçe harfleri destekleyen kalın bir TTF yazı tipi bulunamadı"
)
pymupdf_gerekli = pytest.mark.skipif(pymupdf is None, reason="pymupdf kurulu değil")

W, H = 552.0, 779.0
S1, S2, S3 = 33.0, 203.0, 372.0  # sütunların soru numarası konumu; kök/seçenek +12, seçenek devamı +23
SUTUN_SAGI = {S1: 187.0, S2: 357.0, S3: 525.0}


def _sigar_mi(x: float, metin: str, boyut: float, yazi_tipi: str) -> None:
    """Sütun içindeki satırların sütun aralığına taşmadığını denetler (taşan satır sütunları birleştirir ve
    testi anlamsız kılar)."""
    for sol, sag in SUTUN_SAGI.items():
        if sol <= x < sol + 60:
            genislik = pymupdf.Font(fontfile=yazi_tipi).text_length(metin, fontsize=boyut)
            assert x + genislik <= sag, f"yapay kitapçıkta satır sütuna sığmıyor: {metin!r}"


def _yaz(sayfa, x: float, y: float, metin: str, boyut: float = 7.5) -> None:
    """Metni ``(x, y)`` taban çizgisine yazar; ana kitapçığın soru sayfalarında (2. ve 3. sayfa) sütun taşması
    denetlenir."""
    if sayfa.number in (1, 2):
        _sigar_mi(x, metin, boyut, YAZI_TIPI)
    sayfa.insert_text((x, y), metin, fontsize=boyut, fontname="tr", fontfile=YAZI_TIPI)


def _s(sayfa, x: float, y: float, metin: str, boyut: float = 7.5, kalin: bool = False) -> None:
    """Soru sayfasına yazar (her sayfada sütun taşması denetlenir); ``kalin`` kalın yazı tipiyle."""
    yazi_tipi = KALIN_YAZI_TIPI if kalin else YAZI_TIPI
    _sigar_mi(x, metin, boyut, yazi_tipi)
    sayfa.insert_text((x, y), metin, fontsize=boyut, fontname="trb" if kalin else "tr", fontfile=yazi_tipi)


def _serbest(sayfa, x: float, y: float, metin: str, boyut: float = 8.0) -> None:
    """Sütun denetimi olmadan yazar (kapak, cevap anahtarı)."""
    sayfa.insert_text((x, y), metin, fontsize=boyut, fontname="tr", fontfile=YAZI_TIPI)


def _kenarlar(sayfa, no: int) -> None:
    """Her soru sayfasında aynı yerde duran başlık ve sayfa numarası (sayfa numarası orta sütunun altında)."""
    _yaz(sayfa, 250, 38, "1. OTURUM", 11)
    _yaz(sayfa, 274, 755, str(no), 11)


def _secenekler(sayfa, x: float, y: float, metinler: list[str], aralik: float = 11.4) -> None:
    for i, m in enumerate(metinler):
        _yaz(sayfa, x, y + i * aralik, f"{HARFLER[i]}) {m}")


def _soru_ciz(sayfa, x: float, y: float, no: int, kok: list[str], secenekler: list[str]) -> float:
    """Numara + kök satırları (10 pt aralıklı) + alt alta seçenekler; sonraki sorunun y'sini döndürür."""
    _s(sayfa, x, y, f"{no}.  {kok[0]}")
    for i, satir in enumerate(kok[1:], 1):
        _s(sayfa, x + 12, y + 10 * i, satir)
    y += 10 * len(kok) + 7
    for i, m in enumerate(secenekler):
        _s(sayfa, x + 12, y + 11.4 * i, f"{HARFLER[i]}) {m}")
    return y + 11.4 * len(secenekler) + 20


def _anahtar_sayfasi(belge, bolumler: list[tuple[str, str]]) -> None:
    """Cevap anahtarı sayfası: ``[("(421) FİZİK – 1", "ABCD"), …]``."""
    s = belge.new_page(width=W, height=H)
    _serbest(s, 60, 40, "DENEME SINAVI 1. OTURUM T KİTAPÇIĞI CEVAP ANAHTARI", 10)
    x, y = 40.0, 80.0
    for baslik, harfler in bolumler:
        if y + 17 + 12 * len(harfler) > H - 60:
            x, y = x + 170, 80.0
        _serbest(s, x, y, baslik, 8)
        for i, h in enumerate(harfler):
            _serbest(s, x + 30, y + 17 + 12 * i, f"{i + 1}.  {h}", 10)
        y += 17 + 12 * len(harfler) + 20


def _kitapcik(yol: Path, sayfalar: list, anahtar: list[tuple[str, str]]) -> Path:
    """Soru sayfaları (her biri sayfayı çizen bir işlev) + cevap anahtarından kitapçık."""
    belge = pymupdf.open()
    for no, ciz in enumerate(sayfalar, 1):
        s = belge.new_page(width=W, height=H)
        _kenarlar(s, no)
        ciz(s)
    _anahtar_sayfasi(belge, anahtar)
    belge.save(yol)
    belge.close()
    return yol


def _kitapcik_yap(yol: Path) -> Path:
    belge = pymupdf.open()

    # 1. sayfa: kapak. Ders dizini soru sayfalarındakiyle aynı başlık biçimini kullanır ve adaylara
    # açıklamalar "1. …" diye numaralıdır: ikisi de soru sanılmamalı.
    s = belge.new_page(width=W, height=H)
    _yaz(s, 45, 180, "T", 60)
    _yaz(s, 455, 170, "1.", 60)
    _yaz(s, 457, 200, "OTURUM", 13)
    _yaz(s, 39, 250, "DERS KODU VE ADI", 9)
    _yaz(s, 160, 250, "SAYFA", 9)
    for i, (ders, sayfa_no) in enumerate(
        [("(111) DİN KÜL. VE AHL. BİL. – 1", "2"), ("(181) İNGİLİZCE – 1", "2"), ("(421) FİZİK – 1", "3")]
    ):
        _yaz(s, 39, 265 + 9.5 * i, ders, 8)
        _yaz(s, 180, 265 + 9.5 * i, sayfa_no, 8)
    _yaz(s, 40, 520, "1. Her ders için en fazla altı soru bulunmaktadır.", 8)
    _yaz(s, 40, 532, "2. Cevaplarınızı cevap kâğıdına işaretleyiniz.", 8)

    # 2. sayfa
    s = belge.new_page(width=W, height=H)
    _kenarlar(s, 2)
    _yaz(s, S1, 60, "(111) DİN KÜL. VE AHL. BİL. – 1", 8.5)
    _yaz(s, S1, 85, "1.  Aşağıdakilerden hangisinde yar-")  # satır sonu hecelemesi
    _yaz(s, S1 + 12, 95, "dımlaşma kavramından bahsedil-")
    _yaz(s, S1 + 12, 105, "mektedir?")
    _yaz(s, S1 + 12, 122, "A) “Komşusu açken tok yatan bizden")  # çok satırlı seçenek
    _yaz(s, S1 + 23, 132, "değildir.”")
    _yaz(s, S1 + 23, 142, "(Örnek kaynak, 1 ve")
    _yaz(s, S1 + 23, 152, "2. ayetler)")  # satır başında "2." ama soru başı değil
    _yaz(s, S1 + 12, 163.4, "B) Doğruluk her işin başıdır.")
    _yaz(s, S1 + 12, 174.8, "C) Sabreden derviş muradına ermiş.")
    _yaz(s, S1 + 12, 186.2, "D) Damlaya damlaya göl olur.")
    _yaz(s, S1, 225, "2.  Türk-")  # gerçek kısa çizgi: sonraki satır büyük harfle başlar
    _yaz(s, S1 + 12, 235, "İslam sanatında çini, - - - - süsle-")
    _yaz(s, S1 + 12, 245, "melerde sıkça kullanılmıştır.")
    _yaz(s, S1 + 12, 263, "Bu cümlede boş bırakılan yere")
    _yaz(s, S1 + 12, 273, "aşağıdakilerden hangisi getirilme-")
    _yaz(s, S1 + 12, 283, "lidir?")
    _yaz(s, S1 + 12, 300, "A) mimari")  # iki seçenek aynı satırda, ayrı metin parçaları
    _yaz(s, S1 + 80, 300, "B) dokuma")
    _yaz(s, S1 + 12, 311.4, "C) seramik D) ahşap")  # iki seçenek tek metin parçasında

    _yaz(s, S2, 60, "3.  I. Namaz günde beş vakit kılınır.")
    _yaz(s, S2 + 12, 70, "II. Oruç ramazan ayında tutulur.")
    _yaz(s, S2 + 12, 80, "III. Zekât, belirli bir mala sahip")
    _yaz(s, S2 + 23, 90, "olanlara farzdır.")
    _yaz(s, S2 + 12, 108, "Yukarıdakilerden hangileri doğ-")
    _yaz(s, S2 + 12, 118, "rudur?")
    _yaz(s, S2 + 12, 135, "A) Yalnız I")
    _yaz(s, S2 + 80, 135, "B) I ve II")
    _yaz(s, S2 + 12, 146.4, "C) II ve III")
    _yaz(s, S2 + 80, 146.4, "D) I, II ve III")
    _yaz(s, S2 + 30, 190, "(181) İNGİLİZCE – 1", 8.5)
    _yaz(s, S2, 215, "1.  Choose the correct option.")
    _secenekler(s, S2 + 12, 232, ["go", "goes", "going", "gone"])
    _yaz(s, S2, 300, "2.  Which word is a colour?")
    _secenekler(s, S2 + 12, 317, ["red", "table", "run", "chair"])

    _yaz(s, S3 + 30, 60, "(181) ALMANCA – 1", 8.5)  # ortak ders kodu
    _yaz(s, S3, 85, "1.  Wählen Sie das richtige Wort.")
    _secenekler(s, S3 + 12, 102, ["ich", "du", "er", "sie"])
    _yaz(s, S3 + 40, 700, "(532) SEÇMELİ", 8.5)  # iki satıra taşan ders başlığı, sayfanın en altında
    _yaz(s, S3 + 5, 711, "PEYGAMBERİMİZİN HAY. – 2", 8.5)

    # 3. sayfa
    s = belge.new_page(width=W, height=H)
    _kenarlar(s, 3)
    _yaz(s, S1, 60, "1.  Hz. Muhammed (sav) gençlik yıl-")
    _yaz(s, S1 + 12, 70, "larında haksızlığa uğrayanlara yar-")
    _yaz(s, S1 + 12, 80, "dım amacıyla kurulan hangi cemiyete")
    _yaz(s, S1 + 12, 90, "katılmıştır?")
    _secenekler(s, S1 + 12, 107, ["Hilfü'l-Fudûl", "Darü'n-Nedve", "Ukaz Panayırı", "Akabe Biatı"])
    _yaz(s, S1, 180, "2.  Hicret hangi yılda gerçekleşmiştir?")  # anahtarda İPTAL
    _secenekler(s, S1 + 12, 197, ["610", "622", "630", "632"])
    _yaz(s, S1 + 37, 280, "(421) FİZİK – 1", 8.5)
    _yaz(s, S1, 305, "1.  Şekildeki K cismine F kuvveti uy-")  # şekil gerektirir
    _yaz(s, S1 + 12, 315, "gulanıyor.")
    s.draw_rect(pymupdf.Rect(70, 328, 95, 345))
    _yaz(s, 80, 340, "K")
    _yaz(s, 140, 335, "F")
    _yaz(s, 100, 352, "2F")
    _yaz(s, S1 + 12, 370, "Buna göre cisim hangi yöne hareket")
    _yaz(s, S1 + 12, 380, "eder?")
    _secenekler(s, S1 + 12, 397, ["Doğu", "Batı", "Kuzey", "Güney"])
    _yaz(s, S1, 470, "2.  Bir araç 2 saatte 120 kilometre yol")
    _yaz(s, S1 + 12, 480, "alıyor. Buna göre aracın ortalama")
    _yaz(s, S1 + 12, 490, "hızı saatte kaç kilometredir?")
    for i, m in enumerate(["40", "60", "80", "120"]):  # dört seçenek tek satırda
        _yaz(s, S1 + 12 + 35 * i, 507, f"{HARFLER[i]}) {m}")
    _yaz(s, S1, 560, "3.  0,5 sayısının kesir olarak yazılışı")  # alt alta kesirler: düzen bozuk
    _yaz(s, S1 + 12, 570, "aşağıdakilerden hangisidir?")
    for i, (pay, payda) in enumerate([("1", "2"), ("1", "3"), ("2", "3"), ("3", "4")]):
        x = S1 + 12 + 35 * i
        _yaz(s, x + 12, 584, pay)
        _yaz(s, x, 590, f"{HARFLER[i]}) {payda}")
    _yaz(s, S2, 650, "4.  Ses dalgaları aşağıdaki ortamların")  # sütundan sütuna taşan soru
    _yaz(s, S2 + 12, 660, "hangisinde yayılamaz?")
    _yaz(s, S2 + 12, 677, "A) Su")  # hemen altında (sayfa numarasının üstünde) sütun biter
    _yaz(s, S3 + 12, 60, "B) Hava")  # B, C, D sonraki sütunun başında
    _yaz(s, S3 + 12, 71.4, "C) Demir")
    _yaz(s, S3 + 12, 82.8, "D) Boşluk")
    _yaz(s, S3, 120, "5.  Modeller incelendiğinde aşağıda-")  # kökte ipucu yok ama alanında şekil var
    _yaz(s, S3 + 12, 130, "kilerden hangisi söylenebilir?")
    for i in range(5):
        s.draw_rect(pymupdf.Rect(390 + 22 * i, 140, 405 + 22 * i, 160), color=(0, 0, 0), fill=(0.8, 0.8, 0.8))
    _secenekler(
        s, S3 + 12, 185, ["X ve Y aynı maddedir.", "X daha yoğundur.", "Y daha yoğundur.", "Hiçbiri."]
    )
    _yaz(s, S3, 260, "6.  Hangisi vektörel bir büyüklüktür?")  # D seçeneği eksik
    _secenekler(s, S3 + 12, 277, ["Kütle", "Hız", "Zaman"])

    # 4. sayfa: cevap anahtarı. Ortadaki başlık satırı sütun aralıklarının üstünden geçer.
    s = belge.new_page(width=W, height=H)
    _yaz(s, 60, 40, "DENEME SINAVI 1. OTURUM T KİTAPÇIĞI CEVAP ANAHTARI", 10)
    _yaz(s, 150, 55, "AÇIK ÖĞRETİM DENEME YAYINI", 10)
    k1, k2, k3 = 30.0, 200.0, 380.0

    def cevaplar(x: float, y: float, harfler: list[str]) -> None:
        for i, h in enumerate(harfler):
            _yaz(s, x, y + 12 * i, f"{i + 1}.  {h}", 10)

    _yaz(s, k1, 80, "(111) DİN KÜL. AHL. BİL. – 1", 8)  # adı soru sayfasındakinden farklı yazılmış
    cevaplar(k1 + 40, 97, ["A", "A", "D"])
    _yaz(s, k1 + 15, 150, "(181) ALMANCA – 1", 8)  # ortak kod; soru sayfalarındaki sıranın tersi
    cevaplar(k1 + 40, 167, ["D"])
    _yaz(s, k2 + 10, 80, "(181) İNGİLİZCE – 1", 8)
    cevaplar(k2 + 30, 97, ["B", "A"])
    _yaz(s, k2 + 25, 150, "(532) SEÇMELİ", 8)
    _yaz(s, k2, 161, "PEYGAMBERİMİZİN HAYATI – 2", 8)
    cevaplar(k2 + 30, 178, ["A", "İPTAL"])
    _yaz(s, k3 + 10, 80, "(421) FİZİK – 1", 8)
    cevaplar(k3 + 20, 97, ["A", "B", "A", "D", "C", "B"])

    belge.save(yol)
    belge.close()
    return yol


@pytest.fixture(scope="module")
def kitapcik(tmp_path_factory) -> Path:
    if YAZI_TIPI is None:
        pytest.skip(_ATLAMA_NEDENI)
    return _kitapcik_yap(tmp_path_factory.mktemp("meb") / "kitapcik.pdf")


@pytest.fixture(scope="module")
def ayrisma(kitapcik):
    mesajlar: list[str] = []
    sorular, rapor = meb.pdf_ayristir(kitapcik, yaz=mesajlar.append)
    return {s.kimlik.split(":", 2)[2]: s for s in sorular}, rapor, mesajlar


def _ayir(yol: Path, **kw) -> tuple[dict[str, Soru], dict, list[str]]:
    mesajlar: list[str] = []
    sorular, rapor = meb.pdf_ayristir(yol, yaz=mesajlar.append, **kw)
    return {s.kimlik.split(":", 2)[2]: s for s in sorular}, rapor, mesajlar


def test_pdf_testleri_zorunluysa_yazi_tipi_var():
    """CI ``MEB_PDF_TESTLERI_ZORUNLU=1`` verirse PDF testleri sessizce atlanamaz."""
    if os.environ.get("MEB_PDF_TESTLERI_ZORUNLU") and (YAZI_TIPI is None or KALIN_YAZI_TIPI is None):
        pytest.fail(f"PDF testleri atlanacaktı: {_ATLAMA_NEDENI} (ya da kalın yazı tipi yok)")


# --------------------------------------------------------------------------------------------
# PDF ayrıştırma
# --------------------------------------------------------------------------------------------


@pdf_gerekli
def test_rapor_sayilari(ayrisma):
    sorular, rapor, mesajlar = ayrisma
    assert rapor["dosya"] == "kitapcik.pdf"
    assert rapor["sayfa_sayisi"] == 4
    assert rapor["soru_sayfasi"] == 2  # kapak soru sayfası sayılmadı
    assert rapor["anahtar_sayfasi"] == 1
    assert rapor["ders_sayisi"] == 5
    assert rapor["bulunan"] == 14
    assert rapor["tutulan"] == 6 == len(sorular)
    assert rapor["elenen"] == {
        "bozuk_duzen": 1,
        "cevap_yok": 1,
        "gorsel_gerekli": 2,
        "secenek_eksik": 1,
        "yabanci_dil": 3,
    }
    assert sum(rapor["elenen"].values()) + rapor["tutulan"] == rapor["bulunan"]
    assert rapor["anahtarsiz_dersler"] == [] and rapor["sorusuz_anahtarlar"] == []
    assert rapor["dersler"]["Din Kültürü ve Ahlak Bilgisi - 1"] == {"kod": "111", "bulunan": 3, "tutulan": 3}
    assert rapor["dersler"]["Fizik - 1"] == {"kod": "421", "bulunan": 6, "tutulan": 2}
    assert rapor["dersler"]["İngilizce - 1"]["tutulan"] == 0
    assert mesajlar and "14 soru bulundu, 6 tutuldu" in mesajlar[0]


@pdf_gerekli
def test_baslik_ve_sayfa_numarasi_konumla_atilir(kitapcik):
    _, _, _, bilgi = meb._ayristir(kitapcik)
    metinler = [s.metin for s in bilgi["satirlar"]]
    assert bilgi["soru_sayfalari"] == [2, 3]
    assert not any("OTURUM" in m for m in metinler)
    assert "2" not in metinler and "3" not in metinler  # sayfa numaraları
    assert "3" in {p.metin for s in bilgi["satirlar"] for p in s.parcalar}  # kesrin payı olan "3" kalır


@pdf_gerekli
def test_heceleme_ve_cok_satirli_secenek(ayrisma):
    sorular, _, _ = ayrisma
    s = sorular["111:din-kul-ve-ahl-bil-1:1"]
    assert s.soru == "Aşağıdakilerden hangisinde yardımlaşma kavramından bahsedilmektedir?"
    assert s.secenekler == [
        '"Komşusu açken tok yatan bizden değildir." (Örnek kaynak, 1 ve 2. ayetler)',
        "Doğruluk her işin başıdır.",
        "Sabreden derviş muradına ermiş.",
        "Damlaya damlaya göl olur.",
    ]
    assert s.cevap == 0
    assert s.kaynak == "meb-pdf"
    assert s.ders == "Din Kültürü ve Ahlak Bilgisi - 1"
    assert s.kimlik == "pdf:kitapcik:111:din-kul-ve-ahl-bil-1:1"
    assert s.ek == {
        "dosya": "kitapcik.pdf",
        "sayfa": 2,
        "ders_kodu": "111",
        "ders_basligi": "DİN KÜL. VE AHL. BİL. - 1",
        "soru_no": 1,
    }


@pdf_gerekli
def test_gercek_tire_bosluk_doldurma_ve_ayni_satirdaki_secenekler(ayrisma):
    sorular, _, _ = ayrisma
    s = sorular["111:din-kul-ve-ahl-bil-1:2"]
    assert s.soru == (
        "Türk-İslam sanatında çini, ---- süslemelerde sıkça kullanılmıştır. Bu cümlede boş bırakılan yere "
        "aşağıdakilerden hangisi getirilmelidir?"
    )
    assert s.secenekler == ["mimari", "dokuma", "seramik", "ahşap"]


@pdf_gerekli
def test_numarali_onculler_satir_satir(ayrisma):
    sorular, _, _ = ayrisma
    s = sorular["111:din-kul-ve-ahl-bil-1:3"]
    assert s.soru == (
        "I. Namaz günde beş vakit kılınır.\nII. Oruç ramazan ayında tutulur.\n"
        "III. Zekât, belirli bir mala sahip olanlara farzdır.\nYukarıdakilerden hangileri doğrudur?"
    )
    assert s.secenekler == ["Yalnız I", "I ve II", "II ve III", "I, II ve III"]
    assert s.cevap == 3


@pdf_gerekli
def test_tasan_ders_basligi_ve_iptal_cevap(ayrisma):
    sorular, rapor, _ = ayrisma
    s = sorular["532:secmeli-peygamberimizin-hay-2:1"]
    assert s.ders == "Seçmeli Peygamberimizin Hayatı - 2"
    assert s.soru == (
        "Hz. Muhammed (sav) gençlik yıllarında haksızlığa uğrayanlara yardım amacıyla kurulan hangi cemiyete "
        "katılmıştır?"
    )
    assert s.secenekler[0] == "Hilfü'l-Fudûl" and s.cevap == 0
    assert s.ek["sayfa"] == 3
    assert "532:secmeli-peygamberimizin-hay-2:2" not in sorular  # anahtarda İPTAL
    assert rapor["dersler"]["Seçmeli Peygamberimizin Hayatı - 2"] == {
        "kod": "532",
        "bulunan": 2,
        "tutulan": 1,
    }


@pdf_gerekli
def test_sekil_kesir_ve_eksik_secenek_elenir(ayrisma):
    sorular, _, _ = ayrisma
    fizik = sorted(k for k in sorular if k.startswith("421:"))
    assert fizik == ["421:fizik-1:2", "421:fizik-1:4"]
    s = sorular["421:fizik-1:2"]
    assert (
        s.soru == "Bir araç 2 saatte 120 kilometre yol alıyor. Buna göre aracın ortalama hızı saatte kaç "
        "kilometredir?"
    )
    assert s.secenekler == ["40", "60", "80", "120"] and s.cevap == 1


@pdf_gerekli
def test_sutun_degistiren_soru_sayfa_numarasini_almaz(ayrisma):
    sorular, _, _ = ayrisma
    s = sorular["421:fizik-1:4"]
    assert s.soru == "Ses dalgaları aşağıdaki ortamların hangisinde yayılamaz?"
    assert s.secenekler == ["Su", "Hava", "Demir", "Boşluk"]  # "Su 3" değil
    assert s.cevap == 3


@pdf_gerekli
def test_tek_soru_sayfasinda_sayfa_numarasi_secenege_girmez(kitapcik, tmp_path):
    """Tek soru sayfasında tekrarlayan kenar aranamaz; seçeneklerin çok altındaki sayfa numarası yine de
    seçeneğe eklenmez, soru sonraki sütunda sürer."""
    belge = pymupdf.open(kitapcik)
    belge.select([2, 3])  # 3. sayfa + cevap anahtarı
    yol = tmp_path / "tek.pdf"
    belge.save(yol)
    belge.close()
    sorular, rapor, _ = _ayir(yol)
    assert rapor["soru_sayfasi"] == 1
    assert sorular["421:fizik-1:4"].secenekler == ["Su", "Hava", "Demir", "Boşluk"]


@pdf_gerekli
def test_ortak_ders_kodu_adla_eslesir(kitapcik):
    sorular, rapor = meb.pdf_ayristir(kitapcik, haric_dersler=(), yaz=lambda m: None)
    cevaplar = {s.kimlik.split(":", 2)[2]: s.cevap for s in sorular}
    assert cevaplar["181:ingilizce-1:1"] == 1  # B
    assert cevaplar["181:ingilizce-1:2"] == 0  # A
    assert cevaplar["181:almanca-1:1"] == 3  # D
    assert "yabanci_dil" not in rapor["elenen"]


@pdf_gerekli
def test_kullanici_haric_dersi(kitapcik):
    sorular, rapor = meb.pdf_ayristir(kitapcik, haric_dersler=("FİZİK",), yaz=lambda m: None)
    assert rapor["elenen"]["haric_ders"] == 6
    assert not any(s.ek["ders_kodu"] == "421" for s in sorular)


@pdf_gerekli
@pytest.mark.parametrize("haric", ["Din Kültürü", "din kültürü ve ahlak bilgisi", "DİN KÜL.", "111", "(111)"])
def test_haric_ders_dogal_ad_ve_kodla(kitapcik, haric):
    sorular, rapor = meb.pdf_ayristir(kitapcik, haric_dersler=(haric,), yaz=lambda m: None)
    assert rapor["elenen"]["haric_ders"] == 3
    assert not any(s.ek["ders_kodu"] == "111" for s in sorular)
    assert any(s.ek["ders_kodu"] == "421" for s in sorular)


@pdf_gerekli
def test_pdf_klasoru_tekrarlari_atar_ve_bozuk_dosyayi_atlar(kitapcik, tmp_path):
    klasor = tmp_path / "kitapciklar"
    (klasor / "alt").mkdir(parents=True)
    shutil.copy(kitapcik, klasor / "a.pdf")
    shutil.copy(kitapcik, klasor / "alt" / "b.PDF")
    (klasor / "bozuk.pdf").write_bytes(b"bu bir pdf degil")
    (klasor / "notlar.txt").write_text("pdf değil", encoding="utf-8")
    hedef = tmp_path / "cikti" / "meb.jsonl"
    mesajlar: list[str] = []
    rapor = meb.pdf_klasoru_ayristir(klasor, hedef, yaz=mesajlar.append)
    assert rapor["dosya_sayisi"] == 3
    assert rapor["hatali_dosya"] == 1 and "hata" in rapor["dosyalar"]["bozuk.pdf"]
    assert set(rapor["dosyalar"]) == {"a.pdf", "alt/b.PDF", "bozuk.pdf"}
    assert rapor["bulunan"] == 28 and rapor["tutulan"] == 12
    assert rapor["tekrar"] == 6 and rapor["yazilan"] == 6
    assert rapor["elenen"]["yabanci_dil"] == 6
    okunan = meb.soru_oku(hedef)
    assert len(okunan) == 6 and all(s.kimlik.startswith("pdf:a:") for s in okunan)
    assert "6 tekrar atıldı" in mesajlar[-1]


@pdf_gerekli
def test_pdf_klasoru_haric_dersleri_ve_kokleri_uygular(kitapcik, tmp_path):
    klasor = tmp_path / "pdf"
    klasor.mkdir()
    shutil.copy(kitapcik, klasor / "a.pdf")
    hedef = tmp_path / "meb.jsonl"
    mesajlar: list[str] = []
    # Değerlendirme kümesindeki kök biçim farklarıyla (boşluk, büyük harf, tırnak) yazılmış olsa da eşleşir.
    mmlu_koku = (
        "  bir araç 2 saatte 120 kilometre yol alıyor.  Buna göre aracın ortalama hızı saatte kaç "
        "kilometredir? "
    )
    rapor = meb.pdf_klasoru_ayristir(
        klasor, hedef, yaz=mesajlar.append, haric_dersler=("FİZİK",), haric_kokler=[mmlu_koku]
    )
    assert rapor["elenen"]["haric_ders"] == 6  # FİZİK pdf_ayristir'e geçti
    assert "yabanci_dil" not in rapor["elenen"]  # verilen liste varsayılanın yerini alır
    assert rapor["haric_kok"] == 0 and rapor["yazilan"] == 7  # FİZİK sorusu zaten elendi
    rapor = meb.pdf_klasoru_ayristir(klasor, hedef, yaz=mesajlar.append, haric_kokler=[mmlu_koku])
    assert rapor["haric_kok"] == 1 and rapor["yazilan"] == 5
    assert not any("120 kilometre" in s.soru for s in meb.soru_oku(hedef))
    assert "1 değerlendirme sorusuyla aynı" in mesajlar[-1]


@pdf_gerekli
def test_alt_klasorlerdeki_ayni_adli_kitapciklarin_kimlikleri_cakismaz(kitapcik, tmp_path):
    klasor = tmp_path / "pdf"
    (klasor / "2024").mkdir(parents=True)
    (klasor / "2025").mkdir(parents=True)
    _bitis_kitapcigi(klasor / "2024" / "kitapcik.pdf")  # bunda da (421) FİZİK – 1 var
    shutil.copy(kitapcik, klasor / "2025" / "kitapcik.pdf")
    hedef = tmp_path / "meb.jsonl"
    rapor = meb.pdf_klasoru_ayristir(klasor, hedef, yaz=lambda m: None)
    okunan = meb.soru_oku(hedef)
    kimlikler = [s.kimlik for s in okunan]
    assert len(kimlikler) == len(set(kimlikler)) == rapor["yazilan"] == 4 + 6
    assert "pdf:2024/kitapcik:421:fizik-1:2" in kimlikler and "pdf:2025/kitapcik:421:fizik-1:2" in kimlikler
    assert {s.ek["dosya"] for s in okunan} == {"2024/kitapcik.pdf", "2025/kitapcik.pdf"}
    assert set(rapor["dosyalar"]) == {"2024/kitapcik.pdf", "2025/kitapcik.pdf"}


def test_pdf_klasoru_yoksa_hata(tmp_path):
    with pytest.raises(FileNotFoundError):
        meb.pdf_klasoru_ayristir(tmp_path / "yok", tmp_path / "x.jsonl", yaz=lambda m: None)


def _onceki_cikti(yol: Path) -> str:
    meb.soru_yaz([Soru("eski", "meb-pdf", "Deneme", "Önceki iyi çıktı?", ["a", "b", "c", "d"], 0)], yol)
    return yol.read_text(encoding="utf-8")


def test_pdf_klasorunde_pdf_yoksa_hedef_ezilmez(tmp_path):
    klasor = tmp_path / "pdf"
    klasor.mkdir()
    (klasor / "notlar.txt").write_text("pdf değil", encoding="utf-8")
    hedef = tmp_path / "meb.jsonl"
    once = _onceki_cikti(hedef)
    with pytest.raises(FileNotFoundError, match="PDF bulunamadı"):
        meb.pdf_klasoru_ayristir(klasor, hedef, yaz=lambda m: None)
    assert hedef.read_text(encoding="utf-8") == once


@pymupdf_gerekli
def test_hicbir_pdf_okunamazsa_hedef_ezilmez(tmp_path):
    klasor = tmp_path / "pdf"
    klasor.mkdir()
    (klasor / "bozuk.pdf").write_bytes(b"%PDF-1.4 yarim")
    hedef = tmp_path / "meb.jsonl"
    once = _onceki_cikti(hedef)
    with pytest.raises(RuntimeError, match="hiçbiri okunamadı"):
        meb.pdf_klasoru_ayristir(klasor, hedef, yaz=lambda m: None)
    assert hedef.read_text(encoding="utf-8") == once


def test_pymupdf_yoksa_anlasilir_hata_ve_hedef_ezilmez(tmp_path, monkeypatch):
    klasor = tmp_path / "pdf"
    klasor.mkdir()
    (klasor / "kitapcik.pdf").write_bytes(b"%PDF-1.4")
    hedef = tmp_path / "meb.jsonl"
    once = _onceki_cikti(hedef)
    monkeypatch.setitem(sys.modules, "pymupdf", None)  # "import pymupdf" → ImportError
    with pytest.raises(RuntimeError, match=r"pip install -e '\.\[pdf\]'"):
        meb.pdf_klasoru_ayristir(klasor, hedef, yaz=lambda m: None)
    with pytest.raises(RuntimeError, match="pymupdf"):
        meb.pdf_ayristir(klasor / "kitapcik.pdf", yaz=lambda m: None)
    assert hedef.read_text(encoding="utf-8") == once


def test_pdf_dosyalari_buyuk_kucuk_harf_duyarsiz(tmp_path):
    (tmp_path / "alt").mkdir()
    for ad in ("b.pdf", "alt/A.PDF", "c.Pdf", "notlar.txt", "pdf"):
        (tmp_path / ad).write_bytes(b"")
    assert [p.relative_to(tmp_path).as_posix() for p in meb.pdf_dosyalari(tmp_path)] == [
        "alt/A.PDF",
        "b.pdf",
        "c.Pdf",
    ]
    assert meb.pdf_dosyalari(tmp_path / "yok") == []


@pymupdf_gerekli
def test_pdf_acilamazsa_anlasilir_hata(tmp_path):
    bozuk = tmp_path / "bozuk.pdf"
    bozuk.write_bytes(b"%PDF-1.4 yarim")
    with pytest.raises(ValueError, match="PDF"):
        meb.pdf_ayristir(bozuk, yaz=lambda m: None)


@pymupdf_gerekli
def test_pdf_olmayan_icerik_reddedilir(tmp_path):
    """pymupdf HTML'i de açar: tarayıcının ".pdf" diye kaydettiği giriş/hata sayfası "0 soru" sayılmamalı."""
    sayfa = tmp_path / "kitapcik.pdf"
    sayfa.write_text("<!doctype html><html><body><h1>Giriş yapın</h1></body></html>", encoding="utf-8")
    with pytest.raises(ValueError, match="PDF değil"):
        meb.pdf_ayristir(sayfa, yaz=lambda m: None)


@pdf_gerekli
def test_parolali_pdf_anlasilir_hata(kitapcik, tmp_path):
    belge = pymupdf.open(kitapcik)
    yol = tmp_path / "parolali.pdf"
    belge.save(yol, encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="kullanici", owner_pw="sahip")
    belge.close()
    with pytest.raises(ValueError, match="parola"):
        meb.pdf_ayristir(yol, yaz=lambda m: None)


@pdf_gerekli
def test_anahtarsiz_kitapcik_cevapsiz_sayilir_ve_uyarir(kitapcik, tmp_path):
    belge = pymupdf.open(kitapcik)
    belge.delete_page(-1)
    yol = tmp_path / "anahtarsiz.pdf"
    belge.save(yol)
    belge.close()
    sorular, rapor, mesajlar = _ayir(yol)
    assert sorular == {} and rapor["bulunan"] == 14
    assert rapor["elenen"] == {"cevap_yok": 11, "yabanci_dil": 3}
    assert any("cevap anahtarı bulunamadı" in m for m in mesajlar)


@pymupdf_gerekli
def test_metinsiz_pdf_taranmis_olabilir_uyarisi(tmp_path):
    belge = pymupdf.open()
    belge.new_page()
    yol = tmp_path / "bos.pdf"
    belge.save(yol)
    belge.close()
    sorular, rapor, mesajlar = _ayir(yol)
    assert sorular == {} and rapor["bulunan"] == 0
    assert any("OCR" in m for m in mesajlar)


# ---- kitapçığın sonu ve kopuk satırlar --------------------------------------------------------


def _bitis_kitapcigi(yol: Path) -> Path:
    """Son sorunun hemen altında kitapçık sonu uyarısı; bir sorunun seçeneklerinin çok altında da ilgisiz bir
    satır (sütunun dibinde)."""

    def sayfa1(s) -> None:
        _s(s, S1, 60, "(421) FİZİK – 1", 8.5)
        y = _soru_ciz(s, S1, 85, 1, ["Hangisi bir enerji türüdür?"], ["Isı", "Kütle", "Hacim", "Renk"])
        _soru_ciz(s, S1, y, 2, ["Suyun kaynama noktası kaç °C'dir?"], ["50", "75", "100", "125"])
        y = _soru_ciz(s, S2, 60, 3, ["Işık en hızlı nerede yayılır?"], ["Su", "Cam", "Hava", "Boşluk"])
        _s(s, S2 + 12, 690, "Deneme Yayınları, 2025")  # 3. sorunun seçeneklerinin çok altında

    def sayfa2(s) -> None:
        y = _soru_ciz(s, S1, 60, 4, ["Hangisi bir gezegendir?"], ["Ay", "Güneş", "Sirius", "Mars"])
        _s(s, S1 + 30, y - 8, "TEST BİTTİ.", 8)  # son seçeneğin hemen altında (dar aralık)
        _s(s, S1 + 12, y + 3, "CEVAPLARINIZI KONTROL EDİNİZ.", 8)

    return _kitapcik(yol, [sayfa1, sayfa2], [("(421) FİZİK – 1", "ACDD")])


@pdf_gerekli
def test_kitapcik_sonu_uyarisi_ve_kopuk_satir_secenege_girmez(tmp_path):
    sorular, rapor, _ = _ayir(_bitis_kitapcigi(tmp_path / "bitis.pdf"))
    assert rapor["bulunan"] == 4 and rapor["tutulan"] == 4
    assert sorular["421:fizik-1:4"].secenekler == ["Ay", "Güneş", "Sirius", "Mars"]
    assert meb.cevap_metni(sorular["421:fizik-1:4"], 3) == " D) Mars"
    assert sorular["421:fizik-1:3"].secenekler == ["Su", "Cam", "Hava", "Boşluk"]


# ---- birden çok soruya ait yönerge ------------------------------------------------------------


def _grup_kitapcigi(yol: Path) -> Path:
    def sayfa1(s) -> None:
        _s(s, S1, 60, "(544) EDEBİYAT – 4", 8.5)
        _s(s, S1 + 15, 85, "1 - 2. soruları aşağıdaki parçaya")  # dersin hemen başında
        _s(s, S1 + 15, 95, "göre cevaplayınız.")
        _s(s, S1 + 12, 113, "Köyün yaşlı çınarı yüz yıldır aynı")
        _s(s, S1 + 12, 123, "yerde durur, gölgesinde herkes din-")
        _s(s, S1 + 12, 133, "lenir.")
        y = _soru_ciz(s, S1, 155, 1, ["Bu parçanın konusu nedir?"], ["Çınar", "Deniz", "Şehir", "Okul"])
        _soru_ciz(s, S1, y, 2, ["Parçada hangisinden söz edilmez?"], ["Gölge", "Yaşlılık", "Huzur", "Yağmur"])
        y = _soru_ciz(s, S2, 60, 3, ["Hangisi bir bağlaçtır?"], ["ama", "taş", "uzun", "yazmak"])
        _s(s, S2 + 15, y, "4 - 5. sorularda boş bırakılan yere")  # dersin ortasında
        _s(s, S2 + 15, y + 10, "uygun düşen sözcüğü işaretleyiniz.")
        y = _soru_ciz(
            s, S2, y + 30, 4, ["Dün akşam - - - - eve döndük."], ["erkenden", "masa", "mavi", "ile"]
        )
        _soru_ciz(s, S2, y, 5, ["Yarın - - - - yola çıkacağız."], ["sabah", "kalem", "yeşil", "ve"])

    def sayfa2(s) -> None:
        _soru_ciz(s, S1, 60, 6, ["Hangisi bir zamirdir?"], ["biz", "kalem", "yeşil", "hızla"])

    return _kitapcik(yol, [sayfa1, sayfa2], [("(544) EDEBİYAT – 4", "ADAAAA")])


@pdf_gerekli
def test_ortak_yonerge_ve_parca_ilgili_sorulara_baglanir(tmp_path):
    sorular, rapor, _ = _ayir(_grup_kitapcigi(tmp_path / "grup.pdf"))
    assert rapor["bulunan"] == 6 and rapor["tutulan"] == 6, rapor["elenen"]
    parca = (
        "1 - 2. soruları aşağıdaki parçaya göre cevaplayınız. Köyün yaşlı çınarı yüz yıldır aynı yerde "
        "durur, gölgesinde herkes dinlenir."
    )
    assert sorular["544:edebiyat-4:1"].soru == parca + "\nBu parçanın konusu nedir?"
    assert sorular["544:edebiyat-4:2"].soru == parca + "\nParçada hangisinden söz edilmez?"
    # Ders ortasındaki yönerge önceki sorunun son seçeneğine eklenmez.
    assert sorular["544:edebiyat-4:3"].secenekler == ["ama", "taş", "uzun", "yazmak"]
    yonerge = "4 - 5. sorularda boş bırakılan yere uygun düşen sözcüğü işaretleyiniz."
    assert sorular["544:edebiyat-4:4"].soru == yonerge + "\nDün akşam ---- eve döndük."
    assert sorular["544:edebiyat-4:5"].soru == yonerge + "\nYarın ---- yola çıkacağız."
    assert sorular["544:edebiyat-4:6"].soru == "Hangisi bir zamirdir?"


# ---- kısa belgede kenar ayıklaması --------------------------------------------------------------


def _kisa_kitapcik(yol: Path) -> Path:
    """Üç soru sayfası: ders başlıkları, "A) Su" seçenekleri ve aynı soru kökü iki sayfada aynı yerde (üst
    kenar bandında) durur; bunlar sayfa başlığı sanılıp silinmemeli. Anahtarda sorusu olmayan bir ders var."""

    def sayfa(baslik: str | None, no1: int, no2: int, kok2: str):
        def ciz(s) -> None:
            y = 60.0
            if baslik:
                _s(s, S1, 60, baslik, 8.5)
                y = 85.0
            _soru_ciz(
                s, S1, y, no1, [f"Soru {no1}: hangisi bir gezegendir?"], ["Mars", "Ay", "Güneş", "Sirius"]
            )
            _soru_ciz(s, S2, 60, no2, [kok2], ["Su", "Demir", "Taş", "Tahta"])

        return ciz

    return _kitapcik(
        yol,
        [
            sayfa("(421) FİZİK – 1", 1, 2, "Hangisi bir sıvıdır?"),
            sayfa("(422) FİZİK – 2", 1, 2, "Hangisi bir sıvıdır?"),
            sayfa(None, 3, 4, "Hangisi suda yüzer?"),
        ],
        [("(421) FİZİK – 1", "AA"), ("(422) FİZİK – 2", "AAAA"), ("(999) MATEMATİK – 2", "AB")],
    )


@pdf_gerekli
def test_kisa_belgede_icerik_satirlari_sayfa_basligi_sanilmaz(tmp_path):
    sorular, rapor, mesajlar = _ayir(_kisa_kitapcik(tmp_path / "kisa.pdf"))
    assert rapor["ders_sayisi"] == 2 and rapor["bulunan"] == 6 and rapor["tutulan"] == 6, rapor
    assert sorular["421:fizik-1:2"].secenekler == ["Su", "Demir", "Taş", "Tahta"]
    assert sorular["422:fizik-2:2"].soru == "Hangisi bir sıvıdır?"
    assert sorular["422:fizik-2:2"].secenekler == ["Su", "Demir", "Taş", "Tahta"]
    assert rapor["sorusuz_anahtarlar"] == ["(999) MATEMATİK - 2"]
    assert any("soruları bulunamayan dersler: (999) MATEMATİK - 2" in m for m in mesajlar)


# ---- beş seçenekli ders, Arap harfli seçenekler -------------------------------------------------


def _bes_secenekli_kitapcik(yol: Path) -> Path:
    def sayfa1(s) -> None:
        _s(s, S1, 60, "(421) FİZİK – 1", 8.5)
        y = 85.0
        for no in range(1, 5):
            y = _soru_ciz(
                s, S1, y, no, [f"Bir araç {no} saatte kaç km gider?"], [f"{10 * no + j} km" for j in range(4)]
            )
        _s(s, S2, 60, "(999) MATEMATİK – 2", 8.5)
        y = _soru_ciz(
            s, S2, 85, 1, ["Hangisi en büyük sayıdır?"], ["\u0663", "\u0667", "\u0662", "\u0669"]
        )  # sağdan sola yazı
        _soru_ciz(s, S2, y, 2, ["Bir düzine kaç tanedir?"], ["10", "12", "14", "16"])

    def sayfa2(s) -> None:
        _s(s, S1, 60, "(431) KİMYA – 1", 8.5)
        y = 85.0
        for no in range(1, 4):
            y = _soru_ciz(
                s, S1, y, no, [f"Kimya {no}: hangisi elementtir?"], ["Su", "Tuz", "Hava", "Toprak", "Demir"]
            )

    return _kitapcik(
        yol,
        [sayfa1, sayfa2],
        [("(421) FİZİK – 1", "ABCD"), ("(999) MATEMATİK – 2", "DB"), ("(431) KİMYA – 1", "EEE")],
    )


@pdf_gerekli
def test_bes_secenekli_ders_ve_arap_harfli_secenek(tmp_path):
    sorular, rapor, _ = _ayir(_bes_secenekli_kitapcik(tmp_path / "bes.pdf"))
    kimya = sorular["431:kimya-1:1"]
    assert kimya.secenekler == ["Su", "Tuz", "Hava", "Toprak", "Demir"] and kimya.cevap == 4
    assert meb.soru_metni(kimya).endswith("E) Demir\nCevap: E) Demir")
    assert rapor["dersler"]["Kimya - 1"]["tutulan"] == 3  # kitapçığın geneli dört seçenekli
    assert rapor["dersler"]["Fizik - 1"]["tutulan"] == 4
    # Arap rakamlı seçenekler (sağdan sola yazı ters çıkar) varsayılan hariç listesinden bağımsız elenir.
    assert "999:matematik-2:1" not in sorular and "999:matematik-2:2" in sorular
    assert rapor["elenen"] == {"bozuk_duzen": 1}
    sorular, rapor, _ = _ayir(tmp_path / "bes.pdf", haric_dersler=())
    assert "999:matematik-2:1" not in sorular and rapor["elenen"] == {"bozuk_duzen": 1}


# ---- kök biçimi: kalın soru cümlesi, madde işaretleri, akan cümle numaraları, tablo başlığı ------


def _bicim_kitapcigi(yol: Path) -> Path:
    def sayfa1(s) -> None:
        _s(s, S1, 60, "(544) EDEBİYAT – 4", 8.5)
        # 1. öncül listesinden sonra kalın soru cümlesi, araya paragraf boşluğu girmeden (9,5 pt aralık)
        _s(s, S1, 85, "1.  Bir öğrencinin çantasında")
        for i, oncul in enumerate(["I. kalem,", "II. silgi,", "III. cetvel,", "IV. pergel"], 1):
            _s(s, S1 + 12, 85 + 9.5 * i, oncul)
        _s(s, S1 + 12, 85 + 9.5 * 5, "araçlarından hangileri ölç-", kalin=True)
        _s(s, S1 + 12, 85 + 9.5 * 6, "me amacıyla kullanılır?", kalin=True)
        _secenekler(s, S1 + 12, 160, ["I ve II", "Yalnız III", "III ve IV", "II ve IV"])
        # 2. madde işaretli liste
        _s(s, S1, 235, "2.  • Yazları sıcak ve kurak geçer.")
        _s(s, S1 + 12, 245, "• Kışları ılık ve yağışlıdır.")
        _s(s, S1 + 12, 262, "Bu özellikler hangi iklime aittir?")
        _secenekler(s, S1 + 12, 279, ["Akdeniz", "Karasal", "Karadeniz", "Kutup"])
        # 3. metnin içinde akan cümle numaraları; "(III)" satır başına denk gelir
        _s(s, S2, 60, "3.  (I) Sabah yola çıktık. (II) Yol")
        _s(s, S2 + 12, 70, "boyunca hiç durmadık.")
        _s(s, S2 + 12, 80, "(III) Öğlen köye vardık. (IV) Ak-")
        _s(s, S2 + 12, 90, "şam eve döndük.")
        _s(s, S2 + 12, 107, "Bu parçadaki numaralanmış cümle-")
        _s(s, S2 + 12, 117, "lerin hangisinde zaman bildiren")
        _s(s, S2 + 12, 127, "bir söz yoktur?")
        _secenekler(s, S2 + 12, 144, ["I", "II", "III", "IV"])
        # 4. iki sütunlu seçenekler ve tablo başlığı; satır sonunda bölünmüş birleşik sözcük
        _s(s, S2, 220, "4.  Aşağıdakilerin hangisinde kütle-")
        _s(s, S2 + 12, 230, "çekim ile ilgili kavram ve birimi")
        _s(s, S2 + 12, 240, "doğru eşleştirilmiştir?")
        _s(s, S2 + 30, 257, "Kavram")
        _s(s, S2 + 100, 257, "Birim")
        for i, (kavram, birim) in enumerate(
            [("Kuvvet", "Newton"), ("Kütle", "Metre"), ("Zaman", "Kilogram")]
        ):
            _s(s, S2 + 12, 274 + 11.4 * i, f"{HARFLER[i]}) {kavram}")
            _s(s, S2 + 100, 274 + 11.4 * i, birim)
        _s(s, S2 + 12, 274 + 11.4 * 3, "D) Uzunluk")
        _s(s, S2 + 100, 274 + 11.4 * 3, "Saniye")
        # 5. satır başına denk gelen "II. Abdülhamit" öncül değildir
        _s(s, S3, 60, "5.  Osmanlı Devleti'nde ilk anayasa")
        _s(s, S3 + 12, 70, "II. Abdülhamit döneminde ilan edil-")
        _s(s, S3 + 12, 80, "miştir. Bu anayasanın adı nedir?")
        _secenekler(s, S3 + 12, 97, ["Kanun-i Esasi", "Tanzimat", "Islahat", "Senet"])
        # 6. birleşik sözcük satır içinde: "Kütle-çekim"
        _s(s, S3, 170, "6.  Kütle-çekim kuvveti aşağıdakiler-")
        _s(s, S3 + 12, 180, "den hangisine bağlıdır?")
        _secenekler(s, S3 + 12, 197, ["Kütle", "Renk", "Koku", "Tat"])

    def sayfa2(s) -> None:
        _soru_ciz(s, S1, 60, 7, ["Hangisi bir mevsimdir?"], ["Yaz", "Masa", "Kalem", "Taş"])

    return _kitapcik(yol, [sayfa1, sayfa2], [("(544) EDEBİYAT – 4", "CABAAAA")])


@pdf_gerekli
@kalin_gerekli
def test_kok_bicimi_pdf(tmp_path):
    sorular, rapor, _ = _ayir(_bicim_kitapcigi(tmp_path / "bicim.pdf"))
    assert rapor["bulunan"] == 7 and rapor["tutulan"] == 7, rapor["elenen"]
    k = {no: sorular[f"544:edebiyat-4:{no}"] for no in range(1, 8)}
    assert k[1].soru == (
        "Bir öğrencinin çantasında\nI. kalem,\nII. silgi,\nIII. cetvel,\nIV. pergel\n"
        "araçlarından hangileri ölçme amacıyla kullanılır?"
    )
    assert (
        k[2].soru == "• Yazları sıcak ve kurak geçer.\n• Kışları ılık ve yağışlıdır.\n"
        "Bu özellikler hangi iklime aittir?"
    )
    assert k[3].soru == (
        "(I) Sabah yola çıktık. (II) Yol boyunca hiç durmadık. (III) Öğlen köye vardık. (IV) Akşam eve "
        "döndük. Bu parçadaki numaralanmış cümlelerin hangisinde zaman bildiren bir söz yoktur?"
    )
    assert k[4].soru == (
        "Aşağıdakilerin hangisinde kütle-çekim ile ilgili kavram ve birimi doğru eşleştirilmiştir?"
        "\nKavram / Birim"
    )
    assert k[4].secenekler == ["Kuvvet / Newton", "Kütle / Metre", "Zaman / Kilogram", "Uzunluk / Saniye"]
    assert (
        k[5].soru == "Osmanlı Devleti'nde ilk anayasa II. Abdülhamit döneminde ilan edilmiştir. "
        "Bu anayasanın adı nedir?"
    )
    assert k[6].soru == "Kütle-çekim kuvveti aşağıdakilerden hangisine bağlıdır?"


# --------------------------------------------------------------------------------------------
# Yardımcı kurallar
# --------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("onceki", "sonraki", "beklenen"),
    [
        ("bahsedil-", "mektedir", "bahsedilmektedir"),
        ("varlığı-", "nın delilidir", "varlığının delilidir"),
        ("Türk-", "İslam", "Türk-İslam"),
        ("Kur'an-", "ı Kerim", "Kur'an-ı Kerim"),
        ("Al-", "i İmran", "Al-i İmran"),
        ("yol x-", "y düzlemi", "yol x-y düzlemi"),
        ("1853-", "1856", "1853-1856"),
        ("çini, - - - -", "süsleme", "çini, - - - - süsleme"),
        ("bir cümle", "devam eder", "bir cümle devam eder"),
    ],
)
def test_satir_birlestir(onceki, sonraki, beklenen):
    assert meb._satir_birlestir(onceki, sonraki) == beklenen


@pytest.mark.parametrize(
    ("onceki", "sonraki", "beklenen"),
    [
        ("Kütle-", "çekim kuvveti", "Kütle-çekim kuvveti"),
        ("kütle-", "çekimi", "kütle-çekimi"),  # ekli biçim
        ("iyon-", "dipol", "iyon-dipol"),
        ("dipol-", "dipol", "dipol-dipol"),
        ("amaç-", "sonuç", "amaç-sonuç"),
        ("bahsedil-", "mektedir", "bahsedilmektedir"),  # sözlükte yok: heceleme
        ("kütle-", "si", "kütlesi"),  # "kütle"nin başka devamı: heceleme
    ],
)
def test_satir_birlestir_belgedeki_birlesik_sozcukler(onceki, sonraki, beklenen):
    satirlar = [
        meb._Satir(1, 0, [], m)
        for m in (
            "Kütle-çekim kuvveti evrenseldir.",
            "İyon-dipol ve Dipol-dipol etkileşimi",
            "amaç-sonuç ilişkisi",
        )
    ]
    bilesikler = meb._bilesikleri_topla(satirlar)
    assert meb._satir_birlestir(onceki, sonraki, bilesikler) == beklenen


def _g(metin: str, yeni_paragraf: bool = False, kalin: bool = False, hucreli: bool = False):
    return meb._GovdeSatiri(metin, yeni_paragraf, kalin, hucreli)


def test_govde_metni_kalin_soru_cumlesi_onculden_ayrilir():
    govde = [
        _g("Bu parça edebiyatın;", True, kalin=True),
        _g("I. felsefe,"),
        _g("II. psikoloji,"),
        _g("III. tarih,"),
        _g("IV. coğrafya"),
        _g("bilim dallarından hangileriyle iliş-", kalin=True),
        _g("kisine örnektir?", kalin=True),
    ]
    assert meb._govde_metni(govde) == (
        "Bu parça edebiyatın;\nI. felsefe,\nII. psikoloji,\nIII. tarih,\nIV. coğrafya\n"
        "bilim dallarından hangileriyle ilişkisine örnektir?"
    )


def test_govde_metni_madde_isaretleri():
    govde = [
        _g("Dünya'nın;", True),
        _g("• küresel şekli,"),
        _g("• kendi ekseninde dön-"),
        _g("mesi,"),
        _g("özellikleri hangisini etkiler?", True),
    ]
    assert (
        meb._govde_metni(govde)
        == "Dünya'nın;\n• küresel şekli,\n• kendi ekseninde dönmesi,\nözellikleri hangisini etkiler?"
    )


def test_govde_metni_akan_ve_satir_satir_cumle_numaralari():
    akan = [
        _g("(I) Bir. (II) İki", True),
        _g("cümle. (III) Üç."),
        _g("(IV) Dört cümle."),  # satır başına denk geldi, paragraf boşluğu yok
        _g("Hangisi yanlıştır?", True),
    ]
    assert meb._govde_metni(akan) == "(I) Bir. (II) İki cümle. (III) Üç. (IV) Dört cümle. Hangisi yanlıştır?"
    satir_satir = [_g("(I) Bir.", True), _g("(II) İki."), _g("(III) Üç."), _g("Hangisi yanlıştır?", True)]
    assert meb._govde_metni(satir_satir) == "(I) Bir.\n(II) İki.\n(III) Üç.\nHangisi yanlıştır?"
    paragrafli = [_g("(I) Bir. (II) İki.", True), _g("(III) Üç. (IV) Dört.", True), _g("Hangisi?", True)]
    assert meb._govde_metni(paragrafli) == "(I) Bir. (II) İki.\n(III) Üç. (IV) Dört.\nHangisi?"


def test_govde_metni_romen_rakami_dizi_olmali():
    govde = [_g("İlk anayasa", True), _g("II. Abdülhamit döneminde ilan"), _g("edilmiştir. Adı nedir?")]
    assert meb._govde_metni(govde) == "İlk anayasa II. Abdülhamit döneminde ilan edilmiştir. Adı nedir?"
    tek = [_g("Olay", True), _g("I. Dünya Savaşı'nda olmuştur.", True), _g("Hangisi?", True)]
    assert meb._govde_metni(tek) == "Olay I. Dünya Savaşı'nda olmuştur. Hangisi?"


def test_govde_metni_tablo_basligi_yalniz_tablo_seceneklerde():
    govde = [_g("Hangisidir?", True, kalin=True), _g("Neden / Sonuç", True, hucreli=True)]
    assert meb._govde_metni(govde, tablo_secenekli=True) == "Hangisidir?\nNeden / Sonuç"
    assert meb._govde_metni(govde) == "Hangisidir? Neden / Sonuç"


@pytest.mark.parametrize(
    ("kok", "beklenen"),
    [
        ("Şekildeki K cismine F kuvveti uygulanıyor.", True),
        ("Şekilde verilen devrede ampul yanar mı?", True),
        ("Şekil II'deki sistem dengededir.", True),
        ("Deney sonuçları tabloda verilmiştir.", True),
        ("p ve q önermelerinin doğruluk tablosu aşağıdadır.", True),
        ("Haritada numaralanmış alanlardan hangisi?", True),
        ("Haritada Gulf Stream akıntısı, hareket yönleriyle gösterilmiştir.", True),
        ("Kutu grafiği aşağıdakilerden hangisidir?", True),
        ("Bu cümlede altı çizili sözcük hangi anlamdadır?", True),
        ("Bir problemin çözümüne ait akış şeması aşağıda verilmiştir.", True),
        ("Aşağıdaki kavram şemasında boş bırakılan yer hangisidir?", True),
        ("Çizelgede X ile gösterilen değer kaçtır?", True),
        ("Verilen çizelgeye göre hangi ay en sıcaktır?", True),
        ("Şemadaki boşluğa hangisi yazılmalıdır?", True),
        ("İnsan bu şekilde davranmalıdır.", False),
        ("Toplamı 10 olacak şekilde sayılar seçiliyor.", False),
        ("Düşüncelerini en net ve en berrak şekilde dile getirir.", False),
        ("Divan şiirinde nazım şekli ve şekil özellikleri nelerdir?", False),
        ("Avrupalı ressamların tablolarındaki halılar ünlüdür.", False),
        ("Periyodik tabloda aynı grupta bulunan elementler", False),
        ("1/500 000 ölçekli bir haritada iki kent arası 4 cm'dir.", False),
        ("p ∨ q önermesinin geçerliliği çözümleyici çizelgeyle denetlenirken ilk işlem hangisidir?", False),
        ('Akış şemasında "x tektir." ifadesinin sembolle gösterimi hangisidir?', False),
        ("Bilgi şeması kavramını ilk kim kullanmıştır?", False),
    ],
)
def test_gorsel_gerekli(kok, beklenen):
    assert meb._gorsel_gerekli(kok) is beklenen


def _parca(metin: str, x0: float = 45.0, y0: float = 100.0) -> meb._Parca:
    return meb._Parca(sayfa=1, x0=x0, y0=y0, x1=x0 + 5 * len(metin), y1=y0 + 9, metin=metin, boyut=7.5)


def _ham(*satirlar: list[str]) -> meb._HamSoru:
    ham = meb._HamSoru(no=1, sayfa=1)
    for i, parcalar in enumerate(satirlar):
        ps = [_parca(m, 45.0 + 60 * j, 100.0 + 10 * i) for j, m in enumerate(parcalar)]
        ham.satirlar.append(meb._Satir(1, 0, ps, " ".join(parcalar)))
    return ham


def test_bozuk_mu_soru_numarasi_ve_madde_isareti_kirinti_sayilmaz():
    secenekler = ["Yalnız I", "I ve II", "II ve III", "I, II ve III"]
    # Ayrı parça olarak çıkmış soru numarası ("8.") ve öncül işareti ("I.") kırıntı değildir.
    ham = _ham(
        ["8.", "Aşağıdakilerden hangileri doğrudur?"], ["I.", "Birinci öncül"], ["II.", "İkinci öncül"]
    )
    assert not meb._bozuk_mu(ham, secenekler)
    # Gerçek kırıntılar (şekil etiketleri) yine sayılır.
    assert meb._bozuk_mu(_ham(["8.", "Şekle göre hangisi?"], ["K"], ["L"]), secenekler)


def test_bozuk_mu_secenege_tasmis_metin():
    ham = _ham(["Hangisi bir bağlaçtır?"])
    tasmis = [
        "ama",
        "taş",
        "uzun",
        "yazmak 4 - 5. soruları aşağıdaki parçaya göre cevaplayınız. Köyün çınarı",
    ]
    assert meb._bozuk_mu(ham, tasmis)
    assert not meb._bozuk_mu(ham, ["Yalnız I", "I ve II", "II ve III", "I, II ve III"])
    assert not meb._bozuk_mu(ham, ["0", "1", "2", "Belirlenemez"])  # kısa uzun seçenek taşma değildir


@pytest.mark.parametrize(
    ("baslik", "ad"),
    [
        ("DİN KÜL. VE AHL. BİL. - 1", "Din Kültürü ve Ahlak Bilgisi - 1"),
        ("DİN KÜL. AHL. BİL. - 2", "Din Kültürü ve Ahlak Bilgisi - 2"),
        ("TEMEL DİNİ BİL.- 1", "Temel Dini Bilgiler - 1"),
        ("SEÇMELİ PEYGAMBERİMİZİN HAY. - 7", "Seçmeli Peygamberimizin Hayatı - 7"),
        ("SEÇ. TÜRK DİLİ VE EDEBİYATI - 3", "Seçmeli Türk Dili ve Edebiyatı - 3"),
        ("İSLAM KÜLTÜR VE MEDENİYETİ - 1", "İslam Kültür ve Medeniyeti - 1"),
        ("FIKIH - 1", "Fıkıh - 1"),
    ],
)
def test_ders_adi(baslik, ad):
    assert meb._ders_adi(baslik) == ad


@pytest.mark.parametrize(
    ("metin", "beklenen"), [("C", 2), (" a ", 0), ("E", 4), ("İPTAL", None), ("A-C", None)]
)
def test_cevap_indeksi(metin, beklenen):
    assert meb._cevap_indeksi(metin) == beklenen


# --------------------------------------------------------------------------------------------
# Bölme, istem biçimi, JSONL
# --------------------------------------------------------------------------------------------


def _soru(kimlik: str, kok: str, secenekler=("bir", "iki", "üç", "dört"), cevap: int = 0, **ek) -> Soru:
    return Soru(
        kimlik=kimlik, kaynak="test", ders="Deneme", soru=kok, secenekler=list(secenekler), cevap=cevap, ek=ek
    )


def test_bol_kararli_ve_siradan_bagimsiz():
    sorular = [_soru(f"k{i}", f"Soru kökü numara {i} nedir?") for i in range(300)]
    a = {s.kimlik: s.bolum for s in meb.bol([_soru(s.kimlik, s.soru) for s in sorular])}
    b = {s.kimlik: s.bolum for s in meb.bol([_soru(s.kimlik, s.soru) for s in reversed(sorular)])}
    assert a == b
    assert set(a.values()) == {"egitim", "dogrulama", "test"}
    c = {s.kimlik: s.bolum for s in meb.bol([_soru(s.kimlik, s.soru) for s in sorular], tohum="baska")}
    assert c != a


def test_bol_surecler_arasi_kararli():
    """Bölme Python'un rastgele ``hash`` tohumuna bağlı değildir."""
    kod = (
        "import sys; sys.path.insert(0, sys.argv[1])\n"
        "from turkce_model import meb\n"
        "ss = [meb.Soru(str(i), 't', 'D', f'Soru {i} kökü?', ['a', 'b'], 0) for i in range(500)]\n"
        "print(''.join(s.bolum[0] for s in meb.bol(ss)))\n"
    )
    kok = str(Path(__file__).resolve().parents[1])
    ciktilar = {
        subprocess.run(
            [sys.executable, "-c", kod, kok],
            capture_output=True,
            text=True,
            check=True,
            env={**os.environ, "PYTHONHASHSEED": tohum},
        ).stdout
        for tohum in ("0", "12345")
    }
    assert len(ciktilar) == 1 and len(next(iter(ciktilar)).strip()) == 500


def test_bol_oranlar_ve_kenar_durumlar():
    sorular = [_soru(f"k{i}", f"Kök {i}") for i in range(4000)]
    bolumler = [s.bolum for s in meb.bol(sorular)]
    assert abs(bolumler.count("egitim") / 4000 - 0.8) < 0.03
    assert abs(bolumler.count("test") / 4000 - 0.1) < 0.02
    assert {s.bolum for s in meb.bol([_soru(f"k{i}", f"Kök {i}") for i in range(50)], (1, 0, 0))} == {
        "egitim"
    }
    with pytest.raises(ValueError):
        meb.bol(sorular, (0.5, -0.1, 0.6))


def test_bol_tekrarlari_atar_ayni_kok_ayni_bolume_duser():
    a = _soru("a", "Türkiye'nin başkenti neresidir?", ("Ankara", "İzmir", "Bursa", "Konya"))
    tekrar = _soru("a2", "  türkiye’nin   başkenti neresidir? ", ("Konya", "Bursa", "İzmir", "Ankara"))
    baska = _soru("b", "Türkiye'nin başkenti neresidir?", ("Ankara", "Sivas", "Van", "Muş"))
    sonuc = meb.bol([a, tekrar, baska])
    assert [s.kimlik for s in sonuc] == [
        "a",
        "b",
    ]  # büyük/küçük harf, tırnak ve seçenek sırası farkı tekrar sayılır
    assert a.bolum == baska.bolum != ""


def test_bol_yalniz_isaretle_ayrilan_sorular_tekrar_sayilmaz():
    ciftler = [
        ("x + 2 = 5 ise x kaçtır?", "x - 2 = 5 ise x kaçtır?", ("3", "7", "-3", "-7")),
        (
            "Ca^(2+) iyonunun elektron sayısı kaçtır?",
            "Ca^(2-) iyonunun elektron sayısı kaçtır?",
            ("18", "20", "22", "24"),
        ),
        (
            "a > b ise hangisi doğrudur?",
            "a < b ise hangisi doğrudur?",
            ("a - b > 0", "a - b < 0", "b > a", "a = b"),
        ),
    ]
    sorular = [
        _soru(f"{i}{t}", kok, sec)
        for i, (k1, k2, sec) in enumerate(ciftler)
        for t, kok in (("a", k1), ("b", k2))
    ]
    assert [s.kimlik for s in meb.bol(sorular)] == ["0a", "0b", "1a", "1b", "2a", "2b"]


def test_bol_satir_kirilimi_farkli_kopyalar_ayni_bolume_duser():
    bir = meb._govde_metni([_g("Bölgenin sosyo-", True), _g("ekonomik yapısı hangisidir?")])
    iki = meb._govde_metni([_g("Bölgenin sosyo-ekonomik yapısı", True), _g("hangisidir?")])
    assert bir != iki  # satır sonunda tire heceleme sanıldı
    for tohum in map(str, range(40)):
        s1, s2 = _soru("1", bir), _soru("2", iki)
        meb.bol([s1, s2], tohum=tohum)
        assert s1.bolum == s2.bolum


def test_istem_ve_cevap_metni_bicimi():
    s = _soru("x", "Hangisi bir renktir?", ("masa", "kırmızı", "koşmak", "sandalye"), cevap=1)
    s.ders = "Türk Dili ve Edebiyatı - 4"
    beklenen = (
        "Ders: Türk Dili ve Edebiyatı - 4\nSoru: Hangisi bir renktir?\nA) masa\nB) kırmızı\nC) koşmak\n"
        "D) sandalye\nCevap:"
    )
    assert meb.istem(s) == beklenen
    assert meb.cevap_metni(s, 1) == " B) kırmızı"
    assert meb.soru_metni(s) == beklenen + " B) kırmızı"
    bes = _soru("y", "I. bir\nII. iki", ("a", "b", "c", "d", "e"), cevap=4)
    assert meb.istem(bes).endswith("D) d\nE) e\nCevap:")
    assert "Soru: I. bir\nII. iki\nA) a" in meb.istem(bes)
    assert meb.soru_metni(bes).endswith("Cevap: E) e")
    with pytest.raises(ValueError):
        meb.istem(_soru("z", "Tek seçenek", ("yalnız",)))


def test_soru_yaz_oku_gidis_donus(tmp_path):
    sorular = [
        _soru(
            "pdf:a:111:din-1:1", "I. Şükür\nII. Sabır\nHangileri erdemdir?", cevap=2, sayfa=3, ders_kodu="111"
        ),
        Soru(
            "mmlu:History:test:0",
            "turkishmmlu",
            "Tarih",
            "Malazgirt hangi yıldadır?",
            ["1071", "1453"],
            0,
            "test",
        ),
    ]
    yol = tmp_path / "alt" / "sorular.jsonl"
    assert meb.soru_yaz(sorular, yol) == 2
    ham = yol.read_text(encoding="utf-8")
    assert "Şükür" in ham and ham.count("\n") == 2  # ensure_ascii=False, satır başına bir soru
    assert json.loads(ham.splitlines()[0])["ek"] == {"sayfa": 3, "ders_kodu": "111"}
    assert meb.soru_oku(yol) == sorular
    assert not list(yol.parent.glob("*.yaziliyor"))


# --------------------------------------------------------------------------------------------
# TurkishMMLU (ağ sahte)
# --------------------------------------------------------------------------------------------


class _SahteYanit:
    def __init__(self, veri, durum: int = 200, basliklar: dict | None = None):
        self._veri = veri
        self.status_code = durum
        self.headers = basliklar or {}

    def raise_for_status(self) -> None:
        import requests

        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}", response=self)

    def json(self):
        return self._veri


def _sahte_mmlu(cagrilar: list[str], bozuk: bool = False):
    def get(url, timeout=None, headers=None, **_):
        assert timeout is not None  # zaman aşımı verilmeli
        cagrilar.append(url)
        bolum, dosya = url.split(f"/resolve/{meb.MMLU_SURUM}/")[1].split("/")
        ders = unquote(dosya).removeprefix("TurkishMMLU_").removesuffix(".json")
        kayitlar = [
            {
                "question": (
                    f"{ders} {bolum} sorusu:\r\nI. birinci  öncül\r\nII. ikinci\r\nöncül\r\nHangileri doğru?"
                ),
                "choices": ["Yalnız I", "Yalnız II", "I ve II", "Hiçbiri", "  Her ikisi\nde "],
                "answer": "C",
            },
            {
                "question": f"{ders} {bolum}: Türk–İslam “sanatı” nedir?",
                "choices": ["a", "b", "c", "d", "e"],
                "answer": " e ",
            },
            # dev ve test dosyasında aynı soru (kaynakta bir kez böyle var); cevap sayı olarak
            {
                "question": f"{ders}: Su kaç derecede kaynar?",
                "choices": ["50", "100", "150", "200", "250"],
                "answer": 1,
            },
        ]
        if bozuk and ders == "Physics" and bolum == "test":
            kayitlar.append({"question": "Bozuk kayıt", "choices": ["a", "b"], "answer": "F"})
        return _SahteYanit(kayitlar)

    return get


def test_mmlu_indir_sahte_ag(tmp_path, monkeypatch):
    requests = pytest.importorskip("requests")
    cagrilar: list[str] = []
    monkeypatch.setattr(requests, "get", _sahte_mmlu(cagrilar))
    hedef = tmp_path / "mmlu.jsonl"
    mesajlar: list[str] = []
    sorular = meb.mmlu_indir(hedef, yaz=mesajlar.append)

    assert len(cagrilar) == 18
    surum = f"https://huggingface.co/datasets/AYueksel/TurkishMMLU/resolve/{meb.MMLU_SURUM}/"
    assert all(u.startswith(surum) for u in cagrilar)  # sabitlenmiş sürüm, "main" değil
    assert any(u.endswith("/dev/TurkishMMLU_Religion%20and%20Ethics.json") for u in cagrilar)
    assert any(u.endswith("/test/TurkishMMLU_Turkish%20Language%20and%20Literature.json") for u in cagrilar)
    assert not any("turkishmmlu_sub" in u for u in cagrilar)

    assert len(sorular) == 9 * 5  # her derste dev 3 + test 2: dev/test tekrarı atıldı
    assert {s.ders for s in sorular} == set(meb.MMLU_DERSLERI.values())
    ilk = next(s for s in sorular if s.kimlik == "mmlu:Religion_and_Ethics:dev:0")
    assert ilk.ders == "Din Kültürü ve Ahlak Bilgisi"
    assert ilk.kaynak == "turkishmmlu"
    assert ilk.soru == "Religion and Ethics dev sorusu:\nI. birinci öncül\nII. ikinci öncül\nHangileri doğru?"
    assert ilk.secenekler[-1] == "Her ikisi de"
    assert ilk.cevap == 2 and ilk.bolum == ""
    assert ilk.ek == {"ders_en": "Religion and Ethics", "bolum_kaynak": "dev"}
    ikinci = next(s for s in sorular if s.kimlik == "mmlu:Physics:test:1")
    assert ikinci.soru == 'Physics test: Türk-İslam "sanatı" nedir?' and ikinci.cevap == 4
    sayi = next(s for s in sorular if s.kimlik == "mmlu:Physics:dev:2")
    assert sayi.cevap == 1 and sayi.secenekler[1] == "100"
    assert "mmlu:Physics:test:2" not in {s.kimlik for s in sorular}
    assert meb.soru_oku(hedef) == sorular
    assert "45 soru" in mesajlar[-1] and "9 tekrar atıldı" in mesajlar[-1]


def test_mmlu_bozuk_kayit_varsa_hicbir_sey_yazilmaz(tmp_path, monkeypatch):
    requests = pytest.importorskip("requests")
    monkeypatch.setattr(requests, "get", _sahte_mmlu([], bozuk=True))
    hedef = tmp_path / "mmlu.jsonl"
    with pytest.raises(RuntimeError, match=r"1 kayıt okunamadı \(Physics/test:3\)"):
        meb.mmlu_indir(hedef, yaz=lambda m: None)
    assert not hedef.exists()


def test_mmlu_indir_ag_hatasi_anlasilir(tmp_path, monkeypatch):
    requests = pytest.importorskip("requests")
    monkeypatch.setattr(meb.time, "sleep", lambda s: None)
    cagrilar: list[str] = []

    def kopuk(url, **_):
        cagrilar.append(url)
        raise requests.ConnectionError("bağlantı yok")

    monkeypatch.setattr(requests, "get", kopuk)
    with pytest.raises(RuntimeError, match="TurkishMMLU indirilemedi"):
        meb.mmlu_indir(tmp_path / "m.jsonl", yaz=lambda m: None)
    assert len(cagrilar) == meb._DENEME  # bağlantı hatası yeniden denenir
    assert not (tmp_path / "m.jsonl").exists()

    cagrilar.clear()
    monkeypatch.setattr(requests, "get", lambda url, **_: cagrilar.append(url) or _SahteYanit(None, 404))
    with pytest.raises(RuntimeError, match="404"):
        meb.mmlu_indir(tmp_path / "m.jsonl", yaz=lambda m: None)
    assert len(cagrilar) == 1  # 404 yeniden denenmez


def test_mmlu_json_olmayan_yanit_yeniden_denenmez(tmp_path, monkeypatch):
    """200 dönen HTML (araya giren giriş sayfası): JSON hatasıdır, bağlantı hatası değil."""
    requests = pytest.importorskip("requests")
    beklemeler: list[float] = []
    monkeypatch.setattr(meb.time, "sleep", beklemeler.append)
    cagrilar: list[str] = []

    def html(url, **_):
        cagrilar.append(url)
        yanit = requests.models.Response()
        yanit.status_code = 200
        yanit._content = b"<!doctype html><html>giris sayfasi</html>"
        yanit.url = url
        return yanit

    monkeypatch.setattr(requests, "get", html)
    with pytest.raises(RuntimeError, match="geçerli JSON değil"):
        meb.mmlu_indir(tmp_path / "m.jsonl", yaz=lambda m: None)
    assert len(cagrilar) == 1 and beklemeler == []


def test_mmlu_429_retry_after_ile_yeniden_denenir(tmp_path, monkeypatch):
    requests = pytest.importorskip("requests")
    beklemeler: list[float] = []
    monkeypatch.setattr(meb.time, "sleep", beklemeler.append)
    asil = _sahte_mmlu([])
    durum = {"ilk": True}

    def get(url, **kw):
        if durum.pop("ilk", False):
            return _SahteYanit(None, 429, {"Retry-After": "7"})
        return asil(url, **kw)

    monkeypatch.setattr(requests, "get", get)
    assert len(meb.mmlu_indir(tmp_path / "m.jsonl", yaz=lambda m: None)) == 45
    assert beklemeler == [7.0]
