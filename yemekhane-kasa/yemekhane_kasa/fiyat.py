"""Tanınan kalemlerden adisyon: birim fiyat × adet, fiks menü indirimi, KDV dökümü. Tutarların hepsi kuruş.

Kurallar:
- Aynı yemek ve porsiyon birden çok satırda gelirse birleşir (adet toplanır, güven en düşüğü olur).
- Yarım porsiyonu olmayan yemek için "yarım" gelirse tam porsiyon fiyatı uygulanır.
- Güveni eşiğin altındaki kalem adisyonda kalır ama kasiyerden kontrol istenir; menüde bulunamayan yemek de öyle.
- Fiks menüler dosyadaki sırayla uygulanır; her kategoriden en pahalı tam porsiyon seçilir (müşteri lehine),
  indirim pozitifse uygulanır, uymayan kalemler kalmayana dek tekrarlanır.
- KDV fiyatın içindedir: oran grubu başına brüt × oran / (100 + oran), kuruşa yarım-yukarı yuvarlanır.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from yemekhane_kasa.menu import FiksMenu, Menu

AZAMI_ADET = 10  # tek tepside aynı yemekten daha fazlası gerçekçi değil: sınırlanır ve kontrol istenir


@dataclass(frozen=True)
class Kalem:
    """Tanıyıcının gördüğü bir kalem (henüz fiyatsız)."""

    menu_id: str
    adet: int = 1
    porsiyon: str = "tam"  # "tam" | "yarim"
    guven: float = 1.0


@dataclass
class Satir:
    menu_id: str
    ad: str
    kategori: str
    plu: str | None
    porsiyon: str
    adet: int
    birim_fiyat_kurus: int
    kdv_orani: int
    guven: float
    indirim_payi_kurus: int = 0  # fiks menü indiriminden bu satıra düşen pay (yalnız KDV dökümü için)

    @property
    def tutar_kurus(self) -> int:
        return self.birim_fiyat_kurus * self.adet


@dataclass
class Indirim:
    ad: str
    tutar_kurus: int
    menu_idler: list[str]


@dataclass
class KdvSatiri:
    oran: int
    matrah_kurus: int
    tutar_kurus: int


@dataclass
class Adisyon:
    satirlar: list[Satir] = field(default_factory=list)
    indirimler: list[Indirim] = field(default_factory=list)
    kdv: list[KdvSatiri] = field(default_factory=list)
    uyarilar: list[str] = field(default_factory=list)
    taninmayanlar: list[str] = field(default_factory=list)

    @property
    def ara_toplam_kurus(self) -> int:
        return sum(s.tutar_kurus for s in self.satirlar)

    @property
    def indirim_toplami_kurus(self) -> int:
        return sum(i.tutar_kurus for i in self.indirimler)

    @property
    def toplam_kurus(self) -> int:
        return self.ara_toplam_kurus - self.indirim_toplami_kurus

    @property
    def kontrol_gerekli(self) -> bool:
        return bool(self.uyarilar)

    @property
    def bos(self) -> bool:
        return not self.satirlar

    def kalem_imzasi(self) -> tuple[tuple[str, str, int], ...]:
        """(kimlik, porsiyon, adet) dizisi: iki tanıma aynı yemekleri mi gördü?"""
        return tuple((s.menu_id, s.porsiyon, s.adet) for s in self.satirlar)


def fiyatlandir(
    menu: Menu,
    kalemler: Iterable[Kalem],
    en_dusuk_guven: float = 0.6,
    taninmayanlar: Sequence[str] = (),
) -> Adisyon:
    uyarilar: list[str] = []
    birlesik: dict[tuple[str, str], list] = {}
    for kalem in kalemler:
        yemek = menu.yemek(kalem.menu_id)
        if yemek is None:
            uyarilar.append(f"Menüde olmayan kimlik atlandı: {kalem.menu_id}")
            continue
        if kalem.adet < 1:
            continue
        porsiyon = "yarim" if kalem.porsiyon == "yarim" and yemek.yarim_var else "tam"
        guven = min(max(float(kalem.guven), 0.0), 1.0)
        anahtar = (kalem.menu_id, porsiyon)
        if anahtar in birlesik:
            birlesik[anahtar][0] += kalem.adet
            birlesik[anahtar][1] = min(birlesik[anahtar][1], guven)
        else:
            birlesik[anahtar] = [kalem.adet, guven]

    sira = {kimlik: i for i, kimlik in enumerate(menu.kimlikler)}
    satirlar: list[Satir] = []
    for (kimlik, porsiyon), (adet, guven) in sorted(birlesik.items(), key=lambda o: (sira[o[0][0]], o[0][1])):
        yemek = menu.yemek(kimlik)
        assert yemek is not None
        if adet > AZAMI_ADET:
            uyarilar.append(f"{yemek.ad}: {adet} adet görüldü, {AZAMI_ADET} ile sınırlandı")
            adet = AZAMI_ADET
        if guven < en_dusuk_guven:
            uyarilar.append(f"{yemek.ad} için emin değilim (güven %{round(guven * 100)})")
        satirlar.append(
            Satir(
                menu_id=kimlik,
                ad=yemek.ad,
                kategori=yemek.kategori,
                plu=yemek.plu,
                porsiyon=porsiyon,
                adet=adet,
                birim_fiyat_kurus=yemek.birim_fiyat(porsiyon),
                kdv_orani=menu.kdv_orani(yemek),
                guven=guven,
            )
        )
    for tarif in taninmayanlar:
        uyarilar.append(f"Menüde bulunamadı: {tarif}")

    indirimler = _fiks_menuleri_uygula(menu.fiks_menuler, satirlar)
    return Adisyon(
        satirlar=satirlar,
        indirimler=indirimler,
        kdv=_kdv_dokumu(satirlar),
        uyarilar=uyarilar,
        taninmayanlar=list(taninmayanlar),
    )


def _fiks_menuleri_uygula(fiks_menuler: Sequence[FiksMenu], satirlar: list[Satir]) -> list[Indirim]:
    # Her tam porsiyon ayrı bir birim: [satır indeksi, kullanıldı mı]
    birimler = [[i, False] for i, s in enumerate(satirlar) if s.porsiyon == "tam" for _ in range(s.adet)]
    indirimler: list[Indirim] = []
    for fiks in fiks_menuler:
        while (secilen := _fiks_icin_sec(fiks, birimler, satirlar)) is not None:
            secilen_satirlar = [satirlar[birimler[j][0]] for j in secilen]
            indirim = sum(s.birim_fiyat_kurus for s in secilen_satirlar) - fiks.fiyat_kurus
            if indirim <= 0:
                break
            for j in secilen:
                birimler[j][1] = True
            _indirimi_dagit(indirim, secilen_satirlar)
            indirimler.append(Indirim(fiks.ad, indirim, [s.menu_id for s in secilen_satirlar]))
    return indirimler


def _fiks_icin_sec(fiks: FiksMenu, birimler: list[list], satirlar: list[Satir]) -> list[int] | None:
    """Fiks menünün her kategorisi için kullanılmamış en pahalı birimin indeksi; bir kategori boşsa None."""
    secilen: list[int] = []
    for kategori in fiks.kategoriler:
        aday: int | None = None
        for j, (i, kullanildi) in enumerate(birimler):
            if kullanildi or j in secilen or satirlar[i].kategori != kategori:
                continue
            if aday is None or satirlar[i].birim_fiyat_kurus > satirlar[birimler[aday][0]].birim_fiyat_kurus:
                aday = j
        if aday is None:
            return None
        secilen.append(aday)
    return secilen


def _indirimi_dagit(indirim: int, birim_satirlari: list[Satir]) -> None:
    """İndirimi birimlerin fiyatıyla orantılı paylaştırır; yuvarlama artığı son birime yazılır."""
    toplam = sum(s.birim_fiyat_kurus for s in birim_satirlari)
    kalan = indirim
    for n, satir in enumerate(birim_satirlari):
        pay = kalan if n == len(birim_satirlari) - 1 else indirim * satir.birim_fiyat_kurus // toplam
        satir.indirim_payi_kurus += pay
        kalan -= pay


def _kdv_dokumu(satirlar: list[Satir]) -> list[KdvSatiri]:
    brut: dict[int, int] = {}
    for satir in satirlar:
        brut[satir.kdv_orani] = brut.get(satir.kdv_orani, 0) + satir.tutar_kurus - satir.indirim_payi_kurus
    dokum = []
    for oran in sorted(brut):
        kdv = int((Decimal(brut[oran]) * oran / (100 + oran)).quantize(Decimal(1), rounding=ROUND_HALF_UP))
        dokum.append(KdvSatiri(oran=oran, matrah_kurus=brut[oran] - kdv, tutar_kurus=kdv))
    return dokum
