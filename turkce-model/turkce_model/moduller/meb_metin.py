"""OCR metninden MEB sorusu.

OCR modülü sayfayı okuma sırasıyla, konumsuz düz metin olarak verir. Bu dosya o metni, PDF ayrıştırıcısının
(``turkce_model/meb.py``) beklediği satırlara çevirir; ders başlığı → soru → seçenek durum makinesi, cevap
anahtarı eşleştirmesi, elemeler ve rapor aynı koddan geçer.

Konum bilgisi olmadığı için PDF yolundan farklar:

* Sütun ve girinti yoktur: rakamla başlayan bir devam satırı ("2. ayetler)", "2. Dünya Savaşı'ndan…") soru
  başı gibi görünür. ``_sahte_soru_baslarini_birlestir`` her derste, numaraları artan ve en çok sayıda
  "seçenekleri olan soru" veren soru başı dizisini seçer; seçilmeyen satırlar önceki satıra eklenir.
* Şekiller yalnız modelin bıraktığı ``[GÖRSEL]`` işaretinden bilinir; işaretin değdiği sorular elenir.
* Cevap anahtarında aynı dersin altında bir soru numarası iki farklı harfle okunmuşsa (yan yana sütunlar
  karışmış demektir) o dersin anahtarı güvenilmez sayılır ve dersin soruları ``cevap_yok`` ile elenir:
  yanlış cevapla eğitmektense soruyu atmak daha iyidir.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Callable, Iterable
from pathlib import Path

from .. import meb
from ..metin import buyuk, normallestir
from .ocr import GORSEL_ISARETI, OcrModulu

SATIR_YUKSEKLIGI = 10.0
SATIR_ARALIGI = 12.0  # ardışık satırlar arası 2 pt: paragraf eşiğinin (0,25 × yükseklik) altında
BOSLUK_ARALIGI = 6.0  # boş satır: yeni paragraf sayılır, ama "sütun kapandı" eşiğinin (3 × yükseklik) altında
SAYFA_GENISLIGI = 1000.0

_CIFT = re.compile(r"(\d{1,2})\s*[.)\-:]?\s*([A-Ea-e]|[İi]PTAL|[İi]ptal)(?=\s|$)")
_YALNIZ_RAKAM = re.compile(r"^\d{1,3}$")


def _anahtar_ac(satir: str) -> list[str]:
    """Cevap anahtarı satırını "N. X" satırlarına açar: "1 / A / 2 / C", "1. A 2. C", "1-A 2-C".

    Çiftler dışında metin kalıyorsa (ders başlığı, açıklama) satır olduğu gibi döner.
    """
    duz = satir.replace(" / ", " ").replace("|", " ")
    ciftler = _CIFT.findall(duz)
    if ciftler and not _CIFT.sub("", duz).strip():
        return [f"{no}. {harf}" for no, harf in ciftler]
    return [satir]


def _kenar_anahtari(satir: str) -> str:
    return re.sub(r"\d+", "#", satir.strip().lower())


def _tekrarlayan_kenarlar(sayfalar: list[list[str]]) -> set[str]:
    """Sayfaların ilk/son iki dolu satırında, sayfaların en az yarısında (ve en az 3 sayfada) yinelenen satırlar:
    oturum başlığı, sayfa numarası. Rakamlar aynı sayılır ("Sayfa 3" = "Sayfa 4")."""
    sayac: Counter[str] = Counter()
    for satirlar in sayfalar:
        dolu = [s for s in satirlar if s.strip()]
        for anahtar in {_kenar_anahtari(s) for s in dolu[:2] + dolu[-2:]}:
            sayac[anahtar] += 1
    esik = max(3, (len(sayfalar) + 1) // 2)
    return {k for k, n in sayac.items() if n >= esik}


def _anahtar_basligi_mi(satir: str, sira: int) -> bool:
    """"CEVAP ANAHTARI" başlığı: sayfanın ilk satırlarında ya da tamamı büyük harfli kısa bir satır."""
    if not meb._CEVAP_ANAHTARI.search(buyuk(satir)):
        return False
    return sira < 8 or (len(satir) <= 80 and meb._buyuk_harfli(satir))


def _satir(sayfa: int, y: float, metin: str) -> meb._Satir:
    parca = meb._Parca(
        sayfa=sayfa, x0=0.0, y0=y, x1=min(SAYFA_GENISLIGI, 5.0 * len(metin)), y1=y + SATIR_YUKSEKLIGI,
        metin=metin, boyut=SATIR_YUKSEKLIGI,
    )
    return meb._Satir(sayfa=sayfa, sutun=0, parcalar=[parca], metin=metin)


def _secenek_sayisi(satirlar: list) -> int:
    """Satırlarda sırayla okunan seçenek işareti sayısı ("A)" sonra "B)" …)."""
    n = 0
    for s in satirlar:
        n += sum(1 for harf, _ in meb._secenege_bol(s.metin, n) if harf is not None)
    return n


def _sahte_soru_baslarini_birlestir(satirlar: list) -> list:
    """Soru başı gibi görünen devam satırlarını önceki satıra ekler.

    Her derste (iki ders başlığı arası) "N. …" ile başlayan satırlar adaydır. Numaraları artan aday
    dizilerinden, kendi seçenekleri (en az iki) olan soru sayısı en çok olanı seçilir; eşitlikte daha çok aday
    tutan dizi kazanır (seçenekleri okunamayan bir soru, öncekinin son seçeneğine karışmasın diye).
    """
    sonuc: list = []
    bolum: list = []

    def bosalt() -> None:
        adaylar = [(i, int(m.group(1))) for i, s in enumerate(bolum) if (m := meb._SORU_BASI.match(s.metin))]
        secilen: set[int] = set()
        if adaylar:
            sinirlar = [i for i, _ in adaylar] + [len(bolum)]

            def puan(a: int, b: int) -> int:  # a. adaydan b. adaya (ya da bölüm sonuna) kadar olan soru geçerli mi
                return int(_secenek_sayisi(bolum[sinirlar[a] : sinirlar[b]]) >= 2)

            n = len(adaylar)
            en_iyi: list[tuple[int, int]] = [(0, 1)] * n  # (geçerli soru sayısı, tutulan aday sayısı): a hariç
            onceki: list[int | None] = [None] * n
            for b in range(n):
                for a in range(b):
                    if adaylar[a][1] < adaylar[b][1]:
                        deger = (en_iyi[a][0] + puan(a, b), en_iyi[a][1] + 1)
                        if deger > en_iyi[b]:
                            en_iyi[b], onceki[b] = deger, a
            son = max(range(n), key=lambda a: (en_iyi[a][0] + puan(a, n), en_iyi[a][1], -a))
            k: int | None = son
            while k is not None:
                secilen.add(adaylar[k][0])
                k = onceki[k]
        aday_satirlari = {i for i, _ in adaylar}
        for i, s in enumerate(bolum):
            if i in aday_satirlari and i not in secilen and sonuc:
                hedef = sonuc[-1]  # devam satırı: önceki satıra eklenir (sayfa değişmiş olsa da)
                hedef.metin = f"{hedef.metin} {s.metin}"
                hedef.parcalar[0].metin = hedef.metin
                hedef.parcalar[0].x1 = min(SAYFA_GENISLIGI, 5.0 * len(hedef.metin))
            else:
                sonuc.append(s)
        bolum.clear()

    i = 0
    while i < len(satirlar):
        baslik = meb._ders_basligi(satirlar, i)
        if baslik:
            bosalt()
            sonuc.extend(satirlar[i : i + baslik[2]])
            i += baslik[2]
            continue
        bolum.append(satirlar[i])
        i += 1
    bosalt()
    return sonuc


def metinden_ayrik(sayfalar: Iterable[str]) -> tuple[list, list, meb._Belge, dict]:
    """Sayfa metinlerinden, ``meb._ayristir``'ın döndürdüğü dörtlüyü kurar: (bölümler, anahtarlar, belge, bilgi)."""
    ham_sayfalar = [[normallestir(s) for s in metin.split("\n")] for metin in sayfalar]
    kenarlar = _tekrarlayan_kenarlar(ham_sayfalar)

    soru_satirlari: list[meb._Satir] = []
    anahtar_satirlari: list[meb._Satir] = []
    parcalar: dict[int, list] = {}
    resimler: dict[int, list] = {}
    boyutlar: dict[int, tuple[float, float]] = {}
    soru_sayfalari: list[int] = []
    anahtar_sayfalari: list[int] = []
    anahtarda = False
    for no, satirlar in enumerate(ham_sayfalar, 1):
        dolu = [i for i, s in enumerate(satirlar) if s.strip()]
        uc = set(dolu[:2] + dolu[-2:])
        y = 0.0
        bosluk = False
        sayfa_satirlari: list[meb._Satir] = []
        bekleyen_gorsel: float | None = None  # işaretten önceki satırın üst kenarı
        gorseller: list[tuple[float, float]] = []
        sira = 0
        for i, metin in enumerate(satirlar):
            metin = metin.strip()
            if not metin:
                bosluk = True
                continue
            if i in uc and (_kenar_anahtari(metin) in kenarlar or _YALNIZ_RAKAM.match(metin)):
                continue  # sayfa başlığı / numarası
            if metin == GORSEL_ISARETI:
                ust = sayfa_satirlari[-1].y0 if sayfa_satirlari else y
                bekleyen_gorsel = ust if bekleyen_gorsel is None else bekleyen_gorsel
                bosluk = True
                continue
            if not anahtarda and _anahtar_basligi_mi(metin, sira):
                anahtarda = True
                sira += 1
                continue
            sira += 1
            for parca in _anahtar_ac(metin) if anahtarda else [metin]:
                if bosluk and sayfa_satirlari:
                    y += BOSLUK_ARALIGI
                bosluk = False
                s = _satir(no, y, parca)
                y += SATIR_ARALIGI
                sayfa_satirlari.append(s)
                (anahtar_satirlari if anahtarda else soru_satirlari).append(s)
                if bekleyen_gorsel is not None:  # şekil, önceki satırdan bu satıra kadar olan alana değer
                    gorseller.append((bekleyen_gorsel, s.y1))
                    bekleyen_gorsel = None
        if bekleyen_gorsel is not None:  # sayfanın sonundaki şekil
            gorseller.append((bekleyen_gorsel, y + SATIR_YUKSEKLIGI))
        parcalar[no] = [p for s in sayfa_satirlari for p in s.parcalar]
        resimler[no] = [(0.0, ust, SAYFA_GENISLIGI, alt) for ust, alt in gorseller]
        boyutlar[no] = (SAYFA_GENISLIGI, max(y, SATIR_ARALIGI))
        if sayfa_satirlari:
            (anahtar_sayfalari if anahtarda else soru_sayfalari).append(no)

    soru_satirlari = _sahte_soru_baslarini_birlestir(soru_satirlari)
    for no in parcalar:  # birleştirilen satırlar belgeden de düşer
        parcalar[no] = [p for s in soru_satirlari + anahtar_satirlari if s.sayfa == no for p in s.parcalar]
    bolumler = meb._sorulari_topla(soru_satirlari, meb._soru_x_konumlari(soru_satirlari))
    anahtarlar = _guvenilir_anahtarlar(anahtar_satirlari)
    belge = meb._Belge(parcalar, boyutlar, {no: [] for no in parcalar}, resimler, len(ham_sayfalar))
    bilgi = {"soru_sayfalari": soru_sayfalari, "anahtar_sayfalari": anahtar_sayfalari, "satirlar": soru_satirlari}
    return bolumler, anahtarlar, belge, bilgi


def _guvenilir_anahtarlar(satirlar: list) -> list:
    """Cevap anahtarı bölümleri; bir numarası çelişkili okunan dersin bütün cevapları silinir."""
    anahtarlar = meb._anahtari_topla(satirlar)
    okunan: dict[int, dict[int, set]] = {}
    mevcut = None
    i = 0
    sirali = iter(anahtarlar)
    while i < len(satirlar):
        baslik = meb._ders_basligi(satirlar, i)
        if baslik:
            mevcut = next(sirali, None)
            i += baslik[2]
            continue
        m = meb._CEVAP_SATIRI.match(satirlar[i].metin)
        if m and mevcut is not None:
            okunan.setdefault(id(mevcut), {}).setdefault(int(m.group(1)), set()).add(meb._cevap_indeksi(m.group(2)))
        i += 1
    for a in anahtarlar:
        if any(len(harfler) > 1 for harfler in okunan.get(id(a), {}).values()):
            a.cevaplar.clear()  # yan yana sütunlar karışmış: bu dersin anahtarına güvenilmez
    return anahtarlar


def metinden_ayristir(
    sayfalar: Iterable[str],
    dosya_adi: str,
    haric_dersler: Iterable[str] = meb.VARSAYILAN_HARIC_DERSLER,
    yaz: Callable[[str], object] = print,
) -> tuple[list[meb.Soru], dict]:
    """OCR ile okunmuş bir kitapçığın sayfa metinlerinden soruları çıkarır: (tutulan sorular, rapor).

    ``meb.pdf_ayristir`` ile aynı elemeleri ve raporu kullanır; rapora ``okuma = "ocr"`` eklenir.
    """
    ayrik = metinden_ayrik(sayfalar)
    sorular, rapor = meb.pdf_ayristir(Path(dosya_adi), haric_dersler, yaz=yaz, dosya_adi=dosya_adi, ayrik=ayrik)
    rapor["okuma"] = "ocr"
    return sorular, rapor


def metin_katmani_var(pdf: Path, en_az_karakter: int = 100, en_az_harf_orani: float = 0.6) -> bool:
    """PDF'in kullanılabilir bir metin katmanı var mı? Taranmış (resim) sayfalarda yoktur; yazı tipi eşlemesi
    bozuk PDF'lerde metin vardır ama harf oranı düşüktür."""
    pymupdf = meb._pymupdf()
    with pymupdf.open(pdf) as belge:
        metinler = [sayfa.get_text() for sayfa in belge]
    if not metinler:
        return False
    dolu = "".join(metinler)
    bosluksuz = [c for c in dolu if not c.isspace()]
    if len(bosluksuz) < en_az_karakter * len(metinler):
        return False
    harf = sum(1 for c in bosluksuz if c.isalpha() and (c.isascii() or c in "çğıöşüâîûÇĞİÖŞÜÂÎÛ"))
    return harf / len(bosluksuz) >= en_az_harf_orani


def ocr_ayristirici(modul: OcrModulu, kip: str = "gerekirse") -> Callable[..., tuple[list[meb.Soru], dict]]:
    """``meb.pdf_klasoru_ayristir`` için dosya ayrıştırıcısı.

    ``kip``: ``"gerekirse"`` — yalnız metin katmanı olmayan (taranmış ya da yazı tipi bozuk) PDF'ler OCR ile
    okunur; ``"hepsi"`` — bütün PDF'ler OCR ile okunur. OCR ile okunan soruların ``ek`` alanına
    ``okuma = "ocr"`` ve modelin adı yazılır.
    """
    if kip not in ("gerekirse", "hepsi"):
        raise ValueError(f"kip 'gerekirse' ya da 'hepsi' olmalı: {kip!r}")

    def ayristir(
        pdf: Path,
        haric_dersler: Iterable[str] = meb.VARSAYILAN_HARIC_DERSLER,
        yaz: Callable[[str], object] = print,
        dosya_adi: str | None = None,
    ) -> tuple[list[meb.Soru], dict]:
        pdf = Path(pdf)
        ad = dosya_adi or pdf.name
        if kip == "gerekirse" and metin_katmani_var(pdf):
            return meb.pdf_ayristir(pdf, haric_dersler, yaz=yaz, dosya_adi=ad)
        yaz(f"{ad}: OCR ile okunuyor ({modul.ayar.model})")
        sorular, rapor = metinden_ayristir(modul.pdf_oku(pdf, yaz), ad, haric_dersler, yaz)
        for s in sorular:
            s.ek["okuma"] = "ocr"
            s.ek["ocr_model"] = modul.ayar.model
        return sorular, rapor

    return ayristir


def tek_soru(metin: str, ders: str = "Genel") -> meb.Soru | None:
    """Tek bir sorunun OCR metninden (kök + "A) …" seçenekleri) cevabı bilinmeyen bir ``Soru`` kurar.

    Baştaki soru numarası ("7.") atılır. En az iki seçenek ve boş olmayan bir kök yoksa ``None``.
    ``cevap`` 0 yazılır ve ``ek["cevap_bilinmiyor"]`` işaretlenir: bu soru eğitimde ya da ölçümde kullanılmaz.
    """
    ham = meb._HamSoru(no=1, sayfa=1)
    y = 0.0
    bosluk = False
    ilk = True
    for satir in normallestir(metin).split("\n"):
        t = satir.strip()
        if not t or t == GORSEL_ISARETI:
            bosluk = True
            continue
        if ilk:
            m = meb._SORU_BASI.match(t)
            if m:
                t = m.group(2) or ""
            ilk = False
            if not t:
                continue
        if bosluk and ham.satirlar:
            y += BOSLUK_ARALIGI
        s = _satir(1, y, t)
        y += SATIR_ARALIGI
        meb._satir_ekle(ham, s, t, bosluk or not ham.satirlar)
        bosluk = False
    secenekler = [meb._secenek_metni(p) for p in ham.secenekler]
    govde = meb._govde_metni(ham.govde)
    if len(secenekler) < 2 or not govde or any(not s for s in secenekler):
        return None
    return meb.Soru(
        kimlik="resim:1", kaynak="ocr", ders=ders, soru=govde, secenekler=secenekler, cevap=0,
        ek={"cevap_bilinmiyor": True},
    )
