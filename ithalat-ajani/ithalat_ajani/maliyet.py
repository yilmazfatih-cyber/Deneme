"""Birim maliyet: Alibaba fiyatı + kargo + gümrük vergileri + sabit masraf payı.

Her şey birim (adet) başınadır:

    ücretli kg     = max(ağırlık × (1 + ambalaj payı), en × boy × yükseklik / hacim bölen)
    kargo $        = ücretli kg × kargo $/kg
    sigorta $      = (mal $ + kargo $) × sigorta oranı
    CIF $          = mal $ + kargo $ + sigorta $                       (gümrük kıymeti)
    GV, İGV        = CIF TL × oran
    EMY            = birim başına ek mali yükümlülük / damping (varsa, $)
    ödeme $        = mal $ × ödeme oranı                              (gümrük kıymetine girmez)
    sabit pay      = sevkiyat sabit masrafı × mal $ / sevkiyat mal bedeli $
    birim maliyet  = (mal + ödeme + kargo + sigorta) $ × kur + GV + İGV + EMY + sabit pay   [KDV hariç]
    ithalat KDV    = (CIF TL + GV + İGV + EMY) × KDV oranı            [nakit çıkışı; satışta indirilir]

Satış tarafı (bilgi amaçlı, eşik bunu kullanmaz):

    satış net      = Türkiye fiyatı / (1 + KDV)
    komisyon       = Türkiye fiyatı × komisyon oranı
    birim kâr      = satış net − komisyon − sipariş gideri − iade oranı × sipariş gideri − birim maliyet
"""

from __future__ import annotations

from dataclasses import dataclass

from .ayarlar import Ayarlar
from .tarife import Kategori


@dataclass(frozen=True)
class MaliyetGirdisi:
    fiyat_usd: float  # birim fiyat (planlanan sipariş adedindeki kademe)
    agirlik_kg: float  # birim ağırlık (bireysel ambalaj dahil)
    olcu_cm: tuple[float, float, float] | None = None  # ambalajlı birim ölçüsü; varsa hacimsel ağırlık
    emy_usd: float = 0.0  # birim başına ek mali yükümlülük / damping


@dataclass(frozen=True)
class MaliyetDokumu:
    kur: float
    mal_usd: float
    odeme_usd: float
    ucretli_kg: float
    hacimsel: bool  # ücretli ağırlık hacimden geldiyse
    kargo_usd: float
    sigorta_usd: float
    cif_usd: float
    cif_tl: float
    gv_tl: float
    igv_tl: float
    emy_tl: float
    sabit_pay_tl: float
    kdv_matrahi_tl: float
    ithalat_kdv_tl: float
    birim_maliyet_tl: float  # KDV hariç, satışla karşılaştırılan tutar
    nakit_cikis_tl: float  # birim maliyet + ithalat KDV (satışta indirilir)

    @property
    def mal_tl(self) -> float:
        return self.mal_usd * self.kur

    @property
    def odeme_tl(self) -> float:
        return self.odeme_usd * self.kur

    @property
    def kargo_tl(self) -> float:
        return self.kargo_usd * self.kur

    @property
    def sigorta_tl(self) -> float:
        return self.sigorta_usd * self.kur

    @property
    def vergi_yuku(self) -> float:
        """İndirilemeyen gümrük vergilerinin gümrük kıymetine oranı."""
        return (self.gv_tl + self.igv_tl + self.emy_tl) / self.cif_tl if self.cif_tl else 0.0

    @property
    def kargo_payi(self) -> float:
        """Kargonun mal + kargo içindeki payı: hafif ürünlerde düşük."""
        toplam = self.mal_usd + self.kargo_usd
        return self.kargo_usd / toplam if toplam else 0.0


@dataclass(frozen=True)
class SatisDokumu:
    satis_net_tl: float
    komisyon_tl: float
    siparis_gideri_tl: float
    iade_tl: float
    birim_kar_tl: float

    @property
    def kar_marji(self) -> float:
        return self.birim_kar_tl / self.satis_net_tl if self.satis_net_tl else 0.0


def ucretli_agirlik(girdi: MaliyetGirdisi, ayarlar: Ayarlar) -> tuple[float, bool]:
    gercek = girdi.agirlik_kg * (1 + ayarlar.kargo.ambalaj_payi)
    if girdi.olcu_cm:
        en, boy, yukseklik = girdi.olcu_cm
        hacim = en * boy * yukseklik / ayarlar.kargo.hacim_bolen
        if hacim > gercek:
            return hacim, True
    return gercek, False


def birim_maliyet(
    girdi: MaliyetGirdisi, kategori: Kategori, kur: float, ayarlar: Ayarlar, igv: float | None = None
) -> MaliyetDokumu:
    """Birim başına inmiş maliyet. `igv` verilirse tablodaki oranın yerine kullanılır (stres testi)."""
    if girdi.fiyat_usd <= 0 or girdi.agirlik_kg <= 0 or kur <= 0:
        raise ValueError("Fiyat, ağırlık ve kur pozitif olmalı")
    g = ayarlar.gumruk
    igv_orani = kategori.igv if igv is None else igv

    kg, hacimsel = ucretli_agirlik(girdi, ayarlar)
    kargo_usd = kg * ayarlar.kargo.usd_kg
    sigorta_usd = (girdi.fiyat_usd + kargo_usd) * g.sigorta_orani
    cif_usd = girdi.fiyat_usd + kargo_usd + sigorta_usd
    cif_tl = cif_usd * kur
    gv_tl = cif_tl * kategori.gv
    igv_tl = cif_tl * igv_orani
    emy_tl = girdi.emy_usd * kur
    odeme_usd = girdi.fiyat_usd * g.odeme_orani
    sabit_pay_tl = g.sevkiyat_sabit_tl * girdi.fiyat_usd / g.sevkiyat_mal_bedeli_usd if g.sevkiyat_mal_bedeli_usd else 0.0

    kdv_matrahi = cif_tl + gv_tl + igv_tl + emy_tl
    ithalat_kdv = kdv_matrahi * kategori.kdv
    toplam = (girdi.fiyat_usd + odeme_usd + kargo_usd + sigorta_usd) * kur + gv_tl + igv_tl + emy_tl + sabit_pay_tl
    return MaliyetDokumu(
        kur=kur,
        mal_usd=girdi.fiyat_usd,
        odeme_usd=odeme_usd,
        ucretli_kg=kg,
        hacimsel=hacimsel,
        kargo_usd=kargo_usd,
        sigorta_usd=sigorta_usd,
        cif_usd=cif_usd,
        cif_tl=cif_tl,
        gv_tl=gv_tl,
        igv_tl=igv_tl,
        emy_tl=emy_tl,
        sabit_pay_tl=sabit_pay_tl,
        kdv_matrahi_tl=kdv_matrahi,
        ithalat_kdv_tl=ithalat_kdv,
        birim_maliyet_tl=toplam,
        nakit_cikis_tl=toplam + ithalat_kdv,
    )


def satis_net(tr_fiyat_tl: float, kategori: Kategori) -> float:
    """Türkiye raf fiyatı (KDV dahil) → KDV hariç satış geliri."""
    return tr_fiyat_tl / (1 + kategori.kdv)


def kat(tr_fiyat_tl: float, dokum: MaliyetDokumu, kategori: Kategori) -> float:
    """Ana ölçüt: KDV hariç Türkiye fiyatı / KDV hariç birim maliyet."""
    return satis_net(tr_fiyat_tl, kategori) / dokum.birim_maliyet_tl


def satis_dokumu(tr_fiyat_tl: float, dokum: MaliyetDokumu, kategori: Kategori, ayarlar: Ayarlar) -> SatisDokumu:
    s = ayarlar.satis
    net = satis_net(tr_fiyat_tl, kategori)
    komisyon = tr_fiyat_tl * s.pazaryeri_komisyon
    iade = s.iade_orani * s.siparis_gideri_tl
    kar = net - komisyon - s.siparis_gideri_tl - iade - dokum.birim_maliyet_tl
    return SatisDokumu(
        satis_net_tl=net,
        komisyon_tl=komisyon,
        siparis_gideri_tl=s.siparis_gideri_tl,
        iade_tl=iade,
        birim_kar_tl=kar,
    )
