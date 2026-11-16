"""Türkçe'ye duyarlı metin yardımcıları: büyük/küçük harf, sadeleştirme, cümle ve kelime bölme.

Neden var: Python'un `str.lower()` / `str.upper()` işlevleri Türkçe'de yanlıştır
("I".lower() → "i", "i".upper() → "I"). Pakette harf dönüşümü YALNIZ buradaki
`kucuk_tr` / `buyuk_tr` ile yapılır (kural testi: tests/test_kurallar.py).
Kim kullanır: rag (parçalama, BM25), yapili (anahtar eşleştirme), degerlendirme (puanlayıcılar).
Genişletme: yeni kısaltma → `KISALTMALAR`; yeni ek → `_EKLER`. Değişiklikten sonra
tests/test_metin.py çalıştırın.
"""

from __future__ import annotations

import math
import re
import unicodedata

_KUCUK_TABLO = str.maketrans({"I": "ı", "İ": "i"})
_BUYUK_TABLO = str.maketrans({"i": "İ", "ı": "I"})
_ASCII_TABLO = str.maketrans("çğıöşüâîû", "cgiosuaiu")


def kucuk_tr(metin: str) -> str:
    """Türkçe kurala göre küçük harfe çevirir ("IŞIK" → "ışık", "İZMİR" → "izmir")."""
    return unicodedata.normalize("NFC", metin).translate(_KUCUK_TABLO).lower()


def buyuk_tr(metin: str) -> str:
    """Türkçe kurala göre büyük harfe çevirir ("ışık" → "IŞIK", "izmir" → "İZMİR")."""
    return unicodedata.normalize("NFC", metin).translate(_BUYUK_TABLO).upper()


def kucuk_ascii(metin: str) -> str:
    """Protokol sözcükleri için düz küçük harf ("JSON" → "json"). Türkçe metinde KULLANMAYIN."""
    return metin.lower()


def buyuk_ascii(metin: str) -> str:
    """Protokol sözcükleri için düz büyük harf ("tr33" → "TR33"). Türkçe metinde KULLANMAYIN."""
    return metin.upper()


def sadelestir(metin: str) -> str:
    """Karşılaştırma için sadeleştirir: küçük harf, Türkçe harfler ASCII, yalnız harf/rakam.

    "Toplam Tutar" ile "toplam_tutar" ve "toplamTutar" aynı sonucu verir: "toplamtutar".
    """
    kucuk = kucuk_tr(metin).translate(_ASCII_TABLO)
    ayrik = unicodedata.normalize("NFD", kucuk)
    return "".join(h for h in ayrik if h.isalnum())


def bosluk_duzelt(metin: str) -> str:
    """Art arda boşlukları teke indirir, baştaki ve sondaki boşluğu siler."""
    return " ".join(metin.split())


# ----------------------------------------------------------------------------- cümle bölme

# Noktadan sonra cümle BİTMEYEN kısaltmalar (küçük harf, noktasız).
KISALTMALAR = frozenset(
    "dr prof doç yrd av sn no vb vs bkz örn ör mah cad sok blv apt tel faks ltd şti tic san "
    "st alb gen müh uzm op krş md sf çev haz yy mö ms tc aş ank ist thk ttk tbk hmk".split()
)
_BITIS = ".!?…"
_KAPANIS = "\"'”’»)]"
_ACILIS = "\"'“‘«(["


def _nokta_cumle_bitirir(metin: str, i: int, cumle_basi: int) -> bool:
    """`metin[i]` bir nokta; bu nokta cümleyi bitiriyor mu?"""
    j = i - 1
    while j >= cumle_basi and (metin[j].isalnum() or metin[j] == "."):
        j -= 1
    onceki = metin[j + 1 : i]
    if not onceki:
        return True
    if onceki.isdigit():
        # "3. madde" sıra sayısıdır; "1. Giriş" gibi satır başı numarası da cümle bitirmez.
        return bool(metin[cumle_basi : j + 1].strip())
    if len(onceki) == 1 and onceki.isalpha():
        return False  # "A. Yılmaz" gibi ad kısaltması
    parcalar = [p for p in kucuk_tr(onceki).split(".") if p]
    if all(len(p) == 1 for p in parcalar):
        return False  # "T.C." gibi harf harf kısaltma
    return kucuk_tr(onceki).replace(".", "") not in KISALTMALAR


def _paragrafi_bol(paragraf: str) -> list[str]:
    cumleler: list[str] = []
    bas = 0
    i = 0
    n = len(paragraf)
    while i < n:
        if paragraf[i] not in _BITIS:
            i += 1
            continue
        son = i
        while son + 1 < n and paragraf[son + 1] in _BITIS:
            son += 1
        while son + 1 < n and paragraf[son + 1] in _KAPANIS:
            son += 1
        k = son + 1
        while k < n and paragraf[k].isspace():
            k += 1
        bosluk_var = k > son + 1
        sonraki = paragraf[k] if k < n else ""
        bitirir = k >= n or (
            bosluk_var and (sonraki.isupper() or sonraki.isdigit() or sonraki in _ACILIS + "-–—")
        )
        if bitirir and paragraf[i] == "." and son == i and k < n:
            bitirir = _nokta_cumle_bitirir(paragraf, i, bas)
        if bitirir:
            cumle = paragraf[bas : son + 1].strip()
            if cumle:
                cumleler.append(cumle)
            bas = k
        i = son + 1
    kalan = paragraf[bas:].strip()
    if kalan:
        cumleler.append(kalan)
    return cumleler


def cumlelere_bol(metin: str) -> list[str]:
    """Metni cümlelere böler; kısaltma, sıra sayısı ve ondalıkları cümle sonu saymaz.

    Boş satır her zaman cümle (paragraf) sınırıdır; tek satır sonu boşluk gibi davranır.
    """
    cumleler: list[str] = []
    for paragraf in re.split(r"\n\s*\n", metin):
        duz = bosluk_duzelt(paragraf)
        if duz:
            cumleler.extend(_paragrafi_bol(duz))
    return cumleler


# ----------------------------------------------------------------------------- kelime ve kök

_KELIME_RE = re.compile(r"[^\W_]+(?:['’][^\W_]+)?")
_UNLULER = frozenset("aeıioöuüâîû")

# Sondan kırpılan AD ÇEKİM ekleri (çoğul, iyelik, hâl); uzun olan önce denenir. Dilbilgisi
# çözümlemesi DEĞİLDİR: amaç aynı kelimenin çekimlerini aynı köke indirmektir (arama için
# yeterli). Fiil ve yapım ekleri bilerek yoktur: "fatur·a" gibi kökleri fazla kırpıyorlardı.
_EKLER: tuple[str, ...] = tuple(
    sorted(
        (
            "lar ler ları leri "
            "ımız imiz umuz ümüz ınız iniz unuz ünüz sı si su sü ım im um üm "
            "ndan nden nda nde dan den tan ten da de ta te "
            "nın nin nun nün ın in un ün na ne ya ye yı yi yu yü nı ni nu nü "
            "yla yle la le ki ı i u ü a e"
        ).split(),
        key=lambda ek: (-len(ek), ek),
    )
)
_KOSACLAR = ("dır", "dir", "dur", "dür", "tır", "tir", "tur", "tür")  # yalnız uzun köklerde
_YUMUSAMA = {"b": "p", "c": "ç", "d": "t", "ğ": "k"}


def _bir_ek_kirp(kok: str) -> str | None:
    for kosac in _KOSACLAR:
        if kok.endswith(kosac) and len(kok) - len(kosac) >= 4:
            return kok[: -len(kosac)]
    for ek in _EKLER:
        if kok.endswith(ek):
            aday = kok[: -len(ek)]
            if len(aday) >= 2 and any(h in _UNLULER for h in aday):
                return aday
    return None


def kok_bul(kelime: str, azami_tur: int = 8) -> str:
    """Kelimenin sonundaki çekim eklerini kırpar ("evlerimizden" → "ev", "kitabı" → "kitap").

    Girdi küçük harfli olmalıdır (`kucuk_tr`). Kırpılacak ek kalmayana dek sürer; böylece bir
    kelimenin bütün çekimleri aynı köke iner (kök gerçek sözlük kökü olmayabilir: "fatura" →
    "fatur"). Kök en az 2 harf ve en az bir ünlü içerir.
    """
    kok = kelime
    for _ in range(azami_tur):
        aday = _bir_ek_kirp(kok)
        if aday is None:
            break
        kok = aday
    if len(kok) >= 3 and kok[-1] in _YUMUSAMA:
        kok = kok[:-1] + _YUMUSAMA[kok[-1]]
    return kok


def kelimeler(metin: str, kok: str = "ek", onek_uzunlugu: int = 5) -> list[str]:
    """Metni arama için kelimelere böler (Türkçe küçük harf, kesme işaretinden sonrası atılır).

    kok: "ek" → `kok_bul` ile ek kırpma; "onek" → ilk `onek_uzunlugu` harf; "yok" → olduğu gibi.
    """
    sonuc: list[str] = []
    for eslesme in _KELIME_RE.finditer(kucuk_tr(metin)):
        kelime = re.split(r"['’]", eslesme.group())[0]  # "ankara'nın" → "ankara"
        if kok == "ek":
            kelime = kok_bul(kelime)
        elif kok == "onek":
            kelime = kelime[:onek_uzunlugu]
        elif kok != "yok":
            raise ValueError(f'kok "ek", "onek" ya da "yok" olmalı; gelen: {kok!r}')
        sonuc.append(kelime)
    return sonuc


def karakter_ngramlari(metin: str, n: int = 3) -> list[str]:
    """Kelime sınırı işaretli karakter n-gramları ("ev" → ["_ev", "ev_"]); eklere dayanıklıdır."""
    ngramlar: list[str] = []
    for kelime in kelimeler(metin, kok="yok"):
        cerceveli = f"_{kelime}_"
        if len(cerceveli) <= n:
            ngramlar.append(cerceveli)
            continue
        ngramlar.extend(cerceveli[i : i + n] for i in range(len(cerceveli) - n + 1))
    return ngramlar


# ----------------------------------------------------------------------------- belirteç tahmini

# Türkçe metinde belirteç başına ortalama karakter. Ölçüm ve yöntem: docs/KARARLAR.md (K-09).
VARSAYILAN_KARAKTER_BASINA = 2.6


def belirtec_tahmini(metin: str, karakter_basina: float = VARSAYILAN_KARAKTER_BASINA) -> int:
    """Belirteç (token) sayısını kabaca tahmin eder; gerçek sayı modele göre değişir.

    Bütçe hesabında güvenli tarafta kalmak için bilerek biraz fazla tahmin eder.
    """
    if not metin:
        return 0
    return max(1, math.ceil(len(metin) / karakter_basina))


def kirp(metin: str, azami: int, ek: str = "…") -> str:
    """Metni en çok `azami` karaktere indirir; kırpıldıysa sonuna `ek` koyar."""
    if len(metin) <= azami:
        return metin
    return metin[: max(0, azami - len(ek))] + ek
