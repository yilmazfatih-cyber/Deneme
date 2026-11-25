"""OCR metninden MEB sorusu.

OCR modülü sayfayı okuma sırasıyla, konumsuz düz metin olarak verir. Bu dosya o metni, PDF ayrıştırıcısının
(``turkce_model/meb.py``) beklediği satırlara çevirir; ders başlığı → soru → seçenek durum makinesi, cevap
anahtarı eşleştirmesi, elemeler ve rapor aynı koddan geçer.

Konum bilgisi olmadığı için PDF yolundan farklar:

* Sütun ve girinti yoktur: rakamla başlayan bir devam satırı ("2. ayetler)", "2. Dünya Savaşı'ndan…") soru
  başı gibi görünür. ``_sahte_soru_baslarini_birlestir`` her derste, numaraları artan ve en çok sayıda
  "seçenekleri olan soru" veren soru başı dizisini seçer; seçilmeyen satırlar önceki satıra eklenir. Soru başı
  ayırt edilemiyorsa komşu sorular elenir.
* Şekiller yalnız modelin bıraktığı ``[GÖRSEL]`` işaretinden bilinir; işaretin değdiği sorular elenir. Çıktısı
  ``en_fazla_token``'da kesilmiş sayfanın sonundaki ``[KESİK]`` işareti de öyle.
* Cevap anahtarında aynı dersin altında bir soru numarası iki farklı harfle okunmuşsa (yan yana sütunlar
  karışmış demektir) o dersin anahtarı güvenilmez sayılır ve dersin soruları ``cevap_yok`` ile elenir:
  yanlış cevapla eğitmektense soruyu atmak daha iyidir. Bu dersler ve başlığının altında hiç cevap okunamayan
  dersler uyarıda adıyla anılır.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Callable, Iterable
from itertools import pairwise
from pathlib import Path

from .. import meb
from ..metin import buyuk, kucuk, normallestir
from .ocr import GORSEL_ISARETI, KESIK_ISARETI, OcrModulu

SATIR_YUKSEKLIGI = 10.0
SATIR_ARALIGI = 12.0  # ardışık satırlar arası 2 pt: paragraf eşiğinin (0,25 × yükseklik) altında
BOSLUK_ARALIGI = 6.0  # boş satır: yeni paragraf sayılır, ama "sütun kapandı" eşiğinin (3 × yükseklik) altında
SAYFA_GENISLIGI = 1000.0

_KENAR_SATIRI = 3  # sayfanın ilk/son bu kadar dolu satırında sayfa başlığı aranır
# Sınav sonu (kapanış) satırı, küçük harfe çevrilmiş metinde; OCR'ın I/İ karışıklığına ve küçük harfe dayanıklı ("TEST
# BITTI.", "Test bitti.", "Başarılar dileriz.", "TESTİMİZ BİTMİŞTİR.", "SINAV SÜRESİ BİTMİŞTİR.", "1. OTURUM BİTTİ.").
# Satırın tamamı bir ya da birkaç kapanış cümlesi olmalı; cümleler nokta, ünlem, virgül, noktalı virgül, iki nokta ya
# da çizgiyle bağlanabilir ("…" ve uzun çizgi normallestir'de "..." ve "-" olur). Metindeki "Sınav bitti, sonuçlar…"
# ya da "Sınav bitti mi diye…" satırı kapanış değildir.
_KAPANIS_CUMLESI = (
    r"(?:test(?:[iı]m[iı]z)?|s[ıi]nav(?:[ıi]m[ıi]z)?|(?:\d{1,2}\s*\.\s*)?oturum)(?:\s+s[üu]res[iı])?\s+"
    r"(?:b[iı]tt[iı]|b[iı]tm[iı][şs]t[iı]r|sona\s+er(?:d[iı]|m[iı][şs]t[iı]r))"
    r"|(?:l[üu]tfen\s+)?cevaplar[ıi]n[ıi]z[ıi]\s+kontrol\s+ed[iı]n[iı]z"
    r"|ba[şs]ar[ıi]lar(?:\s+d[iı]ler[iı]z)?|[iı]y[iı]\s+[şs]anslar|d[iı][ğg]er\s+teste\s+ge[çc][iı]n[iı]z"
)
_SINAV_SONU_OCR = re.compile(rf"^(?:(?:{_KAPANIS_CUMLESI})\s*[.!,;:-]*\s*)+$")
_IPTAL = re.compile(r"[İIi][Pp][Tt][Aa][Ll]")
_SECENEK_IZI = re.compile(r"(?<!\S)[A-E]\)")  # soru metninde kalmış seçenek işareti: başka bir soru karışmış
_CIFT = re.compile(r"(\d{1,2})\s*[.)\-:]?\s*([A-Ea-e]|[İi]PTAL|[İi]ptal)(?=\s|$)")
_YALNIZ_RAKAM = re.compile(r"^\d{1,3}$")
_PARANTEZLI_SORU_BASI = re.compile(r"^(\d{1,2})\)(?:\s+(.*))?$")  # fotoğraftaki "7) …" (kitapçıkta "7. …")


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


def _baslik_devamlari(satirlar: list[str]) -> dict[int, int]:
    """Sayfadaki sarılmış ders başlıklarının devam satırları ("(532) SEÇMELİ" + "PEYGAMBERİMİZİN HAYATI - 2"):
    ``meb._ders_basligi`` hangi satırları başlığa katıyorsa onlar, sırası → başlık satırının sırası. Modelin
    işaretleri atlanır."""
    dolu = [i for i, s in enumerate(satirlar) if s.strip() and s.strip() not in (GORSEL_ISARETI, KESIK_ISARETI)]
    nesneler = [_satir(1, 0.0, satirlar[i].strip()) for i in dolu]
    devam: dict[int, int] = {}
    k = 0
    while k < len(nesneler):
        baslik = meb._ders_basligi(nesneler, k)
        n = baslik[2] if baslik else 1
        devam.update(dict.fromkeys(dolu[k + 1 : k + n], dolu[k]))
        k += n
    return devam


def _devam_anahtari(satir: str) -> str:
    """Başlık devam satırlarını karşılaştırmak için: harfler küçük ve şapkasız/noktasız (OCR'ın I/İ karışıklığı),
    boşluk ve noktalama atılır ("HAYATI -2" = "HAYATI - 2", "PEYGAMBERIMIZIN" = "PEYGAMBERİMİZİN")."""
    return re.sub(r"\W+", "", kucuk(satir).translate(meb._ASCII))


def _uzaklik(a: str, b: str) -> int:
    """İki dizginin harf düzeyinde düzeltme uzaklığı (Levenshtein): eklenen, silinen ya da değişen harf sayısı."""
    onceki = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        simdiki = [i]
        for j, cb in enumerate(b, 1):
            simdiki.append(min(onceki[j] + 1, simdiki[j - 1] + 1, onceki[j - 1] + (ca != cb)))
        onceki = simdiki
    return onceki[-1]


def _baslik_onegi(ad: str, devami: list[str], kayitli: str) -> int | None:
    """Yinelenen ders başlığının devam satırlarından kaçı başlığın kendisidir? İlk satırdaki adla birleşince dersin ilk
    başlığından kaydedilen ada (``_devam_anahtari``'yla) en yakın okunan önek seçilir; eşit uzaklıkta uzunu ("- 3"
    yerine okunan "- 8" de başlığındır). Uzaklık kayıtlı adın beşte birini (en az 2 harf) aşarsa ``None``: başlık
    o derse ait değil. OCR'ın harf farkı ("HAYAT", "- 7"), satır bölme farkı (iki ya da üç satır) ve tek satırda
    okunmuş sarılı başlık böylece aynı ders sayılır; sayfaya taşan içerik başlığa katılmaz: uzaklığı artırır."""
    en_iyi: tuple[int, int] | None = None
    okunan = ad
    for k in range(len(devami) + 1):
        if k:
            okunan += _devam_anahtari(devami[k - 1])
        d = _uzaklik(okunan, kayitli)
        if d <= max(2, len(kayitli) // 5) and (en_iyi is None or d <= en_iyi[0]):
            en_iyi = (d, k)
    return None if en_iyi is None else en_iyi[1]


def _kenar_adayi_mi(s: str) -> bool:
    """Sayfa başlığı olabilir mi? Ders başlığı, soru başı, seçenek, cevap çifti, "CEVAP ANAHTARI", soru cümlesi
    ("…?"), modelin işaretleri, birden çok soruya ait yönerge ("5 - 6. SORULARI … CEVAPLAYINIZ.") ve tek başına
    öncül işareti ("III.") içeriktir, kenar sayılmaz: çok sayfada yinelenen "[KESİK]" atılsaydı kesik sorular yarım
    seçenekle, yönerge atılsaydı sorular ortak metinsiz tutulurdu."""
    return not (
        _icerik_satiri_mi(s) or s.endswith("?") or _anahtar_basligi_mi(s) or _cevap_cifti_sayisi([s])
        or s in (GORSEL_ISARETI, KESIK_ISARETI) or meb._GRUP_YONERGESI.match(kucuk(s))
        or (meb._ISARET.match(s) and not any(c.isdigit() for c in s))
    )


def _tekrarlayan_kenarlar(sayfalar: list[list[str]]) -> set[str]:
    """Sayfaların ilk/son ``_KENAR_SATIRI`` dolu satırında yinelenen satırlar: oturum başlığı, kitapçık adı, sayfa
    numarası. Rakamlar aynı sayılır ("Sayfa 3" = "Sayfa 4"). Eşik aşağıda; içerik satırları (``_kenar_adayi_mi``)
    ve sarılmış ders başlıklarının devam satırları hiç kenar sayılmaz: anahtar başlıkları yineler, kısa kitapçıkta
    "ALMANCA - 1" dersin ilk sayfasında ve anahtarda görülüp kenar sayılınca ders adı kısalıyordu."""
    sayac: Counter[str] = Counter()
    kucuk_harfli: set[str] = set()
    for satirlar in sayfalar:
        devam = _baslik_devamlari(satirlar)
        dolu = [i for i, s in enumerate(satirlar) if s.strip()]
        kenar = [satirlar[i].strip() for i in dolu[:_KENAR_SATIRI] + dolu[-_KENAR_SATIRI:] if i not in devam]
        adaylar = [s for s in kenar if _kenar_adayi_mi(s)]
        for s in adaylar:
            if any(c.islower() for c in s):
                kucuk_harfli.add(_kenar_anahtari(s))
        for anahtar in {_kenar_anahtari(s) for s in adaylar}:
            sayac[anahtar] += 1
    # Küçük harf taşımayan satırlar ("1. OTURUM", "A KİTAPÇIĞI", "#") sayfaların dörtte birinde (en az 2) yinelenince
    # kenardır (tek/çift sayfada farklı başlık, kısa kitapçık); küçük harfli satırlarda (soru metni olabilir) eski eşik.
    gevsek, siki = max(2, -(-len(sayfalar) // 4)), max(3, (len(sayfalar) + 1) // 2)
    return {k for k, n in sayac.items() if n >= (siki if k in kucuk_harfli else gevsek)}


def _icerik_satiri_mi(satir: str) -> bool:
    """Ders başlığı, seçenek ya da soru başı mı? "1. OTURUM" gibi büyük harfli numaralı satır soru başı değildir."""
    if meb._DERS_BASLIGI.match(satir) or meb._SECENEK.match(satir):
        return True
    m = meb._SORU_BASI.match(satir)
    # Tek başına "5." (numarası ayrı blokta okunmuş soru) da soru başıdır; sayfa başlığı sayılmaz.
    return bool(m and (not m.group(2) or not meb._buyuk_harfli(m.group(2))))


def _anahtar_basligi_mi(satir: str) -> bool:
    """"CEVAP ANAHTARI" başlığına benzeyen satır: bu sözü taşıyan, en çok 80 karakterlik, içinde cümle noktalaması
    olmayan satır. Sıra sayısının noktası sayılmaz ("DENEME SINAVI 1. OTURUM CEVAP ANAHTARI" başlıktır).

    Kapaktaki "Cevap anahtarı, kitapçığın sonundadır." başlık sayılmaz; virgülsüz yazılmışı da buna uyar, o yüzden
    ``metinden_ayrik`` başlıktan sonra en az iki cevap çifti arar. Yoksa sonraki bütün sayfalar anahtar sanılırdı.
    """
    if not meb._CEVAP_ANAHTARI.search(buyuk(satir)) or len(satir) > 80:
        return False
    return not re.search(r"[.,;!?]", re.sub(r"\b\d{1,2}\.(?=\s)", "", satir).rstrip(" :."))


def _cevap_cifti_sayisi(satirlar: Iterable[str]) -> int:
    """Satırlardaki cevap anahtarı çiftleri ("1. A", "2 / C", "3-İPTAL")."""
    n = 0
    for t in satirlar:
        for p in _anahtar_ac(t.strip()):
            m = meb._CEVAP_SATIRI.match(p)
            n += bool(m and (meb._cevap_indeksi(m.group(2)) is not None or _IPTAL.fullmatch(m.group(2).strip(" ."))))
    return n


def _siradaki_soru_no(satirlar: list[str]) -> int | None:
    """Verilen satırlardaki ilk soru başının numarası (yoksa ``None``)."""
    for s in satirlar:
        m = meb._SORU_BASI.match(s.strip())
        if m:
            return int(m.group(1))
    return None


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
    """Soru başı gibi görünen devam satırlarını önceki satıra ekler; ayırt edilemeyen soru başlarını işaretler.

    Her derste (iki ders başlığı arası) "N. …" ile başlayan satırlar adaydır. Numaraları artan aday
    dizilerinden sırasıyla şunlarda en iyisi seçilir: kendi seçenekleri (en az iki) olan soru sayısı, paragraf
    başındaki (boş satırdan sonra gelen) aday sayısı, tutulan aday sayısı (seçenekleri okunamayan bir soru
    öncekinin son seçeneğine karışmasın diye). Bu puan soru başını ayırt edemiyorsa ilgili satırlara
    ``supheli`` yazılır ve ``metinden_ayrik`` o soruları eler.
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

            def paragraf(a: int) -> int:  # aday aynı sayfada boş satırdan sonra mı başlıyor (metinden_ayrik işaretler)
                return int(getattr(bolum[adaylar[a][0]], "paragraf", False))

            # (geçerli soru, paragraf başındaki aday, tutulan aday): a'nın kendi parçası hariç. Boş satırdan sonra
            # gelen aday gerçek soru başıdır; seçeneğin ya da kökün "2. Viyana Kuşatması" diye süren satırı değildir.
            en_iyi: list[tuple[int, int, int]] = [(0, paragraf(b), 1) for b in range(n)]
            onceki: list[int | None] = [None] * n
            for b in range(n):
                for a in range(b):
                    if adaylar[a][1] < adaylar[b][1]:
                        deger = (en_iyi[a][0] + puan(a, b), en_iyi[a][1] + paragraf(b), en_iyi[a][2] + 1)
                        if deger > en_iyi[b]:
                            en_iyi[b], onceki[b] = deger, a
            son = max(range(n), key=lambda a: (en_iyi[a][0] + puan(a, n), *en_iyi[a][1:], -a))
            k: int | None = son
            zincir: list[int] = []
            while k is not None:
                secilen.add(adaylar[k][0])
                zincir.append(k)
                k = onceki[k]
            zincir.sort()
            # (geçerli soru, paragraf başı) puanı soru başını ayırt edemiyorsa komşu sorular şüphelidir, elenir:
            # (a) seçilmemiş bir aday eşit puanlı bir zincirde yer alıyor (paragraf bilgisi yokken "2. Viyana
            # Kuşatması" ile gerçek 2. soru); (b) seçilen aday seçeneksiz ve paragraf başında değil, çıkarılsa puan
            # değişmezdi (dersin son sorusunun seçeneği "6. …" diye sürüyor ya da seçenekleri okunamamış soru).
            # Sayfa ya da sütun başı da paragraf başı sayılır; dersin son adayı orada olsa bile soru cümlesi ("…?")
            # taşımıyorsa önceki seçeneğin devamıdır ("D) II. Mahmut ve" + sayfa başında "6. Ordu kuruluşu").
            geri: list[tuple[int, int]] = [(0, 0)] * n
            for a in reversed(range(n)):
                en = (puan(a, n), 0)
                for b in range(a + 1, n):
                    if adaylar[a][1] < adaylar[b][1]:
                        en = max(en, (puan(a, b) + geri[b][0], geri[b][1] + paragraf(b)))
                geri[a] = en
            toplam = [(en_iyi[a][0] + geri[a][0], en_iyi[a][1] + geri[a][1]) for a in range(n)]
            en_yuksek = max(toplam)
            supheli: set[int] = set()
            for x in range(n):
                if toplam[x] == en_yuksek and x not in zincir:
                    supheli.update([z for z in zincir if z < x][-2:] or zincir[:1])
            for j, z in enumerate(zincir):
                sonraki = zincir[j + 1] if j + 1 < len(zincir) else n
                if puan(z, sonraki):
                    continue
                soru_cumlesiz_son = sonraki == n and not any("?" in s.metin for s in bolum[sinirlar[z] :])
                if not paragraf(z) or soru_cumlesiz_son:
                    supheli.update(zincir[max(0, j - 1) : j + 1])
            for z in supheli:
                bolum[adaylar[z][0]].supheli = True
        aday_satirlari = {i for i, _ in adaylar}
        for i, s in enumerate(bolum):
            if i in aday_satirlari and i not in secilen and sonuc and i > 0:  # ders başlığına eklenmez
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


def _sonra_soru_var_mi(ham_sayfalar: list[list[str]], no: int, i: int, kod: str | None, kenarlar: set[str]) -> bool:
    """``no``. sayfanın ``i``. satırından sonra aynı dersin bir sorusu geliyor mu? Başka bir dersin başlığına ya da
    cevap anahtarına kadar bakılır; sayfa kenarları ve dersin sayfa başında yinelenen başlığı atlanır. "1." ile
    başlayan soru yeni bir dersindir (kodu aynı olsa da)."""
    for p in range(no - 1, len(ham_sayfalar)):
        for t in ham_sayfalar[p][i + 1 if p == no - 1 else 0 :]:
            t = t.strip()
            if not t or _kenar_anahtari(t) in kenarlar:
                continue
            baslik = meb._DERS_BASLIGI.match(t)
            if (baslik and baslik.group(1) != kod) or _anahtar_basligi_mi(t):
                return False
            m = meb._SORU_BASI.match(t)
            if m and _icerik_satiri_mi(t):
                return int(m.group(1)) != 1
    return False


def metinden_ayrik(sayfalar: Iterable[str]) -> tuple[list, list, meb._Belge, dict]:
    """Sayfa metinlerinden, ``meb._ayristir``'ın döndürdüğü dörtlüyü kurar: (bölümler, anahtarlar, belge, bilgi)."""
    ham_sayfalar = [[normallestir(s) for s in metin.split("\n")] for metin in sayfalar]
    kenarlar = _tekrarlayan_kenarlar(ham_sayfalar)
    devamlar = [_baslik_devamlari(satirlar) for satirlar in ham_sayfalar]
    # Ders başlığının altında (devam satırı yerinde) birden çok sayfada okunan satır sayfa üst bilgisidir ("A KİTAPÇIĞI");
    # sayfaya taşan içerik sayfadan sayfaya değişir, yinelenmez.
    basliga_bitisik = Counter(
        k for satirlar, devam in zip(ham_sayfalar, devamlar) for k in {_kenar_anahtari(satirlar[j]) for j in devam}
    )
    bosluklu = any(
        b - a > 1 for satirlar in ham_sayfalar for a, b in pairwise([i for i, s in enumerate(satirlar) if s.strip()])
    )

    soru_satirlari: list[meb._Satir] = []
    anahtar_satirlari: list[meb._Satir] = []
    parcalar: dict[int, list] = {}
    resimler: dict[int, list] = {}
    boyutlar: dict[int, tuple[float, float]] = {}
    soru_sayfalari: list[int] = []
    anahtar_sayfalari: list[int] = []
    anahtarda = False
    tasinan_gorsel = False  # önceki sayfa şekil işaretiyle bitti: bu sayfanın ilk satırı da şekle değer
    son_satir: meb._Satir | None = None  # önceki sayfalardaki son satır
    son_baslik: str | None = None  # soru bölümünde görülen son ders başlığının ilk satırı
    son_kod: str | None = None  # o dersin kodu
    son_ad = ""  # o dersin ilk başlığındaki adı, devam satırlarıyla (_devam_anahtari)
    secenek_goruldu = False  # son ders başlığından beri seçenek satırı okundu mu
    secenekli_soru = False  # son soru başından beri seçenek satırı okundu mu (kök bitti)
    ortak_metinde = False  # birden çok soruya ait yönergeden sonra, ilk soru başından önce
    son_anahtar_basligi: str | None = None
    cevap_goruldu = False
    for no, satirlar in enumerate(ham_sayfalar, 1):
        dolu = [i for i, s in enumerate(satirlar) if s.strip()]
        uc = set(dolu[:2] + dolu[-2:])
        kenar = set(dolu[:_KENAR_SATIRI] + dolu[-_KENAR_SATIRI:])
        y = 0.0
        bosluk = False
        sayfa_satirlari: list[meb._Satir] = []
        bekleyen_gorsel: float | None = None  # işaretten önceki satırın üst kenarı
        gorseller: list[tuple[float, float]] = []
        devam = devamlar[no - 1]
        atlanacak: set[int] = set()  # atılan yinelenen ders başlığının devam satırları
        for i, metin in enumerate(satirlar):
            metin = metin.strip()
            if not metin:
                bosluk = True
                continue
            if i in atlanacak:
                continue
            if (i in kenar and _kenar_anahtari(metin) in kenarlar) or (i in uc and _YALNIZ_RAKAM.match(metin)):
                continue  # sayfa başlığı / numarası
            if metin in (GORSEL_ISARETI, KESIK_ISARETI):  # kesik sayfa: son soru eksik olabilir, şekil gibi elenir
                if not sayfa_satirlari and son_satir is not None:  # sayfanın başındaki şekil önceki sayfaya da değer
                    resimler[son_satir.sayfa].append((0.0, son_satir.y0, SAYFA_GENISLIGI, son_satir.y1))
                ust = sayfa_satirlari[-1].y0 if sayfa_satirlari else y
                bekleyen_gorsel = ust if bekleyen_gorsel is None else bekleyen_gorsel
                bosluk = True
                continue
            if (
                not anahtarda
                and _anahtar_basligi_mi(metin)
                # Kapaktaki "Cevap anahtarı kitapçığın sonundadır" başlık değildir: ardından cevaplar gelmeli.
                and _cevap_cifti_sayisi(satirlar[i + 1 :] + (ham_sayfalar[no] if no < len(ham_sayfalar) else [])) >= 2
            ):
                anahtarda = True
                continue
            if not anahtarda and (baslik := meb._DERS_BASLIGI.match(metin)):
                # Sayfa başında yinelenen ders başlığı (üst bilgi) yeni bir ders değildir: numaralar sürüyorsa ya da
                # o dersin seçenekleri okunmaya başlandıysa (son sorunun devamı, ardından yeni ders) atılır. Aynı ders:
                # ilk satırı dersin ilk başlığındakiyle aynı, ya da kodu aynı, adı devam satırlarıyla birlikte ona
                # yakın (_baslik_onegi: OCR'ın harf farkı, başka satır bölmesi, tek satırda okunmuş sarılı başlık) ve
                # numaralar yeniden başlamıyor. Başlığın devam satırları da atılır: adı tamamlayan önek ve ardından
                # başlığın altında birden çok sayfada okunan üst bilgi ("A KİTAPÇIĞI"). Düzeysiz başlıktan ("(111)
                # TARİH") sonra sayfaya taşan büyük harfli içerik kalır: atılsaydı soru eksik tutulurdu. Kapaktaki ders
                # dizininden sonra gelen gerçek başlık (sıradaki soru "1.") kalır.
                anahtar = re.sub(r"\s+", " ", buyuk(metin))
                devami = [j for j, b in devam.items() if b == i]
                ad = _devam_anahtari(baslik.group(2))
                onek = _baslik_onegi(ad, [satirlar[j] for j in devami], son_ad) if baslik.group(1) == son_kod else None
                sonraki = _siradaki_soru_no(satirlar[i + 1 :])
                if (anahtar == son_baslik and (secenek_goruldu or sonraki not in (None, 1))) or (
                    onek is not None and sonraki != 1 and (secenek_goruldu or sonraki is not None)
                ):
                    atla = devami[: onek or 0]
                    for j in devami[onek or 0 :]:  # başlığın altındaki üst bilgi; içerik başlayınca durulur
                        t = satirlar[j].strip()
                        # Ders adına benzeyen içerik ("TARİH KONULARI") başlığın yinelenen devamıyla sayılıp atılmaz.
                        ust_bilgi = basliga_bitisik[_kenar_anahtari(t)] >= 2 and _devam_anahtari(t) not in son_ad
                        if not (ust_bilgi and _kenar_adayi_mi(t)):
                            break
                        atla.append(j)
                    atlanacak.update(atla)
                    continue
                son_baslik, son_kod, secenek_goruldu = anahtar, baslik.group(1), False
                son_ad = ad + "".join(_devam_anahtari(satirlar[j]) for j in devami)
            if not anahtarda:
                if meb._GRUP_YONERGESI.match(kucuk(metin)):
                    ortak_metinde, secenekli_soru = True, False
                elif (
                    _SINAV_SONU_OCR.match(kucuk(metin))
                    and not ortak_metinde  # parçadaki "Sınav bitti." değil
                    and secenekli_soru  # kökteki ("… şöyle dedi:" + "Başarılar dileriz.") değil
                    # Seçeneğin "başarılar" diye süren satırı değil: büyük harfli, sayfa içinde boş satırdan sonra ya da
                    # ardından dersin başka sorusu gelmiyor (ders ya da kitapçık sonu, son seçeneğin hemen altında da).
                    # Sayfa başındaki ve boş satırsız metindeki satır da ileriye bakılarak ayrılır.
                    and (
                        meb._buyuk_harfli(metin)
                        or (bosluk and bool(sayfa_satirlari))
                        or not _sonra_soru_var_mi(ham_sayfalar, no, i, son_kod, kenarlar)
                    )
                ):
                    metin = "TEST BİTTİ."  # meb._sorulari_topla soruyu burada kapatır
                elif meb._SORU_BASI.match(metin) or meb._DERS_BASLIGI.match(metin):
                    ortak_metinde = False
                    if _icerik_satiri_mi(metin):  # yeni kök başlıyor ("1. OTURUM" gibi başlık değil)
                        secenekli_soru = False
            if not anahtarda and meb._SECENEK.search(metin):
                secenek_goruldu = secenekli_soru = True
            if anahtarda and meb._DERS_BASLIGI.match(metin):
                anahtar = re.sub(r"\s+", " ", buyuk(metin))
                if anahtar == son_anahtar_basligi and cevap_goruldu:
                    continue  # anahtarın devam sayfasında yinelenen ders başlığı
                son_anahtar_basligi, cevap_goruldu = anahtar, False
            for parca in _anahtar_ac(metin) if anahtarda else [metin]:
                if anahtarda:
                    m = meb._CEVAP_SATIRI.match(parca)
                    if m and meb._cevap_indeksi(m.group(2)) is None and not _IPTAL.search(m.group(2)):
                        continue  # "1. Sınav süresi 90 dakikadır." gibi cümle cevap değildir
                    cevap_goruldu = cevap_goruldu or bool(m)
                # Paragraf başı: aynı sayfada boş satırdan sonra; bloklar boş satırla ayrılmışsa sayfa başı da.
                paragraf = (bosluk and bool(sayfa_satirlari)) or (not sayfa_satirlari and bosluklu)
                if bosluk and sayfa_satirlari:
                    y += BOSLUK_ARALIGI
                bosluk = False
                s = _satir(no, y, parca)
                s.paragraf = paragraf
                y += SATIR_ARALIGI
                sayfa_satirlari.append(s)
                (anahtar_satirlari if anahtarda else soru_satirlari).append(s)
                if bekleyen_gorsel is not None:  # şekil, önceki satırdan bu satıra kadar olan alana değer
                    gorseller.append((bekleyen_gorsel, s.y1))
                    bekleyen_gorsel = None
                if tasinan_gorsel:
                    gorseller.append((s.y0, s.y1))
                    tasinan_gorsel = False
        if bekleyen_gorsel is not None:  # sayfanın sonundaki şekil (sonraki sayfanın ilk satırına da değer)
            gorseller.append((bekleyen_gorsel, y + SATIR_YUKSEKLIGI))
            tasinan_gorsel = True
        if sayfa_satirlari:
            son_satir = sayfa_satirlari[-1]
        parcalar[no] = [p for s in sayfa_satirlari for p in s.parcalar]
        resimler[no] = [(0.0, ust, SAYFA_GENISLIGI, alt) for ust, alt in gorseller]
        boyutlar[no] = (SAYFA_GENISLIGI, max(y, SATIR_ARALIGI))
        if sayfa_satirlari:
            (anahtar_sayfalari if anahtarda else soru_sayfalari).append(no)

    soru_satirlari = _sahte_soru_baslarini_birlestir(soru_satirlari)
    for no in parcalar:  # birleştirilen satırlar belgeden de düşer
        parcalar[no] = [p for s in soru_satirlari + anahtar_satirlari if s.sayfa == no for p in s.parcalar]
    bolumler = meb._sorulari_topla(soru_satirlari, meb._soru_x_konumlari(soru_satirlari))
    # Seçenekleri aşağıda silinse de gerçek ders: meb.pdf_ayristir bütün soruları belirsiz dersi "ders değil" diye
    # atmasın, sorularını elenmiş saysın ("0 ders" ve "soruları bulunamayan dersler" uyarısı yanlış olurdu).
    secenekli = [b for b in bolumler if any(len(s.secenekler) >= 2 for s in b.sorular)]
    for b in bolumler:
        for ham in b.sorular:
            metinler = [g.metin for g in ham.govde] + [p for sec in ham.secenekler for p in sec]
            if getattr(ham.satirlar[0], "supheli", False) or any(_SECENEK_IZI.search(t) for t in metinler):
                ham.secenekler.clear()  # soru başı belirsiz ya da metne başka bir sorunun seçenekleri karışmış: elenir
    guvenilmez: list[str] = []
    bos: list[str] = []
    anahtarlar = _guvenilir_anahtarlar(anahtar_satirlari, guvenilmez, bos)
    belge = meb._Belge(parcalar, boyutlar, {no: [] for no in parcalar}, resimler, len(ham_sayfalar))
    bilgi = {"soru_sayfalari": soru_sayfalari, "anahtar_sayfalari": anahtar_sayfalari, "satirlar": soru_satirlari,
             "guvenilmez_anahtarlar": guvenilmez, "bos_anahtarlar": bos, "secenekli_bolumler": secenekli}
    return bolumler, anahtarlar, belge, bilgi


def _guvenilir_anahtarlar(satirlar: list, silinen: list | None = None, bos: list | None = None) -> list:
    """Cevap anahtarı bölümleri. Bir numarası iki farklı harfle okunan dersin bütün cevapları silinir ve adı
    ``silinen``e yazılır; harfinin yanında "İPTAL" de okunan soru iptal sayılır. Başlığının altında hiç cevap
    okunamayan derslerin adı ``bos``a yazılır."""
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
        okunanlar = okunan.get(id(a), {})
        if not a.cevaplar:
            if bos is not None:
                bos.append(f"({a.kod}) {a.baslik}")
            continue
        if any(len(harfler - {None}) > 1 for harfler in okunanlar.values()):
            a.cevaplar.clear()  # iki farklı harf: yan yana sütunlar karışmış, bu dersin anahtarına güvenilmez
            if silinen is not None:
                silinen.append(f"({a.kod}) {a.baslik}")
            continue
        for no, harfler in okunanlar.items():
            if None in harfler:  # "İPTAL" ya da "… iptal edilmiştir": harfi de okunmuş olsa o soru iptaldir
                a.cevaplar[no] = None
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
    rapor["guvenilmez_anahtarlar"] = ayrik[3]["guvenilmez_anahtarlar"]
    # Soruları hiç bulunamayan anahtar bölümleri meb.pdf_ayristir'in "soruları bulunamayan dersler" uyarısında.
    rapor["bos_anahtarlar"] = [d for d in ayrik[3]["bos_anahtarlar"] if d not in rapor["sorusuz_anahtarlar"]]
    if rapor["guvenilmez_anahtarlar"]:
        yaz(
            "  Uyarı: cevap anahtarında aynı soru iki farklı harfle okundu (yan yana sütunlar karışmış olabilir); "
            "bu derslerin soruları cevapsız sayıldı: " + ", ".join(rapor["guvenilmez_anahtarlar"])
        )
    if rapor["bos_anahtarlar"]:
        yaz(
            "  Uyarı: cevap anahtarında ders başlığının altında cevap okunamadı; bu derslerin soruları cevapsız "
            "sayıldı: " + ", ".join(rapor["bos_anahtarlar"])
        )
    return sorular, rapor


def metin_katmani_var(pdf: Path, en_az_karakter: int = 100, en_az_harf_orani: float = 0.6) -> bool:
    """PDF'in kullanılabilir bir metin katmanı var mı? Taranmış (resim) sayfalarda yoktur; yazı tipi eşlemesi
    bozuk PDF'lerde metin vardır ama harf oranı düşüktür. Tamamen boş sayfalar (metin, resim ve çizim yok: arka
    kapak) ortalamaya katılmaz; taranmış sayfa resim taşıdığı için katılır."""
    pymupdf = meb._pymupdf()
    with pymupdf.open(pdf) as belge:
        metinler = [sayfa.get_text() for sayfa in belge]
        dolu_sayfa = sum(
            1 for sayfa, m in zip(belge, metinler, strict=True) if m.strip() or sayfa.get_images() or sayfa.get_drawings()
        )
    if not metinler:
        return False
    dolu = "".join(metinler)
    bosluksuz = [c for c in dolu if not c.isspace()]
    if len(bosluksuz) < en_az_karakter * max(1, dolu_sayfa):
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


def _fotograf_soru_basi(satir: str) -> re.Match[str] | None:
    """Fotoğraftaki soru numarası: "7. …" ya da "7) …"."""
    return meb._SORU_BASI.match(satir) or _PARANTEZLI_SORU_BASI.match(satir)


def _oncul_listesi_mi(satirlar: list[str], i: int, no: int) -> bool:
    """``i``. satırdaki numaradan sonra, seçeneklerden önce bir sonraki numara ("1) …" + "2) …") geliyor mu? Öyleyse
    numaralı satırlar kökün öncülleridir, soru numarası değil."""
    for satir in satirlar[i + 1 :]:
        t = satir.strip()
        if meb._SECENEK.match(t):
            return False
        m = _fotograf_soru_basi(t)
        if m:
            return int(m.group(1)) == no + 1
    return False


def _kok_satiri_mi(t: str) -> bool:
    """Fotoğrafta soru numarasından önceki satır kökün parçası mı? Boş satır, şekil işareti, sayfa başlığı (soru
    cümlesi olmayan büyük harfli satır) ve sayfa numarası değildir."""
    baslik = meb._buyuk_harfli(t) and not t.endswith("?")
    return bool(t) and t != GORSEL_ISARETI and not (baslik or _YALNIZ_RAKAM.match(t))


def _ilk_soru_basi(satirlar: list[str]) -> int:
    """Fotoğrafta sorunun başladığı satırın sırası. İlk soru başından ("5. …" ya da "5) …") önce yalnız sayfa başlığı
    (büyük harfli satır, sayfa numarası) ya da önceki sorunun seçenekleri varsa o satırlar atlanır; önceki satır kökün
    başıysa ("…hangisi" + "2. Dünya Savaşı'ndan…") hiçbir satır atlanmaz (0). Önceki sorunun seçeneklerinden sonra
    numarasız kök ve "1) …", "2) …" öncülleri geliyorsa soru, aradaki sayfa başlığı ve numarası atlanarak kökün ilk
    satırında başlar."""
    onceki: list[str] = []
    son_kalinti = -1  # önceki sorunun son seçenek satırı
    for i, satir in enumerate(satirlar):
        t = satir.strip()
        if not t or t == GORSEL_ISARETI:
            continue
        m = _fotograf_soru_basi(t)
        if m and not (m.group(2) and meb._buyuk_harfli(m.group(2))):  # "1. OTURUM" soru başı değil, başlıktır
            kalinti = any(meb._SECENEK.match(s) for s in onceki)
            baslik = all((meb._buyuk_harfli(s) and not s.endswith("?")) or _YALNIZ_RAKAM.match(s) for s in onceki)
            if kalinti and _oncul_listesi_mi(satirlar, i, int(m.group(1))):
                # Seçeneklerle numara arasındaki sayfa başlığı, sayfa numarası ve şekil işareti atlanır; arada kök
                # yoksa numara sorunun numarasıdır ("18. Aşağıdakilerden hangisi" + "19. yüzyılda …"), atılır.
                kok = [j for j in range(son_kalinti + 1, i) if _kok_satiri_mi(satirlar[j].strip())]
                return kok[0] if kok else i
            return i if kalinti or baslik else 0
        if meb._SECENEK.match(t):
            son_kalinti = i
        onceki.append(t)
    return 0


def tek_soru(metin: str, ders: str = "Genel") -> meb.Soru | None:
    """Tek bir sorunun OCR metninden (kök + "A) …" seçenekleri) cevabı bilinmeyen bir ``Soru`` kurar.

    Baştaki soru numarası ("7." ya da "7)") atılır; numaradan önceki sayfa başlığı ve önceki sorunun seçenekleri
    (``_ilk_soru_basi``) okunmaz, seçeneklerden sonra başlayan ikinci soru da. En az iki seçenek ve boş olmayan
    bir kök yoksa ``None``. ``cevap`` 0 yazılır ve ``ek["cevap_bilinmiyor"]`` işaretlenir: bu soru eğitimde ya da
    ölçümde kullanılmaz.
    """
    ham = meb._HamSoru(no=1, sayfa=1)
    y = 0.0
    bosluk = False
    ilk = True
    satirlar = normallestir(metin).split("\n")
    for satir in satirlar[_ilk_soru_basi(satirlar) :]:
        t = satir.strip()
        if not t or t == GORSEL_ISARETI:
            bosluk = True
            continue
        if not ilk and ham.secenekler and _fotograf_soru_basi(t):
            break  # fotoğrafta ikinci bir soru başlıyor: seçeneklere eklenmez
        if ilk:
            m = _fotograf_soru_basi(t)
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
