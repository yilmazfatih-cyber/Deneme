"""Aday değerlendirme: birim maliyet, Türkiye fiyatı, kat, karar ve uyarılar.

Kararlar:
    UYGUN          kat ≥ hedef ve kanıt yeterli
    UYGUN-DOGRULA  kat ≥ hedef ama bir şey doğrulanmalı (az ilan, tahmini vergi, tahmini ağırlık, MOQ, menşe)
    YAKIN          yakın eşik ≤ kat < hedef
    ELENDI         kat < yakın eşik ya da taklit/marka riski
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from typing import Any

from .aday import Aday, AdayHatasi, Kademe, aday_oku
from .ayarlar import Ayarlar
from .bicim import kat as kat_metni
from .bicim import sayi, tl, usd, yuzde
from .maliyet import MaliyetDokumu, MaliyetGirdisi, SatisDokumu, birim_maliyet, kat, satis_dokumu
from .tarife import Kategori, Tarife

DURUMLAR = ("UYGUN", "UYGUN-DOGRULA", "YAKIN", "ELENDI")
_SIRA = {d: i for i, d in enumerate(DURUMLAR)}
DAGINIK_ORAN = 4.0  # en yüksek / en düşük Türkiye ilanı bundan büyükse karşılaştırma güvenilmez


@dataclass(frozen=True)
class TrFiyat:
    medyan: float  # şu anki raf fiyatlarının medyanı (karar bununla)
    en_dusuk: float
    en_yuksek: float
    adet: int
    liste_medyan: float  # indirimsiz (üstü çizili) fiyatların medyanı; indirim yoksa raf fiyatı
    indirimde_adet: int = 0


@dataclass(frozen=True)
class KademeSonucu:
    min_adet: int
    fiyat_usd: float
    kat: float


@dataclass
class Sonuc:
    aday: Aday
    kategori: Kategori
    dokum: MaliyetDokumu
    tr: TrFiyat
    kat: float
    satis: SatisDokumu
    durum: str = "ELENDI"
    dogrula: list[str] = field(default_factory=list)  # UYGUN'u UYGUN-DOGRULA'ya çeviren nedenler
    notlar: list[str] = field(default_factory=list)  # bilgi amaçlı
    avantajlar: list[str] = field(default_factory=list)
    stres_kat: float | None = None  # tahmini vergide İGV + stres payı ile kat
    en_iyi_kademe: KademeSonucu | None = None
    indirimsiz_kat: float | None = None  # Alibaba indirimi bitince (liste fiyatıyla) kat
    tr_normal_kat: float | None = None  # Türkiye ilanları indirimden çıkınca (liste fiyatıyla) kat
    sureli_firsat: bool = False  # eşiği yalnız Alibaba indirimi sayesinde geçiyor: indirim bitmeden sipariş

    @property
    def sira_anahtari(self) -> tuple[int, float]:
        return (_SIRA[self.durum], -self.kat)

    @property
    def indirim_orani(self) -> float | None:
        return self.aday.indirim.oran(self.aday.fiyat_usd) if self.aday.indirim else None

    def ozet_sozluk(self) -> dict[str, Any]:
        return {
            "urun": self.aday.urun,
            "kategori": self.aday.kategori,
            "url": self.aday.url,
            "fiyat_usd": self.aday.fiyat_usd,
            "moq": self.aday.moq,
            "agirlik_kg": self.aday.agirlik_kg,
            "tr_medyan_tl": round(self.tr.medyan, 2),
            "tr_ilan": self.tr.adet,
            "birim_maliyet_tl": round(self.dokum.birim_maliyet_tl, 2),
            "kat": round(self.kat, 3),
            "durum": self.durum,
            "birim_kar_tl": round(self.satis.birim_kar_tl, 2),
            "indirim_orani": round(self.indirim_orani, 3) if self.indirim_orani is not None else None,
            "indirimsiz_kat": round(self.indirimsiz_kat, 3) if self.indirimsiz_kat is not None else None,
            "sureli_firsat": self.sureli_firsat,
            "dogrula": self.dogrula,
        }


@dataclass
class Okunamayan:
    sira: int
    urun: str
    neden: str


def tr_fiyat(aday: Aday) -> TrFiyat:
    fiyatlar = [i.fiyat_tl for i in aday.tr_ilanlar]
    listeler = [i.liste_fiyat_tl if i.indirimde else i.fiyat_tl for i in aday.tr_ilanlar]
    return TrFiyat(
        medyan=statistics.median(fiyatlar),
        en_dusuk=min(fiyatlar),
        en_yuksek=max(fiyatlar),
        adet=len(fiyatlar),
        liste_medyan=statistics.median(listeler),
        indirimde_adet=sum(1 for i in aday.tr_ilanlar if i.indirimde),
    )


def _girdi(aday: Aday, fiyat_usd: float | None = None) -> MaliyetGirdisi:
    return MaliyetGirdisi(
        fiyat_usd=fiyat_usd if fiyat_usd is not None else aday.fiyat_usd,
        agirlik_kg=aday.agirlik_kg,
        olcu_cm=aday.olcu_cm,
        emy_usd=aday.emy_usd,
    )


def _en_iyi_kademe(aday: Aday, kategori: Kategori, kur: float, tr: TrFiyat, ayarlar: Ayarlar) -> KademeSonucu | None:
    ucuz: Kademe | None = min(aday.kademeler, key=lambda k: k.fiyat_usd, default=None)
    if ucuz is None or ucuz.fiyat_usd >= aday.fiyat_usd:
        return None
    dokum = birim_maliyet(_girdi(aday, ucuz.fiyat_usd), kategori, kur, ayarlar)
    return KademeSonucu(min_adet=ucuz.min_adet, fiyat_usd=ucuz.fiyat_usd, kat=kat(tr.medyan, dokum, kategori))


def degerlendir_aday(aday: Aday, tarife: Tarife, kur: float, ayarlar: Ayarlar) -> Sonuc:
    kategori = tarife.bul(aday.kategori)
    e = ayarlar.esikler
    dokum = birim_maliyet(_girdi(aday), kategori, kur, ayarlar)
    tr = tr_fiyat(aday)
    k = kat(tr.medyan, dokum, kategori)
    s = Sonuc(
        aday=aday,
        kategori=kategori,
        dokum=dokum,
        tr=tr,
        kat=k,
        satis=satis_dokumu(tr.medyan, dokum, kategori, ayarlar),
        en_iyi_kademe=_en_iyi_kademe(aday, kategori, kur, tr, ayarlar),
    )

    # Kanıt denetimi
    if tr.adet < e.min_tr_karsilastirma:
        s.dogrula.append(f"Türkiye fiyatı {tr.adet} ilana dayanıyor (en az {e.min_tr_karsilastirma} gerekli)")
    if tr.en_dusuk > 0 and tr.en_yuksek / tr.en_dusuk > DAGINIK_ORAN:
        s.dogrula.append(f"Türkiye ilanları çok dağınık ({tl(tr.en_dusuk)}–{tl(tr.en_yuksek)}): aynı ürün mü bakın")
    if kategori.tahmini:
        stres_igv = kategori.igv + e.tahmini_igv_stres
        stres = birim_maliyet(_girdi(aday), kategori, kur, ayarlar, igv=stres_igv)
        s.stres_kat = kat(tr.medyan, stres, kategori)
        if s.stres_kat >= e.hedef_kat:
            s.notlar.append(f"Vergi oranı tahmini; İGV {yuzde(stres_igv)} olsa da kat {kat_metni(s.stres_kat)}")
        else:
            s.dogrula.append(
                f"Vergi oranı tahmini; İGV {yuzde(stres_igv)} olursa kat {kat_metni(s.stres_kat)}: GTİP'i doğrulayın"
            )
    if aday.agirlik_kaynagi != "ilan":
        neden = "kategori ortalaması" if aday.agirlik_kaynagi == "kategori" else "tahmin"
        if dokum.kargo_payi > 0.15:
            s.dogrula.append(
                f"Ağırlık {neden}, kargo payı {yuzde(dokum.kargo_payi)}: tedarikçiden brüt ağırlığı alın"
            )
        else:
            s.notlar.append(f"Ağırlık {neden} (kargo payı düşük, etkisi sınırlı)")
    siparis_usd = aday.moq * aday.fiyat_usd
    if siparis_usd > e.urun_basina_butce_usd:
        s.dogrula.append(
            f"MOQ {sayi(aday.moq)} adet × {usd(aday.fiyat_usd)} = {usd(siparis_usd)};"
            f" ürün bütçesi {usd(e.urun_basina_butce_usd)}"
        )
    if aday.mense != "CN":
        s.dogrula.append(f"Menşe {aday.mense}: oranlar Çin varsayımıyla hesaplandı, müşavire sorun")
    if aday.indirim:
        liste = birim_maliyet(_girdi(aday, aday.indirim.liste_fiyat_usd), kategori, kur, ayarlar)
        s.indirimsiz_kat = kat(tr.medyan, liste, kategori)
        bitis = f", bitiş {aday.indirim.bitis}" if aday.indirim.bitis else ", bitişi bilinmiyor"
        s.notlar.append(
            f"Alibaba indirimi {yuzde(s.indirim_orani)}{bitis}: indirim bitince kat {kat_metni(s.indirimsiz_kat)}"
        )
    if tr.indirimde_adet:
        s.tr_normal_kat = kat(tr.liste_medyan, dokum, kategori)
        s.notlar.append(
            f"Türkiye ilanlarının {tr.indirimde_adet}/{tr.adet} tanesi indirimde, karar indirimli raf fiyatıyla."
            f" Normal fiyat medyanı {tl(tr.liste_medyan)} ile kat {kat_metni(s.tr_normal_kat)}"
        )
    if dokum.hacimsel:
        s.notlar.append(f"Kargo hacimsel ağırlıktan hesaplandı ({sayi(dokum.ucretli_kg, 2)} kg)")
    if kategori.notlar:
        s.notlar.append(kategori.notlar.rstrip("."))

    # Avantajlar
    if dokum.kargo_payi <= 0.10:
        s.avantajlar.append(f"hafif: kargo payı {yuzde(dokum.kargo_payi)}")
    if dokum.vergi_yuku <= 0.20:
        s.avantajlar.append(f"düşük vergi: {yuzde(dokum.vergi_yuku)}")
    if s.en_iyi_kademe and s.en_iyi_kademe.kat > k:
        s.avantajlar.append(f"≥{sayi(s.en_iyi_kademe.min_adet)} adette kat {kat_metni(s.en_iyi_kademe.kat)}")

    # Karar
    if aday.taklit_riski:
        s.durum = "ELENDI"
        s.dogrula.append("Marka/taklit riski: gümrükte el konur, satışı suçtur")
    elif k >= e.hedef_kat:
        if s.satis.birim_kar_tl <= 0:
            s.dogrula.append(
                f"Tek adet satışta pazaryeri giderleri kârı siliyor ({tl(s.satis.birim_kar_tl)}/adet):"
                " set/çoklu paket ya da daha yüksek fiyat gerekir"
            )
        s.durum = "UYGUN-DOGRULA" if s.dogrula else "UYGUN"
        if s.indirimsiz_kat is not None and s.indirimsiz_kat < e.hedef_kat:
            s.sureli_firsat = True
            s.notlar.append("Eşiği yalnız Alibaba indirimiyle geçiyor: indirim bitmeden sipariş verilmeli")
    elif k >= e.yakin_kat:
        s.durum = "YAKIN"
    else:
        s.durum = "ELENDI"
    return s


def toplu_degerlendir(
    ham_adaylar: list[Any], tarife: Tarife, kur: float, ayarlar: Ayarlar
) -> tuple[list[Sonuc], list[Okunamayan]]:
    sonuclar: list[Sonuc] = []
    okunamayan: list[Okunamayan] = []
    gorulen: set[str] = set()
    for sira, ham in enumerate(ham_adaylar, start=1):
        urun = str(ham.get("urun", "")) if isinstance(ham, dict) else ""
        try:
            aday = aday_oku(ham, tarife)
        except AdayHatasi as hata:
            okunamayan.append(Okunamayan(sira=sira, urun=urun or f"#{sira}", neden=str(hata)))
            continue
        if aday.url in gorulen:
            okunamayan.append(Okunamayan(sira=sira, urun=aday.urun, neden="Aynı Alibaba ilanı bu dosyada ikinci kez"))
            continue
        gorulen.add(aday.url)
        sonuclar.append(degerlendir_aday(aday, tarife, kur, ayarlar))
    sonuclar.sort(key=lambda s: s.sira_anahtari)
    return sonuclar, okunamayan
