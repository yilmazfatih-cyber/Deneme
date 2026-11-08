"""Perakende raf toplayıcısı. `content/perakende-kaynaklar.json` ile sürülür: segment → marka → kategori listeleme
URL'si + CSS seçicileri (ürün kartı, başlık, fiyat, link, görsel).

Saf ayrıştırıcı `urunleri_ayikla(html, secici)` ağdan bağımsızdır (beautifulsoup4 + soupsieve). Ağ işi
`kaynak_tara`'dadır; `"js": true` kaynaklar Playwright (Chromium) ile, ötekiler urllib ile getirilir.
Sayfa HTML'i saklanmaz; yalnız ürün URL'si, başlık, fiyat, indirim ve görülme tarihi (ADR-002).
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

from moda_radar.sema import Kaynak, KaynakTuru

log = logging.getLogger(__name__)

KAYNAK_DOSYASI = Path(__file__).resolve().parents[2] / "content" / "perakende-kaynaklar.json"
ZORUNLU_SECICILER = ("kart", "baslik", "fiyat", "link")


@dataclass
class PerakendeHedefi:
    segment: str
    marka: str
    kategori: str
    url: str
    secici: dict
    js: bool = False
    dogrulandi: bool = False
    para: str = "TRY"
    ulke: str = "TR"
    notlar: list[str] = field(default_factory=list)


def kaynaklari_oku(yol: Path = KAYNAK_DOSYASI) -> dict:
    veri = json.loads(Path(yol).read_text("utf-8"))
    hatalar = kaynaklari_dogrula(veri)
    if hatalar:
        raise ValueError("perakende-kaynaklar.json: " + "; ".join(hatalar))
    return veri


def kaynaklari_dogrula(veri: dict) -> list[str]:
    hatalar = []
    for seg, markalar in veri.get("segmentler", {}).items():
        for marka, k in markalar.items():
            yer = f"{seg}/{marka}"
            eksik = [s for s in ZORUNLU_SECICILER if not k.get("secici", {}).get(s)]
            if eksik:
                hatalar.append(f"{yer}: eksik seçiciler {eksik}")
            if "dogrulandi" not in k:
                hatalar.append(f"{yer}: 'dogrulandi' alanı zorunlu")
            if not k.get("kategoriler"):
                hatalar.append(f"{yer}: en az bir kategori gerekli")
            for kat, url in k.get("kategoriler", {}).items():
                if not str(url).startswith("https://"):
                    hatalar.append(f"{yer}/{kat}: URL https:// ile başlamalı")
    return hatalar


def hedefler(veri: dict, segment: str | None = None, kategori: str | None = None) -> list[PerakendeHedefi]:
    sonuc = []
    for seg, markalar in veri.get("segmentler", {}).items():
        if segment and seg != segment:
            continue
        for marka, k in markalar.items():
            for kat, url in k["kategoriler"].items():
                if kategori and kat != kategori:
                    continue
                sonuc.append(
                    PerakendeHedefi(
                        segment=seg,
                        marka=marka,
                        kategori=kat,
                        url=url,
                        secici=k["secici"],
                        js=bool(k.get("js", False)),
                        dogrulandi=bool(k.get("dogrulandi", False)),
                        para=k.get("para", "TRY"),
                        ulke=veri.get("ulke", "TR"),
                    )
                )
    return sonuc


# --- saf ayrıştırıcı ---


def fiyat_coz(metin: str | None) -> float | None:
    """'1.299,95 TL' → 1299.95 · '₺899' → 899.0 · '1,299.95' → 1299.95 · boş → None."""
    if not metin:
        return None
    m = re.search(r"\d[\d.,\s ]*", metin)
    if not m:
        return None
    s = re.sub(r"[\s ]", "", m[0]).rstrip(".,")
    if "," in s and "." in s:
        ondalik = "," if s.rfind(",") > s.rfind(".") else "."
        binlik = "." if ondalik == "," else ","
        s = s.replace(binlik, "").replace(ondalik, ".")
    elif "," in s:
        s = s.replace(",", ".") if len(s.rsplit(",", 1)[1]) in (1, 2) else s.replace(",", "")
    elif "." in s and len(s.rsplit(".", 1)[1]) == 3:
        s = s.replace(".", "")  # 1.299 → binlik ayırıcı
    try:
        return float(s)
    except ValueError:
        return None


def _temiz_url(url: str) -> str:
    """İzleme parametrelerini atmadan, yalnız parça (#...) kısmını siler; ürün kimliği sorguda olabilir."""
    p = urlsplit(url)
    return urlunsplit((p.scheme, p.netloc, p.path, p.query, ""))


def _metin(el) -> str:
    return " ".join(el.get_text(" ", strip=True).split()) if el is not None else ""


def urunleri_ayikla(html: str, secici: dict, taban_url: str = "") -> list[dict]:
    """Listeleme sayfasından ürün kartlarını çıkarır.

    Dönen her sözlük: baslik, fiyat, eski_fiyat, indirim_yuzde, url (mutlak), gorsel_url. Linki olmayan kart atlanır;
    aynı URL bir kez döner.
    """
    from bs4 import BeautifulSoup

    corba = BeautifulSoup(html, "html.parser")
    gorsel_nitelikleri = secici.get("gorsel_nitelik", ["data-src", "data-original", "src"])
    sonuc, gorulen = [], set()
    for kart in corba.select(secici["kart"]):
        link = kart if kart.name == "a" and secici["link"] == ":scope" else kart.select_one(secici["link"])
        href = link.get("href") if link is not None else None
        if not href:
            continue
        url = _temiz_url(urljoin(taban_url, href))
        if url in gorulen:
            continue
        gorulen.add(url)
        fiyat = fiyat_coz(_metin(kart.select_one(secici["fiyat"])))
        eski = fiyat_coz(_metin(kart.select_one(secici["eski_fiyat"]))) if secici.get("eski_fiyat") else None
        indirim = round(100 * (1 - fiyat / eski), 1) if fiyat and eski and eski > fiyat else None
        gorsel_url = None
        if secici.get("gorsel"):
            img = kart.select_one(secici["gorsel"])
            if img is not None:
                for ad in gorsel_nitelikleri:
                    deger = img.get(ad)
                    if deger and not str(deger).startswith("data:"):
                        gorsel_url = urljoin(taban_url, str(deger).split(",")[0].split()[0])
                        break
        sonuc.append(
            {
                "baslik": _metin(kart.select_one(secici["baslik"])) or None,
                "fiyat": fiyat,
                "eski_fiyat": eski,
                "indirim_yuzde": indirim,
                "url": url,
                "gorsel_url": gorsel_url,
            }
        )
    return sonuc


# --- ağ ---


def sayfa_getir(hedef: PerakendeHedefi, tarayici) -> str:
    """HTML'i bellekte getirir. JS gerektiren kaynakta Playwright kullanılır (robots/hız denetimi yine Tarayici'da)."""
    if not hedef.js:
        return tarayici.metin(hedef.url)
    from moda_radar.veri.ag import KULLANICI_ARACISI, TaramaYasak

    if not tarayici.izinli_mi(hedef.url):
        raise TaramaYasak(f"robots.txt izin vermiyor: {hedef.url}")
    tarayici._bekle()
    from playwright.sync_api import TimeoutError as PlaywrightZamanAsimi
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        tarayici_pw = pw.chromium.launch()
        try:
            sayfa = tarayici_pw.new_page(user_agent=KULLANICI_ARACISI, locale="tr-TR")
            sayfa.goto(hedef.url, wait_until="networkidle", timeout=60_000)
            try:
                sayfa.wait_for_selector(hedef.secici["kart"], timeout=15_000)
            except PlaywrightZamanAsimi:
                log.warning("%s/%s: kart seçicisi bekleme süresinde görünmedi", hedef.marka, hedef.kategori)
            html = sayfa.content()
        finally:
            tarayici_pw.close()
    tarayici.istek_sayisi += 1
    return html


def kaynak_tara(depo, hedef: PerakendeHedefi, tarayici, *, bugun: date | None = None, renk: bool = True) -> dict:
    """Bir listeleme sayfasını tarar, ürünleri upsert eder, görülmeyenleri pasifleştirir; renk modülü varsa ürün
    görselini bellekte işleyip `perakende_renk`'e yazar (yalnız ilk görülmede)."""
    from moda_radar.veri import renk_koprusu

    bugun = bugun or date.today()
    html = sayfa_getir(hedef, tarayici)
    urunler = urunleri_ayikla(html, hedef.secici, hedef.url)
    del html  # ADR-002: sayfa saklanmaz
    sonuc = {"hedef": f"{hedef.segment}/{hedef.marka}/{hedef.kategori}", "bulunan": len(urunler), "renkli": 0}
    if not urunler:
        sonuc["uyari"] = "ürün bulunamadı — seçiciler doğrulanmalı" + (
            "" if hedef.dogrulandi else " (dogrulandi: false)"
        )
        return sonuc
    renk_var = renk and renk_koprusu.renk_modulu_var()
    idler = []
    for u in urunler:
        onceden = depo.baglanti.execute("SELECT 1 FROM perakende_urun WHERE url=?", (u["url"],)).fetchone()
        uid = depo.upsert_perakende_urun(
            segment=hedef.segment,
            marka=hedef.marka,
            kategori=hedef.kategori,
            url=u["url"],
            tarih=bugun,
            baslik=u["baslik"],
            fiyat=u["fiyat"],
            para=hedef.para,
            indirim_yuzde=u["indirim_yuzde"],
            gorsel_url=u["gorsel_url"],
            ulke=hedef.ulke,
        )
        idler.append(uid)
        if renk_var and not onceden and u["gorsel_url"]:
            try:
                bayt = tarayici.getir(u["gorsel_url"], kabul="image/*")
            except (OSError, RuntimeError) as e:
                log.warning("ürün görseli alınamadı %s: %s", u["gorsel_url"], e)
                continue
            sezon = sezon_tahmini(bugun)
            kaynak = Kaynak(
                tur=KaynakTuru.PERAKENDE,
                url=u["url"],
                tarama_tarihi=bugun,
                sezon=sezon,
                segment=hedef.segment,
                marka=hedef.marka,
            )
            kayitlar = renk_koprusu.renk_kayitlari(bayt, kaynak, parca_id=f"{uid}-tam")
            del bayt
            if kayitlar:
                depo.ekle_perakende_renk(uid, kayitlar)
                sonuc["renkli"] += 1
    sonuc["pasif"] = depo.pasiflestir(hedef.segment, hedef.marka, hedef.kategori, idler)
    return sonuc


def sezon_tahmini(t: date) -> str:
    """Raf tarihinin satış sezonu: Şubat–Temmuz → SS<yy>, Ağustos–Ocak → FW<yy> (Ocak bir önceki yılın FW'si)."""
    if 2 <= t.month <= 7:
        return f"SS{t.year % 100:02d}"
    yil = t.year if t.month >= 8 else t.year - 1
    return f"FW{yil % 100:02d}"
