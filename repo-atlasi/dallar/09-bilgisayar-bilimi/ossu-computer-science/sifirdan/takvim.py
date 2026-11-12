"""
Haftalık takvim: topolojik sıradaki dersleri, haftalık saat bütçesine ve aynı anda yürüyen
ders sınırına göre haftalara yayar.

Kurallar (basit ve açıklanabilir olsun diye):
1. Bir ders, önkoşullarının hepsi ÖNCEKİ haftalarda bittiyse başlayabilir.
2. Dersler "kulvarlarda" yürür; her kulvarda aynı anda tek ders olur. Başlanan ders bitmeden
   kulvarı bırakmaz (bağlam değiştirmenin maliyeti gerçektir).
   - Veride `kulvar` alanı varsa her farklı kulvar adı bir kulvardır (ör. "algoritma" ve
     "matematik-sistem"; OSSU matematiği giriş dersleriyle paralel almayı "popüler bir
     seçenek" olarak anar). Kulvarı boş bırakılan ders herhangi bir kulvara girebilir.
   - Hiçbir derste kulvar yoksa `paralel` tane genel kulvar açılır.
3. Haftanın bütçesi yürüyen derslere eşit bölünür; ihtiyacı payından az olanın artanı
   diğerlerine geçer ("su doldurma"). Hafta içinde biten dersin kulvarı, önkoşulları hazır
   sıradaki dersle aynı hafta dolar. Boş kalan kulvarın payı diğerlerine kalır.
4. Varsayılan olarak seçmeli dersler, zorunluların hepsi bitince başlar
   (`secmeliler_sona=True`); böylece seçmeliler zorunluları geciktirmez.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from mufredat import Ders

EPSILON = 1e-9


@dataclass
class Hafta:
    no: int
    baslangic: date
    dagilim: dict[str, float] = field(default_factory=dict)

    @property
    def toplam(self) -> float:
        return sum(self.dagilim.values())


@dataclass
class Plan:
    haftalar: list[Hafta]
    ilk_hafta: dict[str, int]
    son_hafta: dict[str, int]
    haftalik_saat: float
    kulvarlar: list[str | None]

    @property
    def hafta_sayisi(self) -> int:
        return len(self.haftalar)

    @property
    def paralel(self) -> int:
        return len(self.kulvarlar)


def kulvarlari_belirle(dersler: list[Ders], paralel: int) -> list[str | None]:
    """
    >>> kulvarlari_belirle([Ders("a", "A", 1, kulvar="x"), Ders("b", "B", 1, kulvar="y")], 5)
    ['x', 'y']
    >>> kulvarlari_belirle([Ders("a", "A", 1)], 2)
    [None, None]
    """
    adlar = list(dict.fromkeys(ders.kulvar for ders in dersler if ders.kulvar))
    return list(adlar) if adlar else [None] * paralel


def _paylastir(butce: float, ihtiyaclar: dict[str, float]) -> dict[str, float]:
    """
    Bütçeyi eşit paylara böler; ihtiyacı küçük olanın artanı diğerlerine kalır.

    >>> _paylastir(10, {"a": 2, "b": 20, "c": 20})
    {'a': 2, 'b': 4.0, 'c': 4.0}
    >>> _paylastir(10, {"a": 1})
    {'a': 1}
    """
    dagilim: dict[str, float] = {}
    sirali = sorted(ihtiyaclar, key=lambda kimlik: ihtiyaclar[kimlik])
    for indeks, kimlik in enumerate(sirali):
        pay = butce / (len(sirali) - indeks)
        verilen = min(pay, ihtiyaclar[kimlik])
        dagilim[kimlik] = verilen
        butce -= verilen
    return {kimlik: dagilim[kimlik] for kimlik in ihtiyaclar}


def haftalik_plan(
    sirali_dersler: list[Ders],
    haftalik_saat: float,
    paralel: int = 2,
    *,
    baslangic: date = date(2027, 1, 4),
    en_fazla_hafta: int = 520,
    secmeliler_sona: bool = True,
) -> Plan:
    if haftalik_saat <= 0 or paralel < 1:
        raise ValueError("haftalık saat pozitif, paralel ders sayısı en az 1 olmalı")
    kulvarlar = kulvarlari_belirle(sirali_dersler, paralel)
    kalan = {ders.kimlik: ders.saat for ders in sirali_dersler}
    zorunlular = {ders.kimlik for ders in sirali_dersler if not ders.secmeli}
    biten: set[str] = set()
    yuvalar: list[str | None] = [None] * len(kulvarlar)  # her kulvarda yürüyen ders
    haftalar: list[Hafta] = []
    ilk_hafta: dict[str, int] = {}
    son_hafta: dict[str, int] = {}

    def uygun(ders: Ders, kulvar: str | None, bu_hafta_biten: set[str]) -> bool:
        if ders.kimlik in biten or ders.kimlik in bu_hafta_biten or ders.kimlik in yuvalar:
            return False
        if kulvar is not None and ders.kulvar not in ("", kulvar):
            return False
        if secmeliler_sona and ders.secmeli and not zorunlular <= biten:
            return False
        return all(once in biten for once in ders.onkosullar)

    while len(biten) < len(sirali_dersler):
        if len(haftalar) >= en_fazla_hafta:
            raise RuntimeError("plan çok uzadı; haftalık saati artır")
        hafta = Hafta(no=len(haftalar) + 1, baslangic=baslangic + timedelta(weeks=len(haftalar)))
        butce = haftalik_saat
        bu_hafta_biten: set[str] = set()
        while butce > EPSILON:
            for yuva, kulvar in enumerate(kulvarlar):
                if yuvalar[yuva] is None:
                    sonraki = next((d for d in sirali_dersler if uygun(d, kulvar, bu_hafta_biten)), None)
                    if sonraki is not None:
                        yuvalar[yuva] = sonraki.kimlik
                        ilk_hafta.setdefault(sonraki.kimlik, hafta.no)
            yuruyen = [kimlik for kimlik in yuvalar if kimlik is not None]
            if not yuruyen:
                break  # başlanabilecek ders yok (önkoşulları bu hafta bitiyor)
            for kimlik, saat in _paylastir(butce, {k: kalan[k] for k in yuruyen}).items():
                hafta.dagilim[kimlik] = hafta.dagilim.get(kimlik, 0.0) + saat
                kalan[kimlik] -= saat
                butce -= saat
                if kalan[kimlik] <= EPSILON:
                    bu_hafta_biten.add(kimlik)
                    son_hafta[kimlik] = hafta.no
            yuvalar = [None if kimlik in bu_hafta_biten else kimlik for kimlik in yuvalar]
        biten |= bu_hafta_biten
        haftalar.append(hafta)
    return Plan(haftalar, ilk_hafta, son_hafta, haftalik_saat, kulvarlar)


def zorunlu_bitis_haftasi(plan: Plan, sirali_dersler: list[Ders]) -> int:
    """Zorunlu derslerin hepsinin bittiği hafta."""
    return max(plan.son_hafta[d.kimlik] for d in sirali_dersler if not d.secmeli)
