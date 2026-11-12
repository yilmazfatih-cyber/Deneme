"""Türkçe açık uçlu yanıtlar için hafif metin araçları.

Amaç modelin binlerce yanıtı okumaması: anahtar kelime/ikili sayımı, sınırlı ve çeşitli örneklem,
modelin yazdığı tema kurallarını tüm veriye uygulayan sayaç ("model tanımlar, betik ölçekler").
"""

from __future__ import annotations

import random
import re
from collections import Counter
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

_DUZELT = str.maketrans({"I": "ı", "İ": "i"})
_BUYUT = str.maketrans({"i": "İ", "ı": "I"})


def kucuk(metin: str) -> str:
    """Türkçe kurallarla küçük harf (I -> ı, İ -> i)."""
    return str(metin).translate(_DUZELT).lower()


def buyuk(metin: str) -> str:
    """Türkçe kurallarla büyük harf (i -> İ, ı -> I)."""
    return str(metin).translate(_BUYUT).upper()


DURAK_KELIMELER = frozenset(
    """
    acaba ama ancak artık aslında az bana bazen bazı belki ben beni benim beri bile bir birçok biri birkaç birşey
    biz bize bizi bizim bu buna bunda bundan bunu bunun burada çok çünkü da daha dahi de defa değil diye dolayı
    en gibi göre hem hep hepsi her hiç için ile ise işte kadar kendi ki kim mi mı mu mü nasıl ne neden nerede
    niye o olan olarak oldu olduğu olsun on ona ondan onlar onu onun öyle sadece sanki şey siz size sizi sizin
    son sonra şu şuna şunu tabi tam tüm ve veya ya yani yine zaten olur oluyor olmuyor var yok çok daha bi
    olabilir lütfen teşekkür teşekkürler merhaba
    a an and are as at be but by for from has have i if in is it its me my no not of on or so that the
    this to was we with you your very just can do does please thanks
    """.split()
)

_KELIME = re.compile(r"[0-9a-zçğıöşüâîû]+")
_EPOSTA = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
_TELEFON = re.compile(r"(?<!\w)\+?\d[\d\s().-]{8,}\d(?!\w)")


def maskele(metin: str) -> str:
    """Özetlere/örneklere giden metinde e-posta ve telefon/kimlik numarası benzeri dizileri gizler."""
    metin = _EPOSTA.sub("<e-posta>", str(metin))
    return _TELEFON.sub(lambda m: "<numara>" if sum(ch.isdigit() for ch in m.group()) >= 10 else m.group(), metin)


def kelimeler(metin: str, durak: bool = True) -> List[str]:
    """Küçük harfe çevrilmiş, noktalamasız kelimeler; durak kelimeler ve tek harfler atılır."""
    liste = _KELIME.findall(kucuk(metin))
    return [k for k in liste if len(k) > 1 and not k.isdigit() and (not durak or k not in DURAK_KELIMELER)]


def sik_kelimeler(metinler: Iterable[str], n: int = 15) -> Tuple[List[Tuple[str, int]], List[Tuple[str, int]]]:
    """Belge sıklığına göre (bir yanıtta bir kez sayılır) en sık kelimeler ve ikililer."""
    tekil: Counter = Counter()
    ikili: Counter = Counter()
    for metin in metinler:
        k = kelimeler(metin)
        tekil.update(set(k))
        ikili.update({f"{a} {b}" for a, b in zip(k, k[1:])})
    sirala = lambda sayac: sorted(sayac.items(), key=lambda kv: (-kv[1], kv[0]))  # noqa: E731 - eşitlikte alfabetik
    ikililer = [(i, s) for i, s in sirala(ikili) if s >= 2][:n]
    return sirala(tekil)[:n], ikililer


def _imza(metin: str) -> str:
    return " ".join(kelimeler(metin, durak=False))


def ornekle(
    metinler: Sequence[str],
    n: int = 40,
    azami_uzunluk: int = 220,
    tohum: int = 7,
) -> List[str]:
    """Tekrarları atar, uzunluk katmanlarından dengeli, deterministik örnek alır ve kısaltır.

    Çok kısa ("iyi", "yok") yanıtlar tema çıkarmaya katkı vermediği için sona bırakılır.
    """
    goruldu = set()
    benzersiz: List[str] = []
    for m in metinler:
        m = " ".join(str(m).split())
        imza = _imza(m)
        if not imza or imza in goruldu:
            continue
        goruldu.add(imza)
        benzersiz.append(m)
    if len(benzersiz) <= n:
        secilen = benzersiz
    else:
        rastgele = random.Random(tohum)
        kisa = [m for m in benzersiz if len(m.split()) < 3]
        orta = [m for m in benzersiz if 3 <= len(m.split()) < 15]
        uzun = [m for m in benzersiz if len(m.split()) >= 15]
        for kume in (kisa, orta, uzun):
            rastgele.shuffle(kume)
        hedef_kisa = min(len(kisa), max(1, n // 10))
        kalan = n - hedef_kisa
        hedef_uzun = min(len(uzun), kalan // 3)
        hedef_orta = min(len(orta), kalan - hedef_uzun)
        secilen = orta[:hedef_orta] + uzun[:hedef_uzun] + kisa[:hedef_kisa]
        if len(secilen) < n:
            artan = [m for m in orta[hedef_orta:] + uzun[hedef_uzun:] + kisa[hedef_kisa:]]
            secilen += artan[: n - len(secilen)]
    secilen = [maskele(m) for m in secilen]
    return [m if len(m) <= azami_uzunluk else m[: azami_uzunluk - 1].rstrip() + "…" for m in secilen]


# --- tema kuralları ------------------------------------------------------------------------------


def _desen_eslesir(desen: str, kelime_kumesi: List[str], duz_metin: str) -> bool:
    desen = kucuk(desen.strip())
    if not desen:
        return False
    if " " in desen:
        return desen in duz_metin
    if desen.endswith("*"):
        kok = desen[:-1]
        return any(k.startswith(kok) for k in kelime_kumesi)
    return desen in kelime_kumesi


def tema_eslestir(metin: str, temalar: Sequence[Dict]) -> List[str]:
    """Bir metnin uyduğu tema adları. Kural: {"ad", "kelimeler": [...], "haric": [...]}.

    Desen biçimleri: "kargo" (tam kelime), "ödem*" (kök: ödeme, ödemede, ödemeyi...), "kart bilgisi" (öbek).
    """
    kelime_listesi = kelimeler(metin, durak=False)
    duz = " " + " ".join(kelime_listesi) + " "
    uyan = []
    for tema in temalar:
        if any(_desen_eslesir(d, kelime_listesi, duz) for d in tema.get("haric", [])):
            continue
        if any(_desen_eslesir(d, kelime_listesi, duz) for d in tema.get("kelimeler", [])):
            uyan.append(tema["ad"])
    return uyan


def tema_say(
    metinler: Sequence[str], temalar: Sequence[Dict], ornek_sayisi: int = 2
) -> Tuple[List[Dict], List[str], int]:
    """Her tema için yanıt sayısı, payı ve kısa örnekler; eşleşmeyenlerden örnek döner."""
    sayac: Counter = Counter()
    ornekler: Dict[str, List[str]] = {t["ad"]: [] for t in temalar}
    eslesmeyen: List[str] = []
    gecerli = [m for m in metinler if str(m).strip()]
    for m in gecerli:
        uyan = tema_eslestir(m, temalar)
        if not uyan:
            eslesmeyen.append(m)
        for ad in uyan:
            sayac[ad] += 1
            if len(ornekler[ad]) < ornek_sayisi:
                ornekler[ad].append(maskele(m))
    toplam = len(gecerli)
    satirlar = [
        {
            "ad": t["ad"],
            "sayi": sayac[t["ad"]],
            "pay": (sayac[t["ad"]] / toplam) if toplam else 0.0,
            "ornekler": ornekler[t["ad"]],
        }
        for t in temalar
    ]
    satirlar.sort(key=lambda s: -s["sayi"])
    return satirlar, ornekle(eslesmeyen, n=5, azami_uzunluk=160), toplam


def nps(puanlar: Iterable[float]) -> Optional[Dict[str, float]]:
    """0-10 puanlarından NPS: yüzde destekçi (9-10) - yüzde kötüleyen (0-6)."""
    liste = [p for p in puanlar if p is not None]
    if not liste:
        return None
    n = len(liste)
    destekci = sum(1 for p in liste if p >= 9)
    kotuleyen = sum(1 for p in liste if p <= 6)
    return {
        "n": n,
        "nps": (destekci - kotuleyen) / n * 100.0,
        "destekci": destekci / n,
        "notr": (n - destekci - kotuleyen) / n,
        "kotuleyen": kotuleyen / n,
    }
