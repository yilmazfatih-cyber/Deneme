"""Bir tarama turu: ayarı doğrula → her rakip sayfasını getir → ayrıştır → kaydet → değişiklikleri bul."""

import json
import math
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .ayristir import sayfadan_cikar, tr_kucuk
from .depo import Depo, Olcum
from .fiyat import kurus, tl_mi, tl_yaz, yuzde_yaz
from .getir import (
    FIRECRAWL_AJANLARI,
    DogrudanGetirici,
    FirecrawlGetirici,
    GetirmeHatasi,
    Getirici,
    GuvenlikEngeli,
    HizSinirlayici,
    RobotsDenetcisi,
    adres_denetle,
    url_denetle,
)

BULUT_FIRECRAWL = "https://api.firecrawl.dev"
VARSAYILAN_AJAN = "FiyatRadar/0.1"
VARSAYILAN_SAAT_DILIMI = "Europe/Istanbul"
ONEMLI_TURLER = {"fiyat", "stok", "kampanya", "ucuz-rakip"}
# (alan, varsayılan, en küçük değer, en küçük değer dahil mi)
SAYISAL_AYARLAR = [
    ("esik_yuzde", 1, 0, True),
    ("istekler_arasi_sn", 5, 0, True),
    ("tur_butcesi_sn", 600, 0, False),  # n8n'in HTTP zaman aşımından (15 dk) kısa olmalı
    ("saklama_gun", 400, 1, True),
]


class AyarHatasi(ValueError):
    pass


@dataclass
class Degisim:
    tur: str  # fiyat | stok | kampanya | ucuz-rakip | ucuz-rakip-suruyor | ilk | hata
    urun: str
    magaza: str
    mesaj: str


@dataclass
class Calisma:
    zaman: str
    olcumler: list[Olcum] = field(default_factory=list)
    degisimler: list[Degisim] = field(default_factory=list)
    notlar: list[str] = field(default_factory=list)
    atlananlar: list[str] = field(default_factory=list)  # süre bütçesi dolduğu için sonraki tura kalan sayfalar

    @property
    def onemli(self) -> list[Degisim]:
        return [d for d in self.degisimler if d.tur in ONEMLI_TURLER]

    @property
    def hatalar(self) -> list[Degisim]:
        return [d for d in self.degisimler if d.tur == "hata"]

    @property
    def surenler(self) -> list[Degisim]:
        """Daha önce bildirilmiş, hâlâ süren "rakip sizden ucuz" durumları (raporda görünür, bildirim yapılmaz)."""
        return [d for d in self.degisimler if d.tur == "ucuz-rakip-suruyor"]


def _dolu_metin(deger) -> bool:
    return isinstance(deger, str) and bool(deger.strip())


def saat_dilimi_al(ayar: dict):
    ad = ayar.get("saat_dilimi", VARSAYILAN_SAAT_DILIMI)
    try:
        return ZoneInfo(ad)
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        if ad == VARSAYILAN_SAAT_DILIMI:  # tzdata yoksa: Türkiye 2016'dan beri yıl boyu UTC+3
            return timezone(timedelta(hours=3), "+03")
        raise AyarHatasi(f'"saat_dilimi" geçersiz: {ad!r} (ör. "Europe/Istanbul")') from None


def an_hesapla(ayar: dict, simdi: datetime | None = None) -> datetime:
    """Turun zamanı ayardaki saat diliminde. Saat dilimsiz `simdi` o dilimin yerel saati sayılır."""
    dilim = saat_dilimi_al(ayar)
    if simdi is None:
        return datetime.now(dilim)
    return simdi.replace(tzinfo=dilim) if simdi.tzinfo is None else simdi.astimezone(dilim)


def ayar_dogrula(ayar) -> dict:
    """Eksik ya da çelişkili ayarı, tur başlamadan Türkçe bir hata iletisiyle reddeder."""
    if not isinstance(ayar, dict):
        raise AyarHatasi("Ayar bir JSON nesnesi olmalı")
    urunler = ayar.get("urunler")
    if not isinstance(urunler, list) or not urunler:
        raise AyarHatasi('"urunler" en az bir ürün içeren bir liste olmalı')
    goruldu = set()
    for i, urun in enumerate(urunler, 1):
        if not isinstance(urun, dict) or not _dolu_metin(urun.get("ad")):
            raise AyarHatasi(f"{i}. ürünün adı yok")
        ad = urun["ad"]
        if urun.get("kendi_fiyatim") not in (None, "") and kurus(urun["kendi_fiyatim"]) is None:
            raise AyarHatasi(f'"{ad}": kendi_fiyatim okunamadı ({urun["kendi_fiyatim"]!r})')
        rakipler = urun.get("rakipler")
        if not isinstance(rakipler, list) or not rakipler:
            raise AyarHatasi(f'"{ad}": en az bir rakip gerekli')
        for j, rakip in enumerate(rakipler, 1):
            if not isinstance(rakip, dict) or not _dolu_metin(rakip.get("magaza")) or not _dolu_metin(rakip.get("url")):
                raise AyarHatasi(f'"{ad}" ürününün {j}. rakibinde mağaza adı ya da URL eksik')
            try:
                url_denetle(rakip["url"])
            except GuvenlikEngeli as hata:
                raise AyarHatasi(f'"{ad}" / "{rakip["magaza"]}": {hata}') from None
            anahtar = (tr_kucuk(ad.strip()), tr_kucuk(rakip["magaza"].strip()))
            if anahtar in goruldu:
                raise AyarHatasi(f'"{ad}" ürününde "{rakip["magaza"]}" iki kez geçiyor; ölçüm geçmişi karışır')
            goruldu.add(anahtar)
    for alan, varsayilan, en_az, dahil in SAYISAL_AYARLAR:
        deger = ayar.get(alan, varsayilan)
        gecerli = isinstance(deger, (int, float)) and not isinstance(deger, bool) and math.isfinite(deger)
        if not gecerli or deger < en_az or (deger == en_az and not dahil):
            kosul = f"en az {en_az}" if dahil else f"{en_az}'dan büyük"
            raise AyarHatasi(f'"{alan}" bir sayı olmalı ({kosul})')
    if "firecrawl" in ayar and not isinstance(ayar["firecrawl"], dict):
        raise AyarHatasi('"firecrawl" bir nesne olmalı: {"api_url": ..., "urun_bicimi": false}')
    saat_dilimi_al(ayar)
    return ayar


def ayar_oku(yol: Path) -> dict:
    try:
        ayar = json.loads(Path(yol).read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise AyarHatasi(f"Ayar dosyası bulunamadı: {yol}") from None
    except (ValueError, UnicodeDecodeError) as hata:
        raise AyarHatasi(f"Ayar dosyası okunamadı (JSON/UTF-8): {hata}") from None
    return ayar_dogrula(ayar)


def getirici_kur(ayar: dict, ortam=os.environ) -> Getirici:
    ajan = ayar.get("kullanici_ajani", VARSAYILAN_AJAN)
    ozel = bool(ayar.get("ozel_aglara_izin", False))  # yalnızca kendi iç ağınızdaki test sunucuları için
    firecrawl = None
    if isinstance(fc := ayar.get("firecrawl"), dict):  # {} de geçerlidir: bulut varsayılanları
        anahtar = ortam.get(fc.get("api_anahtari_ortam", "FIRECRAWL_API_KEY"))
        api_url = fc.get("api_url", BULUT_FIRECRAWL)
        if anahtar or api_url.rstrip("/") != BULUT_FIRECRAWL:  # kendi sunucunuzda anahtar gerekmez
            firecrawl = FirecrawlGetirici(api_url, anahtar, bool(fc.get("urun_bicimi", False)), konum=fc.get("konum"))
    robots = RobotsDenetcisi(ajan, ek_ajanlar=FIRECRAWL_AJANLARI if firecrawl else (), ozel_aglara_izin=ozel)
    dogrudan = DogrudanGetirici(ajan, robots=robots, ozel_aglara_izin=ozel)
    hiz = HizSinirlayici(float(ayar.get("istekler_arasi_sn", 5)))
    birincil, yedek = (firecrawl, dogrudan) if firecrawl else (dogrudan, None)
    return Getirici(robots, hiz, birincil, yedek, adres_denetci=None if ozel else adres_denetle)


def karsilastir(onceki: Olcum | None, simdi: Olcum, esik_yuzde: float) -> list[Degisim]:
    d = lambda tur, mesaj: Degisim(tur, simdi.urun, simdi.magaza, mesaj)  # noqa: E731
    if simdi.hata:
        return [d("hata", f"Okunamadı: {simdi.hata}")]
    if onceki is None:
        return [d("ilk", f"İlk ölçüm: {tl_yaz(simdi.fiyat)}")]
    sonuc = []
    if onceki.fiyat and simdi.fiyat and onceki.fiyat != simdi.fiyat:
        oran = (simdi.fiyat - onceki.fiyat) * 100 / onceki.fiyat
        if abs(oran) >= esik_yuzde:
            yon = "düştü" if oran < 0 else "arttı"
            sonuc.append(d("fiyat", f"Fiyat {yon}: {tl_yaz(onceki.fiyat)} → {tl_yaz(simdi.fiyat)} ({yuzde_yaz(abs(oran))})"))
    if None not in (onceki.stokta, simdi.stokta) and onceki.stokta != simdi.stokta:
        sonuc.append(d("stok", "Stoğa girdi" if simdi.stokta else "Stokta yok"))
    # Yalnızca büyük/küçük harfi değişen kampanya ("SEPETTE" → "Sepette") değişiklik sayılmaz
    onceki_k, simdi_k = {tr_kucuk(k) for k in onceki.kampanyalar}, {tr_kucuk(k) for k in simdi.kampanyalar}
    if yeni := [k for k in simdi.kampanyalar if tr_kucuk(k) not in onceki_k]:
        sonuc.append(d("kampanya", "Yeni kampanya: " + "; ".join(yeni)))
    if biten := [k for k in onceki.kampanyalar if tr_kucuk(k) not in simdi_k]:
        sonuc.append(d("kampanya", "Kampanya bitti: " + "; ".join(biten)))
    return sonuc


def kendi_fiyat_durumu(urun: dict, olcumler: list[Olcum], depo: Depo) -> list[Degisim]:
    """Rakip sizden ucuz mu? Yalnızca durum değişince bildirilir (yeni en ucuz, fiyatı ya da sizin fiyatınız değişti,
    artık ucuz değil). Her rakip için bu turun başarılı ölçümü, yoksa son başarılı ölçümü kullanılır."""
    kendi = kurus(urun.get("kendi_fiyatim"))
    if not kendi:
        return []
    fiyatli = [o for o in olcumler if o.fiyat]
    en_ucuz = min(fiyatli, key=lambda o: o.fiyat) if fiyatli else None
    ucuz = en_ucuz is not None and en_ucuz.fiyat < kendi
    imza = f"{en_ucuz.magaza}|{en_ucuz.fiyat}|{kendi}" if ucuz else ""
    onceki = depo.ucuz_imzasi(urun["ad"])
    depo.ucuz_imzasi_yaz(urun["ad"], imza)
    if ucuz:
        oran = (kendi - en_ucuz.fiyat) * 100 / kendi
        mesaj = (
            f"En ucuz rakip {en_ucuz.magaza} ({tl_yaz(en_ucuz.fiyat)}), "
            f"sizin fiyatınızın ({tl_yaz(kendi)}) {yuzde_yaz(oran)} altında"
        )
        return [Degisim("ucuz-rakip" if imza != onceki else "ucuz-rakip-suruyor", urun["ad"], en_ucuz.magaza, mesaj)]
    if onceki:  # önceki turda bir rakip ucuzdu, artık değil
        mesaj = f"Artık hiçbir rakip sizden ucuz değil (sizin fiyatınız {tl_yaz(kendi)})"
        return [Degisim("ucuz-rakip", urun["ad"], en_ucuz.magaza if en_ucuz else "—", mesaj)]
    return []


def _olc(urun: dict, rakip: dict, getirici: Getirici, calisma: Calisma) -> Olcum:
    olcum = Olcum(calisma.zaman, urun["ad"], rakip["magaza"], rakip["url"])
    try:
        sayfa, uyarilar = getirici.getir(rakip["url"])
        calisma.notlar += [f"{urun['ad']} / {rakip['magaza']}: {u}" for u in uyarilar]
        durum = sayfadan_cikar(sayfa.html, sayfa.markdown, sayfa.urun_profili)
        olcum.fiyat, olcum.eski_fiyat, olcum.stokta = durum.fiyat, durum.eski_fiyat, durum.stokta
        olcum.kampanyalar, olcum.kaynak = durum.kampanyalar, f"{sayfa.kaynak}/{durum.kaynak}"
        if durum.fiyat is None:
            olcum.hata = "Sayfada fiyat bulunamadı (yapı değişmiş olabilir)"
        elif not tl_mi(durum.para_birimi):
            olcum.hata = f"Fiyat Türk lirası değil ({durum.para_birimi}); karşılaştırılmadı"
    except GetirmeHatasi as hata:
        olcum.hata = str(hata)[:500]
    except Exception as hata:  # tek sayfanın beklenmeyen hatası turun geri kalanını durdurmasın
        olcum.hata = f"Beklenmeyen hata ({type(hata).__name__}): {str(hata)[:200]}"
    return olcum


def calistir(ayar: dict, depo: Depo, getirici: Getirici, simdi: datetime | None = None, saat=time.monotonic) -> Calisma:
    ayar_dogrula(ayar)
    an = an_hesapla(ayar, simdi)
    calisma = Calisma(an.isoformat(timespec="seconds"))
    esik, butce = float(ayar.get("esik_yuzde", 1)), float(ayar.get("tur_butcesi_sn", 600))
    # Sıra: hiç ölçülmemiş sayfalar, sonra en uzun süredir ölçülmeyenler. Süre bütçesi dolarsa kalanlar sonraki tura
    # kalır ve o turda en başa geçer; böylece büyük listelerde her sayfa sırayla taranır.
    son = depo.son_denemeler()
    ciftler = [(ui, ri, urun, rakip) for ui, urun in enumerate(ayar["urunler"]) for ri, rakip in enumerate(urun["rakipler"])]
    ciftler.sort(key=lambda c: (son.get((c[2]["ad"], c[3]["magaza"]), -1.0), c[0], c[1]))
    baslangic, sonuclar = saat(), {}
    for ui, ri, urun, rakip in ciftler:
        if saat() - baslangic >= butce:
            calisma.atlananlar.append(f"{urun['ad']} / {rakip['magaza']}")
            continue
        onceki = depo.son_basarili(urun["ad"], rakip["magaza"])
        olcum = _olc(urun, rakip, getirici, calisma)
        depo.ekle(olcum)
        sonuclar[(ui, ri)] = (olcum, onceki)
    for ui, urun in enumerate(ayar["urunler"]):  # rapor ayardaki sırayla
        etkin = []
        for ri, rakip in enumerate(urun["rakipler"]):
            if (ui, ri) not in sonuclar:
                etkin.append(depo.son_basarili(urun["ad"], rakip["magaza"]))
                continue
            olcum, onceki = sonuclar[(ui, ri)]
            calisma.olcumler.append(olcum)
            calisma.degisimler += karsilastir(onceki, olcum, esik)
            etkin.append(onceki if olcum.hata else olcum)
        calisma.degisimler += kendi_fiyat_durumu(urun, [o for o in etkin if o is not None], depo)
    if calisma.atlananlar:
        calisma.notlar.append(f"Süre bütçesi ({butce:g} sn) doldu: {len(calisma.atlananlar)} sayfa sonraki tura kaldı")
    depo.eskileri_sil(an - timedelta(days=float(ayar.get("saklama_gun", 400))))
    return calisma
