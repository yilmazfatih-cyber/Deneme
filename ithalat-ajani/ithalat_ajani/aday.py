"""Aday ürün: araştırma ajanının yazdığı JSON'dan okunur ve doğrulanır.

Biçim (`ornekler/ornek-adaylar.json`):

    {"tarama": {"an": "...", "kategoriler": ["esarp-sal"], "not": "..."},
     "adaylar": [{"urun": "...", "kategori": "esarp-sal", "gtip": "6214.30",
                  "alibaba": {"url": "...", "baslik": "...", "tedarikci": "...", "fiyat_usd": 2.8, "moq": 100,
                              "kademeler": [{"min_adet": 2, "fiyat_usd": 3.5}], "birim_agirlik_kg": 0.06,
                              "agirlik_kaynagi": "ilan", "olcu_cm": [25, 20, 1], "mense": "CN"},
                  "turkiye": {"fiyatlar": [{"fiyat_tl": 599, "kaynak": "trendyol", "url": "...", "baslik": "..."}],
                              "not": "..."},
                  "taklit_riski": false, "gerekce": "...", "riskler": ["..."], "kaynaklar": ["..."]}]}
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .tarife import Tarife, TarifeHatasi

AGIRLIK_KAYNAKLARI = ("ilan", "tahmin", "kategori")


class AdayHatasi(ValueError):
    pass


@dataclass(frozen=True)
class TrIlan:
    fiyat_tl: float  # şu anki raf fiyatı (indirimdeyse indirimli); karşılaştırma bununla yapılır
    liste_fiyat_tl: float | None = None  # üstü çizili normal fiyat, varsa
    kaynak: str = ""
    url: str = ""
    baslik: str = ""

    @property
    def indirimde(self) -> bool:
        return self.liste_fiyat_tl is not None and self.liste_fiyat_tl > self.fiyat_tl


@dataclass(frozen=True)
class Kademe:
    min_adet: int
    fiyat_usd: float


@dataclass(frozen=True)
class Indirim:
    """Alibaba'da süreli indirim/kampanya: `fiyat_usd` indirimli fiyattır, bu indirimsiz olanıdır."""

    liste_fiyat_usd: float
    bitis: str = ""  # YYYY-MM-DD, biliniyorsa
    aciklama: str = ""  # ör. "Alibaba Deals %20", "100 $ üstü 5 $ kupon"

    def oran(self, fiyat_usd: float) -> float:
        return 1 - fiyat_usd / self.liste_fiyat_usd


@dataclass(frozen=True)
class Aday:
    urun: str
    kategori: str
    url: str
    fiyat_usd: float
    moq: int
    agirlik_kg: float
    agirlik_kaynagi: str  # "ilan" | "tahmin" | "kategori"
    tr_ilanlar: tuple[TrIlan, ...]
    gtip: str = ""
    baslik: str = ""
    tedarikci: str = ""
    kademeler: tuple[Kademe, ...] = ()
    olcu_cm: tuple[float, float, float] | None = None
    mense: str = "CN"
    emy_usd: float = 0.0
    indirim: Indirim | None = None
    taklit_riski: bool = False
    gerekce: str = ""
    riskler: tuple[str, ...] = ()
    kaynaklar: tuple[str, ...] = ()
    tr_not: str = ""
    ham: dict[str, Any] = field(default_factory=dict, compare=False, repr=False)


def _sayi(deger: Any, ad: str, alt: float = 0.0, ust: float | None = None) -> float:
    if isinstance(deger, bool) or not isinstance(deger, (int, float)):
        raise AdayHatasi(f"{ad} sayı olmalı, {deger!r} verildi")
    if deger <= alt or (ust is not None and deger >= ust):
        sinir = f"{alt} ile {ust} arasında" if ust is not None else f"{alt}'dan büyük"
        raise AdayHatasi(f"{ad} {sinir} olmalı, {deger!r} verildi")
    return float(deger)


def _metin(deger: Any) -> str:
    return str(deger).strip() if deger is not None else ""


def _liste(deger: Any) -> tuple[str, ...]:
    if deger is None:
        return ()
    if isinstance(deger, str):
        return (deger,) if deger.strip() else ()
    return tuple(_metin(x) for x in deger if _metin(x))


def aday_oku(ham: dict[str, Any], tarife: Tarife) -> Aday:
    if not isinstance(ham, dict):
        raise AdayHatasi("Aday bir JSON nesnesi olmalı")
    urun = _metin(ham.get("urun"))
    if not urun:
        raise AdayHatasi("urun (ürün adı) boş")
    kategori = _metin(ham.get("kategori"))
    try:
        tarife.bul(kategori)
    except TarifeHatasi as hata:
        raise AdayHatasi(str(hata)) from None

    ali = ham.get("alibaba") or {}
    url = _metin(ali.get("url"))
    if not url.startswith("http"):
        raise AdayHatasi(f"{urun}: alibaba.url eksik ya da geçersiz")
    fiyat = _sayi(ali.get("fiyat_usd"), f"{urun}: alibaba.fiyat_usd", 0, 1000)
    moq_ham = ali.get("moq", 1)
    if isinstance(moq_ham, bool) or not isinstance(moq_ham, (int, float)) or moq_ham < 1:
        raise AdayHatasi(f"{urun}: alibaba.moq 1 ya da daha büyük tam sayı olmalı")

    agirlik_ham = ali.get("birim_agirlik_kg")
    if agirlik_ham is None:
        agirlik = tarife.bul(kategori).ornek_agirlik_kg
        agirlik_kaynagi = "kategori"
    else:
        agirlik = _sayi(agirlik_ham, f"{urun}: alibaba.birim_agirlik_kg", 0, 30)
        agirlik_kaynagi = _metin(ali.get("agirlik_kaynagi")) or "tahmin"
        if agirlik_kaynagi not in AGIRLIK_KAYNAKLARI:
            raise AdayHatasi(f"{urun}: agirlik_kaynagi {', '.join(AGIRLIK_KAYNAKLARI)} olmalı")

    olcu = ali.get("olcu_cm")
    olcu_cm = None
    if olcu is not None:
        if not isinstance(olcu, (list, tuple)) or len(olcu) != 3:
            raise AdayHatasi(f"{urun}: olcu_cm [en, boy, yükseklik] olmalı")
        a, b, c = (_sayi(x, f"{urun}: olcu_cm", 0, 300) for x in olcu)
        olcu_cm = (a, b, c)

    kademeler = []
    for k in ali.get("kademeler") or []:
        if not isinstance(k, dict):
            raise AdayHatasi(f"{urun}: kademeler nesne listesi olmalı")
        kademeler.append(
            Kademe(
                min_adet=int(_sayi(k.get("min_adet"), f"{urun}: kademe min_adet", 0)),
                fiyat_usd=_sayi(k.get("fiyat_usd"), f"{urun}: kademe fiyat_usd", 0, 1000),
            )
        )

    tr = ham.get("turkiye") or {}
    ilanlar = []
    for ilan in tr.get("fiyatlar") or []:
        if not isinstance(ilan, dict):
            raise AdayHatasi(f"{urun}: turkiye.fiyatlar nesne listesi olmalı")
        fiyat_tl = _sayi(ilan.get("fiyat_tl"), f"{urun}: turkiye fiyat_tl", 0, 1_000_000)
        liste_tl = ilan.get("liste_fiyat_tl")
        if liste_tl is not None:
            liste_tl = _sayi(liste_tl, f"{urun}: turkiye liste_fiyat_tl", 0, 1_000_000)
            if liste_tl <= fiyat_tl:
                liste_tl = None  # üstü çizili fiyat yoksa ya da aynıysa indirim yok
        ilanlar.append(
            TrIlan(
                fiyat_tl=fiyat_tl,
                liste_fiyat_tl=liste_tl,
                kaynak=_metin(ilan.get("kaynak")),
                url=_metin(ilan.get("url")),
                baslik=_metin(ilan.get("baslik")),
            )
        )
    if not ilanlar:
        raise AdayHatasi(f"{urun}: Türkiye fiyatı yok (turkiye.fiyatlar boş)")

    emy = ali.get("emy_usd", 0) or 0
    if isinstance(emy, bool) or not isinstance(emy, (int, float)) or emy < 0:
        raise AdayHatasi(f"{urun}: emy_usd sıfır ya da pozitif olmalı")

    indirim = None
    ind = ali.get("indirim")
    if ind:
        if not isinstance(ind, dict):
            raise AdayHatasi(f"{urun}: alibaba.indirim nesne olmalı")
        if ind.get("liste_fiyat_usd") is not None:
            liste = _sayi(ind["liste_fiyat_usd"], f"{urun}: indirim.liste_fiyat_usd", 0, 1000)
        elif ind.get("oran") is not None:
            liste = fiyat / (1 - _sayi(ind["oran"], f"{urun}: indirim.oran", 0, 1))
        else:
            raise AdayHatasi(f"{urun}: indirim için liste_fiyat_usd ya da oran gerekli")
        if liste <= fiyat:
            raise AdayHatasi(f"{urun}: indirimsiz fiyat ({liste}) indirimli fiyattan ({fiyat}) büyük olmalı")
        indirim = Indirim(liste_fiyat_usd=liste, bitis=_metin(ind.get("bitis")), aciklama=_metin(ind.get("aciklama")))

    return Aday(
        urun=urun,
        kategori=kategori,
        url=url,
        fiyat_usd=fiyat,
        moq=int(moq_ham),
        agirlik_kg=agirlik,
        agirlik_kaynagi=agirlik_kaynagi,
        tr_ilanlar=tuple(ilanlar),
        gtip=_metin(ham.get("gtip")),
        baslik=_metin(ali.get("baslik")),
        tedarikci=_metin(ali.get("tedarikci")),
        kademeler=tuple(sorted(kademeler, key=lambda k: k.min_adet)),
        olcu_cm=olcu_cm,
        mense=(_metin(ali.get("mense")) or "CN").upper(),
        emy_usd=float(emy),
        indirim=indirim,
        taklit_riski=bool(ham.get("taklit_riski", False)),
        gerekce=_metin(ham.get("gerekce")),
        riskler=_liste(ham.get("riskler")),
        kaynaklar=_liste(ham.get("kaynaklar")),
        tr_not=_metin(tr.get("not")),
        ham=ham,
    )
